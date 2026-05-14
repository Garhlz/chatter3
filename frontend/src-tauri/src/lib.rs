#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Chatter3 desktop shell is ready.", name)
}

pub fn run() {
    // 这里先保持 Tauri Rust 壳尽量薄：
    // - 插件负责桌面能力，例如文件选择、打开文件
    // - 聊天主协议仍然放在前端 Web 层，通过 HTTP / WebSocket 直连后端
    //
    // 这样做的原因是当前协议已经明确面向新客户端，
    // 没必要把业务通信再绕进 Rust command，避免前后端职责重新耦合。
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
