package com.example.chatterserver.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime; // 如果 upload_time 使用 LocalDateTime

@Data @Builder @NoArgsConstructor @AllArgsConstructor // Lombok 注解，自动生成 Getter/Setter 等
public class FileAttachment {
    private Long          fileId;         // 对应 file_id INTEGER PRIMARY KEY AUTOINCREMENT
    private Long          messageId;      // 对应 message_id INTEGER NOT NULL
    private String        fileName;       // 对应 file_name VARCHAR(255) NOT NULL
    private String        storedFileName; // 对应 stored_file_name VARCHAR(255) NOT NULL
    private String        fileUrl;        // 对应 file_url VARCHAR(255) NOT NULL
    private Long          fileSize;       // 对应 file_size BIGINT NOT NULL
    private String        fileType;       // 对应 file_type VARCHAR(50)
    private String        md5;            // 对应 md5 VARCHAR(32)
    private LocalDateTime uploadTime;     // 对应 upload_time TIMESTAMP
}