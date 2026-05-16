mod api;
mod db;
mod realtime;

use tauri::{
    Emitter,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

const CREDENTIAL_SERVICE: &str = "chatter3";
const TOKEN_CREDENTIAL_USER: &str = "jwt";

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.emit("desktop://window-visible", true);
    }
}

fn token_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(CREDENTIAL_SERVICE, TOKEN_CREDENTIAL_USER)
        .map_err(|error| format!("failed to open system credential store: {error}"))
}

#[tauri::command]
fn save_desktop_token(token: String) -> Result<(), String> {
    token_entry()?
        .set_password(&token)
        .map_err(|error| format!("failed to save token to system credential store: {error}"))
}

#[tauri::command]
fn load_desktop_token() -> Result<Option<String>, String> {
    match token_entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!(
            "failed to load token from system credential store: {error}"
        )),
    }
}

#[tauri::command]
fn clear_desktop_token() -> Result<(), String> {
    match token_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "failed to clear token from system credential store: {error}"
        )),
    }
}

pub fn run() {
    // HTTP API base URL: default to localhost:8080 for Tauri production,
    // overridable via CHATTER_API_URL env var.
    let api_base_url = std::env::var("CHATTER_API_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8080".to_string());
    let http_client = api::new_http_client(api_base_url);
    let realtime_handle = realtime::RealtimeHandle::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(std::sync::Mutex::new(http_client))
        .manage(realtime_handle)
        .invoke_handler(tauri::generate_handler![
            save_desktop_token,
            load_desktop_token,
            clear_desktop_token,
            db::db_insert_message,
            db::db_get_messages,
            db::db_confirm_message,
            db::db_update_message_status,
            db::db_upsert_conversation,
            db::db_get_conversations,
            db::db_update_unread_count,
            api::api_login,
            api::api_register,
            api::api_get_online_users,
            api::api_get_public_history,
            api::api_get_private_history,
            api::api_create_group,
            api::api_list_groups,
            api::api_get_group,
            api::api_get_group_members,
            api::api_add_group_members,
            api::api_remove_group_member,
            api::api_get_group_history,
            api::api_upload_file,
            realtime::realtime_connect,
            realtime::realtime_disconnect,
            realtime::realtime_send,
        ])
        .setup(|app| {
            // SQLite
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("app data directory must be available");
            let db_conn = db::open_or_create(app_data_dir)
                .expect("failed to initialize local chat database");
            app.manage(db_conn);

            // System tray
            let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let reconnect_item =
                MenuItem::with_id(app, "reconnect", "Reconnect", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &reconnect_item, &quit_item])?;

            let icon = app
                .default_window_icon()
                .cloned()
                .expect("Tauri window icon must be configured in tauri.conf.json");
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "reconnect" => {
                        show_main_window(app);
                        let _ = app.emit("desktop://reconnect", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // Close → hide to tray
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.emit("desktop://window-visible", false);
                        let _ = window_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
