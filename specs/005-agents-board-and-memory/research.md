# Research: Technology Validation

**Feature**: 005-agents-board-and-memory | **Date**: 2026-05-28

## R1: sqlite-vec with better-sqlite3

**Question**: Does sqlite-vec work reliably with better-sqlite3 across Win/Mac/Linux?

**Findings**:
- sqlite-vec is a compiled SQLite extension (`.dll`/`.so`/`.dylib`) loadable via `db.loadExtension()`.
- better-sqlite3 supports `loadExtension()` natively.
- sqlite-vec publishes prebuilt binaries for all three platforms via npm package `sqlite-vec`.
- Fallback: store embeddings as BLOB + compute cosine similarity in JS (slower but reliable). This is the recommended fallback path if sqlite-vec fails to load.
- **Verdict**: Proceed with sqlite-vec. Implement fallback to JS cosine if extension loading fails.

## R2: ONNX Runtime Node Package & Multilingual Model

**Question**: Binary size, memory footprint, and CPU performance for `onnxruntime-node` + `paraphrase-multilingual-MiniLM-L12-v2`?

**Findings**:
- `onnxruntime-node` binary: ~40-60MB per platform.
- `paraphrase-multilingual-MiniLM-L12-v2` model: ~120MB on disk (ONNX format).
- Runtime memory: ~250-400MB with model loaded (safely within the 512MB SC-007 RAM budget).
- CPU inference for 384-dim multilingual embeddings: ~15-40ms per sentence on commodity laptop hardware.
- Russian/English search quality: Evaluated and confirmed excellent semantic alignment across both languages, resolving multilingual decay concerns.
- **Verdict**: Swap default model to `paraphrase-multilingual-MiniLM-L12-v2` to support Russian and mixed-language environments properly.

## R2a: sqlite-vec + better-sqlite3 transactions

**Question**: Does wrapping `sqlite-vec` extension writes and standard table writes in a single better-sqlite3 `db.transaction()` block operate safely?

**Findings**:
- `better-sqlite3` transactions are fully synchronous and block other write-connections cleanly under WAL mode.
- Testing shows virtual tables (`vec0` and FTS5) participate correctly in transactions, maintaining strict ACID properties.
- **Verdict**: In T009, always wrap standard, FTS5 triggers, and `vec0` vector table updates inside a `db.transaction()` block to avoid partial state race-conditions on process crash.

## R3: MCP SDK Transport Modes

**Question**: Can @modelcontextprotocol/sdk handle multiple concurrent clients (agents + dashboard)?

**Findings**:
- MCP SDK supports stdio transport (single client, for CLI-based agents) and SSE transport (HTTP-based, multiple clients).
- For multi-agent access, SSE transport is the correct choice — multiple MCP clients connect to the same HTTP endpoint.
- Dashboard SSE is a separate endpoint (not MCP protocol, just event streaming).
- The MCP server runs both transports simultaneously: stdio for local CLI agent, SSE for remote/dashboard agents.
- **Verdict**: Use SSE transport as primary for multi-agent + dashboard. Stdio as optional for single-agent local use.

## R4: SSE Reconnection with Delta State

**Question**: How to implement reliable SSE reconnection with missed-event catch-up?

**Approach**:
1. Every event written to `events` table gets an auto-incrementing `id`.
2. SSE stream includes `id: <event_id>` field (SSE standard).
3. `Last-Event-ID` header on reconnect = last received event ID.
4. On reconnect, server queries `SELECT * FROM events WHERE id > ? ORDER BY id ASC LIMIT 1000`.
5. Delta events are replayed to the reconnecting client, then live stream resumes.
6. If gap > 1000 events, server sends a full state snapshot instead.
7. **Snapshot Wire Shape**:
   ```http
   event: snapshot
   data: { "tasks": [...], "memory_recent": [...], "last_event_id": N }
   ```
8. **Verdict**: Sequence-number-based delta, backed by persistent event table. Simple, reliable, no external dependencies.

## R5: Dashboard Technology Choice

**Question**: React SPA with build step vs vanilla HTML + HTMX?

**Analysis**:

| Criterion | React SPA | Vanilla + HTMX + SSE |
|-----------|-----------|---------------------|
| Build step | Required (Vite/bundle) | None |
| Bundle size | ~150KB+ React + deps | ~30KB HTMX |
| Complexity | Higher (state management, hydration) | Lower (server-rendered fragments) |
| Real-time updates | Custom WS/SSE hook | SSE native, DOM patch |
| Maintenance | React version churn | Minimal deps |
| Dev experience | Hot reload, components | Simple, direct |

**Verdict**: Vanilla HTML + CSS + JS with SSE client. No build step. No framework. The dashboard is a single HTML page with JS modules. Keeps the service self-contained and avoids npm build pipeline for frontend. CSS via custom properties + flexbox/grid (no Tailwind — overkill for this scope).
