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

- 登录页
- 聊天主界面骨架
- `protocol-v2` 对应的 HTTP client
- `realtime client` 骨架
- 基础连接状态枚举
- Tauri 文件选择入口

群聊、文件上传交互和通知能力暂未实现。

## 当前设计方案

当前前端默认采用 `Soft Desktop` 方向，并且已经完成一轮 `Large` 级别改版。

设计目标：

- 把页面从“联调原型 + 展示式三栏”推进到“成熟桌面聊天客户端”
- 保留现有协议联调逻辑，不为了视觉改版重做状态流
- 优先服务桌面端长期使用体验，而不是 landing page 式的展示感

当前视觉语言：

- 中性灰蓝与石墨色作为基础色
- 单一品牌蓝作为强调色
- 浅层阴影、清晰边框、柔和圆角
- 弱化大面积戏剧性渐变和悬浮玻璃感
- 强调工作区秩序，而不是概念展示气质

当前布局意图：

- 左栏：账户、登录、注册
- 中栏：当前聊天主视图
- 右栏：连接状态、在线用户、历史/文件工具
- 顶部：轻量标题栏和实时状态，不再保留大号 hero 叙事区

当前交互意图：

- HTTP 先完成首屏同步
- WebSocket 再进入真实在线会话
- 在线用户、presence、实时消息都应在客户端界面里有明确落点
- 消息发送 UI 仍是下一步，不在这次改版中强行做完

当前设计边界：

- 不引入新的 UI 组件库
- 不把页面状态强制迁到 `zustand`
- 不改后端协议
- 不为了“更炫”而牺牲当前联调可用性

如果后续继续改版，默认应沿着这条方向演进，而不是重新回到展示页式布局。

## 当前真实状态

当前前端已经跑通的部分：

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

当前前端还没有真正完成的部分：

- 自动重连策略
- 更完整的在线用户和会话状态管理
- 消息发送中的 loading / retry / fail 状态
- 更细的会话列表和消息状态反馈

另外，仓库里已经加入了 `zustand` 依赖，但当前页面状态流还没有正式迁到 `zustand` 上，这件事仍然待决定和落地。

## 进一步阅读

- 整体开发结构说明见 [docs/dev-architecture.md](../docs/dev-architecture.md)
- 协议契约见 [docs/protocol-v2.md](../docs/protocol-v2.md)
