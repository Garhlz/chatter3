# Chatter3 开发结构说明

这份文档不是产品协议文档，而是帮助开发时快速建立“代码层面脑图”的说明。

如果你后面忘了为什么前端不直接把业务塞进 Tauri Rust 层，或者为什么 HTTP 初始化和 realtime 要拆开，可以先回来看这里。

## 1. 当前系统的三层边界

### Web 前端层

位置：

- `frontend/src/`

职责：

- 渲染界面
- 管理登录态、历史消息、当前视图状态
- 管理会话列表、未读计数、发送状态
- 调用 HTTP 接口
- 消费 WebSocket / Tauri realtime 事件
- 统一桌面与浏览器 fallback 的交互层

当前已落地：

- 登录 / 注册 / 启动恢复会话
- 公共历史、私聊历史、群历史及分页
- 在线用户列表、presence 事件消费
- 公共/私聊/群聊文本消息发送
- optimistic message、重试、发送确认、超时失败
- 文件上传 UI、下载入口、文件消息展示
- 建群、群列表、成员列表、加人、移除成员
- 用户资料查看与本人资料编辑
- 资料弹窗可直接发起私聊，私聊支持空会话壳
- 群信息区与成员管理从消息正文抽成稳定侧栏
- 认证区收口为桌面欢迎壳，登录 / 注册改为单表单切换
- `zustand` 状态层
- 页面级全局反馈、移动端侧栏、建群/资料弹窗
- 默认中文、`Catppuccin Latte` / `One Dark` 双主题、跟随系统
- 桌面快捷键集中在 `frontend/src/hooks/useKeyboardShortcuts.ts`

当前仍待落地：

- 群文件上传
- 删群
- 已读 / 撤回 / 多端同步
- 完整桌面下载管理

不负责：

- 原生窗口生命周期实现细节
- 系统凭据库实现
- 后端鉴权与消息持久化

### Tauri Rust 层

位置：

- `frontend/src-tauri/`

职责：

- 承载桌面原生能力
- 承载桌面路径下的 HTTP / WebSocket 协议客户端
- 提供本地存储、通知、窗口、托盘和 SQLite 能力
- 通过 Tauri commands 向 JS 层暴露稳定桥接接口

当前已落地：

- 系统托盘：关闭窗口隐藏到托盘而非退出
- 单实例：重复启动激活已有主窗口
- 托盘菜单：Show / Reconnect / Quit
- 窗口状态持久化与恢复
- 窗口聚焦 / 可见状态事件同步到前端
- 原生通知
- JWT 通过 Rust `keyring` 接系统凭据库
- 语言 / 主题通过 `tauri-plugin-store` 存储
- SQLite 本地消息与会话缓存
- 桌面启动参数 `--api-url=...`，同时覆盖桌面 HTTP / WebSocket 目标地址
- Tauri realtime 状态 / 重连事件通过桥接规范化后写回前端状态层
- 主窗口最小尺寸约束：`1080 x 760`
- Rust HTTP client：覆盖认证、在线用户、公共/私聊/群历史、群管理、文件上传、资料读写
- Rust WebSocket client：连接、心跳、自动重连、发送事件，通过 `realtime://event` / `realtime://status` / `realtime://reconnect` 通知前端

设计原则：

- Rust 层负责“桌面能力”和“连接可靠性”
- Web 层负责“UI”和“页面状态”
- Go 后端负责“业务规则”和“持久化”

### Go 后端层

位置：

- `backend-go/`

职责：

- 提供 `protocol-v2` 的 HTTP 与 WebSocket 接口
- 鉴权、历史消息、在线状态、实时事件
- 数据持久化与业务约束

当前推荐的后端分层：

- `internal/auth/`
- `internal/repository/`
- `internal/service/`
- `internal/transport/http/`
- `internal/storage/`

## 2. 当前前端的实际数据流

### 登录成功后

1. 前端调用 `POST /api/v2/auth/login`
2. 保存 JWT
3. 优先恢复本地 SQLite 或本地快照
4. 并行请求：
   - `GET /api/v2/chats/public/history`
   - `GET /api/v2/users/online`
   - `GET /api/v2/groups`
5. 用远端结果刷新公共大厅、在线态和群列表
6. 建立 WebSocket / Tauri realtime
7. 收到 `session.ready` 后进入真实在线会话

### 从资料或成员列表发起私聊时

