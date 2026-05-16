use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

pub struct RealtimeHandle {
    pub send_tx: Mutex<Option<mpsc::UnboundedSender<String>>>,
    pub cancel: Mutex<Option<tokio::sync::watch::Sender<bool>>>,
}

impl RealtimeHandle {
    pub fn new() -> Self {
        RealtimeHandle {
            send_tx: Mutex::new(None),
            cancel: Mutex::new(None),
        }
    }
}

#[derive(serde::Serialize)]
struct WsOutgoing {
    event: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "requestId")]
    request_id: Option<String>,
    payload: serde_json::Value,
}

#[tauri::command]
pub fn realtime_connect(
    rt: tauri::State<'_, RealtimeHandle>,
    app: AppHandle,
    ws_base_url: String,
    token: String,
) -> Result<(), String> {
    if let Some(cancel) = rt.cancel.lock().map_err(|e| format!("lock: {e}"))?.take() {
        let _ = cancel.send(true);
    }

    let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
    let (send_tx, send_rx) = mpsc::unbounded_channel();

    *rt.cancel.lock().map_err(|e| format!("lock: {e}"))? = Some(cancel_tx);
    *rt.send_tx.lock().map_err(|e| format!("lock: {e}"))? = Some(send_tx);

    tauri::async_runtime::spawn(realtime_loop(app, ws_base_url, token, send_rx, cancel_rx));
    Ok(())
}

#[tauri::command]
pub fn realtime_disconnect(
    rt: tauri::State<'_, RealtimeHandle>,
) -> Result<(), String> {
    if let Some(cancel) = rt.cancel.lock().map_err(|e| format!("lock: {e}"))?.take() {
        let _ = cancel.send(true);
    }
    *rt.send_tx.lock().map_err(|e| format!("lock: {e}"))? = None;
    Ok(())
}

#[tauri::command]
pub fn realtime_send(
    rt: tauri::State<'_, RealtimeHandle>,
    event: String,
    payload: serde_json::Value,
    request_id: Option<String>,
) -> Result<bool, String> {
    let msg = serde_json::to_string(&WsOutgoing { event, request_id, payload })
        .map_err(|e| format!("json: {e}"))?;
    let tx = rt.send_tx.lock().map_err(|e| format!("lock: {e}"))?;
    match &*tx {
        Some(tx) => {
            tx.send(msg).map_err(|e| format!("send: {e}"))?;
            Ok(true)
        }
        None => Ok(false),
    }
}

async fn realtime_loop(
    app: AppHandle,
    ws_base_url: String,
    token: String,
    mut send_rx: mpsc::UnboundedReceiver<String>,
    mut cancel_rx: tokio::sync::watch::Receiver<bool>,
) {
    let _ = app.emit("realtime://status", serde_json::json!({"status": "connecting"}));

    let ws_url = format!("{ws_base_url}?token={token}");
    let max_reconnect: u32 = 6;
    let base_delay_ms: u64 = 900;
    let mut attempt: u32 = 0;

    loop {
        if *cancel_rx.borrow() {
            let _ = app.emit("realtime://status", serde_json::json!({"status": "closed"}));
            return;
        }

        match tokio_tungstenite::connect_async(&ws_url).await {
            Ok((mut ws_stream, _)) => {
                attempt = 0;
                let _ = app.emit("realtime://status", serde_json::json!({"status": "connected"}));

                let mut ping_interval = tokio::time::interval(tokio::time::Duration::from_secs(30));

                loop {
                    tokio::select! {
                        _ = cancel_rx.changed() => {
                            let _ = ws_stream.close(None).await;
                            break;
                        }
                        _ = ping_interval.tick() => {
                            let ping = serde_json::json!({"event":"session.ping","payload":{}}).to_string();
                            use tokio_tungstenite::tungstenite::Message;
                            let _ = futures_util::SinkExt::send(&mut ws_stream, Message::Text(ping.into())).await;
                        }
                        msg = send_rx.recv() => {
                            match msg {
                                Some(text) => {
                                    use tokio_tungstenite::tungstenite::Message;
                                    if futures_util::SinkExt::send(&mut ws_stream, Message::Text(text.into())).await.is_err() {
                                        break;
                                    }
                                }
                                None => break,
                            }
                        }
                        msg = futures_util::StreamExt::next(&mut ws_stream) => {
                            match msg {
                                Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text))) => {
                                    let _ = app.emit("realtime://event", text.to_string());
                                }
                                Some(Ok(tokio_tungstenite::tungstenite::Message::Close(_))) => break,
                                Some(Err(_)) => break,
                                None => break,
                                _ => {}
                            }
                        }
                    }
                }
            }
            Err(e) => {
                let _ = app.emit("realtime://error", serde_json::json!({"message": format!("WebSocket connect failed: {e}")}));
            }
        }

        if *cancel_rx.borrow() {
            let _ = app.emit("realtime://status", serde_json::json!({"status": "closed"}));
            return;
        }

        attempt += 1;
        if attempt > max_reconnect {
            let _ = app.emit("realtime://status", serde_json::json!({"status": "closed"}));
            let _ = app.emit("realtime://error", serde_json::json!({"message": "Realtime connection closed after reconnect attempts"}));
            return;
        }

        let delay_ms = std::cmp::min(base_delay_ms * 2u64.pow(attempt - 1), 12_000);
        let _ = app.emit("realtime://reconnect", serde_json::json!({"attempt": attempt, "delayMs": delay_ms}));
        let _ = app.emit("realtime://status", serde_json::json!({"status": "connecting"}));

        tokio::select! {
            _ = tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)) => {}
            _ = cancel_rx.changed() => {
                let _ = app.emit("realtime://status", serde_json::json!({"status": "closed"}));
                return;
            }
        }
    }
}
