use rusqlite::{params, Connection};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    title TEXT NOT NULL,
    peer_username TEXT DEFAULT '',
    group_id INTEGER,
    description TEXT DEFAULT '',
    last_message TEXT,
    updated_at TEXT,
    unread_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
    local_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    message_id INTEGER,
    scope TEXT NOT NULL,
    sender_id INTEGER,
    sender_username TEXT NOT NULL,
    sender_nickname TEXT NOT NULL,
    receiver_username TEXT,
    group_id INTEGER,
    content_type TEXT NOT NULL,
    content TEXT NOT NULL,
    file_json TEXT,
    timestamp TEXT NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'sent',
    client_request_id TEXT,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_time
    ON messages(conversation_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_request_id
    ON messages(client_request_id);
";

pub fn open_or_create(app_data_dir: PathBuf) -> Result<Mutex<Connection>, String> {
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("failed to create app data directory: {e}"))?;

    let db_path = app_data_dir.join("chatter3.db");
    let conn = Connection::open(&db_path).map_err(|e| format!("failed to open database: {e}"))?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")
        .map_err(|e| format!("failed to set WAL mode: {e}"))?;
    conn.execute_batch(SCHEMA)
        .map_err(|e| format!("failed to run schema migration: {e}"))?;

    Ok(Mutex::new(conn))
}

// ── Message rows ──

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MessageRow {
    pub local_id: String,
    pub conversation_id: String,
    pub message_id: Option<i64>,
    pub scope: String,
    pub sender_id: Option<i64>,
    pub sender_username: String,
    pub sender_nickname: String,
    pub receiver_username: Option<String>,
    pub group_id: Option<i64>,
    pub content_type: String,
    pub content: String,
    pub file_json: Option<String>,
    pub timestamp: String,
    pub delivery_status: String,
    pub client_request_id: Option<String>,
    pub error: Option<String>,
}

// ── Conversation rows ──

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConversationRow {
    pub id: String,
    pub scope: String,
    pub title: String,
    pub peer_username: String,
    pub group_id: Option<i64>,
    pub description: String,
    pub last_message: Option<String>,
    pub updated_at: Option<String>,
    pub unread_count: i32,
}

// ── Commands ──

