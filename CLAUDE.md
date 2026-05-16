# CLAUDE.md

This file is the Claude Code entry point for this repository. Keep it short and accurate; deeper context lives in the linked docs.

## Project Shape

Chatter3 is a rewrite of an older chat system:

- `backend-go/`: Go backend for the current `protocol-v2`.
- `frontend/`: Tauri + React + Vite desktop client.
- `client/` and `server/`: frozen legacy Qt/C++ and Java references.
- `docs/protocol-v1.md`: historical TCP + JSON + newline protocol.
- `docs/protocol-v2.md`: current HTTP + JSON and WebSocket + JSON contract.

Current stable frontend/backend contract: auth, history, online users, WebSocket session, public/private/group text messages, file upload/download, and file message events.

Current unstable or missing contract: group file upload, group deletion, read receipts, recall, and multi-device sync.

## Source Of Truth

- Frontend execution: `frontend/TODO.md`
- Backend execution: `backend-go/TODO.md`
- Architecture map: `docs/dev-architecture.md`
- Protocol contract: `docs/protocol-v2.md`
- Collaboration and commit preferences: `AGENT.MD`

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
api/client.ts       -> HTTP client
realtime/client.ts  -> WebSocket client
hooks/              -> shared UI hooks
```

The Tauri Rust layer currently handles desktop capabilities: tray, notifications, window state, dialog/opener/process/store plugins. It does not currently own the HTTP/WebSocket chat protocol.

Token storage is not OS keychain-backed yet. In Tauri it uses `tauri-plugin-store` and mirrors into `localStorage`; browser dev uses `localStorage`.

Single-instance activation is not implemented yet.

## Frontend UI State

The current UI direction is Workbench-style, with:

- Default Chinese UI and optional English mode.
- Day theme based on a warmer Catppuccin Latte palette.
- Night theme based on One Dark.
- Theme mode defaults to `system` and can be manually set to day or night.
- Language and theme preferences are persisted in `localStorage`.

## Working Rules

- Follow `AGENT.MD` for commit message style and explanatory comments.
- Prefer Web UI validation through Vite in remote Linux environments.
- Run `npm run typecheck` and `npm run build` for frontend changes.
- Run relevant Go tests for backend changes.
- Do not update legacy `client/` or `server/` unless the task is explicitly about historical reference.
