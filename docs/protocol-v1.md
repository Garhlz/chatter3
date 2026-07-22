# Chatter 协议文档 v1

## 文档目的

本文档冻结已移除的 Java 服务端与 Qt/C++ 客户端之间曾经形成的协议约定，记录 Go 后端重写时使用的兼容基线。旧实现源码不再保留在当前工作树中，需要核对实现细节时可查阅 Git 历史。

这份文档不是“理想协议设计”，而是“旧客户端实际依赖过的行为总结”。

### 历史实现状态

- 旧客户端使用 Qt/C++ 实现，原位于仓库根目录的 `client/`。
- 旧服务端使用 Java + Spring Boot 实现，原位于仓库根目录的 `server/`。
- 两套代码在 Go + Tauri/React 重写成为唯一维护路线后从当前版本删除，避免读者误将其视为可运行或持续维护的实现。
- 本文档仍作为协议考古资料保留；如需查看原始代码，可使用 `git log -- client server` 定位删除前的版本。

## 结论摘要

- 当前长连接协议为：`TCP + JSON + 换行分隔`
- 当前文件传输协议为：`HTTP + multipart/form-data` 上传，`HTTP GET` 下载
- 鉴权方式为：Socket 消息中带 `token`，HTTP 请求头带 `Authorization: Bearer <token>`
- 第一阶段 Go 后端应继续兼容以上协议
- 中期目标协议可升级为：`WebSocket + JSON`

---

## 1. 传输层约定

### 1.1 Socket 传输

- 客户端使用 `QTcpSocket`
- 服务端使用 Java `Socket`
- 每条消息是一行 JSON
- 分隔方式为换行符 `\n`
- 客户端发送时使用：

```json
{"type":"LOGIN","username":"alice","password":"123456"}
```

底层实际发送为：

```text
{"type":"LOGIN","username":"alice","password":"123456"}\n
```

### 1.2 编码

- 服务端 `ClientHandler` 显式使用 `UTF-8`
- 客户端 `QJsonDocument::toJson(QJsonDocument::Compact)` 输出 UTF-8 字节

### 1.3 消息大小

服务端当前在入口处有长度限制：

- 单条原始消息长度不能超过 `10000`

### 1.4 鉴权要求

以下消息 **不要求 token**：

- `LOGIN`
- `REGISTER`

其余 Socket 消息当前都要求 `token` 可校验通过。

---

## 2. HTTP 文件传输约定

### 2.1 上传

- 路径：`POST /api/files/upload`
- Content-Type：`multipart/form-data`
- Header：`Authorization: Bearer <token>`

表单字段：

- `file`: 文件二进制
- `receiverUsername`: 接收方用户名

当前仅支持私聊文件。

### 2.2 下载

- 路径：`GET /api/files/download/{storedFileName}`
- Header：`Authorization: Bearer <token>`

权限规则：

- 只有原消息发送者或接收者可下载

---

## 3. 通用消息外层

### 3.1 当前服务端通用 DTO

服务端统一消息结构来自 `MessageDTO`，字段如下：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | string | 消息类型 |
| `userId` | number | 用户 ID |
| `username` | string | 用户名 |
| `password` | string | 密码，仅登录/注册请求使用 |
| `nickname` | string | 昵称 |
| `receiver` | string | 私聊接收方用户名 |
| `groupId` | number | 群组 ID |
| `content` | any | 业务载荷 |
| `token` | string | JWT |
| `status` | string | 常见值：`success` / `error` |
| `timestamp` | string | 通常为 ISO 时间字符串 |
| `errorMessage` | string | 错误消息 |
| `messageId` | number | 服务端生成的消息 ID |

### 3.2 当前时间字段现状

当前协议中时间字段并不完全统一：

- `MessageDTO.timestamp` 基本为 `ISO_LOCAL_DATE_TIME` 字符串
- 部分嵌套对象中的 `LocalDateTime` 由于 Jackson 默认配置，会序列化成数组
- 例如 `User.createdAt`、`User.lastLoginAt` 可能是：

```json
[2025,4,16,15,25,30,436000000]
```

这不是理想格式，但 Go 后端第一阶段需要兼容客户端实际可接受的结构。

---

## 4. 消息类型总表

当前代码中出现的消息类型如下：

