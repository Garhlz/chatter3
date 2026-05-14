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

## Backend Next

- [ ] 为 WebSocket 事件路径补更细的测试覆盖
- [ ] 明确公共/私聊发送失败时的最终错误码约定
- [ ] 为 `chat.public.send` / `chat.private.send` 增加更明确的输入约束与错误语义
- [ ] 评估并决定消息链路是否继续保留在 `storage + transport/http/service.go`，还是归并到更正式的 service/repository 结构

## Backend Later

- [ ] `POST /api/v2/files/upload`
- [ ] `GET /api/v2/files/{fileId}`
- [ ] 文件元数据持久化与消息结构对齐
- [ ] 群聊协议、持久化与实时广播

## Backend 产出目标

- 后端实时链路具备稳定语义和测试保护
- 错误码、输入约束、在线状态和消息事件可以被前端稳定依赖
- 后续文件与群聊能力可以在当前协议上继续扩展