#[tauri::command]
pub fn db_insert_message(
    db: tauri::State<Mutex<Connection>>,
    msg: MessageRow,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| format!("db lock: {e}"))?;
    conn.execute(
        "INSERT OR REPLACE INTO messages (local_id, conversation_id, message_id, scope,
         sender_id, sender_username, sender_nickname, receiver_username, group_id,
         content_type, content, file_json, timestamp, delivery_status,
         client_request_id, error)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            msg.local_id,
            msg.conversation_id,
            msg.message_id,
            msg.scope,
            msg.sender_id,
            msg.sender_username,
            msg.sender_nickname,
            msg.receiver_username,
            msg.group_id,
            msg.content_type,
            msg.content,
            msg.file_json,
            msg.timestamp,
            msg.delivery_status,
            msg.client_request_id,
            msg.error,
        ],
    )
    .map_err(|e| format!("db insert message: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn db_get_messages(
    db: tauri::State<Mutex<Connection>>,
    conversation_id: String,
    before: Option<String>,
    limit: i32,
) -> Result<Vec<MessageRow>, String> {
    let conn = db.lock().map_err(|e| format!("db lock: {e}"))?;
    let limit = limit.clamp(1, 200);

    let msg_sql = "SELECT local_id, conversation_id, message_id, scope,
         sender_id, sender_username, sender_nickname, receiver_username, group_id,
         content_type, content, file_json, timestamp, delivery_status,
         client_request_id, error
         FROM messages";

    let rows = if let Some(ref before_ts) = before {
        let mut stmt = conn
            .prepare(&format!(
                "{msg_sql} WHERE conversation_id = ?1 AND timestamp < ?2
                 ORDER BY timestamp DESC LIMIT ?3",
            ))
            .map_err(|e| format!("db prepare: {e}"))?;
        let result: Vec<MessageRow> = stmt
            .query_map(params![conversation_id, before_ts, limit], row_to_message)
            .map_err(|e| format!("db query: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("db row: {e}"))?;
        result
    } else {
        let mut stmt = conn
            .prepare(&format!(
                "{msg_sql} WHERE conversation_id = ?1
                 ORDER BY timestamp DESC LIMIT ?2",
            ))
            .map_err(|e| format!("db prepare: {e}"))?;
        let result: Vec<MessageRow> = stmt
            .query_map(params![conversation_id, limit], row_to_message)
            .map_err(|e| format!("db query: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("db row: {e}"))?;
        result
    };
    Ok(rows)
}

#[tauri::command]
pub fn db_confirm_message(
    db: tauri::State<Mutex<Connection>>,
    client_request_id: String,
    server_msg: MessageRow,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| format!("db lock: {e}"))?;
    conn.execute(
        "DELETE FROM messages WHERE client_request_id = ?1",
        params![client_request_id],
    )
    .map_err(|e| format!("db delete optimistic: {e}"))?;
    conn.execute(
        "INSERT OR REPLACE INTO messages (local_id, conversation_id, message_id, scope,
         sender_id, sender_username, sender_nickname, receiver_username, group_id,
         content_type, content, file_json, timestamp, delivery_status,
         client_request_id, error)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'sent', ?14, NULL)",
        params![
            server_msg.local_id,
            server_msg.conversation_id,
            server_msg.message_id,
            server_msg.scope,
            server_msg.sender_id,
            server_msg.sender_username,
            server_msg.sender_nickname,
            server_msg.receiver_username,
            server_msg.group_id,
            server_msg.content_type,
            server_msg.content,
            server_msg.file_json,
            server_msg.timestamp,
            server_msg.client_request_id,
        ],
    )
    .map_err(|e| format!("db confirm message: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn db_update_message_status(
    db: tauri::State<Mutex<Connection>>,
    local_id: String,
    status: String,
    err: Option<String>,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| format!("db lock: {e}"))?;
    conn.execute(
        "UPDATE messages SET delivery_status = ?1, error = ?2 WHERE local_id = ?3",
        params![status, err, local_id],
    )
    .map_err(|e| format!("db update status: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn db_upsert_conversation(
    db: tauri::State<Mutex<Connection>>,
    conv: ConversationRow,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| format!("db lock: {e}"))?;
    conn.execute(
        "INSERT OR REPLACE INTO conversations (id, scope, title, peer_username, group_id,
         description, last_message, updated_at, unread_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            conv.id,
            conv.scope,
            conv.title,
            conv.peer_username,
            conv.group_id,
            conv.description,
            conv.last_message,
            conv.updated_at,
            conv.unread_count,
        ],
    )
    .map_err(|e| format!("db upsert conversation: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn db_get_conversations(
    db: tauri::State<Mutex<Connection>>,
) -> Result<Vec<ConversationRow>, String> {
    let conn = db.lock().map_err(|e| format!("db lock: {e}"))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, scope, title, peer_username, group_id, description,
             last_message, updated_at, unread_count FROM conversations
             ORDER BY updated_at DESC",
        )
        .map_err(|e| format!("db prepare: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ConversationRow {
                id: row.get(0)?,
                scope: row.get(1)?,
                title: row.get(2)?,
                peer_username: row.get(3)?,
                group_id: row.get(4)?,
                description: row.get(5)?,
                last_message: row.get(6)?,
                updated_at: row.get(7)?,
                unread_count: row.get(8)?,
            })
        })
        .map_err(|e| format!("db query: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("db row: {e}"))?;
    Ok(rows)
}

#[tauri::command]
pub fn db_update_unread_count(
    db: tauri::State<Mutex<Connection>>,
    id: String,
    count: i32,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| format!("db lock: {e}"))?;
    conn.execute(
        "UPDATE conversations SET unread_count = ?1 WHERE id = ?2",
        params![count, id],
    )
    .map_err(|e| format!("db update unread: {e}"))?;
    Ok(())
}

fn row_to_message(row: &rusqlite::Row) -> rusqlite::Result<MessageRow> {
    Ok(MessageRow {
        local_id: row.get(0)?,
        conversation_id: row.get(1)?,
        message_id: row.get(2)?,
        scope: row.get(3)?,
        sender_id: row.get(4)?,
        sender_username: row.get(5)?,
        sender_nickname: row.get(6)?,
        receiver_username: row.get(7)?,
        group_id: row.get(8)?,
        content_type: row.get(9)?,
        content: row.get(10)?,
        file_json: row.get(11)?,
        timestamp: row.get(12)?,
        delivery_status: row.get(13)?,
        client_request_id: row.get(14)?,
        error: row.get(15)?,
    })
}
