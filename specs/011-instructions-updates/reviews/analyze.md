# SpecKit Analyze: 011-instructions-updates

**Reviewer**: analyze (Claude self-consistency, post-remediation re-run)
**Reviewed at**: 2026-07-05T13:30:00Z (after F1–F6 remediation)
**Commit**: cfe85f969bb6c1a9fe8cae43c3905f5b95e30a9a (working tree has uncommitted remediation edits)
**Artifacts**: spec.md, plan.md, tasks.md, data-model.md, contracts/, research.md, quickstart.md
**Prior reviews**: `reviews/claude.md` (self-critique, NOT a gate), `reviews/antigravity.md` (PASS, formal)

## Findings

| ID | Category | Severity | Status | Location(s) | Summary | Resolution |
|----|----------|----------|--------|-------------|---------|------------|
| F1 | Inconsistency | MEDIUM | **RESOLVED** | plan.md:L22 | Stale Gemini baseline `~951 lines` | Replaced with `665 lines (target ≤399). Canonical baseline per spec SC-005.` Aligns plan body with plan note (L171) and spec SC-005. |
| F2 | Inconsistency | MEDIUM | **RESOLVED** | research.md §1 (ResolveContext + resolver body) | Phase-0 design lacked `visited: Set<string>` cycle guard present in plan.md L122 + tasks T009 | Added `visited: Set<string>` to ResolveContext interface; added `context.visited.has(absolutePath)` check + `context.visited.add(absolutePath)` line in resolver body; added cycle-detection bullet to Resolution Rules. Phase-0 design now mirrors Phase-1 plan. |
| F3 | Coverage | MEDIUM | **RESOLVED** | spec.md FR-023 · tasks.md | FR-023 had zero dedicated verification task | Added T030 [VERIFY] [US5]: grep CLAUDE.md body for Russian persona tokens outside REF markers. Dependency T006→T030 added to graph, mermaid, Parallel Lanes (Lane 21), Agent Summary (VERIFY count 11→12), Agent Dispatch Plan. |
| F4 | Ambiguity | LOW | **RESOLVED** | spec.md SC-015 wording | Duplicated `copilot-instructions-ref.md` (copy-paste typo) | Replaced with explicit `persona copilot-instructions-ref.md and coding copilot-instructions-ref.md`. |
| F5 | Underspecification | LOW | **RESOLVED** | contracts/composition-contract.md | FR-022/SC-014 enforced only via tasks, no canonical contract statement | Added "Command Plane (FR-022 / SC-014)" section to composition-contract.md (3 invariants + cross-references to T009.1/T014.1/T028). Contractual symmetry restored. |
| F6 | Style | LOW | **RESOLVED** | data-model.md:L102 | Bare `security/` shorthand inconsistent with 20 canonical-path occurrences | Replaced with `.github/instructions/persona/security/`. |

### Notes on prior runs

- **My initial CRITICAL run (16 findings)**: all RESOLVED in working tree.
- **Antigravity F1–F4**: all RESOLVED (FR-022/SC-014 + T028/T009.1/T014.1, §7 relocation, visited:Set, baseline 665). F2 and F3 had been applied to plan+tasks only — now also applied to research.md (this run).
- **Claude self-critique (claude.md)**: correctly NOT counted toward Principle VI gate. Its concerns folded into spec (FR-023 = claude.md H3, baseline 665 = claude.md M1, visited:Set = implicit FR-004 feasibility guard).

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 through FR-022 | Yes | various | All covered |
| FR-023 (persona maintenance rule) | Yes | T030 (dedicated), T008 (generic backup) | Dedicated verify added (F3 fix) |
| SC-001 through SC-013 | Yes | various | All covered |
| SC-014 (command flatness) | Yes | T009.1, T014.1, T028 | + contract section (F5 fix) |
| SC-015 (Reference `.instructions.md` ban) | Yes | T029 | Wording corrected (F4 fix) |
| US1–US7 | Yes | various | All covered |

## Constitution Alignment Issues

| Principle | Status | Note |
|-----------|--------|------|
| I. Source of Truth | PASS | Canonical paths consistent across all artifacts (F6 fix). |
| II. Transformer, Not Fork | PASS | No new directory trees. |
| III. Protected Slots | PASS | T027 covers protected slots; T021 covers bespoke. |
| IV. SemVer Discipline | PASS | No API changes. |
| V. Token Economy | PASS | Net-positive. §7 relocation keeps Foundation ≤90. |
| VI. Cross-AI Review | **IN PROGRESS** | antigravity PASS (1/2 required). Claude self-critique does NOT count. Need 1 more external PASS from Codex/Gemini/Copilot. |
| VII. Artifact Versioning | PASS | Re-tag tasks/v2 + analyze/v3 recommended post-remediation. |
| VIII. Self-Maintaining | PASS | — |
| IX. Two-Phase Review | PASS | — |

## Unmapped Tasks

None. All 30 tasks (T001–T030 + sub-IDs T009.1, T014.1) map to at least one FR, SC, or US.

## Metrics

- Total Requirements: 23 FR + 15 SC + 7 US = 45
- Total Tasks: **30** (was 29; +T030)
- Coverage % (requirements with ≥1 task): **100%** (FR-023 now has dedicated T030)
- Ambiguity count: 0
- Duplication count: 0
- **CRITICAL count: 0**
- **HIGH count: 0**
- **MEDIUM count: 0**
- **LOW count: 0**

## VERDICT

```yaml
verdict: PASS
override_reason: null
reviewer: analyze
reviewed_at: 2026-07-05T13:30:00Z
commit: cfe85f969bb6c1a9fe8cae43c3905f5b95e30a9a
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
notes: |
  All findings from this run and prior runs RESOLVED.
  Artifact consistency verified across spec.md, plan.md, tasks.md,
  data-model.md, contracts/ (3 files), research.md.
  Antigravity external review: PASS (1 of 2 required gates).
  Ready for second external review (Codex/Gemini/Copilot).
  Recommended: snapshot tasks/v2 + analyze/v3 before next /speckit.review.
```
