# Chatter3 Frontend

新桌面客户端基于 `Tauri + React + Vite`。

## 当前开发模式

当前主要在远程 Linux 环境开发，因此默认采用两层验证：

- Web UI 层：优先通过 `Vite` 单独启动与调试
- Tauri Rust 壳：优先通过 `cargo check` 验证工程与依赖

如果当前终端没有图形桌面环境，通常看不到 `Tauri` 窗口，这属于预期现象，不影响前期协议与 UI 联调。

## 开发

先进入前端 shell：

```bash
nix develop .#frontend
```

安装依赖并启动 Web UI：

```bash
cd frontend
npm install
npm run dev
```

启动 Tauri 桌面应用：

```bash
cd frontend
npm install
npm run tauri:dev
```

## 远程开发建议

如果你当前是远程连接 Linux：

```bash
cd frontend
npm run dev
```

优先调试 Web UI，再让后端 `v2` 接口逐步接入。  
只有在本地有桌面环境、或后续需要验证文件系统/窗口能力时，再运行 `npm run tauri:dev`。

## 当前范围

- 登录页
- 聊天主界面骨架
- `protocol-v2` 对应的 HTTP client / WebSocket client
- 基础连接状态展示

群聊、文件上传交互和通知能力暂未实现。

## 进一步阅读

- 整体开发结构说明见 [docs/dev-architecture.md](../docs/dev-architecture.md)
- 协议契约见 [docs/protocol-v2.md](../docs/protocol-v2.md)
