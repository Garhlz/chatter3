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

## 当前稳定性

截至当前阶段，以下契约可以视为前后端稳定依赖：

- HTTP 认证：`POST /api/v2/auth/register`、`POST /api/v2/auth/login`
- HTTP 历史与在线列表：`GET /api/v2/users/online`、公共历史、私聊历史
- WebSocket 鉴权：`GET /api/v2/ws?token=<token>`
- WebSocket 会话事件：`session.ready`、`session.ping`、`session.pong`
- WebSocket 在线事件：`presence.online`、`presence.offline`
- WebSocket 文本聊天：`chat.public.send`、`chat.private.send`、`chat.group.send` 及对应 message 事件
- 文件上传下载：`POST /api/v2/files/upload`、`GET /api/v2/files/{fileId}`
- 群聊：`POST /api/v2/groups`、群组列表、成员管理、群历史
- 文本消息输入约束和错误码集合

以下契约仍处于待实现或待冻结状态：

- 已读回执
- 撤回
- 多端同步策略
- 推送通知

因此，当前前后端可以围绕”认证、历史、在线状态、文本聊天、文件、群聊”继续并行开发。

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
  - `receiverUsername`（可选）

行为：

- 不带 `receiverUsername` 时，创建公共文件消息
- 带 `receiverUsername` 时，创建私聊文件消息
- 上传成功后返回统一的文件元数据结构
- 同时沿用现有实时消息事件：
  - 公共上传 -> `chat.public.message`
  - 私聊上传 -> `chat.private.message`

#### `GET /api/v2/files/{fileId}`

下载文件，权限规则由服务端校验发送者/接收者关系。

### 2.5 群组

#### `POST /api/v2/groups`

创建群组。

请求：

```json
{
  "groupName": "My Group",
  "members": ["bob", "carol"]
}
```

响应（201）：

```json
{
  "data": {
    "group": {
      "groupID": 1,
      "groupName": "My Group",
      "creator": {
        "userId": 1,
        "username": "alice",
        "nickname": "Alice"
      },
      "memberCount": 3,
      "createdAt": "2026-05-15T12:00:00Z"
    }
  }
}
```

#### `GET /api/v2/groups`

返回当前用户所属群组列表。

#### `GET /api/v2/groups/{groupID}`

返回单个群组详情。

#### `GET /api/v2/groups/{groupID}/members`

返回群组成员列表。

响应：

```json
{
  "data": [
    {
      "user": { "userId": 1, "username": "alice", "nickname": "Alice", "online": true },
      "role": 2,
      "joinedAt": "2026-05-15T12:00:00Z"
    }
  ]
}
```

#### `POST /api/v2/groups/{groupID}/members`

添加成员（需管理员或群主权限）。

请求：

```json
{
  "usernames": ["carol"]
}
```

#### `DELETE /api/v2/groups/{groupID}/members/{username}`

移除成员。调用者可以移除自己，群主或管理员可以移除其他人。不能移除群主。

#### `GET /api/v2/groups/{groupID}/history?limit=50&cursor=...`

返回群聊消息历史。调用者必须是群成员。

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

#### 发送群聊消息

```json
{
  "event": "chat.group.send",
  "requestId": "req-3",
  "payload": {
    "groupID": 1,
    "content": "hello everyone"
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

#### 群聊消息发送

```json
{
  "event": "chat.group.send",
  "requestId": "req-3",
  "payload": {
    "groupID": 1,
    "content": "hello everyone"
  }
}
```

#### 群聊消息事件

```json
{
  "event": "chat.group.message",
  "timestamp": "2026-05-15T12:00:00Z",
  "payload": {
    "messageId": 100,
    "scope": "group",
    "sender": {
      "userId": 1,
      "username": "alice",
      "nickname": "Alice"
    },
    "groupID": 1,
    "content": "hello everyone",
    "contentType": "text"
  }
}
```

**约束**：

- 发送者必须是群成员
- 群消息广播给所有在线群成员（含发送者）
- 离线成员可通过历史接口拉取

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

当前后端已固定的 WebSocket 错误码：

- `bad_request`：请求结构或业务输入非法
- `unauthorized`：认证失败
- `not_found`：目标资源不存在
- `payload_too_large`：消息体超过服务端限制
- `internal_error`：服务端内部错误
- `forbidden`：无权限访问
- `not_implemented`：事件尚未实现

当前文本消息输入约束：

- `content` 会 trim 首尾空白
- trim 后不能为空
- 最长 4096 字符
- 私聊 `receiverUsername` 不能为空
- 不允许给自己发送私聊

当前文件消息约束：

- 上传字段 `file` 必填
- 上传大小受服务端 `MAX_FILE_SIZE_MB` 限制
- 私聊文件不允许把 `receiverUsername` 指向自己

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

### 4.4 Group

```json
{
  "groupID": 1,
  "groupName": "My Group",
  "creator": {
    "userId": 1,
    "username": "alice",
    "nickname": "Alice"
  },
  "memberCount": 3,
  "createdAt": "2026-05-15T12:00:00Z"
}
```

### 4.5 GroupMember

```json
{
  "user": {
    "userId": 2,
    "username": "bob",
    "nickname": "Bob",
    "online": true
  },
  "role": 0,
  "joinedAt": "2026-05-15T12:00:00Z"
}
```

role 值：0=member、1=admin、2=owner。

## 5. 首版范围

v2 当前已冻结以下能力：

- 注册
- 登录
- 在线用户列表
- 公共聊天
- 私聊
- 群聊
- WebSocket 心跳与错误事件
- 文件上传下载

以下能力仍未冻结：

- 已读回执
- 撤回
- 多端同步策略
- 推送通知