- `LOGIN`
- `REGISTER`
- `CHAT`
- `PRIVATE_CHAT`
- `GROUP_CHAT`
- `SYSTEM`
- `ERROR`
- `HEARTBEAT`
- `LOGOUT`
- `ONLINE_USERS`
- `OFFLINE_USERS`
- `HISTORY_MESSAGES`
- `USER_LOGIN`
- `USER_LOGOUT`
- `FILE`
- `GROUP_CREATE`
- `GROUP_DELETE`
- `GROUP_ADD`
- `GROUP_REMOVE`
- `GROUP_RESPONSE`
- `GROUP_INFO`
- `GROUP_BROADCAST`

---

## 5. 客户端 -> 服务端消息

以下为当前 Qt 客户端主动发送的消息。

### 5.1 LOGIN

用途：

- 登录

请求：

```json
{
  "type": "LOGIN",
  "username": "alice",
  "password": "123456"
}
```

字段要求：

- `type` 必填
- `username` 必填
- `password` 必填

### 5.2 REGISTER

用途：

- 注册

请求：

```json
{
  "type": "REGISTER",
  "username": "alice",
  "password": "123456",
  "nickname": "Alice"
}
```

字段要求：

- `username` 必填
- `password` 必填
- `nickname` 可为空字符串，但当前客户端会发送

### 5.3 CHAT

用途：

- 大厅聊天

请求：

```json
{
  "type": "CHAT",
  "content": "hello",
  "token": "<jwt>"
}
```

注意：

- 客户端不发送 `username`
- 发送者身份完全依赖服务端根据 token 和当前会话推断

### 5.4 PRIVATE_CHAT

用途：

- 私聊

请求：

```json
{
  "type": "PRIVATE_CHAT",
  "receiver": "bob",
  "content": "hello",
  "token": "<jwt>"
}
```

注意：

- `receiver` 是 **用户名 username**，不是昵称

### 5.5 GROUP_CHAT

用途：

- 群聊

请求：

```json
{
  "type": "GROUP_CHAT",
  "userId": 1,
  "username": "alice",
  "nickname": "Alice",
  "groupId": 1001,
  "content": "hello group",
  "token": "<jwt>"
}
```

当前服务端行为：

- 会校验消息中的 `userId`、`username`、`nickname` 是否与当前已认证会话一致
- 群成员校验通过后才入库和广播

### 5.6 GROUP_CREATE / GROUP_DELETE / GROUP_ADD / GROUP_REMOVE

用途：

- 群组管理操作

外层结构：

```json
{
  "type": "GROUP_CREATE",
  "content": {
    "operationId": "uuid",
    "operatorId": 1,
    "groupId": 0,
    "userId": 0,
    "groupName": "new-group"
  },
  "token": "<jwt>"
}
```

不同操作的 `content` 组合如下：

#### GROUP_CREATE

```json
{
  "operationId": "uuid",
  "operatorId": 1,
  "groupId": 0,
  "userId": 0,
  "groupName": "new-group"
}
```

#### GROUP_DELETE

```json
{
  "operationId": "uuid",
  "operatorId": 1,
  "groupId": 1001,
  "userId": 0,
  "groupName": "group-name"
}
```

#### GROUP_ADD

```json
{
  "operationId": "uuid",
  "operatorId": 1,
  "groupId": 1001,
  "userId": 2,
  "groupName": "group-name"
}
```

#### GROUP_REMOVE

```json
{
  "operationId": "uuid",
  "operatorId": 1,
  "groupId": 1001,
  "userId": 2,
  "groupName": "group-name"
}
```

### 5.7 HEARTBEAT

用途：

- 心跳保活

请求：

```json
{
  "type": "HEARTBEAT",
  "token": "<jwt>"
}
```

当前客户端默认：

- 每 15 秒发送一次
- 45 秒未收到服务端任何消息，则认为服务端心跳超时

### 5.8 LOGOUT

客户端定义了该消息构造，但当前主要流程里未明显作为标准登出主链路使用。

请求：

```json
{
  "type": "LOGOUT",
  "token": "<jwt>"
}
```

### 5.9 FILE

客户端存在 `createFileMessage()`，但实际文件上传主要通过 HTTP 完成，Socket 层不作为主上传链路。

当前重写阶段可以不把此消息作为主要客户端主动请求入口。

---

## 6. 服务端 -> 客户端消息

以下为当前客户端 `MessageProcessor` 明确处理的服务端消息。

### 6.1 LOGIN

用途：

- 登录成功或失败响应

成功响应示例：

```json
{
  "type": "LOGIN",
  "status": "success",
  "userId": 1,
  "username": "alice",
  "nickname": "Alice",
  "token": "<jwt>",
  "timestamp": "2026-05-14T15:00:00"
}
```

