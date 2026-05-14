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
- [x] `Soft Desktop` 方向的大幅界面改版已落地
- [x] 页面结构已调整为“左账户 / 中聊天 / 右状态与工具”的桌面客户端布局

## Frontend Next

- [ ] 完善前端重连策略
- [ ] 为发送动作补 loading / retry / fail 反馈
- [ ] 增加更明确的会话列表，而不只依赖在线用户列表 + 手动拉历史
- [ ] 完善在线用户列表的专门展示区与会话入口
- [ ] 增加消息状态反馈：发送中 / 失败 / 已送达（至少先占位）
- [ ] 决定 `zustand` 是否作为正式状态层并真正接入

## Frontend Later

- [ ] 文件上传 UI、下载入口与错误反馈
- [ ] 群聊界面与群会话列表
- [ ] 更完整的桌面端交互细节：快捷键、空状态、细粒度提示、窗口态适配

## Frontend 产出目标

- 前端可稳定维持实时会话
- 用户能可靠地查看并切换公共/私聊会话
- 消息发送、失败反馈、恢复路径在 UI 上清晰可见
