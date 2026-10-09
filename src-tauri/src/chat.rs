use base64::engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE, URL_SAFE_NO_PAD};
use base64::Engine;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::db::{self, MessageDto};
use crate::mcp::ExposedTool;
use crate::openai::{self, StreamAcc};
use crate::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingFile {
    pub bytes_base64: String,
    pub extension: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendInput {
    pub conversation_id: Option<String>,
    pub content: String,
    pub attachments: Vec<IncomingFile>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendStarted {
    pub conversation_id: String,
    pub user_message: MessageDto,
    pub assistant_message: MessageDto,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ChatEvent {
    Ready {
        conversation_id: String,
        user_message: MessageDto,
        assistant_message: MessageDto,
    },
    Delta {
        conversation_id: String,
        message_id: String,
        text: String,
    },
    Tool {
        conversation_id: String,
        message_id: String,
        label: String,
    },
    Image {
        conversation_id: String,
        message_id: String,
        path: String,
    },
    Done {
        conversation_id: String,
        message_id: String,
    },
    Error {
        conversation_id: String,
        message_id: String,
        message: String,
    },
    Cancelled {
        conversation_id: String,
        message_id: String,
    },
    ConversationsChanged,
}

struct RunGuard {
    app: AppHandle,
    conversation_id: String,
}

impl Drop for RunGuard {
    fn drop(&mut self) {
        if let Some(state) = self.app.try_state::<AppState>() {
            if let Ok(mut runs) = state.runs.lock() {
                runs.remove(&self.conversation_id);
            }
        }
    }
}

pub fn send(app: &AppHandle, input: SendInput) -> Result<SendStarted, String> {
    let content = input.content.trim().to_string();
    if content.is_empty() && input.attachments.is_empty() {
        return Err("写点什么，或附上一张图".into());
    }
    if content.chars().count() > 32_000 {
        return Err("这条消息太长了".into());
    }
    if input.attachments.len() > 8 {
        return Err("一次最多八张图片".into());
    }
    let files = decode_attachments(&input.attachments)?;
    let state = app.state::<AppState>();
    let started = {
        let conn = state.db.lock().map_err(|err| err.to_string())?;
        let settings = db::load_settings(&conn)?;
        if settings.base_url.trim().is_empty() || settings.api_key.trim().is_empty() {
            return Err("先在设置里填写服务地址和密钥".into());
        }
        if settings.chat_model.trim().is_empty() {
            return Err("先在设置里填写对话模型".into());
        }
        let conversation_id = match input.conversation_id.clone() {
            Some(id) => id,
            None => {
                let id = Uuid::new_v4().to_string();
                db::create_conversation(&conn, &id, &db::title_from(&content))?;
                id
            }
        };
        if state
            .runs
            .lock()
            .map_err(|err| err.to_string())?
            .contains_key(&conversation_id)
        {
            return Err("这条对话正在生成".into());
        }
        let dir = images_dir(app)?;
        let mut images = Vec::new();
        for (bytes, extension) in files {
            images.push(write_image(&dir, &bytes, &extension)?);
        }
        let now = db::now_ms();
        let user_message = MessageDto {
            id: Uuid::new_v4().to_string(),
            conversation_id: conversation_id.clone(),
            role: "user".into(),
            content,
            images,
            status: "complete".into(),
            error: None,
            created_at: now,
        };
        let assistant_message = MessageDto {
            id: Uuid::new_v4().to_string(),
            conversation_id: conversation_id.clone(),
            role: "assistant".into(),
            content: String::new(),
            images: Vec::new(),
            status: "streaming".into(),
            error: None,
            created_at: now + 1,
        };
        db::insert_message(&conn, &user_message)?;
        db::insert_message(&conn, &assistant_message)?;
        db::touch_conversation(&conn, &conversation_id)?;
        SendStarted {
            conversation_id,
            user_message,
            assistant_message,
        }
    };
    begin_run(&state, &started.conversation_id)?;
    emit(
        app,
        &ChatEvent::Ready {
            conversation_id: started.conversation_id.clone(),
            user_message: started.user_message.clone(),
            assistant_message: started.assistant_message.clone(),
        },
    );
    emit(app, &ChatEvent::ConversationsChanged);
    let conversation_id = started.conversation_id.clone();
    let assistant_id = started.assistant_message.id.clone();
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let _guard = RunGuard {
            app: app_handle.clone(),
            conversation_id: conversation_id.clone(),
        };
        run_generation(&app_handle, conversation_id, assistant_id).await;
    });
    Ok(started)
}

pub fn retry(app: &AppHandle, conversation_id: String) -> Result<SendStarted, String> {
    let state = app.state::<AppState>();
    if state
        .runs
        .lock()
        .map_err(|err| err.to_string())?
        .contains_key(&conversation_id)
    {
        return Err("这条对话正在生成".into());
    }
    let started = {
        let conn = state.db.lock().map_err(|err| err.to_string())?;
        let mut messages = db::list_messages(&conn, &conversation_id)?;
        let assistant = messages.pop().ok_or("还没有可以重试的回复")?;
        if assistant.role != "assistant" || !matches!(assistant.status.as_str(), "error" | "cancelled") {
            return Err("只能重试失败或已停止的回复".into());
        }
        let user = messages.pop().ok_or("找不到上一条提问")?;
        db::delete_message(&conn, &assistant.id)?;
        let replacement = MessageDto {
            id: Uuid::new_v4().to_string(),
            conversation_id: conversation_id.clone(),
            role: "assistant".into(),
            content: String::new(),
            images: Vec::new(),
            status: "streaming".into(),
            error: None,
            created_at: db::now_ms(),
        };
        db::insert_message(&conn, &replacement)?;
        db::touch_conversation(&conn, &conversation_id)?;
        SendStarted {
            conversation_id: conversation_id.clone(),
            user_message: user,
            assistant_message: replacement,
        }
    };
    begin_run(&state, &started.conversation_id)?;
    emit(
        app,
        &ChatEvent::Ready {
            conversation_id: started.conversation_id.clone(),
            user_message: started.user_message.clone(),
            assistant_message: started.assistant_message.clone(),
        },
    );
    let assistant_id = started.assistant_message.id.clone();
    let app_handle = app.clone();
    let guard_id = started.conversation_id.clone();
    tauri::async_runtime::spawn(async move {
        let _guard = RunGuard {
            app: app_handle.clone(),
            conversation_id: guard_id,
        };
        run_generation(&app_handle, conversation_id, assistant_id).await;
    });
    Ok(started)
}

pub fn cancel(app: &AppHandle, conversation_id: &str) {
    let state = app.state::<AppState>();
    if let Ok(runs) = state.runs.lock() {
        if let Some(token) = runs.get(conversation_id) {
            token.cancel();
        }
    };
}

fn begin_run(state: &AppState, conversation_id: &str) -> Result<(), String> {
    let mut runs = state.runs.lock().map_err(|err| err.to_string())?;
    if runs.contains_key(conversation_id) {
        return Err("这条对话正在生成".into());
    }
    runs.insert(conversation_id.to_string(), CancellationToken::new());
    Ok(())
}

fn token_for(app: &AppHandle, conversation_id: &str) -> CancellationToken {
    let state = app.state::<AppState>();
    state
        .runs
        .lock()
        .ok()
        .and_then(|runs| runs.get(conversation_id).cloned())
        .unwrap_or_else(CancellationToken::new)
}

async fn run_generation(app: &AppHandle, conversation_id: String, assistant_id: String) {
    let token = token_for(app, &conversation_id);
    match generate(app, &token, &conversation_id, &assistant_id).await {
        Ok(Outcome::Done) => {
            emit(
                app,
                &ChatEvent::Done {
                    conversation_id,
                    message_id: assistant_id,
                },
            );
        }
        Ok(Outcome::Cancelled) => {
            emit(
                app,
                &ChatEvent::Cancelled {
                    conversation_id,
                    message_id: assistant_id,
                },
            );
        }
        Err(message) => {
            emit(
                app,
                &ChatEvent::Error {
                    conversation_id,
                    message_id: assistant_id,
                    message,
                },
            );
        }
    }
}

enum Outcome {
    Done,
    Cancelled,
}

struct Drawn {
    path: String,
    attached: usize,
}

async fn generate(
    app: &AppHandle,
    token: &CancellationToken,
    conversation_id: &str,
    assistant_id: &str,
) -> Result<Outcome, String> {
    let (http, settings, system, history) = {
        let state = app.state::<AppState>();
        let conn = state.db.lock().map_err(|err| err.to_string())?;
        let settings = db::load_settings(&conn)?;
        let system = openai::system_message(
            &db::active_prompt(&conn)?,
            &db::enabled_skills(&conn)?,
            !settings.image_model.trim().is_empty(),
        );
        let history = db::list_messages(&conn, conversation_id)?;
        (state.http.clone(), settings, system, history)
    };
    let base = match openai::normalize_base(&settings.base_url) {
        Ok(base) => base,
        Err(message) => return mark_error(app, assistant_id, "", &[], message),
    };
    let mut api_messages = vec![json!({ "role": "system", "content": system })];
    for message in &history {
        if message.id == assistant_id || message.status == "streaming" {
            continue;
        }
        if message.role == "assistant" && message.content.trim().is_empty() && message.images.is_empty() {
            continue;
        }
        match message_to_api(message) {
            Ok(value) => api_messages.push(value),
            Err(message) => return mark_error(app, assistant_id, "", &[], message),
        }
    }
    let exposed = {
        let state = app.state::<AppState>();
        let manager = state.mcp.lock().map_err(|err| err.to_string())?;
        manager.exposed_tools()
    };
    let tools = openai::tool_definitions(
        !settings.image_model.trim().is_empty(),
        exposed
            .iter()
            .map(|tool| {
                json!({
                    "type": "function",
                    "function": {
                        "name": tool.openai_name,
                        "description": tool.description,
                        "parameters": tool.schema
                    }
                })
            })
            .collect(),
    );

    let mut visible = String::new();
    let mut images = Vec::new();
    let mut image_count = 0usize;
    let mut last_save = Instant::now();
    let mut prefer_responses = false;

    for _ in 0..4 {
        if token.is_cancelled() {
            finish_cancelled(app, assistant_id, &visible, &images);
            return Ok(Outcome::Cancelled);
        }
        let mut round = StreamAcc::default();
        let mut pending_text = String::new();
        let mut last_flush = Instant::now();
        let stream_result = stream_chat(
            &http,
            token,
            &base,
            settings.api_key.trim(),
            settings.chat_model.trim(),
            &api_messages,
            &tools,
            &mut prefer_responses,
            &mut |delta| {
                visible.push_str(&delta);
                pending_text.push_str(&delta);
                if last_flush.elapsed() >= Duration::from_millis(40) {
                    emit(
                        app,
                        &ChatEvent::Delta {
                            conversation_id: conversation_id.to_string(),
                            message_id: assistant_id.to_string(),
                            text: std::mem::take(&mut pending_text),
                        },
                    );
                    last_flush = Instant::now();
                }
            },
            &mut round,
        )
        .await;
        if !pending_text.is_empty() {
            emit(
                app,
                &ChatEvent::Delta {
                    conversation_id: conversation_id.to_string(),
                    message_id: assistant_id.to_string(),
                    text: std::mem::take(&mut pending_text),
                },
            );
        }
        if token.is_cancelled() || matches!(stream_result, Err(ref err) if err == "cancelled") {
            finish_cancelled(app, assistant_id, &visible, &images);
            return Ok(Outcome::Cancelled);
        }
        if let Err(message) = stream_result {
            return mark_error(app, assistant_id, &visible, &images, message);
        }
        if last_save.elapsed() > Duration::from_millis(400) {
            persist(app, assistant_id, &visible, &images, "streaming", None);
            last_save = Instant::now();
        }
        if round.tools.is_empty() {
            persist(app, assistant_id, &visible, &images, "complete", None);
            return Ok(Outcome::Done);
        }
        api_messages.push(openai::assistant_message(&round));
        for call in round.tools.values() {
            if token.is_cancelled() {
                finish_cancelled(app, assistant_id, &visible, &images);
                return Ok(Outcome::Cancelled);
            }
            let name = call.name.clone();
            let arguments: Value = serde_json::from_str(&call.arguments).unwrap_or_else(|_| json!({}));
            let label = if name == "generate_image" {
                "正在绘制".to_string()
            } else {
                format!("正在调用 {name}")
            };
            emit(
                app,
                &ChatEvent::Tool {
                    conversation_id: conversation_id.to_string(),
                    message_id: assistant_id.to_string(),
                    label,
                },
            );
            let result = if name == "generate_image" {
                image_count += 1;
                if image_count > 3 {
                    Err("这一轮生成的图片已经够多了".into())
                } else {
                    draw_image(
                        app,
                        &http,
                        &base,
                        &settings,
                        &arguments,
                        &latest_user_image_paths(&history),
                        &mut images,
                    )
                    .await
                    .map(|(path, attached)| Drawn { path, attached })
                }
            } else {
                call_mcp(app, &exposed, &name, arguments)
                    .await
                    .map(|text| Drawn { path: text, attached: 0 })
            };
            if name == "generate_image" {
                if let Ok(drawn) = &result {
                    emit(
                        app,
                        &ChatEvent::Image {
                            conversation_id: conversation_id.to_string(),
                            message_id: assistant_id.to_string(),
                            path: drawn.path.clone(),
                        },
                    );
                    persist(app, assistant_id, &visible, &images, "streaming", None);
                }
            }
            let tool_content = match &result {
                Ok(drawn) if name == "generate_image" && drawn.attached > 0 => format!(
                    "图片已生成并展示给用户。第一张参考图的主体像素已用蒙版锁住，只替换了背景，没有重画主体。如果成图里的主体颜色或形状变了，就是接口没有遵守蒙版，不能当成原图替换。文件：{}",
                    drawn.path
                ),
                Ok(drawn) if name == "generate_image" => {
                    format!("图片已生成并展示给用户。本次没有附上实拍参考图。文件：{}", drawn.path)
                }
                Ok(drawn) => drawn.path.clone(),
                Err(err) => format!("工具失败：{err}"),
            };
            api_messages.push(json!({
                "role": "tool",
                "tool_call_id": if call.id.is_empty() { format!("call_{name}") } else { call.id.clone() },
                "content": tool_content
            }));
        }
    }
    if !visible.is_empty() && !visible.ends_with('\n') {
        visible.push('\n');
    }
    visible.push_str("这一轮的工具调用已到上限。");
    persist(app, assistant_id, &visible, &images, "complete", None);
    emit(
        app,
        &ChatEvent::Delta {
            conversation_id: conversation_id.to_string(),
            message_id: assistant_id.to_string(),
            text: "这一轮的工具调用已到上限。".into(),
        },
    );
    Ok(Outcome::Done)
}

fn finish_cancelled(app: &AppHandle, assistant_id: &str, content: &str, images: &[String]) {
    persist(app, assistant_id, content, images, "cancelled", None);
}

fn mark_error(
    app: &AppHandle,
    assistant_id: &str,
    content: &str,
    images: &[String],
    message: String,
) -> Result<Outcome, String> {
    persist(app, assistant_id, content, images, "error", Some(&message));
    Err(message)
}

fn persist(app: &AppHandle, id: &str, content: &str, images: &[String], status: &str, error: Option<&str>) {
    let state = app.state::<AppState>();
    if let Ok(conn) = state.db.lock() {
        let _ = db::update_message(&conn, id, content, images, status, error);
    };
}

async fn draw_image(
    app: &AppHandle,
    http: &reqwest::Client,
    base: &str,
    settings: &db::SettingsDto,
    arguments: &Value,
    reference_paths: &[String],
    images: &mut Vec<String>,
) -> Result<(String, usize), String> {
    let prompt = arguments["prompt"].as_str().unwrap_or("").trim().to_string();
    if prompt.is_empty() {
        return Err("生图提示词是空的".into());
    }
    let size = arguments["size"].as_str().unwrap_or("1024x1024");
    let size = if matches!(size, "1024x1024" | "1024x1792" | "1792x1024") {
        size
    } else {
        "1024x1024"
    };
    let use_references = arguments["use_references"].as_bool().unwrap_or(!reference_paths.is_empty());
    let (bytes, attached) = if use_references {
        if reference_paths.is_empty() {
            return Err("这一轮没有用户上传的图片，无法按参考图生成".into());
        }
        let files = read_references(reference_paths)?;
        let Some(base_image) = files.into_iter().next() else {
            return Err("这一轮没有用户上传的图片，无法按参考图生成".into());
        };
        let mask = protect_subject_mask(&base_image)?;
        let bytes = request_edit(
            http,
            base,
            settings.api_key.trim(),
            settings.image_model.trim(),
            &prompt,
            size,
            base_image,
            mask,
        )
        .await?;
        (bytes, 1)
    } else {
        let bytes = request_image(
            http,
            base,
            settings.api_key.trim(),
            settings.image_model.trim(),
            &prompt,
            size,
        )
        .await?;
        (bytes, 0)
    };
    let path = write_image(&images_dir(app)?, &bytes, "png")?;
    let (width, height) = image_size(&bytes);
    let state = app.state::<AppState>();
    {
        let conn = state.db.lock().map_err(|err| err.to_string())?;
        db::remember_generated(&conn, &path, width, height, bytes.len() as i64)?;
    }
    images.push(path.clone());
    Ok((path, attached))
}

fn latest_user_image_paths(history: &[db::MessageDto]) -> Vec<String> {
    history
        .iter()
        .rev()
        .find(|message| message.role == "user" && !message.images.is_empty())
        .map(|message| message.images.iter().take(8).cloned().collect())
        .unwrap_or_default()
}

fn read_references(paths: &[String]) -> Result<Vec<Vec<u8>>, String> {
    paths
        .iter()
        .map(|path| std::fs::read(path).map_err(|err| format!("读取参考图失败：{err}")))
        .collect()
}

async fn request_image(
    http: &reqwest::Client,
    base: &str,
    key: &str,
    model: &str,
    prompt: &str,
    size: &str,
) -> Result<Vec<u8>, String> {
    if model.is_empty() {
        return Err("还没有填写生图模型".into());
    }
    let url = format!("{base}/images/generations");
    let response = http
        .post(url)
        .bearer_auth(key)
        .header("user-agent", "Amage/1.0")
        .json(&json!({
            "model": model,
            "prompt": prompt,
            "size": size,
            "response_format": "b64_json"
        }))
        .send()
        .await
        .map_err(|err| format!("生图请求失败：{err}"))?;
    let status = response.status();
    let body = response.text().await.map_err(|err| err.to_string())?;
    image_bytes_from_body(http, status, body).await
}

async fn request_edit(
    http: &reqwest::Client,
    base: &str,
    key: &str,
    model: &str,
    prompt: &str,
    size: &str,
    image_bytes: Vec<u8>,
    mask: Vec<u8>,
) -> Result<Vec<u8>, String> {
    if model.is_empty() {
        return Err("还没有填写生图模型".into());
    }
    let mime = image_mime(&image_bytes);
    let image_part = reqwest::multipart::Part::bytes(image_bytes)
        .file_name(format!("source.{}", image_extension(mime)))
        .mime_str(mime)
        .map_err(|err| format!("参考图格式无法提交：{err}"))?;
    let mask_part = reqwest::multipart::Part::bytes(mask)
        .file_name("mask.png")
        .mime_str("image/png")
        .map_err(|err| format!("蒙版无法提交：{err}"))?;
    let form = reqwest::multipart::Form::new()
        .text("model", model.to_string())
        .text("prompt", prompt.to_string())
        .text("size", size.to_string())
        .text("response_format", "b64_json")
        .part("image", image_part)
        .part("mask", mask_part);
    let response = http
        .post(format!("{base}/images/edits"))
        .bearer_auth(key)
        .header("user-agent", "Amage/1.0")
        .multipart(form)
        .send()
        .await
        .map_err(|err| format!("参考图生图请求失败：{err}"))?;
    let status = response.status();
    let body = response.text().await.map_err(|err| err.to_string())?;
    if status.as_u16() == 404 || status.as_u16() == 405 {
        return Err("生图接口不接受参考图，已停止生成，避免在需要参考图时只用文字生成。".into());
    }
    image_bytes_from_body(http, status, body).await
}

async fn image_bytes_from_body(
    http: &reqwest::Client,
    status: reqwest::StatusCode,
    body: String,
) -> Result<Vec<u8>, String> {
    if !status.is_success() {
        return Err(openai::api_error(status, &body));
    }
    let value: Value = serde_json::from_str(&body).map_err(|err| err.to_string())?;
    if let Some(encoded) = value["data"][0]["b64_json"].as_str() {
        return decode_image_b64(encoded);
    }
    if let Some(url) = value["data"][0]["url"].as_str() {
        let downloaded = http.get(url).send().await.map_err(|err| format!("下载图片失败：{err}"))?;
        if !downloaded.status().is_success() {
            return Err(format!("下载图片失败：{}", downloaded.status()));
        }
        return downloaded.bytes().await.map(|bytes| bytes.to_vec()).map_err(|err| err.to_string());
    }
    Err("生图接口没有返回图片".into())
}

fn protect_subject_mask(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let image = image::load_from_memory(bytes).map_err(|_| "参考图无法读取，已停止，避免重新生成主体。".to_string())?;
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    if width < 8 || height < 8 {
        return Err("参考图太小，无法分离主体和背景。".into());
    }
    let mut samples = Vec::new();
    for x in (0..width).step_by(4) {
        samples.push(rgb(rgba.get_pixel(x, 0)));
        samples.push(rgb(rgba.get_pixel(x, height - 1)));
    }
    for y in (0..height).step_by(4) {
        samples.push(rgb(rgba.get_pixel(0, y)));
        samples.push(rgb(rgba.get_pixel(width - 1, y)));
    }
    let (background, variance) = background_color(&samples);
    if variance > 2_500 {
        return Err("参考图边缘不是干净背景，无法锁住原图像素。已停止，避免重新生成主体。".into());
    }
    let mut subject = vec![false; (width * height) as usize];
    let mut kept = 0u64;
    for (index, pixel) in rgba.pixels().enumerate() {
        if color_distance(rgb(pixel), background) > 1_600 {
            subject[index] = true;
            kept += 1;
        }
    }
    let total = (width as u64) * (height as u64);
    let ratio = kept as f32 / total as f32;
    if !(0.05..0.97).contains(&ratio) {
        return Err("参考图里分不清主体和背景，无法只替换周围。已停止，避免重新生成主体。".into());
    }
    let subject = dilate_subject(&subject, width, height);
    let mut mask = image::RgbaImage::new(width, height);
    for (index, pixel) in mask.pixels_mut().enumerate() {
        *pixel = if subject[index] {
            image::Rgba([255, 255, 255, 255])
        } else {
            image::Rgba([0, 0, 0, 0])
        };
    }
    let mut encoded = Vec::new();
    image::DynamicImage::ImageRgba8(mask)
        .write_to(&mut std::io::Cursor::new(&mut encoded), image::ImageFormat::Png)
        .map_err(|err| format!("蒙版没有做成：{err}"))?;
    Ok(encoded)
}

fn rgb(pixel: &image::Rgba<u8>) -> [u8; 3] {
    [pixel.0[0], pixel.0[1], pixel.0[2]]
}

fn color_distance(left: [u8; 3], right: [u8; 3]) -> u32 {
    let red = u32::from(left[0].abs_diff(right[0]));
    let green = u32::from(left[1].abs_diff(right[1]));
    let blue = u32::from(left[2].abs_diff(right[2]));
    red * red + green * green + blue * blue
}

fn background_color(samples: &[[u8; 3]]) -> ([u8; 3], u32) {
    let count = samples.len().max(1) as u64;
    let mut sum = [0u64; 3];
    for sample in samples {
        sum[0] += u64::from(sample[0]);
        sum[1] += u64::from(sample[1]);
        sum[2] += u64::from(sample[2]);
    }
    let mean = [(sum[0] / count) as u8, (sum[1] / count) as u8, (sum[2] / count) as u8];
    let variance = samples.iter().map(|sample| u64::from(color_distance(*sample, mean))).sum::<u64>() / count;
    (mean, variance as u32)
}

fn dilate_subject(subject: &[bool], width: u32, height: u32) -> Vec<bool> {
    let mut expanded = subject.to_vec();
    for y in 0..height {
        for x in 0..width {
            let index = (y * width + x) as usize;
            if subject[index] {
                continue;
            }
            let mut near = false;
            for offset_y in -1i32..=1 {
                for offset_x in -1i32..=1 {
                    let next_x = x as i32 + offset_x;
                    let next_y = y as i32 + offset_y;
                    if next_x < 0 || next_y < 0 || next_x >= width as i32 || next_y >= height as i32 {
                        continue;
                    }
                    if subject[(next_y as u32 * width + next_x as u32) as usize] {
                        near = true;
                    }
                }
            }
            if near {
                expanded[index] = true;
            }
        }
    }
    expanded
}

fn image_mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if bytes.starts_with(b"GIF8") {
        "image/gif"
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else {
        "application/octet-stream"
    }
}

fn image_extension(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "bin",
    }
}

