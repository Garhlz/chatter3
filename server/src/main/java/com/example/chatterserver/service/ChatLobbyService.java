package com.example.chatterserver.service;

import com.example.chatterserver.model.User;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

@Service @Slf4j
public class ChatLobbyService {
    private final ConcurrentHashMap<String, User> allUsers = new ConcurrentHashMap<>();

    @Autowired
    public ChatLobbyService(@Value("${chat.lobby.history-size:100}") int maxHistorySize,
            UserService userService) {
        List<User> allUsersList = userService.getAllUsers();
        for (User user : allUsersList) {
            user.setOnline(false); // 初始状态设置为离线
            this.allUsers.put(user.getUsername(), user);
        }
        // 只用一个concurrenthashmap管理所有的用户状态
    }

    public void addUser(User user) {
        allUsers.compute(user.getUsername(), (username, existingUser) -> {
            User targetUser = existingUser != null ? existingUser : user;
            targetUser.setOnline(true);
            return targetUser;
        });
        log.info("User joined lobby: {}", user.getUsername());
    }

    public void removeUser(String username) {
        User user = allUsers.get(username);
        if (user != null) {
            user.setOnline(false);
            log.info("User left lobby: {}", username);
        }
    }

    public User getUserByUsername(String username) {
        if (allUsers.containsKey(username)) {
            return allUsers.get(username);
        } else
            return null;
    }

    public List<User> getOnlineUsers() {
        return allUsers.values().stream().filter(User::isOnline).map(this::sanitizeUserSnapshot)
                .toList();
    }

    public List<User> getOfflineUsers() {
        return allUsers.values().stream().filter(user -> !Boolean.TRUE.equals(user.isOnline()))
                .map(this::sanitizeUserSnapshot).toList();
    }

    public int getOnlineCount() {
        return (int) allUsers.values().stream().filter(User::isOnline).count();
    }

    public boolean isOnline(User user) {
        return user != null && isOnline(user.getUsername());
    }

    public boolean isOnline(String username) {
        User user = allUsers.get(username);
        return user != null && Boolean.TRUE.equals(user.isOnline());
    }

    private User sanitizeUserSnapshot(User user) {
        return User.builder()
                .userId(user.getUserId())
                .username(user.getUsername())
                .password(null)
                .nickname(user.getNickname())
                .avatarUrl(user.getAvatarUrl())
                .status(user.getStatus())
                .online(Boolean.TRUE.equals(user.isOnline()))
                .lastHeartbeat(user.getLastHeartbeat())
                .createdAt(user.getCreatedAt())
                .lastLoginAt(user.getLastLoginAt())
                .build();
    }
}
