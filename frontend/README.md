# Chatter3 Frontend

新桌面客户端基于 `Tauri + React + Vite`。

## 当前开发模式

当前主要在远程 Linux 环境开发，因此默认采用两层验证：

- Web UI 层：优先通过 `Vite` 单独启动与调试
- Tauri Rust 壳：优先通过 `cargo check` 验证工程与依赖
- HTTP 联调：默认通过 `Vite proxy` 转发到后端，而不是让浏览器直连远程 `127.0.0.1:8080`

如果当前终端没有图形桌面环境，通常看不到 `Tauri` 窗口，这属于预期现象，不影响前期协议与 UI 联调。

## 开发

前端现在默认直接使用本机工具链，项目内不再提供 Nix 运行时。

需要你本机具备：

- `node`
- `npm`
- `rust` / `cargo`
- Linux 下额外需要系统层的 `gtk3`、`webkit2gtk-4.1`、`libsoup3` 等 Tauri 依赖

前端开发默认从 `frontend/.env` 读取本地配置。

第一次先复制模板：

```bash
cd frontend
cp .env.example .env
```

最小启动路径：

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

桌面壳：

```bash
cd frontend
npm run tauri:dev
```

类型检查与构建：

```bash
cd frontend
npm run typecheck
npm run build
```

## 远程开发建议

如果你当前是远程连接 Linux：

```bash
cd frontend
npm run dev
```

优先调试 Web UI，再让后端 `v2` 接口逐步接入。  
只有在本地有桌面环境、或后续需要验证文件系统/窗口能力时，再运行 `npm run tauri:dev`。

当前推荐做法是：

- 浏览器只访问前端 `Vite` 端口
- 前端请求相对 `/api/...`
- `Vite` 再把这些请求代理到后端 `http://127.0.0.1:8080`

这样在远程开发时，你通常只需要转发前端端口，不需要再让浏览器直接访问远程后端地址。

如果你确实需要改后端代理目标，可以在启动前端前覆盖：

```bash
export CHATTER_HTTP_PROXY_TARGET="http://127.0.0.1:8080"
cd frontend
npm run dev
```

如果你想绕过 Vite 代理、让页面直接请求某个后端地址，也可以显式设置：

```bash
export CHATTER_HTTP_BASE_URL="http://your-backend-host:8080"
cd frontend
npm run dev
```

## 当前范围

- 登录 / 注册
- 聊天主界面
- `protocol-v2` 对应的 HTTP client
- `realtime client`
- 基础连接状态与自动重连
- 前端派生会话列表（公共大厅、私聊、群聊）
- 消息发送状态反馈
- 历史分页入口
- 组件化 UI 面板
- 桌面快捷键
- 群聊创建、成员管理、群消息收发
- 文件上传/下载与文件消息实时事件展示
- 系统托盘（关闭窗口隐藏到托盘）
- 单实例保护（重复启动激活已有窗口）
- 托盘菜单显示主窗口、触发重连、退出
- 窗口状态记忆（位置/大小重启恢复）
- 原生 OS 通知（仅非当前会话且窗口未聚焦/不可见时触发，浏览器内 Notification API fallback）
- 语言、主题本地持久化恢复（Tauri store，浏览器环境 fallback 到 localStorage）
- JWT token 安全持久化恢复（Tauri 环境走系统凭据库，浏览器开发 fallback 到 localStorage）
- SQLite 本地消息持久化（每消息逐行写入，启动时即时加载，浏览器 fallback 到 localStorage JSON blob）

群文件上传、删群、已读、撤回和多端同步暂未实现。

## 当前设计方案

当前前端采用 `Workbench + 双主题` 方向，并且已经完成一轮视觉降噪、中文模式和主题切换接入。

设计目标：

- 把页面从“联调原型 + 展示式三栏”推进到“长期使用的桌面聊天客户端”
- 保留现有协议联调逻辑，不为了视觉改版重做状态流
- 优先服务消息阅读、会话切换和连接恢复，而不是扩大装饰性视觉元素

当前视觉语言：

- 白天模式使用偏暖的 `Catppuccin Latte` 风格色板，黑夜模式使用 `One Dark` 风格色板
- 默认跟随系统深浅色，也可以手动固定为白天或黑夜
- 保持工作台式低装饰界面，取消霓虹、网格、扫描线和文字发光
- 主题内协调色用于背景、面板、消息气泡、选中会话和状态反馈
- 面板、按钮、消息气泡统一使用低对比边框和 8-14px 圆角
- 默认中文界面，保留 `中文 / EN` 轻量语言切换

