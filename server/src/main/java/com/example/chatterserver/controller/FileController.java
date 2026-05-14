package com.example.chatterserver.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cglib.core.Local;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import com.example.chatterserver.dto.MessageDTO;
import com.example.chatterserver.model.FileAttachment;
import com.example.chatterserver.model.Message;
import com.example.chatterserver.model.MessageType;
import com.example.chatterserver.model.User;
import com.example.chatterserver.service.MessageService;
import com.example.chatterserver.service.UserService;
import com.example.chatterserver.util.JwtUtil;
import com.example.chatterserver.socket.ChatSocketServer;

import jakarta.annotation.PostConstruct;

import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.io.InputStream;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.UUID; // 用于生成唯一文件名
import com.example.chatterserver.util.MD5Util;
import com.fasterxml.jackson.databind.ObjectMapper;

@RestController @RequestMapping("/api/files") @Slf4j
public class FileController {
    @Value("${file.upload-dir}")
    private String                         uploadDir;

    private Path                           fileStoragePath;

    private final MessageService           messageService;
    private final UserService              userService;
    private final ChatSocketServer         chatSocketServer;
    // 这个也是一个server, 但是位置不一样罢了
    private final JwtUtil                  jwtUtil;
    private final ObjectMapper             objectMapper;
    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    @Autowired
    public FileController(MessageService messageService, UserService userService,
            ChatSocketServer chatSocketServer, JwtUtil jwtUtil) {
        this.messageService = messageService;
        this.userService = userService;
        this.chatSocketServer = chatSocketServer;
        this.jwtUtil = jwtUtil;
        // this.fileStoragePath = Paths.get(uploadDir);
        // 这里的初始化位置有问题
        this.objectMapper = chatSocketServer.getObjectMapper();
    }

