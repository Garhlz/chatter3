package com.example.chatterserver.service;

import com.example.chatterserver.dto.MessageDTO;
import com.example.chatterserver.exception.ChatException;
import com.example.chatterserver.mapper.GroupMapper;
import com.example.chatterserver.mapper.MessageMapper;
import com.example.chatterserver.mapper.UserMapper;
import com.example.chatterserver.model.Message;
import com.example.chatterserver.model.MessageType;
import com.example.chatterserver.model.User;
import com.example.chatterserver.model.FileAttachment;

import java.io.File;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;

@Service @Slf4j
public class MessageService {
    private final MessageMapper messageMapper;
    private final UserMapper    userMapper;
    private final UserService   userService;
    private final ObjectMapper  objectMapper;
    private final GroupMapper groupMapper;

    @Autowired
    public MessageService(MessageMapper messageMapper, UserMapper userMapper,
            UserService userService, ObjectMapper objectMapper, GroupMapper groupMapper) {
        this.messageMapper = messageMapper;
        this.userMapper = userMapper;
        this.userService = userService;
        this.objectMapper = objectMapper;
        this.groupMapper = groupMapper;
    }

    public Message saveMessage(Long senderId, Long receiverId, Long groupId, Integer messageType,
            String content) {
        Message message = new Message();
        message.setSenderId(senderId);
        message.setReceiverId(receiverId);

        message.setGroupId(groupId); // 新增群聊功能

        message.setMessageType(messageType);
        message.setContent(content);
        // message.setStatus(0); // 状态暂不支持
        message.setCreatedAt(LocalDateTime.now());
        messageMapper.insert(message);
        return message;
    }

    public FileAttachment saveFileInfo(Long messageId, String fileName, String stored_file_name,
            String file_url, Long fileSize, String md5, String fileType) {

        FileAttachment fileAttachment = FileAttachment.builder().messageId(messageId)
                .fileName(fileName).storedFileName(stored_file_name).fileUrl(file_url)
                .fileSize(fileSize).md5(md5).fileType(fileType).uploadTime(LocalDateTime.now())
                .build();

        messageMapper.insertFileInfo(fileAttachment);

        return fileAttachment; // 这里暂时返回消息ID作为文件ID
    }

    public FileAttachment findFileAttachmentByStoredFileName(String storedFileName) {
        return messageMapper.findFileAttachmentByStoredFileName(storedFileName);

    }

    public FileAttachment getFileAttachmentByMessageId(Long MessageId) {
        return messageMapper.getFileAttachmentByMessageId(MessageId);

    }

    public Message findMessageById(Long MessageId) {
        return messageMapper.findMessageById(MessageId);
    }

    public List<MessageDTO> getChatLobbyMessages() {
        List<Message> messages = messageMapper.findChatLobbyMessages();
        return messages.stream().map(this::convertToDTO).collect(Collectors.toList());
    }

    public List<MessageDTO> getPrivateMessages(Long userId) {
        List<Message> messages = messageMapper.findPrivateMessages(userId);
        // 已经包括了(m.sender_id = #{userId} OR m.receiver_id = #{userId})
        return messages.stream().map(this::convertToDTO).collect(Collectors.toList());
    }

    public List<MessageDTO> getGroupsMessages(Long userId) {
        List<Message> messages = messageMapper.getAllGroupsMessageByUserId(userId);
        return messages.stream().map(this::convertToDTO).collect(Collectors.toList());
    }

    private MessageDTO convertToDTO(Message message) {
        // 获取昵称
        User user = userService.findById(message.getSenderId());
        String nickname = user.getNickname();
        String username = user.getUsername();
        if (nickname == null) {
            log.warn("Nickname not found for senderId: {}", message.getSenderId());
            nickname = "Unknown";
        }

        // 确定通信类型
        MessageType type = null;
        String receiver = null;
        Long groupId = null;

        if (message.getReceiverId() == null && message.getGroupId() == null) {
            type = MessageType.CHAT; // 大厅消息
        } else if (message.getReceiverId() == null && message.getGroupId() != null) { // 现在支持了GROUPCHAT
            type = MessageType.GROUP_CHAT;
            groupId = message.getGroupId();
        } else if (message.getReceiverId() != null && message.getGroupId() == null) { // 现在后端支持了私聊的文件格式
            int tmp = message.getMessageType() != null ? message.getMessageType() : -1;
            if (tmp == 1)
                type = MessageType.FILE;
            else
                type = MessageType.PRIVATE_CHAT;
            User receiverUser = userService.findById(message.getReceiverId());
            receiver = receiverUser.getUsername(); // 这里要设置接收者, 就可以成功取出私聊消息记录了
        }

        FileAttachment record = getFileAttachmentByMessageId(message.getMessageId());

        if (type == MessageType.FILE) {
            try {
                message.setContent(objectMapper.writeValueAsString(record));
            } catch (Exception e) {
                log.error("Unexpected error: {} [Raw message: {}]", e.getMessage(),
                        record.toString());
            }
        }

        // 时间戳
        String timestamp = message.getCreatedAt() != null
                ? message.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                : LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        // 新增了userid字段
        return MessageDTO.builder().messageId(message.getMessageId()).type(type).userId(message.getSenderId()).username(username)
                .nickname(nickname).receiver(receiver).content(message.getContent())
                .groupId(groupId).timestamp(timestamp).build();
    }

    public List<MessageDTO> getAllMessagesFromGroup(Long groupId) {
        if (groupId == null) {
            log.warn("getAllMessagesFromGroup: GroupId cannot be null.");
            return List.of();
        }
        try {
            List<Message> messages = groupMapper.getAllMessagesFromGroup(groupId);
            log.debug("Found {} messages in group {}.", messages.size(), groupId);
            return messages.stream().map(this::convertToDTO).collect(Collectors.toList());
        } catch (Exception e) {
            log.error(
                    "getAllMessagesFromGroup: An error occurred while getting messages from group {}. Error: {}",
                    groupId, e.getMessage());
            return List.of();
        }
    }
}