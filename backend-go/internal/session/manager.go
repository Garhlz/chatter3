// Package session 管理已认证的连接会话。
// 在线状态完全由内存中的 Manager 维护，不依赖数据库字段。
package session

import (
	"slices"
	"sync"
	"time"
)

// Session 表示一个已认证的用户连接。
type Session struct {
	UserID        int64
	Username      string
	Nickname      string
	AvatarURL     string
	LastHeartbeat time.Time
	Close         func() error
	closeOnce     sync.Once

	// send 是向该连接写消息的有界缓冲通道。
	// 由 conn goroutine 消费，业务层只写入，不阻塞。
	Send chan []byte
}

// Shutdown closes connection-related resources exactly once.
//
// 这样读循环退出、重连替换旧连接、后台超时清理都可以调用同一个入口，
// 不需要每条路径分别赌自己不会重复 close。
func (s *Session) Shutdown() {
	s.closeOnce.Do(func() {
		if s.Close != nil {
			_ = s.Close()
		}
		close(s.Send)
	})
}

// Manager 管理所有在线会话，线程安全。
type Manager struct {
	mu       sync.RWMutex
	byUser   map[string][]*Session // username -> all active connections
	byUserID map[int64][]*Session  // userId -> all active connections
}

// Snapshot is a transport-friendly read model of an online session.
//
// session 包只提供“当前在线状态的稳定快照”，不直接依赖 protocol-v2，
// 这样 HTTP 和后续别的 transport 都能复用这份视图。
type Snapshot struct {
	UserID    int64
	Username  string
	Nickname  string
	AvatarURL string
	Online    bool
}

func NewManager() *Manager {
	return &Manager{
		byUser:   make(map[string][]*Session),
		byUserID: make(map[int64][]*Session),
	}
}

// Register 注册一条已认证连接，并返回该用户此前是否完全离线。
// 同一个账号可以同时打开 Web 和桌面端；每条连接独立维护心跳和发送队列。
func (m *Manager) Register(s *Session) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	wasOffline := len(m.byUser[s.Username]) == 0
	m.byUser[s.Username] = append(m.byUser[s.Username], s)
	m.byUserID[s.UserID] = append(m.byUserID[s.UserID], s)
	return wasOffline
}

// Remove 注销会话（断线/登出时调用），幂等。
func (m *Manager) Remove(username string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	sessions := m.byUser[username]
	if len(sessions) == 0 {
		return
	}
	delete(m.byUser, username)
	delete(m.byUserID, sessions[0].UserID)
}

// RemoveSession 只移除指定连接，返回该用户是否因此变为完全离线。
func (m *Manager) RemoveSession(target *Session) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	sessions := m.byUser[target.Username]
	remaining, removed := withoutSession(sessions, target)
	if !removed {
		return false
	}
	if len(remaining) == 0 {
		delete(m.byUser, target.Username)
		delete(m.byUserID, target.UserID)
		return true
	}
	m.byUser[target.Username] = remaining
	m.byUserID[target.UserID], _ = withoutSession(m.byUserID[target.UserID], target)
	return false
}

// Get 通过 username 查找会话，未登录返回 nil。
func (m *Manager) Get(username string) *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	sessions := m.byUser[username]
	if len(sessions) == 0 {
		return nil
	}
	return sessions[len(sessions)-1]
}

// GetByID 通过 userId 查找会话。
func (m *Manager) GetByID(userID int64) *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	sessions := m.byUserID[userID]
	if len(sessions) == 0 {
		return nil
	}
	return sessions[len(sessions)-1]
}

// IsOnline 检查用户是否在线。
func (m *Manager) IsOnline(username string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.byUser[username]) > 0
}

// OnlineUsernames 返回当前所有在线用户名快照。
func (m *Manager) OnlineUsernames() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	names := make([]string, 0, len(m.byUser))
	for k := range m.byUser {
		names = append(names, k)
	}
	return names
}

// OnlineSnapshots returns a stable, username-sorted snapshot of online users.
func (m *Manager) OnlineSnapshots() []Snapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()

	snapshots := make([]Snapshot, 0, len(m.byUser))
	for _, sessions := range m.byUser {
		s := sessions[len(sessions)-1]
		snapshots = append(snapshots, Snapshot{
			UserID:    s.UserID,
			Username:  s.Username,
			Nickname:  s.Nickname,
			AvatarURL: s.AvatarURL,
			Online:    true,
		})
	}
	slices.SortFunc(snapshots, func(a, b Snapshot) int {
		switch {
		case a.Username < b.Username:
			return -1
		case a.Username > b.Username:
			return 1
		default:
			return 0
		}
	})
	return snapshots
}

