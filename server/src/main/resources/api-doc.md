# 聊天服务器接口文档

## 概述
本文档描述了聊天服务器的 Socket 接口规范。服务器使用 JSON 格式进行数据交互，支持 TCP 长连接。

## 服务器信息
- Socket 服务端口：9999
- 心跳间隔：30秒（可在application.yml中配置）
- 心跳超时：90秒（可在application.yml中配置）
- 最大消息长度：10000字节

## 安全认证
- 除登录和注册外，所有请求都需要携带JWT token
- token在登录成功后获取
- token有效期为24小时
- token通过响应消息的token字段返回

## 基础消息格式
所有消息使用JSON格式，基本结构如下：

```json
{
  "type": "消息类型",
  "username": "用户名",
  "password": "密码",
  "nickname": "昵称",
  "receiver": "接收者",
  "groupName": "群组名称",
  "content": "消息内容",
  "messageId": "消息ID",
  "token": "JWT令牌",
  "status": "状态",
  "timestamp": "时间戳",
  "errorMessage": "错误信息",
}
```
注意这里不再使用"onlineUsers": "在线用户列表","onlineCount": "在线用户数量", 这样太傻了, 直接写在content中好了
处理在线用户的方法使用type=ONLINE_USERS, content中放置列表

## 消息类型（MessageType）
- LOGIN: 登录请求
- LOGOUT: 登出请求
- REGISTER: 注册请求
- CHAT: 普通聊天消息
- PRIVATE_CHAT: 私聊消息
- GROUP_CHAT: 群聊消息
- FILE: 文件传输
- HEARTBEAT: 心跳包
- SYSTEM: 系统消息
- ERROR: 错误消息
- ONLINE_USERS
- OFFLINE_USERS
- USER_LOGIN: 更新在线列表, 新增用户
- USER_LOGOUT: 更新在线列表, 减少用户
- HISTORY_MESSAGES

## 详细接口说明

### 1. 用户认证

#### 1.1 用户注册
- 请求类型: REGISTER
- 必填字段: username, password, nickname
- 响应: 成功返回用户信息和token，失败返回错误信息

```json
// 请求示例
{
  "type": "REGISTER",
  "username": "user123",
  "password": "password123",
  "nickname": "张三"
}

// 成功响应
{
  "type": "SYSTEM",
  "content": "注册成功",
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "status": "success",
  "timestamp": "2023-05-01T12:00:00"
}

// 失败响应
{
  "type": "ERROR",
  "errorMessage": "用户名已存在",
  "status": "error",
  "timestamp": "2023-05-01T12:00:00"
}
```
{"type":"REGISTER","username":"222","password":"222","nickname":"User Two"}
{"type":"LOGIN","username":"111","password":"111"}
#### 1.2 用户登录
- 请求类型: LOGIN
- 必填字段: username, password
- 响应: 成功返回用户信息和token，失败返回错误信息

```json
// 请求示例
{
  "type": "LOGIN",
  "username": "user123",
  "password": "password123"
}

// 成功响应
// 刚才写的是对的, 但是文档错了
{
  "type": "LOGIN",
  "username":"user1",
  "nickname":"梨花",
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "status": "success",
  "timestamp": "2023-05-01T12:00:00",
}

// 失败响应(还没改)
{
  "type": "ERROR",
  "errorMessage": "用户名或密码错误",
  "status": "error",
  "timestamp": "2023-05-01T12:00:00"
}
```

#### 1.3 用户登出
- 请求类型: LOGOUT
- 必填字段: token
- 响应: 成功返回确认信息

```json
// 请求示例
{
  "type": "LOGOUT",
  "token": "eyJhbGciOiJIUzI1NiJ9..."
}

// 成功响应
{
  "type": "SYSTEM",
  "content": "已成功登出",
  "status": "success",
  "timestamp": "2023-05-01T12:00:00"
}
```


### 2. 消息通信

#### 2.1 发送公共聊天消息
- 请求类型: CHAT
- 必填字段: content, token
- 响应: 消息广播给所有在线用户

```json
// 请求示例
{
  "type": "CHAT",
  "content": "大家好！",
  "token": "eyJhbGciOiJIUzI1NiJ9..."
}

// 广播消息
{
  "type": "CHAT",
  "username": "user123",
  "nickname": "张三",
  "content": "大家好！",
  "timestamp": "2023-05-01T12:00:00",
  "messageId": 12345
}
```

#### 2.2 发送私聊消息
- 请求类型: PRIVATE_CHAT
- 必填字段: receiver, content, token
- 响应: 消息发送给指定用户

