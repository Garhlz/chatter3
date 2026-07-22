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
- HTTP 用户资料：读取任意用户公开资料、更新本人资料、头像和个人背景
- WebSocket 鉴权：`GET /api/v2/ws?token=<token>`
- WebSocket 会话事件：`session.ready`、`session.ping`、`session.pong`
- WebSocket 在线事件：`presence.online`、`presence.offline`
- WebSocket 文本聊天：`chat.public.send`、`chat.private.send`、`chat.group.send` 及对应 message 事件
- 文件上传下载：公共、私聊和群聊文件上传，以及按会话权限下载
- 群聊：`POST /api/v2/groups`、群组列表、成员管理、群历史
- 文本消息输入约束和错误码集合

以下契约仍处于待实现或待冻结状态：

- 已读回执
- 撤回
- 已读状态等完整多端同步策略（同账号多连接和实时消息投递已支持）
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

#### `GET /api/v2/users/{username}/profile`

返回用户公开资料。查询本人时，响应额外包含仅本人可见的 `email`。

```json
{
  "data": {
    "user": {
    "userId": 1,
    "username": "alice",
    "nickname": "Alice",
    "avatarUrl": "https://example.com/avatar.png",
    "online": true
    },
    "bio": "Hello",
    "backgroundUrl": "/api/v2/profile-media/1-background-opaque.jpg",
    "gender": 0,
    "createdAt": "2026-05-15T12:00:00Z",
    "email": "alice@example.com"
  }
}
```

#### `PUT /api/v2/users/{username}/profile`

只允许更新当前登录用户自己的资料。请求字段均可选；未提供的字段保持不变。

```json
{
  "nickname": "Alice",
  "bio": "Hello",
  "email": "alice@example.com",
  "gender": 0
}
```

成功响应与读取本人资料相同。更新其他用户返回 `forbidden`。

资料 JSON 更新只覆盖昵称、自我介绍、邮箱和性别。资料图片使用独立 multipart 接口：

- `PUT /api/v2/users/{username}/avatar`
- `PUT /api/v2/users/{username}/background`

两者的表单字段均为 `file`，只允许修改本人，支持 JPEG/PNG，最大 5 MiB。
成功响应与读取本人资料相同。服务端返回的 `/api/v2/profile-media/...` 地址可公开读取，
使用不可预测文件名并设置长期缓存；资料查询本身仍然要求登录。

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
  - `groupID`（可选）

行为：

- 两个目标字段都不带时，创建公共文件消息
- 只带 `receiverUsername` 时，创建私聊文件消息
- 只带 `groupID` 时，创建群文件消息，发送者必须是群成员
- `receiverUsername` 与 `groupID` 同时出现时返回 `bad_request`
- 若 `receiverUsername` 不存在，返回 `not_found`
- 上传成功后返回统一的文件元数据结构
- 同时沿用现有实时消息事件：
  - 公共上传 -> `chat.public.message`
  - 私聊上传 -> `chat.private.message`
  - 群聊上传 -> `chat.group.message`

#### `GET /api/v2/files/{fileId}`

下载文件时按消息范围鉴权：公共文件允许登录用户下载，私聊文件仅允许发送者和接收者，
群文件仅允许当前仍在群内的成员。

文件元数据说明：

- `file.fileId` 存在时表示该消息附带附件
- `file.mimeType` 允许为空字符串，用于兼容旧数据或 MIME 未知的附件记录

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

成功后返回该群的完整成员结构数组。前端可以直接用响应替换本地成员列表，
无需在添加成功后再发起一次刷新请求：

```json
{
  "data": [
    {
      "user": { "userId": 3, "username": "carol", "nickname": "Carol", "online": false },
      "role": 0,
      "joinedAt": "2026-05-15T12:00:00Z"
    }
  ]
}
```

#### `DELETE /api/v2/groups/{groupID}/members/{username}`

移除成员。调用者可以移除自己，群主或管理员可以移除其他人。不能移除群主。
成功时返回 `204 No Content`。

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

#### 群资料变化事件

创建群聊、添加成员或移除成员成功后，服务端向相关在线成员推送：

```json
{
  "event": "group.changed",
  "timestamp": "2026-07-22T12:00:00Z",
  "payload": {
    "group": {
      "groupID": 1,
      "groupName": "My Group",
      "creator": {
        "userId": 1,
        "username": "alice",
        "nickname": "Alice",
        "online": true
      },
      "memberCount": 2,
      "createdAt": "2026-07-22T11:55:00Z"
    },
    "removedUsername": "bob"
  }
}
```

- 新建群聊和添加成员时省略 `removedUsername`，客户端新增或更新会话。
- 移除成员时带上 `removedUsername`。被移除者删除本地会话，其他成员更新人数。
- 该事件只同步导航所需的群资料；聊天内容仍使用 `chat.group.message`。
- 事件只保证在线实时送达。客户端重连后仍以 `GET /api/v2/groups` 为最终状态来源。

#### 用户上线/下线事件

- `presence.online`
- `presence.offline`

同一账号允许建立多条 WebSocket 连接。只有第一条连接建立时发送 online，最后一条
连接关闭或超时时发送 offline；实时消息会投递到该用户的所有活跃连接。

#### 用户资料变化事件

昵称、自我介绍、性别、头像或背景更新后广播 `user.profile.changed`：

```json
{
  "event": "user.profile.changed",
  "payload": {
    "profile": {
      "user": { "userId": 1, "username": "alice", "nickname": "Alice", "online": true },
      "backgroundUrl": "/api/v2/profile-media/1-background-opaque.jpg",
      "bio": "Hello",
      "gender": 0,
      "createdAt": "2026-05-15T12:00:00Z"
    }
  }
}
```

该事件只包含公开资料，不包含本人私有的 `email`。

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
- 对私聊文本消息发送，表示 `receiverUsername` 不存在
- 对私聊文件上传，表示 `receiverUsername` 不存在
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
- 私聊目标用户不存在时，HTTP 和 WebSocket 都返回 `not_found`
- 单个 WebSocket frame 的 payload 上限为 64 KiB；超过上限返回
  `payload_too_large` 后关闭当前连接

当前文件消息约束：

- 上传字段 `file` 必填
- 上传大小受服务端 `MAX_FILE_SIZE_MB` 限制
- 私聊文件不允许把 `receiverUsername` 指向自己
- 私聊文件目标用户不存在时返回 `not_found`
- 群文件发送者必须是群成员，下载者也必须仍是群成员
- `receiverUsername` 和 `groupID` 互斥

## 4. 核心资源结构

### 4.1 User

```json
{
  "userId": 1,
  "username": "alice",
  "nickname": "Alice",
  "avatarUrl": "https://example.com/avatar.png",
  "online": true
}
```

`avatarUrl` 为可选字段；没有头像地址时服务端可以省略它。

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
- 已读状态等完整多端同步策略
- 推送通知
