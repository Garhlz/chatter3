export type Language = "zh-CN" | "en-US";

type TranslationKey =
  | "app.eyebrow"
  | "app.title"
  | "app.currentUser"
  | "auth.access"
  | "auth.login"
  | "auth.username"
  | "auth.password"
  | "auth.submit"
  | "auth.provision"
  | "auth.createAccount"
  | "auth.newUsername"
  | "auth.nickname"
  | "auth.newPassword"
  | "auth.register"
  | "auth.nicknamePlaceholder"
  | "identity.title"
  | "identity.sessionActive"
  | "identity.sessionMissing"
  | "identity.guest"
  | "identity.guestHint"
  | "identity.dismiss"
  | "identity.language"
  | "identity.theme"
  | "theme.system"
  | "theme.latte"
  | "theme.oneDark"
  | "telemetry.title"
  | "telemetry.summary"
  | "telemetry.reconnect"
  | "telemetry.refreshUsers"
  | "telemetry.tokenPresent"
  | "telemetry.tokenMissing"
  | "conversations.label"
  | "conversations.title"
  | "conversations.loginRequired"
  | "conversations.groups"
  | "conversations.refresh"
  | "conversations.groupName"
  | "conversations.groupMembers"
  | "conversations.newGroup"
  | "archive.label"
  | "archive.title"
  | "archive.reloadPublic"
  | "archive.privateUsername"
  | "archive.loadDirect"
  | "chat.conversation"
  | "chat.lobby"
  | "chat.group"
  | "chat.direct"
  | "chat.publicTitle"
  | "chat.directTitle"
  | "chat.message"
  | "chat.messages"
  | "chat.sending"
  | "chat.failed"
  | "chat.loading"
  | "chat.loadOlder"
  | "chat.reload"
  | "chat.live"
  | "chat.offline"
  | "chat.uploading"
  | "chat.attachFile"
  | "chat.selected"
  | "chat.emptyKicker"
  | "chat.emptyTitle"
  | "chat.emptyBody"
  | "composer.needAuth"
  | "composer.ready"
  | "composer.reconnecting"
  | "composer.offline"
  | "composer.privatePlaceholder"
  | "composer.groupPlaceholder"
  | "composer.publicPlaceholder"
  | "composer.selectedUser"
  | "composer.send"
  | "message.download"
  | "message.retry"
  | "message.status.sending"
  | "message.status.failed"
  | "group.label"
  | "group.members"
  | "group.owner"
  | "group.admin"
  | "group.remove"
  | "group.noMembers"
  | "group.noMembersHint"
  | "group.addPlaceholder"
  | "group.addMembers"
  | "status.idle"
  | "status.connecting"
  | "status.connected"
  | "status.closed"
  | "status.error"
  | "notice.realtimeReady"
  | "notice.reconnectScheduled"
  | "notice.registered"
  | "notice.manualReconnect"
  | "notice.presenceRefreshed"
  | "notice.groupCreated"
  | "notice.membersAdded"
  | "notice.memberRemoved"
  | "notice.fileUploaded"
  | "notice.restoreSession"
  | "notice.localArchiveLoaded"
  | "notice.sessionRestored"
  | "error.sessionExpired"
  | "error.noConfirmation"
  | "error.loginFailed"
  | "error.registerFailed"
  | "error.loginBeforeReconnect"
  | "error.loginBeforeHistory"
  | "error.loginBeforePrivateHistory"
  | "error.enterPrivateUsername"
  | "error.loadPublicHistory"
  | "error.loadPrivateHistory"
  | "error.loadOlder"
  | "error.refreshUsers"
  | "error.connectBeforeSend"
  | "error.choosePrivate"
  | "error.selectGroup"
  | "error.socketNotReady"
  | "error.socketNotOpen"
  | "error.reconnectBeforeRetry"
  | "error.loginBeforeCreateGroup"
  | "error.enterGroupName"
  | "error.createGroup"
  | "error.loginBeforeGroupHistory"
  | "error.loadGroupHistory"
  | "error.addMembers"
  | "error.removeMember"
  | "error.loginBeforeUpload"
  | "error.uploadFile"
  | "error.restoreSession";

