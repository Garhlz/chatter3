# AGENT 约定

本文件记录本仓库后续协作时需要持续遵守的开发偏好与提交规范。

## 1. 注释与说明风格

- 用户目前对 `Tauri` 不熟悉，因此在实现新前端相关代码时，需要比通常更多地加入解释性注释。
- 注释目标不只是说明“这段代码做什么”，还要适度解释“为什么这样做”。
- 注释应优先覆盖这些位置：
  - `Tauri` Rust 壳与 Web 前端的边界
  - `HTTP` 与 `WebSocket` 各自负责什么
  - 状态管理、连接管理、重连、鉴权等容易迷路的逻辑
  - 目录结构和模块职责
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

- 提交信息使用规范英文前缀，优先使用 Conventional Commit 风格。
- 功能类提交默认使用：
  - `feat(scope): short summary`
- 其他类型按需要使用：
  - `fix(scope): ...`
  - `refactor(scope): ...`
  - `docs(scope): ...`
  - `chore(scope): ...`
- `scope` 应尽量明确，例如：
  - `feat(frontend)`
  - `feat(protocol-v2)`
  - `feat(nix)`
  - `fix(tauri)`

## 4. 提交正文规范

- 提交正文使用 Markdown 列表，写得详细一些。
- 正文至少应包含：
  - 做了什么
  - 为什么这样改
  - 影响范围
  - 如有必要，补充后续待办或限制
- 推荐格式：

```text
feat(frontend): scaffold tauri client shell

- add React + Vite frontend scaffold for the new desktop client
- add Tauri v2 shell and capability configuration
- split Nix dev shells into backend/frontend/full/legacy-client
- document protocol-v2 oriented frontend structure
```

## 5. 默认执行要求

- 后续若我代为提交，默认按本文件规范撰写 commit message。
- 后续若我继续实现 `Tauri` / 前端 / 协议相关能力，默认增加更具教学目的的注释与解释。
