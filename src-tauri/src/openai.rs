use serde_json::{json, Value};
use std::collections::BTreeMap;

pub fn normalize_base(input: &str) -> Result<String, String> {
    let mut url = input.trim().trim_end_matches('/').to_string();
    for suffix in ["/chat/completions", "/images/generations", "/models"] {
        if let Some(stripped) = url.strip_suffix(suffix) {
            url = stripped.trim_end_matches('/').to_string();
        }
    }
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("服务地址需要以 http:// 或 https:// 开头".into());
    }
    Ok(url)
}

pub fn api_error(status: reqwest::StatusCode, body: &str) -> String {
    if let Ok(value) = serde_json::from_str::<Value>(body) {
        if let Some(message) = value["error"]["message"].as_str() {
            return format!("服务返回 {}：{message}", status.as_u16());
        }
    }
    let snippet: String = body.chars().take(280).collect();
    if snippet.trim().is_empty() {
        format!("服务返回 {}", status.as_u16())
    } else {
        format!("服务返回 {}：{snippet}", status.as_u16())
    }
}

/// Accepts the OpenAI shape `{ data: [{ id }] }` and the bare-array shape some proxies return.
pub fn parse_models(body: &str) -> Result<Vec<String>, String> {
    let value: Value = serde_json::from_str(body).map_err(|_| "模型列表不是有效的 JSON".to_string())?;
    let entries = value["data"].as_array().or_else(|| value.as_array()).ok_or("模型列表格式无法识别")?;
    let mut models: Vec<String> = entries
        .iter()
        .filter_map(|entry| entry["id"].as_str().or_else(|| entry.as_str()))
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect();
    models.sort_unstable();
    models.dedup();
    Ok(models)
}

#[derive(Debug, Default, Clone)]
pub struct ToolCallAcc {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Default)]
pub struct StreamAcc {
    pub content: String,
    pub tools: BTreeMap<u32, ToolCallAcc>,
    pub finish: Option<String>,
}

pub fn apply_data(acc: &mut StreamAcc, data: &str) -> Option<String> {
    let data = data.trim();
    if data.is_empty() || data == "[DONE]" {
        return None;
    }
    let value: Value = serde_json::from_str(data).ok()?;
    if value.get("choices").is_some() {
        return apply_choice(acc, &value);
    }
    if value["type"].as_str().is_some_and(|kind| kind.starts_with("response.")) {
        return apply_responses_event(acc, &value);
    }
    if value.get("output").is_some() {
        return apply_responses_output(acc, &value);
    }
    None
}

/// Chat Completions messages and tools, rewritten for `POST /v1/responses`.
pub fn responses_body(model: &str, messages: &[Value], tools: &[Value]) -> Value {
    let mut instructions = String::new();
    let mut input = Vec::new();
    for message in messages {
        let role = message["role"].as_str().unwrap_or("");
        if role == "system" {
            if !instructions.is_empty() {
                instructions.push_str("\n\n");
            }
            instructions.push_str(&content_as_text(&message["content"]));
            continue;
        }
        if role == "tool" {
            input.push(json!({
                "type": "function_call_output",
                "call_id": message["tool_call_id"].as_str().unwrap_or(""),
                "output": content_as_text(&message["content"])
            }));
            continue;
        }
        if let Some(calls) = message["tool_calls"].as_array() {
            let text = content_as_text(&message["content"]);
            if !text.is_empty() {
                input.push(json!({ "type": "message", "role": "assistant", "content": text }));
            }
            for call in calls {
                input.push(json!({
                    "type": "function_call",
                    "call_id": call["id"].as_str().unwrap_or(""),
                    "name": call["function"]["name"].as_str().unwrap_or(""),
                    "arguments": call["function"]["arguments"].as_str().unwrap_or("{}")
                }));
            }
            continue;
        }
        input.push(json!({
            "type": "message",
            "role": if role == "assistant" { "assistant" } else { "user" },
            "content": content_parts(&message["content"])
        }));
    }
    let mut body = json!({
        "model": model,
        "input": input,
        "stream": true
    });
    if !instructions.is_empty() {
        body["instructions"] = json!(instructions);
    }
    if !tools.is_empty() {
        let flat: Vec<Value> = tools.iter().map(flatten_tool).collect();
        body["tools"] = json!(flat);
    }
    body
}

