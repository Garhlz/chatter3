package com.example.chatterserver.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.example.chatterserver.model.User;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class ChatLobbyServiceTest {
    private UserService userService;

    @BeforeEach
    void setUp() {
        userService = Mockito.mock(UserService.class);
    }

    @Test
    void existingUsersStartOfflineAndOnlineCheckUsesFlag() {
        User alice = User.builder().userId(1L).username("alice").password("secret").nickname("Alice")
                .online(true).build();
        when(userService.getAllUsers()).thenReturn(List.of(alice));

        ChatLobbyService chatLobbyService = new ChatLobbyService(100, userService);

        assertThat(chatLobbyService.isOnline("alice")).isFalse();
        assertThat(chatLobbyService.getOfflineUsers()).singleElement()
                .extracting(User::getUsername)
                .isEqualTo("alice");
    }

    @Test
    void addUserMarksExistingUserOnlineWithoutMutatingReturnedSnapshotPassword() {
        User alice = User.builder().userId(1L).username("alice").password("secret").nickname("Alice")
                .online(false).build();
        when(userService.getAllUsers()).thenReturn(List.of(alice));

        ChatLobbyService chatLobbyService = new ChatLobbyService(100, userService);
        chatLobbyService.addUser(alice);

        assertThat(chatLobbyService.isOnline("alice")).isTrue();
        User onlineUser = chatLobbyService.getOnlineUsers().get(0);
        assertThat(onlineUser.getPassword()).isNull();
        assertThat(alice.getPassword()).isEqualTo("secret");
    }

    @Test
    void removeUserMarksUserOffline() {
        User alice = User.builder().userId(1L).username("alice").password("secret").nickname("Alice")
                .online(false).build();
        when(userService.getAllUsers()).thenReturn(List.of(alice));

        ChatLobbyService chatLobbyService = new ChatLobbyService(100, userService);
        chatLobbyService.addUser(alice);
        chatLobbyService.removeUser("alice");

        assertThat(chatLobbyService.isOnline("alice")).isFalse();
        assertThat(chatLobbyService.getOnlineCount()).isZero();
    }

    @Test
    void addUserTracksNewUsers() {
        when(userService.getAllUsers()).thenReturn(List.of());
        ChatLobbyService chatLobbyService = new ChatLobbyService(100, userService);

        User bob = User.builder().userId(2L).username("bob").password("pwd").nickname("Bob").build();
        chatLobbyService.addUser(bob);

        assertThat(chatLobbyService.isOnline("bob")).isTrue();
        assertThat(chatLobbyService.getOnlineUsers()).singleElement()
                .extracting(User::getUsername)
                .isEqualTo("bob");
    }
}
