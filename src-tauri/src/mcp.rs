use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::oneshot;

use crate::db::McpServerDto;

#[derive(Debug, Clone)]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub schema: Value,
}

pub struct ExposedTool {
    pub openai_name: String,
    pub server_id: String,
    pub tool_name: String,
    pub description: String,
    pub schema: Value,
}

struct SharedIo {
    pending: HashMap<i64, oneshot::Sender<Result<Value, String>>>,
}

enum Transport {
    Stdio {
        #[allow(dead_code)]
        child: Child,
        stdin: ChildStdin,
        stderr: Arc<Mutex<String>>,
    },
    Http {
        url: String,
        session: Option<String>,
        client: reqwest::Client,
    },
}

struct Session {
    transport: Transport,
    shared: Arc<Mutex<SharedIo>>,
    next_id: i64,
}

pub struct LiveServer {
    pub id: String,
    session: tokio::sync::Mutex<Option<Session>>,
    tools: Mutex<Vec<McpTool>>,
    last_error: Mutex<Option<String>>,
    connecting: Mutex<bool>,
}

#[derive(Default)]
pub struct McpManager {
    servers: HashMap<String, Arc<LiveServer>>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub id: String,
    pub connected: bool,
    pub connecting: bool,
    pub tool_count: usize,
    pub tools: Vec<String>,
    pub error: Option<String>,
}

impl McpManager {
    pub fn status_list(&self) -> Vec<McpStatus> {
        self.servers
            .values()
            .map(|server| server.status())
            .collect()
    }

    pub fn get(&self, id: &str) -> Option<Arc<LiveServer>> {
        self.servers.get(id).cloned()
    }

    pub fn disconnect(&mut self, id: &str) {
        self.servers.remove(id);
    }

    pub fn exposed_tools(&self) -> Vec<ExposedTool> {
        let mut exposed = Vec::new();
        let mut used = std::collections::HashSet::new();
        used.insert("generate_image".to_string());
        for server in self.servers.values() {
            let tools = server.tools.lock().unwrap_or_else(|err| err.into_inner()).clone();
            for tool in tools {
                let mut name = sanitize_name(&format!("m_{}_{}", short_id(&server.id), &tool.name));
                if name.len() > 64 {
                    name = name.chars().take(64).collect();
                }
                let mut suffix = 2;
                while !used.insert(name.clone()) {
                    let extra = format!("_{suffix}");
                    name = format!(
                        "{}{extra}",
                        name.chars().take(64 - extra.chars().count()).collect::<String>()
                    );
                    suffix += 1;
                }
                exposed.push(ExposedTool {
                    openai_name: name,
                    server_id: server.id.clone(),
                    tool_name: tool.name,
                    description: tool.description,
                    schema: tool.schema,
                });
            }
        }
        exposed
    }
}

impl LiveServer {
    fn new(id: String) -> Arc<Self> {
        Arc::new(Self {
            id,
            session: tokio::sync::Mutex::new(None),
            tools: Mutex::new(Vec::new()),
            last_error: Mutex::new(None),
            connecting: Mutex::new(false),
        })
    }

    pub fn status(&self) -> McpStatus {
        let tools = self.tools.lock().unwrap_or_else(|err| err.into_inner());
        McpStatus {
            id: self.id.clone(),
            connected: self
                .session
                .try_lock()
                .map(|session| session.is_some())
                .unwrap_or(true),
            connecting: *self.connecting.lock().unwrap_or_else(|err| err.into_inner()),
            tool_count: tools.len(),
            tools: tools.iter().map(|tool| tool.name.clone()).collect(),
            error: self
                .last_error
                .lock()
                .unwrap_or_else(|err| err.into_inner())
                .clone(),
        }
    }

    pub async fn call_tool(&self, name: &str, arguments: Value) -> Result<String, String> {
        let mut session = self.session.lock().await;
        let session = session.as_mut().ok_or("MCP 还没有连上")?;
        let result = session
            .request(
                "tools/call",
                json!({ "name": name, "arguments": arguments }),
            )
            .await?;
        if result["isError"].as_bool().unwrap_or(false) {
            return Err(tool_text(&result));
        }
        Ok(tool_text(&result))
    }
}

