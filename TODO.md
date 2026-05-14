# Chatter 后端重写 TODO


## 目标

用 Go 重写当前 Java 后端，在第一阶段尽量不改动现有 Qt/C++ 客户端，优先完成协议兼容和功能替换，再逐步推进协议升级与架构演进。

核心原则：

- 第一阶段优先替换后端，不优先重写客户端。
- 第一阶段优先兼容当前客户端协议，不优先做协议美化。
- 优先解决结构混乱、状态管理和可维护性问题，不优先追求极限并发。
- 先做单体、清晰、可测试的版本，再考虑更复杂的扩展方案。

## 当前建议结论

- 后端重写：是
- 客户端保留：是
- 后端语言：Go
- HTTP：使用 Go 标准库 `net/http`
- Web 框架：不使用 `gin`
- 数据库：PostgreSQL
- PostgreSQL 驱动：`pgx`
- SQL 访问方式：`sqlc`
- 数据迁移：`goose`
- 日志：`log/slog`
- 第一阶段通信协议：继续兼容当前 `TCP + JSON + 换行分隔`
- 中期目标协议：`WebSocket + JSON`
- 文件传输：继续走 HTTP

---

## 技术选型

这一节作为当前版本的固定决策，后续开发默认按这里执行，除非明确变更。

### 运行时与网络

- 语言：Go
- TCP 长连接：Go 标准库 `net`
- HTTP：Go 标准库 `net/http`
- JSON：Go 标准库 `encoding/json`
- 第一阶段不引入 `gin`

理由：

- 当前 HTTP 面不大，主要是健康检查和文件上传下载
- 核心复杂度在长连接、会话、消息路由，不在 REST 框架
- 优先减少额外抽象，避免 handler 再次吞掉业务结构

### 数据库与持久化

- 数据库：PostgreSQL
- 驱动与连接池：`pgx` / `pgxpool`
- SQL 组织方式：手写 SQL
- 代码生成：`sqlc`
- migration 工具：`goose`

理由：

- 这是长期维护更舒服的组合
- `sqlc` 很适合当前这种消息、群组、历史记录类查询
- 保留 SQL 控制力，避免 ORM 抽象过重

### 日志与配置

- 日志：`log/slog`
- 配置：环境变量 + 本地配置文件

### 中期扩展

- 中期协议升级目标：`WebSocket + JSON`
- 第一阶段不做 WebSocket 替换，只保留演进空间

---

## P0：先冻结协议和迁移边界

这一阶段优先级最高。不先把协议和行为边界整理出来，直接重写很容易把旧问题换个语言再写一遍。

### 代码精读补充发现（已从 Java/Qt 源码确认）

- TCP 端口：`9999`，HTTP 端口：`8080`
- Java 后端使用 SQLite，Go 后端迁移到 PostgreSQL，schema 已完整整理
- `message_type` DB 字段整数含义：0=文本, 1=文件, 2=图片, 3=系统
- `friendships` 表存在于 schema，但当前客户端和服务端均未使用，P1 阶段跳过
- JWT Claims：`subject=username`, `jti=userId`，算法 HMAC-SHA256，密钥最少 32 字节
- 在线状态双轨管理：`ChatLobbyService` 内存 Set + `ChatSocketServer` ConcurrentHashMap，数据库 status 字段不可信，Go 后端只用内存态
- Java `LocalDateTime` 在无 `@JsonFormat` 时序列化为数组（如 `[2026,5,14,15,0,0]`），Go 后端统一使用 ISO 字符串，客户端实际读的字段（如 `timestamp`）本身已经是字符串，数组问题只在嵌套 User 对象的 `createdAt`/`lastLoginAt`/`lastHeartbeat` 字段，Go 新版直接改为 ISO 字符串即可
- 文件上传限制：50MB，存储目录可配置
- GROUP_CHAT 消息客户端会发 userId/username/nickname，Go 后端忽略客户端提供的这些字段，直接从会话获取，不做回传校验
- 历史消息中文件消息的 `content` 是 JSON 字符串（二次 parse），实时文件消息 `content` 是对象，这是历史遗留不一致，Go 后端维持兼容

### TODO

- [x] 盘点当前客户端和服务端之间所有消息类型
- [x] 记录每种消息的请求字段、响应字段、可选字段、服务端生成字段
- [x] 记录客户端依赖的隐式行为
  - [x] 登录成功后消息下发顺序
  - [x] 心跳响应格式
  - [x] 在线/离线列表初始化时机
  - [x] 历史消息加载时机
  - [x] 群组信息和群历史同步顺序
