# Chatter Go 后端

Go 重写版，第一阶段兼容现有 Qt/C++ 客户端协议。

## 快速开始

### 前置依赖

- Go 1.22+
- PostgreSQL 15+
- goose（`go install github.com/pressly/goose/v3/cmd/goose@latest`）
- sqlc（`go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest`）

### 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `DATABASE_URL` | ✓ | — | PostgreSQL DSN，例如 `postgres://user:pass@localhost:5432/chatter` |
| `JWT_SECRET` | ✓ | — | 至少 32 字节 |
| `TCP_PORT` | | 9999 | TCP 长连接端口 |
| `HTTP_PORT` | | 8080 | HTTP 端口 |
| `UPLOAD_DIR` | | `./upload_files` | 文件存储目录 |
| `MAX_FILE_SIZE_MB` | | 50 | 文件上传大小限制（MB） |
| `HEARTBEAT_TIMEOUT` | | `90s` | 心跳超时，如 `90s` |
| `JWT_EXPIRATION` | | `24h` | JWT 有效期 |

### 启动

```bash
# 拉取依赖
make tidy

# 执行数据库迁移
export DATABASE_URL="postgres://postgres:password@localhost:5432/chatter?sslmode=disable"
make migrate-up

# 生成 sqlc 查询代码
make sqlc-gen

# 启动服务器
export JWT_SECRET="your-secret-key-must-be-at-least-32-bytes"
make run
```

## 目录结构

```
cmd/server/       程序入口
internal/
  config/         配置加载
  dispatcher/     消息分发（transport 与业务层的边界）
  protocol/       消息类型定义 + JSON 编解码
  repository/     数据库访问（sqlc 生成代码在 sqlcgen/ 子包）
  session/        在线会话管理
  service/        业务逻辑（P3 开始填充）
  storage/        pgxpool 初始化
  transport/
    tcp/          TCP accept + conn 生命周期
    http/         HTTP 健康检查 + 文件接口
migrations/       goose 迁移文件
sql/queries/      sqlc 查询 SQL
```

## 当前状态

- [x] 项目骨架（config、storage、protocol、session、dispatcher、transport）
- [x] 数据库迁移文件
- [x] sqlc 查询文件
- [ ] P3：登录/注册/JWT/心跳（开发中）
- [ ] P4~P7：聊天功能（待开发）
