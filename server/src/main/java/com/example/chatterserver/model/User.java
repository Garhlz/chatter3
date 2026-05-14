package com.example.chatterserver.model;

import lombok.Data;
import lombok.Builder;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.time.LocalDateTime;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.AssertTrue;

@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class User {
    private Long               userId;

    @NotBlank(message = "用户名不能为空") @Size(min = 3, max = 50, message = "用户名长度必须在3-50之间")
    private String             username;

    @NotBlank(message = "密码不能为空") @Size(min = 6, message = "密码长度不能小于6位")
    private String             password;

    @Size(max = 50, message = "昵称长度不能超过50")
    private String             nickname;

    @Builder.Default
    private String             avatarUrl          = DEFAULT_AVATAR_URL;

    @Builder.Default
    private Integer            status             = 0;

    private Boolean            online             = false;

    private LocalDateTime      lastHeartbeat;
    private LocalDateTime      createdAt;
    private LocalDateTime      lastLoginAt;

    public static final String DEFAULT_AVATAR_URL = "https://secure.gravatar.com/avatar/default?s=200&d=mp";

    @AssertTrue(message = "无效的用户状态")
    private boolean isValidStatus() {
        return status != null && status >= 0 && status <= 2;
    }

    public Boolean isOnline() {
        return online;
    }
}