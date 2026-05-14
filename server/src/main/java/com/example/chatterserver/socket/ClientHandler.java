package com.example.chatterserver.socket;

import com.example.chatterserver.dto.GroupDetailDTO;
import com.example.chatterserver.dto.MessageDTO;
import com.example.chatterserver.exception.ChatException;
import com.example.chatterserver.model.Message;
import com.example.chatterserver.model.MessageType;
import com.example.chatterserver.model.User;
import com.example.chatterserver.model.GroupInfo;
import com.example.chatterserver.service.ChatLobbyService;
import com.example.chatterserver.service.MessageService;
import com.example.chatterserver.service.UserService;
import com.example.chatterserver.service.GroupService;
import com.example.chatterserver.util.JwtUtil;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.*;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import lombok.extern.slf4j.Slf4j;

/**
 * 客户端处理器，负责处理单个客户端的通信逻辑，包括消息接收、发送和会话管理。
 */
@Slf4j
public class ClientHandler implements Runnable, AutoCloseable {
    private final Socket                   clientSocket;
    private final ChatSocketServer         server;
    private final BufferedReader           reader;
    private final PrintWriter              writer;
    private String                         username;
    private String                         currentNickname;
    private Long                           userId;
    private boolean                        running;

    private final UserService              userService;
    private final MessageService           messageService;
    private final ObjectMapper             objectMapper;
    private final ChatLobbyService         chatLobbyService;
    private final GroupService             groupService;
    private final JwtUtil                  jwtUtil;

    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    public ClientHandler(Socket socket, ChatSocketServer server, UserService userService,
            MessageService messageService, GroupService groupService,
            ChatLobbyService chatLobbyService, JwtUtil jwtUtil) throws IOException {
        this.clientSocket = socket;
        this.server = server;

        // ! change 终于改为了utf-8
        // 输入流：使用 InputStreamReader 并明确指定 StandardCharsets.UTF_8
        this.reader = new BufferedReader(
                new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
        // 输出流：使用 OutputStreamWriter 并明确指定 StandardCharsets.UTF_8，然后用 PrintWriter 包装
        this.writer = new PrintWriter(
                new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8), true);
        this.running = true;
        this.userService = userService;
        this.messageService = messageService;
        this.chatLobbyService = chatLobbyService;
        this.groupService = groupService;
        this.jwtUtil = jwtUtil;
        this.objectMapper = server.getObjectMapper();
        log.info("Created ClientHandler for client: {}:{}", socket.getInetAddress(),
                socket.getPort());
    }

    @Override
    public void run() { // TODO 这里需要改成NIO的方式, 但是现在还没有改好
        try {
            log.info("ClientHandler started for socket: {}", clientSocket.getInetAddress());
            while (running && !clientSocket.isClosed()) {
                String message = reader.readLine();
                if (message == null) {
                    log.warn("Received null message, client may have disconnected");
                    break;
                }
                log.debug("Received message: {}", message);
                handleMessage(message);
            }
        } catch (IOException e) {
            log.error("Error handling client {}: {}", clientSocket.getInetAddress(), e.getMessage(),
                    e);
        } finally {
            cleanup(true);
        }
    }

    @Override
    public void close() throws IOException {
        cleanup(true);
    }

    private void handleMessage(String messageStr) {
        try {
            if (messageStr == null || messageStr.trim().isEmpty()) {
                throw new ChatException("消息不能为空", ChatException.MESSAGE_ERROR);
            }

            if (messageStr.length() > 10000) {
                throw new ChatException("消息长度超过限制", ChatException.MESSAGE_ERROR);
            }

            MessageDTO message = objectMapper.readValue(messageStr, MessageDTO.class);

            if (message.getType() == null) {
                throw new ChatException("消息类型不能为空", ChatException.MESSAGE_ERROR);
            }

            // 这里直接全局配置了...如果长期收不到心跳的回复, 就会
            if (!MessageType.LOGIN.equals(message.getType())
                    && !MessageType.REGISTER.equals(message.getType())
                    && !server.getJwtAuthInterceptor().validateToken(messageStr)) {
                throw new ChatException("无效的token", ChatException.AUTH_ERROR);
            }

            switch (message.getType()) {
            case LOGIN:
                handleLogin(message);
                break;
            case REGISTER:
                handleRegister(message);
                break;
            case CHAT:
                handleChatMessage(message);
                break;
            case PRIVATE_CHAT:
                handlePrivateMessage(message);
                break;
            case GROUP_CHAT:
                handleGroupMessage(message);
                break;
            case LOGOUT:
                handleLogout();
                break;
            case HEARTBEAT:
                handleHeartbeat();
                break;
            case GROUP_CREATE:
                handleGroupCreate(message);
                break;
            case GROUP_DELETE:
                handleGroupDelete(message);
                break;
            case GROUP_ADD:
                handleGroupAdd(message);
                break;
            case GROUP_REMOVE:
                handleGroupRemove(message);
                break;
            default:
                throw new ChatException("未知的消息类型: " + message.getType(),
                        ChatException.MESSAGE_ERROR);
            }
        } catch (ChatException e) {
            log.error("Chat error: {} ({})", e.getMessage(), e.getErrorCode());
            sendErrorResponse(e, messageStr);
        } catch (IOException e) {
            log.error("IO error: {} [Raw message: {}]", e.getMessage(), messageStr);
            sendErrorResponse(
                    new ChatException("消息格式错误: " + e.getMessage(), ChatException.MESSAGE_ERROR),
                    messageStr);
        } catch (Exception e) {
            log.error("Unexpected error: {} [Raw message: {}]", e.getMessage(), messageStr);
            sendErrorResponse(new ChatException("服务器内部错误", ChatException.SYSTEM_ERROR), messageStr);
        }
    }

