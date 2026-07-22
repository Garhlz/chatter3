# Chatter3 Backend TODO

这个文件只描述后端执行线，适合单独开一个后端会话持续推进。

## 当前后端已具备

当前判断：

- 后端核心功能已基本完成
- 当前进入增强与收尾阶段，而不是继续补主路径缺口

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
- [x] `group.changed` 实时同步建群、加人和移除成员后的群导航状态
- [x] 群详情 / 成员列表 / 群历史统一成员可见性约束
- [x] 建群与批量加人成员写入具备事务回滚语义
- [x] `internal/auth` 单元测试（5 个用例）
- [x] `internal/config` 单元测试（5 个用例）
- [x] `internal/repository` 集成测试（user/message/group 共 8 个子用例）
- [x] v1 遗留死代码清理（tcp/dispatcher/codec）

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
- [x] 为群组 HTTP 错误路径补集成测试：缺失群组 404、非成员/非管理员 403
- [x] 为非成员访问群详情 / 成员列表补集成测试
- [x] 为建群 / 批量加人成员失败回滚补集成测试

## Backend Later

- [x] 群聊协议、持久化与实时广播
- [x] `internal/auth` 单元测试：JWT Sign/Validate/过期/错秘钥、bcrypt Hash/Check
- [x] `internal/config` 单元测试：必填字段、默认值、自定义值
- [x] `internal/repository` 集成测试：user/message/group CRUD
- [x] 移除 v1 遗留死代码：`transport/tcp/`、`dispatcher/`、`protocol/codec.go`、`config.TCPPort`
- [x] 引入 sqlc：手写 repository 迁移为 sqlc 生成代码，21 条查询全部类型安全

## Backend 产出目标

- 后端实时链路具备稳定语义和测试保护
- 错误码、输入约束、在线状态和消息事件可以被前端稳定依赖
- 群聊能力已可在当前协议上扩展
- 群权限边界和群成员写入一致性已有测试保护
- 核心包（auth、config、repository）已有测试覆盖

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
- `group.changed` 群导航资料变化事件
- `forbidden` 错误码（非成员访问、权限不足）
- 未知私聊对象、未知私聊文件接收者统一返回 `not_found`
- 附件历史/下载链路允许 `file_type` 为空并返回空字符串
- 不存在的群组资源统一返回 `not_found`
- 非成员/非管理员群组操作统一返回 `forbidden`
- 建群和批量加人的成员写入具备事务一致性

当前仍不应视为稳定契约：

- [x] 群文件上传、群成员下载权限与实时文件事件
- [x] 用户头像上传与资料媒体存储协议
- [x] 个人空间背景字段与更新协议
- 删群
- 已读、撤回和跨端已读状态同步等扩展能力

## 当前错误语义

WebSocket `error` 事件当前使用这些稳定 code：

- `bad_request`：JSON 结构错误、空内容、缺少接收者、私聊自己、非法 cursor
- `not_found`：私聊目标用户不存在、私聊文件上传目标不存在、目标资源不存在
- `forbidden`：非成员访问群组历史、非管理员修改群成员、越权下载文件
- `payload_too_large`：文本消息超过 4096 字符
- `internal_error`：服务端内部错误，响应不会暴露底层数据库错误
- `not_implemented`：事件尚未实现

当前消息投递语义：

- 公共消息先落库，成功后广播给所有在线会话，包括发送者
- 私聊消息先落库，成功后发送给发送者和在线接收者
- 私聊接收者离线时仍然落库，后续由历史接口读取
- 实时投递失败不回滚已经成功的数据库写入

当前群组写入语义：

- 建群会先创建群，再插入群主与初始成员
- 如果初始成员中途校验失败，整次建群回滚
- 批量加人如果中途校验失败，整次加人回滚
