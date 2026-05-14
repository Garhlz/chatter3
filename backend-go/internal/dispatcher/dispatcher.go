// Package dispatcher 根据消息 type 字段将请求路由到对应处理函数。
// 依赖方向：transport -> dispatcher -> service
package dispatcher

import (
	"context"
	"log/slog"
	"time"

	"github.com/elaine/chatter2/backend-go/internal/protocol"
	"github.com/elaine/chatter2/backend-go/internal/session"
)

// Dispatcher 持有所有业务 Service 的引用，是 transport 层与业务层的唯一边界。
type Dispatcher struct {
	sessions *session.Manager
	// 各 service 将在 P3~P6 阶段注入
	// userSvc    *service.UserService
	// msgSvc     *service.MessageService
	// groupSvc   *service.GroupService
}

func New(sessions *session.Manager) *Dispatcher {
	return &Dispatcher{sessions: sessions}
}

// Handle 处理一条入站消息，返回：
//   - resp：需要直接回复给当前连接的消息（可为 nil）
//   - username：若本次消息完成了登录，返回登录的 username，否则为空
//
// Handle 本身不做 I/O，所有推送操作通过 sendCh 或 session.Manager 完成。
func (d *Dispatcher) Handle(ctx context.Context, env *protocol.Envelope, sendCh chan<- []byte) (resp *protocol.Envelope, username string) {
	if env.Type == "" {
		return protocol.ErrorEnvelope("消息类型不能为空"), ""
	}

	// LOGIN 和 REGISTER 不要求 token，其余消息需要已登录会话
	switch env.Type {
	case protocol.TypeLogin, protocol.TypeRegister:
		// 允许匿名
	default:
		if env.Token == "" {
			return protocol.ErrorEnvelope("缺少 token"), ""
		}
		// token 校验将在 P3 阶段接入 JWTService
	}

	switch env.Type {
	case protocol.TypeLogin:
		return d.handleLogin(ctx, env, sendCh)
	case protocol.TypeRegister:
		return d.handleRegister(ctx, env)
	case protocol.TypeHeartbeat:
		return d.handleHeartbeat(env)
	case protocol.TypeLogout:
		return d.handleLogout(env)
	case protocol.TypeChat:
		return d.handleChat(ctx, env), ""
	case protocol.TypePrivateChat:
		return d.handlePrivateChat(ctx, env), ""
	case protocol.TypeGroupChat:
		return d.handleGroupChat(ctx, env), ""
	case protocol.TypeGroupCreate:
		return d.handleGroupCreate(ctx, env), ""
	case protocol.TypeGroupDelete:
		return d.handleGroupDelete(ctx, env), ""
	case protocol.TypeGroupAdd:
		return d.handleGroupAdd(ctx, env), ""
	case protocol.TypeGroupRemove:
		return d.handleGroupRemove(ctx, env), ""
	default:
		slog.Warn("未知消息类型", "type", env.Type)
		return protocol.ErrorEnvelope("未知的消息类型: " + string(env.Type)), ""
	}
}

// --- 以下 handler 为骨架占位，P3~P6 阶段逐步实现 ---

func (d *Dispatcher) handleLogin(ctx context.Context, env *protocol.Envelope, sendCh chan<- []byte) (*protocol.Envelope, string) {
	// TODO P3：调用 userSvc.Authenticate，注册 session，发送初始化消息序列
	return &protocol.Envelope{
		Type:         protocol.TypeLogin,
		Status:       "error",
		ErrorMessage: "服务暂未实现",
		Timestamp:    now(),
	}, ""
}

func (d *Dispatcher) handleRegister(ctx context.Context, env *protocol.Envelope) (*protocol.Envelope, string) {
	// TODO P3：调用 userSvc.Register
	return &protocol.Envelope{
		Type:         protocol.TypeRegister,
		Status:       "error",
		ErrorMessage: "服务暂未实现",
		Timestamp:    now(),
	}, ""
}

func (d *Dispatcher) handleHeartbeat(env *protocol.Envelope) (*protocol.Envelope, string) {
	// TODO P3：从 token 解析 username，更新心跳时间
	return &protocol.Envelope{
		Type:      protocol.TypeHeartbeat,
		Timestamp: now(),
	}, ""
}

func (d *Dispatcher) handleLogout(env *protocol.Envelope) (*protocol.Envelope, string) {
	// TODO P3：清理会话，广播 USER_LOGOUT
	return nil, ""
}

func (d *Dispatcher) handleChat(ctx context.Context, env *protocol.Envelope) *protocol.Envelope {
	// TODO P4：保存大厅消息，广播
	return protocol.ErrorEnvelope("服务暂未实现")
}

func (d *Dispatcher) handlePrivateChat(ctx context.Context, env *protocol.Envelope) *protocol.Envelope {
	// TODO P5：保存私聊消息，投递给接收方
	return protocol.ErrorEnvelope("服务暂未实现")
}

func (d *Dispatcher) handleGroupChat(ctx context.Context, env *protocol.Envelope) *protocol.Envelope {
	// TODO P6：保存群聊消息，广播给群成员
	return protocol.ErrorEnvelope("服务暂未实现")
}

func (d *Dispatcher) handleGroupCreate(ctx context.Context, env *protocol.Envelope) *protocol.Envelope {
	// TODO P6
	return protocol.ErrorEnvelope("服务暂未实现")
}

func (d *Dispatcher) handleGroupDelete(ctx context.Context, env *protocol.Envelope) *protocol.Envelope {
	// TODO P6
	return protocol.ErrorEnvelope("服务暂未实现")
}

func (d *Dispatcher) handleGroupAdd(ctx context.Context, env *protocol.Envelope) *protocol.Envelope {
	// TODO P6
	return protocol.ErrorEnvelope("服务暂未实现")
}

func (d *Dispatcher) handleGroupRemove(ctx context.Context, env *protocol.Envelope) *protocol.Envelope {
	// TODO P6
	return protocol.ErrorEnvelope("服务暂未实现")
}

func now() string {
	return time.Now().Format(time.RFC3339)
}
