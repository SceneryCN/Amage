use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::chat::{self, SendInput};
use crate::db::{self, McpServerDto, PromptDto, SettingsDto, SkillDto};
use crate::mcp::{self, McpStatus};
use crate::openai;
use crate::AppState;

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<SettingsDto, String> {
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::load_settings(&conn)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSettings {
    base_url: String,
    api_key: String,
    chat_model: String,
    image_model: String,
}

#[tauri::command]
pub fn save_settings(state: State<AppState>, input: SaveSettings) -> Result<SettingsDto, String> {
    let base_url = if input.base_url.trim().is_empty() {
        String::new()
    } else {
        openai::normalize_base(&input.base_url)?
    };
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::set_setting(&conn, "base_url", &base_url)?;
    db::set_setting(&conn, "api_key", input.api_key.trim())?;
    db::set_setting(&conn, "chat_model", input.chat_model.trim())?;
    db::set_setting(&conn, "image_model", input.image_model.trim())?;
    db::load_settings(&conn)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInput {
    base_url: String,
    api_key: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionResult {
    message: String,
    models: Vec<String>,
}

/// `None` means the service answered but has no `/models` endpoint.
async fn fetch_models(http: &reqwest::Client, input: &ConnectionInput) -> Result<Option<Vec<String>>, String> {
    let base = openai::normalize_base(&input.base_url)?;
    if input.api_key.trim().is_empty() {
        return Err("先填写密钥".into());
    }
    let response = http
        .get(format!("{base}/models"))
        .bearer_auth(input.api_key.trim())
        .header("user-agent", "Amage/0.1")
        .send()
        .await
        .map_err(|err| format!("连不上这个地址：{err}"))?;
    let status = response.status();
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err("密钥被拒绝".into());
    }
    if status.as_u16() == 404 {
        return Ok(None);
    }
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(openai::api_error(status, &body));
    }
    openai::parse_models(&body).map(Some)
}

#[tauri::command]
pub async fn test_connection(state: State<'_, AppState>, input: ConnectionInput) -> Result<ConnectionResult, String> {
    match fetch_models(&state.http, &input).await? {
        Some(models) => Ok(ConnectionResult {
            message: format!("已连通，读到 {} 个模型", models.len()),
            models,
        }),
        None => Ok(ConnectionResult {
            message: "地址有响应，但没有 /models。可以手动填写模型名。".into(),
            models: Vec::new(),
        }),
    }
}

#[tauri::command]
pub async fn list_models(state: State<'_, AppState>, input: ConnectionInput) -> Result<Vec<String>, String> {
    Ok(fetch_models(&state.http, &input).await?.unwrap_or_default())
}

#[tauri::command]
pub fn list_prompts(state: State<AppState>) -> Result<Vec<PromptDto>, String> {
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::list_prompts(&conn)
}

#[derive(Deserialize)]
pub struct NamedText {
    name: String,
    content: String,
}

#[tauri::command]
pub fn create_prompt(state: State<AppState>, input: NamedText) -> Result<PromptDto, String> {
    validate_named(&input.name, &input.content, 20_000)?;
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::create_prompt(&conn, &Uuid::new_v4().to_string(), input.name.trim(), input.content.trim())
}

#[derive(Deserialize)]
pub struct UpdatePrompt {
    id: String,
    name: String,
    content: String,
}

#[tauri::command]
pub fn update_prompt(state: State<AppState>, input: UpdatePrompt) -> Result<(), String> {
    validate_named(&input.name, &input.content, 20_000)?;
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::update_prompt(&conn, &input.id, input.name.trim(), input.content.trim())
}

#[tauri::command]
pub fn delete_prompt(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::delete_prompt(&conn, &id)
}

#[tauri::command]
pub fn activate_prompt(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::set_active_prompt(&conn, &id)
}

#[tauri::command]
pub fn list_skills(state: State<AppState>) -> Result<Vec<SkillDto>, String> {
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::list_skills(&conn)
}

#[tauri::command]
pub fn create_skill(state: State<AppState>, input: NamedText) -> Result<SkillDto, String> {
    validate_named(&input.name, &input.content, 100_000)?;
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::create_skill(&conn, &Uuid::new_v4().to_string(), input.name.trim(), input.content.trim())
}

#[tauri::command]
pub fn update_skill(state: State<AppState>, input: UpdatePrompt) -> Result<(), String> {
    validate_named(&input.name, &input.content, 100_000)?;
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::update_skill(&conn, &input.id, input.name.trim(), input.content.trim())
}

#[derive(Deserialize)]
pub struct SkillToggle {
    id: String,
    enabled: bool,
}

#[tauri::command]
pub fn set_skill_enabled(state: State<AppState>, input: SkillToggle) -> Result<(), String> {
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::set_skill_enabled(&conn, &input.id, input.enabled)
}

#[tauri::command]
pub fn delete_skill(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::delete_skill(&conn, &id)
}

#[tauri::command]
pub fn list_mcp(state: State<AppState>) -> Result<Vec<McpServerDto>, String> {
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::list_mcp(&conn)
}

#[tauri::command]
pub fn mcp_status(state: State<AppState>) -> Result<Vec<McpStatus>, String> {
    let manager = state.mcp.lock().map_err(|err| err.to_string())?;
    Ok(manager.status_list())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpInput {
    id: Option<String>,
    name: String,
    transport: String,
    command: String,
    args: Vec<String>,
    env: String,
    url: String,
    enabled: bool,
}

#[tauri::command]
pub fn save_mcp(state: State<AppState>, input: McpInput) -> Result<McpServerDto, String> {
    if input.name.trim().is_empty() {
        return Err("给这个 MCP 起个名字".into());
    }
    if input.transport == "http" {
        if !(input.url.trim().starts_with("http://") || input.url.trim().starts_with("https://")) {
            return Err("MCP 地址需要以 http:// 或 https:// 开头".into());
        }
    } else if input.command.trim().is_empty() {
        return Err("先填写要启动的命令".into());
    }
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let created_at = db::get_mcp(&conn, &id)?.map(|server| server.created_at).unwrap_or_else(db::now_ms);
    let server = McpServerDto {
        id,
        name: input.name.trim().to_string(),
        transport: if input.transport == "http" { "http".into() } else { "stdio".into() },
        command: input.command.trim().to_string(),
        args: input.args.into_iter().map(|arg| arg.trim().to_string()).filter(|arg| !arg.is_empty()).collect(),
        env: input.env,
        url: input.url.trim().to_string(),
        enabled: input.enabled,
        created_at,
    };
    db::upsert_mcp(&conn, &server)?;
    Ok(server)
}

#[tauri::command]
pub async fn connect_mcp(app: AppHandle, id: String) -> Result<McpStatus, String> {
    let config = {
        let state = app.state::<AppState>();
        let conn = state.db.lock().map_err(|err| err.to_string())?;
        db::get_mcp(&conn, &id)?.ok_or("没有找到这个 MCP")?
    };
    let state = app.state::<AppState>();
    let http = state.http.clone();
    mcp::connect(&state.mcp, config, http).await?;
    let server = {
        let manager = state.mcp.lock().map_err(|err| err.to_string())?;
        match manager.get(&id) {
            Some(server) => server,
            None => return Err("连接状态丢失".into()),
        }
    };
    let status = server.status();
    let _ = app.emit("mcp-status", &status);
    Ok(status)
}

#[tauri::command]
pub fn disconnect_mcp(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    state.mcp.lock().map_err(|err| err.to_string())?.disconnect(&id);
    let _ = app.emit(
        "mcp-status",
        McpStatus {
            id,
            connected: false,
            connecting: false,
            tool_count: 0,
            tools: Vec::new(),
            error: None,
        },
    );
    Ok(())
}

#[derive(Deserialize)]
pub struct McpToggle {
    id: String,
    enabled: bool,
}

#[tauri::command]
pub fn set_mcp_enabled(app: AppHandle, input: McpToggle) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let conn = state.db.lock().map_err(|err| err.to_string())?;
        db::set_mcp_enabled(&conn, &input.id, input.enabled)?;
    }
    if !input.enabled {
        state.mcp.lock().map_err(|err| err.to_string())?.disconnect(&input.id);
    }
    Ok(())
}