```json
// 请求示例
{
  "type": "PRIVATE_CHAT",
  "receiver": "user456",
  "content": "你好，这是私聊消息",
  "token": "eyJhbGciOiJIUzI1NiJ9..."
}

// 接收方收到的消息
{
  "type": "PRIVATE_CHAT",
  "username": "user123",
  "nickname": "张三",
  "receiver": "user456",
  "content": "你好，这是私聊消息",
  "timestamp": "2023-05-01T12:00:00",
  "messageId": 12346
}
```

#### 2.3 发送群聊消息
- 请求类型: GROUP_CHAT
- 必填字段: groupName, content, token
- 响应: 消息发送给群组内所有成员

```json
// 请求示例
{
  "type": "GROUP_CHAT",
  "userId": "123", // 这都是发送者信息
  "username": "Elaine",
  "nickname": "Elaine1",
  "receiver": null,
  "groupId": "123",
  "content": "大家看看这个问题怎么解决？"
}

// 群成员收到的广播消息
{
  "type": "GROUP_CHAT",
  "userId": 123, // 这都是发送者信息, 注意
  "username": "user123",
  "nickname": "张三",
  "groupId": "123",
  "content": "大家看看这个问题怎么解决？",
  "timestamp": "2023-05-01T12:00:00",
  "messageId": 12347
}
```

#### 2.4 文件传输
这是一个特殊接口, 客户端使用http进行上传, 然后服务端使用原有的长连接, 原生tcp发送一条文件类型的消息至接收者处
还没有处理客户端的文件收发逻辑
还有一点目前服务端处理消息的逻辑较为落后, 因为只可以给在线的用户(tcp handler)发送消息, 没有判断在线之类的问题
实际上比我设想的复杂

是这样的, 我在发送之前已经保存了消息和文件信息, 发送之后接收到了就不应该再重复保存一次了
等客户端写好之后再修改一下解析文件类型的逻辑, 现在的逻辑有问题

todo 需要修改, 客户端使用用户名而不是id来上传文件

```java
FileAttachment fileAttachment = messageService.saveFileInfo(messageId, originalFileName,
                  storedFileName, fileDownloadUri, file.getSize(), fileMD5, fileMimeType);

MessageDTO fileMessage = MessageDTO.builder().type(MessageType.FILE).userId(senderId)
        .username(senderUsername).nickname(senderNickname).content(fileAttachment) // 包含文件信息的对象
        .timestamp(LocalDateTime.now().format(FORMATTER)).build();
```

```json
post
localhost:8080/api/files/upload(使用已经设置的主机ip)
以下都是http请求体的键值对
header中放置authorization的string
string receiverUsername
file
```
- 发送给接收方的tcp格式 ,也是http返回体格式, 是MessageDTO类
```json
{
  "type": "FILE",
  "userId": 1,
  "username": "Alice",
  "nickname": "爱丽丝",
  "receiver": "Bob"
  "content" : {
    "fileId": 67890,
    "fileName": "my_document.pdf",
    "storedFileName": "a1b2c3d4-e5f6-7890-1234-567890abcdef.pdf",
    "fileUrl": "http://yourserver.com/api/files/download/a1b2c3d4-e5f6-7890-1234-567890abcdef.pdf",
    "fileSize": 102400, // 字节
    "fileType": "application/pdf",
    "md5": "e0e1e2e3e4e5e6e7e8e9eaebecedeeef",
    "uploadTime": "2023-03-15T10:00:00" // LocalDateTime 格式
  }, // 注意content额外编码成json了一次, 需要重新解码
  "timestamp":"2023-03-15T10:00:00",
  "messageId":1
}
```

#### 2.5 发送在线用户列表
```json
// 响应
{
  "type": "ONLINE_USERS",
  "content": [{"userId":3,"username":"3","nickname":"user3","avatarUrl":"https://secure.gravatar.com/avatar/default?s=200&d=mp","status":0,"lastHeartbeat":[2025,4,15,14,2,38,206000000],"createdAt":[2025,4,15,13,48,20,743000000],"lastLoginAt":[2025,4,15,13,48,25,371000000]}],
  "timestamp":"2025-04-15T23:47:31.8313193"
}
```
#### 2.6 发送离线用户列表
```json
// 响应
{
  "type": "OFFLINE_USERS",
  "content": [{"userId":3,"username":"3","nickname":"user3","avatarUrl":"https://secure.gravatar.com/avatar/default?s=200&d=mp","status":0,"lastHeartbeat":[2025,4,15,14,2,38,206000000],"createdAt":[2025,4,15,13,48,20,743000000],"lastLoginAt":[2025,4,15,13,48,25,371000000]}],
  "timestamp":"2025-04-15T23:47:31.8313193"
}
```

