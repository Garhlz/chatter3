# CLAUDE.md

This file is the Claude Code entry point for this repository. Keep it short and accurate; deeper context lives in the linked docs.

## Project Shape

Chatter3 is a rewrite of an older chat system:

- `backend-go/`: Go backend for the current `protocol-v2`.
- `frontend/`: Tauri + React + Vite desktop client.
- `client/` and `server/`: frozen legacy Qt/C++ and Java references.
- `docs/protocol-v1.md`: historical TCP + JSON + newline protocol.
- `docs/protocol-v2.md`: current HTTP + JSON and WebSocket + JSON contract.

Current stable frontend/backend contract: auth, history, online users, WebSocket session, public/private/group text messages, file upload/download, file message events, group detail/member/history access with member-only visibility, transactional group membership writes, and user profile read/update.

Current unstable or missing contract: group file upload, group deletion, read receipts, recall, and multi-device sync.

## Source Of Truth

- Frontend execution: `frontend/TODO.md`
- Backend execution: `backend-go/TODO.md`
- Architecture map: `docs/dev-architecture.md`
- Protocol contract: `docs/protocol-v2.md`
- Collaboration and commit preferences: `AGENT.md`

The root `TODO.md` is only a high-level project navigation and archive. Do not treat it as the active execution queue.

## Common Commands

Backend:

```bash
cd backend-go
docker compose up -d postgres
set -a; source .env; set +a
goose -dir migrations postgres "$DATABASE_URL" up
sqlc generate -f sqlc.yaml
go run ./cmd/server
go test ./...
```

Frontend:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
npm run typecheck
npm run build
npm run tauri:dev
cargo check --manifest-path src-tauri/Cargo.toml
```

Backend integration tests require PostgreSQL and migrations:

```bash
cd backend-go
set -a; source .env; set +a
CHATTER_TEST_DATABASE_URL="$DATABASE_URL" go test ./internal/service -run Integration
CHATTER_TEST_DATABASE_URL="$DATABASE_URL" go test ./internal/transport/http -run Integration
```

## Architecture Notes

Backend layering must stay strict:

```text
transport/http  -> HTTP handlers, middleware, WebSocket upgrade
service/        -> business rules, validation, error semantics
repository/     -> database access via sqlc-generated code
storage/        -> pgxpool initialization
```

Frontend layering:

```text
components/         -> React panels
store/              -> zustand state and actions
api/client.ts       -> browser HTTP client
realtime/client.ts  -> browser WebSocket client
desktop.ts          -> Tauri/browser bridge
hooks/              -> shared UI hooks
```

The Tauri Rust layer handles tray, single-instance activation, notifications, window state, store/keyring integration, local message persistence via SQLite, and the desktop-side HTTP/WS clients. The JS layer accesses these through `frontend/src/desktop.ts`, which delegates to Tauri invoke in desktop mode and falls back to browser HTTP/WS clients in dev mode.

Token storage is OS credential-store backed in Tauri through the Rust `keyring` crate. This maps to Windows Credential Manager, macOS Keychain, and Linux Secret Service / libsecret. Browser dev still uses `localStorage`.

Language and theme preferences are persisted through the desktop abstraction: Tauri uses `tauri-plugin-store`, while browser dev uses `localStorage`.

Local chat messages are persisted to SQLite in Tauri and to localStorage snapshots in browser dev fallback. On startup, the frontend loads local messages first for instant display, then refreshes public history, online users, and groups from the server.

## Frontend UI State

The current UI direction is Workbench-style, with:

- Default Chinese UI and optional English mode.
- Day theme based on a warmer Catppuccin Latte palette.
- Night theme based on One Dark.
- Theme mode defaults to `system` and can be manually set to day or night.
- Page-level global feedback for notice/error/auth-expired state.
- A topbar + sidebar + main-stage layout, with mobile sidebar toggle support.
- A profile modal that doubles as the main identity and "start chat" entry point.
- Group conversations split into a message area plus a stable group info panel.
- Conversation cards distinguish public/private/group scope and support empty private shells.

## Working Rules

- Follow `AGENT.md` for commit message style and explanatory comments.
- Prefer Web UI validation through Vite in remote Linux environments.
- Run `npm run typecheck` and `npm run build` for frontend changes.
- Run relevant Go tests for backend changes.
- Do not update legacy `client/` or `server/` unless the task is explicitly about historical reference.