async fn call_mcp(app: &AppHandle, exposed: &[ExposedTool], name: &str, arguments: Value) -> Result<String, String> {
    let Some(tool) = exposed.iter().find(|tool| tool.openai_name == name) else {
        return Err(format!("没有这个工具：{name}"));
    };
    let server = {
        let state = app.state::<AppState>();
        let manager = state.mcp.lock().map_err(|err| err.to_string())?;
        manager.get(&tool.server_id).ok_or("MCP 已经断开")?
    };
    server.call_tool(&tool.tool_name, arguments).await
}

#[allow(clippy::too_many_arguments)]
async fn stream_chat(
    http: &reqwest::Client,
    token: &CancellationToken,
    base: &str,
    key: &str,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    prefer_responses: &mut bool,
    on_text: &mut impl FnMut(String),
    acc: &mut StreamAcc,
) -> Result<(), String> {
    // gpt-6.1-sol rejects function tools on /v1/chat/completions, and also rejects
    // reasoning_effort "none". The same call is accepted on /v1/responses.
    let mut via_responses = *prefer_responses;
    let response = loop {
        let body = if via_responses {
            openai::responses_body(model, messages, tools)
        } else {
            let mut body = json!({
                "model": model,
                "messages": messages,
                "stream": true
            });
            if !tools.is_empty() {
                body["tools"] = json!(tools);
            }
            body
        };
        let path = if via_responses { "responses" } else { "chat/completions" };
        let request = http
            .post(format!("{base}/{path}"))
            .bearer_auth(key)
            .header("user-agent", "Amage/1.0")
            .json(&body)
            .send();
        let response = tokio::select! {
            _ = token.cancelled() => return Err("cancelled".into()),
            response = request => response.map_err(|err| format!("对话请求失败：{err}"))?,
        };
        if response.status().is_success() {
            *prefer_responses = via_responses;
            break response;
        }
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        let needs_responses = text.contains("reasoning_effort") || text.contains("/v1/responses");
        if !via_responses && !tools.is_empty() && needs_responses {
            via_responses = true;
            continue;
        }
        return Err(openai::api_error(status, &text));
    };
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !content_type.contains("text/event-stream") {
        let status = response.status();
        let text = response.text().await.map_err(|err| err.to_string())?;
        if let Some(delta) = openai::apply_data(acc, &text) {
            on_text(delta);
        }
        if acc.content.is_empty() && acc.tools.is_empty() && text.contains("\"error\"") {
            return Err(openai::api_error(status, &text));
        }
        return Ok(());
    }
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    loop {
        let next = tokio::select! {
            _ = token.cancelled() => return Err("cancelled".into()),
            item = stream.next() => item,
        };
        let Some(item) = next else { break };
        let chunk = item.map_err(|err| format!("读取回复失败：{err}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        drain_sse(&mut buffer, acc, on_text);
    }
    drain_sse(&mut buffer, acc, on_text);
    Ok(())
}

fn drain_sse(buffer: &mut String, acc: &mut StreamAcc, on_text: &mut impl FnMut(String)) {
    while let Some(index) = buffer.find('\n') {
        let line: String = buffer.drain(..=index).collect();
        let line = line.trim_end_matches(['\n', '\r']);
        let Some(data) = line.strip_prefix("data:") else { continue };
        if let Some(delta) = openai::apply_data(acc, data.trim()) {
            on_text(delta);
        }
    }
}

fn message_to_api(message: &MessageDto) -> Result<Value, String> {
    if message.role != "user" {
        return Ok(json!({ "role": "assistant", "content": message.content }));
    }
    let text = if message.content.trim().is_empty() {
        "请查看附件图片"
    } else {
        message.content.as_str()
    };
    if message.images.is_empty() {
        return Ok(json!({ "role": "user", "content": text }));
    }
    let mut parts = vec![json!({ "type": "text", "text": text })];
    for path in &message.images {
        parts.push(image_part(path)?);
    }
    Ok(json!({ "role": "user", "content": parts }))
}

fn image_part(path: &str) -> Result<Value, String> {
    let bytes = std::fs::read(path).map_err(|err| format!("读取图片失败：{err}"))?;
    if bytes.len() > 6 * 1024 * 1024 {
        return Err("附件图片超过 6 MB".into());
    }
    let mime = match path.rsplit('.').next().unwrap_or("png").to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    };
    Ok(json!({
        "type": "image_url",
        "image_url": { "url": format!("data:{mime};base64,{}", STANDARD.encode(bytes)) }
    }))
}

fn decode_attachments(files: &[IncomingFile]) -> Result<Vec<(Vec<u8>, String)>, String> {
    let mut decoded = Vec::new();
    for file in files {
        let bytes = STANDARD
            .decode(file.bytes_base64.trim())
            .map_err(|_| "图片无法读取".to_string())?;
        if bytes.len() > 6 * 1024 * 1024 {
            return Err("单张图片不能超过 6 MB".into());
        }
        let extension = sniff_extension(&bytes, &file.extension);
        decoded.push((bytes, extension));
    }
    Ok(decoded)
}

fn sniff_extension(bytes: &[u8], fallback: &str) -> String {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return "png".into();
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return "jpg".into();
    }
    if bytes.starts_with(b"GIF8") {
        return "gif".into();
    }
    if bytes.len() > 12 && &bytes[8..12] == b"WEBP" {
        return "webp".into();
    }
    match fallback.trim_start_matches('.').to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => "jpg".into(),
        "webp" => "webp".into(),
        "gif" => "gif".into(),
        _ => "png".into(),
    }
}

