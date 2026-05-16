# Chatter3 开发结构说明

这份文档不是产品协议文档，而是帮助开发时快速建立“代码层面脑图”的说明。

如果你后面忘了为什么前端不直接在 `Tauri` Rust 层里做聊天逻辑，或者为什么 `P2` 和 `P3` 要拆开，可以先回来看这里。

## 1. 当前系统的三层边界

### Web 前端层

位置：

- `frontend/src/`

职责：

- 渲染界面
- 管理登录态、历史消息、当前视图状态
- 调用 HTTP 接口
- 管理 WebSocket 连接

当前已落地：

- 登录 / 注册 / 历史拉取的 HTTP 路径
- 远程开发下通过 `Vite proxy` 访问后端
- `realtime client`
- 基于 `Workbench` 的桌面客户端主界面重构，并接入默认中文、偏暖 `Catppuccin Latte` / `One Dark` 双主题和跟随系统模式
- 公共消息 / 私聊消息的基础发送 UI
- `zustand` 状态层
- 前端派生会话列表
- 自动重连与重连提示
- 发送中 / 失败 / 重试 / 已确认状态
- 历史分页 cursor 状态与加载更早入口
- `requestId` 优先的发送确认，兼容当前近时间内容匹配 fallback
- token 失效、重连耗尽、历史分页失败的基础错误恢复
- UI 已拆分到 `frontend/src/components`
- 桌面快捷键集中在 `frontend/src/hooks/useKeyboardShortcuts.ts`
- 会话切换优先使用本地缓存，显式 reload 才刷新历史

当前仍待落地：

- 后端正式保证消息事件回传 `requestId` 后，移除前端近时间内容匹配 fallback
- 群文件上传（当前后端上传 API 不支持 groupID 参数）
- 删群（后端未实现 DELETE /api/v2/groups/{groupID}）

已落地（2026-05）：

- `chatStore.ts` 已拆分 helper 函数到 `helpers.ts`，store 主体精简
- 文件上传/下载 HTTP 闭环与文件消息实时事件展示
- 群聊界面（创建群、群会话列表、群消息收发、成员管理）
- `Ctrl/Cmd+G` 聚焦群创建输入框

更新：

- 登录成功后的 WebSocket 建连与基础事件消费已经接上
- 当前文本聊天协议（公共/私聊/群聊）可作为前端稳定开发基线
- 文件上传下载与文件消息事件已稳定
- 不稳定协议范围是：群文件上传、删群、已读、撤回、多端同步

不负责：

- 桌面文件系统细节
- 原生窗口能力
- 后端鉴权实现

### Tauri Rust 层

位置：

- `frontend/src-tauri/`

当前已落地（2026-05）：

- 系统托盘：关闭窗口隐藏到托盘而非退出，左键点击显示/隐藏，右键菜单 Show/Reconnect/Quit
- 单实例：重复启动会激活已有主窗口，避免创建第二套桌面会话
- 托盘菜单：Show 激活主窗口，Reconnect 激活窗口并通知前端重连，Quit 退出应用
- 窗口状态持久化：自动记住位置、大小、最大化状态，重启恢复
- 窗口状态事件：窗口聚焦/隐藏/恢复同步到前端，用于通知策略
- 原生通知：新消息 OS 级推送，浏览器 Notification API fallback；当前仅非当前会话且窗口未聚焦/不可见时触发
- 偏好与 Token 存储：Tauri 环境下用 `tauri-plugin-store` 持久化语言和主题；JWT 通过 Rust `keyring` 接系统凭据库，覆盖 Windows Credential Manager、macOS Keychain、Linux Secret Service / libsecret；启动时迁移旧 Tauri store 或旧 `localStorage` 中的 JWT，并删除旧位置 token
- SQLite 本地消息持久化：通过 `rusqlite` bundle 在 `app_data_dir/chatter3.db` 存消息和会话表，带索引；7 个 Tauri commands 暴露 CRUD 操作；启动时从 SQLite 加载最近消息即时展示，再 HTTP 刷新合并；每条实时消息和 optimistic send 实时逐行写入；浏览器 dev 模式 fallback 到 localStorage JSON blob
- Rust HTTP 客户端 (`api.rs`)：13 个 Tauri commands 覆盖全部协议端点（login/register、online users、public/private/group history、group CRUD、file upload），基于 `reqwest` + rustls；与后端 protocol-v2 类型对齐
- Rust WebSocket 客户端 (`realtime.rs`)：3 个 Tauri commands (connect/disconnect/send)，基于 `tokio-tungstenite`；自动重连（指数退避，最多 6 次）、30s 心跳 ping、事件通过 `realtime://event` / `realtime://status` / `realtime://reconnect` emit 到前端
- 文件对话框（plugin-dialog）+ URL/文件打开（plugin-opener）
- HTTP base URL 通过 `CHATTER_API_URL` 环境变量配置，默认 `http://127.0.0.1:8080`；WS URL 由 JS 侧传入 `realtime_connect` command

已注册插件：`tauri-plugin-dialog`, `tauri-plugin-opener`, `tauri-plugin-process`, `tauri-plugin-notification`, `tauri-plugin-store`, `tauri-plugin-window-state`, `tauri-plugin-single-instance`；Rust 侧额外使用 `keyring` crate 访问系统凭据库，`rusqlite` (bundled) 管理本地聊天数据库 (`src-tauri/src/db.rs`)；`reqwest` + `tokio-tungstenite` + `tokio` 承载 HTTP/WS 协议通信 (`src-tauri/src/api.rs`, `src-tauri/src/realtime.rs`)