失败时：

- 可能返回 `type=ERROR`
- 也可能返回 `LOGIN` 带错误语义，当前客户端主要依赖 `status`

客户端依赖：

- 必须包含 `status`
- 登录成功时，必须包含：
  - `token`
  - `nickname`
  - `userId`
  - `username`

### 6.2 REGISTER

用途：

- 注册响应

成功响应示例：

```json
{
  "type": "REGISTER",
  "status": "success",
  "username": "alice",
  "nickname": "Alice"
}
```

### 6.3 CHAT

用途：

- 大厅消息广播

当前服务端行为：

- 只广播给其他在线用户
- **不会回发给发送者**

消息示例：

```json
{
  "type": "CHAT",
  "username": "alice",
  "nickname": "Alice",
  "content": "hello",
  "timestamp": "2026-05-14T15:00:00"
}
```

注意：

- 当前大厅实时广播不一定带 `messageId`
- 但历史消息中的大厅消息通常带 `messageId`

### 6.4 PRIVATE_CHAT

用途：

- 私聊消息投递

消息示例：

```json
{
  "type": "PRIVATE_CHAT",
  "username": "alice",
  "nickname": "Alice",
  "receiver": "bob",
  "content": "hello",
  "timestamp": "2026-05-14T15:00:00",
  "messageId": 123
}
```

客户端依赖：

- `username` 为发送者用户名
- `receiver` 为接收者用户名

当前服务端行为：

- 只发给接收者
- 不主动回发给发送者

### 6.5 GROUP_CHAT

用途：

- 群聊消息广播

消息示例：

```json
{
  "type": "GROUP_CHAT",
  "userId": 1,
  "username": "alice",
  "nickname": "Alice",
  "groupId": 1001,
  "content": "hello group",
  "timestamp": "2026-05-14T15:00:00",
  "messageId": 456
}
```

当前服务端行为：

- 发给群中其他在线成员
- 不回发给发送者
- 离线成员通过历史同步补齐

### 6.6 FILE

用途：

- 文件消息通知
- HTTP 上传成功后，通过 TCP 向接收者推送

消息示例：

```json
{
  "type": "FILE",
  "userId": 1,
  "username": "alice",
  "nickname": "Alice",
  "receiver": "bob",
  "content": {
    "fileId": 1,
    "messageId": 789,
    "fileName": "a.png",
    "storedFileName": "uuid.png",
    "fileUrl": "http://host:8080/api/files/download/uuid.png",
    "fileSize": 1024,
    "fileType": "image/png",
    "md5": "xxx",
    "uploadTime": [2026,5,14,15,0,0,0]
  },
  "timestamp": "2026-05-14T15:00:00",
  "messageId": 789
}
```

注意：

- 实时文件消息中 `content` 是对象
- 历史文件消息中 `content` 是 JSON 字符串，客户端会再解析一次

这是一个当前实现中的重要不一致点，Go 第一阶段建议兼容。

### 6.7 ONLINE_USERS

用途：

- 给当前登录用户发送在线用户快照

消息示例：

```json
{
  "type": "ONLINE_USERS",
  "content": [
    {
      "userId": 1,
      "username": "alice",
      "password": null,
      "nickname": "Alice",
      "avatarUrl": "https://secure.gravatar.com/avatar/default?s=200&d=mp",
      "status": 1,
      "online": true,
      "lastHeartbeat": [2026,5,14,15,0,0,0],
      "createdAt": [2026,5,1,12,0,0,0],
      "lastLoginAt": [2026,5,14,14,59,0,0]
    }
  ],
  "timestamp": "2026-05-14T15:00:00"
}
```

客户端依赖：

- `content` 必须是数组

### 6.8 OFFLINE_USERS

用途：

- 给当前登录用户发送离线用户快照

结构与 `ONLINE_USERS` 一致，只是 `content` 为离线用户数组。

### 6.9 USER_LOGIN

用途：

- 通知其他在线用户，有新用户上线

消息示例：

```json
{
  "type": "USER_LOGIN",
  "content": {
    "userId": 1,
    "username": "alice",
    "password": null,
    "nickname": "Alice",
    "avatarUrl": "https://secure.gravatar.com/avatar/default?s=200&d=mp",
    "status": 1,
    "online": true,
    "lastHeartbeat": [2026,5,14,15,0,0,0],
    "createdAt": [2026,5,1,12,0,0,0],
    "lastLoginAt": [2026,5,14,14,59,0,0]
  },
  "timestamp": "2026-05-14T15:00:00"
}
```

