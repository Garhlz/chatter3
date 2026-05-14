package com.example.chatterserver.mapper;

import com.example.chatterserver.model.FileAttachment;
import com.example.chatterserver.model.Message;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface MessageMapper {
    int insert(Message message);

    int insertFileInfo(FileAttachment fileAttachment);

    List<Message> findPrivateMessages(@Param("userId") Long userId); // 这里查询的有聊天记录和文件记录

    Message findMessageById(@Param("messageId") Long messageId);

    FileAttachment getFileAttachmentByMessageId(@Param("messageId") Long messageId);

    FileAttachment findFileAttachmentByStoredFileName(
            @Param("storedFileName") String storedFileName);

    List<Message> findGroupMessages(@Param("groupId") Long groupId, @Param("limit") int limit);

    // List<Message> findChatLobbyMessages(@Param("limit") int limit);
    List<Message> findChatLobbyMessages();

    int updateStatus(@Param("messageId") Long messageId, @Param("status") Integer status);

    List<Message> getAllGroupsMessageByUserId(@Param("userId") Long userId);
}