- [x] 明确哪些旧行为是兼容目标，哪些旧行为是历史错误，不保留
- [x] 输出协议文档 `docs/protocol-v1.md`
- [ ] 准备一组真实请求/响应样本，作为后续回归基线

### 产出

- 一份清晰的协议文档
- 一组可用于回归的消息样本
- 一份“必须兼容”和“允许修正”的行为清单

### 备注

第一阶段不要急着切 WebSocket。先把现有 TCP 协议跑通，否则迁移风险太高。

---

## P1：搭 Go 后端骨架 ✅

先把新后端项目立起来，但只做最小可运行骨架，不要一开始就把聊天、群组、文件全塞进去。

### TODO

- [x] 新建目录 `backend-go/`
- [x] 初始化 Go module（`github.com/elaine/chatter2/backend-go`，Go 1.22）
- [x] 搭建基础目录结构
- [x] 加入配置模块（`internal/config/`，环境变量驱动，`DATABASE_URL` / `JWT_SECRET` 为必填）
- [x] 加入基础日志模块 `log/slog`（TextHandler，DEBUG 级别）
- [x] 初始化 PostgreSQL 连接配置（`DATABASE_URL` 环境变量）
- [x] 接入 `pgxpool`（`internal/storage/db.go`，含 ping 验证）
- [x] 初始化 `sqlc` 目录结构（`sql/queries/`，`sqlc.yaml`）
- [x] 初始化 `goose` migration 目录（`migrations/001_initial.sql`）
- [x] 加入 TCP 监听器（`internal/transport/tcp/server.go`，context 驱动优雅停止）
- [x] 实现基于换行分隔的 JSON 编解码（`internal/protocol/codec.go`，10000 字节限制）
- [x] 增加基础 HTTP 服务
  - [x] `GET /health` 返回 `{"status":"ok"}`
  - [x] `POST /api/files/upload` 占位 501
  - [x] `GET /api/files/download/{storedFileName}` 占位 501
- [x] 加入优雅关闭逻辑（`signal.NotifyContext` + WaitGroup）

### 实际目录结构

```text
backend-go/
  cmd/server/main.go
  internal/
    config/config.go
    dispatcher/dispatcher.go
    protocol/types.go codec.go
    session/manager.go
    storage/db.go
    transport/
      tcp/server.go conn.go
      http/server.go
  sql/queries/users.sql messages.sql groups.sql
  migrations/001_initial.sql
  sqlc.yaml
  Makefile
  go.mod go.sum
```

### 产出

- `go build ./...` 和 `go vet ./...` 均通过（2026-05-14）
- 骨架具备 TCP accept + 每连接 reader/writer goroutine + 有界发送队列（64）
- 所有业务 handler 有骨架占位，P3~P6 逐步填充

---

## P2：确定新后端的模块边界 ✅

这是结构设计阶段，优先级很高。你当前 Java 后端最主要的问题就是职责混乱，新版本不能重复这个问题。

### 模块划分

#### `transport/tcp`

负责：

- 接受连接
- 按行读取 JSON
- 发送消息
- 管理连接关闭
- 超时控制

不负责：

- 鉴权
- 聊天业务
- 数据库

#### `protocol`

负责：

- 消息结构定义
- JSON 编解码
- 字段校验
- 错误响应格式
- `type` 到处理器输入的映射

#### `session`

负责：

- 连接和用户绑定关系
- 在线状态
- 心跳时间
- 用户上线/下线
- 断线清理

#### `service`

负责：

- 登录/注册
- 消息持久化
- 历史消息加载
- 群组业务
- 文件元数据业务

#### `repository`

负责：

- 封装 `sqlc` 生成代码
- 数据库访问
- 持久化对象读写

#### `storage`

负责：

- 初始化 `pgxpool`
- 数据库生命周期管理
- migration 执行入口

#### `dispatcher`

负责：

- 根据消息类型分发请求
- 调用 service
- 组装返回事件

### TODO

- [x] 明确每层职责（已体现在代码包结构中，各包注释说明职责）
- [x] 定义统一消息外层结构（`protocol.Envelope`，与 Java `MessageDTO` 字段对齐）
- [x] 定义统一错误结构（`protocol.ErrorEnvelope(msg)`）
- [x] 约定内部依赖方向：`transport → dispatcher → service → repository`（dispatcher 是唯一边界）
- [x] 约定 `sqlc` 生成代码放置位置：`internal/repository/sqlcgen/`（P3 执行 `make sqlc-gen` 后生成）
- [x] 约定 migration 执行方式：显式命令 `make migrate-up`，不在启动时自动执行