pub(crate) fn images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| err.to_string())?
        .join("images");
    std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

fn image_size(bytes: &[u8]) -> (i64, i64) {
    png_size(bytes)
        .or_else(|| gif_size(bytes))
        .or_else(|| webp_size(bytes))
        .or_else(|| jpeg_size(bytes))
        .unwrap_or((1024, 1024))
}

fn png_size(bytes: &[u8]) -> Option<(i64, i64)> {
    if bytes.len() >= 24 && bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        let width = u32::from_be_bytes(bytes[16..20].try_into().ok()?) as i64;
        let height = u32::from_be_bytes(bytes[20..24].try_into().ok()?) as i64;
        return Some((width, height));
    }
    None
}

fn gif_size(bytes: &[u8]) -> Option<(i64, i64)> {
    if bytes.len() >= 10 && bytes.starts_with(b"GIF8") {
        let width = u16::from_le_bytes(bytes[6..8].try_into().ok()?) as i64;
        let height = u16::from_le_bytes(bytes[8..10].try_into().ok()?) as i64;
        return Some((width, height));
    }
    None
}

fn webp_size(bytes: &[u8]) -> Option<(i64, i64)> {
    if bytes.len() < 30 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return None;
    }
    match &bytes[12..16] {
        b"VP8X" if bytes.len() >= 30 => {
            let width = 1 + u32::from_le_bytes([bytes[24], bytes[25], bytes[26], 0]) as i64;
            let height = 1 + u32::from_le_bytes([bytes[27], bytes[28], bytes[29], 0]) as i64;
            Some((width, height))
        }
        b"VP8 " if bytes.len() >= 30 => {
            let width = u16::from_le_bytes(bytes[26..28].try_into().ok()?) as i64 & 0x3fff;
            let height = u16::from_le_bytes(bytes[28..30].try_into().ok()?) as i64 & 0x3fff;
            Some((width, height))
        }
        b"VP8L" if bytes.len() >= 25 => {
            let bits = u32::from_le_bytes(bytes[21..25].try_into().ok()?);
            let width = (bits & 0x3fff) as i64 + 1;
            let height = ((bits >> 14) & 0x3fff) as i64 + 1;
            Some((width, height))
        }
        _ => None,
    }
}

