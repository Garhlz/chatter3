# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Chatter3 is a ground-up rewrite of a chat system: Go backend (`backend-go/`) replacing a Java server, and a Tauri + React + Vite desktop client (`frontend/`) replacing a Qt C++ client. The old `server/` and `client/` directories are frozen for historical reference only. The current protocol (`docs/protocol-v2.md`) uses HTTP+JSON for auth and history, and WebSocket+JSON for real-time events. The old TCP+JSON+newline protocol (`docs/protocol-v1.md`) is historical.

Design rule: the Tauri Rust shell (`frontend/src-tauri/`) is a thin desktop wrapper — it provides native capabilities (file dialogs, windowing) but must NOT contain chat protocol logic, HTTP/WS orchestration, or message state management. All chat logic lives in the web layer and Go backend.

## Build and run commands

### Backend (Go)

```bash
cd backend-go

# Start PostgreSQL (Docker)
docker compose up -d postgres

# Run migrations (only after new migrations are added)
set -a; source .env; set +a
goose -dir migrations postgres "$DATABASE_URL" up

# Run the server
go run ./cmd/server
```

### Frontend (React + Vite)

```bash
cd frontend
cp .env.example .env        # first time only
npm install                  # first time only
npm run dev                  # starts Vite dev server on :1420, proxies /api to backend
npm run typecheck            # TypeScript check only
npm run build                # full typecheck + production build
npm run tauri:dev            # desktop shell (requires graphical environment)
cargo check --manifest-path frontend/src-tauri/Cargo.toml  # Rust shell check (no GUI needed)
```

### Testing

```bash
# Backend unit tests (no Docker needed)
cd backend-go && go test ./...

# Backend integration tests (requires Docker PostgreSQL + migrations run first)
cd backend-go
set -a; source .env; set +a
CHATTER_TEST_DATABASE_URL="$DATABASE_URL" go test ./internal/service -run Integration
CHATTER_TEST_DATABASE_URL="$DATABASE_URL" go test ./internal/transport/http -run Integration

# Run a single Go test
cd backend-go && go test ./internal/auth -run TestJWT
```

## Architecture: backend layers

The Go backend follows a strict layering discipline. Layers must not be skipped:

```
transport/http  — HTTP handlers, middleware, WebSocket upgrade (NO business logic)
     ↓
service/        — business rules, input validation, error semantics
     ↓
repository/     — database queries (hand-written SQL via pgx)
     ↓
storage/        — pgxpool initialization only
```

Supporting packages:

- `internal/auth/` — JWT creation/validation, bcrypt password hashing. Used by transport and service layers, not called directly by handlers.
- `internal/config/` — loads from `.env` via godotenv; existing env vars override `.env` values.
- `internal/protocol/` — shared types (`v2/types.go`) and JSON codec (`codec.go`) for the v2 protocol event/message structures.
- `internal/dispatcher/` — routes inbound parsed events to the right service handler.
- `internal/session/` — tracks online connections per user; enforces one-connection-per-user (replaces old on reconnect); drives presence events.

The entry point is `cmd/server/main.go`, which wires config → db pool → session manager → dispatcher → HTTP server + legacy TCP server.

## Architecture: frontend layers

```
components/     — React UI panels (Auth, Identity, ConversationList, Chat, Composer, etc.)
     ↓ reads/writes
store/          — zustand store (chatStore.ts): auth, conversations, messages, realtime state
     ↑ driven by
api/client.ts   — HTTP client for /api/v2/* endpoints
realtime/client.ts — WebSocket client: connect, reconnect, heartbeat, event dispatch
hooks/          — useKeyboardShortcuts (centralized keybindings)
```

Key frontend state patterns:
- Messages are inserted optimistically into the local cache, then confirmed when the server echoes back the message event. Confirmation uses `requestId` matching first, falling back to same-sender/same-content/near-time heuristics.
- `unauthorized` from HTTP or WebSocket expires the local session and forces re-login.
- Conversation list is derived client-side from cached messages, not fetched from a server endpoint.
- Each conversation retains its own scroll position.

## Protocol stability boundaries

**Stable** (safe to build against): auth (register/login), public/private/group chat history, online users, WebSocket handshake, session ping/pong, presence online/offline, public/private/group text messaging, text message validation rules, error codes, group creation and member management, file upload/download HTTP endpoints, file message real-time events.

**Unstable / not yet implemented**: group file upload (backend upload API lacks groupID parameter), group deletion (backed not yet wired), read receipts, message recall, multi-device sync.

## Commit conventions

From AGENT.MD — use Conventional Commits with explicit scopes:

```
feat(frontend): short summary
feat(protocol-v2): short summary
fix(tauri): short summary
refactor(backend-go): short summary
docs(dev-architecture): short summary
chore(nix): short summary
```

Commit bodies use Markdown bullet lists describing what was done, why, impact scope, and any deferred items.

## Code style notes

- Backend log messages and comments are in Chinese. This is intentional and consistent across the Go codebase.
- Tauri-related code needs more explanatory comments than usual (the user is learning Tauri). Comments should explain not just what code does, but why — especially at the Tauri/Web boundary, HTTP vs WebSocket responsibilities, and connection/state management.
