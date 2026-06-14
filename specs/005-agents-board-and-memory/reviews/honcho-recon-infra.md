# Recon: Live Infrastructure Probe

**Reviewer**: honcho (Valera recon) | **Date**: 2026-06-13 | **Scope**: read-only GET requests + local file checks

## Summary

Honcho v3.0.9 runs on port 8083 (container internal 8000, mapped 8083→8000) backed by Postgres 16 with pgvector, Redis 7, and HuggingFace TEI embedding/rerank services. The API exposes 35+ endpoints under `/v3/` covering workspaces, peers, sessions, messages, conclusions, search, chat, dialectic, webhooks, and a dream scheduler. The underboard service is **not registered** in any MCP config (mcpconfig.json, opencode configs) — it is absent from the agent toolchain. The underboard SQLite DB exists at `~/.underboard/data.db` (4KB, minimal — likely just schema + global project row).

## Facts

### (1) Honcho API — Port, Title, Endpoints

**Port**: `localhost:8083` (container `infra-honcho-1`, image `ghcr.io/plastic-labs/honcho:v3.0.9`, mapping `0.0.0.0:8083->8080/tcp`). Internal uvicorn listens on 8000.

**Note**: Direct `curl.exe` from Windows host to `localhost:8083` hangs (IPv6 resolution issue — curl resolves `localhost` to `::1` first). Had to exec python from inside the container.

**API Title**: `Honcho API`
**API Version**: `3.0.9`
**Summary**: "The Identity Layer for the Agentic World"
**Description**: "Honcho is a platform for giving agents user-centric memory and social cognition."
**License**: AGPL-3.0-only
**OpenAPI spec**: 3.1.0

**Representative endpoint paths** (35 total):

| Method(s) | Path | Domain |
|-----------|------|--------|
| GET | `/health` | Health |
| POST | `/v3/workspaces` | Workspaces |
| POST | `/v3/workspaces/list` | Workspaces |
| PUT,DELETE | `/v3/workspaces/{workspace_id}` | Workspaces |
| POST | `/v3/workspaces/{workspace_id}/search` | Search |
| GET | `/v3/workspaces/{workspace_id}/queue/status` | Queue |
| POST | `/v3/workspaces/{workspace_id}/schedule_dream` | Dream |
| POST | `/v3/workspaces/{workspace_id}/peers` | Peers |
| POST | `/v3/workspaces/{workspace_id}/peers/list` | Peers |
| GET,PUT | `/v3/workspaces/{workspace_id}/peers/{peer_id}/card` | Peers |
| POST | `/v3/workspaces/{workspace_id}/peers/{peer_id}/chat` | **Chat (dialectic)** |
| GET | `/v3/workspaces/{workspace_id}/peers/{peer_id}/context` | Peers |
| POST | `/v3/workspaces/{workspace_id}/peers/{peer_id}/search` | Peer search |
| POST | `/v3/workspaces/{workspace_id}/peers/{peer_id}/representation` | Peers |
| POST | `/v3/workspaces/{workspace_id}/sessions` | Sessions |
| POST | `/v3/workspaces/{workspace_id}/sessions/list` | Sessions |
| GET,PUT,DELETE | `/v3/workspaces/{workspace_id}/sessions/{session_id}` | Sessions |
| POST | `/v3/workspaces/{workspace_id}/sessions/{session_id}/messages` | Messages |
| POST | `/v3/workspaces/{workspace_id}/sessions/{session_id}/messages/list` | Messages |
| POST | `/v3/workspaces/{workspace_id}/sessions/{session_id}/messages/upload` | Messages (file) |
| GET,PUT | `/v3/workspaces/{workspace_id}/sessions/{session_id}/messages/{message_id}` | Messages |
| POST,GET,PUT,DELETE | `/v3/workspaces/{workspace_id}/sessions/{session_id}/peers` | Session peers |
| GET,PUT | `/v3/workspaces/{workspace_id}/sessions/{session_id}/peers/{peer_id}/config` | Session peer config |
| GET | `/v3/workspaces/{workspace_id}/sessions/{session_id}/summaries` | Summaries |
| POST | `/v3/workspaces/{workspace_id}/sessions/{session_id}/search` | Session search |
| POST | `/v3/workspaces/{workspace_id}/conclusions` | Conclusions |
| POST | `/v3/workspaces/{workspace_id}/conclusions/list` | Conclusions |
| POST | `/v3/workspaces/{workspace_id}/conclusions/query` | Conclusions |
| POST,GET | `/v3/workspaces/{workspace_id}/webhooks` | Webhooks |

