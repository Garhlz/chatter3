# Chatter3 Backend TODO

这个文件只描述后端执行线，适合单独开一个后端会话持续推进。

## 当前后端已具备

- [x] `POST /api/v2/auth/register`
- [x] `POST /api/v2/auth/login`
- [x] `GET /api/v2/users/online`
- [x] `GET /api/v2/chats/public/history`
- [x] `GET /api/v2/chats/private/{username}/history`
- [x] WebSocket token 握手
- [x] `session.ready`
- [x] `session.ping` / `session.pong`
- [x] `presence.online` / `presence.offline`
- [x] 心跳超时自动清理
- [x] 同一用户重连替换旧连接
- [x] `chat.public.send -> chat.public.message`
- [x] `chat.private.send -> chat.private.message`
- [x] `GET /api/v2/users/online` 与当前会话状态的一致输出
- [x] `POST /api/v2/groups` 创建群组
- [x] `GET /api/v2/groups` / `GET /api/v2/groups/{groupID}` 群组列表与详情
- [x] `GET /api/v2/groups/{groupID}/members` 群成员列表
- [x] `POST /api/v2/groups/{groupID}/members` 添加成员
- [x] `DELETE /api/v2/groups/{groupID}/members/{username}` 移除成员
- [x] `GET /api/v2/groups/{groupID}/history` 群聊历史
- [x] `chat.group.send -> chat.group.message` 群聊实时消息

## Backend Next

- [x] 将消息链路从 `transport/http/service.go` 归并到正式 `service/repository` 结构
- [x] 明确公共/私聊发送失败时的基础错误码约定
- [x] 为 `chat.public.send` / `chat.private.send` 增加明确的文本输入约束
- [x] 为消息输入约束和 WS 错误码映射补基础测试
- [x] 为 WebSocket 握手、`session.ready`、`session.ping`、错误事件补 handler 级测试
- [x] 为消息 service 增加 opt-in 数据库集成测试，覆盖公共/私聊落库与历史读取
- [x] 为公共/私聊发送的在线/离线投递语义补集成测试
- [x] 为 `chat.public.send` / `chat.private.send` 的 WebSocket 成功路径补集成测试
- [x] 实现 `POST /api/v2/files/upload`
- [x] 实现 `GET /api/v2/files/{fileId}`
- [x] 文件元数据与历史消息结构对齐
- [x] 为文件上传下载补错误路径测试：超限、目标用户不存在、越权下载

## Backend Later

- [x] 群聊协议、持久化与实时广播

## Backend 产出目标

- 后端实时链路具备稳定语义和测试保护
- 错误码、输入约束、在线状态和消息事件可以被前端稳定依赖
- 群聊能力已可在当前协议上扩展

## 后端协议稳定性

当前可以视为稳定后端契约：

- HTTP 注册、登录、在线用户、公共历史、私聊历史
- WebSocket token 握手
- `session.ready`、`session.ping`、`session.pong`
- `presence.online`、`presence.offline`
- `chat.public.send -> chat.public.message`
- `chat.private.send -> chat.private.message`
- 文本消息约束和 WS 错误码集合
- `POST /api/v2/files/upload`
- `GET /api/v2/files/{fileId}`
- 群组 CRUD、成员管理与群聊历史
- `chat.group.send -> chat.group.message`
- `forbidden` 错误码（非成员访问、权限不足）

当前仍不应视为稳定契约：

- 已读、撤回、多端同步等扩展能力

## 当前错误语义

WebSocket `error` 事件当前使用这些稳定 code：

- `bad_request`：JSON 结构错误、空内容、缺少接收者、私聊自己、非法 cursor
- `not_found`：私聊目标用户不存在
- `payload_too_large`：文本消息超过 4096 字符
- `internal_error`：服务端内部错误，响应不会暴露底层数据库错误
- `not_implemented`：事件尚未实现

当前消息投递语义：

- 公共消息先落库，成功后广播给所有在线会话，包括发送者
- 私聊消息先落库，成功后发送给发送者和在线接收者
- 私聊接收者离线时仍然落库，后续由历史接口读取
- 实时投递失败不回滚已经成功的数据库写入
