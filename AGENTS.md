# AGENTS 约定

本文件是本仓库唯一的 AI 协作入口，记录项目背景、开发命令、架构边界、学习目标与提交规范。

## 0. 协作目标：以学习和面试准备为优先

- 用户计划把本项目写入简历，但当前的 Go 后端和 Tauri 客户端主要通过 AI 辅助完成，需要通过后续维护重新理解并掌握实现。
- 实现功能时，除正确性外，还应优先考虑代码是否容易阅读、调试、复述和在面试中解释。
- 默认采用直接、常见、分步骤的实现。不要为了少写几行代码使用过于 tricky、隐式或高度压缩的方案。
- 避免不必要的抽象、元编程和“聪明代码”。只有当抽象确实消除重复或明确模块边界时才引入，并说明理由。
- 命名应表达业务含义；复杂流程应拆成职责单一、容易单步调试的函数。
- 完成较大改动后，应面向学习目的说明：调用链、数据流、关键概念、设计取舍、验证方式，以及适合面试复习的要点。
- 如果现有实现较复杂，先解释现状，再渐进式改进；不要在没有必要时一次性大改。

## 1. 注释与说明风格

- 用户目前正在重新学习 Go、Rust、Tauri 和前端实现，因此相关新代码需要比通常更多的解释性注释。
- 注释目标不只是说明“这段代码做什么”，还要适度解释“为什么这样做”。
- 注释应优先覆盖这些位置：
  - `Tauri` Rust 壳与 Web 前端的边界
  - `HTTP` 与 `WebSocket` 各自负责什么
  - 状态管理、连接管理、重连、鉴权等容易迷路的逻辑
  - 目录结构和模块职责
  - Go 的并发、`context`、错误处理、依赖装配和分层调用
  - Rust 的所有权、线程同步、错误转换以及 Tauri command / event 机制
- 注释应保持教学导向，但不要把代码文件写成教程文档；注释应帮助用户边看边理解，而不是堆大段废话。
- 在完成较大改动后，向用户解释时也应兼顾教学目的，说明关键概念和取舍。

## 2. Tauri 相关实现原则

- 默认假设用户在远程 Linux 环境开发，因此优先保证：
  - Web 前端可单独通过 `Vite` 启动与调试
  - `Tauri` Rust 壳至少可通过 `cargo check`
  - 桌面壳运行验证可以延后到有图形环境时进行
- 设计上要清楚区分：
  - Web UI 层
  - 前端状态层
  - `HTTP` API client
  - `WebSocket` realtime client
  - `Tauri` Rust 桥接层
- 不要把聊天主协议逻辑随意塞进 Rust command，除非确实属于桌面能力边界。

## 3. 提交信息规范

- 提交信息必须使用 Conventional Commit 格式：`<type>(<scope>): <summary>`。
- `type` 使用规范英文前缀，常用值包括：`feat`、`fix`、`docs`、`refactor`、`test`、`chore`。
- `scope` 应尽量明确，例如：
  - `feat(frontend)`
  - `feat(protocol-v2)`
  - `feat(nix)`
  - `fix(tauri)`
- `summary` 使用简洁明确的中文，直接说明核心改动，避免“更新一下”“修复问题”等空泛表述。
- 示例：`feat(user): 添加第三方 OAuth 登录接口`。

## 4. 提交正文规范

- 除标题外，较大改动应补充提交正文；正文使用 Markdown 列表并写得详细一些。
- 正文至少应包含：
  - 做了什么
  - 为什么这样改
  - 影响范围
  - 如有必要，补充后续待办或限制
- 每条说明只聚焦一个明确改动点，优先描述功能、行为、接口、数据结构或文档变化。
- 每条 bullet 之间保留空行，正文必须与实际提交内容一致，不写未完成事项。
- 提交信息中不要添加 `Co-Authored-By` 或其他作者标签。
- 推荐格式：

```text
feat(frontend): 搭建 Tauri 客户端基础界面

- 添加 React 与 Vite 前端基础结构

- 配置 Tauri v2 桌面壳和 capability

- 说明前端与桌面桥接层的职责边界
```

## 5. 文档同步与提交执行要求

- 后续若我代为提交，默认按本文件规范撰写 commit message。
- 后续若我继续实现 `Tauri` / 前端 / 协议相关能力，默认增加更具教学目的的注释与解释。
- 每次修改代码、脚本、目录结构、运行方式或功能行为后，提交前必须检查代码与相关文档是否一致。
- 文档检查至少覆盖：
  - 根目录 `README.md`
  - 根目录 `TODO.md`
  - `frontend/TODO.md`
  - `backend-go/TODO.md`
  - 与改动直接相关的协议、架构或模块 README
- 用户约定中的 `docs/requirement.md` 和 `docs/TODO.md` 当前在本仓库不存在；现阶段分别以项目 README/架构与上述三级 TODO 为实际信息源。若以后新增这两个文件，也必须加入每次提交前的固定检查范围。
- 如果实现范围、使用方式、依赖、输出结果或项目结构发生变化，必须同步更新相应文档。
- 如果某项 TODO 已完成，及时勾选、移动或调整对应条目；不要让已完成事项继续显示为待办。
- 如果本次改动不影响现有文档，也要在提交前明确检查一次文档是否仍然准确。
- 准备提交前检查标题、正文和暂存文件是否属于同一逻辑改动。改动较大时分批提交，正文覆盖主要影响点。
- 代为提交时使用多个 `-m` 参数或等价的多行提交方式组织正文；不要把个人编辑器配置、临时文件或无关生成物混入提交。

## 6. 项目概览

Chatter3 是旧聊天系统的第三代重写：

