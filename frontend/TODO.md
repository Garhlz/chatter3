# Chatter3 Frontend TODO

这个文件只描述前端执行线，适合单独开一个前端会话持续推进。

## 当前前端已具备

- [x] 登录 / 注册 / 公共历史 / 私聊历史的 HTTP 联调入口
- [x] 相对 `/api` + `Vite proxy` 的远程开发访问路径
- [x] 登录成功后建立 WebSocket
- [x] `session.ready`
- [x] `session.ping` / `session.pong`
- [x] `presence.online` / `presence.offline`
- [x] `chat.public.message` / `chat.private.message` 的基础消费
- [x] `chat.public.send` / `chat.private.send` 的基础发送 UI
- [x] 从在线用户列表进入私聊历史
- [x] `realtime client` 与基础连接状态枚举
- [x] Tauri 文件选择入口
- [x] `Workbench` 方向的视觉降噪已落地，默认中文界面与双主题已接入
- [x] 页面结构已调整为“左身份与 telemetry / 中会话堆栈 / 右聊天主视图”
- [x] `zustand` 已作为正式前端状态层接入
- [x] 自动重连与重连提示
- [x] 会话列表由公共大厅、在线用户、已打开私聊和实时私聊事件派生
- [x] 消息发送状态：发送中 / 失败 / 重试 / 已确认
- [x] 历史分页入口与 cursor 状态
- [x] Tauri 基础桌面能力：
  - [x] 系统托盘
  - [x] 窗口状态记忆
  - [x] 原生通知 + 浏览器 fallback
  - [x] token 本地持久化抽象与启动恢复
  - [x] 打开文件与 URL

## Frontend Next

- [x] 增加手动重连入口
- [x] 增加在线用户刷新入口
- [x] 保留每个会话的滚动位置
- [x] 优化发送确认策略：优先使用 `requestId` 精确确认，缺失时回退到近时间内容匹配
- [x] 增加基础错误恢复路径：token 失效、重连耗尽、历史分页失败
- [x] 拆分主要 UI 组件，`App.tsx` 只保留页面骨架
- [x] 增加桌面快捷键：`Ctrl/Cmd+R` 重连、`Ctrl/Cmd+K` 聚焦私聊查询、`Esc` 清错误/取消焦点
- [x] 会话切换优先使用本地缓存，显式 `Reload` 才刷新历史
- [x] 当前会话展示发送中/失败消息数量和最后更新时间
- [x] 增加轻量中文/英文语言切换，固定 UI 文案集中到 `frontend/src/i18n.ts`
- [x] 增加偏暖 `Catppuccin Latte` 白天主题、`One Dark` 黑夜主题和跟随系统模式
- [ ] 继续收口 `desktop.ts`，把文件选择、下载、打开文件、打开目录、窗口显隐统一进桌面能力抽象层
- [ ] 实现 Tauri 单实例保护：重复启动时激活已有窗口
- [ ] 为 Tauri 环境补齐原生文件读取桥接，再把上传入口切回原生文件选择
- [ ] 明确通知策略：仅非当前会话通知、仅窗口未聚焦时通知、点击通知跳转对应会话
- [ ] 补托盘菜单动作：显示主窗口、重连、退出
- [ ] 把窗口聚焦/隐藏/恢复事件与前端状态联动，用于优化未读和通知策略

## Frontend Later

- [x] 继续拆分 `chatStore.ts`，按 auth / realtime / conversations / messages 模块化
- [ ] 若后端正式保证消息事件回传 `requestId`，移除当前近时间内容匹配 fallback
- [x] 文件上传 UI、下载入口与错误反馈；等待后端 v2 文件协议稳定后接入真实闭环
- [x] 文件消息实时事件展示
- [x] 群聊界面与群会话列表
- [x] 更完整的桌面端交互细节：快捷键、空状态、细粒度提示、窗口态适配
- [ ] 系统级安全存储 token
  - [ ] Windows Credential Manager
  - [ ] macOS Keychain
  - [ ] Linux libsecret
- [ ] 文件下载桌面体验闭环
  - [ ] 选择保存位置
  - [ ] 下载进度
  - [ ] 下载完成后打开文件
  - [ ] 打开所在目录
  - [ ] 下载失败重试
- [ ] 更细的桌面交互
  - [ ] 托盘未读/连接状态提示
  - [ ] 全局快捷键或桌面级快捷入口
  - [ ] 自动启动
  - [ ] 深链接
  - [ ] 自动更新
  - [ ] 拖拽上传 / 粘贴上传
- [ ] 群文件上传（当前后端上传 API 不支持 groupID 参数）
- [ ] 删群（后端未实现 DELETE /api/v2/groups/{groupID}）

## Frontend 产出目标

- 前端可稳定维持实时会话
- 用户能可靠地查看并切换公共/私聊/群会话
- 消息发送、失败反馈、恢复路径在 UI 上清晰可见
- 文件上传、下载、文件消息卡片展示完整闭环
- 群聊创建、成员管理、群消息实时收发
- 桌面能力通过统一抽象层暴露，而不是散落在 React 组件中
- 托盘、通知、窗口状态和文件系统行为更接近成熟桌面 IM