fn jpeg_size(bytes: &[u8]) -> Option<(i64, i64)> {
    if bytes.len() < 4 || !bytes.starts_with(&[0xFF, 0xD8]) {
        return None;
    }
    let mut offset = 2;
    while offset + 8 < bytes.len() {
        if bytes[offset] != 0xFF {
            return None;
        }
        let marker = bytes[offset + 1];
        let length = u16::from_be_bytes(bytes[offset + 2..offset + 4].try_into().ok()?) as usize;
        if length < 2 || offset + 2 + length > bytes.len() {
            return None;
        }
        let is_sof = matches!(marker, 0xC0 | 0xC1 | 0xC2 | 0xC3 | 0xC5 | 0xC6 | 0xC7 | 0xC9 | 0xCA | 0xCB | 0xCD | 0xCE | 0xCF);
        if is_sof && offset + 9 < bytes.len() {
            let height = u16::from_be_bytes(bytes[offset + 5..offset + 7].try_into().ok()?) as i64;
            let width = u16::from_be_bytes(bytes[offset + 7..offset + 9].try_into().ok()?) as i64;
            return Some((width, height));
        }
        offset += 2 + length;
    }
    None
}

fn write_image(dir: &std::path::Path, bytes: &[u8], extension: &str) -> Result<String, String> {
    let path = dir.join(format!("{}.{}", Uuid::new_v4(), extension));
    std::fs::write(&path, bytes).map_err(|err| format!("保存图片失败：{err}"))?;
    Ok(path.to_string_lossy().to_string())
}