### 产出

- `dispatcher` 是 transport 层与业务层的唯一边界，handler 全部独立函数，结构清晰
- 依赖方向单向，不存在业务层反向调用 transport 的情况

---

## P3：先做登录、注册、会话和心跳 ← 当前阶段

这是第一阶段真正的功能落地点，优先级最高。因为客户端只有这几块先通了，后面聊天功能才有验证基础。

### TODO

- [ ] 实现用户注册
- [ ] 实现用户登录
- [ ] 实现 JWT 生成与校验
- [ ] 实现密码哈希校验
- [ ] 实现 `users` 表 migration
- [ ] 实现 `sqlc` 用户查询
- [ ] 实现 `users repository`
- [ ] 实现会话管理器
  - [ ] `connection -> session`
  - [ ] `username -> session`
  - [ ] `userId -> session`
- [ ] 实现心跳处理
- [ ] 实现断线清理
- [ ] 实现登录成功后的基础初始化消息

### 会话管理要求

- 连接建立时是匿名连接
- 登录成功后才变成认证会话
- 在线状态以会话管理器为准，不以数据库字段为准
- 清理逻辑必须幂等

### 产出

- Qt 客户端可以连接 Go 后端
- 可以注册
- 可以登录
- 可以保持在线
- 可以正确掉线/超时/清理

---

## P4：实现大厅聊天

大厅聊天是第一个真正的业务闭环，优先级高于私聊和群聊，因为最简单，也最适合作为第一批联调对象。

### TODO

- [ ] 实现大厅消息发送
- [ ] 实现大厅消息广播
- [ ] 实现大厅消息持久化
- [ ] 实现登录后大厅历史消息同步
- [ ] 实现 `messages` 表 migration
- [ ] 实现 `sqlc` 大厅消息查询与写入
- [ ] 增加消息大小限制
- [ ] 增加格式错误处理

### 产出

- 当前客户端可以正常发送大厅消息
- 其他在线客户端可以收到广播
- 登录后可以看到历史大厅消息

---

## P5：实现私聊

大厅聊天跑通后，再做私聊，因为私聊需要更准确的用户会话路由。

### TODO

- [ ] 实现私聊消息发送
- [ ] 实现私聊消息持久化
- [ ] 实现在线用户实时投递
- [ ] 实现登录后私聊历史同步
- [ ] 实现 `sqlc` 私聊历史查询
- [ ] 校验接收方存在性
- [ ] 处理接收方离线场景

### 产出

- 当前客户端可正常进行私聊
- 在线用户能实时收到私聊
- 离线历史能在重新登录后加载

---

## P6：实现群组与群聊

群聊复杂度明显更高，放在大厅和私聊后面做。

### TODO

- [ ] 实现群组创建
- [ ] 实现群组删除
- [ ] 实现群成员添加
- [ ] 实现群成员移除
- [ ] 实现群组信息同步
- [ ] 实现群聊消息发送
- [ ] 实现群聊消息持久化
- [ ] 实现群历史同步
- [ ] 实现 `groups` / `group_members` migration
- [ ] 实现 `sqlc` 群组与成员查询
- [ ] 实现兼容当前客户端的群组广播消息

### 产出

- 当前客户端的群组相关功能可对接新后端

---

## P7：实现文件传输对接

保留当前“聊天走长连接，文件走 HTTP”的整体思路，这个方案对桌面客户端足够实用。

### TODO

- [ ] 实现文件上传接口
- [ ] 实现文件下载接口
- [ ] 实现文件元数据存储
- [ ] 实现文件消息兼容格式
- [ ] 实现 `files` 相关 migration
- [ ] 实现 `sqlc` 文件元数据读写
- [ ] 确认客户端当前文件传输管理器所依赖的字段

### 产出

- 当前客户端可以继续上传下载文件

---

## P8：补全测试和回归手段

这是必须做的，不然你只是把一套旧代码换成另一套没把握的新代码。

### 单元测试

- [ ] 协议编解码测试
- [ ] 字段校验测试
- [ ] JWT 测试
- [ ] 会话生命周期测试
- [ ] 分发逻辑测试
- [ ] repository 测试

### 集成测试

- [ ] 登录成功/失败
- [ ] 重复登录
- [ ] 心跳超时
- [ ] 大厅广播
- [ ] 私聊投递
- [ ] 群组增删成员
- [ ] 文件元数据流程

### 人工联调清单

