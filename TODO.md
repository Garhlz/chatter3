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
- [x] 根 `flake.nix` 已拆成多 shell：
  - [x] `backend`
  - [x] `frontend`
  - [x] `full`
  - [x] `legacy-client`
- [x] 协作规范文档：`AGENT.MD`

### 已验证

- [x] `npm install`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `cargo check --manifest-path frontend/src-tauri/Cargo.toml`
- [x] `nix flake show .`

### 尚未完成

- [x] 后端真实 `v2` 认证实现
- [x] 后端历史消息查询实现
- [ ] 后端 WebSocket 实时事件实现
- [x] 前端与后端真实联调（HTTP 登录 / 注册 / 历史）
- [ ] 文件上传下载打通
- [ ] 群聊路线决策与实现

### 当前阶段判断

- `P2` 已完成：HTTP 认证与初始历史同步已经形成闭环
- 当前阶段为 `P3`：把“真实在线状态 + WebSocket 实时事件”接通
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
- [x] 将根 `flake.nix` 改为多 shell 结构
- [x] 修正 Nix shell 可解析性问题

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
- Nix 环境已不再绑定旧 Qt 主线
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

## P3：接通 WebSocket 实时事件 ← 当前阶段

当认证与初始同步跑通后，再接通实时能力与真实在线状态。

### 当前目标

把“登录后可看历史”推进到“登录后进入真实在线会话”。  
这个阶段一旦完成，前端才能真正拥有：

- 可靠的连接状态
- 真实的在线用户语义
- 实时消息追加能力
- 后续文件/群聊/通知的承载通道

### TODO：后端

- [ ] 实现 `GET /api/v2/ws` 握手鉴权
- [ ] 实现 `GET /api/v2/users/online` 的真实在线语义
- [ ] 实现 `session.ping` / `session.pong`
- [ ] 实现匿名连接到认证会话的转换
- [ ] 实现 `connection -> session`
- [ ] 实现 `username -> session`
- [ ] 实现 `userId -> session`
- [ ] 在线状态以内存会话管理器为准
- [ ] 清理逻辑保持幂等
- [ ] 实现统一错误事件 `error`
- [ ] 实现 `presence.online` / `presence.offline`
- [ ] 实现 `chat.public.message`
- [ ] 实现 `chat.private.message`

### TODO：前端

- [ ] 前端接入连接状态、重连、错误处理
- [ ] 登录成功后建立 WebSocket，而不是停在 HTTP-only 模式
- [ ] 将实时消息追加到当前消息列表
- [ ] 将 presence 事件映射为在线用户列表
- [ ] 把“未连接 / 连接中 / 已连接 / 出错”状态显示得更明确

### 分阶段落地建议

1. 先做 `ws` 握手 + `ping/pong`
2. 再做 `presence.online/offline`
3. 然后接 `chat.public.message`
4. 最后接 `chat.private.message`

### 产出

- 前端可展示真实连接状态
- 实时消息可以追加到 UI
- 在线状态变化可以被前端消费

---

## P4：公共聊天闭环

P3 完成后，这一阶段的重点不再是“能不能收消息”，而是“能不能由前端真正发出消息并形成广播闭环”。

### TODO

- [ ] 实现公共聊天发送
- [ ] 实现公共聊天持久化
- [ ] 实现公共聊天广播
- [ ] 消息结构与历史接口保持一致
- [ ] 增加消息大小限制与基础格式校验

### 产出

- 公共聊天可以发送、落库、广播、回放

---

## P5：私聊闭环

私聊放在公共聊天之后，是因为它需要更稳定的在线会话路由与错误语义。

### TODO

- [ ] 实现私聊发送
- [ ] 实现私聊持久化
- [ ] 实现在线用户实时投递
- [ ] 实现离线历史回放
- [ ] 校验接收方存在性

### 产出

- 私聊可以完整收发
- 离线后重新登录可恢复历史

---

## P6：文件传输

文件传输继续保持“聊天元数据走协议、文件内容走 HTTP”的策略，不把大文件塞进 WebSocket。

### TODO

- [ ] 实现 `POST /api/v2/files/upload`
- [ ] 实现 `GET /api/v2/files/{fileId}`
- [ ] 实现文件元数据持久化
- [ ] 让文件消息结构与 `protocol-v2` 对齐
- [ ] 前端接入文件选择、上传、下载与错误反馈

### 产出

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
