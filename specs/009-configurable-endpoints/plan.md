# Implementation Plan: Configurable Endpoints and API Keys for Underboard

**Branch**: `009-configurable-endpoints` | **Date**: 2026-06-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-configurable-endpoints/spec.md`

## Summary

The goal of this feature is to make Underboard's dependencies (Honcho, embedding models, LLM backend, SQLite database path) configurable through a unified priority tree: CLI options > Environment variables (and `.env` files) > `config.json` file settings > Default values. If the embedding model path is not configured, semantic recall is disabled (`embedding_status: "disabled"`), logging a warning to `stderr` rather than failing startup; if the path is set but the file is missing, status is `"failed"` (same degraded behavior, distinct error signal). Sensitive credentials are redacted as `***` in startup config echo, log output, and `process.env` dumps; `config.json` containing secrets is created with `0600` permissions. If Honcho requests exceed the configured timeout, `memory_recall` degrades to local FTS5 lexical fallback and `memory_write` succeeds locally with `synced: false` flag (enqueued for sync) — neither crashes the server. Degradation warnings are rate-limited to prevent log flooding. `memory_recall` response includes `embedding_status` field per FR-010 for programmatic degradation detection. Existing `config.json` files are migrated on upgrade to include new keys (FR-011).

## Technical Context

**Language/Version**: Node.js >= 20, TypeScript 5.7+  
**Primary Dependencies**: c12 v2, commander v13, better-sqlite3, consola, @modelcontextprotocol/sdk  
**Storage**: SQLite (better-sqlite3) for task board, memory, and sync queues  
**Testing**: Vitest  
**Target Platform**: Windows/macOS/Linux  
**Project Type**: Local-first MCP server / CLI  
**Performance Goals**: Configuration resolution in <10ms, startup in <150ms  
**Constraints**: STDIO mode must log all config check warnings and startup messages to `stderr` to prevent corrupting the MCP stream. Secrets (`honcho.token`, `llm.api_key`) must be redacted in all output including `process.env` dumps. `config.json` with secrets created with `0600` permissions. Degradation warnings rate-limited (max 1 per 5 min per op type). `embedding_status ∈ {active, disabled, failed}` — `disabled` (path unset) vs `failed` (path set, file missing/error) are distinct states. `LLM_ENDPOINT` is a base URL; client appends `/chat/completions`.  
**Scale/Scope**: Impacts `packages/underboard/src/cli/` (config loader, CLI parser), `packages/underboard/src/server/` (HTTP/MCP startup), `packages/underboard/src/embedding/` (initialization path, status enum), `packages/underboard/src/memory-backend/` (Honcho timeout handling, write fallback), `packages/underboard/src/tools/memory/` (recall response shape, write `synced` flag).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I: Source of Truth**: PASS. No hand-edits to auto-generated files under `.claude/` or `.gemini/`.
- **Principle IV: SemVer**: PASS. No manual version bumping. Version remains 0.1.0 and will be bumped via `/bump`.
- **Principle VI: Cross-AI Review**: PASS. Planning branch only, implementation gate will be checked after review.
- **Principle VII: Artifact Versioning**: PASS. Snapshot tagging will be executed.
- **Principle IX: Two-Phase Review**: PASS. Planning branch `specs/009-configurable-endpoints` contains only spec artifacts. Task T000 explicitly creates implementation branch `009-configurable-endpoints` from `main` before any code edit.

## Project Structure

### Documentation (this feature)

```text
specs/009-configurable-endpoints/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
packages/underboard/
src/
├── cli/
│   ├── config.ts        # Schema updates + config loader logic
│   └── index.ts         # Start command CLI options mapping
├── server/
│   ├── http-server.ts   # Server boot & passing config to services
│   └── mcp-server.ts    # MCP server initialization
├── embedding/
│   └── embedding-service.ts # Model loading checks
└── memory-backend/
    ├── backend-factory.ts # Inject config endpoint/token/timeout
    └── honcho-client.ts   # Graceful timeout/outage handling
```

**Structure Decision**: Single project layout matching existing underboard workspace package. Real directories under `packages/underboard/src`.

## Complexity Tracking

No constitution check violations.