fn emit(app: &AppHandle, event: &ChatEvent) {
    let _ = app.emit("chat", event);
}

fn decode_image_b64(encoded: &str) -> Result<Vec<u8>, String> {
    let trimmed = encoded.trim();
    let payload = match trimmed.split_once(',') {
        Some((head, body)) if head.contains("base64") => body,
        _ => trimmed,
    };
    let compact: String = payload.chars().filter(|ch| !ch.is_whitespace()).collect();
    for engine in [&STANDARD, &STANDARD_NO_PAD, &URL_SAFE, &URL_SAFE_NO_PAD] {
        if let Ok(bytes) = engine.decode(compact.as_bytes()) {
            if !bytes.is_empty() {
                return Ok(bytes);
            }
        }
    }
    Err("生图接口返回的数据无法解析成图片".into())
}

#[cfg(test)]
mod tests {
    use super::{decode_image_b64, latest_user_image_paths};
    use crate::db::MessageDto;
    use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
    use base64::Engine;

    fn message(role: &str, images: Vec<&str>) -> MessageDto {
        MessageDto {
            id: role.to_string(),
            conversation_id: "c".into(),
            role: role.into(),
            content: String::new(),
            images: images.into_iter().map(str::to_string).collect(),
            status: "complete".into(),
            error: None,
            created_at: 0,
        }
    }

