# Implementation Plan: Developer Experience Bundle v1

**Branch**: `004-devx-bundle-v1` | **Date**: 2026-05-24 | **Spec**: `specs/004-devx-bundle-v1/spec.md`
**Input**: Feature specification from `specs/004-devx-bundle-v1/spec.md`

## Summary

Four-component developer-experience improvement bundle for the clai-helpers monorepo:

1. **Two-Phase Review Flow** — SpecKit creates a `specs/<slug>` planning branch for spec-only artifacts (reviewed before merge), then a `<slug>` implementation branch for code. Replaces the current flat `feature/<N>-<slug>` convention. Includes constitution amendment, PR templates, and CI path-based triggers.

2. **Hermes Wrapper Subcommand** — `clai-helpers hermes <prompt>` wraps the hermes binary via `child_process.spawn`, supporting `--from-file`, stdin piping, `--background` (detached), `--model`, `--provider`, `--toolsets`, and `--verbose`. Zero new npm deps.

3. **Doctor Health Check Overhaul** — Replaces the existing lock-integrity-only `doctor` command with a comprehensive health matrix: system info, CLI tools, MCP server reachability, API key existence, `.claude/` structural validity, and drift check. Output as colored table (consola), `--json`, or `--quiet` (failures only).

4. **AI Engineering Coach Rules Import** — One-time manual import of 45 anti-pattern rules from `microsoft/AI-Engineering-Coach` into CLAUDE.md guardrails, code-review-checklist skill, and lint-and-validate skill. Includes MIT license attribution.

## Technical Context