### 6.10 USER_LOGOUT

用途：

- 通知其他在线用户，有用户下线

结构与 `USER_LOGIN` 一致。

### 6.11 HISTORY_MESSAGES

用途：

- 历史消息同步

当前服务端会在登录后多次发送 `HISTORY_MESSAGES`：

- 一次大厅历史
- 一次私聊历史
- 一次群聊历史

每次 `content` 都是消息数组，客户端会根据数组中每条消息自己的 `type` 再做分流。

示例：

```json
{
  "type": "HISTORY_MESSAGES",
  "content": [
    {
      "messageId": 1,
      "type": "CHAT",
      "userId": 1,
      "username": "alice",
      "nickname": "Alice",
      "receiver": null,
      "groupId": null,
      "content": "hello",
      "timestamp": "2026-05-14T15:00:00"
    }
  ],
  "timestamp": "2026-05-14T15:00:05"
}
```

客户端依赖：

- `content` 必须是数组
- 数组元素里至少应包含：
  - `type`
  - `nickname`
  - `content`

### 6.12 GROUP_INFO

用途：

- 登录成功后发送当前用户相关群组及成员信息

消息示例：

```json
{
  "type": "GROUP_INFO",
  "userId": 1,
  "content": [
    {
      "groupId": 1001,
      "groupName": "dev",
      "creatorId": 1,
      "createdAt": [2026,5,1,12,0,0,0],
      "members": [
        {
          "userId": 1,
          "username": "alice",
          "password": null,
          "nickname": "Alice"
        }
      ]
    }
  ],
  "timestamp": "2026-05-14T15:00:00"
}
```

客户端依赖：

- `content` 为数组
- 每个元素至少包含：
  - `groupId`
  - `groupName`
  - `creatorId`
  - `members`

### 6.13 GROUP_RESPONSE

用途：

- 群组管理操作的同步响应

成功示例：

```json
{
  "type": "GROUP_RESPONSE",
  "status": "success",
  "content": {
    "operationId": "uuid",
    "groupId": 1001,
    "groupName": "dev",
    "creatorId": 1
  }
}
```

失败示例：

```json
{
  "type": "GROUP_RESPONSE",
  "status": "error",
  "content": {
    "operationId": "uuid",
    "message": "您没有权限删除该群组。只有群主可以删除。"
  }
}
```

客户端依赖：

- `status`
- `content.operationId`

### 6.14 GROUP_BROADCAST

用途：

- 群组成员变化通知

当前实现中主要有两种：

#### add

用于通知被加入群组的用户

```json
{
  "type": "GROUP_BROADCAST",
  "content": {
    "type": "add",
    "groupId": 1001,
    "groupName": "dev",
    "creatorId": 1,
    "members": [...],
    "history": [...]
  }
}
```

#### remove

用于通知被移除用户，或群组被删除时通知相关成员

```json
{
  "type": "GROUP_BROADCAST",
  "content": {
    "type": "remove",
    "groupId": 1001,
    "groupName": "dev"
  }
}
```

客户端依赖：

- `content.type` 为 `add` 或 `remove`

### 6.15 HEARTBEAT

用途：

- 心跳响应

示例：

```json
{
  "type": "HEARTBEAT",
  "timestamp": "2026-05-14T15:00:00"
}
```

客户端当前行为：

- 收到任何消息都会重置“服务器心跳超时定时器”
- 收到 `HEARTBEAT` 只是额外打印日志

### 6.16 ERROR

用途：

- 通用错误消息

示例：

```json
{
  "type": "ERROR",
  "status": "error",
  "errorMessage": "无效的token",
  "timestamp": "2026-05-14T15:00:00",
  "content": "Invalid input: ..."
}
```

客户端依赖：

- 主要读取 `errorMessage`

---

## 7. 登录后服务端消息顺序

当前 Java 服务端登录成功后的顺序非常重要，客户端对这一批初始化消息有依赖。

当前顺序为：

1. `LOGIN(status=success)`
2. `ONLINE_USERS`
3. 向其他在线用户广播 `USER_LOGIN`
4. `OFFLINE_USERS`
5. `HISTORY_MESSAGES`（大厅）
6. `HISTORY_MESSAGES`（私聊）
7. `GROUP_INFO`
8. `HISTORY_MESSAGES`（群聊）

Go 后端第一阶段建议保持同样顺序，至少不要打乱：

- `ONLINE_USERS` / `OFFLINE_USERS`
- `GROUP_INFO`
- 各类 `HISTORY_MESSAGES`

