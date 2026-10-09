use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const DEFAULT_PROMPT: &str = "你是 Amage，驻留在这台电脑上的对话与图像助手。用用户正在使用的语言回答，默认中文。需要外部资料或本机能力时，调用已经连接的工具。不要编造工具没有返回的结果。";

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn open(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    migrate(&conn)?;
    seed(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            role TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            images TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'complete',
            error TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conversation
            ON messages(conversation_id, created_at);
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS system_prompts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            content TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS skills (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            content TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS mcp_servers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            transport TEXT NOT NULL,
            command TEXT NOT NULL DEFAULT '',
            args TEXT NOT NULL DEFAULT '[]',
            env TEXT NOT NULL DEFAULT '',
            url TEXT NOT NULL DEFAULT '',
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS gallery (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            width INTEGER NOT NULL,
            height INTEGER NOT NULL,
            bytes INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_gallery_created ON gallery(created_at);
        ",
    )
    .map_err(|e| e.to_string())
}

fn seed(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM system_prompts", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if count == 0 {
        conn.execute(
            "INSERT INTO system_prompts (id, name, content, active, created_at) VALUES (?1, ?2, ?3, 1, ?4)",
            params!["default", "默认", DEFAULT_PROMPT, now_ms()],
        )
        .map_err(|e| e.to_string())?;
    }
    if get_setting(conn, "cache_limit_gb")?.is_none() {
        set_setting(conn, "cache_limit_gb", "5")?;
    }
    if get_setting(conn, "history_retention")?.is_none() {
        set_setting(conn, "history_retention", "never")?;
    }
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![key]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        Ok(Some(row.get(0).map_err(|e| e.to_string())?))
    } else {
        Ok(None)
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsDto {
    pub base_url: String,
    pub api_key: String,
    pub chat_model: String,
    pub image_model: String,
    pub cache_limit_gb: i64,
    pub history_retention: String,
}

pub fn load_settings(conn: &Connection) -> Result<SettingsDto, String> {
    Ok(SettingsDto {
        base_url: get_setting(conn, "base_url")?.unwrap_or_default(),
        api_key: get_setting(conn, "api_key")?.unwrap_or_default(),
        chat_model: get_setting(conn, "chat_model")?.unwrap_or_default(),
        image_model: get_setting(conn, "image_model")?.unwrap_or_default(),
        cache_limit_gb: cache_limit_gb(conn)?,
        history_retention: history_retention(conn)?,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn list_conversations(conn: &Connection) -> Result<Vec<Conversation>, String> {
    let mut stmt = conn
        .prepare("SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Conversation {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn create_conversation(conn: &Connection, id: &str, title: &str) -> Result<Conversation, String> {
    let now = now_ms();
    conn.execute(
        "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        params![id, title, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(Conversation {
        id: id.to_string(),
        title: title.to_string(),
        created_at: now,
        updated_at: now,
    })
}

pub fn touch_conversation(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
        params![now_ms(), id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Deletes the conversation and its messages. Gallery rows and image files stay.
pub fn delete_conversation(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM conversations WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageDto {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub images: Vec<String>,
    pub status: String,
    pub error: Option<String>,
    pub created_at: i64,
}

fn decode_images(raw: String) -> Vec<String> {
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn list_messages(conn: &Connection, conversation_id: &str) -> Result<Vec<MessageDto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, conversation_id, role, content, images, status, error, created_at
             FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![conversation_id], |row| {
            Ok(MessageDto {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                images: decode_images(row.get(4)?),
                status: row.get(5)?,
                error: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn insert_message(
    conn: &Connection,
    message: &MessageDto,
) -> Result<(), String> {
    let images = serde_json::to_string(&message.images).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO messages (id, conversation_id, role, content, images, status, error, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            message.id,
            message.conversation_id,
            message.role,
            message.content,
            images,
            message.status,
            message.error,
            message.created_at
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_message(
    conn: &Connection,
    id: &str,
    content: &str,
    images: &[String],
    status: &str,
    error: Option<&str>,
) -> Result<(), String> {
    let images = serde_json::to_string(images).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE messages SET content = ?1, images = ?2, status = ?3, error = ?4 WHERE id = ?5",
        params![content, images, status, error, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_message(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM messages WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptDto {
    pub id: String,
    pub name: String,
    pub content: String,
    pub active: bool,
    pub created_at: i64,
}

pub fn list_prompts(conn: &Connection) -> Result<Vec<PromptDto>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, content, active, created_at FROM system_prompts ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(PromptDto {
                id: row.get(0)?,
                name: row.get(1)?,
                content: row.get(2)?,
                active: row.get::<_, i64>(3)? == 1,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn active_prompt(conn: &Connection) -> Result<String, String> {
    let value: Option<String> = conn
        .query_row(
            "SELECT content FROM system_prompts WHERE active = 1 ORDER BY created_at DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();
    Ok(value.unwrap_or_else(|| DEFAULT_PROMPT.to_string()))
}

pub fn create_prompt(conn: &Connection, id: &str, name: &str, content: &str) -> Result<PromptDto, String> {
    let now = now_ms();
    conn.execute(
        "INSERT INTO system_prompts (id, name, content, active, created_at) VALUES (?1, ?2, ?3, 0, ?4)",
        params![id, name, content, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(PromptDto {
        id: id.to_string(),
        name: name.to_string(),
        content: content.to_string(),
        active: false,
        created_at: now,
    })
}

pub fn update_prompt(conn: &Connection, id: &str, name: &str, content: &str) -> Result<(), String> {
    let changed = conn
        .execute(
            "UPDATE system_prompts SET name = ?1, content = ?2 WHERE id = ?3",
            params![name, content, id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("没有找到这条提示词".into());
    }
    Ok(())
}

pub fn delete_prompt(conn: &Connection, id: &str) -> Result<(), String> {
    let active: i64 = conn
        .query_row(
            "SELECT active FROM system_prompts WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    conn.execute("DELETE FROM system_prompts WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if active == 1 {
        let next: Option<String> = conn
            .query_row(
                "SELECT id FROM system_prompts ORDER BY created_at DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .ok();
        if let Some(next_id) = next {
            set_active_prompt(conn, &next_id)?;
        }
    }
    Ok(())
}

pub fn set_active_prompt(conn: &Connection, id: &str) -> Result<(), String> {
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM system_prompts WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if exists == 0 {
        return Err("没有找到这条提示词".into());
    }
    conn.execute(
        "UPDATE system_prompts SET active = CASE WHEN id = ?1 THEN 1 ELSE 0 END",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDto {
    pub id: String,
    pub name: String,
    pub content: String,
    pub enabled: bool,
    pub created_at: i64,
}

pub fn list_skills(conn: &Connection) -> Result<Vec<SkillDto>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, content, enabled, created_at FROM skills ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SkillDto {
                id: row.get(0)?,
                name: row.get(1)?,
                content: row.get(2)?,
                enabled: row.get::<_, i64>(3)? == 1,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn enabled_skills(conn: &Connection) -> Result<Vec<(String, String)>, String> {
    let mut stmt = conn
        .prepare("SELECT name, content FROM skills WHERE enabled = 1 ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn create_skill(conn: &Connection, id: &str, name: &str, content: &str) -> Result<SkillDto, String> {
    let now = now_ms();
    conn.execute(
        "INSERT INTO skills (id, name, content, enabled, created_at) VALUES (?1, ?2, ?3, 1, ?4)",
        params![id, name, content, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(SkillDto {
        id: id.to_string(),
        name: name.to_string(),
        content: content.to_string(),
        enabled: true,
        created_at: now,
    })
}

pub fn set_skill_enabled(conn: &Connection, id: &str, enabled: bool) -> Result<(), String> {
    let changed = conn
        .execute(
            "UPDATE skills SET enabled = ?1 WHERE id = ?2",
            params![if enabled { 1 } else { 0 }, id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("没有找到这个技能".into());
    }
    Ok(())
}

pub fn delete_skill(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM skills WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerDto {
    pub id: String,
    pub name: String,
    pub transport: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: String,
    pub url: String,
    pub enabled: bool,
    pub created_at: i64,
}

fn map_server(row: &rusqlite::Row<'_>) -> rusqlite::Result<McpServerDto> {
    let args: String = row.get(4)?;
    Ok(McpServerDto {
        id: row.get(0)?,
        name: row.get(1)?,
        transport: row.get(2)?,
        command: row.get(3)?,
        args: serde_json::from_str(&args).unwrap_or_default(),
        env: row.get(5)?,
        url: row.get(6)?,
        enabled: row.get::<_, i64>(7)? == 1,
        created_at: row.get(8)?,
    })
}

pub fn list_mcp(conn: &Connection) -> Result<Vec<McpServerDto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, transport, command, args, env, url, enabled, created_at
             FROM mcp_servers ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_server).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_mcp(conn: &Connection, id: &str) -> Result<Option<McpServerDto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, transport, command, args, env, url, enabled, created_at
             FROM mcp_servers WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![id]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        map_server(row).map(Some).map_err(|e| e.to_string())
    } else {
        Ok(None)
    }
}

pub fn upsert_mcp(conn: &Connection, server: &McpServerDto) -> Result<(), String> {
    let args = serde_json::to_string(&server.args).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO mcp_servers (id, name, transport, command, args, env, url, enabled, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            transport = excluded.transport,
            command = excluded.command,
            args = excluded.args,
            env = excluded.env,
            url = excluded.url,
            enabled = excluded.enabled",
        params![
            server.id,
            server.name,
            server.transport,
            server.command,
            args,
            server.env,
            server.url,
            if server.enabled { 1 } else { 0 },
            server.created_at
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_mcp_enabled(conn: &Connection, id: &str, enabled: bool) -> Result<(), String> {
    let changed = conn
        .execute(
            "UPDATE mcp_servers SET enabled = ?1 WHERE id = ?2",
            params![if enabled { 1 } else { 0 }, id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("没有找到这个 MCP".into());
    }
    Ok(())
}

pub fn delete_mcp(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM mcp_servers WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryItem {
    pub id: String,
    pub path: String,
    pub width: i64,
    pub height: i64,
    pub bytes: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsage {
    pub bytes: i64,
    pub limit_bytes: i64,
}

pub fn remember_generated(conn: &Connection, path: &str, width: i64, height: i64, bytes: i64) -> Result<(), String> {
    conn.execute(
        "INSERT INTO gallery (id, path, width, height, bytes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![Uuid::new_v4().to_string(), path, width.max(1), height.max(1), bytes.max(0), now_ms()],
    )
    .map_err(|e| e.to_string())?;
    enforce_cache(conn)
}

pub fn list_gallery(conn: &Connection) -> Result<Vec<GalleryItem>, String> {
    let mut stmt = conn
        .prepare("SELECT id, path, width, height, bytes, created_at FROM gallery ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(GalleryItem {
                id: row.get(0)?,
                path: row.get(1)?,
                width: row.get(2)?,
                height: row.get(3)?,
                bytes: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn storage_usage(conn: &Connection) -> Result<StorageUsage, String> {
    Ok(StorageUsage {
        bytes: gallery_bytes(conn)?,
        limit_bytes: cache_limit_gb(conn)?.saturating_mul(1024 * 1024 * 1024),
    })
}

pub fn save_storage(conn: &Connection, gigabytes: i64, retention: &str) -> Result<(), String> {
    let gigabytes = gigabytes.clamp(1, 10);
    let retention = match retention {
        "never" | "days7" | "days30" | "unlimited" => retention,
        _ => "never",
    };
    set_setting(conn, "cache_limit_gb", &gigabytes.to_string())?;
    set_setting(conn, "history_retention", retention)?;
    purge_old_conversations(conn)?;
    enforce_cache(conn)
}

pub fn purge_old_conversations(conn: &Connection) -> Result<(), String> {
    let days = match history_retention(conn)?.as_str() {
        "days7" => 7,
        "days30" => 30,
        _ => return Ok(()),
    };
    let cutoff = now_ms() - days * 24 * 60 * 60 * 1000;
    conn.execute("DELETE FROM conversations WHERE updated_at < ?1", params![cutoff])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn enforce_cache(conn: &Connection) -> Result<(), String> {
    let limit = cache_limit_gb(conn)?.saturating_mul(1024 * 1024 * 1024);
    for _ in 0..10_000 {
        if gallery_bytes(conn)? <= limit {
            return Ok(());
        }
        let oldest = conn
            .query_row(
                "SELECT id, path FROM gallery ORDER BY created_at ASC, id ASC LIMIT 1",
                [],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some((id, path)) = oldest else {
            return Ok(());
        };
        let _ = std::fs::remove_file(path);
        conn.execute("DELETE FROM gallery WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn gallery_bytes(conn: &Connection) -> Result<i64, String> {
    conn.query_row("SELECT COALESCE(SUM(bytes), 0) FROM gallery", [], |row| row.get(0))
        .map_err(|e| e.to_string())
}

fn cache_limit_gb(conn: &Connection) -> Result<i64, String> {
    let parsed = get_setting(conn, "cache_limit_gb")?
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(5);
    Ok(parsed.clamp(1, 10))
}

fn history_retention(conn: &Connection) -> Result<String, String> {
    let value = get_setting(conn, "history_retention")?.unwrap_or_else(|| "never".into());
    Ok(match value.as_str() {
        "days7" | "days30" | "unlimited" => value,
        _ => "never".into(),
    })
}

pub fn title_from(content: &str) -> String {
    let flat = content.trim().replace(['\n', '\r'], " ");
    let count = flat.chars().count();
    if count == 0 {
        return "图片对话".into();
    }
    let clipped: String = flat.chars().take(28).collect();
    if count > 28 {
        format!("{clipped}…")
    } else {
        clipped
    }
}
