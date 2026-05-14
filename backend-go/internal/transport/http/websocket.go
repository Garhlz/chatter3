package http

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	protocolv2 "github.com/elaine/chatter2/backend-go/internal/protocol/v2"
)

const (
	wsOpcodeContinuation = 0x0
	wsOpcodeText         = 0x1
	wsOpcodeClose        = 0x8
	wsOpcodePing         = 0x9
	wsOpcodePong         = 0xA

	websocketGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
)

type wsInboundEvent struct {
	Event     string          `json:"event"`
	RequestID string          `json:"requestId,omitempty"`
	Timestamp string          `json:"timestamp,omitempty"`
	Payload   json.RawMessage `json:"payload"`
}

// wsConn is a deliberately small RFC6455 implementation for the current P3 scope.
//
// 这里没有追求“通用 WebSocket 库”的能力，只覆盖当前确实要用到的部分：
//   - HTTP upgrade
//   - text frame
//   - ping/pong
//   - close
//
// 这样做的目的，是先把 protocol-v2 的实时边界跑通，而不额外引入新的第三方依赖。
type wsConn struct {
	conn net.Conn
	mu   sync.Mutex
}

func acceptWebSocket(w http.ResponseWriter, r *http.Request) (*wsConn, error) {
	if !headerContainsToken(r.Header, "Connection", "Upgrade") {
		return nil, fmt.Errorf("missing Connection: Upgrade")
	}
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		return nil, fmt.Errorf("missing Upgrade: websocket")
	}
	if r.Header.Get("Sec-WebSocket-Version") != "13" {
		return nil, fmt.Errorf("unsupported websocket version")
	}

	key := strings.TrimSpace(r.Header.Get("Sec-WebSocket-Key"))
	if key == "" {
		return nil, fmt.Errorf("missing Sec-WebSocket-Key")
	}

	hj, ok := w.(http.Hijacker)
	if !ok {
		return nil, fmt.Errorf("response writer does not support hijacking")
	}

	conn, buf, err := hj.Hijack()
	if err != nil {
		return nil, fmt.Errorf("hijack failed: %w", err)
	}

	acceptKey := buildWebSocketAccept(key)
	response := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + acceptKey + "\r\n" +
		"\r\n"
	if _, err := buf.WriteString(response); err != nil {
		conn.Close()
		return nil, fmt.Errorf("write handshake response: %w", err)
	}
	if err := buf.Flush(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("flush handshake response: %w", err)
	}

	return &wsConn{conn: conn}, nil
}

func (c *wsConn) close() error {
	return c.conn.Close()
}

func (c *wsConn) setReadDeadline(t time.Time) error {
	return c.conn.SetReadDeadline(t)
}

func (c *wsConn) readFrame() (byte, []byte, error) {
	header := make([]byte, 2)
	if _, err := io.ReadFull(c.conn, header); err != nil {
		return 0, nil, err
	}

	fin := header[0]&0x80 != 0
	opcode := header[0] & 0x0F
	masked := header[1]&0x80 != 0
	if !fin {
		return 0, nil, fmt.Errorf("fragmented frames are not supported")
	}
	if opcode == wsOpcodeContinuation {
		return 0, nil, fmt.Errorf("continuation frames are not supported")
	}
	if !masked {
		return 0, nil, fmt.Errorf("client frames must be masked")
	}

	payloadLen := int64(header[1] & 0x7F)
	switch payloadLen {
	case 126:
		extended := make([]byte, 2)
		if _, err := io.ReadFull(c.conn, extended); err != nil {
			return 0, nil, err
		}
		payloadLen = int64(binary.BigEndian.Uint16(extended))
	case 127:
		extended := make([]byte, 8)
		if _, err := io.ReadFull(c.conn, extended); err != nil {
			return 0, nil, err
		}
		payloadLen = int64(binary.BigEndian.Uint64(extended))
	}

	maskKey := make([]byte, 4)
	if _, err := io.ReadFull(c.conn, maskKey); err != nil {
		return 0, nil, err
	}

	payload := make([]byte, payloadLen)
	if _, err := io.ReadFull(c.conn, payload); err != nil {
		return 0, nil, err
	}
	for i := range payload {
		payload[i] ^= maskKey[i%4]
	}
	return opcode, payload, nil
}

func (c *wsConn) writeFrame(opcode byte, payload []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	var header [10]byte
	header[0] = 0x80 | opcode
	n := 2

	switch l := len(payload); {
	case l <= 125:
		header[1] = byte(l)
	case l <= 65535:
		header[1] = 126
		binary.BigEndian.PutUint16(header[2:4], uint16(l))
		n = 4
	default:
		header[1] = 127
		binary.BigEndian.PutUint64(header[2:10], uint64(l))
		n = 10
	}

	if _, err := c.conn.Write(header[:n]); err != nil {
		return err
	}
	if len(payload) == 0 {
		return nil
	}
	_, err := c.conn.Write(payload)
	return err
}

func (c *wsConn) writeJSON(v any) error {
	body, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return c.writeFrame(wsOpcodeText, body)
}

func buildWebSocketAccept(key string) string {
	sum := sha1.Sum([]byte(key + websocketGUID))
	return base64.StdEncoding.EncodeToString(sum[:])
}

func headerContainsToken(h http.Header, name, token string) bool {
	for _, part := range strings.Split(h.Get(name), ",") {
		if strings.EqualFold(strings.TrimSpace(part), token) {
			return true
		}
	}
	return false
}

func eventJSON[T any](name string, requestID string, payload T) []byte {
	body, _ := json.Marshal(protocolv2.Event[T]{
		Event:     name,
		RequestID: requestID,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Payload:   payload,
	})
	return body
}

func errorEventJSON(code, message, requestID string) []byte {
	return eventJSON("error", requestID, protocolv2.ErrorPayload{
		Code:    code,
		Message: message,
	})
}

func discardBufferedInput(r *bufio.ReadWriter) error {
	if r.Reader.Buffered() == 0 {
		return nil
	}
	_, err := io.CopyN(io.Discard, r, int64(r.Reader.Buffered()))
	return err
}
