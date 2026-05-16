# Chatter3

Chatter3 是 Chatter 聊天系统的第三代重写：Go 后端 + Tauri 2 + React + Vite 桌面客户端，替代旧 Java 服务器和 Qt C++ 客户端。

## 项目结构

```
chatter3/
├── backend-go/          # Go 后端 (HTTP + WebSocket, PostgreSQL)
├── frontend/
│   ├── src/             # React Web 层 (UI, 状态管理)
│   └── src-tauri/       # Rust 桌面壳 (托盘, 通知, SQLite, HTTP/WS 客户端)
├── docs/                # 协议文档与开发架构说明
├── server/              # 旧 Java 服务器（冻结）
├── client/              # 旧 Qt C++ 客户端（冻结）
├── AGENT.MD             # 协作规范
├── CLAUDE.md            # Claude Code 项目指南
└── TODO.md              # 项目总路线图
```

## 技术栈

| 层 | 技术 | 用途 |
|---|------|------|
| 桌面壳 | Tauri 2 + Rust | 托盘、通知、keyring token 存储、SQLite 本地消息持久化、HTTP/WS 协议客户端 |
| 前端 UI | React 18 + Vite 7 + TypeScript | 聊天界面渲染、zustand 状态管理 |
| 后端 | Go + pgx + goose + sqlc | HTTP/WS 服务、JWT 鉴权、消息路由、文件上传 |
| 数据库 | PostgreSQL (Docker) | 用户、消息、群组、文件元数据持久化 |
| 本地存储 | SQLite (rusqlite bundled) | 离线消息缓存、启动即时展示 |

## 快速开始

### 后端

```bash
cd backend-go
cp .env.example .env
docker compose up -d postgres
set -a; source .env; set +a
goose -dir migrations postgres "$DATABASE_URL" up
go run ./cmd/server
```

### 前端

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                 # Vite dev server (:1420), 代理 /api → 后端
npm run typecheck           # TypeScript 检查
npm run build               # 生产构建
cargo check --manifest-path src-tauri/Cargo.toml  # Rust 检查
npm run tauri:dev           # 完整桌面启动（需要图形环境）
```

### 测试

```bash
cd backend-go && go test ./...                           # 单元测试
CHATTER_TEST_DATABASE_URL="$DATABASE_URL" \
  go test ./internal/service -run Integration            # 集成测试 (需 PostgreSQL)
CHATTER_TEST_DATABASE_URL="$DATABASE_URL" \
  go test ./internal/transport/http -run Integration
```

## 协议 (v2)

HTTP + JSON 做认证和数据查询，WebSocket + JSON 做实时事件推送。

详情：[docs/protocol-v2.md](docs/protocol-v2.md) | 架构：[docs/dev-architecture.md](docs/dev-architecture.md)

## 进度

### 后端

| 功能 | 状态 |
|------|------|
| 注册 / 登录 (JWT + bcrypt) | 完成 |
| 公共 / 私聊 / 群聊实时消息 + 历史（cursor 分页） | 完成 |
| 在线状态 / 心跳 / 断线清理 | 完成 |
| 群组 CRUD（创建/列表/加人/踢人/角色） | 完成 |
| 文件上传下载（权限校验 + MD5） | 完成 |
| 群文件上传 | 未实现 |
| 删群 HTTP endpoint | 未实现 |
| 已读回执 / 撤回 / 多端同步 | 未实现 |

### 前端

| 功能 | 状态 |
|------|------|
| 登录 / 注册 | 完成 |
| 公共 / 私聊 / 群聊聊天 UI | 完成 |
| 系统托盘、单实例、窗口状态记忆 | 完成 |
| 原生 OS 通知 | 完成 |
| SQLite 本地消息持久化 | 完成 |
| JWT keyring 安全存储 | 完成 |
| 文件上传下载 UI + 文件消息卡片 | 完成 |
| i18n 中英文 + 日/夜/系统主题 | 完成 |
| 消息发送状态 (sending/sent/failed/retry) | 完成 |
| HTTP/WS 协议 Rust 客户端 (api.rs, realtime.rs) | 完成 |
| 群文件上传 UI | 未实现 |
| 删群 UI | 未实现 |

### 桌面能力

| 功能 | 状态 |
|------|------|
| 系统托盘（关闭=隐藏，Show/Reconnect/Quit 菜单） | 完成 |
| 单实例（重复启动激活已有窗口） | 完成 |
| 窗口状态持久化（位置/大小/最大化记忆） | 完成 |
| 原生 OS 通知 | 完成 |
| JWT Token 系统凭据库存储 (Keychain / Credential Manager / libsecret) | 完成 |
| SQLite 本地消息持久化 | 完成 |
| Rust HTTP + WebSocket 协议客户端 | 完成 |
| 全局快捷键 | 未实现 |
| 自动更新 | 未实现 |
| 自动启动 | 未实现 |

## 开发环境

- **Linux** 为主要开发环境
- PostgreSQL 通过 Docker Compose 本地启动
- 远程开发时浏览器只访问 Vite 端口，`/api` 路径由 Vite proxy 转发到后端
- Tauri 桌面构建需要 GTK3 / WebKit2GTK 等系统依赖；`npm run dev` + `npm run build` 可以在无图形环境的远程机器上完成
- 提交规范见 [AGENT.MD](AGENT.MD)
