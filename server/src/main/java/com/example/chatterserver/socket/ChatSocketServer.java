package com.example.chatterserver.socket;

import com.example.chatterserver.interceptor.JwtAuthInterceptor;
import com.example.chatterserver.service.ChatLobbyService;
import com.example.chatterserver.service.MessageService;
import com.example.chatterserver.service.UserService;
import com.example.chatterserver.util.JwtUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;

@Slf4j @Component
public class ChatSocketServer {
    private ServerSocket                     serverSocket;
    private final ExecutorService            executorService;
    private final Map<String, ClientHandler> clientHandlers;
    private final ObjectMapper               objectMapper;
    private boolean                          running;

    private final UserService                userService;
    private final MessageService             messageService;
    private final JwtUtil                    jwtUtil;
    private final ChatLobbyService           chatLobbyService;
    private final ApplicationContext         applicationContext;
    private final ClientHandlerFactory       clientHandlerFactory;
    private final JwtAuthInterceptor         jwtAuthInterceptor;
    public ChatSocketServer(UserService userService, MessageService messageService, JwtUtil jwtUtil,
            ChatLobbyService chatLobbyService, ObjectMapper objectMapper,
            ApplicationContext applicationContext, ClientHandlerFactory clientHandlerFactory) {
        this.executorService = Executors.newCachedThreadPool();
        this.clientHandlers = new ConcurrentHashMap<>();
        this.objectMapper = objectMapper;
        this.userService = userService;
        this.messageService = messageService;
        this.jwtUtil = jwtUtil;
        this.chatLobbyService = chatLobbyService;
        this.applicationContext = applicationContext;
        this.clientHandlerFactory = clientHandlerFactory;
        this.jwtAuthInterceptor = new JwtAuthInterceptor(jwtUtil, objectMapper);
    }

    public JwtAuthInterceptor getJwtAuthInterceptor() {
        return jwtAuthInterceptor;
    }

    public ObjectMapper getObjectMapper() {
        return objectMapper;
    }

    public void start(int port) {
        try {
            serverSocket = new ServerSocket(port);
            running = true;
            log.info("Chat server started on port: {}", port);

            while (running) {
                Socket clientSocket = serverSocket.accept();
                log.info("New client connected: {}:{}", clientSocket.getInetAddress(),
                        clientSocket.getPort());
                if (clientSocket == null || clientSocket.isClosed()) {
                    log.warn("Invalid client socket, skipping");
                    continue;
                }
                try {
                    ClientHandler clientHandler = clientHandlerFactory
                            .createClientHandler(clientSocket, this);
                    log.info("Created ClientHandler for client: {}:{}",
                            clientSocket.getInetAddress(), clientSocket.getPort());
                    executorService.execute(clientHandler);
                } catch (IOException e) {
                    log.error("Failed to create ClientHandler for client {}:{}: {}",
                            clientSocket.getInetAddress(), clientSocket.getPort(), e.getMessage(),
                            e);
                    try {
                        clientSocket.close();
                    } catch (IOException ex) {
                        log.error("Error closing invalid client socket: {}", ex.getMessage());
                    }
                }
            }
        } catch (IOException e) {
            log.error("Error starting server on port {}: {}", port, e.getMessage(), e);
        } catch (Exception e) {
            log.error("Unexpected error in server: {}", e.getMessage(), e);
        }
    }

    public void stop() {
        running = false;
        try {
            if (serverSocket != null && !serverSocket.isClosed()) {
                serverSocket.close();
            }
            executorService.shutdown();
            log.info("Chat server stopped");
        } catch (IOException e) {
            log.error("Error stopping server: {}", e.getMessage(), e);
        }
    }

    public void registerClient(String username, ClientHandler handler) {
        clientHandlers.put(username, handler);
        log.info("Client registered: {}", username);
    }

    public void removeClient(String username) {
        clientHandlers.remove(username);
        log.info("Client removed: {}", username);
    }

    public void broadcastMessage(String sender, String message) {
        clientHandlers.forEach((username, handler) -> {
            if (!username.equals(sender) && chatLobbyService.isOnline(username)) { // 只给当前依然在线的用户发送
                try {
                    handler.sendMessage(message);
                } catch (Exception e) {
                    log.error("Failed to send message to {}: {}", username, e.getMessage());
                    removeClient(username);
                }
            }
        });
    }

    public void sendPrivateMessage(String sender, String receiver, String message) {
        // 只能发送给在线用户
        ClientHandler handler = clientHandlers.get(receiver);
        // message 是已经包装好的消息
        if (handler != null) {
            try {
                handler.sendMessage(message);
            } catch (Exception e) {
                log.error("Failed to send private message to {}: {}", receiver, e.getMessage());
            }
        }
    }

    public boolean isRunning() {
        return running;
    }
}