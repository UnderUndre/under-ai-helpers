# Implementation Plan: Multi-Model AI Orchestrator

**Branch**: `001-orchestrator` | **Date**: 2026-04-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-orchestrator/spec.md`

## Summary

Build a CLI tool + MCP server that orchestrates multiple AI coding assistants (Claude Code, Gemini CLI, Qwen Code, GitHub Copilot CLI) through a speckit pipeline (specify → review → plan → review → contracts → tasks → parallel implement → merge → validate). Each "worker" is a real CLI tool spawned as a child process with native file editing capabilities. Parallel implementation uses git worktrees for isolation with contract-first approach to prevent semantic conflicts.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22+ (LTS)
**Primary Dependencies**: `execa` v9 (child process spawning, NO native deps), `better-sqlite3` (embedded DB), `strip-ansi` (ANSI color removal) + custom cursor/spinner filter, `tree-kill` (process tree cleanup), `@modelcontextprotocol/sdk` (MCP server), `commander` (CLI framework), `yaml` (config parsing), `hono` (HTTP server for SSE/Web UI API), `eventemitter3` (typed EventBus for SSE)
**Storage**: SQLite (embedded, via better-sqlite3, WAL mode) — `~/.orch/orch.db` (global, runs tracked per project via `project_dir` column). WAL mode required for concurrent read (Web UI) + write (agents) without `database is locked` errors
**Testing**: Vitest (unit + integration), mock CLI tools for testing without real AI calls
**Target Platform**: Windows 11 (primary), Linux/macOS (secondary)
**Project Type**: CLI tool + MCP server + Web UI (monorepo)
**Performance Goals**: <500ms dry-run, <1s SSE latency, 5 parallel CLI processes
**Constraints**: Windows-first (execa, tree-kill, path handling), headless CLI spawning (`-p` flags), robust output filtering (ANSI colors + cursor movement + spinner redraws)
**Scale/Scope**: Single operator, 1-5 concurrent AI tool processes, SQLite sufficient for local storage

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is blank template — no project-specific gates defined. Proceeding with default engineering best practices from `.github/instructions/coding/copilot-instructions.md`:
- ✅ Zod validation on all inputs (CLI args, config parsing, task parsing)
- ✅ Structured error handling (AppError pattern, not raw throws)
- ✅ Typed inputs/outputs throughout
- ✅ No `as any`, no `console.log` (use structured logger)
- ✅ Parameterized queries for SQLite

## Project Structure

### Documentation (this feature)

```text
specs/001-orchestrator/
├── plan.md              # This file
├── research.md          # Phase 0: technical decisions
├── data-model.md        # Phase 1: SQLite schema + entities
├── quickstart.md        # Phase 1: setup + first run guide
├── contracts/           # Phase 1: internal interfaces
│   ├── tool-registry.ts # Tool configuration types
│   ├── run-engine.ts    # Pipeline/ensemble execution types
│   ├── mcp-server.ts    # MCP tool definitions
│   └── events.ts        # SSE event types
└── tasks.md             # Phase 2: task breakdown (/speckit.tasks)
```

### Source Code (repository root)

```text
package.json                   # Root: npm workspaces config
packages/orchestrator/
├── package.json
├── tsconfig.json
├── orch.config.example.yaml
├── src/
│   ├── index.ts              # CLI entry (commander)
│   ├── config/
│   │   ├── schema.ts         # Zod schemas for orch.config.yaml
│   │   └── loader.ts         # Config loader with validation
│   ├── registry/
│   │   ├── tool-registry.ts  # Tool management (CRUD, health check)
│   │   └── types.ts          # Tool, ToolMetrics types
│   ├── engine/
│   │   ├── pipeline.ts       # Sequential pipeline execution
│   │   ├── ensemble.ts       # Parallel ensemble execution
│   │   ├── contracts.ts      # Contract generation phase
│   │   ├── merger.ts         # Git merge + build validation
│   │   └── scheduler.ts      # Dependency graph → execution order
│   ├── process/
│   │   ├── spawner.ts        # execa v9 spawning (NO node-pty, NO native deps)
│   │   ├── output-filter.ts  # strip-ansi + cursor/spinner removal + semantic extraction
│   │   └── watchdog.ts       # Timeout + hang detection (no stdout for N seconds)
│   ├── events/
│   │   └── bus.ts            # Typed EventBus (eventemitter3) — engine emits, SSE/CLI consume
│   ├── worktree/
│   │   ├── manager.ts        # Create, symlink deps, cleanup, GC
│   │   └── scope-guard.ts    # Generate ORCHESTRATOR_INSTRUCTIONS.md, chmod contracts
│   ├── db/
│   │   ├── schema.sql        # SQLite DDL
│   │   ├── client.ts         # better-sqlite3 wrapper
│   │   ├── runs.ts           # Run CRUD
│   │   ├── stages.ts         # Stage CRUD
│   │   ├── tasks.ts          # Task CRUD
│   │   └── metrics.ts        # ToolMetrics aggregation
│   ├── mcp/
│   │   ├── server.ts         # MCP server (orch.run, orch.status, etc.)
│   │   └── tools.ts          # MCP tool definitions
│   ├── api/
│   │   ├── server.ts         # Hono HTTP server
│   │   ├── routes/
│   │   │   ├── runs.ts       # GET /api/runs, POST /api/runs
│   │   │   ├── events.ts     # GET /api/runs/:id/events (SSE)
│   │   │   └── tools.ts      # GET /api/tools
│   │   └── sse.ts            # SSE emitter helper
│   ├── parsers/
│   │   ├── tasks-parser.ts   # Parse tasks.md → Task[], dependency graph
│   │   └── review-parser.ts  # Parse APPROVE/REJECT from review output
│   └── utils/
│       ├── logger.ts         # Structured logger (pino)
│       ├── errors.ts         # AppError classes
│       └── git.ts            # Git operations (worktree, merge, branch)
├── tests/
│   ├── unit/
│   │   ├── config/
│   │   ├── engine/
│   │   ├── parsers/
│   │   └── worktree/
│   └── integration/
│       ├── pipeline.test.ts
│       └── ensemble.test.ts
└── web/                       # P2: Web UI (separate concern)
    ├── package.json
    ├── src/
    │   ├── App.tsx
    │   ├── components/
    │   │   ├── PipelineView.tsx
    │   │   ├── LaneProgress.tsx
    │   │   ├── DependencyGraph.tsx
    │   │   ├── RunHistory.tsx
    │   │   └── ToolLeaderboard.tsx  # P3
    │   ├── hooks/
    │   │   └── useSSE.ts
    │   └── lib/
    │       └── api.ts
    └── index.html
```

**Structure Decision**: npm workspaces monorepo — root `package.json` with `"workspaces": ["packages/orchestrator", "packages/orchestrator/web"]`. Core CLI + MCP + API in `packages/orchestrator`. React UI in `web/` subdirectory. Web is optional P2 deliverable.

**Config Strategy**: Global config at `~/.orch/config.yaml` (tool registry, API keys as env var refs). Per-project overrides via `./orch.config.yaml` in project root (pipeline assignments, build commands). Merged at runtime: local overrides global.

**DB Location**: `~/.orch/orch.db` (global). Runs are scoped to `project_dir` column. No project-local DB files to gitignore.

## Complexity Tracking

No constitution violations — no justifications needed.

## Phases Overview

| Phase | Deliverable | Dependencies |
|-------|-------------|-------------|
| Phase 0 | research.md | spec.md |
| Phase 1 | data-model.md, contracts/, quickstart.md | research.md |
| Phase 2 | tasks.md (via /speckit.tasks) | plan.md, data-model.md, contracts/ |
