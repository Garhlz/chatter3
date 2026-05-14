package com.example.chatterserver.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ErrorResponse {
    private String errorCode;
    private String message;
    private String timestamp;
}