- [ ] 登录
- [ ] 注册
- [ ] 大厅聊天
- [ ] 私聊
- [ ] 群聊
- [ ] 文件上传下载
- [ ] 掉线重连

### 产出

- 有一套能支撑迁移的基础测试网

---

## P9：协议迁移到 WebSocket

这是中期目标，不是第一阶段目标。等 Go 后端已经稳定替换旧 Java 后端后，再推进。

### 推荐方向

最终推荐主协议为：

- `WebSocket + JSON`

保留：

- `type`
- `requestId`
- `timestamp`
- `status`
- `payload`

文件继续使用 HTTP。

### 推荐消息外层

```json
{
  "type": "PRIVATE_CHAT",
  "requestId": "uuid",
  "token": "jwt",
  "timestamp": "2026-05-14T15:00:00Z",
  "payload": {}
}
```

### TODO

- [ ] 在 Go 后端中把 transport 层抽象干净
- [ ] 保证 TCP 和 WebSocket 可以共用同一套业务层
- [ ] 增加 WebSocket 接入层
- [ ] 逐步整理协议字段
- [ ] 为未来 Web 或移动端客户端预留接入能力

### 备注

现在不要为了 WebSocket 提前打乱第一阶段兼容计划。

---

## P10：数据库策略

### 当前固定选择

- 数据库：PostgreSQL
- 驱动：`pgx`
- 查询代码生成：`sqlc`
- migration：`goose`

### 设计要求

- 所有业务查询优先进入 `sql/queries/*.sql`
- 由 `sqlc` 生成类型安全的查询代码
- `repository` 层只封装生成代码，不手写大量重复 `Scan`
- migration 文件必须独立版本管理
- 业务逻辑不得直接拼接 schema 变更 SQL

### TODO

- [x] 建立 `goose` migration 目录（`migrations/`，`make migrate-up` 可执行）
- [x] 设计初始 schema（`migrations/001_initial.sql`，与 Java SQLite schema 对齐，迁移到 PostgreSQL 语法）
  - [x] `users`（`BIGSERIAL`, `TIMESTAMPTZ`，无 `friendships` 依赖）
  - [x] `messages`（含 `receiver_id` 私聊、`group_id` 群聊、`message_type` 整数）
  - [x] `groups`
  - [x] `group_members`（含 `role` 0/1/2，ON DELETE CASCADE）
  - [x] `files`（`stored_file_name UNIQUE`）
- [x] 配置 `sqlc.yaml`（PostgreSQL engine，输出到 `internal/repository/sqlcgen/`）
- [x] 建立第一批查询文件
  - [x] 用户查询（`sql/queries/users.sql`：GetByUsername/ID、CreateUser、UpdateLastLogin、ListAll）
  - [x] 消息查询（`sql/queries/messages.sql`：大厅/私聊/群聊历史、文件元数据读写）
  - [x] 群组查询（`sql/queries/groups.sql`：创建/删除/成员管理/用户所属群组）
- [ ] 建立 PostgreSQL 本地开发环境（下一步）

---

## P11：上线前的加固项

这些不是最早该做的，但在功能替换完成后必须补上。

### TODO

- [ ] 统一错误码
- [ ] 限制最大消息长度
- [ ] 增加连接读写超时
- [ ] 增加基础限流
- [ ] 增加结构化日志
- [ ] 增加基础指标
- [ ] 梳理异常恢复策略
- [ ] 明确重连语义

---

## 推荐的 Go 并发模型

第一阶段建议保持朴素：

- 每个连接一个 reader goroutine
- 每个连接一个 writer goroutine
- 每个连接一个有界发送队列
- 会话管理器用 mutex 保护，先不要过度设计

不要一开始就做：

- 自定义 reactor
- 分布式 session
- 多节点 presence
- MQ 驱动的复杂架构

---

## 迁移实施顺序

下面是建议的实际落地顺序，按优先级从高到低：

1. 协议冻结与文档化
2. Go 项目骨架
3. 登录/注册/JWT/会话/心跳
4. 大厅聊天
5. 私聊
6. 群组与群聊
7. 文件传输
8. 测试与回归
9. WebSocket 接入
10. 数据库升级
11. 性能和部署优化

---

## 第一周建议计划