    #[test]
    fn reference_images_come_from_the_latest_user_upload() {
        let history = vec![
            message("user", vec!["old-a.png", "old-b.png"]),
            message("assistant", vec!["generated.png"]),
            message(
                "user",
                vec!["1.png", "2.png", "3.png", "4.png", "5.png", "6.png", "7.png", "8.png", "9.png"],
            ),
        ];
        assert_eq!(
            latest_user_image_paths(&history),
            vec!["1.png", "2.png", "3.png", "4.png", "5.png", "6.png", "7.png", "8.png"]
        );
        assert!(latest_user_image_paths(&[message("user", vec![])]).is_empty());
    }

    #[test]
    fn mask_keeps_the_subject_and_opens_the_background() {
        let mut image = image::RgbaImage::from_pixel(40, 40, image::Rgba([248, 248, 248, 255]));
        for y in 12..28 {
            for x in 12..28 {
                image.put_pixel(x, y, image::Rgba([30, 24, 18, 255]));
            }
        }
        let mut encoded = Vec::new();
        image::DynamicImage::ImageRgba8(image)
            .write_to(&mut std::io::Cursor::new(&mut encoded), image::ImageFormat::Png)
            .unwrap();
        let mask = image::load_from_memory(&super::protect_subject_mask(&encoded).unwrap())
            .unwrap()
            .to_rgba8();
        assert_eq!(mask.get_pixel(1, 1).0[3], 0);
        assert_eq!(mask.get_pixel(20, 20).0[3], 255);
    }

