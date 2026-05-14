# Chatter3 重构 TODO

## 目标

用 Go 重写当前 Java 后端，并用 `Tauri + React + Vite` 重写桌面客户端。

当前默认路线已经确定：

- 新客户端协议优先：`HTTP + JSON` + `WebSocket + JSON`
- 旧 Qt 客户端冻结，只保留为行为参考
- 旧 `TCP + JSON + 换行分隔` 协议只保留为历史兼容资料
- 当前采用“Linux 主开发 + Windows 桌面验证”策略，优先保证：
  - Web 前端可单独通过 `Vite` 启动
  - `Tauri` Rust 壳可通过 `cargo check`
  - 后端 `v2` 接口可以逐步联调
  - 桌面壳可在 Windows 本地进行早期验证
  - 代码结构从现在起避免明显的 Linux-only 假设
  - 前后端默认都使用系统原生工具链
  - PostgreSQL 本地开发默认通过 Docker 启动

---

## 当前状态摘要

### 已完成

- [x] 旧协议考古文档：`docs/protocol-v1.md`
- [x] 新协议主文档：`docs/protocol-v2.md`
- [x] Go 后端基础骨架：`backend-go/`
- [x] v2 协议 Go 类型骨架：`backend-go/internal/protocol/v2/`
- [x] v2 HTTP 占位端点：
  - [x] `POST /api/v2/auth/register`
  - [x] `POST /api/v2/auth/login`
  - [x] `GET /api/v2/users/online`
  - [x] `GET /api/v2/chats/public/history`
  - [x] `GET /api/v2/chats/private/{username}/history`
  - [x] `POST /api/v2/files/upload`
  - [x] `GET /api/v2/files/{fileId}`
  - [x] `GET /api/v2/ws`
- [x] 新前端骨架：`frontend/`
- [x] Web UI 脚手架：`React + Vite`
- [x] 桌面壳脚手架：`Tauri v2`
- [x] 已移除项目内 Nix / direnv 入口
- [x] 协作规范文档：`AGENT.MD`

### 已验证

- [x] `npm install`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `cargo check --manifest-path frontend/src-tauri/Cargo.toml`

### 尚未完成

- [x] 后端真实 `v2` 认证实现
- [x] 后端历史消息查询实现
- [x] 后端 WebSocket 实时事件实现
- [x] 前端与后端真实联调（HTTP 登录 / 注册 / 历史）
- [ ] 文件上传下载打通
- [ ] 群聊路线决策与实现

### 当前阶段判断

- `P2` 已完成：HTTP 认证与初始历史同步已经形成闭环
- 当前阶段为 `P3`：把“真实在线状态 + WebSocket 实时事件”接通
- 执行层 TODO 已拆分为：
  - `frontend/TODO.md`
  - `backend-go/TODO.md`
- 当前最大的结构风险不是功能缺失，而是：
  - `P2/P3` 的职责边界容易再次混回去
  - 容易把“历史拉取”和“实时事件”混在同一层
  - 容易为了桌面壳而把本应留在 Web 层的业务逻辑塞进 Tauri Rust 层

---

## P0：冻结 protocol-v2 与系统边界 ✅

这一阶段的目标是把新客户端契约与新工程边界写死，避免前后端各写各的。

### 已完成

- [x] 新协议文档 `docs/protocol-v2.md`
- [x] 统一 HTTP 成功/失败响应结构
- [x] 统一 WebSocket 事件外层结构
- [x] 公共聊天、私聊、在线状态、错误事件的基础 payload 结构
- [x] 后端 `v2` Go 类型骨架
- [x] 后端 `v2` HTTP 路由占位
- [x] 前端 `protocol-v2` 对应的 API client / WebSocket client scaffold

### 待完成

- [ ] 为前端补一份基于 `protocol-v2` 的联调样本
- [ ] 决定群聊进入 `v2.1` 还是单独 `v3`

### 产出

- 一份正式的新客户端协议文档
- 一套前后端都可直接依赖的接口命名
- 一套可持续扩展的资源/事件模型

---

## P1：整理开发环境与工程骨架 ✅

这一阶段的目标是把新路线真正落到仓库里，而不是停留在文档层。

### 已完成

- [x] 新建 `frontend/` 独立目录，不复用旧 Qt 工程
- [x] 建立 `React + Vite` Web 前端脚手架
- [x] 建立 `Tauri v2` Rust 桌面壳
- [x] 建立 Tauri capability 配置与可用图标
- [x] 建立根 `.gitignore`
- [x] 前后端都已切回系统原生工具链
- [x] 后端数据库切换为 Docker 本地开发流程

### 当前开发约束

- 当前主要在远程 Linux 环境开发
- 同时允许在 Windows 本地验证 Tauri 桌面壳
- 因此首要目标不是在远程环境里强行跑桌面窗口，而是：
  - Web UI 可启动
  - Rust 壳可编译检查
  - 前后端协议可联调
- 第一阶段要求“结构可跨平台”，但不要求三平台立即达到同等完成度

### 产出

- 新前端工程已可单独演进
- 本地开发不再依赖 Nix / direnv
- 后续可以开始做真实业务联调

### 这一阶段留下的约束

- 前端默认先通过 `Vite` 调试，而不是依赖桌面壳
- `Tauri` Rust 层当前只承担桌面能力边界，不承担聊天主协议
- 所有“认证/历史/实时”的主流程都应优先体现在 Web 层与 Go 后端中

---