当前布局意图：

- 左栏：身份、登录/注册、连接 telemetry
- 中栏：前端派生的会话列表和历史手动查询
- 右栏：当前聊天主视图
- 顶部：客户端标题和实时连接状态

当前交互意图：

- HTTP 先完成首屏同步
- WebSocket 再进入真实在线会话
- 在线用户、presence、实时消息都进入统一前端状态层
- 消息发送先插入本地 optimistic message，再等待服务端实时回推确认
- 如果服务端消息事件回传 `requestId`，前端优先用它精确确认发送状态
- 若没有 `requestId`，前端暂用“同发送者、同内容、近时间回推”兼容确认发送状态
- 发送超时会标记为失败，失败消息可重试
- HTTP 或 WebSocket 返回 `unauthorized` 时，前端会主动过期当前会话并要求重新登录
- 会话切换优先使用本地缓存；显式 `Reload` 才刷新当前会话历史
- 桌面快捷键：`Ctrl/Cmd+R` 重连，`Ctrl/Cmd+K` 聚焦私聊历史输入，`Esc` 清错误或取消输入焦点
- 语言选择保存在 `localStorage`，默认 `zh-CN`，固定 UI 文案通过 `frontend/src/i18n.ts` 管理
- 主题选择保存在 `localStorage`，默认 `system`，解析后的主题写入 `document.documentElement.dataset.theme`

当前设计边界：

- 不引入新的 UI 组件库
- `zustand` 已作为正式前端状态层接入
- 不改后端协议
- 不在文件协议稳定前伪实现文件上传下载

如果后续继续改版，默认应沿着克制、可长期使用的工作台方向演进，而不是回到强装饰的展示页式布局。

## 当前真实状态

当前前端已经跑通的部分：

**聊天协议：**
- 注册
- 登录
- 公共历史拉取
- 按用户名拉取私聊历史
- 远程开发下通过 `Vite proxy` 访问后端
- 登录成功后建立 WebSocket
- `session.ready`
- `session.ping` / `session.pong`
- `presence.online` / `presence.offline`
- `chat.public.message`
- `chat.private.message`
- 公共消息发送 UI
- 当前私聊视图下的直接消息发送 UI
- 点击在线用户列表进入私聊历史
- `zustand` 状态层
- 前端派生会话列表
- 未读计数
- 自动重连与重连提示
- 发送中 / 失败 / 重试 / 已确认状态
- 历史分页入口
- 主要 UI 面板已拆到 `frontend/src/components`
- 当前会话发送中/失败数量和最后更新时间展示
- 每个会话滚动位置保留

**桌面能力（2026-05 新增）：**
- 系统托盘（关闭窗口隐藏到托盘而非退出）
- 单实例保护（重复启动激活已有窗口）
- 托盘菜单动作：Show / Reconnect / Quit
- 窗口状态持久化（位置/大小/最大化重启恢复）
- 窗口聚焦/隐藏/恢复事件同步到前端状态，用于通知策略
- 原生 OS 通知（`desktop.ts` 封装，仅非当前会话且窗口未聚焦/不可见时触发，浏览器 Notification API fallback）
- 语言、主题本地持久化恢复（Tauri store → 浏览器 localStorage fallback）
- JWT token 安全持久化恢复（系统凭据库：Windows Credential Manager / macOS Keychain / Linux Secret Service）
- Tauri 启动时会把旧 Tauri store 或旧 localStorage 中的 JWT 迁移到系统凭据库，并删除旧位置的 token
- 本地聊天记录快照：按用户持久化最近会话与消息，启动时优先恢复本地记录，再用远端公共历史和在线状态覆盖刷新
- URL/文件打开（plugin-opener）
- 文件上传当前仍走浏览器 `File` 对象路径；原生文件读取桥接尚未接入

当前前端还没有真正完成的部分：

- 群文件上传（后端上传 API 缺 groupID 参数）
- 删群（后端未实现 DELETE /api/v2/groups/{groupID}）
- 已读 / 撤回 / 多端同步（协议未定义）

当前协议边界：

- 可以稳定依赖：认证、历史、在线状态、WebSocket 会话、公共/私聊/群聊文本消息、文件上传下载、文件消息事件
- 暂不稳定依赖：群文件上传、删群、已读、撤回、多端同步

## 进一步阅读

- 整体开发结构说明见 [docs/dev-architecture.md](../docs/dev-architecture.md)
- 协议契约见 [docs/protocol-v2.md](../docs/protocol-v2.md)