// Broadcast 向除 excludeUsername 之外的所有在线会话写入消息（非阻塞）。
func (m *Manager) Broadcast(msg []byte, excludeUsername string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for uname, sessions := range m.byUser {
		if uname == excludeUsername {
			continue
		}
		for _, s := range sessions {
			select {
			case s.Send <- msg:
			default:
				// 队列满则丢弃，避免慢客户端拖累广播
			}
		}
	}
}

// SendToUsers 向指定用户名列表中的所有在线会话写入消息（非阻塞）。
func (m *Manager) SendToUsers(msg []byte, usernames []string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, uname := range usernames {
		for _, s := range m.byUser[uname] {
			select {
			case s.Send <- msg:
			default:
			}
		}
	}
}

// Send 向指定用户发送消息（非阻塞）。
// 持有写锁直到 channel write 完成，避免并发 Shutdown 关闭 channel 导致 panic。
func (m *Manager) Send(username string, msg []byte) bool {
	m.mu.Lock()
	sessions := m.byUser[username]
	if len(sessions) == 0 {
		m.mu.Unlock()
		return false
	}
	delivered := false
	for _, s := range sessions {
		select {
		case s.Send <- msg:
			delivered = true
		default:
		}
	}
	m.mu.Unlock()
	return delivered
}

// UpdateHeartbeat 只刷新发来 pong/ping 的具体连接。
// 一个客户端不能替同账号的另一个失联客户端续期。
func (m *Manager) UpdateHeartbeat(target *Session) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, s := range m.byUser[target.Username] {
		if s == target {
			s.LastHeartbeat = time.Now()
			return
		}
	}
}

// UpdateNickname refreshes the in-memory nickname for an online session.
func (m *Manager) UpdateNickname(userID int64, nickname string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	sessions := m.byUserID[userID]
	if len(sessions) == 0 {
		return false
	}
	for _, s := range sessions {
		s.Nickname = nickname
	}
	return true
}

// UpdateAvatar refreshes the public avatar copied into every active session.
func (m *Manager) UpdateAvatar(userID int64, avatarURL string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	sessions := m.byUserID[userID]
	if len(sessions) == 0 {
		return false
	}
	for _, s := range sessions {
		s.AvatarURL = avatarURL
	}
	return true
}

type ExpiredSession struct {
	Session       *Session
	BecameOffline bool
}

// ExpireIdleSessions removes sessions whose last heartbeat is older than timeout.
//
// 这个方法给“后台清理器”使用，而不是给业务请求直接调用。
// 设计上返回被淘汰的会话快照，让上层决定是否广播 offline 事件，
// 避免 session 包反向依赖 protocol 或 transport 层。
func (m *Manager) ExpireIdleSessions(now time.Time, timeout time.Duration) []ExpiredSession {
	m.mu.Lock()
	defer m.mu.Unlock()

	var expired []ExpiredSession
	for username, sessions := range m.byUser {
		remaining := make([]*Session, 0, len(sessions))
		for _, s := range sessions {
			if now.Sub(s.LastHeartbeat) <= timeout {
				remaining = append(remaining, s)
				continue
			}
			expired = append(expired, ExpiredSession{Session: s})
		}
		if len(remaining) > 0 {
			m.byUser[username] = remaining
			m.byUserID[remaining[0].UserID] = remaining
			continue
		}
		delete(m.byUser, username)
		if len(sessions) > 0 {
			delete(m.byUserID, sessions[0].UserID)
			for i := len(expired) - 1; i >= 0; i-- {
				if expired[i].Session.Username == username {
					expired[i].BecameOffline = true
					break
				}
			}
		}
	}

	return expired
}

func withoutSession(sessions []*Session, target *Session) ([]*Session, bool) {
	remaining := make([]*Session, 0, len(sessions))
	removed := false
	for _, s := range sessions {
		if s == target {
			removed = true
			continue
		}
		remaining = append(remaining, s)
	}
	return remaining, removed
}
