// src/main/java/com/yourpackage/yourapp/exception/GlobalExceptionHandler.java (根据你的包结构调整)

package com.example.chatterserver.exception; // 替换为你的实际包名

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.util.HashMap;
import java.util.Map;

@ControllerAdvice // 声明这是一个全局异常处理类
public class GlobalExceptionHandler {

    /**
     * 处理文件上传大小超过限制的异常
     * 
     * @param ex MaxUploadSizeExceededException 异常实例
     * @return 包含错误信息和状态码的 ResponseEntity
     */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleMaxUploadSizeExceeded(
            MaxUploadSizeExceededException ex) {
        // 你可以从异常中获取允许的最大文件大小
        long maxUploadSize = ex.getMaxUploadSize();

        Map<String, Object> errorDetails = new HashMap<>();
        errorDetails.put("code", 413); // HTTP 413 Request Entity Too Large 对应的自定义错误码
        errorDetails.put("status", "PAYLOAD_TOO_LARGE");
        errorDetails.put("message", "上传文件过大，文件大小不能超过 " + formatBytes(maxUploadSize));
        // 如果需要，可以添加更多详细信息
        errorDetails.put("details", ex.getMessage());

        // 返回 HTTP 413 Request Entity Too Large 状态码
        return new ResponseEntity<>(errorDetails, HttpStatus.PAYLOAD_TOO_LARGE); // 或
                                                                                 // HttpStatus.BAD_REQUEST,
                                                                                 // 看你如何定义错误
    }

    // 辅助方法，用于格式化字节大小，使其更易读
    private String formatBytes(long bytes) {
        if (bytes < 1024) {
            return bytes + " B";
        }
        int exp = (int) (Math.log(bytes) / Math.log(1024));
        String pre = ("KMGTPE").charAt(exp - 1) + "";
        return String.format("%.1f %sB", bytes / Math.pow(1024, exp), pre);
    }

}