    private void sendErrorResponse(ChatException e, String rawMessage) {
        try {
            MessageDTO message = MessageDTO.builder().type(MessageType.ERROR)
                    .errorMessage(e.getMessage()).status("error")
                    .timestamp(LocalDateTime.now().format(FORMATTER))
                    .content(rawMessage != null ? "Invalid input: " + rawMessage : null).build();
            String response = objectMapper.writeValueAsString(message);
            sendMessage(response);
            log.debug("Sent error response to client {}: {}", clientSocket.getInetAddress(),
                    response);
        } catch (Exception ex) {
            log.error("Error sending error response: {}", ex.getMessage());
        }
    }

    private void handleLogin(MessageDTO message) {
        try {
            if (username != null) {
                throw new ChatException("用户已登录", ChatException.AUTH_ERROR);
            }

            String username = message.getUsername();
            String password = message.getPassword();

            // 这里管理一下在线状态
            User findedUser = chatLobbyService.getUserByUsername(username);
            if (findedUser != null && findedUser.isOnline()) {
                throw new ChatException("用户已登录", ChatException.AUTH_ERROR);
            }

            if (username == null || password == null || username.trim().isEmpty()
                    || password.trim().isEmpty()) {
                throw new ChatException("用户名或密码不能为空", ChatException.AUTH_ERROR);
            }

            if (!userService.authenticate(username, password)) {
                throw new ChatException("用户名或密码错误", ChatException.AUTH_ERROR);
            }

            this.username = username;
            User user = userService.findByUsername(username);
            this.userId = user.getUserId();
            this.currentNickname = user.getNickname();
            String token = jwtUtil.generateToken(userId, username);

            server.registerClient(username, this);
            userService.updateLastLogin(username);
            userService.updateUserStatus(username, 1);
            // 同样不科学, 不应该用数据库存储登陆状态

            chatLobbyService.addUser(user); // 这里修改了

            MessageDTO response = MessageDTO.builder().type(MessageType.LOGIN).status("success")
                    .userId(userId).username(username).nickname(user.getNickname()).token(token)
                    .timestamp(LocalDateTime.now().format(FORMATTER)).build();
            // 注意要加上userId, 会方便很多
            sendMessage(objectMapper.writeValueAsString(response));

            // 给当前客户端发送所有的在线列表, 其他会话新增当前用户在线
            sendOnlineUsers();

            broadcastOnlineInfo();

            sendOfflineUsers();

            // 查询和发送公共聊天记录
            sendHistoryChatLobbyMessages();

            // 查询和发送私聊聊天记录
            sendHistoryPrivateMessages();

            // 发送所有的相关群组信息, 包括当前用户所在群组, 这些群组包含的用户
            sendGroupInfo();
            // 查询和发送群聊聊天记录
            sendHistoryGroupMessages();

        } catch (Exception e) {
            throw new ChatException("登录失败: " + e.getMessage(), ChatException.AUTH_ERROR);
        }
    }

    private void handleRegister(MessageDTO message) {
        try {
            String username = message.getUsername();
            String password = message.getPassword();
            String nickname = message.getNickname();

            User user = userService.register(username, password, nickname);

            MessageDTO response = MessageDTO.builder().type(MessageType.REGISTER).build();

            if (user != null) {
                response.setStatus("success");
                response.setUsername(username);
                response.setNickname(nickname);
            } else {
                response.setStatus("error");
                response.setErrorMessage("用户名已存在");
            }

            sendMessage(objectMapper.writeValueAsString(response));
        } catch (Exception e) {
            log.error("Register error: {}", e.getMessage(), e);
            sendErrorResponse(
                    new ChatException("注册失败: " + e.getMessage(), ChatException.SYSTEM_ERROR), null);
        }
    }

    private void handleChatMessage(MessageDTO message) { // 这里广播机制的逻辑有问题, 已经修复
        if (username != null) {
            try {
                messageService.saveMessage(userId, null, null, 0, message.getContent().toString());
                // 只有发送者
                // 这里直接向下强转应该可以
                message.setNickname(userService.findByUsername(username).getNickname());
                message.setUsername(username);
                message.setTimestamp(LocalDateTime.now().format(FORMATTER));

                String messageJson = objectMapper.writeValueAsString(message);
                // log.info("Received chat message: {}", messageJson);
                server.broadcastMessage(username, messageJson);

                // sendMessage(messageJson);
                // 这个不对, 当前用户不需要发送
            } catch (Exception e) {
                log.error("Error handling chat message: {}", e.getMessage(), e);
                sendErrorResponse(new ChatException("消息发送失败", ChatException.MESSAGE_ERROR), null);
            }
        }
    }