fn flatten_tool(tool: &Value) -> Value {
    if tool.get("function").is_some_and(Value::is_object) {
        return json!({
            "type": "function",
            "name": tool["function"]["name"],
            "description": tool["function"]["description"],
            "parameters": tool["function"]["parameters"]
        });
    }
    tool.clone()
}

fn content_as_text(content: &Value) -> String {
    if let Some(text) = content.as_str() {
        return text.to_string();
    }
    content
        .as_array()
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part["text"].as_str())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
}

fn content_parts(content: &Value) -> Value {
    let Some(parts) = content.as_array() else {
        return json!(content.as_str().unwrap_or(""));
    };
    let converted: Vec<Value> = parts
        .iter()
        .filter_map(|part| match part["type"].as_str() {
            Some("text") => Some(json!({ "type": "input_text", "text": part["text"] })),
            Some("image_url") => {
                let url = part["image_url"]["url"]
                    .as_str()
                    .or_else(|| part["image_url"].as_str())
                    .unwrap_or("");
                Some(json!({ "type": "input_image", "image_url": url }))
            }
            _ => None,
        })
        .collect();
    json!(converted)
}

fn apply_responses_event(acc: &mut StreamAcc, value: &Value) -> Option<String> {
    match value["type"].as_str() {
        Some("response.output_text.delta") => {
            let text = value["delta"].as_str().unwrap_or("");
            if text.is_empty() {
                return None;
            }
            acc.content.push_str(text);
            Some(text.to_string())
        }
        Some("response.output_item.added") | Some("response.output_item.done") => {
            remember_function_call(acc, value["output_index"].as_u64().unwrap_or(0) as u32, &value["item"]);
            None
        }
        Some("response.function_call_arguments.delta") => {
            let index = value["output_index"].as_u64().unwrap_or(0) as u32;
            if let Some(delta) = value["delta"].as_str() {
                acc.tools.entry(index).or_default().arguments.push_str(delta);
            }
            None
        }
        Some("response.completed") => apply_responses_output(acc, &value["response"]),
        _ => None,
    }
}

fn remember_function_call(acc: &mut StreamAcc, index: u32, item: &Value) {
    if item["type"].as_str() != Some("function_call") {
        return;
    }
    let entry = acc.tools.entry(index).or_default();
    if let Some(id) = item["call_id"].as_str().filter(|id| !id.is_empty()) {
        entry.id = id.to_string();
    }
    if let Some(name) = item["name"].as_str().filter(|name| !name.is_empty()) {
        entry.name = name.to_string();
    }
    if let Some(arguments) = item["arguments"].as_str().filter(|arguments| !arguments.is_empty()) {
        entry.arguments = arguments.to_string();
    }
}

fn apply_responses_output(acc: &mut StreamAcc, value: &Value) -> Option<String> {
    let mut emitted = String::new();
    let Some(output) = value["output"].as_array() else {
        return None;
    };
    for (index, item) in output.iter().enumerate() {
        match item["type"].as_str() {
            Some("function_call") => remember_function_call(acc, index as u32, item),
            Some("message") => {
                if let Some(parts) = item["content"].as_array() {
                    for part in parts {
                        if let Some(text) = part["text"].as_str() {
                            emitted.push_str(text);
                        }
                    }
                }
            }
            _ => {}
        }
    }
    if emitted.is_empty() || acc.content.contains(&emitted) {
        return None;
    }
    acc.content.push_str(&emitted);
    Some(emitted)
}

fn apply_choice(acc: &mut StreamAcc, value: &Value) -> Option<String> {
    let choice = value["choices"].get(0)?;
    if let Some(reason) = choice["finish_reason"].as_str() {
        if reason != "null" {
            acc.finish = Some(reason.to_string());
        }
    }
    if choice.get("message").is_some() {
        return apply_message(acc, &choice["message"]);
    }
    apply_delta(acc, &choice["delta"])
}

