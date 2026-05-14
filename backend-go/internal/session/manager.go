// Package session 管理已认证的连接会话。
// 在线状态完全由内存中的 Manager 维护，不依赖数据库字段。
package session

import (
	"sync"
	"time"
)

// Session 表示一个已认证的用户连接。
type Session struct {
	UserID        int64
	Username      string
	Nickname      string
	LastHeartbeat time.Time

	// send 是向该连接写消息的有界缓冲通道。
	// 由 conn goroutine 消费，业务层只写入，不阻塞。
	Send chan []byte
}

// Manager 管理所有在线会话，线程安全。
type Manager struct {
	mu       sync.RWMutex
	byUser   map[string]*Session // username -> session
	byUserID map[int64]*Session  // userId  -> session
}

func NewManager() *Manager {
	return &Manager{
		byUser:   make(map[string]*Session),
		byUserID: make(map[int64]*Session),
	}
}

// Register 注册新会话（登录成功后调用）。
// 若同一用户已有会话，旧会话的 Send 通道会被关闭（触发旧连接退出）。
func (m *Manager) Register(s *Session) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if old, ok := m.byUser[s.Username]; ok {
		close(old.Send) // 触发旧连接的 writer goroutine 退出
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
