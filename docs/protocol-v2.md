# Chatter 协议文档 v2

## 文档目的

本文档定义 Chatter 新客户端的正式协议契约。

- 客户端形态：`Tauri + Web UI`
- 认证与资源接口：`HTTP + JSON`
- 实时事件流：`WebSocket + JSON`

这份文档替代旧的桌面客户端兼容协议作为新开发基线。`docs/protocol-v1.md` 继续保留，但只作为历史参考。

## 设计原则

- 历史数据、列表数据、分页查询走 HTTP
- 实时消息、在线状态、错误通知走 WebSocket
- 所有时间字段统一使用 RFC3339 / ISO 8601 字符串
- 服务端推导的字段不由客户端重复提交
- 同一类消息在实时事件和历史接口中使用一致的数据结构

## 1. 认证模型

### 1.1 HTTP 登录

- `POST /api/v2/auth/register`
- `POST /api/v2/auth/login`

登录成功后返回 Bearer token。客户端将该 token 用于：

- 后续 HTTP 请求：`Authorization: Bearer <token>`
- WebSocket 握手：`GET /api/v2/ws?token=<token>`

### 1.2 WebSocket 鉴权

- WebSocket 连接在握手阶段完成鉴权
- token 缺失、非法、过期时拒绝建立连接
- 建立成功后，该连接绑定当前用户会话

## 2. HTTP 接口

### 2.1 统一返回结构

成功响应：

```json
{
  "data": {}
}
```

失败响应：

```json
{
  "error": {
    "code": "unauthorized",
    "message": "token is invalid"
  }
}
```

分页响应：

```json
{
  "data": [],
  "nextCursor": "opaque-cursor"
}
```

### 2.2 认证接口

#### `POST /api/v2/auth/register`

请求：

```json
{
  "username": "alice",
  "password": "secret123",
  "nickname": "Alice"
}
```

响应：

```json
{
  "data": {
    "user": {
      "userId": 1,
      "username": "alice",
      "nickname": "Alice"
    }
  }
}
```

#### `POST /api/v2/auth/login`

请求：

```json
{
  "username": "alice",
  "password": "secret123"
}
```

响应：

```json
{
  "data": {
    "token": "jwt-token",
    "user": {
      "userId": 1,
      "username": "alice",
      "nickname": "Alice"
    }
  }
}
```

### 2.3 用户与历史数据

#### `GET /api/v2/users/online`

返回当前在线用户列表。

#### `GET /api/v2/chats/public/history?limit=50&cursor=...`

返回公共聊天历史。

#### `GET /api/v2/chats/private/{username}/history?limit=50&cursor=...`

返回当前用户与目标用户之间的私聊历史。

### 2.4 文件

#### `POST /api/v2/files/upload`

- `multipart/form-data`
- Header: `Authorization: Bearer <token>`
- 表单字段：
  - `file`
  - `receiverUsername`

响应返回统一的文件元数据结构。

#### `GET /api/v2/files/{fileId}`

下载文件，权限规则由服务端校验发送者/接收者关系。

## 3. WebSocket 事件

### 3.1 统一事件结构

```json
{
  "event": "chat.public.message",
  "timestamp": "2026-05-14T12:00:00Z",
  "payload": {}
}
```

可选字段：

- `requestId`: 客户端生成的请求标识，用于请求-响应配对

### 3.2 客户端 -> 服务端

#### 发送公共消息

```json
{
  "event": "chat.public.send",
  "requestId": "req-1",
  "payload": {
    "content": "hello"
  }
}
```

#### 发送私聊消息

```json
{
  "event": "chat.private.send",
  "requestId": "req-2",
  "payload": {
    "receiverUsername": "bob",
    "content": "hello"
  }
}
```

#### 心跳

```json
{
  "event": "session.ping",
  "payload": {}
}
```

### 3.3 服务端 -> 客户端

#### 公共消息事件

```json
{
  "event": "chat.public.message",
  "timestamp": "2026-05-14T12:00:00Z",
  "payload": {
    "messageId": 10,
    "scope": "public",
    "sender": {
      "userId": 1,
      "username": "alice",
      "nickname": "Alice"
    },
    "content": "hello",
    "contentType": "text"
  }
}
```

#### 私聊消息事件

```json
{
  "event": "chat.private.message",
  "timestamp": "2026-05-14T12:00:00Z",
  "payload": {
    "messageId": 11,
    "scope": "private",
    "sender": {
      "userId": 1,
      "username": "alice",
      "nickname": "Alice"
    },
    "receiverUsername": "bob",
    "content": "hello",
    "contentType": "text"
  }
}
```

#### 用户上线/下线事件

- `presence.online`
- `presence.offline`

#### 心跳响应

- `session.pong`

#### 统一错误事件

```json
{
  "event": "error",
  "timestamp": "2026-05-14T12:00:00Z",
  "payload": {
    "code": "bad_request",
    "message": "content is required"
  }
}
```

## 4. 核心资源结构

### 4.1 User

```json
{
  "userId": 1,
  "username": "alice",
  "nickname": "Alice",
  "online": true
}
```

### 4.2 Message

```json
{
  "messageId": 10,
  "scope": "public",
  "sender": {
    "userId": 1,
    "username": "alice",
    "nickname": "Alice"
  },
  "receiverUsername": "bob",
  "contentType": "text",
  "content": "hello",
  "file": null,
  "timestamp": "2026-05-14T12:00:00Z"
}
```

### 4.3 FileAttachment

```json
{
  "fileId": 1,
  "fileName": "example.txt",
  "storedFileName": "uuid-example.txt",
  "downloadURL": "/api/v2/files/1",
  "size": 1024,
  "mimeType": "text/plain"
}
```

## 5. 首版范围

v2 首版只冻结以下能力：

- 注册
- 登录
- 在线用户列表
- 公共聊天
- 私聊
- 文件元数据与下载链接
- WebSocket 心跳与错误事件

以下能力不在 v2 首版范围内：

- 群聊
- 已读回执
- 撤回
- 多端同步策略
- 推送通知
