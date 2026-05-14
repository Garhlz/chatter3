package com.example.chatterserver.mapper;

import com.example.chatterserver.model.GroupInfo;
import com.example.chatterserver.model.Message;
import com.example.chatterserver.model.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime; // Import LocalDateTime
import java.util.List;

@Mapper
public interface GroupMapper {

    /**
     * 根据群组ID获取群组信息
     * 
     * @param groupId 群组ID
     * @return 群组信息
     */
    GroupInfo getGroupInfoByGroupId(@Param("groupId") Long groupId);

    GroupInfo getGroupInfoByManagerId(@Param("userId") Long userId);

    List<GroupInfo> getGroupsByUserId(@Param("userId") Long userId);

    List<Message> getAllGroupsMessageByUserId(@Param("userId") Long userId);

    /**
     * 创建群组
     * 
     * @param groupInfo 群组信息对象，包含群名称、创建者ID和创建时间
     * @return 影响的行数，MyBatis会自动将生成的groupId设置到groupInfo对象中
     */
    int insertGroup(GroupInfo groupInfo);

    /**
     * 将创建者添加到群组成员表
     * 
     * @param groupId 群组ID
     * @param creatorId 创建者ID
     * @param joinedAt 加入时间
     * @return 影响的行数
     */
    int addCreatorToGroup(@Param("groupId") Long groupId, @Param("creatorId") Long creatorId,
            @Param("joinedAt") LocalDateTime joinedAt);

    /**
     * 根据群组ID删除群组
     * 
     * @param groupId 群组ID
     * @return 影响的行数
     */
    int deleteGroup(@Param("groupId") Long groupId);

    /**
     * 根据群组ID删除所有群组成员
     * 
     * @param groupId 群组ID
     * @return 影响的行数
     */
    int deleteAllGroupMembers(@Param("groupId") Long groupId);

    /**
     * 添加用户到群组
     * 
     * @param userId 用户ID
     * @param groupId 群组ID
     * @param role 角色 (0: member, 1: admin, 2: owner)
     * @param joinedAt 加入时间
     * @return 影响的行数
     */
    int addUserToGroup(@Param("userId") Long userId, @Param("groupId") Long groupId,
            @Param("role") Integer role, @Param("joinedAt") LocalDateTime joinedAt);

    /**
     * 将用户从群组中移除
     * 
     * @param userId 用户ID
     * @param groupId 群组ID
     * @return 影响的行数
     */
    int removeUserFromGroup(@Param("userId") Long userId, @Param("groupId") Long groupId);

    /**
     * 获取指定群组的所有成员信息
     * 
     * @param groupId 群组ID
     * @return 群组成员列表（User对象）
     */
    List<User> getAllUsersFromGroup(@Param("groupId") Long groupId);

    /**
     * 获取指定群组的所有消息
     * 
     * @param groupId 群组ID
     * @return 群组消息列表（Message对象）
     */
    List<Message> getAllMessagesFromGroup(@Param("groupId") Long groupId);

    /**
     * 检查用户是否在指定群组中
     * 
     * @param userId 用户ID
     * @param groupId 群组ID
     * @return 如果用户在群组中，返回1，否则返回0
     */
    int isUserInGroup(@Param("userId") Long userId, @Param("groupId") Long groupId);

    List<GroupInfo> getRelatedGroupsByUserId(@Param("userId") Long userId);
}