fn apply_message(acc: &mut StreamAcc, message: &Value) -> Option<String> {
    let text = message["content"].as_str().unwrap_or("").to_string();
    if !text.is_empty() {
        acc.content.push_str(&text);
    }
    if let Some(calls) = message["tool_calls"].as_array() {
        for (index, call) in calls.iter().enumerate() {
            let entry = acc.tools.entry(index as u32).or_default();
            if let Some(id) = call["id"].as_str() {
                entry.id = id.to_string();
            }
            if let Some(name) = call["function"]["name"].as_str() {
                entry.name = name.to_string();
            }
            if let Some(arguments) = call["function"]["arguments"].as_str() {
                entry.arguments = arguments.to_string();
            }
        }
    }
    if text.is_empty() { None } else { Some(text) }
}

fn apply_delta(acc: &mut StreamAcc, delta: &Value) -> Option<String> {
    let mut emitted = None;
    if let Some(text) = delta["content"].as_str() {
        if !text.is_empty() {
            acc.content.push_str(text);
            emitted = Some(text.to_string());
        }
    }
    if let Some(calls) = delta["tool_calls"].as_array() {
        for call in calls {
            let index = call["index"].as_u64().unwrap_or(0) as u32;
            let entry = acc.tools.entry(index).or_default();
            if let Some(id) = call["id"].as_str() {
                if !id.is_empty() {
                    entry.id = id.to_string();
                }
            }
            if let Some(name) = call["function"]["name"].as_str() {
                entry.name.push_str(name);
            }
            if let Some(arguments) = call["function"]["arguments"].as_str() {
                entry.arguments.push_str(arguments);
            }
        }
    }
    emitted
}

pub fn assistant_message(acc: &StreamAcc) -> Value {
    let mut message = json!({
        "role": "assistant",
        "content": if acc.content.is_empty() { Value::Null } else { json!(acc.content) }
    });
    if !acc.tools.is_empty() {
        let calls: Vec<Value> = acc
            .tools
            .values()
            .enumerate()
            .map(|(index, call)| {
                json!({
                    "id": if call.id.is_empty() { format!("call_{index}") } else { call.id.clone() },
                    "type": "function",
                    "function": {
                        "name": call.name,
                        "arguments": if call.arguments.is_empty() { "{}".to_string() } else { call.arguments.clone() }
                    }
                })
            })
            .collect();
        message["tool_calls"] = json!(calls);
    }
    message
}

pub fn tool_definitions(image_ready: bool, extra: Vec<Value>) -> Vec<Value> {
    let mut tools = extra;
    if image_ready {
        tools.insert(
            0,
            json!({
                "type": "function",
                "function": {
                    "name": "generate_image",
                    "description": "生成一张图片。需要保留用户上传的原图主体时，use_references 必须为 true：第一张图的主体会被蒙版锁住，只替换背景，不会重画主体。",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "prompt": { "type": "string", "description": "要替换的人物、服装、背景和构图。保留原图时不要重写主体的颜色和形状。" },
                            "size": {
                                "type": "string",
                                "enum": ["1024x1024", "1024x1792", "1792x1024"],
                                "description": "画幅，不确定时用 1024x1024"
                            },
                            "use_references": {
                                "type": "boolean",
                                "description": "为 true 时锁定最近一条带图消息的第一张图，只编辑背景。需要保留这张原图时必须为 true；不需要原图时为 false。"
                            }
                        },
                        "required": ["prompt"]
                    }
                }
            }),
        );
    }
    tools
}

