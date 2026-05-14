package com.example.chatterserver.socket;

import com.example.chatterserver.service.ChatLobbyService;
import com.example.chatterserver.service.MessageService;
import com.example.chatterserver.service.UserService;
import com.example.chatterserver.service.GroupService;
import com.example.chatterserver.util.JwtUtil;
import java.io.IOException;
import java.net.Socket;
import org.springframework.stereotype.Component;

/**
 * ClientHandler 工厂类，用于动态创建 ClientHandler 实例
 */
@Component
public class ClientHandlerFactory {
    private final UserService      userService;
    private final MessageService   messageService;
    private final GroupService     groupService;
    private final ChatLobbyService chatLobbyService;
    private final JwtUtil          jwtUtil;

    public ClientHandlerFactory(UserService userService, MessageService messageService,
            GroupService groupService, ChatLobbyService chatLobbyService, JwtUtil jwtUtil) {
        this.userService = userService;
        this.messageService = messageService;
        this.groupService = groupService;
        this.chatLobbyService = chatLobbyService;
        this.jwtUtil = jwtUtil;
    }

    public ClientHandler createClientHandler(Socket socket, ChatSocketServer server)
            throws IOException {
        return new ClientHandler(socket, server, userService, messageService, groupService,
                chatLobbyService, jwtUtil);
    }
}