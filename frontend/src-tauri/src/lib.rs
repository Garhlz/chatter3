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
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 单实例：桌面 IM 重复启动时应该回到已有窗口，而不是创建第二套会话。
            show_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            save_desktop_token,
            load_desktop_token,
            clear_desktop_token
        ])
        .setup(|app| {
            // 系统托盘：桌面 IM 最基本的行为——关闭窗口 ≠ 退出
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
                    "show" => {
                        show_main_window(app);
                    }
                    "reconnect" => {
                        show_main_window(app);
                        let _ = app.emit("desktop://reconnect", ());
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        show_main_window(app);
                    }
                })
                .build(app)?;

            // 关闭窗口时隐藏到托盘，而不是退出
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
