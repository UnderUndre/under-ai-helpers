# Implementation Plan: Fleet Sync

**Branch**: `003-fleet-sync` | **Date**: 2026-05-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-fleet-sync/spec.md`

## Summary

Add a new `clai-helpers fleet` subcommand family (`fleet list`, `fleet sync`) that discovers GitHub repos pinned to clai-helpers (via default-branch `helpers-lock.json`) within a user's configured scope, presents version-drift status in a terminal table, and applies bumps via three selectable modes (`pr`, `push`, `patch`) with a safe default of `pr`.

Technical approach: a thin GitHub API layer reusing the existing raw-fetch pattern from `core/fetch.ts` for repo enumeration and lockfile reads; an ephemeral clone via spawned `git` CLI for sync operations (no new git library); per-mode dispatchers that share the existing single-project sync pipeline; an interactive checkbox picker via `@inquirer/prompts`; tabular output via `cli-table3`; user config loaded by reusing `c12` with a new namespace.

## Technical Context

**Language/Version**: TypeScript 5.7+ (strict, no `any`), ESM only. Target Node.js ≥20 (matches `packages/cli/package.json#engines`).
**Primary Dependencies**: existing `citty` (CLI), `consola` (logger), `c12` (config), `pathe` (paths), `giget` (existing fetch path — not used directly here but adjacent). NEW: `@inquirer/prompts` (interactive checkbox picker, modular), `cli-table3` (terminal table). No new GitHub-API library: extend `core/fetch.ts` patterns (raw `fetch` + `resolveAuth()` + `Bearer` headers).
**Storage**: User config at `~/.config/clai-helpers/fleet.json` (Linux/macOS) / `%APPDATA%/clai-helpers/fleet.json` (Windows) loaded via `c12`. No state DB; live GitHub API for fleet status; `mkdtemp(os.tmpdir(), 'helpers-fleet-')` for ephemeral clones during sync.
**Testing**: Vitest unit + integration. Network mocked via `vi.mock('node:fs')`-style for child_process spawns and global `fetch` shim for GitHub API calls (same pattern as existing `tests/unit/fetch.test.ts`). Golden fixtures for table renderer.
**Target Platform**: Cross-platform CLI — Windows 11 (primary dev), macOS, Linux. Git Bash + PowerShell + bash all supported. No new platform constraints.
**Project Type**: CLI subcommand inside existing single-package monorepo (`packages/cli/`). No new top-level project.
**Performance Goals**: SC-001 — list 20 repos in ≤5s, 50 repos in ≤10s end-to-end on typical broadband. SC-003 — zero half-applied state on interrupt for ≥95% of sessions.
**Constraints**: Cross-machine inherent (no local state required to view fleet). No auto-merge/auto-tag/auto-release in any mode. `prepublishOnly` (validate + test + build) must remain green after merge.
**Scale/Scope**: Initial fleets ~5–30 repos (solo dev). Edge case: 50+ repos. Three modes (`pr`/`push`/`patch`); two listing surfaces (`list` + picker inside `sync`); two new top-level deps; ~6 new TypeScript modules; ~15 new tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.4.0. Per-principle evaluation:

| Principle | Verdict | Notes |
|-----------|---------|-------|
| **I. Source of Truth Discipline** | ✅ PASS | Feature lives entirely in `packages/cli/src/cli/fleet/` (CLI source code). No edits to `.claude/` derived trees as part of this feature. The `/learn`/`/improve` cycle stays untouched. |
| **II. Transformer, Not Fork** | ✅ PASS (N/A) | Fleet is not a new transpile target. No new transformer added. No new directory tree under managed paths. |
| **III. Protected Slots** | ✅ PASS (N/A) | Feature does not produce managed files in consumer repos. PR/push artifacts are bumps to `helpers-lock.json` and regenerated derived files — managed by existing transformers, slot semantics unchanged. |
| **IV. SemVer 0.x Discipline** | ✅ PASS — bump required at release | New CLI capability = `feat(cli):` → MINOR bump (0.4.0 → 0.5.0) when shipped. Plan does not bump preemptively. |
| **V. Token Economy for `.claude/`** | ✅ PASS (N/A) | Feature lives in `packages/cli/`, not `.claude/`. Does not add `.claude/commands/` or `.claude/agents/` files. No `ultrathink` markers introduced. Context budget for downstream Claude sessions unchanged. |
| **VI. Cross-AI Review Gate** | ✅ PASS — gate enforced at `/speckit.implement` | Plan acknowledges `analyze.md` PASS + ≥2 external reviewer PASS required before any implementation begins. Tracked as a hard gate; no override planned. |
| **VII. Artifact Versioning** | ✅ PASS | `snapshot-stage.{sh,ps1}` invoked at end of plan stage (`plan/003-fleet-sync/v1`), and at every subsequent speckit stage. No `.history/` files created. |
| **VIII. Self-Maintaining Knowledge** | ✅ PASS — no new mechanism conflict | Feature uses existing `helpers-lock.json` schema; no changes to its shape that would break the staged-pattern flow. `/learn` can capture fleet-specific gotchas during implementation. |