前端 JS 侧通过 `frontend/src/desktop.ts` 统一封装 Tauri 能力调用，包括偏好/token 存储、本地聊天记录快照、通知、托盘重连事件和窗口状态事件，带浏览器 fallback，确保 `npm run dev` 远程开发不受影响。

设计原则：

- Rust 层负责桌面原生能力和连接可靠性，可以承载 HTTP/WS 协议逻辑（连接不绑定页面生命周期）
- Web 层负责 UI 渲染和视图状态
- Go 后端负责消息业务规则和持久化

### Go 后端层

位置：

- `backend-go/`

职责：

- 提供 `protocol-v2` 的 HTTP 与 WebSocket 接口
- 鉴权、历史消息、在线状态、实时事件
- 数据持久化

当前推荐的后端分层是：

- `internal/auth/`
  - JWT 与密码哈希
- `internal/repository/`
  - 面向数据库的查询封装
- `internal/service/`
  - 业务规则、错误翻译、协议资源组装
- `internal/transport/http/`
  - HTTP handler、middleware、路由装配
- `internal/storage/`
  - pgxpool 初始化

这里要注意一件事：

- 认证和消息业务都已经归并进 `repository/service`
- `transport/http` 不再承载消息业务规则，只负责 HTTP / WebSocket 输入输出
- `storage` 只保留数据库连接初始化这类基础设施代码

## 2. 为什么 P2 和 P3 必须分开

### P2：HTTP 认证与初始同步

目标：

- 用户能注册
- 用户能登录
- 用户能拿到首屏历史消息

这一阶段的价值是：

- 前端先有一个可工作的“静态首屏”
- 后端先把认证、数据读取、错误结构稳定下来

### P3：WebSocket 实时事件

目标：

- 用户进入真实在线会话
- 前端能收到实时事件
- 在线状态不再是假象

当前后端已经落地的部分：

- `GET /api/v2/ws?token=...` 握手鉴权
- `session.ready`
- `session.ping` / `session.pong`
- `presence.online` / `presence.offline`
- 基于心跳超时的失活清理
- `chat.public.send -> chat.public.message`
- `chat.private.send -> chat.private.message`
- 文本消息输入约束和错误码映射

所以当前 `P3` 的主要阻塞点已经不再是“协议是否能跑”，
而是补齐更接近端到端的测试，并继续推进文件能力。

这一阶段必须单独拆开的原因是：

- HTTP 拉历史和 WebSocket 收实时是两种完全不同的状态模型
- 如果混着做，很容易让前端逻辑又回到“既像请求又像推送”的混乱状态

## 3. 当前推荐的数据流

### 登录成功后

1. 前端调用 `POST /api/v2/auth/login`
2. 后端返回 token + 当前用户信息
3. 前端保存 token
4. 前端通过 HTTP 拉公共历史 / 私聊历史
5. 建立 WebSocket
6. 收到 `session.ready` 后进入真实在线会话

### 为什么不是“登录成功立刻一把梭全做完”

因为这会把 3 件事重新糊在一起：

- 认证
- 初始数据加载
- 实时事件建立

拆开之后每一步都更容易调试，也更容易解释清楚。

## 4. 现在看哪些文件最关键

### 前端入口

- `frontend/src/App.tsx`

适合看什么：

- 当前 UI 如何消费统一状态层
- 会话列表、聊天主视图、telemetry 的布局关系

### 前端状态层

- `frontend/src/store/chatStore.ts`

适合看什么：

- 登录、注册、历史加载、会话派生、消息发送状态如何统一管理
- WebSocket 事件如何进入会话和消息缓存
- 未读计数、历史 cursor、optimistic message 如何工作

### 前端组件层

- `frontend/src/components/`
- `frontend/src/hooks/useKeyboardShortcuts.ts`

适合看什么：

- 页面三栏布局下各面板如何拆分
- 快捷键如何集中注册，避免散落在组件里

### HTTP client

- `frontend/src/api/client.ts`

适合看什么：

- `protocol-v2` 的 HTTP 请求是怎么封装的
- 为什么页面不直接写 `fetch`

### Realtime client

- `frontend/src/realtime/client.ts`

适合看什么：

- WebSocket 自动重连、心跳、事件分发和发送入口如何封装

### 后端入口

- `backend-go/internal/transport/http/server.go`

适合看什么：

- 哪些路由已经存在
- 哪些路由只是占位
- handler 层和 service 层怎么分工

### 后端认证链路

- `backend-go/internal/auth/jwt.go`
- `backend-go/internal/repository/user.go`
- `backend-go/internal/service/user.go`

适合看什么：

- 为什么 JWT / 密码哈希不直接写在 handler 里
- 注册、登录是怎样从 repository 走到 service，再回到 handler 的

### 后端消息链路

- `backend-go/internal/repository/message.go`
- `backend-go/internal/service/message.go`

适合看什么：

- 消息历史和实时消息怎样共用统一 `Message` 结构
- 输入约束和 WebSocket 错误语义为什么放在 service 层

## 5. 当前最容易犯的错误

- 把在线状态当作 HTTP 问题，而不是实时会话问题
- 为了快，把 WebSocket 逻辑提前塞进还没准备好的前端页面
- 把 Tauri 当成“后端代理层”，导致 Rust 层承载过多业务逻辑
- 为了兼容旧 Qt 行为，重新把新协议做成一堆隐式顺序和特判

## 6. 当前最合理的推进顺序

1. 前端补齐文件下载桌面体验，包括选择保存位置、下载进度、打开文件和打开所在目录
2. 后端补齐 WebSocket 事件路径测试
3. 设计并稳定群文件上传、删群、已读、撤回和多端同步协议
4. 前端在协议稳定后接入对应 UI 和状态流
5. 再评估是否把 HTTP/WebSocket 连接生命周期迁入 Tauri Rust 层
