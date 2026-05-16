use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

const PATH_SEGMENT_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'%')
    .add(b'/')
    .add(b'<')
    .add(b'>')
    .add(b'?')
    .add(b'[')
    .add(b'\\')
    .add(b']')
    .add(b'^')
    .add(b'`')
    .add(b'{')
    .add(b'|')
    .add(b'}');

pub struct HttpClient {
    pub client: Client,
    pub base_url: String,
}

pub fn new_http_client(base_url: String) -> HttpClient {
    HttpClient { client: Client::new(), base_url }
}

// ── Helpers (pure, no mutex) ──

async fn do_get<T: for<'de> Deserialize<'de>>(c: &Client, url: &str, token: Option<&str>) -> Result<T, String> {
    let mut req = c.get(url);
    if let Some(t) = token { req = req.bearer_auth(t); }
    let resp = req.send().await.map_err(|e| format!("request: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {body}"));
    }
    let data: ApiEnvelope<T> = resp.json().await.map_err(|e| format!("json: {e}"))?;
    Ok(data.data)
}

async fn do_get_page<T: for<'de> Deserialize<'de>>(c: &Client, url: &str, token: Option<&str>) -> Result<CursorEnvelope<T>, String> {
    let mut req = c.get(url);
    if let Some(t) = token { req = req.bearer_auth(t); }
    let resp = req.send().await.map_err(|e| format!("request: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {body}"));
    }
    resp.json().await.map_err(|e| format!("json: {e}"))
}

async fn do_post<T: for<'de> Deserialize<'de>, B: Serialize>(c: &Client, url: &str, body: &B, token: Option<&str>) -> Result<T, String> {
    let mut req = c.post(url).json(body);
    if let Some(t) = token { req = req.bearer_auth(t); }
    let resp = req.send().await.map_err(|e| format!("request: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {body_text}"));
    }
    if resp.status().as_u16() == 204 {
        return serde_json::from_str("null").map_err(|e| format!("json: {e}"));
    }
    let data: ApiEnvelope<T> = resp.json().await.map_err(|e| format!("json: {e}"))?;
    Ok(data.data)
}

async fn do_delete(c: &Client, url: &str, token: &str) -> Result<(), String> {
    let resp = c.delete(url).bearer_auth(token).send().await.map_err(|e| format!("request: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {body}"));
    }
    Ok(())
}

#[derive(Deserialize)]
struct ApiEnvelope<T> { data: T }

#[derive(Deserialize)]
struct CursorEnvelope<T> {
    data: Vec<T>,
    #[serde(rename = "nextCursor")]
    next_cursor: Option<String>,
}

fn history_path(path: &str, cursor: Option<&str>) -> String {
    let mut q = String::from("?limit=50");
    if let Some(c) = cursor { q.push_str(&format!("&cursor={c}")); }
    format!("{path}{q}")
}

fn encode_path_segment(value: &str) -> String {
    utf8_percent_encode(value, PATH_SEGMENT_ENCODE_SET).to_string()
}

