package com.example.chatterserver.interceptor;

import com.example.chatterserver.dto.MessageDTO;
import com.example.chatterserver.model.MessageType;
import com.example.chatterserver.util.JwtUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class JwtAuthInterceptor {
    private final JwtUtil      jwtUtil;
    private final ObjectMapper objectMapper;

    public JwtAuthInterceptor(JwtUtil jwtUtil, ObjectMapper objectMapper) {
        this.jwtUtil = jwtUtil;
        this.objectMapper = objectMapper;
    }

    public boolean validateToken(String message) {
        try {
            MessageDTO messageDTO = objectMapper.readValue(message, MessageDTO.class);

            // 登录和注册请求不需要验证token
            if (MessageType.LOGIN.equals(messageDTO.getType())
                    || MessageType.REGISTER.equals(messageDTO.getType())) {
                return true;
            }

            String token = messageDTO.getToken();
            if (token == null || token.isEmpty()) {
                return false;
            }

            return jwtUtil.validateToken(token);
        } catch (Exception e) {
            log.error("Token validation error: ", e);
            return false;
        }
    }
}