1. 打开用户资料弹窗
2. 点击“发起聊天”
3. 前端显式创建或打开 `private:{username}` 会话
4. 若本地还没有该会话消息，则先显示空私聊壳
5. 用户显式刷新历史或发送首条消息后，再进入现有私聊历史/实时发送链路

### 启动恢复会话时

1. 从桌面抽象层加载 token
2. 解码出本地用户身份
3. 优先恢复本地 SQLite 或本地快照
4. 并行请求公共历史、在线用户、群列表做覆盖刷新
5. 建立 realtime

### 发送消息时

1. 按当前 active conversation 决定发公共 / 私聊 / 群聊
2. 先插入 optimistic message
3. 通过 WebSocket / Tauri realtime 发送：
   - `chat.public.send`
   - `chat.private.send`
   - `chat.group.send`
4. 服务端回推 message 事件后确认本地消息
5. 若 15 秒内没有确认，前端将其标记为 failed

### 收到实时消息时

1. 前端按消息 scope 计算 conversation id
2. 写入消息列表
3. 更新会话摘要和最后时间
4. 若不是当前会话，增加未读
5. 若窗口未聚焦或不可见，触发通知
6. 若能匹配到 optimistic message，则把其升级为已确认服务端消息

### 群聊打开时

1. 进入群会话
2. 消息区与群信息区并列展示
3. 群信息区稳定展示：
   - 群名
   - 成员数
   - 创建者
   - 当前用户权限
   - 成员列表
   - 添加/移除成员动作
4. 成员和创建者都可以继续进入资料弹窗

## 3. 当前稳定与不稳定的协议面

当前前端可以稳定依赖：

- HTTP 认证
- HTTP 历史
- HTTP 在线用户列表
- WebSocket 鉴权与会话
- 公共/私聊/群聊文本消息
- 文件上传下载
- 文件消息实时事件
- 群聊创建、列表、详情、成员管理、群历史
- 群详情 / 成员列表 / 群历史统一成员可见性
- 群创建 / 批量加人成员写入的事务一致性
- 用户资料读取与更新

当前前端不应把下面这些视为稳定基线：

- 群文件上传
- 删群
- 已读
- 撤回
- 多端同步

## 4. 现在看哪些文件最关键

### 前端入口

- `frontend/src/App.tsx`

适合看什么：

- 页面骨架如何组织
- 顶栏、侧栏、主视图、全局反馈和弹窗如何挂接

### 前端状态层

- `frontend/src/store/chatStore.ts`

适合看什么：

- 登录、注册、历史加载、会话派生、群聊管理、消息发送状态如何统一管理
- 资料弹窗发起私聊、空私聊壳、群信息区摘要如何在状态层落地
- HTTP 初始化、桌面 runtime 配置与 realtime 事件如何合流
- 未读计数、cursor、optimistic message、本地恢复如何工作

### 前端桌面抽象

- `frontend/src/desktop.ts`

适合看什么：

- 为什么组件不直接调用 Tauri API
- 浏览器 dev 与桌面路径如何保持同一套上层接口
- 桌面端如何消费由 Tauri 注入的 runtime HTTP / WebSocket 配置

### HTTP client

- `frontend/src/api/client.ts`

适合看什么：

- 浏览器路径下 `protocol-v2` 的 HTTP 封装

### Realtime client

- `frontend/src/realtime/client.ts`

适合看什么：

- 浏览器路径下 WebSocket 的心跳、重连、事件分发和发送入口

### Tauri Rust bridge

- `frontend/src-tauri/src/api.rs`
- `frontend/src-tauri/src/realtime.rs`
- `frontend/src-tauri/src/db.rs`
- `frontend/src-tauri/src/lib.rs`

适合看什么：

- 桌面路径下 HTTP / WS / SQLite / tray / keyring / window 的真实实现

### 后端入口

- `backend-go/internal/transport/http/server.go`

适合看什么：

- 哪些路由已经存在
- 前端当前能稳定依赖哪些 handler

## 5. 当前推荐的开发策略

- 协议稳定面上的前端开发可以继续并行推进：
  - 认证
  - 历史
  - 在线状态
  - 文本消息
  - 文件消息展示
  - 群聊基础管理
  - 用户资料
- 文件系统体验和桌面体验继续通过 `desktop.ts` 收口，不要把 Tauri 调用散落到组件里
- 新 UI 优化优先做：
  - 交互一致性
  - 组件职责收口
  - i18n 清理
  - 样式 token 化
  而不是再做一轮大改布局
