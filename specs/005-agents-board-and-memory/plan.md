# Implementation Plan: Agent Task Board + Shared Memory Service

**Branch**: `specs/005-agents-board-and-memory` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/005-agents-board-and-memory/spec.md`

## Summary

A local-first MCP tool server that gives AI coding agents (Claude Code, Cursor, Codex, Gemini CLI, Hermes, etc.) a shared persistent task board and semantic memory store. Exposed as an MCP-compliant tool server so any agent can read/write. Includes a web dashboard for the human operator. Cross-project by storage, project-scoped by default at retrieval. Zero cloud dependency.

**Technical approach**: Node.js/TypeScript MCP server using SQLite (better-sqlite3 + sqlite-vec + FTS5) for durable storage, ONNX Runtime with `paraphrase-multilingual-MiniLM-L12-v2` for local multilingual embeddings, SSE for real-time dashboard push, and a static vanilla HTML/CSS/JS dashboard (secured with DOMPurify) served by the same process. Hybrid retrieval fuses BM25 lexical + cosine semantic scores.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on Node.js 20+ LTS
**Primary Dependencies**: @modelcontextprotocol/sdk, better-sqlite3, sqlite-vec, onnxruntime-node, commander, c12, dompurify, jsdom (for server-side sanitization)
**Storage**: SQLite (single file, better-sqlite3 driver) + sqlite-vec for vectors + FTS5 for lexical
**Testing**: vitest (consistent with existing packages/cli/)
**Target Platform**: Windows / macOS / Linux developer machine (binds exclusively to `127.0.0.1` by default)
**Project Type**: Standalone MCP server + CLI + static web dashboard (separate npm package `packages/underboard/`)
**Performance Goals**: <500ms p95 recall at 10k entries, <1s p95 write, <500ms p95 dashboard SSE push
**Constraints**: <512MB idle with model loaded (model footprint ~120MB, RAM use ~250-400MB), <64MB without model, offline-first after one-time initial download, no GPU required
**Scale/Scope**: Single user, single machine, ~10k entries across projects
**MCP Transport Version**: HTTP+SSE transport pinned to the 2024-11-05 SSE specification (dual `/mcp/sse` and `/mcp/messages` routes).
**Client CWD Injection**: Agents pass working directory and metadata on MCP `initialize` inside `clientInfo.cwd` (or custom extension fields) or via `X-Agent-CWD` / `X-Agent-Name` headers during SSE connection.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Source of Truth | PASS | New package, no `.claude/` template edits |
| II. Transformer, Not Fork | PASS | New package, not a new transpile target |
| III. Protected Slots | N/A | No managed files involved |
| IV. SemVer 0.x | PASS | Will start at 0.1.0, bump via `/bump` |
| V. Token Economy | PASS | Justified by spec — significant new capability |
| VI. Cross-AI Review Gate | N/A | Plan stage, not implement |
| VII. Artifact Versioning | PASS | Will snapshot via `snapshot-stage.ps1` |
| VIII. Self-Maintaining Knowledge | PASS | New feature, patterns to capture later |
| IX. Two-Phase Review | PASS | On `specs/005-agents-board-and-memory` branch |

No violations. No complexity tracking required.

## Project Structure

### Documentation (this feature)

```text
specs/005-agents-board-and-memory/
├── spec.md              # Feature specification (done)
├── plan.md              # This file
├── research.md          # Technology evaluation
├── data-model.md        # Schema + indexes + constraints
├── quickstart.md        # Dev setup + run guide
├── contracts/           # MCP tool contracts
│   ├── memory-tools.md  # Memory subsystem tool APIs
│   └── task-tools.md    # Task board tool APIs
└── tasks.md             # Phase 2 output (not created yet)
```

### Source Code (repository root)

```text
packages/underboard/
├── src/
│   ├── index.ts                 # Entry point
│   ├── cli/
│   │   ├── index.ts             # Commander CLI (start/stop/status/export/import/tasks-delete)
│   │   └── config.ts            # Config loader (c12, consistent with packages/cli/)
│   ├── server/
│   │   ├── mcp-server.ts        # MCP server setup (stdio + SSE transport) + tool registration
│   │   └── http-server.ts       # HTTP server (dashboard + SSE + health)
│   ├── storage/
│   │   ├── database.ts          # SQLite connection + migrations
│   │   ├── project-store.ts     # Project CRUD
│   │   ├── task-store.ts        # Task CRUD + queries
│   │   ├── memory-store.ts      # Memory CRUD + dedup + FTS + vector
│   │   └── event-store.ts       # Event persistence
│   ├── embedding/
│   │   ├── embedding-service.ts # ONNX Runtime wrapper + model download
│   │   └── model-downloader.ts  # Auto-download + cache model files
│   ├── retrieval/
│   │   ├── hybrid-retrieval.ts  # BM25 + vector score fusion
│   │   ├── lexical.ts           # FTS5 query builder
│   │   └── semantic.ts          # sqlite-vec query builder
│   ├── project/
│   │   └── detector.ts          # CWD → project ID resolution
│   ├── events/
│   │   └── event-bus.ts         # In-process pub/sub for SSE
│   └── tools/
│       ├── memory/
│       │   ├── write.ts          # memory_write tool
│       │   ├── recall.ts         # memory_recall tool (project-scoped)
│       │   ├── recall-cross.ts   # memory_recall_cross_project tool
│       │   ├── list-recent.ts    # memory_list_recent tool
│       │   └── delete.ts         # memory_delete tool
│       └── tasks/
│           ├── create.ts         # task_create tool
│           ├── update.ts         # task_update tool
│           ├── list.ts           # task_list tool
│           ├── list-assigned.ts  # task_list_assigned tool
│           ├── archive.ts        # task_archive tool
│           └── activity-log.ts   # activity_log_start/emit/get tools
├── tests/
│   ├── unit/
│   │   ├── project-detector.test.ts
│   │   ├── memory-store.test.ts
│   │   ├── task-store.test.ts
│   │   ├── embedding-service.test.ts
│   │   └── hybrid-retrieval.test.ts
│   ├── integration/
│   │   ├── mcp-tools.test.ts
│   │   ├── dashboard-sse.test.ts
│   │   ├── export-import.test.ts
│   │   └── lifecycle.test.ts
│   └── fixtures/
│       └── test-db.ts            # Test DB helpers
├── dashboard/                    # Dashboard source (HTML/CSS/JS)
│   ├── index.html
│   ├── styles.css
│   ├── app.js                    # Main SPA logic
│   ├── components/
│   │   ├── board.js              # Kanban board component
│   │   ├── memory-feed.js        # Recent memory sidebar
│   │   ├── activity-log.js       # Activity log panel
│   │   └── filters.js            # Project/assignee/status filters
│   └── lib/
│       ├── sse-client.js         # SSE reconnect client
│       └── api.js                # HTTP API client
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

