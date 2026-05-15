# Chatter3

Chatter3 是 Chatter 聊天系统的第三代重写，采用 Go 后端 + Tauri/React/Vite 桌面客户端，替代旧 Java 服务器和 Qt C++ 客户端。

## 项目结构

```
chatter3/
├── backend-go/          # Go 后端 (HTTP + WebSocket, PostgreSQL)
├── frontend/            # Tauri + React + Vite 桌面客户端
├── docs/                # 协议文档与开发架构说明
├── server/              # 旧 Java 服务器（冻结，仅历史参考）
├── client/              # 旧 Qt C++ 客户端（冻结，仅历史参考）
├── AGENT.MD             # 协作规范 (注释风格、提交规范、Tauri 原则)
├── CLAUDE.md            # Claude Code 项目指南
└── TODO.md              # 项目总路线图
```

## 快速开始

### 后端

```bash
cd backend-go
cp .env.example .env                # 首次
docker compose up -d postgres       # 启动 PostgreSQL
set -a; source .env; set +a
goose -dir migrations postgres "$DATABASE_URL" up   # 执行 migration
go run ./cmd/server                 # 启动后端 (HTTP :8080)
```

### 前端

```bash
cd frontend
cp .env.example .env                # 首次
npm install                         # 首次
npm run dev                         # Vite dev server (:1420), 代理 /api → 后端
npm run typecheck                   # TypeScript 检查
npm run build                       # 生产构建
cargo check --manifest-path src-tauri/Cargo.toml   # Rust 桌面壳检查
```

### 测试

```bash
# 后端单元测试（不需要 Docker）
cd backend-go && go test ./...

# 后端集成测试（需要 Docker PostgreSQL + 已执行 migration）
cd backend-go
set -a; source .env; set +a
CHATTER_TEST_DATABASE_URL="$DATABASE_URL" go test ./internal/service -run Integration
CHATTER_TEST_DATABASE_URL="$DATABASE_URL" go test ./internal/transport/http -run Integration
```

## 协议 (v2)

新客户端使用 `HTTP + JSON` 做认证与数据查询，`WebSocket + JSON` 做实时事件推送。

详情见 [docs/protocol-v2.md](docs/protocol-v2.md)，架构说明见 [docs/dev-architecture.md](docs/dev-architecture.md)。

## 当前状态

### 已完成

- 注册 / 登录 (JWT)
- 公共聊天（实时消息 + 历史）
- 私聊（实时消息 + 历史）
- 群聊（创建、成员管理、实时消息 + 历史）
- 在线状态、心跳、断线清理
- 文件上传下载

### 尚未实现

- 已读回执、撤回、多端同步
- 文件上传下载前端 UI
- 推送通知

## 开发环境

- Linux 为主要开发环境，Windows 用于 Tauri 桌面验证
- PostgreSQL 通过 Docker Compose 本地启动
- 前端通过 Vite proxy 访问后端，无需直连后端端口
- 提交规范见 [AGENT.MD](AGENT.MD)
