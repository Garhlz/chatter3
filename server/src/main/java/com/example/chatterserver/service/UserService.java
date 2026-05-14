package com.example.chatterserver.service;

import com.example.chatterserver.exception.UserAlreadyExistsException;
import com.example.chatterserver.mapper.UserMapper;
import com.example.chatterserver.model.User;
import java.time.LocalDateTime;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @Slf4j @Transactional(rollbackFor = Exception.class)
public class UserService {
    private static final int      HEARTBEAT_TIMEOUT_MINUTES = 5;

    private final UserMapper      userMapper;
    private final PasswordEncoder passwordEncoder;

    @Autowired
    public UserService(UserMapper userMapper, PasswordEncoder passwordEncoder) {
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
    }

    public boolean authenticate(String username, String password) {
        if (StringUtils.isBlank(username) || StringUtils.isBlank(password)) {
            throw new IllegalArgumentException("用户名或密码不能为空");
        }

        User user = userMapper.findByUsername(username);
        if (user == null) {
            log.warn("Authentication failed: user {} not found", username);
            return false;
        }

        boolean matches = passwordEncoder.matches(password, user.getPassword());
        if (!matches) {
            log.warn("Authentication failed: invalid password for user {}", username);
        }
        return matches;
    }

    public User register(String username, String password, String nickname) {
        // 参数验证
        if (StringUtils.isBlank(username) || StringUtils.isBlank(password)) {
            throw new IllegalArgumentException("用户名或密码不能为空");
        }

        // 检查用户名是否已存在
        if (userMapper.countByUsername(username) > 0) {
            throw new UserAlreadyExistsException("用户名已存在: " + username);
        }

        LocalDateTime now = LocalDateTime.now();
        User user = User.builder().username(username).password(passwordEncoder.encode(password))
                .nickname(StringUtils.defaultIfBlank(nickname, username)).status(0)
                .lastHeartbeat(now).createdAt(now).build();

        try {
            userMapper.insert(user);
            log.info("User registered successfully: {}", username);
            return user;
        } catch (Exception e) {
            log.error("Failed to register user: {}", username, e);
            throw new RuntimeException("注册失败，请稍后重试", e);
        }
    }

    public User findById(Long userId) {
        return userMapper.findById(userId);
    }

    public User findByUsername(String username) {
        return userMapper.findByUsername(username);
    }

    public void updateLastLogin(String username) {
        userMapper.updateLastLogin(username, LocalDateTime.now());
    }

    @Scheduled(fixedRate = 60000) // 每分钟执行一次
    public void updateInactiveUsers() {
        LocalDateTime threshold = LocalDateTime.now().minusMinutes(HEARTBEAT_TIMEOUT_MINUTES);
        int count = userMapper.updateOfflineUsers(threshold);
        if (count > 0) {
            log.info("Updated {} inactive users to offline status", count);
        }
    }

    public void updateUserStatus(String username, Integer status) {
        if (username == null || status == null || status < 0 || status > 2) {
            throw new IllegalArgumentException("无效的用户状态");
        }

        LocalDateTime now = LocalDateTime.now();
        int updated = userMapper.updateStatus(username, status, now);
        if (updated == 0) {
            log.warn("Failed to update status for user: {}", username);
        }
    }

    public List<User> getOnlineUsers() {
        LocalDateTime activeThreshold = LocalDateTime.now().minusMinutes(HEARTBEAT_TIMEOUT_MINUTES);
        return userMapper.findOnlineUsers(activeThreshold);
    }

    public List<User> getAllUsers() {
        List<User> users = userMapper.findAllUsers();
        // 在 Java 代码中将 password 设置为 null, 简单粗暴
        for (User user : users) {
            user.setPassword(null);
        }
        return users;
    }
}