#[tauri::command]
pub fn delete_mcp(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let conn = state.db.lock().map_err(|err| err.to_string())?;
        db::delete_mcp(&conn, &id)?;
    }
    state.mcp.lock().map_err(|err| err.to_string())?.disconnect(&id);
    Ok(())
}

#[tauri::command]
pub fn list_conversations(state: State<AppState>) -> Result<Vec<db::Conversation>, String> {
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::list_conversations(&conn)
}

#[tauri::command]
pub fn delete_conversation(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::delete_conversation(&conn, &id)
}

#[tauri::command]
pub fn list_messages(state: State<AppState>, conversation_id: String) -> Result<Vec<db::MessageDto>, String> {
    let running = state
        .runs
        .lock()
        .map_err(|err| err.to_string())?
        .contains_key(&conversation_id);
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    if !running {
        let existing = db::list_messages(&conn, &conversation_id)?;
        for message in &existing {
            if message.status == "streaming" {
                db::update_message(&conn, &message.id, &message.content, &message.images, "cancelled", None)?;
            }
        }
    }
    db::list_messages(&conn, &conversation_id)
}

#[tauri::command]
pub fn send_message(app: AppHandle, input: SendInput) -> Result<chat::SendStarted, String> {
    chat::send(&app, input)
}

#[tauri::command]
pub fn retry_message(app: AppHandle, conversation_id: String) -> Result<chat::SendStarted, String> {
    chat::retry(&app, conversation_id)
}