pub async fn connect(manager: &Mutex<McpManager>, config: McpServerDto, http: reqwest::Client) -> Result<(), String> {
    let server = {
        let mut guard = manager.lock().map_err(|err| err.to_string())?;
        let server = guard
            .servers
            .entry(config.id.clone())
            .or_insert_with(|| LiveServer::new(config.id.clone()))
            .clone();
        server
    };
    *server.connecting.lock().map_err(|err| err.to_string())? = true;
    *server.last_error.lock().map_err(|err| err.to_string())? = None;
    let connected = connect_session(&config, http).await;
    *server.connecting.lock().map_err(|err| err.to_string())? = false;
    match connected {
        Ok((session, tools)) => {
            *server.tools.lock().map_err(|err| err.to_string())? = tools;
            *server.session.lock().await = Some(session);
            Ok(())
        }
        Err(err) => {
            *server.last_error.lock().map_err(|err| err.to_string())? = Some(err.clone());
            *server.session.lock().await = None;
            Err(err)
        }
    }
}

async fn connect_session(config: &McpServerDto, http: reqwest::Client) -> Result<(Session, Vec<McpTool>), String> {
    let mut session = match config.transport.as_str() {
        "http" => http_session(&config.url, http)?,
        _ => stdio_session(config).await?,
    };
    let _init = session
        .request(
            "initialize",
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": { "tools": {} },
                "clientInfo": { "name": "Amage", "version": "1.0.0" }
            }),
        )
        .await
        .map_err(|err| annotate_stdio(&session, err))?;
    session.notify("notifications/initialized", json!({})).await?;
    let mut tools = Vec::new();
    let mut cursor: Option<String> = None;
    for _ in 0..10 {
        let params = match &cursor {
            Some(value) => json!({ "cursor": value }),
            None => json!({}),
        };
        let page = session.request("tools/list", params).await?;
        if let Some(list) = page["tools"].as_array() {
            for tool in list {
                let Some(name) = tool["name"].as_str() else { continue };
                tools.push(McpTool {
                    name: name.to_string(),
                    description: tool["description"].as_str().unwrap_or("").chars().take(1000).collect(),
                    schema: tool
                        .get("inputSchema")
                        .cloned()
                        .unwrap_or_else(|| json!({ "type": "object", "properties": {} })),
                });
            }
        }
        cursor = page["nextCursor"].as_str().map(str::to_string);
        if cursor.is_none() {
            break;
        }
    }
    Ok((session, tools))
}

fn annotate_stdio(session: &Session, err: String) -> String {
    let Transport::Stdio { stderr, .. } = &session.transport else {
        return err;
    };
    let extra = stderr.lock().map(|text| text.clone()).unwrap_or_default();
    if extra.trim().is_empty() {
        err
    } else {
        let tail: String = extra.chars().rev().take(500).collect::<String>().chars().rev().collect();
        format!("{err}\n{tail}")
    }
}

fn http_session(url: &str, client: reqwest::Client) -> Result<Session, String> {
    let url = url.trim().to_string();
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("MCP 地址需要以 http:// 或 https:// 开头".into());
    }
    Ok(Session {
        transport: Transport::Http {
            url,
            session: None,
            client,
        },
        shared: Arc::new(Mutex::new(SharedIo { pending: HashMap::new() })),
        next_id: 1,
    })
}