**Structure Decision**: New standalone package `packages/underboard/` in the existing monorepo. Independent versioning from `packages/cli/`. Follows the "separate package" requirement from the spec. Reuses monorepo infrastructure (shared tsconfig base patterns, vitest) but is independently installable.

## Implementation Phases

### Phase 0: Research

Resolve technology choices requiring validation before design locks:

1. **sqlite-vec vs custom vector search**: Confirm sqlite-vec works reliably with better-sqlite3 on all three platforms (Win/Mac/Linux). Fallback: store vectors as BLOB + compute cosine in JS.
2. **ONNX Runtime node package size**: Verify onnxruntime-node binary size across platforms. Confirm `paraphrase-multilingual-MiniLM-L12-v2` runs comfortably under the RAM budget (~250-400MB RAM, model size ~120MB on disk).
3. **MCP SDK transport modes**: Validate stdio + SSE transport in @modelcontextprotocol/sdk for multi-client (multiple agents + dashboard simultaneously).
4. **SSE reconnection with delta**: Design the delta-state mechanism for dashboard reconnect (sequence numbers per event, client sends last-received-seq on reconnect).
5. **sqlite-vec in transactions (R2a)**: Validate that `db.transaction()` in `better-sqlite3` successfully wraps operations spanning standard SQLite tables, FTS5 virtual tables, and sqlite-vec (`vec0`) virtual tables without locks or crashes.
6. **SSE Backpressure & Buffer cap**: Design EventSource write queue checks; drop connections for slow or suspended consumers if buffer exceeds 1MB, pushing a full-snapshot code on reconnect.

### Phase 1: Design Artifacts

Generated in this plan:
- `data-model.md` — complete SQLite schema, indexes, constraints
- `contracts/memory-tools.md` — MCP tool signatures for memory subsystem
- `contracts/task-tools.md` — MCP tool signatures for task board subsystem
- `quickstart.md` — developer setup and first-run guide

### Phase 1.1: Architecture Updates

Update specs/main/architecture.md with:
- New package `packages/underboard/` in §5
- New data flow: MCP agents → server → SQLite → SSE → Dashboard
- New source-of-truth entry for the service

### Post-Design Constitution Re-check

No new violations introduced by Phase 1 design. All gates still PASS.

## Complexity Tracking

No violations to track.