    @PostConstruct
    public void init() {
        // 从文件目录配置中获取上传目录，并创建目录
        this.fileStoragePath = Paths.get(uploadDir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.fileStoragePath);
            log.info("File upload directory created at: {}", this.fileStoragePath);
        } catch (Exception ex) {
            // 如果目录无法创建，抛出运行时异常，阻止应用启动
            throw new RuntimeException(
                    "Could not create the directory where the uploaded files will be stored.", ex);
        }
    }

    @PostMapping("/upload")
    public ResponseEntity<MessageDTO> uploadFile(
            @RequestHeader("Authorization") String authorizationHeader,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "receiverUsername", required = false) String receiverUsername // 私聊接收者username
    // 目前仅支持私聊收发文件
    ) {
        // 1. jwt验证
        String token = authorizationHeader.replace("Bearer ", "");
        if (!jwtUtil.validateToken(token)) {
            log.warn("Unauthorized file upload attempt: Invalid token.");
            String errorMessage = "Unauthorized: Invalid token.";
            return ResponseEntity.status(401)
                    .body(MessageDTO.builder().errorMessage(errorMessage).build());
        }
        // 从token中获取用户ID
        Long senderId = jwtUtil.getUserIdFromToken(token);
        log.info("file sender's ID: {}", senderId);
        // 从这里发现receiver's username == null, 客户端发送的消息有问题
        log.info("receiver's username: {}", receiverUsername);
        // 获取发送者信息
        User sender = userService.findById(senderId);
        if (sender == null) {
            log.warn("Unauthorized file upload attempt: User ID {} not found.", senderId);
            String errorMessage = "User not found.";
            return ResponseEntity.status(404)
                    .body(MessageDTO.builder().errorMessage(errorMessage).build());
        }
        // 已经有SenderId了，这里可以获取发送者的用户名和昵称
        String senderUsername = sender.getUsername();
        String senderNickname = sender.getNickname();

        // 2. 文件校验和文件名处理
        if (file.isEmpty()) {
            String errorMessage = "File is empty.";
            return ResponseEntity.badRequest()
                    .body(MessageDTO.builder().errorMessage(errorMessage).build());
        }
        if (file.getSize() > 50 * 1024 * 1024) { // 示例：限制最大文件大小为 50MB
            log.warn("File upload failed: File size exceeds limit for user {}", senderId);
            String errorMessage = "File size exceeds limit (Max 50MB).";
            return ResponseEntity.status(413)
                    .body(MessageDTO.builder().errorMessage(errorMessage).build());
        }

        String originalFileName = file.getOriginalFilename();
        if (originalFileName == null || originalFileName.trim().isEmpty()) {
            originalFileName = "untitled_file"; // 提供默认名
        }
        // 清理原始文件名，防止路径遍历攻击
        originalFileName = Paths.get(originalFileName).getFileName().toString();

        String fileExtension = "";
        int dotIndex = originalFileName.lastIndexOf('.');
        if (dotIndex > 0 && dotIndex < originalFileName.length() - 1) {
            fileExtension = originalFileName.substring(dotIndex);
        }
        // 使用 UUID 作为存储文件名，确保唯一性
        String storedFileName = UUID.randomUUID().toString() + fileExtension;
        Path targetLocation = this.fileStoragePath.resolve(storedFileName);

        String fileMimeType = file.getContentType();
        if (fileMimeType == null || fileMimeType.isEmpty()) {
            try {
                // 尝试根据文件名猜测MIME类型
                fileMimeType = Files.probeContentType(targetLocation);
            } catch (IOException e) {
                log.warn("Could not determine MIME type for {}: {}", storedFileName,
                        e.getMessage());
            }
            if (fileMimeType == null) {
                fileMimeType = "application/octet-stream"; // 默认二进制流
            }
        }

        // 3. 存储文件到服务器文件系统, 可以替换成云存储
        try (InputStream inputStream = file.getInputStream()) {
            Files.copy(inputStream, targetLocation, StandardCopyOption.REPLACE_EXISTING);
            log.info("File '{}' ({} bytes) uploaded by user {} and stored as '{}'.",
                    originalFileName, file.getSize(), senderId, storedFileName);

            // 4. 构建文件的下载URL (提供给客户端的消息中)
            // 注意：fromCurrentContextPath() 会自动获取当前服务器的协议、域名和端口
            String fileDownloadUri = ServletUriComponentsBuilder.fromCurrentContextPath()
                    .path("/api/files/download/") // 下载接口的路径
                    .path(storedFileName) // 存储的唯一文件名作为路径变量
                    .toUriString();

            Long receiverId = userService.findByUsername(receiverUsername).getUserId();
            log.info("receiver's ID: {}", receiverId);
            // 5. 保存文件消息元数据到数据库 (通过 MessageService)
            // MessageDTO 用于传输给消息发送的对象
            // 只支持私聊
            Message savedMessage = messageService.saveMessage(senderId, receiverId, null, 1,
                    originalFileName);

            Long messageId = savedMessage.getMessageId();

            String fileMD5 = MD5Util.getFileMd5(targetLocation.toFile());

            FileAttachment fileAttachment = messageService.saveFileInfo(messageId, originalFileName,
                    storedFileName, fileDownloadUri, file.getSize(), fileMD5, fileMimeType);

            // 保存文件具体信息,然后构建返回的对象, 发送给需要发送的对象
            // 直接把fileAttachment放入到content中
            MessageDTO fileMessage = MessageDTO.builder().type(MessageType.FILE).userId(senderId)
                    .username(senderUsername).nickname(senderNickname).content(fileAttachment) // 包含文件信息的对象
                    .timestamp(LocalDateTime.now().format(FORMATTER)).messageId(messageId).build();
            // 还没有指定群聊和私聊

            if (receiverUsername != null && !receiverUsername.isEmpty()) {
                // 私聊
                fileMessage.setReceiver(receiverUsername);
                // 发送私聊消息
                sendPrivateFileMessage(senderUsername, receiverUsername, fileMessage);
                log.info("send to file message to receiver with TCP: {}", fileMessage);
                // 只支持私聊
            } else {
                log.warn("No receiver specified for file upload by user {}", senderId);
            }
            // 6. 返回上传成功信息给客户端 (Http 响应)

            return ResponseEntity.ok(fileMessage);

        } catch (IOException ex) {
            log.error("Could not store file '{}'. Error: {}", originalFileName, ex.getMessage(),
                    ex);
            String errorMessage = "Could not store file '" + originalFileName
                    + "'. Please try again.";
            return ResponseEntity.status(500)
                    .body(MessageDTO.builder().errorMessage(errorMessage).build()); // 直接返回一句话
        } catch (NoSuchAlgorithmException ex) {
            log.error("Could not calculate MD5 for file '{}'. Error: {}", originalFileName,
                    ex.getMessage(), ex);
            String errorMessage = "Could not calculate MD5 for file '" + originalFileName
                    + "'. Please try again.";
            return ResponseEntity.status(500)
                    .body(MessageDTO.builder().errorMessage(errorMessage).build()); // 直接返回一句话
        }
    }

    @GetMapping("/download/{storedFileName}")
    public ResponseEntity<Resource> downloadFileAsStream(@PathVariable String storedFileName,
            @RequestHeader("Authorization") String authorizationHeader) {
        // 1. & 2. 令牌验证和用户查找
        String token = authorizationHeader.replace("Bearer ", "");
        if (!jwtUtil.validateToken(token)) {
            log.warn("Unauthorized file download attempt: Invalid token for file {}",
                    storedFileName);
            // 对于错误响应，返回Resource类型可能不直观，可以返回 <Object> 或 <?>
            // 但为了统一，可以返回一个空的Resource和一个错误状态
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        Long userIdFromToken = jwtUtil.getUserIdFromToken(token);
        User user = userService.findById(userIdFromToken);
        if (user == null) {
            log.warn("Unauthorized file download attempt: User ID {} not found.", userIdFromToken);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        // 3. 查询文件元数据
        FileAttachment fileAttachment = messageService
                .findFileAttachmentByStoredFileName(storedFileName);
        if (fileAttachment == null) {
            log.warn("File download failed: File {} not found in database.", storedFileName);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        // 权限校验
        Message originalMessage = messageService.findMessageById(fileAttachment.getMessageId());
        Long senderId = originalMessage.getSenderId();
        Long receiverId = originalMessage.getReceiverId();
        if (!userIdFromToken.equals(senderId) && !userIdFromToken.equals(receiverId)) {
            log.warn(
                    "Authorization failed. User {} attempting to download file {} belonging to others.",
                    userIdFromToken, storedFileName);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        try {
            // 4. 定位文件路径
            Path filePath = fileStoragePath.resolve(storedFileName).normalize();

            // 5. 创建文件资源 (Resource)
            // 使用 UrlResource 从文件路径创建资源对象。
            // Spring Boot 将会以流的方式处理这个 Resource 对象。
            Resource resource = new UrlResource(filePath.toUri());

            // 6. 验证资源是否存在且可读
            if (!resource.exists() || !resource.isReadable()) {
                log.warn("File download failed: File {} not found or not readable on server.",
                        storedFileName);
                // 虽然前面用 Files.exists() 检查过，但这里是作为 Resource 的标准检查流程，更加健壮。
                throw new RuntimeException("File not found or is not readable.");
            }

            // 7. 设置响应头并返回 Resource
            // 不再需要手动设置 Content-Length，Spring Boot 会自动处理。
            String contentType = fileAttachment.getFileType();
            if (contentType == null || contentType.isBlank()) {
                // 提供一个默认的MIME类型，防止浏览器直接打开而不是下载
                contentType = "application/octet-stream";
            }

            log.info("Streaming file '{}' to user {}.", storedFileName, userIdFromToken);

            return ResponseEntity.ok().contentType(MediaType.parseMediaType(contentType))
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + fileAttachment.getFileName() + "\"")
                    .body(resource); // 直接将 resource 作为 body 返回

        } catch (MalformedURLException ex) {
            log.error("File path URL is malformed for file '{}'. Error: {}", storedFileName,
                    ex.getMessage(), ex);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        } catch (RuntimeException ex) {
            // 这个会捕获上面我们手动抛出的 "File not found" 异常
            log.error("Could not stream file '{}'. Error: {}", storedFileName, ex.getMessage(), ex);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
    }

    private synchronized void sendPrivateFileMessage(String senderUsername, String receiverUsername,
            MessageDTO fileMessage) {
        // 这里可以调用消息服务的发送方法
        try {
            String messageJson = objectMapper.writeValueAsString(fileMessage);
            chatSocketServer.sendPrivateMessage(senderUsername, receiverUsername, messageJson);
        } catch (Exception e) {
            log.error("Error serializing file message: {}", e.getMessage(), e);
            return;
        }

    }
}
