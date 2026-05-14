package com.example.chatterserver.dto;

import com.example.chatterserver.model.User; // 假设你的User模型在这里
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime; // 或 java.util.Date
import java.util.List;

@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class GroupDetailDTO {
    private Long          groupId;
    private String        groupName;
    private Long          creatorId;
    private LocalDateTime createdAt; // 与数据库字段类型保持一致，或String

    private List<User>    members;   // 包含该群组所有成员的User对象列表
}
