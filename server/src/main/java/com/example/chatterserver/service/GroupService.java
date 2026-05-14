package com.example.chatterserver.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime; // Import LocalDateTime
import java.util.List;
import java.util.Map;
import java.util.HashMap; // 导入 HashMap
import java.util.stream.Collectors; // 导入 Collectors

import com.example.chatterserver.dto.MessageDTO;
import com.example.chatterserver.mapper.GroupMapper;
import com.example.chatterserver.model.GroupInfo;
import com.example.chatterserver.model.User;
import com.example.chatterserver.model.Message;

@Service @Slf4j
public class GroupService {
    private final GroupMapper groupMapper;

    @Autowired
    public GroupService(GroupMapper groupMapper) {
        this.groupMapper = groupMapper;
    }

    public GroupInfo getGroupInfoByGroupId(Long groupId) {
        if (groupId == null) {
            log.warn("getGroupInfoByGroupId: GroupId cannot be null.");
            return null;
        }
        return groupMapper.getGroupInfoByGroupId(groupId);
    }

    public GroupInfo getGroupInfoByManagerId(Long userId) {
        if (userId == null) {
            log.warn("getGroupInfoByManagerId: userId cannot be null.");
            return null;
        }
        return groupMapper.getGroupInfoByManagerId(userId);
    }

    /**
     * 创建群组。 包括在`groups`表插入群组信息，并在`group_members`表添加创建者为群主。 使用事务确保操作的原子性。
     * 
     * @param creatorId 创建者ID
     * @param groupName 群名称
     * @return 新创建的群组ID，如果失败返回null
     */
    @Transactional
    public GroupInfo createGroup(Long creatorId, String groupName) throws Exception {
        if (creatorId == null || groupName == null || groupName.trim().isEmpty()) {
            log.warn("createGroup: CreatorId or groupName cannot be null/empty.");
            return null;
        }

        try {
            GroupInfo groupInfo = GroupInfo.builder().groupName(groupName).creatorId(creatorId)
                    .createdAt(LocalDateTime.now()) // 设置群组创建时间
                    .build();

            // 插入群组信息，MyBatis会自动将生成的groupId设置到groupInfo对象中
            int groupInserted = groupMapper.insertGroup(groupInfo);

            if (groupInserted == 0 || groupInfo.getGroupId() == null) {
                log.error(
                        "createGroup: Failed to insert group info for creatorId: {}, groupName: {}",
                        creatorId, groupName);
                throw new RuntimeException("Failed to create group.");
            }

            Long newGroupId = groupInfo.getGroupId();
            // 将创建者添加到群组中，角色为Owner (2)，并设置加入时间
            int memberAdded = groupMapper.addCreatorToGroup(newGroupId, creatorId,
                    LocalDateTime.now());
            if (memberAdded == 0) {
                log.error("createGroup: Failed to add creator {} to new group {}", creatorId,
                        newGroupId);
                throw new RuntimeException("Failed to add creator to group.");
            }
            log.info("Group created successfully with ID: {} by creator: {}", newGroupId,
                    creatorId);

            return groupInfo;
        } catch (Exception e) {
            log.error(
                    "createGroup: An error occurred while creating group for creatorId: {}, groupName: {}. Error: {}",
                    creatorId, groupName, e.getMessage());
            throw e;
        }
    }

    /**
     * 根据群组ID删除群组。 删除群组时，需要先删除`group_members`表中该群组的所有成员记录，然后才能删除`groups`表中的群组记录。 使用事务确保操作的原子性。
     * 
     * @param groupId 群组ID
     * @return 影响的行数 (通常为1表示成功删除群组记录)，如果失败返回0
     */
    @Transactional
    public int deleteGroupByGroupId(Long groupId) {
        if (groupId == null) {
            log.warn("deleteGroupByGroupId: GroupId cannot be null.");
            return 0;
        }
        try {
            // 先删除群组成员
            groupMapper.deleteAllGroupMembers(groupId);
            log.info("Deleted all members for group ID: {}", groupId);

            // 再删除群组本身
            int deletedRows = groupMapper.deleteGroup(groupId);
            if (deletedRows > 0) {
                log.info("Group with ID: {} deleted successfully.", groupId);
            } else {
                log.warn("Group with ID: {} not found or already deleted.", groupId);
            }
            return deletedRows;
        } catch (Exception e) {
            log.error(
                    "deleteGroupByGroupId: An error occurred while deleting group ID: {}. Error: {}",
                    groupId, e.getMessage());
            throw e;
        }
    }