    private synchronized void handlePrivateMessage(MessageDTO message) {
        if (username != null) {
            try {
                log.info("private message sender: " + username);
                log.info("current private message: " + message);
                String receiver = message.getReceiver(); // receiver的唯一username
                if (receiver == null || receiver.trim().isEmpty()) {
                    throw new ChatException("接收者不能为空", ChatException.MESSAGE_ERROR);
                }

                User receiverUser = userService.findByUsername(receiver);
                // 传输过来的时候已经有type了
                if (receiverUser != null) {
                    Message savedMessage = messageService.saveMessage(userId,
                            receiverUser.getUserId(), null, 0, message.getContent().toString());

                    MessageDTO messageToSend = MessageDTO.builder().type(MessageType.PRIVATE_CHAT)
                            .username(username).nickname(currentNickname).receiver(receiver)
                            .content(message.getContent())
                            .timestamp(LocalDateTime.now().format(FORMATTER))
                            .messageId(savedMessage.getMessageId()).build();
                    // 重构了一遍, 思路更清晰了
                    // username和nickname都是发送者的
                    String messageJson = objectMapper.writeValueAsString(messageToSend);
                    server.sendPrivateMessage(username, receiver, messageJson);

                    // sendMessage(messageJson);
                    // 自己不需要收到消息
                } else {
                    throw new ChatException("接收者不存在", ChatException.USER_NOT_FOUND);
                }
            } catch (ChatException e) {
                sendErrorResponse(e, null);
            } catch (Exception e) {
                log.error("Error handling private message: {}", e.getMessage(), e);
                sendErrorResponse(new ChatException("私聊消息发送失败", ChatException.MESSAGE_ERROR), null);
            }
        } else {
            throw new ChatException("用户未登录", ChatException.AUTH_ERROR);
        }
    }

    /**
     * 处理客户端发送的群聊消息。 遵循以下步骤：1. 检验信息完整性 2. 检验用户信息和数据库的是否一致 3. 用户是否在群组中 4. 检验完毕, 先储存信息 5.
     * 按照格式广播信息到群组成员会话中
     *
     * @param message 接收到的 MessageDTO 对象
     */
    private void handleGroupMessage(MessageDTO message) {
        Long senderUserId = this.userId; // **从当前会话字段获取，最可靠的发送者ID**
        String senderUsername = this.username; // **从当前会话字段获取**
        String senderNickname = this.currentNickname; // **从当前会话字段获取**

        try {
            // --- 1. 检验信息完整性 ---
            Long messageUserId = message.getUserId(); // 客户端消息中提供的 userId
            String messageUsername = message.getUsername(); // 客户端消息中提供的 username
            String messageNickname = message.getNickname(); // 客户端消息中提供的 nickname
            Long groupId = message.getGroupId();
            Object rawContent = message.getContent();
            String content = null;

            // 基本字段非空校验
            if (messageUserId == null || messageUsername == null || messageNickname == null
                    || groupId == null || rawContent == null) {
                throw new IllegalArgumentException("消息数据不完整：必填字段缺失。");
            }

            // 消息内容格式转换与校验
            if (rawContent instanceof String) {
                content = (String) rawContent;
            } else {
                content = objectMapper.writeValueAsString(rawContent); // 将非字符串内容序列化为JSON字符串
            }

            if (content.trim().isEmpty()) {
                throw new IllegalArgumentException("消息内容不能为空。");
            }

            // --- 2. 检验用户信息一致性 (安全性关键点) ---
            // 确保客户端提供的发送者信息与服务器认证的会话信息一致
            if (!senderUserId.equals(messageUserId) || !senderUsername.equals(messageUsername)
                    || !senderNickname.equals(messageNickname)) {
                log.warn("安全警告：用户 {} 尝试发送不一致的用户信息。消息中userId={}, username={}, nickname={}",
                        senderUserId, messageUserId, messageUsername, messageNickname);
                throw new SecurityException("发送者信息与当前会话不匹配，操作拒绝。");
            }

            // --- 3. 检验用户是否在群组中 ---
            Map<Long, User> currentGroupMembers = groupService.getAllUsersFromGroup(groupId);
            if (!currentGroupMembers.containsKey(senderUserId)) { // 使用会话中的 senderUserId
                throw new SecurityException("您不是该群组的成员，无法发送消息。");
            }

            // --- 4. 检验完毕, 先储存信息 ---
            // 调用 MessageService 保存消息，传递 null 作为 receiverId 表示群聊
            // MessageService 应该返回包含服务器生成 messageId 和 timestamp 的 Message 对象
            Message savedMessage = messageService.saveMessage(senderUserId, null, groupId, 0,
                    content);

            Long messageId = savedMessage.getMessageId();

            if (messageId == null) {
                throw new RuntimeException("消息保存失败，未获取到消息ID。");
            }

            // --- 5. 按照格式广播信息到群组成员会话中 ---
            // 构建发送给群成员的 MessageDTO
            MessageDTO messageToSend = MessageDTO.builder().type(MessageType.GROUP_CHAT)
                    .userId(senderUserId) // 使用会话中的用户信息
                    .username(senderUsername).nickname(senderNickname).groupId(groupId)
                    .content(content).timestamp(LocalDateTime.now().format(FORMATTER)) // 使用服务器生成的时间戳
                    .messageId(messageId) // 使用服务器生成的消息ID
                    .build();

            String messageJson = objectMapper.writeValueAsString(messageToSend);

            // 遍历群组成员，检查是否在线并发送消息
            // 优化：直接遍历 currentGroupMembers 的 values (User对象)
            currentGroupMembers.values().parallelStream().filter(member -> {
                // 过滤掉发送者本身，避免自己给自己发送消息（如果业务逻辑需要）
                // 这里假设 member 对象有 getUserId() 方法
                return member.getUserId() != senderUserId;
            }).forEach(member -> {
                // 使用 chatLobbyService.isOnline(User user) 方法判断用户是否在线
                if (chatLobbyService.isOnline(member)) {
                    server.sendPrivateMessage(senderUsername, member.getUsername(), messageJson);
                    log.info("Sent group message {} to online user {}", messageId,
                            member.getUserId());
                }
                // 对于离线用户，消息已存储在数据库，他们上线时会拉取到
            });

        } catch (IllegalArgumentException e) {
            log.warn("处理群消息参数错误：{}", e.getMessage());
        } catch (SecurityException e) {
            log.warn("处理群消息安全验证失败：{}", e.getMessage());
        } catch (Exception e) { // 捕获其他非预期异常
            log.error("处理群消息时发生未知错误: {}", e.getMessage(), e); // 打印完整的堆栈信息
        }
    }