    #[test]
    fn mask_refuses_a_photo_without_a_clean_edge() {
        let mut image = image::RgbaImage::new(24, 24);
        for (x, y, pixel) in image.enumerate_pixels_mut() {
            *pixel = image::Rgba([x.wrapping_mul(11) as u8, y.wrapping_mul(17) as u8, 80, 255]);
        }
        let mut encoded = Vec::new();
        image::DynamicImage::ImageRgba8(image)
            .write_to(&mut std::io::Cursor::new(&mut encoded), image::ImageFormat::Png)
            .unwrap();
        assert!(super::protect_subject_mask(&encoded).is_err());
    }

    #[test]
    fn reads_image_payloads_the_service_actually_sends() {
        let raw = b"\x89PNG-sample_image";
        let standard = STANDARD.encode(raw);
        assert_eq!(decode_image_b64(&standard).unwrap(), raw);
        assert_eq!(decode_image_b64(&format!("data:image/png;base64,{standard}")).unwrap(), raw);
        let broken: String = standard
            .chars()
            .enumerate()
            .flat_map(|(index, ch)| if index > 0 && index % 8 == 0 { vec!['\n', ch] } else { vec![ch] })
            .collect();
        assert_eq!(decode_image_b64(&broken).unwrap(), raw);
        assert_eq!(decode_image_b64(&URL_SAFE_NO_PAD.encode(raw)).unwrap(), raw);
    }
}