- `backend-go/`：当前 `protocol-v2` 的 Go 后端。
- `frontend/`：Tauri 2 + React + Vite 桌面客户端。
- `client/` 和 `server/`：冻结的旧 Qt/C++ 客户端与 Java 服务端，仅作历史参考。
- `docs/protocol-v1.md`：旧 TCP + JSON + 换行分帧协议。
- `docs/protocol-v2.md`：当前 HTTP + JSON、WebSocket + JSON 协议契约。

当前稳定契约包括：认证、历史消息、在线用户、WebSocket 会话、公共/私聊/群聊文本消息、文件上传下载、文件消息事件、群详情/成员/历史的成员权限、事务化群成员写入，以及用户资料读写。

当前尚不稳定或未实现：群文件上传、删除群组、已读回执、消息撤回和多端同步。

## 7. 信息源与执行清单

- 前端执行清单：`frontend/TODO.md`
- 后端执行清单：`backend-go/TODO.md`
- 架构地图：`docs/dev-architecture.md`
- 协议契约：`docs/protocol-v2.md`
- 前端 UI 设计：`docs/frontend-ui-design.md`
- 协作规则：本文件 `AGENTS.md`

根目录 `TODO.md` 只作为高层项目导航和归档，不应作为当前执行队列。

## 8. 常用开发命令

后端：

```bash
cd backend-go
docker compose up -d postgres
set -a; source .env; set +a
goose -dir migrations postgres "$DATABASE_URL" up
sqlc generate -f sqlc.yaml
go run ./cmd/server
go test ./...
```

前端：

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
npm test
npm run typecheck
npm run build
npm run tauri:dev
npm run tauri:dev -- --api-url=http://127.0.0.1:8080
cargo check --manifest-path src-tauri/Cargo.toml
```

后端集成测试依赖已完成迁移的 PostgreSQL：

```bash
cd backend-go
set -a; source .env; set +a
CHATTER_TEST_DATABASE_URL="$DATABASE_URL" go test ./internal/service -run Integration
CHATTER_TEST_DATABASE_URL="$DATABASE_URL" go test ./internal/transport/http -run Integration
```

## 9. 架构边界

Go 后端保持严格分层：

```text
transport/http  -> HTTP handler、中间件、WebSocket 升级与协议输入输出
service/        -> 业务规则、校验和错误语义
repository/     -> 通过 sqlc 生成代码访问数据库
storage/        -> pgxpool 初始化
```

前端保持以下边界：

```text
components/         -> React 展示与交互组件
store/              -> Zustand 状态和业务动作编排
api/client.ts       -> 浏览器模式 HTTP client
realtime/client.ts  -> 浏览器模式 WebSocket client
desktop.ts          -> Tauri/浏览器双运行环境的统一桥接层
hooks/              -> 可复用 UI hooks
```

Tauri Rust 层负责托盘、单实例、原生通知、窗口状态、系统凭据库、SQLite 本地消息、运行时 `--api-url`、桌面 HTTP/WS client 和连接可靠性。React/JS 层通过 `frontend/src/desktop.ts` 使用这些能力；浏览器开发模式则回退到浏览器 HTTP/WS client 和 `localStorage`。

聊天业务规则应放在 Go 后端；页面状态与 UI 编排应放在前端；只有真正属于桌面平台边界的能力才放入 Tauri Rust command。不要为了“都走 Rust”而复制业务逻辑。

## 10. 关键运行机制

- HTTP 负责登录注册、资料和群组等请求-响应操作，以及历史数据查询。
- WebSocket 负责在线会话、实时消息、presence 和服务端主动事件。
- Tauri 模式下，JWT 存在操作系统凭据库；浏览器开发模式使用 `localStorage`。
- Tauri 模式下，本地消息存入 SQLite；浏览器开发模式使用本地快照。
- 启动时先加载本地消息以快速显示，再用服务端历史、在线用户和群组数据刷新，最后建立 realtime 连接。
- 桌面窗口最小尺寸为 `1080 x 760`；Tauri realtime 桥接会规范化状态和重连事件后再交给前端 store。

## 11. 前端 UI 现状

- 默认中文，可切换英文。
- 日间主题基于较暖的 Catppuccin Latte，夜间主题基于 One Dark；默认跟随系统。
- 未登录时显示独立居中的登录卡片，可在同一表单切换登录/注册。
- 登录后采用原生桌面感的双栏布局：左侧会话导航，右侧消息优先的聊天主区域。
- 设置弹窗负责语言、主题和开发者面板入口。
- 资料弹窗同时是查看身份、编辑本人资料和发起私聊的入口。
- 消息按日期、发送者和时间窗口分组，支持文件气泡、图片预览、发送状态和按会话保存草稿/滚动位置。
- 群资料通过右侧抽屉按需展示；创建、加人和移除成员通过 `group.changed` 实时同步。
- 会话具有摘要、时间、未读数和在线状态；当前用户不会出现在自己的私聊列表中。

## 12. 修改与验证规则

- 远程 Linux 环境优先使用 Vite 单独验证 Web UI。
- 修改前端后，至少运行 `npm test`、`npm run typecheck` 和 `npm run build`。
- 修改 Tauri Rust 后，至少运行 `cargo check --manifest-path frontend/src-tauri/Cargo.toml`（或在 `frontend/` 下使用对应相对路径）。
- 修改 Go 后端后，运行相关包测试；影响面较大时运行 `go test ./...`。
- 集成测试需要 PostgreSQL，不要把缺少数据库环境误报成代码失败。
- 除非任务明确涉及历史实现，否则不要修改冻结的 `client/` 和 `server/`。