const dictionaries: Record<Language, Record<TranslationKey, string>> = {
  "zh-CN": {
    "app.eyebrow": "实时聊天客户端",
    "app.title": "Chatter3",
    "app.currentUser": "当前用户：{name}",
    "auth.access": "登录",
    "auth.login": "账号登录",
    "auth.username": "用户名",
    "auth.password": "密码",
    "auth.submit": "登录",
    "auth.provision": "注册",
    "auth.createAccount": "创建账号",
    "auth.newUsername": "新用户名",
    "auth.nickname": "昵称",
    "auth.newPassword": "新密码",
    "auth.register": "注册账号",
    "auth.nicknamePlaceholder": "显示名称",
    "identity.title": "账号",
    "identity.sessionActive": "会话已保存",
    "identity.sessionMissing": "未保存会话",
    "identity.guest": "未登录",
    "identity.guestHint": "登录后进入聊天",
    "identity.dismiss": "关闭",
    "identity.language": "语言",
    "identity.theme": "主题",
    "theme.system": "跟随系统",
    "theme.latte": "白天",
    "theme.oneDark": "黑夜",
    "telemetry.title": "连接",
    "telemetry.summary": "HTTP 用于历史记录，WebSocket 用于在线状态和实时消息。",
    "telemetry.reconnect": "重连",
    "telemetry.refreshUsers": "刷新用户",
    "telemetry.tokenPresent": "已保存",
    "telemetry.tokenMissing": "缺失",
    "conversations.label": "会话",
    "conversations.title": "会话列表",
    "conversations.loginRequired": "登录后可用",
    "conversations.groups": "群组",
    "conversations.refresh": "刷新",
    "conversations.groupName": "群组名称",
    "conversations.groupMembers": "成员用户名，用逗号分隔",
    "conversations.newGroup": "新建群组",
    "archive.label": "历史",
    "archive.title": "手动查询",
    "archive.reloadPublic": "重新加载公共历史",
    "archive.privateUsername": "私聊用户名",
    "archive.loadDirect": "加载私聊消息",
    "chat.conversation": "会话",
    "chat.lobby": "公共",
    "chat.group": "群组",
    "chat.direct": "私聊",
    "chat.publicTitle": "公共大厅",
    "chat.directTitle": "私聊：{name}",
    "chat.message": "{count} 条消息",
    "chat.messages": "{count} 条消息",
    "chat.sending": "{count} 条发送中",
    "chat.failed": "{count} 条失败",
    "chat.loading": "加载中",
    "chat.loadOlder": "加载更早",
    "chat.reload": "刷新",
    "chat.live": "在线",
    "chat.offline": "离线",
    "chat.uploading": "上传中...",
    "chat.attachFile": "添加文件",
    "chat.selected": "已选择：{file}",
    "chat.emptyKicker": "暂无消息",
    "chat.emptyTitle": "当前会话还没有加载消息",
    "chat.emptyBody": "可以刷新历史、打开私聊，或在连接后发送第一条消息。",
    "composer.needAuth": "登录后才能发送消息。",
    "composer.ready": "按 Enter 发送，失败消息可重试。",
    "composer.reconnecting": "正在重连，第 {attempt} 次尝试。",
    "composer.offline": "实时连接未建立。",
    "composer.privatePlaceholder": "发送给 {name}",
    "composer.groupPlaceholder": "发送到 {name}",
    "composer.publicPlaceholder": "发送到公共大厅",
    "composer.selectedUser": "当前用户",
    "composer.send": "发送",
    "message.download": "下载",
    "message.retry": "重试",
    "message.status.sending": "发送中",
    "message.status.failed": "发送失败",
    "group.label": "群组",
    "group.members": "成员（{count}）",
    "group.owner": "群主",
    "group.admin": "管理员",
    "group.remove": "移除",
    "group.noMembers": "暂无成员数据",
    "group.noMembersHint": "刷新群组历史后可查看成员。",
    "group.addPlaceholder": "要添加的用户名，用逗号分隔",
    "group.addMembers": "添加成员",
    "status.idle": "未连接",
    "status.connecting": "连接中",
    "status.connected": "已连接",
    "status.closed": "已关闭",
    "status.error": "连接异常",
    "notice.realtimeReady": "实时会话已就绪，心跳超时：{timeout}",
    "notice.reconnectScheduled": "将在 {seconds} 秒后进行第 {attempt} 次重连。",
    "notice.registered": "注册成功，可以使用新账号登录。",
    "notice.manualReconnect": "已请求手动重连。",
    "notice.presenceRefreshed": "在线状态已刷新，当前 {count} 人在线。",
    "notice.groupCreated": "群组「{name}」已创建。",
    "notice.membersAdded": "已添加 {count} 位成员。",
    "notice.memberRemoved": "已移除 {name}。",
    "notice.fileUploaded": "文件「{name}」已上传。",
    "notice.restoreSession": "正在恢复已保存会话...",
    "notice.localArchiveLoaded": "已加载本地聊天记录，正在同步远端状态。",
    "notice.sessionRestored": "已恢复保存的会话。",
    "error.sessionExpired": "会话已过期，请重新登录。",
    "error.noConfirmation": "未收到实时确认。",
    "error.loginFailed": "登录失败",
    "error.registerFailed": "注册失败",
    "error.loginBeforeReconnect": "请先登录再重连。",
    "error.loginBeforeHistory": "请先登录再加载历史。",
    "error.loginBeforePrivateHistory": "请先登录再加载私聊历史。",
    "error.enterPrivateUsername": "请输入用户名后再加载私聊历史。",
    "error.loadPublicHistory": "加载公共历史失败",
    "error.loadPrivateHistory": "加载私聊历史失败",
    "error.loadOlder": "加载更早消息失败",
    "error.refreshUsers": "刷新在线用户失败",
    "error.connectBeforeSend": "请先建立实时连接再发送消息。",
    "error.choosePrivate": "请选择私聊会话后再发送消息。",
    "error.selectGroup": "请选择群组后再发送消息。",
    "error.socketNotReady": "实时连接尚未就绪。",
    "error.socketNotOpen": "连接未打开。",
    "error.reconnectBeforeRetry": "请先重连再重试消息。",
    "error.loginBeforeCreateGroup": "请先登录再创建群组。",
    "error.enterGroupName": "请输入群组名称。",
    "error.createGroup": "创建群组失败",
    "error.loginBeforeGroupHistory": "请先登录再加载群组历史。",
    "error.loadGroupHistory": "加载群组历史失败",
    "error.addMembers": "添加成员失败",
    "error.removeMember": "移除成员失败",
    "error.loginBeforeUpload": "请先登录再上传文件。",
    "error.uploadFile": "上传文件失败",
    "error.restoreSession": "恢复保存会话失败",
  },
  "en-US": {
    "app.eyebrow": "Realtime chat client",
    "app.title": "Chatter3",
    "app.currentUser": "Current user: {name}",
    "auth.access": "Access",
    "auth.login": "Login",
    "auth.username": "Username",
    "auth.password": "Password",
    "auth.submit": "Login",
    "auth.provision": "Provision",
    "auth.createAccount": "Create account",
    "auth.newUsername": "New username",
    "auth.nickname": "Nickname",
    "auth.newPassword": "New password",
    "auth.register": "Register",
    "auth.nicknamePlaceholder": "Friendly name",
    "identity.title": "Account",
    "identity.sessionActive": "Session saved",
    "identity.sessionMissing": "Session missing",
    "identity.guest": "Guest",
    "identity.guestHint": "Sign in to start chatting",
    "identity.dismiss": "Dismiss",
    "identity.language": "Language",
    "identity.theme": "Theme",
    "theme.system": "System",
    "theme.latte": "Day",
    "theme.oneDark": "Night",
    "telemetry.title": "Connection",
    "telemetry.summary": "HTTP loads history. WebSocket streams presence and realtime messages.",
    "telemetry.reconnect": "Reconnect",
    "telemetry.refreshUsers": "Refresh users",
    "telemetry.tokenPresent": "present",
    "telemetry.tokenMissing": "missing",
    "conversations.label": "Conversations",
    "conversations.title": "Conversation list",
    "conversations.loginRequired": "login required",
    "conversations.groups": "Groups",
    "conversations.refresh": "Refresh",
    "conversations.groupName": "Group name",
    "conversations.groupMembers": "Members, comma-separated",
    "conversations.newGroup": "New group",
    "archive.label": "History",
    "archive.title": "Manual lookup",
    "archive.reloadPublic": "Reload public history",
    "archive.privateUsername": "Private username",
    "archive.loadDirect": "Load direct messages",
    "chat.conversation": "Conversation",
    "chat.lobby": "Lobby",
    "chat.group": "Group",
    "chat.direct": "Direct",
    "chat.publicTitle": "Public lobby",
    "chat.directTitle": "Direct: {name}",
    "chat.message": "{count} message",
    "chat.messages": "{count} messages",
    "chat.sending": "{count} sending",
    "chat.failed": "{count} failed",
    "chat.loading": "Loading",
    "chat.loadOlder": "Load older",
    "chat.reload": "Reload",
    "chat.live": "Live",
    "chat.offline": "Offline",
    "chat.uploading": "Uploading...",
    "chat.attachFile": "Attach file",
    "chat.selected": "Selected: {file}",
    "chat.emptyKicker": "No messages",
    "chat.emptyTitle": "This conversation has no loaded messages",
    "chat.emptyBody": "Reload history, open a direct conversation, or send the first message once connected.",
    "composer.needAuth": "Log in before sending messages.",
    "composer.ready": "Press Enter to send. Failed messages can be retried.",
    "composer.reconnecting": "Realtime is reconnecting. Attempt {attempt}.",
    "composer.offline": "Realtime is not connected.",
    "composer.privatePlaceholder": "Send to {name}",
    "composer.groupPlaceholder": "Send to {name}",
    "composer.publicPlaceholder": "Send to the public lobby",
    "composer.selectedUser": "selected user",
    "composer.send": "Send",
    "message.download": "Download",
    "message.retry": "Retry",
    "message.status.sending": "sending",
    "message.status.failed": "failed",
    "group.label": "Group",
    "group.members": "Members ({count})",
    "group.owner": "owner",
    "group.admin": "admin",
    "group.remove": "Remove",
    "group.noMembers": "No member data",
    "group.noMembersHint": "Reload group history to see members.",
    "group.addPlaceholder": "Usernames to add, comma-separated",
    "group.addMembers": "Add members",
    "status.idle": "Idle",
    "status.connecting": "Connecting",
    "status.connected": "Connected",
    "status.closed": "Closed",
    "status.error": "Error",
    "notice.realtimeReady": "Realtime session ready. Heartbeat timeout: {timeout}",
    "notice.reconnectScheduled": "Realtime reconnect attempt {attempt} scheduled in {seconds}s.",
    "notice.registered": "Registration succeeded. You can now log in with the new account.",
    "notice.manualReconnect": "Manual realtime reconnect requested.",
    "notice.presenceRefreshed": "Presence refreshed. {count} users online.",
    "notice.groupCreated": "Group \"{name}\" created.",
    "notice.membersAdded": "Added {count} member(s).",
    "notice.memberRemoved": "Removed {name}.",
    "notice.fileUploaded": "File \"{name}\" uploaded.",
    "notice.restoreSession": "Restoring saved session...",
    "notice.localArchiveLoaded": "Local chat archive loaded. Syncing remote state.",
    "notice.sessionRestored": "Saved session restored.",
    "error.sessionExpired": "Session expired. Log in again.",
    "error.noConfirmation": "No realtime confirmation received.",
    "error.loginFailed": "Login failed",
    "error.registerFailed": "Registration failed",
    "error.loginBeforeReconnect": "Log in before reconnecting realtime.",
    "error.loginBeforeHistory": "Log in first before loading history.",
    "error.loginBeforePrivateHistory": "Log in first before loading private history.",
    "error.enterPrivateUsername": "Enter a username before loading private history.",
    "error.loadPublicHistory": "Failed to load public history",
    "error.loadPrivateHistory": "Failed to load private history",
    "error.loadOlder": "Failed to load older messages",
    "error.refreshUsers": "Failed to refresh online users",
    "error.connectBeforeSend": "Connect the realtime session before sending messages.",
    "error.choosePrivate": "Choose a private conversation before sending a direct message.",
    "error.selectGroup": "Select a group before sending a message.",
    "error.socketNotReady": "Realtime socket is not ready.",
    "error.socketNotOpen": "Socket is not open.",
    "error.reconnectBeforeRetry": "Reconnect the realtime session before retrying messages.",
    "error.loginBeforeCreateGroup": "Log in before creating a group.",
    "error.enterGroupName": "Enter a group name.",
    "error.createGroup": "Failed to create group",
    "error.loginBeforeGroupHistory": "Log in before loading group history.",
    "error.loadGroupHistory": "Failed to load group history",
    "error.addMembers": "Failed to add members",
    "error.removeMember": "Failed to remove member",
    "error.loginBeforeUpload": "Log in before uploading files.",
    "error.uploadFile": "Failed to upload file",
    "error.restoreSession": "Failed to restore saved session",
  },
};

export const LANGUAGE_KEY = "chatter3-language";

export function getInitialLanguage(): Language {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  return stored === "en-US" ? "en-US" : "zh-CN";
}

export function persistLanguage(language: Language) {
  localStorage.setItem(LANGUAGE_KEY, language);
}

export function t(
  language: Language,
  key: TranslationKey,
  params: Record<string, string | number> = {},
) {
  let template = dictionaries[language][key] ?? dictionaries["zh-CN"][key] ?? `[${key}]`;
  for (const [name, value] of Object.entries(params)) {
    template = template.replaceAll(`{${name}}`, String(value));
  }
  return template;
}

export function statusLabel(language: Language, status: string) {
  switch (status) {
    case "connecting":
      return t(language, "status.connecting");
    case "connected":
      return t(language, "status.connected");
    case "closed":
      return t(language, "status.closed");
    case "error":
      return t(language, "status.error");
    default:
      return t(language, "status.idle");
  }
}
