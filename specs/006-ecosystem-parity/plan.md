# Implementation Plan: Ecosystem Parity — Packaging, Enforcement & Quality Gates

**Branch**: `specs/006-ecosystem-parity` | **Date**: 2026-06-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-ecosystem-parity/spec.md`

## Summary

Close six distribution/enforcement gaps versus the 2026 Claude Code ecosystem: (1) ship the curated catalog as a **plugin marketplace** of 8 domain packs generated from `.claude/` by the existing pipeline; (2) replace prompt-text Standing Orders #3/#6/#7 with **harness-enforced Node guard hooks** (ask-on-destructive, deny-on-secrets, post-edit lint feedback); (3) ship **permission presets** applied via a new `helpers presets apply`; (4) gate CI with **skill trigger evals** (ratchet: changed skills + top-10 backfill); (5) deliver skills **unchanged (native SKILL.md)** to capable targets, driven by a target capability matrix; (6) ship a **statusline preset**; plus (7) finish the `.ai/dialogs/` archival scaffold. Technical approach: everything new is either `.claude/` source content, a pipeline-generated tree (`packs/`, `marketplace.json`), or a CLI subcommand (`migrate`, `presets`) — no new architecture, no new runtime dependencies beyond what `package.json` already carries.

## Technical Context

**Language/Version**: TypeScript 5.7+ (strict, no `any`), Node.js ≥20, ESM only
**Primary Dependencies**: citty (CLI), consola (log), c12+defu (config), giget (fetch), pathe (paths), @inquirer/prompts (confirm), vitest (tests) — **no new dependencies planned**
**Storage**: filesystem only (generated trees, JSON manifests, lock/journal via existing `core/`)
**Testing**: Vitest unit + integration; golden fixtures for every transformer/assembler output (Principle II corollary); scripted guard-violation suite (SC-002)
**Target Platform**: Windows (primary dev), macOS, Linux — consumer machines may lack POSIX shell (drives Node-based hooks, FR-013)
**Project Type**: monorepo — npm CLI (`packages/cli`) + curated config template (`.claude/`) + CI workflows
**Performance Goals**: `regen` incl. pack assembly stays <2s on ~300 source files (existing budget, requirements.md §2.2); `status` <1s; eval CI job <5 min on a typical changed-skill PR
**Constraints**: offline-capable CLI paths unchanged; eval runner is the only network consumer (CI-only, keyed); no secrets in code/logs (Standing Order #4)
**Scale/Scope**: 27 agents / ~43 skills / 75 commands partitioned into 8 packs; ~10 eval-gated skills at release; 6 CLI-affecting changes, 2 new subcommands

## Constitution Check

*GATE: evaluated pre-Phase-0; re-evaluated post-Phase-1 (see bottom of section).*

| Principle | Verdict | Note |
|-----------|---------|------|
| I — Source of Truth | ✅ PASS | `packs/` + `.claude-plugin/marketplace.json` are **generated** from `.claude/` + `helpers.config.ts#packs` mapping. Never hand-edited. |
| II — Transformer, Not Fork | ✅ PASS | Pack assembly = new pipeline stage in `packages/cli/src/core/packs/`, reusing `identity` transformer + manifest generation. No duplicated trees maintained by hand. |
| III — Protected Slots | ✅ PASS | `migrate` classifies slot-modified files and preserves them; `presets apply` merges (never clobbers) consumer settings. |
| IV — SemVer 0.x | ✅ PASS | CLI changes are `feat(cli):` → MINOR bumps via `/bump`. Template-only edits don't bump. |
| V — Token Economy | ✅ PASS | Packs are the *mechanism* for SC-003 (≥50% context cut for single-pack consumers). Evals (FR-009) enforce that shipped skills actually earn their place. |
| VI — Cross-AI Review Gate | ✅ PASS (process) | After this plan + tasks: `/speckit.analyze` + ≥2 external reviews before `/speckit.implement`. |
| VII — Artifact Versioning | ✅ PASS | `snapshot-stage.ps1 -Stage plan|tasks -Slug 006-ecosystem-parity` run at each stage. |
| VIII — Self-Maintaining | ✅ PASS | Eval gate + capability matrix institutionalize knowledge that currently lives in heads/comments. |
| IX — Two-Phase Review | ✅ PASS | Planning on `specs/006-ecosystem-parity` (spec-only artifacts); implementation branch `006-ecosystem-parity` cut from `main` after planning PR merges. |