## P2：实现 v2 认证与初始同步 ✅

这一阶段已经完成。当前已经具备“注册 / 登录 / 公共历史 / 私聊历史”的 HTTP 联调闭环。

### 已完成

- [x] 实现 `POST /api/v2/auth/register`
- [x] 实现 `POST /api/v2/auth/login`
- [x] 建立正式 `auth -> repository -> service -> transport` 用户链路
- [x] 实现 JWT 生成与校验
- [x] 实现密码哈希与校验
- [x] 实现手写 `users repository`
- [x] 实现 `GET /api/v2/chats/public/history`
- [x] 实现 `GET /api/v2/chats/private/{username}/history`
- [x] 明确首版基于 `message_id` 的 cursor 分页策略
- [x] 前端登录页真正调用 `/api/v2/auth/login`
- [x] 将 token 写入前端认证状态
- [x] 登录成功后拉取公共聊天历史
- [x] 为私聊历史提供真实请求入口
- [x] 注册成功后可直接转入登录流程
- [x] 前端对未实现能力不再强行触发 WebSocket 错误

### 调整说明

- 在线状态与实时会话不再视为 `P2` 的完成条件。
- 新路线下，`online users`、`presence`、`connection -> session` 的真正完成依赖 WebSocket 常驻连接，因此转入 `P3`。
- 当前阶段优先保证 HTTP 认证与历史同步闭环可用，而不是伪造“在线状态已经真实可用”的假象。
- 认证侧分层已完成一次小型清理：
  - `internal/auth/` 负责 JWT 与密码哈希
  - `internal/repository/user.go` 负责 `users` 表访问
  - `internal/service/user.go` 负责注册/登录业务规则
  - `internal/transport/http/server.go` 只负责 HTTP 输入输出
- 消息历史侧暂时保留在 `storage + transport/http/service.go` 路径。
  - 原因不是“这就是最终结构”，而是仓库里旧的 `message` 实验代码仍基于错误 schema。
  - 在 `P3/P4` 接实时消息前，先保持当前可工作的历史链路稳定，比提前统一目录更重要。
- `sqlc` 暂未接入当前实现；当前阶段先用手写 repository 跑通 `P2`，后续再决定是否切回 `sqlc`。
- `P2` 的成功标准是“用户能通过 HTTP 进入一个可用的首屏状态”，不是“整个聊天系统已经实时化”。

### 产出

- 可以注册
- 可以登录
- 可以拉到第一批公共历史消息
- 可以按用户名拉取私聊历史
- 前端已进入真实 HTTP 联调状态

---

## 执行导航

- 前端执行线：见 [frontend/TODO.md](/home/elaine/work/projects/chatter3/frontend/TODO.md)
- 后端执行线：见 [backend-go/TODO.md](/home/elaine/work/projects/chatter3/backend-go/TODO.md)

这份根文档继续保留项目总路线、阶段背景和共享事项；具体执行请优先看对应子目录中的 TODO。

---

## Shared Later

前后端都不应在当前两个执行会话里抢着做的共享事项：

- [ ] 为前端补一份基于 `protocol-v2` 的联调样本
- [ ] 决定群聊进入 `v2.1` 还是单独 `v3`
- [ ] 文件传输最终体验与协议细节收敛

### Shared 产出

- 新前端可以上传下载文件
- 文件消息不再依赖旧 Qt 协议的历史包袱

---

## P7：群聊路线

群聊暂不进入当前主线，先等认证、历史、公共聊天、私聊、文件跑通。

### TODO

- [ ] 决定群聊进入 `v2.1` 还是 `v3`
- [ ] 定义群聊资源模型与实时事件
- [ ] 决定是否沿用旧群组语义还是重新抽象

---

## P8：测试与回归

这一阶段不仅是补测试，更是把当前“能跑”收束成“可持续演进”。

### 单元测试

- [ ] `protocol-v2` JSON 结构测试
- [ ] JWT 测试
- [ ] 密码哈希测试
- [ ] 会话生命周期测试
- [ ] repository 测试
- [ ] WebSocket 事件编解码测试

### 集成测试

- [ ] 注册成功/失败
- [ ] 登录成功/失败
- [ ] 在线用户查询
- [ ] 公共历史查询
- [ ] 私聊历史查询
- [ ] WebSocket 握手成功/失败
- [ ] 心跳与断线清理

### 前端联调清单

- [ ] 登录
- [ ] 在线用户列表
- [ ] 公共聊天历史
- [ ] 私聊历史
- [ ] 公共聊天实时消息
- [ ] 私聊实时消息
- [ ] 文件上传下载

---

## 历史参考：旧 Qt / TCP 路线

下面这些内容仍然有参考价值，但不再是当前默认执行主线：

- 旧协议：`TCP + JSON + 换行分隔`
- 旧客户端：Qt / C++
- 旧登录后初始化消息顺序
- 旧群聊消息结构
- 旧文件消息历史兼容行为

相关资料保留在：

- `docs/protocol-v1.md`
- `client/`
- `server/`

这些内容现在主要用于：

- 对照旧行为
- 排查历史设计包袱
- 在必要时补迁移说明

---

## 近期建议顺序

1. 实现 `GET /api/v2/ws` 握手与 `session.ping/pong`
2. 让前端在登录成功后进入真实 WebSocket 会话
3. 接通 `presence.online/offline` 与真实在线用户列表
4. 实现公共聊天实时消息
5. 实现私聊实时消息
6. 再进入文件传输和群聊策略
