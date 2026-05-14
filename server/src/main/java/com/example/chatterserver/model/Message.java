package com.example.chatterserver.model;

import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class Message { // 这里定义的都是id, 存储的也都是id, 而不是username之类的
    private Long          messageId;
    private Long          senderId;
    private Long          receiverId;
    private Long          groupId;
    private Integer       messageType;
    private String        content;
    private Integer       status;
    private LocalDateTime createdAt;
}