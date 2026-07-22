mod api;
mod db;
mod realtime;

use reqwest::Url;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

const CREDENTIAL_SERVICE: &str = "chatter3";
const TOKEN_CREDENTIAL_USER: &str = "jwt";

#[derive(Clone, serde::Serialize)]
struct RuntimeConfig {
    #[serde(rename = "httpBaseURL")]
    http_base_url: String,
    #[serde(rename = "wsBaseURL")]
    ws_base_url: String,
}

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

fn parse_api_url_from_args() -> Option<String> {
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if let Some(value) = arg.strip_prefix("--api-url=") {
            return Some(value.to_string());
        }
        if arg == "--api-url" {
            return args.next();
        }
    }
    None
}

fn normalize_http_base_url(base_url: &str) -> String {
    base_url.trim_end_matches('/').to_string()
}

fn derive_ws_base_url(http_base_url: &str) -> Result<String, String> {
    let mut url = Url::parse(http_base_url)
        .map_err(|error| format!("invalid api url '{http_base_url}': {error}"))?;
    match url.scheme() {
        "http" => url.set_scheme("ws").expect("valid ws scheme"),
        "https" => url.set_scheme("wss").expect("valid wss scheme"),
        scheme => {
            return Err(format!(
                "unsupported api url scheme '{scheme}', expected http or https"
            ))
        }
    }

    let mut segments = url
        .path_segments_mut()
        .map_err(|_| format!("api url '{http_base_url}' cannot be used as a base path"))?;
    segments.push("api");
    segments.push("v2");
    segments.push("ws");
    drop(segments);

    Ok(url.to_string())
}

fn resolve_runtime_config() -> Result<RuntimeConfig, String> {
    let api_base_url = parse_api_url_from_args()
        .or_else(|| std::env::var("CHATTER_API_URL").ok())
        .unwrap_or_else(|| "http://127.0.0.1:8080".to_string());
    let http_base_url = normalize_http_base_url(&api_base_url);
    let ws_base_url = derive_ws_base_url(&http_base_url)?;

    Ok(RuntimeConfig {
        http_base_url,
        ws_base_url,
    })
}

pub fn run() {
    let runtime_config = resolve_runtime_config().expect("failed to resolve runtime config");
    let http_client = api::new_http_client(runtime_config.http_base_url.clone());
    let realtime_handle = realtime::RealtimeHandle::new();
    let runtime_config_script = format!(
        "window.__CHATTER_RUNTIME_CONFIG__ = Object.freeze({});",
        serde_json::to_string(&runtime_config).expect("runtime config must serialize")
    );

    tauri::Builder::default()
        .append_invoke_initialization_script(runtime_config_script)
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
            api::api_get_user_profile,
            api::api_update_user_profile,
            api::api_get_group_history,
            api::api_upload_file,
            api::api_upload_profile_image,
            api::api_download_file_bytes,
            api::api_save_file,
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
            let db_conn =
                db::open_or_create(app_data_dir).expect("failed to initialize local chat database");
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