- [x] 建 `backend-go/`
- [x] 初始化 Go module
- [x] 从当前 Java/Qt 代码提取协议
- [x] 写 `docs/protocol-v1.md`
- [x] 固定技术选型到文档
- [ ] 建立 PostgreSQL 本地环境
- [ ] 初始化 `pgx` 连接（骨架已有，需实际 DB 验证）
- [ ] 初始化 `sqlc`（配置完成，需 `make sqlc-gen` 生成代码）
- [ ] 初始化 `goose`（migration 文件完成，需 `make migrate-up` 执行）
- [x] 实现 TCP 监听
- [x] 实现基础消息 envelope 解码
- [ ] 实现 `LOGIN`
- [ ] 实现 `REGISTER`
- [ ] 实现 `HEARTBEAT`
- [ ] 接现有 Qt 客户端做第一次登录联调

---

## 后续开发计划

下面是按依赖关系排好的实际开发顺序。原则是先打通基础设施，再打通认证和会话，再做单类消息，最后做复杂业务。

### 阶段 1：仓库初始化与基础设施

目标：

- 项目能启动
- PostgreSQL 能连通
- migration 能跑
- `sqlc` 能生成代码

任务：

1. 新建 `backend-go/`
2. 初始化 `go.mod`
3. 建基础目录
4. 接入 `log/slog`
5. 接入 `pgxpool`
6. 建 `migrations/`
7. 建 `sqlc.yaml`
8. 建 `sql/queries/`
9. 跑通第一条 migration
10. 跑通第一个 `sqlc generate`

完成标准：

- 本地 `go run ./cmd/server` 可启动
- `/health` 返回正常
- 数据库 migration 可执行
- `sqlc` 成功生成查询代码

### 阶段 2：协议兼容骨架

目标：

- TCP 层可接收并解析客户端现有消息

任务：

1. 实现 TCP accept loop
2. 实现逐行读取 JSON
3. 实现基础消息 envelope
4. 实现消息类型分发器
5. 实现统一错误响应

完成标准：

- 能打印并识别 `LOGIN` / `REGISTER` / `HEARTBEAT`
- 非法 JSON 和非法消息类型有明确错误响应

### 阶段 3：认证与会话

目标：

- 当前 Qt 客户端可完成注册、登录、保活

任务：

1. 建 `users` schema
2. 写用户相关 `sqlc` 查询
3. 实现注册服务
4. 实现登录服务
5. 实现 JWT
6. 实现 session manager
7. 实现 heartbeat
8. 实现断线清理

完成标准：

- Qt 客户端可登录成功
- 能收到 `LOGIN(success)`
- 心跳正常
- 重复登录和无效 token 行为正确

### 阶段 4：大厅聊天

目标：

- 大厅消息可发、可存、可同步

任务：

1. 建 `messages` schema
2. 写大厅消息相关 `sqlc` 查询
3. 实现大厅消息保存
4. 实现广播
5. 实现登录后大厅历史同步

完成标准：

- 两个客户端可在大厅互发消息
- 重登后能看到大厅历史

### 阶段 5：私聊

目标：

- 私聊可发、可存、可同步

任务：

1. 写私聊查询
2. 实现私聊消息保存
3. 实现在线投递
4. 实现私聊历史同步

完成标准：

- 在线私聊正常
- 离线历史正常

### 阶段 6：群组与群聊

目标：

- 群组管理和群聊与现有客户端兼容

任务：

1. 建 `groups` / `group_members`
2. 写群组相关 `sqlc` 查询
3. 实现群创建、删除、加人、踢人
4. 实现 `GROUP_RESPONSE`
5. 实现 `GROUP_INFO`
6. 实现 `GROUP_BROADCAST`
7. 实现群历史同步

完成标准：

- 当前客户端群聊功能可跑通

### 阶段 7：文件传输

目标：

- 文件上传下载与现有客户端兼容

任务：

1. 建 `files` schema
2. 写文件元数据查询
3. 实现上传接口
4. 实现下载接口
5. 实现 `FILE` 消息推送
6. 兼容历史文件消息格式

完成标准：

- 当前客户端可上传、接收、下载文件

### 阶段 8：回归与加固

目标：

- 第一阶段替换可用

任务：

1. 建回归样本
2. 建单元测试
3. 建集成测试
4. 梳理错误码
5. 加入消息大小限制和超时
6. 梳理重连和异常恢复语义

完成标准：

- 有一套最小可靠回归网
- 可以作为 Java 后端替代版本使用

---

## 额外提醒

这个重写项目最容易失败的点，不是语言选错，也不是协议选错，而是：

- 没有先冻结协议
- 一开始就重做所有功能
- 一边重写一边改客户端
- 过早追求优雅架构

第一阶段的目标应该非常务实：

**先用 Go 做出一个结构清楚、协议兼容、能替掉旧 Java 后端的版本。**
