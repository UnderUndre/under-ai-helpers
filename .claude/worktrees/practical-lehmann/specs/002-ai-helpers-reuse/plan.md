# Implementation Plan: AI Helpers Distribution System

**Branch**: `002-ai-helpers-reuse` | **Date**: 2026-04-09 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification v3.1 from `specs/002-ai-helpers-reuse/spec.md`

## Summary

Build `underundre-helpers` — an npm-distributed CLI tool that treats `.claude/` as the single source of truth for AI-tool configuration and **transpiles** it into GitHub Copilot, Google Gemini, and other AI-tool-specific file formats. The tool supports init, sync with Protected Slots, version pinning, drift detection via canonical hashing, crash-safe journal-based recovery, and a trust model for custom transformers.

**Core architecture**: `.claude/` source files → parse → transform (per-target) → render → write to disk. Built on `giget` (git fetch/cache) and `c12` (TS config loader) from the UnJS ecosystem.

## Technical Context

**Language/Version**: TypeScript 5.x, targeting Node.js 20+ (ESM)
**Primary Dependencies**:
- `giget` (UnJS) — git repo fetch, cache, GitHub API auth
- `c12` (UnJS) — TypeScript config loader with layering
- `citty` (UnJS) — CLI framework (typed args, subcommands)
- `consola` (UnJS) — Logging with `NO_COLOR` support
- `pathe` (UnJS) — Cross-platform path handling (forward-slash normalization)
- `defu` (UnJS) — Deep defaults for config merging
- `ohash` — SHA-256 hashing

**Storage**: Local filesystem only. `helpers-lock.json` (committed), `.helpers/` dir (staging, journal, backups — gitignored)
**Testing**: `vitest` (unit + integration), golden-test fixtures in `tests/fixtures/`
**Target Platform**: Windows, macOS, Linux (cross-platform CLI via Node.js)
**Project Type**: CLI tool (npm package, `bin` entry, usable via `npx`)
**Performance Goals**: `init` <10s warm-cache / <30s cold-cache on 50 Mbit/s (NFR-001)
**Constraints**: Must work via `npx` without global install. Offline mode via `giget` cache. Non-interactive by default (CI-safe).
**Scale/Scope**: Typically <100 tracked source files, <300 generated files across 3 targets. Single-user local tool.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is an unfilled template — no project-specific gates defined. **PASS by default.**

When the constitution is filled, re-run this check against:
- Principle compliance (e.g., library-first, test-first if defined)
- Complexity justification
- Technology choice validation

## Project Structure

### Documentation (this feature)

```text
specs/002-ai-helpers-reuse/
├── spec.md              # Feature specification (v3.1)
├── plan.md              # This file
├── research.md          # Phase 0: technology research
├── data-model.md        # Phase 1: entity definitions & types
├── quickstart.md        # Phase 1: getting started guide
├── contracts/
│   ├── cli.md           # CLI command/flag/exit-code contract
│   ├── transformer.md   # Transformer interface contract
│   ├── manifest.md      # helpers.config.ts schema contract
│   └── lock.md          # helpers-lock.json schema contract
└── tasks.md             # Phase 2: implementation tasks (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/underundre-helpers/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                    # Package entry (exports for programmatic use)
│   ├── cli.ts                      # CLI entry point (citty setup, subcommand routing)
│   ├── cli/
│   │   ├── init.ts                 # `helpers init` command handler
│   │   ├── sync.ts                 # `helpers sync` command handler
│   │   ├── status.ts               # `helpers status` command handler
│   │   ├── diff.ts                 # `helpers diff` command handler
│   │   ├── eject.ts                # `helpers eject` command handler
│   │   ├── remove.ts               # `helpers remove` command handler
│   │   ├── add-target.ts           # `helpers add-target` command handler
│   │   ├── remove-target.ts        # `helpers remove-target` command handler
│   │   ├── list-transformers.ts    # `helpers list-transformers` command handler
│   │   ├── doctor.ts               # `helpers doctor` command handler
│   │   └── recover.ts              # `helpers recover` command handler
│   ├── core/
│   │   ├── fetch.ts                # Source repo fetch via giget
│   │   ├── manifest.ts             # Load & validate helpers.config.ts via c12
│   │   ├── lock.ts                 # Read/write/validate helpers-lock.json
│   │   ├── slots.ts                # Protected Slots parser & merger
│   │   ├── hash.ts                 # Canonical hash, slots hash, rendered hash
│   │   ├── journal.ts              # Write-Ahead Journal (WAL) for crash recovery
│   │   ├── staging.ts              # Atomic staging + fs.rename + EXDEV fallback
│   │   ├── trust.ts                # Custom transformer trust model
│   │   ├── drift.ts                # Drift detection logic
│   │   └── header.ts               # Auto-generated header inject/strip/detect
│   ├── transformers/
│   │   ├── types.ts                # ParsedFile, RenderedFile, TransformContext types
│   │   ├── registry.ts             # Transformer registry (built-in + custom loader)
│   │   ├── identity.ts             # Identity transformer (copy as-is)
│   │   ├── claude-to-copilot-prompt.ts
│   │   ├── claude-to-copilot-instructions.ts
│   │   ├── claude-to-copilot-root-instructions.ts
│   │   ├── claude-to-gemini-command.ts
│   │   ├── claude-to-gemini-agent.ts
│   │   └── claude-to-gemini-root.ts
│   └── types/
│       ├── config.ts               # helpers.config.ts schema types
│       ├── lock.ts                 # helpers-lock.json schema types
│       ├── journal.ts              # journal.json schema types
│       └── common.ts               # Shared enums (FileKind, FileClass, FileStatus, ExitCode)
├── tests/
│   ├── unit/
│   │   ├── slots.test.ts           # Protected Slots parsing & merging
│   │   ├── hash.test.ts            # Canonical hash computation
│   │   ├── header.test.ts          # Header inject/strip/detect
│   │   ├── drift.test.ts           # Drift detection scenarios
│   │   ├── journal.test.ts         # WAL write/read/recover
│   │   ├── trust.test.ts           # Trust model (hash pin, revoke, prompt)
│   │   └── transformers/
│   │       ├── identity.test.ts
│   │       ├── copilot-prompt.test.ts
│   │       ├── copilot-instructions.test.ts
│   │       ├── gemini-command.test.ts
│   │       └── gemini-agent.test.ts
│   ├── integration/
│   │   ├── init.test.ts            # Full init flow
│   │   ├── sync.test.ts            # Full sync flow (upgrade, drift, orphans)
│   │   ├── recover.test.ts         # Journal recover (resume, rollback, abandon)
│   │   ├── status-strict.test.ts   # CI drift detection
│   │   └── targets.test.ts         # add-target / remove-target flows
│   └── fixtures/
│       ├── source-repo/            # Simulated upstream helpers repo
│       │   ├── helpers.config.ts
│       │   └── .claude/
│       │       ├── commands/
│       │       ├── agents/
│       │       └── CLAUDE.md
│       └── golden/                 # Expected outputs per-transformer
│           ├── copilot/
│           ├── gemini/
│           └── claude/
└── bin/
    └── helpers.mjs                 # npx entry point (#!/usr/bin/env node)
```

**Structure Decision**: Single `packages/underundre-helpers/` package at repo root. Not a monorepo — this is a single CLI tool. The `packages/` prefix allows coexistence with the source `helpers` content at repo root level (`.claude/`, `.github/`, etc.) without namespace collision. If in the future we add more packages (e.g., `@underundre/helpers-transformers`), the structure is already monorepo-ready.

## Complexity Tracking

> Constitution is unfilled — no gate violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| N/A | — | — |
