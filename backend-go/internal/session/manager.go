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
	byUser   map[string]*Session // username -> session
	byUserID map[int64]*Session  // userId  -> session
}

// Snapshot is a transport-friendly read model of an online session.
//
// session 包只提供“当前在线状态的稳定快照”，不直接依赖 protocol-v2，
// 这样 HTTP 和后续别的 transport 都能复用这份视图。
type Snapshot struct {
	UserID   int64
	Username string
	Nickname string
	Online   bool
}

func NewManager() *Manager {
	return &Manager{
		byUser:   make(map[string]*Session),
		byUserID: make(map[int64]*Session),
	}
}

// Register 注册新会话（登录成功后调用）。
// 若同一用户已有会话，会尽力关闭旧连接，避免客户端以为自己还在线。
func (m *Manager) Register(s *Session) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if old, ok := m.byUser[s.Username]; ok {
		old.Shutdown()
	}
	m.byUser[s.Username] = s
	m.byUserID[s.UserID] = s
}

// Remove 注销会话（断线/登出时调用），幂等。
func (m *Manager) Remove(username string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	s, ok := m.byUser[username]
	if !ok {
		return
	}
	delete(m.byUser, username)
	delete(m.byUserID, s.UserID)
}

// RemoveSession removes a session only if the exact session pointer is still current.
//
// 这样可以避免“同一用户新连接顶掉旧连接”时，旧连接退出又把新会话误删掉。
// 对 WebSocket 这类长连接来说，这个保护很重要，否则重连会把在线状态弄乱。
func (m *Manager) RemoveSession(target *Session) {
	m.mu.Lock()
	defer m.mu.Unlock()

	current, ok := m.byUser[target.Username]
	if !ok || current != target {
		return
	}
	delete(m.byUser, target.Username)
	delete(m.byUserID, target.UserID)
}

// Get 通过 username 查找会话，未登录返回 nil。
func (m *Manager) Get(username string) *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.byUser[username]
}

// GetByID 通过 userId 查找会话。
func (m *Manager) GetByID(userID int64) *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.byUserID[userID]
}

// IsOnline 检查用户是否在线。
func (m *Manager) IsOnline(username string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, ok := m.byUser[username]
	return ok
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
	for _, s := range m.byUser {
		snapshots = append(snapshots, Snapshot{
			UserID:   s.UserID,
			Username: s.Username,
			Nickname: s.Nickname,
			Online:   true,
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
	m.mu.RLock()
	defer m.mu.RUnlock()
	for uname, s := range m.byUser {
		if uname == excludeUsername {
			continue
		}
		select {
		case s.Send <- msg:
		default:
			// 队列满则丢弃，避免慢客户端拖累广播
		}
	}
}

// Send 向指定用户发送消息（非阻塞）。
func (m *Manager) Send(username string, msg []byte) bool {
	m.mu.RLock()
	s, ok := m.byUser[username]
	m.mu.RUnlock()
	if !ok {
		return false
	}
	select {
	case s.Send <- msg:
		return true
	default:
		return false
	}
}

// UpdateHeartbeat 刷新用户心跳时间。
func (m *Manager) UpdateHeartbeat(username string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.byUser[username]; ok {
		s.LastHeartbeat = time.Now()
	}
}

// ExpireIdleSessions removes sessions whose last heartbeat is older than timeout.
//
// 这个方法给“后台清理器”使用，而不是给业务请求直接调用。
// 设计上返回被淘汰的会话快照，让上层决定是否广播 offline 事件，
// 避免 session 包反向依赖 protocol 或 transport 层。
func (m *Manager) ExpireIdleSessions(now time.Time, timeout time.Duration) []*Session {
	m.mu.Lock()
	defer m.mu.Unlock()

	var expired []*Session
	for username, s := range m.byUser {
		if now.Sub(s.LastHeartbeat) <= timeout {
			continue
		}
		delete(m.byUser, username)
		delete(m.byUserID, s.UserID)
		expired = append(expired, s)
	}

	return expired
}
