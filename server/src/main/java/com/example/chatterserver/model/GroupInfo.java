package com.example.chatterserver.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime; // 如果 upload_time 使用 LocalDateTime

@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class GroupInfo {
    private Long          groupId;
    private String        groupName;
    private Long          creatorId;
    private LocalDateTime createdAt;
}
