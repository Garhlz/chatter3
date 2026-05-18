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

如果需要在桌面端启动时切换后端地址，可以直接追加运行参数：

```bash
cd frontend
npm run tauri:dev -- --api-url=http://192.168.1.20:8080
```

说明：

- `frontend/package.json` 的 `tauri:dev` 已经内置 `tauri dev -- --`，会把追加参数直接转发给桌面应用本身，而不是传给 `cargo run`
- `--api-url` 期望的是后端 HTTP 基址，例如 `http://host:8080`
- Tauri 会用这个值同时覆盖桌面端 HTTP client 和 WebSocket 连接地址
- WebSocket 地址会自动推导为 `ws://host:8080/api/v2/ws` 或 `wss://.../api/v2/ws`
- 若同时设置 `CHATTER_API_URL` 和 `--api-url`，以启动参数为准

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

优先调试 Web UI，再让后端 `v2` 接口逐步接入。只有在本地有桌面环境、或需要验证文件系统、窗口、通知、凭据库时，再运行 `npm run tauri:dev`。

当前推荐做法是：

- 浏览器只访问前端 `Vite` 端口
- 前端请求相对 `/api/...`
- `Vite` 再把这些请求代理到后端 `http://127.0.0.1:8080`

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

## 当前已实现功能

### 核心聊天能力

- 登录、注册、启动恢复会话
- 公共历史、私聊历史、群历史
- 历史分页与加载更早消息
- 在线用户列表与在线状态实时更新
- 公共/私聊/群聊文本消息发送
- optimistic message、发送确认、发送超时失败、失败重试
- 会话派生、未读计数、会话切换
- 公共/私聊文件上传
- 文件下载入口与文件消息卡片展示
- 群聊创建、群列表、成员列表、加人、移除成员
- 用户资料查看与本人资料编辑

### 当前 UI 与交互

- 顶栏连接状态与 Dev 入口
- 页面级全局反馈区 `notice/error/authExpired`
- 左侧身份卡与偏好切换
- 会话搜索、会话类型标签、打开资料、建群弹窗
- 私聊支持显式创建“空会话壳”，资料弹窗可直接发起聊天
- 多行消息输入框：`Enter` 发送，`Shift+Enter` 换行
- 用户资料弹窗：查看身份、在线状态、注册时间；查看他人时可直接发起聊天
- 群信息区已从消息正文抽出，稳定展示群名、成员数、创建者、当前权限、成员列表与管理动作
- 群成员移除的应用内确认区
- 移动端侧栏开关、遮罩关闭、打开会话后自动收起
- 快捷键：`Ctrl/Cmd+R` 重连，`Ctrl/Cmd+K` 聚焦历史输入，`Esc` 清反馈/取消焦点

### 桌面能力

- 系统托盘
- 单实例保护
- 桌面启动参数 `--api-url=...`，同时覆盖 HTTP / WebSocket 目标地址
- 窗口位置/大小/最大化状态恢复
- 原生通知
- 主题与语言本地持久化
- JWT 持久化到系统凭据库
- SQLite 本地消息缓存
- 托盘重连事件、窗口聚焦/可见状态同步到前端

## 当前未实现或未冻结

- 群文件上传
- 删群
- 已读
- 撤回
- 多端同步
- 完整桌面下载管理闭环

## 前端状态与执行结构

- `frontend/src/App.tsx`
  - 页面骨架、顶栏、侧栏、主视图、全局反馈、弹窗挂载点
- `frontend/src/store/chatStore.ts`
  - 统一状态入口，集中管理认证、历史、realtime、会话、群聊、文件上传、本地恢复
- `frontend/src/api/client.ts`
  - 浏览器路径 HTTP client
- `frontend/src/realtime/client.ts`
  - 浏览器路径 WebSocket client
- `frontend/src/desktop.ts`
  - Tauri 与浏览器 fallback 的统一桌面抽象层

## HTTP API 交互清单

下面按“前端什么时候调、调完怎么更新状态”来写。

### 认证

- `POST /api/v2/auth/register`
  - 入口：注册表单提交
  - 请求：`username/password/nickname`
  - 成功后：显示注册成功提示，并把用户名/密码回填到登录表单
  - 失败后：显示后端错误

