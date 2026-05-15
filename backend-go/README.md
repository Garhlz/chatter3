# Chatter Go 后端

当前后端默认使用：

- Go 本机工具链
- Docker Compose 启动 PostgreSQL
- `backend-go/.env` 管理本地开发配置

不迁移旧数据。  
直接创建新的 `chatter3` 数据库并执行当前 migration。

## 快速开始

先准备本地配置：

```bash
cd backend-go
cp .env.example .env
```

启动数据库：

```bash
docker compose up -d postgres
docker compose ps
```

执行 migration：

```bash
set -a
source .env
set +a
goose -dir migrations postgres "$DATABASE_URL" up
```

启动后端：

```bash
go run ./cmd/server
```

说明：

- `go run ./cmd/server`
  - 会自动读取 `backend-go/.env`
- `goose`
  - 不会自动读取 `.env`
  - 所以 migration 前仍然要执行 `set -a; source .env; set +a`

## 日常开发

通常只需要：

```bash
cd /home/elaine/work/projects/chatter3/backend-go
docker compose up -d postgres
go run ./cmd/server
```

只有在 migration 新增或修改后，才需要再次执行：

```bash
set -a
source .env
set +a
goose -dir migrations postgres "$DATABASE_URL" up
```

## 常用命令

查看数据库状态：

```bash
cd backend-go
docker compose ps
```

查看数据库日志：

```bash
cd backend-go
docker compose logs postgres
```

停止数据库：

```bash
cd backend-go
docker compose down
```

重建本地数据库：

```bash
cd backend-go
docker compose down -v
docker compose up -d postgres
set -a
source .env
set +a
goose -dir migrations postgres "$DATABASE_URL" up
```

进入 `psql`：

```bash
PGPASSWORD=chatter3 psql -h localhost -p 5432 -U chatter3 chatter3
```

跑测试：

```bash
cd backend-go
go test ./...
```

跑数据库集成测试：

```bash
cd backend-go
set -a
source .env
set +a
CHATTER_TEST_DATABASE_URL="$DATABASE_URL" go test ./internal/service -run Integration
CHATTER_TEST_DATABASE_URL="$DATABASE_URL" go test ./internal/transport/http -run Integration
```

说明：

- 普通 `go test ./...` 不依赖 Docker PostgreSQL
- 集成测试需要先执行 migration
- `internal/service` 集成测试覆盖消息落库与历史读取
- `internal/transport/http` 集成测试覆盖 WebSocket 发送、落库、实时投递、离线私聊回推，以及文件上传下载
- 集成测试会创建临时用户和消息，并在测试结束后清理

生成 `sqlc`：

```bash
cd backend-go
sqlc generate
```

## 配置文件

模板文件：

- [backend-go/.env.example](./.env.example)

默认本地配置：

```env
DATABASE_URL=postgresql://chatter3:chatter3@localhost:5432/chatter3?sslmode=disable
JWT_SECRET=chatter3-dev-jwt-secret-at-least-32b
TCP_PORT=9999
HTTP_PORT=8080
UPLOAD_DIR=./upload_files
MAX_FILE_SIZE_MB=50
HEARTBEAT_TIMEOUT=90s
JWT_EXPIRATION=24h
```

约定：

- `.env.example`
  - 提交到仓库
- `.env`
  - 只留本地，不提交
- 真实环境变量
  - 会覆盖 `.env` 中的值

## 数据库说明

数据库容器配置在 [docker-compose.yml](./docker-compose.yml)。

默认值：

- 用户名：`chatter3`
- 密码：`chatter3`
- 数据库：`chatter3`
- 端口：`5432`

如果 `5432` 被占用：

- 停掉本机已有 PostgreSQL
- 或修改 [docker-compose.yml](./docker-compose.yml) 的宿主机端口映射

## 当前状态

已完成：

- `P2`：HTTP 注册 / 登录 / 历史同步
- JWT、密码哈希、用户 repository / service 分层
- 公共历史 / 私聊历史 HTTP 查询
- 消息 repository / service 分层
- `P3` 后端实时链路：
  - WebSocket token 握手
  - `session.ready`
  - `session.ping` / `session.pong`
  - `presence.online` / `presence.offline`
  - 心跳超时自动清理
  - 同一用户重连替换旧连接
  - `chat.public.send -> chat.public.message`
  - `chat.private.send -> chat.private.message`
  - `GET /api/v2/users/online`
- 文件上传下载：
  - `POST /api/v2/files/upload`
  - `GET /api/v2/files/{fileId}`
  - 上传时同时创建一条文件消息
  - 公共上传广播 `chat.public.message`
  - 私聊上传投递 `chat.private.message`

当前消息约束：

- 文本消息会 trim 首尾空白
- 文本消息不能为空
- 文本消息最长 4096 字符
- 私聊必须提供 `receiverUsername`
- 不允许给自己发送私聊
- 私聊目标离线时仍然落库，后续可通过历史接口读取

当前文件约束：

- 上传必须携带 `multipart/form-data` 字段 `file`
- 可选字段 `receiverUsername` 决定公共文件消息或私聊文件消息
- 上传大小受 `MAX_FILE_SIZE_MB` 限制
- 下载权限继承消息权限：
  - 公共文件：任意已登录用户可下载
  - 私聊文件：仅发送者和接收者可下载

## 协议稳定性

当前前后端之间可以稳定依赖：

- HTTP 注册 / 登录 / 在线用户 / 公共历史 / 私聊历史
- WebSocket token 握手
- `session.ready`、`session.ping`、`session.pong`
- `presence.online`、`presence.offline`
- 公共/私聊文本消息发送与实时事件
- 文本消息输入约束和错误码集合
- 文件上传下载 HTTP 接口
- 通过上传触发的文件消息实时事件

还不稳定：

- 已读、撤回、多端同步等扩展能力

未完成：

- 已读回执、撤回、多端同步

## 目录结构

```text
cmd/server/       程序入口
internal/
  auth/           JWT 与密码哈希
  config/         配置加载
  protocol/       消息类型定义 (v2) + 旧协议类型参考 (v1)
  repository/     用户、消息、文件、群组数据库访问
  service/        用户、消息、文件、群组业务逻辑
  session/        在线会话管理
  storage/        pgxpool 初始化
  transport/
    http/         HTTP v2 路由与 WebSocket transport
migrations/       goose 迁移文件
sql/queries/      sqlc 查询 SQL
```
