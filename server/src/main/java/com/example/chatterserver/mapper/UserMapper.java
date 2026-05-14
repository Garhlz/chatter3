package com.example.chatterserver.mapper;

import com.example.chatterserver.model.User;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface UserMapper {

    User findByUsername(String username);

    User findById(Long userId); // 实际上有这个方法

    List<User> findOnlineUsers(@Param("activeThreshold") LocalDateTime activeThreshold);

    List<User> findAllUsers(); // 简单粗暴

    int insert(User user);

    int updateLastLogin(@Param("username") String username,
            @Param("lastLogin") LocalDateTime lastLogin);

    int updateStatus(@Param("username") String username, @Param("status") Integer status,
            @Param("lastHeartbeat") LocalDateTime lastHeartbeat);

    int updateOfflineUsers(@Param("threshold") LocalDateTime threshold);

    int countByUsername(String username);
}