- `POST /api/v2/auth/login`
  - 入口：登录表单提交
  - 请求：`username/password`
  - 成功后：
    - 保存 JWT
    - 先尝试恢复本地 SQLite 或本地快照
    - 并行拉公共历史、在线用户、群列表
    - 建立 realtime 连接
  - 失败后：显示登录错误

### 在线状态

- `GET /api/v2/users/online`
  - 入口：
    - 登录成功初始化
    - 启动恢复会话初始化
    - 手动刷新在线用户
  - 成功后：
    - 更新 `onlineUsers`
    - 刷新私聊会话 `online` 状态
    - 手动刷新时显示提示
  - 失败后：显示错误；`401` 时清当前会话

### 公共历史

- `GET /api/v2/chats/public/history?limit=50`
- `GET /api/v2/chats/public/history?limit=50&cursor=...`
  - 入口：
    - 登录成功初始化
    - 启动恢复初始化
    - 手动刷新公共大厅
    - 加载更早消息
  - 成功后：
    - 刷新或追加公共大厅消息
    - 更新 `historyCursors.public`
    - 更新公共大厅会话摘要
  - 失败后：显示历史错误；`401` 时清会话

### 私聊历史

- `GET /api/v2/chats/private/{username}/history?limit=50`
- `GET /api/v2/chats/private/{username}/history?limit=50&cursor=...`
  - 入口：
    - 显式刷新当前私聊
    - 历史输入框指定用户名
    - 当前私聊加载更早消息
  - 成功后：
    - 写入对应私聊消息
    - 更新该会话 cursor
    - 若会话不存在则创建
    - 同步该私聊的昵称/摘要
    - 切换到该私聊并清未读
  - 失败后：显示私聊历史错误；`401` 时清会话

### 用户资料

- `GET /api/v2/users/{username}/profile`
  - 入口：
    - 会话列表资料入口
    - 消息发送者
    - 群信息区创建者/成员入口
  - 成功后：
    - 打开资料弹窗
    - 展示昵称、用户名、在线状态、注册时间、bio、性别
    - 若查看自己，显示编辑资料入口
    - 若查看他人，显示发起聊天入口

- `PUT /api/v2/users/{username}/profile`
  - 入口：编辑自己的资料
  - 成功后：
    - 更新资料弹窗内容
    - 同步前端当前用户昵称
  - 失败后：在资料弹窗内显示错误

### 群聊

- `POST /api/v2/groups`
  - 入口：建群弹窗提交
  - 请求：`groupName` 和可选 `members[]`
  - 成功后：
    - 新群加入 `groups`
    - 创建群会话
    - 自动切到该群
    - 清空建群输入
    - 显示成功提示
  - 失败后：弹窗内显示错误

- `GET /api/v2/groups`
  - 入口：
    - 登录成功初始化
    - 启动恢复初始化
    - 会话列表手动刷新
  - 成功后：
    - 更新 `groups`
    - 把群列表合并进会话列表
  - 失败后：显示错误；`401` 时清会话

- `GET /api/v2/groups/{groupID}`
  - 已有 API 封装
  - 当前 UI 没有单独把它作为独立入口使用

- `GET /api/v2/groups/{groupID}/members`
- `GET /api/v2/groups/{groupID}/history?limit=50&cursor=...`
  - 入口：
    - 打开某个群
    - 手动刷新当前群
    - 群历史加载更早消息
  - 成功后：
    - 并行更新群消息与成员列表
    - 更新群会话 `members/memberCount/description`
    - 更新分页 cursor
    - 切换到该群并清未读
  - 失败后：显示错误；`401` 时清会话

- `POST /api/v2/groups/{groupID}/members`
  - 入口：群面板添加成员
  - 成功后：
    - 显示“已添加成员”
    - 重新加载该群历史和成员
  - 失败后：显示添加失败

- `DELETE /api/v2/groups/{groupID}/members/{username}`
  - 入口：群面板移除成员确认
  - 成功后：
    - 显示“已移除成员”
    - 重新加载该群历史和成员
  - 失败后：显示移除失败

### 文件