#### 2.7 新增在线列表

```json
// 需要修改为直接返回user类, 而不是username, 因为需要插入
// 响应
{
  "type": "USER_LOGIN",
  "content":{"userId":3,"username":"3","nickname":"user3","avatarUrl":"https://secure.gravatar.com/avatar/default?s=200&d=mp","status":0,"lastHeartbeat":[2025,4,15,14,2,38,206000000],"createdAt":[2025,4,15,13,48,20,743000000],"lastLoginAt":[2025,4,15,13,48,25,371000000]},
  "timestamp": "2023-05-01T12:00:00"
}
```

#### 2.8 从在线列表中移除
```json
// 响应
{
  "type": "USER_LOGOUT",
  "content":{"userId":3,"username":"3","nickname":"user3","avatarUrl":"https://secure.gravatar.com/avatar/default?s=200&d=mp","status":0,"lastHeartbeat":[2025,4,15,14,2,38,206000000],"createdAt":[2025,4,15,13,48,20,743000000],"lastLoginAt":[2025,4,15,13,48,25,371000000]},
  "timestamp": "2023-05-01T12:00:00"
}
```

#### 2.9 发送聊天记录
```json
// 响应
{
  "type": "HISTORY_MESSAGES",
  "timestamp": "2023-05-01T12:00:00",
  "content": [{"type":"PRIVATE_CHAT","username":"3","password":null,"nickname":"user3","receiver":"1","content":"hello user1. iam user3","token":null,"status":null,"timestamp":"2025-04-15T13:48:40.546","errorMessage":null,"messageId":16,"onlineUsers":null,"messages":null}]
}
```

### 3. 系统功能

#### 3.1 心跳包
- 请求类型: HEARTBEAT
- 必填字段: token(不用token, 因为解除登录之后, 也需要连接)
- 说明: 客户端需要定期发送心跳包以维持连接

```json
// 请求示例
{
  "type": "HEARTBEAT"
}

// 响应示例
{
  "type": "HEARTBEAT",
  "timestamp": "2023-05-01T12:00:00"
}
```

#### 3.2 系统通知
- 类型: SYSTEM
- 说明: 服务器主动推送的系统消息，如用户上线/下线通知等

```json
// 系统通知示例
{
  "type": "SYSTEM",
  "content": "用户 '李四' 已上线",
  "timestamp": "2023-05-01T12:00:00",
  "onlineUsers": [{"username":"user123","nickname":"张三","status":"online"}, {"username":"user456","nickname":"李四","status":"online"}],
  "onlineCount": 2
}
```

#### 3.3 错误消息
- 类型: ERROR
- 说明: 服务器返回的错误信息

```json
// 错误消息示例
{
  "type": "ERROR",
  "errorMessage": "消息发送失败：接收用户不存在",
  "status": "error",
  "timestamp": "2023-05-01T12:00:00"
}
```

### 4. 群组功能

说明: 群组的消息处理和之前的公共聊天和私聊共用一个接口，这意味着当发送群消息时，需要设置 groupId 字段而非 receiverId。

响应码的问题还需要思考一下, 客户端如何接受响应码, 作出相应的反应...

解决方案:在前端类中管理一个操作队列，并根据唯一ID接收成功响应后才执行对应的操作，这是在原生 TCP 长连接环境下实现前端操作可靠性和用户体验优化的非常优秀且推荐的设计模式。

注意operationId来自UUID, 是string

#### 4.1 创建群组
- 类型: GROUP:CREATE
- 必填字段: 
creatorId: 创建者的用户 ID (Long)
groupName: 群组名称 (String)
operationId: 操作 ID

```json
// 请求示例
{
    "type": "GROUP_CREATE",
    "content": {
        "operatorId": 123,
        "groupName": "我们是相亲相爱一家人", 
        "operationId": "123"
    }
}

// 响应示例 (成功)
{
    "type": "GROUP_RESPONSE",
    "status": "success",
    "content": {
        "operationId": "123",
        "groupId": 1001,
        "groupName": "123",
        "creatorId":123,
        "createdAt": "2025-06-08 14:46:58" // 服务器生成的时间
    }
}

// 响应示例 (失败)
{
    "type": "GROUP_RESPONSE",
    "status": "error",
    "content":{
        "operationId": "123",
        "message": "群组名称不能为空或创建者ID无效"
    }
    
}

```

#### 4.2 删除群组
- 类型: GROUP:DELETE
- 必填字段: 
operatorId: 操作者的用户 ID (Long)
groupId: 要删除的群组 ID (Long)
operationId: 操作 ID