async fn stdio_session(config: &McpServerDto) -> Result<Session, String> {
    if config.command.trim().is_empty() {
        return Err("先填写 MCP 命令".into());
    }
    let mut command = Command::new(config.command.trim());
    command
        .args(&config.args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    for (key, value) in parse_env(&config.env) {
        command.env(key, value);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command.spawn().map_err(|err| format!("无法启动 MCP：{err}"))?;
    let stdout = child.stdout.take().ok_or("MCP 没有标准输出")?;
    let stderr = child.stderr.take().ok_or("MCP 没有错误输出")?;
    let stdin = child.stdin.take().ok_or("MCP 没有标准输入")?;
    let shared = Arc::new(Mutex::new(SharedIo { pending: HashMap::new() }));
    let stderr_log = Arc::new(Mutex::new(String::new()));
    spawn_stderr(stderr, stderr_log.clone());
    spawn_stdout(stdout, shared.clone());
    Ok(Session {
        transport: Transport::Stdio {
            child,
            stdin,
            stderr: stderr_log,
        },
        shared,
        next_id: 1,
    })
}

fn spawn_stderr(mut stderr: tokio::process::ChildStderr, slot: Arc<Mutex<String>>) {
    tokio::spawn(async move {
        let mut buf = [0u8; 1024];
        loop {
            let read = stderr.read(&mut buf).await.unwrap_or(0);
            if read == 0 {
                break;
            }
            if let Ok(mut text) = slot.lock() {
                text.push_str(&String::from_utf8_lossy(&buf[..read]));
                if text.len() > 4000 {
                    let drain = text.len() - 4000;
                    text.drain(..drain);
                }
            }
        }
    });
}

fn spawn_stdout(mut stdout: tokio::process::ChildStdout, shared: Arc<Mutex<SharedIo>>) {
    tokio::spawn(async move {
        let mut buf = Vec::new();
        let mut tmp = [0u8; 8192];
        loop {
            let read = stdout.read(&mut tmp).await.unwrap_or(0);
            if read == 0 {
                break;
            }
            buf.extend_from_slice(&tmp[..read]);
            while let Some((value, consumed)) = try_take_frame(&buf) {
                buf.drain(..consumed);
                dispatch(&shared, value);
            }
            if buf.len() > 8_000_000 {
                break;
            }
        }
        fail_pending(&shared, "MCP 进程已退出");
    });
}

fn dispatch(shared: &Mutex<SharedIo>, value: Value) {
    let Some(id) = value.get("id").and_then(Value::as_i64) else {
        return;
    };
    let Ok(mut io) = shared.lock() else { return };
    let Some(sender) = io.pending.remove(&id) else { return };
    if let Some(error) = value.get("error") {
        let message = error["message"].as_str().unwrap_or("MCP 返回错误").to_string();
        let _ = sender.send(Err(message));
    } else {
        let _ = sender.send(Ok(value.get("result").cloned().unwrap_or(Value::Null)));
    }
}

fn fail_pending(shared: &Mutex<SharedIo>, message: &str) {
    if let Ok(mut io) = shared.lock() {
        for (_, sender) in io.pending.drain() {
            let _ = sender.send(Err(message.to_string()));
        }
    }
}

impl Session {
    async fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        let body = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        });
        let rx = self.send(id, &body).await?;
        match tokio::time::timeout(Duration::from_secs(40), rx).await {
            Ok(Ok(Ok(value))) => Ok(value),
            Ok(Ok(Err(err))) => Err(err),
            Ok(Err(_)) => Err("MCP 连接已关闭".into()),
            Err(_) => {
                if let Ok(mut io) = self.shared.lock() {
                    io.pending.remove(&id);
                }
                Err("MCP 响应超时".into())
            }
        }
    }

    async fn notify(&mut self, method: &str, params: Value) -> Result<(), String> {
        let body = json!({ "jsonrpc": "2.0", "method": method, "params": params });
        self.write(&body).await
    }

    async fn send(&mut self, id: i64, body: &Value) -> Result<oneshot::Receiver<Result<Value, String>>, String> {
        let (tx, rx) = oneshot::channel();
        {
            let mut io = self.shared.lock().map_err(|err| err.to_string())?;
            io.pending.insert(id, tx);
        }
        if let Err(err) = self.write(body).await {
            if let Ok(mut io) = self.shared.lock() {
                io.pending.remove(&id);
            }
            return Err(err);
        }
        Ok(rx)
    }

    async fn write(&mut self, body: &Value) -> Result<(), String> {
        match &mut self.transport {
            Transport::Stdio { stdin, .. } => {
                let mut data = serde_json::to_vec(body).map_err(|err| err.to_string())?;
                data.push(b'\n');
                stdin.write_all(&data).await.map_err(|err| err.to_string())?;
                stdin.flush().await.map_err(|err| err.to_string())?;
                Ok(())
            }
            Transport::Http { url, session, client } => {
                let mut request = client
                    .post(url.as_str())
                    .header("content-type", "application/json")
                    .header("accept", "application/json, text/event-stream")
                    .header("mcp-protocol-version", "2024-11-05")
                    .json(body);
                if let Some(session_id) = session.as_deref() {
                    request = request.header("mcp-session-id", session_id.to_string());
                }
                let response = request.send().await.map_err(|err| format!("MCP 请求失败：{err}"))?;
                if let Some(value) = response
                    .headers()
                    .get("mcp-session-id")
                    .and_then(|value| value.to_str().ok())
                {
                    *session = Some(value.to_string());
                }
                let status = response.status();
                let text = response.text().await.map_err(|err| err.to_string())?;
                if !status.is_success() {
                    return Err(format!("MCP 返回 {}：{text}", status.as_u16()));
                }
                let value = parse_http_body(&text)?;
                dispatch(&self.shared, value);
                Ok(())
            }
        }
    }
}

