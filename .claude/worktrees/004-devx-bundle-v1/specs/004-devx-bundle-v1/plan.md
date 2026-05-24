# Implementation Plan: Developer Experience Bundle v1

**Branch**: `feature/004-devx-bundle-v1` | **Date**: 2026-05-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/004-devx-bundle-v1/spec.md`

## Summary

Four-component DX bundle: (1) Two-phase review flow establishing constitution Principle VIII for planning PR → implementation PR, (2) `clai-helpers hermes` wrapper subcommand, (3) `clai-helpers doctor` health check overhaul, (4) AI Engineering Coach rules import as content.

## Technical Context

**Language/Version**: TypeScript 5.7+, strict mode, ESM only
**Primary Dependencies**: citty (CLI), consola (log), child_process (hermes spawn), no new deps required
**Storage**: N/A (CLI tool, no persistent storage beyond filesystem)
**Testing**: Vitest unit + integration
**Target Platform**: Node.js >=20, Windows primary (Git Bash), cross-platform
**Project Type**: CLI tool (npm package)
**Performance Goals**: hermes wrapper <2s overhead, doctor <10s total
**Constraints**: No new npm dependencies without user approval; no hand-edits to generated files
**Scale/Scope**: Single-user CLI tool; rules import is 45 items one-time

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Source of Truth Discipline | PASS | All edits to `.claude/` sources. `npx clai-helpers sync` propagates. |
| II. Transformer, Not Fork | PASS | No new AI-tool targets. CLI commands are new subcommands, not transformers. |
| III. Protected Slots | N/A | No consumer customization needed. |
| IV. SemVer Discipline | PASS | Feature → MINOR bump (0.5.0 → 0.6.0). |
| V. Token Economy | PASS | Rules import augments existing sections; no new decorative files. |
| VI. Cross-AI Review Gate | PASS | This spec itself goes through the new two-phase review flow. |
| VII. Artifact Versioning | PASS | Stage tags via snapshot-stage scripts. |
| VIII. Self-Maintaining Knowledge | PASS | Two-phase review is a new self-maintaining mechanism. |

## Project Structure

### Documentation (this feature)

```text
specs/004-devx-bundle-v1/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── quickstart.md        # Phase 1 output
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Task breakdown (Phase 2)
```

### Source Code (repository root)

```text
packages/cli/src/
├── cli/
│   ├── hermes.ts           # NEW: hermes wrapper subcommand
│   ├── doctor.ts           # MODIFY: overhaul health check matrix
│   └── cli.ts              # MODIFY: register hermes subcommand
├── core/
│   └── health-checks.ts    # NEW: shared health check logic
├── types/
│   └── health.ts           # NEW: HealthCheck type definitions
└── tests/
    └── unit/
        ├── hermes.test.ts   # NEW: hermes command tests
        └── doctor.test.ts   # MODIFY: expanded doctor tests

.claude/
├── commands/
│   └── speckit.start.md    # MODIFY: update branch naming for two-phase
├── skills/
│   ├── code-review-checklist/SKILL.md  # MODIFY: augment with imported rules
│   └── lint-and-validate/SKILL.md      # MODIFY: augment with automatable rules
└── agents/ (no changes)

.specify/memory/
└── constitution.md         # MODIFY: add two-phase review principle

.github/
├── PULL_REQUEST_TEMPLATE/
│   ├── spec.md             # NEW: planning PR template
│   └── impl.md             # NEW: implementation PR template
└── workflows/
    └── ci.yml              # MODIFY: add path-filtered CI jobs

CLAUDE.md                   # MODIFY: augment guardrails section with imported rules
docs/
└── CREDITS.md              # NEW: attribution
vendor/
└── AI-Engineering-Coach-LICENSE  # NEW: MIT license copy

packages/cli/tests/
└── unit/
    ├── hermes.test.ts       # NEW
    └── doctor.test.ts       # NEW (replaces existing)