```json
// 请求示例
{
    "type": "GROUP_DELETE",
    "content": {
        "operationId": "123",
        "operatorId": 123,
        "groupId": 1001
    }
}


// 响应示例 (成功)
{
    "type": "GROUP_RESPONSE",
    "status": "success",
    "content": {
        "operationId": "123",
        "groupId": 1001,
        "message": "群组删除成功",
    }
}

{
  "type": "GROUP_BROADCAST",
  "content": {
    "type": "remove",
    "groupId": 1001,
    "groupName": "123",
  }
}

// 响应示例 (失败 - 群组不存在或权限不足)
{
    "type": "GROUP_RESPONSE",
    "status": "error",
    "content": {
        "operationId": "123",
        "status": "error",
        "message": "群组不存在或您没有权限删除该群组"
    }
    
}

```

#### 4.3 群组加入成员
- 类型: GROUP:ADD
- 必填字段: 
operatorId: 操作者的用户 ID (Long)
groupId: 要加入的群组 ID (Long)
userId: 要加入群组的成员用户 ID (Long)
operationId: 操作 ID
```json
// 请求示例
{
    "type": "GROUP_ADD",
    "content": {
        "operationId": "123",
        "operatorId": 123,
        "groupId": 1001,
        "userId": 456
    }
}


// 响应示例 (成功)
{
    "type": "GROUP_RESPONSE",
    "status": "success",
    "content": {
      "operationId": "123",
        "groupId": 1001,
        "userId": 456,
        "message": "成员 456 已成功加入群组 1001",
    }
}

{
  "type": "GROUP_BROADCAST",
  "content": {
    "type": "add",
    "groupId": 1001,
    "groupName": "123",
    "creatorId": "123",
    "members":[],
    "history": [{messageDTO类}]
  }
}


// 响应示例 (失败 - 用户已在群组中)
{ 
    "type": "GROUP_RESPONSE",
    "content":{"operationId": "123","message": "用户 456 已经在群组 1001 中了"},
    "status": "error"
    
}

// 响应示例 (失败 - 群组或用户不存在，或权限不足)
{
    "type": "GROUP_RESPONSE",
    "content":{"operationId": "123","message": "群组或用户不存在，或您没有权限添加成员"},
    "status": "error"
}


```

#### 4.4 群组删除成员
- 类型: GROUP:REMOVE
- 必填字段: 
operatorId: 操作者的用户 ID (Long)
groupId: 群组 ID (Long)
userId: 要移除的成员用户 ID (Long)
operationId: 操作 ID

```json
// 请求示例
{
    "type": "GROUP_REMOVE",
    "content": {
        "operationId": "123",
        "operatorId": 123,
        "groupId": 1001,
        "userId": 456
    }
}


// 响应示例 (成功)
{
    "type": "GROUP_RESPONSE",
    "status": "success",
    "content": {
        "operationId": "123",
        "message": "成员 456 已成功从群组 1001 移除",
    }
}

{
  "type": "GROUP_BROADCAST",
  "content": {
    "type": "remove",
    "groupId": 1001,
    "groupName": "123"
  }
}

// 响应示例 (失败 - 用户不在群组中)
{
    "type": "GROUP_RESPONSE",
    "status": "error",
    "content":{"operationId": "123","message": "用户 456 不在群组 1001 中"},
}

// 响应示例 (失败 - 群组或用户不存在，或权限不足)
{
    "type": "GROUP_RESPONSE",
    "status": "error",
    "content":{"operationId": "123","message": "群组或用户不存在，或您没有权限移除该成员"},
}

```

#### 4.5 登录时提供群组详细消息
- 类型: GROUP_INFO
- 必填字段: 
参考GroupDetailDTO

{
    "type": "GROUP_INFO",
    "content":
    {
      [
        {
          "groupId": 123,
          "groupName": "123",
          "creatorId":123,
          "createdAt": null,
          "members":[user1, user2, ...]
        },
        {
          "groupId": 123,
          "groupName": "123",
          "creatorId":123,
          "createdAt": null,
          "members":[user1, user2, ...]
        },
      ]
    }
}



## 错误码说明

| 错误码 | 描述 |
| ----- | ---- |
| 1001  | 认证失败 |
| 1002  | 用户不存在 |
| 1003  | 密码错误 |
| 1004  | 用户名已存在 |
| 2001  | 消息格式错误 |
| 2002  | 消息发送失败 |
| 3001  | 群组不存在 |
| 3002  | 不是群组成员 |
| 9999  | 服务器内部错误 |