pub fn system_message(prompt: &str, skills: &[(String, String)], image_ready: bool) -> String {
    let image_note = if image_ready {
        "当用户希望得到图像、海报、插画、照片或视觉稿时，调用 generate_image。用户上传了图片并要求保留原图主体时，use_references 必须为 true。此时第一张图的主体会被蒙版锁住，只替换背景，不要在提示词里要求重画主体。工具若说明无法分离主体或接口不接受蒙版，就停止，不要改用纯文字重新生成。不要声称颜色已经和原图核对一致。生成后用简短的话说明画面，不要声称还没画就已经看到了文件。"
    } else {
        "当前没有配置生图模型。如果用户要图片，直接说明需要先在设置里填写生图模型，不要假装已经生成。"
    };
    let mut text = format!("{prompt}\n\n{image_note}");
    if !skills.is_empty() {
        text.push_str("\n\n以下是用户启用的技能。只在当前任务符合该技能写明的适用场景时遵守，不要把某个技能套到无关请求上。");
        for (name, content) in skills {
            text.push_str("\n\n## ");
            text.push_str(name);
            text.push('\n');
            text.push_str(content);
        }
    }
    text
}

#[cfg(test)]
mod tests {
    use super::{apply_data, normalize_base, parse_models, responses_body, StreamAcc};
    use serde_json::json;

    #[test]
    fn rewrites_chat_tools_for_the_responses_api() {
        let messages = vec![
            json!({ "role": "system", "content": "你是助手" }),
            json!({ "role": "user", "content": "画一只猫" }),
        ];
        let tools = vec![json!({
            "type": "function",
            "function": { "name": "generate_image", "description": "画", "parameters": { "type": "object" } }
        })];
        let body = responses_body("gpt-6.1-sol", &messages, &tools);
        assert_eq!(body["instructions"], "你是助手");
        assert_eq!(body["input"][0]["role"], "user");
        assert_eq!(body["tools"][0]["name"], "generate_image");
        assert!(body["tools"][0].get("function").is_none());
    }

    #[test]
    fn reads_responses_text_and_function_calls() {
        let mut acc = StreamAcc::default();
        let text = apply_data(
            &mut acc,
            r#"{"type":"response.output_text.delta","delta":"好"}"#,
        );
        assert_eq!(text.as_deref(), Some("好"));
        apply_data(
            &mut acc,
            r#"{"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","call_id":"call_9","name":"generate_image","arguments":""}}"#,
        );
        apply_data(
            &mut acc,
            r#"{"type":"response.function_call_arguments.delta","output_index":1,"delta":"{\"prompt\":\"cat\"}"}"#,
        );
        assert_eq!(acc.tools[&1].name, "generate_image");
        assert_eq!(acc.tools[&1].id, "call_9");
        assert!(acc.tools[&1].arguments.contains("cat"));
    }

    #[test]
    fn reads_model_ids_in_both_shapes() {
        let openai = r#"{"object":"list","data":[{"id":"gpt-4o"},{"id":"dall-e-3"},{"id":"gpt-4o"}]}"#;
        assert_eq!(parse_models(openai).unwrap(), vec!["dall-e-3", "gpt-4o"]);
        assert_eq!(parse_models(r#"["b","a"]"#).unwrap(), vec!["a", "b"]);
        assert!(parse_models("<html>").is_err());
    }

    #[test]
    fn normalizes_openai_style_bases() {
        assert_eq!(
            normalize_base("https://api.openai.com/v1/chat/completions").unwrap(),
            "https://api.openai.com/v1"
        );
        assert!(normalize_base("api.openai.com").is_err());
    }

    #[test]
    fn accumulates_streamed_text_and_tool_calls() {
        let mut acc = StreamAcc::default();
        let text = apply_data(
            &mut acc,
            r#"{"choices":[{"delta":{"content":"你好"},"finish_reason":null}]}"#,
        );
        assert_eq!(text.as_deref(), Some("你好"));
        apply_data(
            &mut acc,
            r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"generate_image","arguments":"{\"prompt\":\"cat\"}"}}]},"finish_reason":"tool_calls"}]}"#,
        );
        assert_eq!(acc.tools[&0].name, "generate_image");
        assert_eq!(acc.finish.as_deref(), Some("tool_calls"));
        assert!(acc.tools[&0].arguments.contains("cat"));
    }
}