#[tauri::command]
pub fn cancel_generation(app: AppHandle, conversation_id: String) {
    chat::cancel(&app, &conversation_id);
}

#[tauri::command]
pub fn list_gallery(state: State<AppState>) -> Result<Vec<db::GalleryItem>, String> {
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::list_gallery(&conn)
}

#[tauri::command]
pub fn storage_usage(state: State<AppState>) -> Result<db::StorageUsage, String> {
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::storage_usage(&conn)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveStorage {
    cache_limit_gb: i64,
    history_retention: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportImage {
    source: String,
    destination: String,
}

#[tauri::command]
pub fn export_image(app: AppHandle, input: ExportImage) -> Result<(), String> {
    let destination = std::path::PathBuf::from(input.destination.trim());
    let parent = destination.parent().filter(|path| !path.as_os_str().is_empty());
    let Some(parent) = parent else {
        return Err("先选择保存位置".into());
    };
    if !parent.exists() {
        return Err("保存位置不存在".into());
    }
    if destination.exists() && !destination.is_file() {
        return Err("保存位置不是文件".into());
    }
    if input.source.starts_with("data:") {
        let bytes = decode_data_url(&input.source)?;
        return std::fs::write(&destination, bytes).map_err(|err| format!("保存图片失败：{err}"));
    }
    let root = chat::images_dir(&app)?.canonicalize().map_err(|err| err.to_string())?;
    let source = std::path::PathBuf::from(&input.source)
        .canonicalize()
        .map_err(|_| "找不到这张图片".to_string())?;
    if !source.starts_with(&root) || !source.is_file() {
        return Err("只能保存应用里的图片".into());
    }
    if destination.canonicalize().ok().as_ref() == Some(&source) {
        return Ok(());
    }
    std::fs::copy(&source, &destination).map(|_| ()).map_err(|err| format!("保存图片失败：{err}"))
}

fn decode_data_url(value: &str) -> Result<Vec<u8>, String> {
    let rest = value.strip_prefix("data:").ok_or("图片数据不完整")?;
    let (meta, data) = rest.split_once(',').ok_or("图片数据不完整")?;
    let bytes = if meta.contains(";base64") {
        base64::engine::general_purpose::STANDARD.decode(data.trim())
            .map_err(|_| "图片数据不完整".to_string())?
    } else {
        percent_decode(data)?
    };
    if bytes.len() > 32 * 1024 * 1024 {
        return Err("图片太大了".into());
    }
    Ok(bytes)
}

fn percent_decode(input: &str) -> Result<Vec<u8>, String> {
    let raw = input.as_bytes();
    let mut out = Vec::with_capacity(raw.len());
    let mut index = 0;
    while index < raw.len() {
        if raw[index] == b'%' && index + 2 < raw.len() {
            let hex = std::str::from_utf8(&raw[index + 1..index + 3]).map_err(|_| "图片数据不完整".to_string())?;
            out.push(u8::from_str_radix(hex, 16).map_err(|_| "图片数据不完整".to_string())?);
            index += 3;
            continue;
        }
        out.push(if raw[index] == b'+' { b' ' } else { raw[index] });
        index += 1;
    }
    Ok(out)
}

#[tauri::command]
pub fn save_storage(state: State<AppState>, input: SaveStorage) -> Result<db::SettingsDto, String> {
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    db::save_storage(&conn, input.cache_limit_gb, &input.history_retention)?;
    db::load_settings(&conn)
}

fn validate_named(name: &str, content: &str, max_chars: usize) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("先写一个名称".into());
    }
    if content.trim().is_empty() {
        return Err("内容是空的".into());
    }
    if content.chars().count() > max_chars {
        return Err("内容太长了".into());
    }
    Ok(())
}

pub fn autoconnect_enabled(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let configs = {
            let state = app.state::<AppState>();
            let Ok(conn) = state.db.lock() else { return };
            db::list_mcp(&conn).unwrap_or_default()
        };
        for config in configs.into_iter().filter(|config| config.enabled) {
            let state = app.state::<AppState>();
            let http = state.http.clone();
            let id = config.id.clone();
            if let Err(err) = mcp::connect(&state.mcp, config, http).await {
                let _ = app.emit(
                    "mcp-status",
                    McpStatus {
                        id,
                        connected: false,
                        connecting: false,
                        tool_count: 0,
                        tools: Vec::new(),
                        error: Some(err),
                    },
                );
            }
        }
    });
}
