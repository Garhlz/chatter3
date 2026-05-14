package com.example.chatterserver.config;

import com.example.chatterserver.socket.ChatSocketServer;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

@Slf4j @Configuration
public class ServerConfig {
  private final ChatSocketServer chatSocketServer;
  private final int              tcpPort;

  public ServerConfig(ChatSocketServer chatSocketServer,
      @Value("${chat.server.port:9999}") int tcpPort) {
    this.chatSocketServer = chatSocketServer;
    this.tcpPort = tcpPort;
  }

  @PostConstruct
  public void init() {
    try {
      new Thread(() -> {
        try {
          chatSocketServer.start(tcpPort);
        } catch (Exception e) {
          log.error("Failed to start TCP server on port {}: {}", tcpPort, e.getMessage(), e);
        }
      }).start();
      log.info("Initiated TCP server startup on port: {}", tcpPort);
    } catch (Exception e) {
      log.error("Error initiating TCP server: {}", e.getMessage(), e);
    }
  }
}