// ── Types ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct User {
    #[serde(rename = "userId")] pub user_id: i64,
    pub username: String, pub nickname: String, pub online: bool,
}
#[derive(Debug, Serialize, Deserialize)] pub struct LoginRequest { pub username: String, pub password: String }
#[derive(Debug, Serialize, Deserialize, Clone)] pub struct LoginResponse { pub token: String, pub user: User }
#[derive(Debug, Serialize, Deserialize)] pub struct RegisterRequest { pub username: String, pub password: String, pub nickname: String }
#[derive(Debug, Serialize, Deserialize)] pub struct RegisterResponse { pub user: User }
#[derive(Debug, Serialize, Deserialize, Clone)] pub struct FileAttachment {
    #[serde(rename = "fileId")] pub file_id: i64,
    #[serde(rename = "fileName")] pub file_name: String,
    #[serde(rename = "storedFileName")] pub stored_file_name: String,
    #[serde(rename = "downloadURL")] pub download_url: String,
    pub size: i64, #[serde(rename = "mimeType")] pub mime_type: String,
}
#[derive(Debug, Serialize, Deserialize, Clone)] pub struct ChatMessage {
    #[serde(rename = "messageId")] pub message_id: i64,
    pub scope: String, pub sender: User,
    #[serde(rename = "receiverUsername", default)] pub receiver_username: Option<String>,
    #[serde(rename = "groupID", default)] pub group_id: Option<i64>,
    #[serde(rename = "contentType")] pub content_type: String,
    pub content: String, pub file: Option<FileAttachment>, pub timestamp: String,
}
#[derive(Debug, Serialize, Deserialize, Clone)] pub struct Group {
    #[serde(rename = "groupID")] pub group_id: i64,
    #[serde(rename = "groupName")] pub group_name: String,
    pub creator: User, #[serde(rename = "memberCount")] pub member_count: i32,
    #[serde(rename = "createdAt")] pub created_at: String,
}
#[derive(Debug, Serialize, Deserialize)] pub struct GroupMember {
    pub user: User, pub role: i16, #[serde(rename = "joinedAt")] pub joined_at: String,
}
#[derive(Debug, Serialize, Deserialize)] pub struct CreateGroupRequest {
    #[serde(rename = "groupName")] pub group_name: String, pub members: Option<Vec<String>>,
}
#[derive(Debug, Serialize, Deserialize)] pub struct CreateGroupResponse { pub group: Group }
#[derive(Debug, Serialize, Deserialize)] pub struct AddGroupMemberRequest { pub usernames: Vec<String> }
#[derive(Debug, Serialize, Deserialize)] pub struct UploadResponse { pub file: FileAttachment }
#[derive(Debug, Serialize, Deserialize, Clone)] pub struct CursorResponse {
    pub data: Vec<ChatMessage>,
    #[serde(rename = "nextCursor")] pub next_cursor: Option<String>,
}

#[tauri::command]
pub async fn api_login(http: tauri::State<'_, Mutex<HttpClient>>, payload: LoginRequest) -> Result<LoginResponse, String> {
    let (client, base_url) = {
        let h = http.lock().map_err(|e| format!("lock: {e}"))?;
        (h.client.clone(), h.base_url.clone())
    };
    do_post(&client, &format!("{base_url}/api/v2/auth/login"), &payload, None).await
}

#[tauri::command]
pub async fn api_register(http: tauri::State<'_, Mutex<HttpClient>>, payload: RegisterRequest) -> Result<RegisterResponse, String> {
    let (client, base_url) = {
        let h = http.lock().map_err(|e| format!("lock: {e}"))?;
        (h.client.clone(), h.base_url.clone())
    };
    do_post(&client, &format!("{base_url}/api/v2/auth/register"), &payload, None).await
}

#[tauri::command]
pub async fn api_get_online_users(http: tauri::State<'_, Mutex<HttpClient>>, token: String) -> Result<Vec<User>, String> {
    let (client, base_url) = {
        let h = http.lock().map_err(|e| format!("lock: {e}"))?;
        (h.client.clone(), h.base_url.clone())
    };
    do_get(&client, &format!("{base_url}/api/v2/users/online"), Some(&token)).await
}

#[tauri::command]
pub async fn api_get_public_history(http: tauri::State<'_, Mutex<HttpClient>>, token: String, cursor: Option<String>) -> Result<CursorResponse, String> {
    let (client, base_url) = {
        let h = http.lock().map_err(|e| format!("lock: {e}"))?;
        (h.client.clone(), h.base_url.clone())
    };
    let path = history_path("/api/v2/chats/public/history", cursor.as_deref());
    do_get_page(&client, &format!("{base_url}{path}"), Some(&token)).await.map(|e| CursorResponse { data: e.data, next_cursor: e.next_cursor })
}

#[tauri::command]
pub async fn api_get_private_history(http: tauri::State<'_, Mutex<HttpClient>>, token: String, username: String, cursor: Option<String>) -> Result<CursorResponse, String> {
    let (client, base_url) = {
        let h = http.lock().map_err(|e| format!("lock: {e}"))?;
        (h.client.clone(), h.base_url.clone())
    };
    let encoded_username = encode_path_segment(&username);
    let path = history_path(&format!("/api/v2/chats/private/{encoded_username}/history"), cursor.as_deref());
    do_get_page(&client, &format!("{base_url}{path}"), Some(&token)).await.map(|e| CursorResponse { data: e.data, next_cursor: e.next_cursor })
}

#[tauri::command]
pub async fn api_create_group(http: tauri::State<'_, Mutex<HttpClient>>, token: String, payload: CreateGroupRequest) -> Result<CreateGroupResponse, String> {
    let (client, base_url) = {
        let h = http.lock().map_err(|e| format!("lock: {e}"))?;
        (h.client.clone(), h.base_url.clone())
    };
    do_post(&client, &format!("{base_url}/api/v2/groups"), &payload, Some(&token)).await
}

