package com.example.chatterserver.dto;

import com.example.chatterserver.model.MessageType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class MessageDTO {
    private MessageType type;
    private Long        userId;
    private String      username;
    private String      password;
    private String      nickname;
    private String      receiver;
    private Long        groupId;     // 新增
    private Object      content;
    private String      token;
    private String      status;
    private String      timestamp;
    private String      errorMessage;
    private Long        messageId;
}