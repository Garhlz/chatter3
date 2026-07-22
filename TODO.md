# Chatter3 Project TODO

This root TODO is only for project-level navigation and shared cross-cutting work.

Active execution queues live here:

- Frontend: [frontend/TODO.md](frontend/TODO.md)
- Backend: [backend-go/TODO.md](backend-go/TODO.md)
- Architecture context: [docs/dev-architecture.md](docs/dev-architecture.md)
- Current protocol: [docs/protocol-v2.md](docs/protocol-v2.md)

## Current Status

- Current stack: Go backend + Tauri/React/Vite desktop client.
- Legacy Qt/C++ and Java source trees have been removed; protocol-v1 remains as the historical contract reference.
- Stable contract: auth, history, online users, multi-connection WebSocket sessions, public/private/group text and file messages, profile media, and realtime navigation/profile updates.
- Unstable or missing contract: group deletion, read receipts, recall, and cross-device read-state sync.

## Shared TODO

- [ ] Add frontend/backend protocol-v2 integration samples.
- [ ] Decide whether advanced group features should stay in protocol-v2 or move to v2.1/v3.
- [ ] Define read receipt, recall, and cross-device read-state sync boundaries before either side implements UI or backend storage.
- [x] Define profile media storage and update contracts for avatars and personal-space backgrounds.
- [x] Use the Tauri Rust HTTP/WebSocket client in desktop mode while keeping browser clients as the Vite development fallback.

## Historical Notes

The older phase roadmap has been retired because P0-P3, file transfer, group chat, and the main backend testing pass are complete. Use the child TODO files for active work.

The historical protocol remains useful when comparing behavior:

- Old protocol archaeology: [docs/protocol-v1.md](docs/protocol-v1.md)
