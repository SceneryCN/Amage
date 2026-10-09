mod chat;
mod commands;
mod db;
mod mcp;
mod openai;

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::Manager;
use tokio_util::sync::CancellationToken;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub http: reqwest::Client,
    pub mcp: Mutex<mcp::McpManager>,
    pub runs: Mutex<HashMap<String, CancellationToken>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let db_path = app
                .path()
                .app_data_dir()
                .map_err(|err| std::io::Error::other(err.to_string()))?
                .join("amage.sqlite");
            let conn = db::open(&db_path).map_err(|err| std::io::Error::other(err))?;
            let http = reqwest::Client::builder()
                .connect_timeout(std::time::Duration::from_secs(20))
                .timeout(std::time::Duration::from_secs(300))
                .build()
                .map_err(|err| std::io::Error::other(err.to_string()))?;
            app.manage(AppState {
                db: Mutex::new(conn),
                http,
                mcp: Mutex::new(mcp::McpManager::default()),
                runs: Mutex::new(HashMap::new()),
            });
            let state = app.state::<AppState>();
            if let Ok(conn) = state.db.lock() {
                let _ = db::purge_old_conversations(&conn);
                let _ = db::enforce_cache(&conn);
            }
            commands::autoconnect_enabled(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::test_connection,
            commands::list_models,
            commands::list_prompts,
            commands::create_prompt,
            commands::update_prompt,
            commands::delete_prompt,
            commands::activate_prompt,
            commands::list_skills,
            commands::create_skill,
            commands::set_skill_enabled,
            commands::delete_skill,
            commands::list_mcp,
            commands::mcp_status,
            commands::save_mcp,
            commands::connect_mcp,
            commands::disconnect_mcp,
            commands::set_mcp_enabled,
            commands::delete_mcp,
            commands::list_conversations,
            commands::delete_conversation,
            commands::list_messages,
            commands::send_message,
            commands::retry_message,
            commands::cancel_generation,
            commands::list_gallery,
            commands::export_image,
            commands::storage_usage,
            commands::save_storage,
        ])
        .run(tauri::generate_context!())
        .expect("Amage failed to start");
}