```

**Structure Decision**: Monorepo with CLI in `packages/cli/`. All `.claude/` source edits flow through `sync` to Copilot/Gemini targets. New files in `packages/cli/src/cli/` for hermes, modifications to existing `doctor.ts`.

## Complexity Tracking

> No constitution violations to justify. All changes align with existing patterns.

| Concern | Assessment | Resolution |
|---------|-----------|------------|
| Branch naming change (removing `feature/` prefix, removing `NNN-` numbering) | Breaking change to existing workflow | Acceptable: this repo is pre-1.0, MINOR bump covers it. Migration path documented in plan. |
| Rules import touches 3+ `.claude/` files | Potential token bloat | Rules are appended, not duplicated. Each rule is <200 chars in condensed format. 45 rules ≈ 9KB total. Acceptable. |

## Phase 0: Research

### R1: Hermes CLI invocation patterns

**Decision**: Use `child_process.spawn` with `hermes` binary. Arguments built from flags. Background mode uses `detached: true, stdio: 'ignore'` with log file redirect.

**Rationale**: `spawn` over `exec` for streaming support and background mode. No shell wrapping needed — hermes takes direct arguments.

**Alternatives considered**:
- `execa` npm package → rejected (no new deps rule)
- Shell wrapper script → rejected (cross-platform fragility)

### R2: MCP server health check mechanism

**Decision**: Attempt to spawn each MCP server binary with `--help` or similar flag to verify it exists. For configured MCP servers, attempt a simple `initialize` JSON-RPC call via stdio with a 3-second timeout. Mark "unknown" if binary not found or timeout.

**Rationale**: MCP servers use stdio transport. A basic `initialize` request with `{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}` verifies the server responds. 3-second timeout prevents hanging.

**Alternatives considered**:
- Skip MCP checks entirely → rejected (valuable diagnostic)
- Full MCP client integration → rejected (over-engineering for a health check)

### R3: AI-Engineering-Coach rule format translation

**Decision**: Each rule translated to 3-line format: `| **Rule Name** | Why it bites: <description>. Correct: <pattern> |`. Tables appended to existing guardrails section. Valera tone applied to descriptions where appropriate.

**Rationale**: Table format is scannable and matches existing guardrails table in CLAUDE.md. Keeps token cost low.

**Alternatives considered**:
- Verbatim copy → rejected (format mismatch, detection logic not relevant)
- Full rewrite per rule → rejected (unnecessary effort for 45 rules)

### R4: Two-phase review CI strategy

**Decision**: Use GitHub Actions path filters with `paths: ['specs/**']` for spec-only CI. Full CI for implementation PRs. A new workflow job `spec-ci` runs markdown lint + link check + analyze regen.

**Rationale**: Path-based filtering is the standard GitHub Actions approach. No additional tooling needed.

**Alternatives considered**:
- Separate workflow files → rejected (unnecessary duplication)
- Branch name-based filtering → rejected (less precise than path filters)

## Phase 1: Design

### Data Model

```typescript
// packages/cli/src/types/health.ts

interface HealthCheck {
  name: string;
  category: 'system' | 'tools' | 'mcp' | 'keys' | 'structure' | 'drift';
  status: 'pass' | 'warn' | 'fail' | 'unknown';
  detail: string;
  critical: boolean;  // true = exit 1 on fail
}

interface HermesConfig {
  prompt: string;
  model?: string;       // default: env.HERMES_DEFAULT_MODEL || 'glm/glm-5.1'
  provider?: string;    // default: 'custom'
  toolsets?: string;    // CSV passthrough
  verbose?: boolean;
  background?: boolean;
}

interface HermesResult {
  exitCode: number;
  pid?: number;         // only for background mode
  logPath?: string;     // only for background mode
}
```

### Contracts

#### `clai-helpers hermes` CLI Contract

```
USAGE:
  clai-helpers hermes [prompt]           # Direct prompt
  clai-helpers hermes --from-file <path> # Read from file
  echo "prompt" | clai-helpers hermes    # Stdin

FLAGS:
  --background          Spawn detached, print PID + log path
  --model <name>        Override model (default: glm/glm-5.1, env: HERMES_DEFAULT_MODEL)
  --provider <name>     Override provider (default: custom)
  --toolsets <csv>      Passthrough toolsets
  --verbose             Passthrough verbose
  --from-file <path>    Read prompt from file

EXIT CODES:
  0    Success (or background spawn success)
  127  Hermes binary not found
  *    Hermes's own exit code
```

#### `clai-helpers doctor` CLI Contract

```
USAGE:
  clai-helpers doctor           # Full health check matrix
  clai-helpers doctor --json    # Machine-readable JSON output
  clai-helpers doctor --quiet   # Failures only

CATEGORIES CHECKED:
  system     node>=20, npm, git, OS
  tools      gh (auth), hermes (version)
  mcp        context7, filesystem, github, sequential-thinking
  keys       ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, GH_TOKEN, ZHIPU/GLM
  structure  .claude/ dirs, frontmatter, orphan refs
  drift      clai-helpers status --strict

EXIT CODES:
  0    All critical checks pass
  1    One or more critical checks failed
```

### Architecture Update

No new technologies introduced. Changes to `specs/main/architecture.md`:
- §5 CLI Package Layout: add `hermes.ts` to subcommand list
- §5 CLI Package Layout: update `doctor.ts` description to "health check matrix"
- §6 SpecKit Integration: add `004-devx-bundle-v1` feature reference

### Quickstart

```bash
# 1. Hermes wrapper
clai-helpers hermes "explain the two-phase review flow"
clai-helpers hermes --from-file prompt.txt --model claude/claude-sonnet-4
clai-helpers hermes --background "long-running analysis" && echo "started"

# 2. Doctor
clai-helpers doctor              # colored matrix
clai-helpers doctor --json       # CI consumption
clai-helpers doctor --quiet      # only problems

# 3. Two-phase review (via speckit commands)
/speckit.start "add telemetry"   # creates specs/add-telemetry branch
# ... write spec, plan, tasks ...
# Open PR on specs/add-telemetry → AI review → merge
/speckit.implement               # creates add-telemetry branch with code

# 4. Rules import (one-time, already done)
# Content appears in CLAUDE.md guardrails section
npx clai-helpers sync            # propagate to Copilot/Gemini
```