fn parse_http_body(text: &str) -> Result<Value, String> {
    if let Ok(value) = serde_json::from_str::<Value>(text) {
        return Ok(value);
    }
    for line in text.lines() {
        let Some(data) = line.trim().strip_prefix("data:") else { continue };
        if let Ok(value) = serde_json::from_str::<Value>(data.trim()) {
            return Ok(value);
        }
    }
    Err("MCP 没有返回可识别的 JSON".into())
}

fn tool_text(result: &Value) -> String {
    if let Some(list) = result["content"].as_array() {
        let mut parts = Vec::new();
        for item in list {
            if let Some(text) = item["text"].as_str() {
                parts.push(text.to_string());
            }
        }
        if !parts.is_empty() {
            let joined = parts.join("\n");
            return joined.chars().take(12_000).collect();
        }
    }
    result.to_string().chars().take(12_000).collect()
}

fn parse_env(raw: &str) -> Vec<(String, String)> {
    raw.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (key, value) = line.split_once('=')?;
            let key = key.trim();
            if key.is_empty() {
                return None;
            }
            Some((key.to_string(), value.trim().to_string()))
        })
        .collect()
}

fn short_id(id: &str) -> String {
    id.chars().filter(|ch| ch.is_ascii_alphanumeric()).take(6).collect()
}

fn sanitize_name(name: &str) -> String {
    let mut out = String::new();
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() { "tool".into() } else { out }
}

fn try_take_frame(buffer: &[u8]) -> Option<(Value, usize)> {
    let start = buffer.iter().position(|byte| !byte.is_ascii_whitespace())?;
    let rest = &buffer[start..];
    if rest.len() >= 14 && rest[..14].eq_ignore_ascii_case(b"Content-Length") {
        let header_end = find_subsequence(rest, b"\r\n\r\n")?;
        let header = std::str::from_utf8(&rest[..header_end]).ok()?;
        let length = header.lines().find_map(|line| {
            let (name, value) = line.split_once(':')?;
            if name.eq_ignore_ascii_case("Content-Length") {
                value.trim().parse::<usize>().ok()
            } else {
                None
            }
        })?;
        let body_start = start + header_end + 4;
        let body_end = body_start + length;
        if buffer.len() < body_end {
            return None;
        }
        let value = serde_json::from_slice(&buffer[body_start..body_end]).ok()?;
        return Some((value, body_end));
    }
    let mut deserializer = serde_json::Deserializer::from_slice(rest).into_iter::<Value>();
    match deserializer.next() {
        Some(Ok(value)) => Some((value, start + deserializer.byte_offset())),
        _ => None,
    }
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|window| window == needle)
}

#[cfg(test)]
mod tests {
    use super::try_take_frame;

    #[test]
    fn reads_newline_json_and_content_length_frames() {
        let (value, consumed) = try_take_frame(br#"{"jsonrpc":"2.0","id":1,"result":{"ok":true}}"#).unwrap();
        assert_eq!(value["id"], 1);
        assert!(consumed > 10);
        let body = br#"{"jsonrpc":"2.0"}"#;
        let framed = format!("Content-Length: {}\r\n\r\n{}", body.len(), std::str::from_utf8(body).unwrap());
        let (value, consumed) = try_take_frame(framed.as_bytes()).unwrap();
        assert_eq!(consumed, framed.len());
        assert_eq!(value["jsonrpc"], "2.0");
    }
}
