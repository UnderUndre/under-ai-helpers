# 2026-06-10 — claude — /speckit.full-plan for 006-ecosystem-parity

**Branch**: `specs/006-ecosystem-parity` · **Command**: `/speckit.full-plan`

## Done

Full plan + tasks pipeline for feature 006 (marketplace packaging, guard hooks, permission presets, skill evals, native SKILL.md, statusline, dialog archive).

## Key decisions (research.md R1–R11)

- Packs = **generated** plugin dirs (`packs/<id>/` + `.claude-plugin/marketplace.json`) from `helpers.config.ts#packs` mapping — Principle I/II preserved, drift check covers them for free.
- 8 domain packs mirroring Agent Routing; component single-ownership + `dependsOn` DAG validated at generation time (fail-loud, FR-003).
- Guard hooks = **Node `.mjs`**, single cross-platform implementation: destructive → `permissionDecision: "ask"` (per-invocation override), secrets → `"deny"` fail-closed; quoted-string stripping kills false positives.
- Permission presets + statusline delivered via new `helpers presets apply` (plugins can't ship settings); migration via new `helpers migrate` (hash-classify: identical / slot-modified / consumer-authored).
- Skill evals: co-located `evals.json`, N=3 vote ≥2/3, ratchet CI (`--changed` PR gate + weekly `--all`), top-10 backfill computed from reference counts.
- 4 empirical verifications deferred to T002 spike (manifest fields, native skills dirs, statusline stdin schema, plugin-root on Windows).

## Artifacts

`specs/006-ecosystem-parity/`: plan.md, research.md, data-model.md, quickstart.md, contracts/ (6 files), tasks.md (38 tasks, 10 phases, 6 agents). `specs/main/architecture.md` updated. Tags: `plan/006-ecosystem-parity/v1`, `tasks/006-ecosystem-parity/v1`.

## Issues flagged

- `.specify/scripts/powershell/common.ps1#Get-FeatureDir` doubles path (`specs/specs/...`) for Principle-IX branch names; worked around via `$env:SPECIFY_FEATURE`. Needs fix in both ps1 + sh ports.
- Stage tags created on pre-artifact HEAD (artifacts uncommitted per Standing Order #1) — after committing, re-run snapshot for v2 tags on the real tree.

## Next

`/speckit.analyze` → 2× external `/speckit.review` → `/speckit.implement` (Principle VI gate).