**Result**: All gates pass. No `Complexity Tracking` entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/003-fleet-sync/
├── plan.md              # This file
├── research.md          # Phase 0 output (technical decisions + tradeoffs)
├── data-model.md        # Phase 1 output (entities + schemas)
├── quickstart.md        # Phase 1 output (developer / contributor entry)
├── contracts/           # Phase 1 output (CLI command contract + GitHub API surface + config schema)
│   ├── cli-commands.md
│   ├── github-api-surface.md
│   └── config-schema.md
├── checklists/
│   └── requirements.md  # Already created in /speckit.specify; updated by /speckit.clarify
└── tasks.md             # Phase 2 output (/speckit.tasks command — NOT created here)
```

### Source Code (repository root)

```text
packages/cli/
├── src/
│   ├── cli/
│   │   ├── fleet/                          # NEW — fleet subcommand family
│   │   │   ├── index.ts                    # citty subcommand registration
│   │   │   ├── list.ts                     # `fleet list` command handler
│   │   │   └── sync.ts                     # `fleet sync` command handler (orchestrates picker + per-mode dispatch)
│   │   ├── add-target.ts                   # (existing)
│   │   ├── diff.ts                         # (existing)
│   │   ├── ...                             # (other existing commands)
│   │   └── sync.ts                         # (existing single-project sync — reused by fleet sync)
│   ├── core/
│   │   ├── fleet/                          # NEW — fleet logic (testable in isolation)
│   │   │   ├── discovery.ts                # GitHub API: enumerate user/org repos + filter by helpers-lock.json
│   │   │   ├── lockfile-fetcher.ts         # GitHub API: read default-branch helpers-lock.json + last-modified commit
│   │   │   ├── modes/
│   │   │   │   ├── pr-mode.ts              # ephemeral clone → sync → branch → push → open PR
│   │   │   │   ├── push-mode.ts            # ephemeral clone → sync → commit → push to default
│   │   │   │   └── patch-mode.ts           # ephemeral clone → sync → diff → write .patch
│   │   │   ├── ephemeral-clone.ts          # mkdtemp + spawn git clone + cleanup helper (per-mode shared)
│   │   │   ├── config.ts                   # c12-loaded fleet.json loader + schema validation
│   │   │   ├── picker.ts                   # @inquirer/prompts checkbox wrapper
│   │   │   ├── table.ts                    # cli-table3 formatter for list view
│   │   │   └── github-api.ts               # raw fetch wrapper (auth, rate-limit retry, repos enumerate, lockfile read)
│   │   ├── fetch.ts                        # (existing — auth resolveAuth() reused)
│   │   ├── ...
│   │   └── pipeline.ts                     # (existing — single-project sync pipeline reused by mode dispatchers)
│   └── ...
└── tests/
    ├── unit/
    │   └── fleet/                          # NEW
    │       ├── discovery.test.ts           # mocked Octokit-style fetch responses
    │       ├── lockfile-fetcher.test.ts
    │       ├── config.test.ts              # default + override loading
    │       ├── table.test.ts               # golden fixtures
    │       └── modes/
    │           ├── pr-mode.test.ts         # spawn-mocked git, mocked fetch
    │           ├── push-mode.test.ts
    │           └── patch-mode.test.ts
    └── integration/
        └── fleet/                          # NEW
            ├── list.test.ts                # end-to-end fleet list with mocked GitHub
            └── sync.test.ts                # end-to-end fleet sync per mode with mocked spawn + fetch
```

**Structure Decision**: Single-package extension. New `fleet/` subdirs live alongside existing CLI command handlers and core modules. No new packages, no monorepo restructuring. Test layout mirrors source layout. Reuses existing `core/pipeline.ts` for the sync pipeline within ephemeral clones — fleet does not reimplement single-project sync.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

(Empty — all Principles passed without justification needed.)
