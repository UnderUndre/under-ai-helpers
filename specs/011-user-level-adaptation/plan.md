# Implementation Plan: User-Level Knowledge Adaptation

**Branch**: `011-user-level-adaptation` | **Date**: 2026-06-25 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/011-user-level-adaptation/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build a user-level knowledge adaptation subsystem as an extension of the underboard MCP server (`packages/underboard/`). The subsystem stores per-project knowledge profiles (private, local-first, git-excluded `~/.underboard/` store), supports four assessment modes (self-declared, AI-inferred, hybrid, calibration quiz), enables per-project and optionally per-sub-domain level scoping, and provides optional multi-machine sync via an encrypted file transport. AI agents (Claude, Gemini, Codex) consult the profile via MCP tools to adapt explanation depth, vocabulary, and assumed prior knowledge. The agent-side adaptation behavior is codified as a new `.claude/skills/knowledge-adaptation/` skill.

This is a pure extension of the existing underboard server — no new packages, no new language, no new framework. The underboard's local-first SQLite store, MCP tool registry, project detection via `stable_key`, and sync plumbing are all reused.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20+ LTS), matching `packages/underboard/tsconfig.json`  
**Primary Dependencies**: better-sqlite3 (existing), `@modelcontextprotocol/sdk` (existing), Node.js `crypto` module for encryption, consola (existing for logging)  
**Storage**: SQLite via better-sqlite3 at `~/.underboard/data.db` — new migration `004_knowledge_profiles.sql` for profile tables, signal sets, sub-domain expansions, sync metadata  
**Testing**: vitest (same as underboard) with a temporary SQLite in-memory DB pattern  
**Target Platform**: Node.js 20+ (local MCP server, localhost only)  
**Project Type**: Extension of existing standalone MCP tool server (`packages/underboard/`)  
**Performance Goals**: Single-user; MCP tool latency for profile reads < 50ms (SQLite local query). Inference re-evaluation runs on a **lazy write-path tick**: triggered when `profile_record_signal` is called AND the count of new signals since the last evaluation crosses the configured threshold N (default N to be set in tasks, FR-009 cadence); additionally, `profile_get` triggers a cheap staleness check (re-evaluate only if new-signal-since-last-eval ≥ N). There is no setInterval timer in the MCP server process (avoids background-process lifecycle/battery issues), no per-interaction re-eval, and no reliance on a session-end signal the server does not have.  
**Constraints**: All profile data MUST be local-first and excluded from git by default (underboard store is `~/.underboard/` — structurally outside any git tree); sync MUST be opt-in with a vendor-neutral encrypted file transport as the default; offline operation unaffected  
**Scale/Scope**: Single-user, N projects with independent profiles; per-sub-domain expansion optional per project

No NEEDS CLARIFICATION — all technical decisions are derivable from the existing codebase architecture (underboard MCP server, SQLite migrations, MCP tool pattern, vitest testing) and the spec's explicit constraints.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Pre-design Verdict**: CLEAR. No violations.

**Post-design Re-evaluation (Phase 1 complete)**: No new violations introduced. The skill `knowledge-adaptation` is justified under Principle V (Token Economy) — it is the essential agent-side bridge, AND it is actually wired to consumers (FR-022: CLAUDE.md one-liner + agent frontmatter registration), so it earns its token cost by being loaded. Principle VII snapshot will run after this file. **Principle IX deviation acknowledged** — see below. **Verdict**: CLEAR-with-override.

- **Principle I (Source of Truth)**: No violation. This feature does not touch `.claude/` → downstream generated files flow. The new `.claude/skills/knowledge-adaptation/` is a source-of-truth addition (editable in `.claude/`, regenerated downstream).
- **Principle II (Transformer)**: No violation. No new AI-tool target.
- **Principle III (Protected Slots)**: No violation. No hand-editing of generated files.
- **Principle IV (SemVer)**: Not applicable at plan stage.
- **Principle V (Token Economy)**: Conditional → now satisfied. Adding a skill `knowledge-adaptation` adds ~5 files to `.claude/skills/`. Justified: this skill is the essential agent-side bridge — without it, agents don't know to query or respect the knowledge level. Per FR-022 the skill is registered both via a CLAUDE.md one-liner (always-loaded) and the domain agents' `skills:` frontmatter, guaranteeing it is actually invoked. The skill earns its weight by being loaded in every session where the feature is active.
- **Principle VI (Cross-AI Review)**: Will be enforced at `/speckit.implement` — no action now.
- **Principle VII (Artifact Versioning)**: Will snapshot after this plan completes.
- **Principle VIII (Self-Maintaining)**: No violation. Feature does not add learning infrastructure.
- **Principle IX (Two-Phase Review)**: **DEVIATION — override required.** The prior text claimed the bare-slug branch `011-user-level-adaptation` was "grandfathered." That claim was false on two counts (per `reviews/analyze.md` C1): (a) the branch is `011-…`, not `feature/011-…`; (b) the feature was created 2026-06-25, one month *after* Principle IX was ratified (constitution v1.5.0, 2026-05-25), so the grandfather clause ("branches that exist before the change") cannot apply. 011 is a new feature and Principle IX's MUST (planning artifacts on `specs/<slug>`, implementation on `<slug>` from main) applies. Rather than disruptively move all artifacts to a new `specs/011-…` branch mid-cycle, this plan records the deviation honestly and will pass `--override-gate "Principle IX: bare-slug branch used for 011; false-grandfather claim corrected in plan.md; artifacts live on 011-user-level-adaptation, implementation will branch from main per IX spirit"` at `/speckit.implement`, logged to `reviews/_gate-override.md`. Future features MUST use the two-phase `specs/<slug>` → `<slug>` pattern.