- `POST /api/v2/files/upload`
  - 入口：聊天主视图选择文件后上传
  - 当前前端支持：
    - 公共文件上传
    - 私聊文件上传，带 `receiverUsername`
  - 当前前端不支持：
    - 群文件上传
  - 成功后：
    - 清掉上传中状态
    - 显示“文件已上传”
    - 真实文件消息等待 realtime 回推
  - 失败后：显示上传错误

- `GET /api/v2/files/{fileId}`
  - 入口：消息卡片下载按钮
  - 当前行为：
    - 浏览器路径：直接使用下载 URL
    - Tauri 路径：仍主要复用下载 URL，完整保存位置/进度/打开目录还未收口

## Realtime 交互清单

### 握手与生命周期

- 握手地址：`GET /api/v2/ws?token=<jwt>`
- 建立时机：
  - 登录成功后
  - 启动恢复 token 成功且 HTTP 初始化完成后
  - 手动重连
  - 自动重连

### 前端消费的事件

- `session.ready`
  - 更新当前用户与“实时连接已就绪”提示

- `presence.online`
- `presence.offline`
  - 更新在线用户列表与私聊会话在线状态

- `chat.public.message`
- `chat.private.message`
- `chat.group.message`
  - 写入会话消息列表
  - 更新最后一条消息和更新时间
  - 非当前会话时增加未读
  - 匹配本地 optimistic message 并确认发送
  - 窗口未聚焦/不可见时触发通知

- `error`
  - 更新全局错误
  - 当前会把所有 `sending` 消息批量标记失败
  - `unauthorized` 时主动清 token 并要求重新登录

### 前端发送的事件

- `chat.public.send`
- `chat.private.send`
- `chat.group.send`
- `session.ping`

### 重连策略

- 浏览器路径：
  - JS WebSocket client 指数退避自动重连
  - store 侧目前以 `maxReconnectAttempts=6`、`reconnectBaseDelayMs=900` 调用
- Tauri 路径：
  - Rust realtime client 负责连接、心跳、退避重连
  - 通过 `realtime://event`、`realtime://status`、`realtime://reconnect` 回传给前端

## 桌面能力与本地存储

- 语言/主题：
  - Tauri：`tauri-plugin-store`
  - 浏览器 dev：`localStorage`
- JWT：
  - Tauri：系统凭据库
  - 浏览器 dev：`localStorage`
- 本地消息：
  - Tauri：SQLite 为主，JSON snapshot 为补充
  - 浏览器 dev：`localStorage` snapshot fallback
- 通知：
  - Tauri：原生通知插件
  - 浏览器：Notification API

## 当前设计方案

当前前端采用 `Workbench + 双主题` 方向，并已经完成一轮视觉降噪、中文模式、主题切换和交互一致性收口。

设计目标：

- 把页面从“联调原型”推进到“可长期维护的桌面聊天客户端”
- 保留现有协议联调逻辑，不为了视觉改版重做状态流
- 优先服务消息阅读、会话切换、连接恢复和错误恢复

当前视觉语言：

- 白天模式使用偏暖的 `Catppuccin Latte` 风格色板
- 黑夜模式使用 `One Dark` 风格色板
- 默认跟随系统深浅色，也可以手动固定为白天或黑夜
- 默认中文界面，保留 `中文 / EN` 轻量切换
- 面板、按钮、消息气泡、callout 使用统一的边框、圆角和状态色

当前布局意图：

- 顶部：客户端标题、连接状态、移动端侧栏开关、Dev 入口
- 左栏：身份与偏好、会话列表
- 主区：当前聊天主视图
- 页面级：全局反馈区与弹窗层

## 当前真实状态

当前前端可以稳定依赖的前后端协议：

- 认证
- 历史
- 在线状态
- WebSocket 会话
- 公共/私聊/群聊文本消息
- 文件上传下载
- 文件消息事件
- 群聊基本管理
- 用户资料读取与更新

当前前端不应把下面这些当成稳定基线：

- 群文件上传
- 删群
- 已读
- 撤回
- 多端同步

## 进一步阅读

- 整体开发结构说明见 [docs/dev-architecture.md](../docs/dev-architecture.md)
- 协议契约见 [docs/protocol-v2.md](../docs/protocol-v2.md)
- 当前执行线见 [TODO.md](./TODO.md)