    /**
     * 添加用户到群组。
     * 
     * @param userId 用户ID
     * @param groupId 群组ID
     * @return 影响的行数，如果用户已在群组中或添加失败返回0
     */
    public int addUserToGroup(Long userId, Long groupId) {
        if (userId == null || groupId == null) {
            log.warn("addUserToGroup: UserId or GroupId cannot be null.");
            return 0;
        }
        try {
            // 检查用户是否已在群组中
            if (groupMapper.isUserInGroup(userId, groupId) > 0) {
                log.warn("addUserToGroup: User {} is already in group {}.", userId, groupId);
                return 0; // 用户已在群组中
            }
            // 默认角色为成员 (0)，并设置加入时间
            int affectedRows = groupMapper.addUserToGroup(userId, groupId, 0, LocalDateTime.now());
            if (affectedRows > 0) {
                log.info("User {} added to group {} successfully.", userId, groupId);
            } else {
                log.warn("addUserToGroup: Failed to add user {} to group {}.", userId, groupId);
            }
            return affectedRows;
        } catch (Exception e) {
            log.error(
                    "addUserToGroup: An error occurred while adding user {} to group {}. Error: {}",
                    userId, groupId, e.getMessage());
            return 0;
        }
    }

    /**
     * 将用户从群组中移除。
     * 
     * @param userId 用户ID
     * @param groupId 群组ID
     * @return 影响的行数，如果用户不在群组中或移除失败返回0
     */
    public int removeUserFromGroup(Long userId, Long groupId) {
        if (userId == null || groupId == null) {
            log.warn("removeUserFromGroup: UserId or GroupId cannot be null.");
            return 0;
        }
        try {
            // 检查用户是否在群组中
            if (groupMapper.isUserInGroup(userId, groupId) == 0) {
                log.warn("removeUserFromGroup: User {} is not in group {}.", userId, groupId);
                return 0; // 用户不在群组中
            }

            int affectedRows = groupMapper.removeUserFromGroup(userId, groupId);
            if (affectedRows > 0) {
                log.info("User {} removed from group {} successfully.", userId, groupId);
            } else {
                log.warn("removeUserFromGroup: Failed to remove user {} from group {}.", userId,
                        groupId);
            }
            return affectedRows;
        } catch (Exception e) {
            log.error(
                    "removeUserFromGroup: An error occurred while removing user {} from group {}. Error: {}",
                    userId, groupId, e.getMessage());
            return 0;
        }
    }

    /**
     * 获取指定群组的所有成员，并以Map形式返回，键为userId，值为User对象。
     *
     * @param groupId 群组ID
     * @return 群组成员的Map，如果群组不存在或无成员返回空Map
     */
    public Map<Long, User> getAllUsersFromGroup(Long groupId) {
        if (groupId == null) {
            log.warn("getAllUsersFromGroup: GroupId cannot be null.");
            return new HashMap<>(); // 返回空Map
        }
        try {
            List<User> users = groupMapper.getAllUsersFromGroup(groupId);
            log.debug("Found {} users in group {}.", users.size(), groupId);

            // 遍历用户列表，将每个用户的密码设置为空字符串
            // 然后将 List<User> 转换为 Map<Long, User>
            return users.stream().peek(user -> user.setPassword(null)) // 或者 user.setPassword("");
                    .collect(Collectors.toMap(User::getUserId, user -> user));
        } catch (Exception e) {
            log.error(
                    "getAllUsersFromGroup: An error occurred while getting users from group {}. Error: {}",
                    groupId, e.getMessage());
            return new HashMap<>(); // 异常时也返回空Map
        }
    }

    public List<GroupInfo> getGroupsByUserId(Long userId) {
        return groupMapper.getGroupsByUserId(userId);
    }

    public List<Message> getAllGroupsMessageByUserId(Long userId) {
        return groupMapper.getAllGroupsMessageByUserId(userId);
    }



    /**
     * 判断用户是否是指定群组的群主 (Creator)。 注意：这个方法假设 getGroupInfoByGroupId 能够正确返回群组信息， 并且群主的判断逻辑是基于
     * groupInfo.getCreatorId()。
     *
     * @param userId 用户ID
     * @param groupId 群组ID
     * @return 如果用户是该群组的群主，则返回 true；否则返回 false。
     */
    public Boolean isGroupOwner(Long userId, Long groupId) {
        if (userId == null || groupId == null) {
            log.warn("isGroupOwner: UserId or GroupId cannot be null.");
            return false;
        }
        GroupInfo groupInfo = getGroupInfoByGroupId(groupId);
        if (groupInfo == null) {
            log.warn("isGroupOwner: Group with ID {} not found.", groupId);
            return false; // 群组不存在
        }
        // 判断传入的 userId 是否是该群组的创建者（群主）
        return userId.equals(groupInfo.getCreatorId()); // 使用 .equals() 比较 Long 对象
    }

    public List<GroupInfo> getRelatedGroupsByUserId(Long userId) {
        return groupMapper.getRelatedGroupsByUserId(userId);
    }

}