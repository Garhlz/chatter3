# Chatter3 Project TODO

This root TODO is only for project-level navigation and shared cross-cutting work.

Active execution queues live here:

- Frontend: [frontend/TODO.md](frontend/TODO.md)
- Backend: [backend-go/TODO.md](backend-go/TODO.md)
- Architecture context: [docs/dev-architecture.md](docs/dev-architecture.md)
- Current protocol: [docs/protocol-v2.md](docs/protocol-v2.md)

## Current Status

- Current stack: Go backend + Tauri/React/Vite desktop client.
- Legacy `client/` and `server/` are frozen as historical reference.
- Stable contract: auth, history, online users, WebSocket session, public/private/group text messages, file upload/download, and file message events.
- Unstable or missing contract: group file upload, group deletion, read receipts, recall, and multi-device sync.

## Shared TODO

- [ ] Add frontend/backend protocol-v2 integration samples.
- [ ] Decide whether advanced group features should stay in protocol-v2 or move to v2.1/v3.
- [ ] Define read receipt, recall, and multi-device sync protocol boundaries before either side implements UI or backend storage.
- [ ] Decide whether Tauri should eventually own HTTP/WebSocket connection lifecycle, or whether the current Web-layer realtime client remains the long-term owner.

## Historical Notes

The older phase roadmap has been retired because P0-P3, file transfer, group chat, and the main backend testing pass are complete. Use the child TODO files for active work.

Historical references remain useful when comparing behavior:

- Old protocol archaeology: [docs/protocol-v1.md](docs/protocol-v1.md)
- Old Qt client: [client/](client/)
- Old Java server: [server/](server/)