#[tauri::command]
pub async fn api_list_groups(http: tauri::State<'_, Mutex<HttpClient>>, token: String) -> Result<Vec<Group>, String> {
    let (client, base_url) = {
        let h = http.lock().map_err(|e| format!("lock: {e}"))?;
        (h.client.clone(), h.base_url.clone())
    };
    do_get(&client, &format!("{base_url}/api/v2/groups"), Some(&token)).await
}

#[tauri::command]
pub async fn api_get_group(http: tauri::State<'_, Mutex<HttpClient>>, token: String, group_id: i64) -> Result<Group, String> {
    let (client, base_url) = {
        let h = http.lock().map_err(|e| format!("lock: {e}"))?;
        (h.client.clone(), h.base_url.clone())
    };
    do_get(&client, &format!("{base_url}/api/v2/groups/{group_id}"), Some(&token)).await
}

#[tauri::command]
pub async fn api_get_group_members(http: tauri::State<'_, Mutex<HttpClient>>, token: String, group_id: i64) -> Result<Vec<GroupMember>, String> {
    let (client, base_url) = {
        let h = http.lock().map_err(|e| format!("lock: {e}"))?;
        (h.client.clone(), h.base_url.clone())
    };
    do_get(&client, &format!("{base_url}/api/v2/groups/{group_id}/members"), Some(&token)).await
}

#[tauri::command]
pub async fn api_add_group_members(http: tauri::State<'_, Mutex<HttpClient>>, token: String, group_id: i64, payload: AddGroupMemberRequest) -> Result<(), String> {
    let (client, base_url) = {
        let h = http.lock().map_err(|e| format!("lock: {e}"))?;
        (h.client.clone(), h.base_url.clone())
    };
    let url = format!("{base_url}/api/v2/groups/{group_id}/members");
    let resp = client.post(&url).json(&payload).bearer_auth(&token).send().await.map_err(|e| format!("request: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {body}"));
    }
    Ok(())
}

#[tauri::command]
pub async fn api_remove_group_member(http: tauri::State<'_, Mutex<HttpClient>>, token: String, group_id: i64, username: String) -> Result<(), String> {
    let (client, base_url) = {
        let h = http.lock().map_err(|e| format!("lock: {e}"))?;
        (h.client.clone(), h.base_url.clone())
    };
    let encoded_username = encode_path_segment(&username);
    do_delete(&client, &format!("{base_url}/api/v2/groups/{group_id}/members/{encoded_username}"), &token).await
}

#[tauri::command]
pub async fn api_get_group_history(http: tauri::State<'_, Mutex<HttpClient>>, token: String, group_id: i64, cursor: Option<String>) -> Result<CursorResponse, String> {
    let (client, base_url) = {
        let h = http.lock().map_err(|e| format!("lock: {e}"))?;
        (h.client.clone(), h.base_url.clone())
    };
    let path = history_path(&format!("/api/v2/groups/{group_id}/history"), cursor.as_deref());
    do_get_page(&client, &format!("{base_url}{path}"), Some(&token)).await.map(|e| CursorResponse { data: e.data, next_cursor: e.next_cursor })
}

#[tauri::command]
pub async fn api_upload_file(http: tauri::State<'_, Mutex<HttpClient>>, token: String, file_path: String, receiver_username: Option<String>) -> Result<UploadResponse, String> {
    let (client, base_url) = {
        let h = http.lock().map_err(|e| format!("lock: {e}"))?;
        (h.client.clone(), h.base_url.clone())
    };
    let file_bytes = std::fs::read(&file_path).map_err(|e| format!("read file: {e}"))?;
    let file_name = std::path::Path::new(&file_path).file_name().and_then(|n| n.to_str()).unwrap_or("file");
    let part = reqwest::multipart::Part::bytes(file_bytes).file_name(file_name.to_string());
    let mut form = reqwest::multipart::Form::new().part("file", part);
    if let Some(ref recv) = receiver_username { form = form.text("receiverUsername", recv.clone()); }
    let resp = client.post(format!("{base_url}/api/v2/files/upload")).bearer_auth(&token).multipart(form).send().await.map_err(|e| format!("upload: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {body}"));
    }
    let data: ApiEnvelope<UploadResponse> = resp.json().await.map_err(|e| format!("json: {e}"))?;
    Ok(data.data)
}