    private void handleGroupCreate(MessageDTO message) {
        String operationId = null;
        try {
            if (message.getContent() instanceof Map) {
                Map<String, Object> contentMap = (Map<String, Object>) message.getContent();
                Long operatorId = ((Number) contentMap.get("operatorId")).longValue();
                String groupName = (String) contentMap.get("groupName");
                operationId = (String) contentMap.get("operationId");

                log.info("group create, operatorId: {}, groupName: {}, operationId: {}", operatorId,
                        groupName, operationId);

                GroupInfo groupInfo = groupService.createGroup(operatorId, groupName);

                Map<String, Object> responseData = new HashMap<>();
                responseData.put("operationId", operationId);
                responseData.put("groupId", groupInfo.getGroupId());
                // 需要返回正确的字段
                responseData.put("groupName", groupName);
                responseData.put("creatorId", operatorId);
                responseData.put("createdAt", groupInfo.getCreatedAt()
                        .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));

                MessageDTO successResponse = MessageDTO.builder().type(MessageType.GROUP_RESPONSE)
                        .status("success").content(responseData).build();

                sendMessage(objectMapper.writeValueAsString(successResponse));

            } else {
                log.error("GROUP_CREATE 消息的 content 格式不正确");
                sendErrorResponse(operationId, "请求参数错误: content 格式不正确");
            }
        } catch (IllegalArgumentException e) { // 针对参数错误抛出的更具体异常
            log.warn("处理 GROUP_CREATE 消息参数错误: {}", e.getMessage());
            sendErrorResponse(operationId, e.getMessage());
        } catch (Exception e) {
            log.error("处理 GROUP_CREATE 消息失败: {}", e.getMessage(), e);
            sendErrorResponse(operationId, "创建群组失败: " + e.getMessage());
        }
    }

    // --- handleGroupDelete 函数 ---
    // 注意这里需要通知当前群组中的所有用户, 这个群已经被删除. 后面几个方法同理, 需要同步通知群组中的用户
    private void handleGroupDelete(MessageDTO message) {
        String operationId = null;
        try {
            if (message.getContent() instanceof Map) {
                Map<String, Object> contentMap = (Map<String, Object>) message.getContent();
                Long operatorId = ((Number) contentMap.get("operatorId")).longValue();
                Long groupId = ((Number) contentMap.get("groupId")).longValue();
                operationId = (String) contentMap.get("operationId");

                log.info("group delete, operatorId: {}, groupId: {}, operationId: {}", operatorId,
                        groupId, operationId);

                // --- 权限验证 ---
                if (!groupService.isGroupOwner(operatorId, groupId)) {
                    sendErrorResponse(operationId, "您没有权限删除该群组。只有群主可以删除。");
                    return; // 权限不足，直接返回
                }



                // ! change 先通知当前群组中的所有用户, 退出当前群聊...
                String operatorUsername = userService.findById(operatorId).getUsername();

                Map<Long, User> userMap = groupService.getAllUsersFromGroup(groupId);
                Map<String, Object> broadcastData = new HashMap<>();

                broadcastData.put("groupId", groupId);

                String groupName = groupService.getGroupInfoByGroupId(groupId).getGroupName();
                broadcastData.put("groupName", groupName);

                broadcastData.put("type","remove");
                MessageDTO messageToBroadcast = MessageDTO.builder().type(MessageType.GROUP_BROADCAST).content(broadcastData).build();
                for(User user : userMap.values()) {
                    String receiverUsername = user.getUsername();
                    server.sendPrivateMessage(operatorUsername, receiverUsername, objectMapper.writeValueAsString(messageToBroadcast));
                }

                // 调用 Service 方法删除群组
                int deletedRows = groupService.deleteGroupByGroupId(groupId);

                if (deletedRows > 0) {
                    Map<String, Object> responseData = new HashMap<>();
                    responseData.put("operationId", operationId);
                    responseData.put("groupId", groupId);
                    responseData.put("message", "群组删除成功");
                    MessageDTO successResponse = MessageDTO.builder()
                            .type(MessageType.GROUP_RESPONSE).status("success")
                            .content(responseData).build();
                    sendMessage(objectMapper.writeValueAsString(successResponse));
                } else {
                    // Service 返回 0，说明群组不存在，或者在权限验证后，删除时又出问题
                    sendErrorResponse(operationId, "群组不存在或删除失败。");
                }
            } else {
                log.error("GROUP_DELETE 消息的 content 格式不正确");
                sendErrorResponse(operationId, "请求参数错误: content 格式不正确");
            }
        } catch (IllegalArgumentException e) { // 针对参数错误抛出的更具体异常
            log.warn("处理 GROUP_DELETE 消息参数错误: {}", e.getMessage());
            sendErrorResponse(operationId, e.getMessage());
        } catch (Exception e) {
            log.error("处理 GROUP_DELETE 消息失败: {}", e.getMessage(), e);
            sendErrorResponse(operationId, "删除群组失败: " + e.getMessage());
        }
    }

    // --- handleGroupAdd 函数 ---
    private void handleGroupAdd(MessageDTO message) {
        String operationId = null;
        try {
            if (message.getContent() instanceof Map) {
                Map<String, Object> contentMap = (Map<String, Object>) message.getContent();
                Long operatorId = ((Number) contentMap.get("operatorId")).longValue();
                Long groupId = ((Number) contentMap.get("groupId")).longValue();
                Long userIdToAdd = ((Number) contentMap.get("userId")).longValue(); // 重命名变量，避免混淆
                operationId = (String) contentMap.get("operationId");

                log.info(
                        "group add member, operatorId: {}, groupId: {}, userId: {}, operationId: {}",
                        operatorId, groupId, userIdToAdd, operationId);

                // 权限验证, 只有群主才能添加成员
                if (!groupService.isGroupOwner(operatorId, groupId)) {
                    sendErrorResponse(operationId, "您没有权限添加成员到该群组。只有群主可以添加。");
                    return;
                }

                // ! change 通知加入的对象, 加入
                String operatorUsername = userService.findById(operatorId).getUsername();

                String usernameToAdd = userService.findById(userIdToAdd).getUsername();

                Map<String, Object> broadcastData = new HashMap<>();

                broadcastData.put("groupId", groupId);

                String groupName = groupService.getGroupInfoByGroupId(groupId).getGroupName();
                broadcastData.put("groupName", groupName);

                broadcastData.put("type","add");

                long creatorId = groupService.getGroupInfoByGroupId(groupId).getCreatorId();
                broadcastData.put("creatorId", creatorId);

                Map<Long, User> membersMap = groupService
                        .getAllUsersFromGroup(groupId);
                List<User> membersList = new ArrayList<>(membersMap.values()); // 将Map的值转换为List
                broadcastData.put("members",membersList);

                // 这里修改了方法, history是比较好的dto了
                List<MessageDTO> history = messageService.getAllMessagesFromGroup(groupId);

                broadcastData.put("history", history);

                // content中一共6个字段
                MessageDTO messageToBroadcast = MessageDTO.builder().type(MessageType.GROUP_BROADCAST).content(broadcastData).build();

                server.sendPrivateMessage(operatorUsername, usernameToAdd, objectMapper.writeValueAsString(messageToBroadcast));
                // 修改结束

                int affectedRows = groupService.addUserToGroup(userIdToAdd, groupId);

                if (affectedRows > 0) {
                    Map<String, Object> responseData = new HashMap<>();
                    responseData.put("operationId", operationId);
                    responseData.put("groupId", groupId);
                    responseData.put("userId", userIdToAdd);
                    responseData.put("message", "成员 " + userIdToAdd + " 已成功加入群组 " + groupId);
                    MessageDTO successResponse = MessageDTO.builder()
                            .type(MessageType.GROUP_RESPONSE).status("success")
                            .content(responseData).build();
                    sendMessage(objectMapper.writeValueAsString(successResponse));
                } else {
                    // Service 层现在会抛出异常，所以这里理论上不会执行到，除非 Service 返回 0 且不抛异常
                    // 但我们现在让 Service 抛异常了，所以这里可以简化处理
                    sendErrorResponse(operationId, "添加成员失败。");
                }
            } else {
                log.error("GROUP_ADD 消息的 content 格式不正确");
                sendErrorResponse(operationId, "请求参数错误: content 格式不正确");
            }
        } catch (RuntimeException e) { // 捕获 Service 层抛出的特定业务异常
            log.warn("处理 GROUP_ADD 消息业务错误: {}", e.getMessage());
            sendErrorResponse(operationId, e.getMessage()); // 直接将业务异常消息返回给客户端
        } catch (Exception e) {
            log.error("处理 GROUP_ADD 消息失败: {}", e.getMessage(), e);
            sendErrorResponse(operationId, "添加成员失败: " + e.getMessage());
        }
    }

    // --- handleGroupRemove 函数 ---
    private void handleGroupRemove(MessageDTO message) {
        String operationId = null;
        try {
            if (message.getContent() instanceof Map) {
                Map<String, Object> contentMap = (Map<String, Object>) message.getContent();
                Long operatorId = ((Number) contentMap.get("operatorId")).longValue();
                Long groupId = ((Number) contentMap.get("groupId")).longValue();
                Long userIdToRemove = ((Number) contentMap.get("userId")).longValue(); // 重命名变量
                operationId = (String) contentMap.get("operationId");

                log.info(
                        "group remove member, operatorId: {}, groupId: {}, userId: {}, operationId: {}",
                        operatorId, groupId, userIdToRemove, operationId);

                // --- 权限验证 (示例：只有群主才能移除成员) ---
                if (!groupService.isGroupOwner(operatorId, groupId)) {
                    sendErrorResponse(operationId, "您没有权限移除该成员。只有群主可以移除。");
                    return;
                }
                // 确保操作者不能移除自己（如果是群主，群主也不能自己把自己移除，除非群被删除）
                if (operatorId.equals(userIdToRemove)) {
                    sendErrorResponse(operationId, "您不能移除您自己。");
                    return;
                }

                // ! change 通知删除的对象, 退出群聊
                String operatorUsername = userService.findById(operatorId).getUsername();

                String usernameToRemove = userService.findById(userIdToRemove).getUsername();

                Map<String, Object> broadcastData = new HashMap<>();

                broadcastData.put("groupId", groupId);

                String groupName = groupService.getGroupInfoByGroupId(groupId).getGroupName();
                broadcastData.put("groupName", groupName);

                broadcastData.put("type","remove");
                MessageDTO messageToBroadcast = MessageDTO.builder().type(MessageType.GROUP_BROADCAST).content(broadcastData).build();

                server.sendPrivateMessage(operatorUsername, usernameToRemove, objectMapper.writeValueAsString(messageToBroadcast));
                // 修改结束

                int affectedRows = groupService.removeUserFromGroup(userIdToRemove, groupId);

                if (affectedRows > 0) {
                    Map<String, Object> responseData = new HashMap<>();
                    responseData.put("operationId", operationId);
                    responseData.put("groupId", groupId);
                    responseData.put("userId", userIdToRemove);
                    responseData.put("message",
                            "成员 " + userIdToRemove + " 已成功从群组 " + groupId + " 移除");
                    MessageDTO successResponse = MessageDTO.builder()
                            .type(MessageType.GROUP_RESPONSE).status("success")
                            .content(responseData).build();
                    sendMessage(objectMapper.writeValueAsString(successResponse));
                } else {
                    // Service 层现在会抛出异常，所以这里理论上不会执行到
                    sendErrorResponse(operationId, "移除成员失败。");
                }
            } else {
                log.error("GROUP_REMOVE 消息的 content 格式不正确");
                sendErrorResponse(operationId, "请求参数错误: content 格式不正确");
            }
        } catch (RuntimeException e) { // 捕获 Service 层抛出的特定业务异常
            log.warn("处理 GROUP_REMOVE 消息业务错误: {}", e.getMessage());
            sendErrorResponse(operationId, e.getMessage()); // 直接将业务异常消息返回给客户端
        } catch (Exception e) {
            log.error("处理 GROUP_REMOVE 消息失败: {}", e.getMessage(), e);
            sendErrorResponse(operationId, "移除成员失败: " + e.getMessage());
        }
    }

    private void handleLogout() {
        if (username != null) {
            cleanup(true);
            // 直接调用即可, 但是不断开socket连接
            // 修改, 断开连接
        }
    }

    // 现在只有在登陆状态才会发生心跳机制的交互
    private void handleHeartbeat() {
        if (username != null) {
            userService.updateUserStatus(username, 1);
        }
        // 其实根本没有实现这个逻辑嘛...
        MessageDTO response = MessageDTO.builder().type(MessageType.HEARTBEAT).timestamp(LocalDateTime.now().format(FORMATTER)).build();

        try {
            sendMessage(objectMapper.writeValueAsString(response));
        } catch (JsonProcessingException e) {
            log.error("Error send response message: {}", e.getMessage(), e);
        }
    }
    // 其实没有解耦, 给当前用户发送了所有在线用户, 并且广播了当前用户的上线消息
    private void sendOnlineUsers() {
        try {
            List<User> onlineUsers = chatLobbyService.getOnlineUsers();
            MessageDTO message = MessageDTO.builder().type(MessageType.ONLINE_USERS)
                    .content(onlineUsers).timestamp(LocalDateTime.now().format(FORMATTER)).build();
            String messageJson = objectMapper.writeValueAsString(message);
            log.info("send online users: " + messageJson);
            sendMessage(messageJson);
//            User cur_user = userService.findByUsername(username);
//            cur_user.setPassword(null);
//            // 需要广播当前的在线消息, 因为新的用户登录了, 但是一定不是广播所有登录信息
//            // 这里修改为直接广播user类而不是username
//            MessageDTO userLoginMessage = MessageDTO.builder().type(MessageType.USER_LOGIN)
//                    .content(cur_user).timestamp(LocalDateTime.now().format(FORMATTER)).build();
//            String userLoginMessageJson = objectMapper.writeValueAsString(userLoginMessage);
//            server.broadcastMessage(username, userLoginMessageJson);

        } catch (Exception e) {
            log.error("Error sending online users: {}", e.getMessage(), e);
        }
    }

    private void broadcastOnlineInfo(){
        User cur_user = userService.findByUsername(username);
        cur_user.setPassword(null);
        // 需要广播当前的在线消息, 因为新的用户登录了, 但是一定不是广播所有登录信息
        // 这里修改为直接广播user类而不是username
        MessageDTO userLoginMessage = MessageDTO.builder().type(MessageType.USER_LOGIN)
                .content(cur_user).timestamp(LocalDateTime.now().format(FORMATTER)).build();
        String userLoginMessageJson = null;
        try {
            userLoginMessageJson = objectMapper.writeValueAsString(userLoginMessage);
        } catch (JsonProcessingException e) {
            log.error("Error broadcast online info: {}", e.getMessage(), e);
        }
        server.broadcastMessage(username, userLoginMessageJson);
    }

    /*
     * {"type":"ONLINE_USERS","username":null,"password":null,"nickname":null,"receiver":null,
     * "content":[{"userId":1,"username":"1","password":null,"nickname":"user1","avatarUrl":
     * "https://secure.gravatar.com/avatar/default?s=200&d=mp","status":1,"online":true,
     * "lastHeartbeat":[2025,4,16,15,25,30,436000000],"createdAt":[2025,4,14,16,32,51,404000000],
     * "lastLoginAt":[2025,4,16,15,18,34,718000000]}],"token":null,"status":null,"timestamp":
     * "2025-04-16T15:27:05.2921061","errorMessage":null,"messageId":null}
     */

    // 还是在服务端维护离线用户比较可靠, 每个客户端都维护一遍是很荒谬的
    private void sendOfflineUsers() {
        try {
            List<User> offlineUsers = chatLobbyService.getOfflineUsers();
            MessageDTO message = MessageDTO.builder().type(MessageType.OFFLINE_USERS)
                    .content(offlineUsers).timestamp(LocalDateTime.now().format(FORMATTER)).build();
            String messageJson = objectMapper.writeValueAsString(message);

            log.info("send offline users: " + messageJson);
            sendMessage(messageJson);
        } catch (Exception e) {
            log.error("Error sending online users: {}", e.getMessage(), e);
        }
    }

    private void sendHistoryChatLobbyMessages() { // 这里的messages也应该是List<MessageDTO>
        try {
            List<MessageDTO> messages = messageService.getChatLobbyMessages();
            MessageDTO message = MessageDTO.builder().type(MessageType.HISTORY_MESSAGES)
                    .content(messages).timestamp(LocalDateTime.now().format(FORMATTER)).build();

            sendMessage(objectMapper.writeValueAsString(message));
        } catch (Exception e) {
            log.error("Error sending history chat lobby messages: {}", e.getMessage(), e);
        }
    }

    private void sendHistoryPrivateMessages() { // 这里的messages也应该是List<MessageDTO>
        try {
            List<MessageDTO> messages = messageService.getPrivateMessages(userId); // 暂时注释了limit
            // 历史记录由于是直接查询的dto, 一定包含发送者和接收者的username
            MessageDTO message = MessageDTO.builder().type(MessageType.HISTORY_MESSAGES)
                    .content(messages).timestamp(LocalDateTime.now().format(FORMATTER)).build();

            sendMessage(objectMapper.writeValueAsString(message));
            // 使用当前的handler发送,也就是发送给当前socket连接对象
        } catch (Exception e) {
            log.error("Error sending history private messages: {}", e.getMessage(), e);
        }
    }

    private void sendHistoryGroupMessages() { // 这里的messages也应该是List<MessageDTO>
        try {
            // 获得所在的所有群组中的所有消息
            List<MessageDTO> messages = messageService.getGroupsMessages(userId);

            MessageDTO message = MessageDTO.builder().type(MessageType.HISTORY_MESSAGES)
                    .content(messages).timestamp(LocalDateTime.now().format(FORMATTER)).build();

            sendMessage(objectMapper.writeValueAsString(message));
        } catch (Exception e) {
            log.error("Error sending history private messages: {}", e.getMessage(), e);
        }
    }

    public void sendGroupInfo() { // 接收当前用户ID
        Long currentUserId = userId;
        try {
            // 1. 查询当前用户所在的所有群组的基本信息
            List<GroupInfo> groupInfos = groupService.getRelatedGroupsByUserId(currentUserId);
            log.debug("Found {} groups for userId {}.", groupInfos.size(), currentUserId);

            // 2. 构建 GroupDetailDTO 列表
            List<GroupDetailDTO> groupDetails = new ArrayList<>();
            for (GroupInfo groupInfo : groupInfos) {
                // 3. 为每个群组查询其所有成员信息
                // 注意：groupService.getAllUsersFromGroup 应该返回 Map<Long, User>
                // 或者直接 List<User> 更方便转换
                Map<Long, User> membersMap = groupService
                        .getAllUsersFromGroup(groupInfo.getGroupId());
                List<User> membersList = new ArrayList<>(membersMap.values()); // 将Map的值转换为List

                // 4. 构建 GroupDetailDTO 对象
                GroupDetailDTO groupDetail = GroupDetailDTO.builder()
                        .groupId(groupInfo.getGroupId()).groupName(groupInfo.getGroupName())
                        .creatorId(groupInfo.getCreatorId()).createdAt(groupInfo.getCreatedAt()) // 确保类型匹配
                        .members(membersList) // 设置成员列表
                        .build();

                groupDetails.add(groupDetail);
            }

            // 5. 构建最终的 MessageDTO 返回体
            MessageDTO messageDTO = MessageDTO.builder().type(MessageType.GROUP_INFO) // 设置为新的类型
                    .userId(currentUserId) // 发送方用户ID
                    .content(groupDetails) // 将 GroupDetailDTO 列表作为内容
                    .timestamp(LocalDateTime.now().format(FORMATTER)) // 当前时间戳
                    .build();
            String messageToSend = objectMapper.writeValueAsString(messageDTO);
            sendMessage(messageToSend);

            log.info("group info: " + messageToSend);

            return;

        } catch (Exception e) {
            log.error("sendGroupInfo: An error occurred for userId {}. Error: {}", currentUserId,
                    e.getMessage(), e);
            // 发生异常时返回一个错误消息 DTO
            MessageDTO errorMessage = MessageDTO.builder().type(MessageType.ERROR) // 假设你有 ERROR 类型
                    .userId(currentUserId).status("ERROR")
                    .errorMessage("Failed to retrieve group information: " + e.getMessage())
                    .timestamp(LocalDateTime.now().toString()).build();
            log.error(errorMessage.toString());
        }
    }

    private void sendErrorMessage(String errorMessage) {
        try {
            MessageDTO message = MessageDTO.builder().type(MessageType.ERROR)
                    .errorMessage(errorMessage).status("error")
                    .timestamp(LocalDateTime.now().format(FORMATTER)).build();

            sendMessage(objectMapper.writeValueAsString(message));
        } catch (Exception e) {
            log.error("Error sending error message: {}", e.getMessage(), e);
        }
    }

    // 目前仅仅用于群组类的错误消息传递
    private void sendErrorResponse(String operationId, String rawMessage) {
        try {
            Map<String, Object> content = new HashMap<>();
            content.put("operationId", operationId);
            content.put("message", rawMessage);

            MessageDTO message = MessageDTO.builder().type(MessageType.GROUP_RESPONSE)
                    .status("error").content(content).build();

            String response = objectMapper.writeValueAsString(message);
            sendMessage(response);
            log.debug("Sent error response to client {}: {}", clientSocket.getInetAddress(),
                    response);
        } catch (Exception ex) {
            log.error("Error sending error response: {}", ex.getMessage());
        }
    }

    public void sendMessage(String message) {
        writer.println(message);
        log.debug("Sent message to client {}: {}", clientSocket.getInetAddress(), message);
    }

    private void cleanup(boolean closeSocket) { // socket断开连接的方法, 但是还是不太够哦
        running = false;
        if (username != null) {
            try {
                log.info("Cleaning up for user: {}", username);


                User cur_user = userService.findByUsername(username);
                cur_user.setPassword(null);

                MessageDTO userLogoutMessage = MessageDTO.builder().type(MessageType.USER_LOGOUT)
                        .content(cur_user).timestamp(LocalDateTime.now().format(FORMATTER)).build();
                String userLogoutMessageJson = objectMapper.writeValueAsString(userLogoutMessage);

                // 广播当前用户的离线信息
                server.broadcastMessage(username, userLogoutMessageJson);

                userService.updateUserStatus(username, 0);

                chatLobbyService.removeUser(username);

                // 问题在于socket连接管理和在线状态管理不可以等同
                if(closeSocket)server.removeClient(username);

            } catch (Exception e) {
                log.error("Error during cleanup for {}: {}", username, e.getMessage(), e);
            }
        }
        try {
            reader.close();
            writer.close();
            clientSocket.close();
            log.info("Client socket closed: {}:{}", clientSocket.getInetAddress(),
                    clientSocket.getPort());
        } catch (IOException e) {
            log.error("Error closing client resources: {}", e.getMessage(), e);
        }
    }
}