**Known infra defect (not a violation)**: `.specify/scripts/powershell/common.ps1#Get-FeatureDir` doubles the path (`specs/specs/...`) for Principle-IX branch names (`specs/<slug>`). Worked around via `$env:SPECIFY_FEATURE`; fix tracked outside this feature.

**Post-Phase-1 re-check (2026-06-10)**: design artifacts introduce no new projects, no new dependencies, no hand-maintained mirrors. Complexity Tracking stays empty. ✅ GATE PASS.

## Project Structure

### Documentation (this feature)

```text
specs/006-ecosystem-parity/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R11, deferred verifications V1–V4
├── data-model.md        # Phase 1 — entities: Pack, Marketplace manifest, Guard rule, …
├── quickstart.md        # Phase 1 — consumer walkthrough (install pack → guards → presets)
├── contracts/           # Phase 1 — JSON schemas + CLI/hook contracts
│   ├── marketplace-manifest.schema.json
│   ├── pack-manifest.schema.json
│   ├── packs-config.schema.json
│   ├── skill-eval.schema.json
│   ├── guard-hook-io.md
│   └── cli-commands.md
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit.tasks output)
```

### Source Code (repository root)

```text
helpers.config.ts                  # + packs section (membership mapping, skillsNative flags)
.claude-plugin/marketplace.json    # GENERATED — marketplace catalog
packs/<pack-id>/                   # GENERATED — 8 plugin dirs (.claude-plugin/plugin.json + content)

.claude/
├── hooks/
│   ├── guard-destructive.mjs      # NEW — PreToolUse ask-gate (Standing Orders #3/#6)
│   ├── guard-secrets.mjs          # NEW — PreToolUse deny (Standing Order #7)
│   └── post-edit-feedback.mjs     # NEW — PostToolUse format/lint feedback
├── skills/<name>/evals.json       # NEW — co-located trigger eval cases (top-10 backfill)
└── settings.json                  # + guard hook registration

presets/
├── permissions.json               # NEW — allow/deny preset payload
└── statusline.mjs                 # NEW — statusline script payload

packages/cli/src/
├── core/packs/
│   ├── assemble.ts                # NEW — pack tree + manifest generation from mapping
│   ├── validate.ts                # NEW — cross-pack reference/dependency validator
│   └── types.ts                   # NEW — Pack, PackConfig, CapabilityMatrix types
├── cli/migrate.ts                 # NEW — legacy → packs migration (FR-014)
├── cli/presets.ts                 # NEW — presets apply/--dry-run (FR-008, FR-011)
└── cli/doctor/checks/packs.ts     # NEW — installed-pack dependency check (R9)

packages/cli/tests/
├── unit/packs/                    # assembler + validator units
├── integration/migrate.test.ts    # migration scenarios incl. slot preservation
├── integration/guards.test.ts     # scripted violation suite (SC-002)
└── fixtures/golden/packs/         # golden fixtures for generated pack output

scripts/skill-evals.mjs            # NEW — eval runner (catalog build, N=3 vote)
.github/workflows/skill-evals.yml  # NEW — ratchet CI gate + weekly full run
docs/target-capabilities.md        # NEW — native-vs-converted matrix per target
.ai/dialogs/{raw,log}/ + INDEX.md  # EXISTS — finish gitignore split + entry template
```

**Structure Decision**: Single monorepo, existing layout. All additions slot into established homes: pipeline logic → `packages/cli/src/core/`, subcommands → `packages/cli/src/cli/`, shippable template content → `.claude/` + `presets/`, generated trees → repo root (same tier as `.github/`, `.gemini/`). No new package, no web/mobile split.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
