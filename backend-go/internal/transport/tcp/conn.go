package tcp

import (
	"context"
	"encoding/json"
	"log/slog"
	"net"
	"time"

	"github.com/elaine/chatter2/backend-go/internal/config"
	"github.com/elaine/chatter2/backend-go/internal/dispatcher"
	"github.com/elaine/chatter2/backend-go/internal/protocol"
	"github.com/elaine/chatter2/backend-go/internal/session"
)

const sendBufSize = 64 // 每个连接的发送队列深度

// conn 封装单个 TCP 连接的生命周期。
// 每个连接两个 goroutine：reader（解码入站消息）和 writer（发送出站消息）。
type conn struct {
	net      net.Conn
	cfg      *config.Config
	sessions *session.Manager
	disp     *dispatcher.Dispatcher

	// send 是本连接的出站队列，由 writer goroutine 消费。
	send chan []byte

	// username 在登录成功后由 dispatcher 通过 session.Register 绑定，
	// conn 本身持有引用仅用于断线时 Remove。
	username string
}

func newConn(c net.Conn, cfg *config.Config, sessions *session.Manager, disp *dispatcher.Dispatcher) *conn {
	return &conn{
		net:      c,
		cfg:      cfg,
		sessions: sessions,
		disp:     disp,
		send:     make(chan []byte, sendBufSize),
	}
}

func (c *conn) run(ctx context.Context) {
	defer c.cleanup()

	// writer goroutine
	go c.writer()

	// reader（主 goroutine）
	c.reader(ctx)
}

func (c *conn) reader(ctx context.Context) {
	dec := protocol.NewDecoder(c.net)
	for {
		// 设置读超时（心跳超时的 2 倍，给足余量）
		deadline := time.Now().Add(c.cfg.HeartbeatTimeout * 2)
		_ = c.net.SetReadDeadline(deadline)

		env, err := dec.Decode()
		if err != nil {
			if ctx.Err() == nil {
				slog.Info("连接断开", "remote", c.net.RemoteAddr(), "err", err)
			}
			return
		}

		// 重置读超时
		_ = c.net.SetReadDeadline(time.Time{})

		resp, username := c.disp.Handle(ctx, env, c.send)
		if username != "" {
			c.username = username
		}
		if resp != nil {
			c.sendEnvelope(resp)
		}
	}
}

func (c *conn) writer() {
	enc := protocol.NewEncoder(c.net)
	for msg := range c.send {
		_ = c.net.SetWriteDeadline(time.Now().Add(10 * time.Second))
		var env protocol.Envelope
		if err := json.Unmarshal(msg, &env); err != nil {
			slog.Error("writer: 反序列化失败", "err", err)
			continue
		}
		if err := enc.Encode(&env); err != nil {
			slog.Error("writer: 发送失败", "err", err)
			return
		}
	}
}

func (c *conn) sendEnvelope(env *protocol.Envelope) {
	b, err := json.Marshal(env)
	if err != nil {
		return
	}
	select {
	case c.send <- b:
	default:
	}
}

func (c *conn) cleanup() {
	c.net.Close()
	close(c.send)
	if c.username != "" {
		c.sessions.Remove(c.username)
		slog.Info("会话已清理", "username", c.username)
	}
}