**Verdict**: CLEAR-with-override (Principle IX deviation documented, override to be requested at implement gate).

## Project Structure

### Documentation (this feature)

```text
specs/011-user-level-adaptation/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
# Extension of underboard MCP server — Option 1: Single project layout adapted
packages/underboard/
├── src/
│   ├── knowledge/                          # NEW — knowledge adaptation module
│   │   ├── profile-service.ts              # Profile CRUD, level projection, sub-domain expansion
│   │   ├── inference-engine.ts             # Signal accumulation + level inference (inferred/hybrid modes)
│   │   ├── quiz-engine.ts                  # Calibration quiz logic
│   │   ├── signal-retention.ts             # Configurable signal retention policy (off/30d/90d/forever)
│   │   ├── export-service.ts               # Anonymized export + forget/remove
│   │   └── sync-service.ts                 # Encrypted file transport + conflict resolution
│   ├── storage/
│   │   ├── migrations/
│   │   │   └── 004_knowledge_profiles.sql  # NEW — profile tables, signals, sub-domains, sync metadata
│   │   └── (existing files unchanged)
│   ├── tools/
│   │   ├── knowledge/                      # NEW — MCP tools for profile access
│   │   │   ├── profile-get.ts              # Get profile (level + mode + sub-domain)
│   │   │   ├── profile-set.ts              # Set self-declared level
│   │   │   ├── profile-config.ts           # Configure mode, retention, scale, sub-domain, accept/reject proposal
│   │   │   ├── profile-signals.ts          # Expose auditable signals (inferred/hybrid)
│   │   │   ├── profile-record-signal.ts    # NEW (FR-021) — append observed signal to the set (the capture path; without it inferred/hybrid run on an empty table)
│   │   │   ├── profile-quiz.ts             # Trigger/serve calibration quiz
│   │   │   ├── profile-export.ts           # Export anonymized profile
│   │   │   ├── profile-forget.ts           # Destroy profile + track revocation
│   │   │   └── profile-sync.ts             # Trigger sync operation (atomic write, distinct error codes)
│   │   └── knowledge/index.ts              # Tool registration barrel
│   ├── server/
│   │   └── mcp-server.ts                   # MODIFIED — register all 9 knowledge_profile_* tools via server.tool(...) (was "unchanged"; H1 fix)
│   ├── cli/
│   │   └── (existing + new profile commands)
│   └── ... (existing files unchanged)
├── tests/
│   ├── knowledge/                          # NEW — unit tests
│   │   ├── profile-service.test.ts
│   │   ├── inference-engine.test.ts
│   │   ├── quiz-engine.test.ts
│   │   ├── export-service.test.ts
│   │   ├── sync-service.test.ts
│   │   └── signal-retention.test.ts
│   └── integration/
│       └── knowledge-profile.test.ts       # NEW — end-to-end MCP tool integration

# Agent-side adaptation skill — new entry in .claude/ (source of truth)
.claude/skills/knowledge-adaptation/
├── SKILL.md                                # Main skill definition
├── level-scale.md                          # 3-step / 5-step / continuous scale reference
├── assessment-modes.md                     # How each mode affects agent behavior
└── explanation-patterns.md                 # Reference patterns: beginner/intermediate/expert explanation templates
```

**Structure Decision**: The underboard MCP server already follows a modular structure (`src/storage/`, `src/tools/`, `src/cli/`). The knowledge subsystem adds a new `src/knowledge/` service layer (separate from `src/tools/` to keep tool definitions thin — they delegate to services). The new migration file slots into the existing sequential migration pattern. The agent-side skill lives in `.claude/skills/knowledge-adaptation/` following the existing skill package convention (directory with `SKILL.md` + supporting files).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

- **Principle IX deviation**: This feature's planning artifacts live on the bare-slug branch `011-user-level-adaptation` instead of the required `specs/011-user-level-adaptation` planning branch.
- **Why not corrected in-place**: Re-branching mid-cycle would churn all existing review/snapshot references and create more process risk than value for this already-reviewed feature.
- **Mitigation**: The deviation is documented in `plan.md §Constitution Check`, and `/speckit.implement` must use `--override-gate "<reason>"` so the exception is explicit and logged to `reviews/_gate-override.md`.
- **Future rule**: New features MUST use the two-phase `specs/<slug>` → `<slug>` branch pattern with no grandfather claim.
