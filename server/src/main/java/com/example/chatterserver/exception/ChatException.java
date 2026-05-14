package com.example.chatterserver.exception;

import lombok.Getter;

@Getter
public class ChatException extends RuntimeException {
    private final String errorCode;
    private final int statusCode;

    public ChatException(String message, String errorCode, int statusCode) {
        super(message);
        this.errorCode = errorCode;
        this.statusCode = statusCode;
    }

    public ChatException(String message, String errorCode) {
        this(message, errorCode, 500);
    }

    // 预定义错误码
    public static final String AUTH_ERROR = "AUTH_001";
    public static final String USER_NOT_FOUND = "USER_001";
    public static final String MESSAGE_ERROR = "MSG_001";
    public static final String NETWORK_ERROR = "NET_001";
    public static final String SYSTEM_ERROR = "SYS_001";
}