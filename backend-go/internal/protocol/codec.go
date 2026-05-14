package protocol

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"time"
)

const (
	maxMessageBytes = 10000
)

// Encoder 将 Envelope 编码为换行分隔的 JSON 并写入 writer。
type Encoder struct {
	w io.Writer
}

func NewEncoder(w io.Writer) *Encoder {
	return &Encoder{w: w}
}

// Encode 序列化消息并追加 '\n'，线程安全由调用方保证。
func (e *Encoder) Encode(env *Envelope) error {
	if env.Timestamp == "" {
		env.Timestamp = time.Now().Format(time.RFC3339)
	}
	b, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("序列化消息失败: %w", err)
	}
	b = append(b, '\n')
	_, err = e.w.Write(b)
	return err
}

// Decoder 从换行分隔的流中逐行解析 Envelope。
type Decoder struct {
	scanner *bufio.Scanner
}

func NewDecoder(r io.Reader) *Decoder {
	s := bufio.NewScanner(r)
	s.Buffer(make([]byte, maxMessageBytes+1), maxMessageBytes+1)
	return &Decoder{scanner: s}
}

// Decode 读取下一行并反序列化为 Envelope。
// 返回 io.EOF 表示连接已关闭。
func (d *Decoder) Decode() (*Envelope, error) {
	if !d.scanner.Scan() {
		if err := d.scanner.Err(); err != nil {
			return nil, err
		}
		return nil, io.EOF
	}
	line := d.scanner.Bytes()
	if len(line) > maxMessageBytes {
		return nil, fmt.Errorf("消息长度超过限制（%d 字节）", maxMessageBytes)
	}
	var env Envelope
	if err := json.Unmarshal(line, &env); err != nil {
		return nil, fmt.Errorf("消息格式错误: %w", err)
	}
	return &env, nil
}

// ErrorEnvelope 构造标准错误响应。
func ErrorEnvelope(msg string) *Envelope {
	return &Envelope{
		Type:         TypeError,
		Status:       "error",
		ErrorMessage: msg,
		Timestamp:    time.Now().Format(time.RFC3339),
	}
}