**Language/Version**: TypeScript 5.x, ESM (`"type": "module"`)
**Primary Dependencies**: citty (CLI framework), consola (logger), pathe (paths), c12 (config), vitest (testing), node:child_process, node:fs/promises, node:http
**Storage**: Filesystem only (lock files, config files, generated output)
**Testing**: vitest — unit tests under `tests/unit/`, integration tests under `tests/integration/`, golden fixtures under `tests/fixtures/golden/`
**Target Platform**: Node.js >=20.x, Windows primary (Git Bash / MSYS), cross-platform (Linux, macOS)
**Project Type**: Monorepo CLI tool + AI configuration hub
**Performance Goals**: `hermes` wrapper forwards prompt in <2s (excluding hermes execution); `doctor` completes all checks in <10s
**Constraints**: No new npm deps without explicit approval; no `--force`/`--yes` bypass flags; semver 0.x discipline (constitution Principle IV)
**Scale/Scope**: 14 existing subCommands (init, sync, regen, status, diff, eject, remove, add-target, remove-target, list-transformers, doctor, recover, fleet); adding 1 new (`hermes`); replacing 1 (`doctor`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Impact | Status |
|-----------|--------|--------|
| I. Source of Truth Discipline | Two-phase review flow adds `specs/<slug>` branches but does not alter `.claude/` → transformer pipeline. Doctor checks structural integrity of `.claude/`. Rules import edits CLAUDE.md + skills (source of truth). | COMPLIANT |
| II. Transformer, Not Fork | No new transformers in this feature. Hermes wrapper is a CLI subcommand, not a transformer. | COMPLIANT |
| III. Protected Slots over Hand-Editing | Rules import edits CLAUDE.md and skills directly (source files, not generated). No protected slot violations. | COMPLIANT |
| IV. SemVer Discipline (NON-NEGOTIABLE) | This is a feature bundle → MINOR bump (0.x). Must use `/bump`, never hand-edit `package.json#version`. | COMPLIANT — enforce at merge |
| V. Token Economy | Doctor checks for orphan skills (relevant to token budget). Rules import adds ~45 rules — each must earn its place in skills. Hermes wrapper is a thin passthrough, no token impact. | COMPLIANT |
| VI. Cross-AI Review Gate (NON-NEGOTIABLE) | Two-phase review flow EXTENDS Principle VI by formalizing the planning PR as a pre-condition for the existing review gate. Constitution amendment needed (new Principle IX or amendment to Development Workflow section). | AMENDMENT REQUIRED — see Phase 0 |
| VII. Artifact Versioning | Two-phase branches use snapshot-stage tags as before. No changes to tagging convention. | COMPLIANT |
| VIII. Self-Maintaining Knowledge | Doctor command surfaces knowledge maintenance signals (stale patterns, orphan skills). No structural changes. | COMPLIANT |

**Constitution Amendment Required**: Add a new section under Development Workflow (or a new Principle IX) formalizing the Two-Phase Review Flow: `specs/<slug>` planning branch → review → merge → `<slug>` implementation branch → review → merge, with hotfix carve-out.

## Project Structure

### Documentation (this feature)

```text
specs/004-devx-bundle-v1/
├── plan.md              # This file
├── spec.md              # Feature specification (input)
└── research.md          # Phase 0 research notes (if needed)
```

### Source Code (repository root)

```text
packages/cli/
├── src/
│   ├── cli.ts                          # MODIFY: add hermes subcommand registration
│   ├── cli/
│   │   ├── doctor.ts                   # REWRITE: full health check overhaul
│   │   ├── hermes.ts                   # NEW: hermes wrapper subcommand
│   │   ├── fleet/
│   │   │   └── ...                     # (unchanged)
│   │   └── ...                         # other existing subcommands (unchanged)
│   ├── core/
│   │   └── ...                         # (unchanged)
│   └── types/
│       └── common.ts                   # (unchanged)
├── tests/
│   ├── unit/
│   │   ├── hermes.test.ts              # NEW: unit tests for hermes wrapper
│   │   ├── doctor-checks.test.ts       # NEW: unit tests for doctor check functions
│   │   └── ...                         # existing tests (unchanged)
│   └── integration/
│       ├── doctor.test.ts              # NEW: integration test for doctor CLI
│       ├── hermes-cli.test.ts          # NEW: integration test for hermes CLI
│       └── ...                         # existing tests (unchanged)
└── package.json                        # (unchanged — no new deps)

.specify/memory/constitution.md         # MODIFY: add two-phase review flow principle

.github/
├── PULL_REQUEST_TEMPLATE/
│   ├── spec.md                         # NEW: planning PR template
│   └── impl.md                         # NEW: implementation PR template
└── workflows/                          # MODIFY: add path-filtered CI for specs/* branches

CLAUDE.md                               # MODIFY: append AI-Engineering-Coach rules to guardrails
.claude/skills/
│   ├── code-review-checklist/SKILL.md  # MODIFY: augment with applicable rules
│   └── lint-and-validate/SKILL.md      # MODIFY: augment with automatable rules
docs/CREDITS.md                         # MODIFY: add MIT attribution
vendor/AI-Engineering-Coach-LICENSE     # NEW: copy of MIT license
```

**Structure Decision**: All new CLI code lives in `packages/cli/src/cli/` following the existing one-file-per-subcommand pattern. Doctor rewrite replaces the existing file in-place. Hermes is a new file. Tests follow the existing `tests/unit/` and `tests/integration/` split.

## Architecture Decisions

### AD-1: Branch Naming Convention — `specs/<slug>` / `<slug>` (Breaking Change)

**Context**: Current convention is `feature/<N>-<slug>` (e.g., `feature/004-devx-bundle-v1`). The two-phase review flow requires distinct planning and implementation branches with different CI triggers.

**Decision**: Planning branch = `specs/<slug>` (e.g., `specs/devx-bundle-v1`). Implementation branch = `<slug>` (e.g., `devx-bundle-v1`). No `feature/` prefix, no `NNN-` numbering.

**Rationale**:
- `specs/` prefix enables path-filtered CI triggers on `specs/**` without complex glob patterns.
- Dropping the number prefix avoids stale numbering when features are reordered/cancelled.
- The prefix itself (`specs/`) is the discriminator — no need for a second prefix on the impl branch.
- Existing in-flight branches keep their old names (grandfathered, not migrated).

**Consequences**:
- **Breaking change** from `feature/<N>-<slug>` to `specs/<slug>` / `<slug>`. Constitution amendment required.
- `/speckit.start` must be updated to create `specs/<slug>` branches.
- CI workflows need new path-filter patterns.
- `/speckit.implement` must strip the `specs/` prefix when creating the implementation branch.
- Branch auto-cleanup (FR-007) targets `specs/<slug>` branches after merge.

**Status**: ACCEPTED

---

### AD-2: Hermes Wrapper via `child_process.spawn` (not `exec`)

**Context**: The hermes wrapper must forward prompts to the hermes binary and support streaming output, background execution, and stdin piping.

**Decision**: Use `child_process.spawn` with the following configuration:
- **Foreground (default)**: `spawn('hermes', [...args], { stdio: ['pipe', 'inherit', 'inherit'] })` — hermes stdout/stderr stream directly to the terminal. Prompt fed via stdin pipe.
- **Background (`--background`)**: `spawn('hermes', [...args], { stdio: 'ignore', detached: true })` — process fully detached, output redirected to `.hermes-output-<timestamp>.log`. Parent prints PID + log path and exits immediately.
- **Stdin piping**: Read stdin from `process.stdin` (if TTY is not active) or from `--from-file`, then write to child's stdin pipe.

**Rationale**:
- `exec` buffers entire output — unacceptable for long-running hermes sessions with streaming.
- `spawn` with `stdio: 'inherit'` gives hermes direct terminal access for streaming.
- `detached: true` + `unref()` is the Node.js idiom for fire-and-forget background processes.
- No new npm deps needed — `child_process` is a Node.js builtin.

**Consequences**:
- Windows: hermes binary may be `hermes.exe` or `hermes.cmd` — use `process.platform === 'win32'` to resolve.
- Background mode must handle early failure detection (process exits within 2s) — watch for `exit` event in a 2s window.
- Exit code forwarding: in foreground mode, hermes's exit code is the wrapper's exit code.

**Status**: ACCEPTED

---

### AD-3: Doctor Output via Consola Table Rendering (No New Table Deps)

**Context**: Doctor must output a colored status matrix. Options: add a table library (cli-table3, etc.) or use consola's built-in formatting.

**Decision**: Use consola for all output formatting. Render the health check matrix as aligned text columns using consola's `success`, `warn`, `error`, and `info` methods with manual spacing. No new npm dependencies.

**Rationale**:
- Constitution Principle IV: complexity must be justified. A table library for a single command is unjustified weight.
- The health check matrix has a fixed, small column structure (category | check | status | detail). Manual alignment via string padding is trivial.
- consola already provides colored output. Adding cli-table3 would add ~30KB for a feature achievable in 20 lines of formatting code.
- `--json` mode outputs raw JSON (no table needed). `--quiet` mode outputs failures only (no table needed). Only the default human-readable mode needs the table-like formatting.

**Consequences**:
- The table rendering will be slightly less polished than a dedicated library (no automatic column width detection, no border drawing).
- If a future command also needs tables, reconsider at that point (gated task).

**Status**: ACCEPTED

---

### AD-4: Rules Import as Manual Content Translation (Not Runtime Dependency)

**Context**: The 45 anti-pattern rules from `microsoft/AI-Engineering-Coach` need to be imported into our guardrails, skills, and docs.

**Decision**: Import is a one-time manual process. A developer reads the source rules from `src/core/rules/*.md`, translates each into our format (anti-pattern name, why-it-bites, correct-pattern), and writes the translated content into the appropriate files. No runtime import mechanism, no build step, no git submodule.

**Rationale**:
- The rules are advisory content, not executable code. They change infrequently (if ever — it's a reference repo).
- A runtime import would add a network dependency on an external repo — violates offline reliability.
- The rules must be adapted (not verbatim copied) to match our format and Valera tone. This requires human judgment.
- Documenting the import process in the spec makes it repeatable without automation.

**Consequences**:
- If AI-Engineering-Coach adds new rules, re-import is a manual task (documented process).
- The imported rules become part of our source of truth (CLAUDE.md, skills) — maintained going forward.
- Attribution (MIT license copy + CREDITS.md entry) is a legal requirement, not optional.

**Status**: ACCEPTED

---

### AD-5: MCP Health via JSON-RPC `initialize` (Not Full MCP Client)

**Context**: Doctor must check if MCP servers (context7, filesystem, github, sequential-thinking) are reachable. Options: implement a full MCP client, or use a minimal JSON-RPC handshake.

**Decision**: For each MCP server configured in `.claude/settings.json` (or known by convention), doctor sends a JSON-RPC `initialize` request via stdio with a 3-second timeout. If the server responds with a valid `InitializeResult`, it's marked "pass". If it times out or errors, it's marked "unknown" (not "fail").

**Rationale**:
- A full MCP client implementation is massive overkill for a health check. The `initialize` method is the MCP handshake — if it responds, the server is alive and speaking the right protocol.
- stdio is the standard MCP transport. Spawning the server binary with `--stdio` and sending the JSON-RPC message is ~30 lines of code.
- "unknown" (not "fail") for unreachable MCP servers because MCP configuration is optional — a missing server isn't necessarily broken, it might just not be installed.
- 3-second timeout prevents doctor from hanging on a misbehaving server.

**Consequences**:
- Doctor needs to know the server binary names/paths. These can be hardcoded from the known MCP servers list or read from `.claude/settings.json`.
- The `initialize` request payload is minimal: `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"clai-helpers-doctor","version":"0.1.0"}}}`.
- If MCP protocol version changes, the check payload may need updating.

**Status**: ACCEPTED

## Data Model

### HealthCheck

```typescript
interface HealthCheck {
  /** Unique check identifier, e.g. "system.node-version" */
  name: string;
  /** Category for grouping in output */
  category: "system" | "tools" | "mcp" | "keys" | "structure" | "drift";
  /** Check result */
  status: "pass" | "warn" | "fail" | "unknown";
  /** Human-readable detail */
  detail: string;
  /** Whether failure should cause exit code 1 */
  critical: boolean;
}

interface DoctorResult {
  checks: HealthCheck[];
  summary: { pass: number; warn: number; fail: number; unknown: number };
  exitCode: 0 | 1;
}
```

### HermesInvocation

```typescript
interface HermesInvocation {
  /** Prompt source: direct arg, file path, or stdin */
  promptSource: "arg" | "file" | "stdin";
  /** The actual prompt text (resolved from source) */
  prompt: string;
  /** Model override (default: glm/glm-5.1, env: HERMES_DEFAULT_MODEL) */
  model: string;
  /** Provider override (default: custom) */
  provider: string;
  /** Toolsets CSV passthrough */
  toolsets?: string;
  /** Spawn detached, print PID + log path */
  background: boolean;
  /** Pass --verbose to hermes */
  verbose: boolean;
}
```

### PlanningBranch / ImplementationBranch

These are conceptual entities (Git branches), not runtime data structures. Their lifecycle is managed by `/speckit.start` and `/speckit.implement` commands.

- **PlanningBranch**: `specs/<slug>` — contains only `specs/<slug>/**` files. Lifecycle: created → PR opened → CI (markdown lint, link check, analyze regen) → review → merge → branch deleted.
- **ImplementationBranch**: `<slug>` — contains code changes. Lifecycle: created from main (after planning merge) → PR opened → CI (full suite) → review → merge.

## Implementation Steps

### Step 1: Constitution Amendment — Two-Phase Review Flow

**What**: Add a new principle (Principle IX) or amendment to the Development Workflow section formalizing the two-phase review flow.

**Files**:
- `.specify/memory/constitution.md` — add Principle IX: Two-Phase Review Flow
  - Planning branch: `specs/<slug>` (spec-only artifacts)
  - Implementation branch: `<slug>` (code changes, created after planning merge)
  - Hotfix carve-out: production hotfixes (<50 LOC, prod incident with ticket) skip the two-phase flow
  - Breaking change from `feature/<N>-<slug>` convention

**Test approach**: Manual review by maintainer. `/speckit.analyze` will enforce the new principle on subsequent features.

**Phase**: Phase 0

---

### Step 2: PR Templates

**What**: Create two PR templates — one for planning PRs, one for implementation PRs.

**Files**:
- `.github/PULL_REQUEST_TEMPLATE/spec.md` — planning PR template
  - Sections: Spec Overview, Artifacts Included, AI Review Status, Checklist (spec completeness, no code, analyze regen)
- `.github/PULL_REQUEST_TEMPLATE/impl.md` — implementation PR template
  - Sections: Implementation Summary, Spec Reference, Tasks Completed, Quality Gates (tsc, test, build, status --strict), Breaking Changes

**Test approach**: Manual review. Verify GitHub recognizes both templates in PR creation UI.

**Phase**: Phase 0

---

### Step 3: CI Configuration for Path-Filtered Checks

**What**: Update CI workflows to run reduced checks on `specs/*` branches and full checks on implementation branches.

**Files**:
- `.github/workflows/ci.yml` (or equivalent) — add path-filtered job:
  - `specs/*` branches: markdown lint, link check, `/speckit.analyze` regen + verdict
  - `<slug>` branches (non-specs): full test suite, build, lint, type check, analyze re-validation
  - Use `paths` filter: `paths: ['specs/**']` for reduced CI trigger

**Test approach**: Create a test `specs/` branch, open PR, verify only reduced CI runs. Then create an implementation branch, verify full CI runs.

**Phase**: Phase 0

---

### Step 4: Update `/speckit.start` for New Branch Naming

**What**: Modify the `/speckit.start` command (or its backing script) to create `specs/<slug>` planning branches instead of `feature/<N>-<slug>`.

**Files**:
- `.specify/scripts/{bash,powershell}/speckit-start.{sh,ps1}` or equivalent command file — update branch naming logic
- `.claude/commands/speckit-start.md` (if command definition references branch naming) — update documentation

**Test approach**: Invoke `/speckit.start` with a test feature slug, verify it creates branch `specs/<slug>` (not `feature/<slug>`).

**Phase**: Phase 0

---

### Step 5: Update `/speckit.implement` for Two-Phase Flow

**What**: Modify `/speckit.implement` to create `<slug>` implementation branch from main (after planning merge), strip `specs/` prefix.

**Files**:
- `.specify/scripts/{bash,powershell}/speckit-implement.{sh,ps1}` or equivalent — branch creation logic
- `.claude/commands/speckit-implement.md` — update documentation

**Test approach**: After a planning PR merge, invoke `/speckit.implement`, verify it creates `<slug>` branch from main with merged spec as reference.

**Phase**: Phase 0

---

### Step 6: Hermes Wrapper — Core Module

**What**: Implement the `clai-helpers hermes` subcommand using `child_process.spawn`.

**Files**:
- `packages/cli/src/cli/hermes.ts` — NEW file, the hermes wrapper command:
  - `defineCommand` with args: `<prompt>` (positional, optional), `--from-file`, `--background`, `--model`, `--provider`, `--toolsets`, `--verbose`
  - Resolve prompt: arg > `--from-file` > stdin (in priority order)
  - Detect hermes binary on PATH (`which hermes` / `where hermes`); if missing, print install hint, exit 127
  - Build hermes args array: `-z`, prompt, `--model`, `--provider`, `--toolsets`, `--verbose`
  - Foreground: `spawn('hermes', args, { stdio: ['pipe', 'inherit', 'inherit'] })` — write prompt to stdin pipe, await exit, forward exit code
  - Background: `spawn('hermes', args, { stdio: 'ignore', detached: true })` — create log file `.hermes-output-<timestamp>.log`, redirect stdout/stderr to log, print PID + log path, `child.unref()`, exit 0
  - Early failure detection in background mode: listen for `exit` event in 2s window; if process exits within 2s, surface error

**Test approach**:
- Unit tests (`tests/unit/hermes.test.ts`): mock `child_process.spawn`, verify arg building, prompt resolution, exit code forwarding, background mode spawn options
- Integration tests (`tests/integration/hermes-cli.test.ts`): test with hermes not on PATH (exit 127), test `--from-file` with a temp file, test stdin piping

**Phase**: Phase 1

---

### Step 7: Hermes Wrapper — CLI Registration

**What**: Register the hermes subcommand in the main CLI definition.

**Files**:
- `packages/cli/src/cli.ts` — add `hermes` to `subCommands` map:
  ```typescript
  hermes: () => import("./cli/hermes.js").then((m) => m.default),
  ```

**Test approach**: Run `npx clai-helpers hermes --help`, verify usage output. Run `npx clai-helpers --help`, verify hermes appears in subcommand list.

**Phase**: Phase 1

---

### Step 8: Doctor Overhaul — Check Functions

**What**: Implement individual health check functions as composable units. Each returns a `HealthCheck` result.

**Files**:
- `packages/cli/src/cli/doctor.ts` — REWRITE (replace existing lock-only implementation):
  - **System checks**: `checkNodeVersion()`, `checkNpmVersion()`, `checkGitVersion()`, `checkOSInfo()`
  - **CLI tool checks**: `checkGhCli()` (presence + auth status), `checkHermesBinary()` (presence + version)
  - **MCP server checks**: `checkMcpServer(name, command)` — spawn server with `--stdio`, send JSON-RPC `initialize`, 3s timeout, parse response
  - **API key checks**: `checkApiKey(varName)` — `process.env[varName] !== undefined` (never read or print the value)
  - **Structural checks**: `checkClaudeDirectory()` — verify `.claude/commands/`, `.claude/agents/`, `.claude/skills/` exist; validate frontmatter; detect orphan skill references from agents
  - **Drift check**: `checkDrift()` — invoke `clai-helpers status --strict` internally, surface result
  - **Result aggregation**: `runAllChecks()` → `DoctorResult`
  - **Output rendering**: `renderTable(result)` — aligned text columns via consola; `renderJson(result)` — JSON.stringify; `renderQuiet(result)` — failures only
  - **Exit code**: 0 if all critical checks pass, 1 if any critical check fails

**Test approach**:
- Unit tests (`tests/unit/doctor-checks.test.ts`): test each check function in isolation with mocked environment (mock `process.env`, mock `child_process.spawn`, mock filesystem)
- Integration tests (`tests/integration/doctor.test.ts`): run `clai-helpers doctor` in a fixture directory, verify output format, exit codes, `--json` validity, `--quiet` output

**Phase**: Phase 2

---

### Step 9: Doctor Overhaul — Backward Compatibility

**What**: Ensure the old doctor behavior (lock validation) is subsumed under the new drift-check category.

**Files**:
- `packages/cli/src/cli/doctor.ts` — drift check section invokes `clai-helpers status --strict` which covers lock validation
- The `--fix` and `--clean` args from the old doctor are removed (drift is fixed via `sync`, not doctor)
- If this is controversial, keep `--fix` as a deprecated alias that runs `clai-helpers sync`

**Test approach**: Verify that `clai-helpers doctor` in a project with lock issues reports the issue under the "drift" category. Verify `--fix` either works or is removed with a clear migration message.

**Phase**: Phase 2

---

### Step 10: Rules Import — Content Translation

**What**: Read the 45 anti-pattern rules from `microsoft/AI-Engineering-Coach` `src/core/rules/*.md`, translate each into our format.

**Process**:
1. Clone/browse `microsoft/AI-Engineering-Coach` repo
2. Read each rule file from `src/core/rules/*.md`
3. Each rule has YAML frontmatter (name, description, category) + markdown body
4. Translate to our format: **anti-pattern name**, **why-it-bites** (consequence), **correct-pattern** (example)
5. Adapt tone to Valera persona where appropriate (but prioritize clarity over flavor)
6. Handle conflicts with existing guardrails: existing takes precedence, mark imported rule as "adapted"

**Files**:
- `CLAUDE.md` — append translated rules to "AI-Generated Code Guardrails" section
- `.claude/skills/code-review-checklist/SKILL.md` — augment with applicable rules
- `.claude/skills/lint-and-validate/SKILL.md` — augment with automatable rules

**Test approach**: Manual review of translated content. Verify all 45 rules are represented (count check). Verify no verbatim copies (adaptation check). Verify existing guardrails are not overwritten.

**Phase**: Phase 3

---

### Step 11: Rules Import — Attribution & License

**What**: Add MIT license attribution per the source repo's license requirements.

**Files**:
- `vendor/AI-Engineering-Coach-LICENSE` — NEW: copy of the MIT license file from the source repo
- `docs/CREDITS.md` — MODIFY: add entry for AI-Engineering-Coach with MIT notice and repo link

**Test approach**: Verify license file is present and unmodified. Verify CREDITS.md entry links to the correct repo.

**Phase**: Phase 3

---

### Step 12: Rules Import — Sync Propagation

**What**: After content import, run `npx clai-helpers sync` to propagate the augmented content to Copilot/Gemini targets.

**Files**: No new files — this is a verification step.

**Test approach**: Run `npx clai-helpers status --strict` — must report no drift. Verify augmented content appears in generated targets (`.github/copilot-instructions.md`, `.gemini/`, etc.).

**Phase**: Phase 3

---

### Step 13: Integration Testing & Polish

**What**: End-to-end validation of all four components working together.

**Tests**:
- Two-phase flow: create a test feature via `/speckit.start` → planning PR → merge → `/speckit.implement` → implementation PR. Verify CI triggers correctly on both.
- Hermes wrapper: `clai-helpers hermes "echo test"` (if hermes binary available), `--from-file`, stdin pipe, `--background`.
- Doctor: run `clai-helpers doctor`, `--json` (pipe through `jq`), `--quiet`.
- Rules: verify content in all target files after sync.

**Phase**: Phase 4

## Phase Breakdown

### Phase 0: Foundation

**Goal**: Constitutional and CI infrastructure for the two-phase review flow.

| Step | Task | Files | Est. Effort |
|------|------|-------|-------------|
| 1 | Constitution amendment (Principle IX) | `.specify/memory/constitution.md` | Small |
| 2 | PR templates | `.github/PULL_REQUEST_TEMPLATE/{spec,impl}.md` | Small |
| 3 | CI path-filtered config | `.github/workflows/ci.yml` | Medium |
| 4 | `/speckit.start` branch naming | `.specify/scripts/*`, `.claude/commands/*` | Small |
| 5 | `/speckit.implement` two-phase | `.specify/scripts/*`, `.claude/commands/*` | Small |

**Gate**: Phase 0 is complete when a test feature can go through `specs/<slug>` planning PR → merge → `<slug>` implementation branch creation with correct CI triggers.

**Deliverable**: Planning PR for this very feature (`specs/004-devx-bundle-v1`) using the new two-phase flow. Dogfooding.

---

### Phase 1: Hermes Wrapper

**Goal**: `clai-helpers hermes` subcommand fully functional.

| Step | Task | Files | Est. Effort |
|------|------|-------|-------------|
| 6 | Hermes core module | `packages/cli/src/cli/hermes.ts` | Medium |
| 7 | CLI registration | `packages/cli/src/cli.ts` | Small |

**Dependencies**: None (Phase 1 is independent of Phase 0 completion).

**Gate**: Phase 1 is complete when `clai-helpers hermes "test"` forwards the prompt and returns hermes's exit code, `--from-file` works, stdin piping works, `--background` spawns detached, and missing binary produces exit 127 with install hint.

**Testing**: Unit tests for arg building, prompt resolution, spawn config. Integration tests for CLI invocation. All in vitest.

---

### Phase 2: Doctor Overhaul

**Goal**: Comprehensive `clai-helpers doctor` replacing the lock-only version.

| Step | Task | Files | Est. Effort |
|------|------|-------|-------------|
| 8 | Doctor check functions + rendering | `packages/cli/src/cli/doctor.ts` | Large |
| 9 | Backward compatibility | (same file) | Small |

**Dependencies**: None (Phase 2 is independent of Phases 0 and 1).

**Gate**: Phase 2 is complete when `clai-helpers doctor` reports all check categories, `--json` produces valid JSON, `--quiet` shows only failures, and exit code reflects critical check status.

**Testing**: Unit tests for each check function (mocked env/spawn/fs). Integration tests for full CLI invocation. Verify old lock-validation behavior is subsumed under drift check.

---

### Phase 3: Rules Import

**Goal**: All 45 AI-Engineering-Coach rules imported, attributed, and synced.

| Step | Task | Files | Est. Effort |
|------|------|-------|-------------|
| 10 | Content translation | `CLAUDE.md`, `.claude/skills/*/SKILL.md` | Large (manual) |
| 11 | Attribution & license | `vendor/`, `docs/CREDITS.md` | Small |
| 12 | Sync propagation | (verification step) | Small |

**Dependencies**: None (Phase 3 is independent of Phases 0-2, though sync in Step 12 requires the CLI to be buildable).

**Gate**: Phase 3 is complete when all 45 rules appear in at least one target file, attribution is present, license copy exists, and `clai-helpers status --strict` reports no drift.

**Testing**: Manual content review. Count verification (45 rules). Attribution check.

---

### Phase 4: Integration & Polish

**Goal**: End-to-end validation, edge case handling, documentation.

| Step | Task | Files | Est. Effort |
|------|------|-------|-------------|
| 13 | Integration testing | (test files) | Medium |

**Dependencies**: Phases 0-3 complete.

**Gate**: All acceptance scenarios from spec.md pass. Quality gates (tsc, test, build, status --strict) clean.

---

### Phase Execution Order

Phases 0, 1, 2, and 3 are **independent** and can be parallelized (each touches different files with minimal overlap). Phase 4 depends on all prior phases.

Recommended execution order for a single developer:
1. **Phase 1** (hermes wrapper) — smallest scope, fastest to deliver value
2. **Phase 2** (doctor overhaul) — medium scope, high visibility
3. **Phase 0** (two-phase flow) — infrastructure, requires CI testing
4. **Phase 3** (rules import) — largest manual effort, lowest priority
5. **Phase 4** (integration) — final validation

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Constitution amendment rejected by maintainer** | Low | High — blocks Phase 0 | Draft amendment early, get pre-approval before implementing |
| **Hermes binary behavior differs across platforms** | Medium | Medium — wrapper may fail on Linux/macOS | Test on all platforms in CI; use `process.platform` guards; document known differences |
| **MCP server binaries not on PATH in CI** | High | Low — doctor marks "unknown" | Doctor handles gracefully (unknown, not fail). CI does not depend on MCP servers. |
| **Rules import introduces conflicting guardrails** | Medium | Low — existing takes precedence | Document conflict resolution rule: existing wins, imported marked "adapted" |
| **Doctor overhaul breaks existing `--fix` / `--clean` users** | Low | Medium | Either deprecate with migration message or keep as aliases |
| **`child_process.spawn` edge cases on Windows** | Medium | Medium | Use `shell: true` on Windows for `.cmd` resolution; test in Git Bash |
| **Two-phase branch naming confusion with existing features** | Low | Low | Grandfather existing branches; document naming convention prominently |
| **MCP `initialize` payload version mismatch** | Low | Low | Hardcode known protocol version; update when MCP spec changes |
| **No new npm deps rule violated** | None | High — constitution violation | All implementations use Node builtins only. Flag immediately if a dep is needed. |

### Gated Tasks (Require Approval)

| Task | Why Gated | Approval Needed From |
|------|-----------|---------------------|
| Any new npm dependency | Constitution Principle IV + standing orders | Maintainer |
| Constitution amendment text changes | Governance | Maintainer review |
| Removal of `--fix` / `--clean` from doctor | Breaking change | Maintainer |
| CI workflow changes | Affects all PRs | Maintainer |

## Complexity Tracking

> No constitution violations to justify. All decisions comply with existing principles. The constitution amendment (Step 1) ADDS a principle rather than violating one.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