---

## 8. 客户端依赖的隐式行为

这是当前最需要保留的部分，不一定优雅，但客户端已经依赖了。

### 8.1 实时消息通常不回显给发送者

当前服务端行为：

- 大厅消息不回发给发送者
- 私聊消息不回发给发送者
- 群聊消息不回发给发送者

客户端 UI 显示通常靠本地追加，不完全依赖服务端回显。

### 8.2 历史消息按批次多次发送

不是一次发全部历史，而是：

- 大厅一批
- 私聊一批
- 群聊一批

三批都用同一个 `type=HISTORY_MESSAGES`。

### 8.3 历史消息二次分流依赖每条记录自己的 `type`

客户端收到 `HISTORY_MESSAGES` 后，会遍历 `content[]`，再根据数组中每条记录的 `type` 判断：

- `CHAT`
- `PRIVATE_CHAT`
- `GROUP_CHAT`
- `FILE`

### 8.4 文件消息的 content 结构不一致

当前实现中：

- 实时 `FILE` 消息：`content` 是对象
- 历史 `FILE` 消息：`content` 是 JSON 字符串

这是历史包袱，第一阶段建议兼容，第二阶段再统一。

### 8.5 用户对象中 password 字段应为空

在线/离线列表和登录登出广播里的用户对象，客户端默认能接受 `password=null`。

Go 后端应避免返回真实密码或 hash。

### 8.6 群组广播只通知受影响对象

当前实现里：

- `GROUP_ADD` 的 `GROUP_BROADCAST(add)` 只发给被加入的人
- `GROUP_REMOVE` 的 `GROUP_BROADCAST(remove)` 只发给被移除的人
- `GROUP_DELETE` 的 `GROUP_BROADCAST(remove)` 发给当前群成员

这不是完整的事件广播模型，但客户端目前是按这个思路收消息的。

### 8.7 客户端把收到任何消息都当作“服务端仍在线”

也就是说：

- 即使不发 `HEARTBEAT`
- 只要服务端持续有其他业务消息

客户端也会重置超时计时器。

---

## 9. 当前协议中的不一致和历史问题

以下是 Go 重写时必须有意识处理的点。

### 9.1 时间格式不统一

- 外层 `timestamp` 常为字符串
- 嵌套 `LocalDateTime` 常为数组

### 9.2 文件消息 content 格式不统一

- 实时：对象
- 历史：字符串化 JSON

### 9.3 群组操作响应与通用错误响应分裂

- 通用错误：`ERROR`
- 群组操作错误：`GROUP_RESPONSE(status=error)`

### 9.4 Socket 会话状态与数据库在线状态混用

这是旧实现内部问题。Go 版本应让会话管理器成为在线状态唯一真源，但对外协议暂不必改变。

### 9.5 LOGOUT 在当前客户端主流程中不是强依赖

不要把 Go 第一版的登出语义建立在客户端一定会主动发送 `LOGOUT` 之上。

---

## 10. Go 后端第一阶段兼容要求

以下行为建议视为“必须兼容”：

- [ ] 继续使用 `TCP + JSON + \n`
- [ ] 保留现有消息类型字符串
- [ ] 登录成功后返回 `LOGIN(status=success)`，并包含 `userId`、`username`、`nickname`、`token`
- [ ] 保持登录后的初始化消息顺序基本一致
- [ ] `ONLINE_USERS` / `OFFLINE_USERS` 的 `content` 保持数组
- [ ] `HISTORY_MESSAGES` 的 `content` 保持数组
- [ ] `GROUP_INFO` 的 `content` 保持数组
- [ ] `GROUP_RESPONSE` 继续使用 `operationId`
- [ ] `GROUP_BROADCAST` 继续使用 `content.type = add/remove`
- [ ] 心跳继续使用 `HEARTBEAT`
- [ ] 文件上传下载继续走 HTTP

以下行为可在第一阶段兼容，第二阶段再优化：

- [ ] 历史 `FILE` 消息 `content` 保持字符串
- [ ] 嵌套时间字段先兼容现有格式

---

## 11. P0 结论

就当前代码来看，Go 后端第一阶段的正确策略不是“重新发明协议”，而是：

1. 固定住现有消息类型和载荷结构
2. 保住登录后初始化顺序
3. 保住客户端依赖的几处隐式行为
4. 在内部用更清晰的 Go 架构重写
5. 等替换完成后，再推进 `WebSocket + JSON` 升级
