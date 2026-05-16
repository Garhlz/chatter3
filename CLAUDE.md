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

The Tauri Rust layer currently handles desktop capabilities: tray, single-instance activation, notifications, window state, dialog/opener/process/store plugins, and local message persistence via SQLite (rusqlite bundled). It also hosts HTTP and WebSocket protocol clients (api.rs, realtime.rs) using reqwest + tokio-tungstenite, exposing 13 HTTP commands and 3 WS commands to the frontend via Tauri invoke. The JS layer accesses these through a unified API (desktop.ts) that delegates to Tauri invoke in desktop mode and falls back to the original JS clients (api/client.ts, realtime/client.ts) for browser dev mode.

Token storage is OS credential-store backed in Tauri through the Rust `keyring` crate. This maps to Windows Credential Manager, macOS Keychain, and Linux Secret Service / libsecret. Browser dev still uses `localStorage`.

The Tauri path migrates legacy JWTs from the previous Tauri store or `localStorage` into the OS credential store and removes the old copies.

Language and theme preferences are persisted through the desktop abstraction: Tauri uses `tauri-plugin-store`, while browser dev uses `localStorage`.

Local chat messages are persisted to a SQLite database via `rusqlite` (bundled). The `db.rs` module exposes 7 Tauri commands (message insert/get/confirm/update-status, conversation upsert/get/update-unread) that the JS layer calls from `desktop.ts`. On startup, messages are loaded from SQLite for instant display before the HTTP history refresh; on each realtime message or send, a single row is inserted. Browser dev mode falls back to localStorage JSON blobs.

Single-instance activation is implemented: repeat launches focus the existing main window instead of creating a second desktop session.

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
