package http

import (
	"encoding/binary"
	"errors"
	"net"
	"testing"
)

func TestReadFrameRejectsOversizedPayloadBeforeAllocation(t *testing.T) {
	serverConn, clientConn := net.Pipe()
	defer serverConn.Close()
	defer clientConn.Close()

	writeDone := make(chan error, 1)
	go func() {
		// FIN + text opcode, followed by a masked frame with a 64-bit payload length.
		// readFrame 应在读取 mask 和 payload 之前拒绝这个长度，因此测试无需真的
		// 构造一块超大消息体，也能覆盖“先校验、后分配”的安全边界。
		header := make([]byte, 10)
		header[0] = 0x80 | wsOpcodeText
		header[1] = 0x80 | 127
		binary.BigEndian.PutUint64(header[2:], uint64(maxWebSocketPayloadSize+1))
		_, err := clientConn.Write(header)
		writeDone <- err
	}()

	connection := &wsConn{conn: serverConn}
	_, _, err := connection.readFrame()
	if !errors.Is(err, errWebSocketPayloadTooLarge) {
		t.Fatalf("expected oversized payload error, got %v", err)
	}
	if err := <-writeDone; err != nil {
		t.Fatalf("write frame header: %v", err)
	}
}
