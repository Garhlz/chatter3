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
- 基于 `Soft Desktop` 的桌面客户端主界面重构
- 公共消息 / 私聊消息的基础发送 UI

当前仍待落地：

- 更稳定的重连策略
- 更完整的在线用户 / 会话状态层
- 发送中的 loading / retry / fail 反馈
- 是否正式迁到统一状态层（如 `zustand`）

更新：

- 登录成功后的 WebSocket 建连与基础事件消费已经接上
- 当前更大的未完成项已经转为：重连策略、消息发送 UI、以及更成熟的状态层整理

不负责：

- 桌面文件系统细节
- 原生窗口能力
- 后端鉴权实现

### Tauri Rust 层

位置：

- `frontend/src-tauri/`

职责：

- 提供桌面壳
- 提供文件选择、打开文件等原生能力边界
- 确保桌面应用可以打包与启动

不负责：

- 聊天主协议
- HTTP / WebSocket 业务编排
- 消息状态管理

当前原则：

- `Tauri` Rust 层先保持“薄壳”
- 能交给 Web 层的聊天逻辑，不要重复塞进 Rust command

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
  - 当前仍保留“已稳定可用但尚未归并”的消息查询实现

这里要注意一件事：

- “目录叫 `storage`” 不代表它是最终架构
- 它目前主要承载消息历史查询这条已经可工作的链路
- 认证相关逻辑已经归并进更清晰的 `auth/repository/service` 结构
- 消息侧会等 `P3/P4` 一起整理，避免把错误 schema 的旧草稿重新接回主路径

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

所以当前 `P3` 的主要阻塞点，已经不再是“后端有没有实时入口”，
而是“前端是否把这些实时事件真正消费起来”。

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

- 当前首屏状态流怎么走
- 登录、注册、历史加载是如何接起来的

### HTTP client

- `frontend/src/api/client.ts`

适合看什么：

- `protocol-v2` 的 HTTP 请求是怎么封装的
- 为什么页面不直接写 `fetch`

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

- `backend-go/internal/transport/http/service.go`
- `backend-go/internal/storage/message_repo.go`

适合看什么：

- 为什么消息历史目前仍走一条“先稳定、后归并”的路径
- 历史分页结果是怎样被组装成 `protocol-v2` 的

## 5. 当前最容易犯的错误

- 把在线状态当作 HTTP 问题，而不是实时会话问题
- 为了快，把 WebSocket 逻辑提前塞进还没准备好的前端页面
- 把 Tauri 当成“后端代理层”，导致 Rust 层承载过多业务逻辑
- 为了兼容旧 Qt 行为，重新把新协议做成一堆隐式顺序和特判

## 6. 当前最合理的推进顺序

1. 做好 WebSocket 握手与 `ping/pong`
2. 接好真实在线状态
3. 接公共聊天实时事件
4. 接私聊实时事件
5. 再接文件与群聊