**Key schema names** (55 total): `DialecticOptions`, `DreamConfiguration`, `DreamType`, `Message`, `MessageCreate`, `MessageSearchOptions`, `Peer`, `PeerCardConfiguration`, `PeerCardResponse`, `PeerContext`, `Session`, `Conclusion`, `ConclusionBatchCreate`, `ConclusionQuery`, `Workspace`, `WorkspaceCreate`, `QueueStatus`, `WebhookEndpoint`.

### (2) Docker Infrastructure Stack

```
infra-honcho-1        ghcr.io/plastic-labs/honcho:v3.0.9            0.0.0.0:8083->8080/tcp
infra-postgres-1      pgvector/pgvector:pg16                        0.0.0.0:5432->5432/tcp
infra-redis-1         redis:7-alpine                                0.0.0.0:6379->6379/tcp
infra-tei-embed-1     ghcr.io/huggingface/text-embeddings-inference:cpu-1.9   0.0.0.0:8080->80/tcp
infra-tei-rerank-1    ghcr.io/huggingface/text-embeddings-inference:cpu-1.9   0.0.0.0:8081->80/tcp
infra-twin-engine-api-1  infra-twin-engine-api                      0.0.0.0:8090->8090/tcp
infra-document-worker-1  infra-document-worker                       (no exposed ports)
dvoiniki-redis-dev    redis:7-alpine                                0.0.0.0:6380->6379/tcp
dvoiniki-postgres-dev postgres:16-alpine                            0.0.0.0:5433->5432/tcp
hatchet-cli-hatchet-1 ghcr.io/hatchet-dev/hatchet/hatchet-lite:latest  0.0.0.0:7077->7077/tcp, 8888->8888/tcp
hatchet-cli-postgres-1 postgres:17                                   5432/tcp (internal only)
```

**Honcho backing store**: Postgres 16 with pgvector extension (`pgvector/pgvector:pg16`) — **yes, Honcho uses Postgres + pgvector for vector storage**, not SQLite.

**Additional infra**:
- Redis 7 (Honcho cache/queue) + separate Redis for dvoiniki
- TEI embedding service (port 8080) + TEI rerank service (port 8081) — HuggingFace text-embeddings-inference CPU
- `twin-engine-api` on 8090 — separate service
- `document-worker` — no exposed ports (internal worker)
- Hatchet (workflow engine) on 7077/8888 with its own Postgres 17

### (3) Underboard MCP Registration

**Result: NOT registered anywhere.**

- `mcpconfig.json` contains 4 servers: `sequential-thinking`, `context7`, `filesystem`, `terminal-controller` — **no underboard**.
- `opencode.json` / `opencode.jsonc`: no underboard references found.
- `rg` across the repo: "underboard" appears only in spec files, source code, and the package itself — never in any MCP configuration file.

**The underboard service is coded but not wired into any agent toolchain.**

### (4) Underboard DB Status

```
C:\Users\Admin\.underboard\data.db       4,096 bytes
C:\Users\Admin\.underboard\data.db-shm   32,768 bytes
C:\Users\Admin\.underboard\data.db-wal   12,392 bytes
C:\Users\Admin\.underboard\token            64 bytes
```

DB exists, 4KB main file (schema only — migration ran, minimal data). WAL mode active (shm + wal files present). Bearer token file exists (64 bytes = 64 hex chars for 32-byte token).

## Uncertainties

1. **Honcho host-to-container networking**: `curl.exe` from Windows hangs when hitting `localhost:8083` — curl resolves `localhost` to IPv6 `::1` first and connects but gets no response. Had to `docker exec` python inside the container. This may be an IPv6 issue in the Docker Desktop networking layer, or Honcho may not bind to IPv6 inside the container.

2. **TEI model identity**: Both `tei-embed` (8080) and `tei-rerank` (8081) use the same image (`text-embeddings-inference:cpu-1.9`) but presumably load different models at runtime. The specific embedding model (dimensions, vocab) is unknown — would need to query `GET /info` on each.

3. **twin-engine-api and document-worker**: These are custom-built images (`infra-twin-engine-api`, `infra-document-worker`) with no public registry path visible. Their relationship to Honcho is unclear — they may be part of the underhelpers ecosystem or separate services.

4. **Honcho auth**: All `/v3/` endpoints require `HTTPBearer` security. No API key was provided for this probe, so no data-level exploration was possible. The `/health` endpoint was not probed inside the container.

5. **Honcho "dream" and "dialectic"**: The API includes `schedule_dream`, `DialecticOptions`, `DreamConfiguration`, `DreamType` schemas — these appear to be Honcho's background processing and dialectic/conversation features. Their exact semantics would require reading Honcho docs or source code.

6. **Whether underboard was ever started**: The DB exists with schema only (4KB), suggesting it was started at least once (migration ran, global project seeded) but never received real data. No evidence of ongoing service — no process check was done (read-only scope).
