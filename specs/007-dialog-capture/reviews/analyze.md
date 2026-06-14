# SpecKit Analyze: 007-dialog-capture (post-external-review integration)

**Reviewer**: analyze (Claude self-consistency)
**Reviewed at**: 2026-06-14T20:00:00Z (third pass, post external reviews + remediation)
**Commit**: 4dd8e4fbbb82a4d72f0f8ec1575bb72b2ff92532 (HEAD on `main`; spec artifacts still uncommitted due to repo submodule conflicts)
**Artifacts**: all 11 + two external review files (`reviews/claude.md`, `reviews/gemini.md`) integrated

**Pass history**:
1. 2026-06-14T00:00:00Z — verdict CRITICAL (1 critical, 10 medium, 5 low). User requested remediation.
2. 2026-06-14T12:00:00Z — verdict PASS (post-self-remediation; 0/0/2 accepted LOW).
3. **External reviews** (claude.md verdict HIGH w/ 5 HIGH + 2 MED + 1 LOW; gemini.md verdict HIGH w/ 1 HIGH + 2 MED + 2 LOW) — user invoked `/fix_from_review`.
4. This pass — verdict below (post external-review remediation).

**Reviewer bias disclosure**: this is the third pass by the same model that wrote spec/plan/tasks/data-model/contracts. The external reviews (claude.md from independent Claude Opus 4.8 session, gemini.md from Gemini) caught **6 issues the self-review dismissed or missed entirely**, validating Constitution Principle VI ("the model that wrote the spec is the worst auditor of the spec"). Most notably:

- **L1 (self-review)** was "Stop hook per-turn spawn cost — acceptable, monitoring only". External reviews (claude.md F5 + gemini.md F1, independent) caught the actual problem: in-process Map is invisible across detached spawns → N watchers per N-turn session → corruption risk. L1 was a papered-over dismissal, not analysis. Reclassified to HIGH and fixed.
- **F1/F4/F7** (claude.md) are factual, repo-grounded errors the self-review could not have caught without reading `packages/underboard/src/` (which it did not): the spec's Out-of-Scope falsely claimed "doesn't change underboard API", 008 backend is not in code, `tools/memory.ts` does not exist.

## External-review remediation summary

### Claude.md (verdict HIGH → resolved)

| External ID | Severity | Resolution | Verification |
|-------------|----------|------------|--------------|
| F1 — Parent-contract drift (`memory_recall` schema extension violates 008/FR-001) | HIGH | ✅ **Major redesign**: route dialog recall through new dedicated tools `dialog_recall`, `dialog_recall_cross_project`, `dialog_delete` (new FR-023/024/025/026). 005/008 `memory_*` schema frozen + untouched. spec US4 rewritten (7 acceptance scenarios including contract-boundary scenario 7). contracts/ingestion-pipeline.md §"Project-scoped recall" + §"Recall schema" rewritten. tasks.md T028/T029 → new files in `tools/dialog/`, T050 added for cross-project tool. | grep `dialog_recall` in spec.md returns new FRs + US4; grep `memory_recall routes type=dialog` returns 0. |
| F2 — Cross-entity recall fusion undefined | HIGH | ✅ **Resolved via F1 fix**: separate tools → separate K per type → no fusion needed. SC-004 now measures `dialog_recall` in isolation, not a hypothetical merged path. | SC-004 wording updated; "K=5 matching 008" framing removed (was misleading). |
| F3 — `sessions:search` endpoint unprobed | HIGH | ✅ Added **V8** to research.md + spec.md Verification Items table. Probe procedure specified (4 candidate endpoints, response shape, content-coverage check). T028 (`dialog_recall` authoring) MUST NOT start before V8 resolves. If V8 fails, US4 descoped. | research.md §V8; spec.md Verification Items table now has V7 + V8 rows. |
| F4 — 008 backend absent from code | HIGH | ✅ Added **Phase 6 gate** to tasks.md Prerequisites + Phase 6 header. Spec Assumptions updated. Two-cut shipping plan documented (007a capture-only, 007b ingest/recall). Gate verification: `grep -ri honcho packages/underboard/src` must return ≥1 hit. | tasks.md Prerequisites + Phase 6 header; spec.md Assumptions. |
| F5 — Watcher process leakage | HIGH | ✅ Cross-process pidfile singleton at `~/.underboard/dialog-watch/<session_id>.pid`. Subsequent Stop hooks ping existing watcher via `.ping` file (no re-spawn). Stale-pidfile reclaim via PID-liveness check. contracts/capture-hook.md rewritten. T008 description updated. | contracts/capture-hook.md §"Concurrent session handling + cross-process watcher singleton (F5 fix)"; tasks.md T008 description. |
| F6 — `captured_at` determinism contradiction | MEDIUM | ✅ `captured_at` now read from `raw/<file>.meta.json` sidecar (persisted finalize-trigger time, written once), not from `Date.now()` at normalizer run time. Explicit **idempotency key** definition: body `content_hash`, excluding volatile frontmatter. SC-012 ("only changed records appear in git diff") now actually true. | contracts/normalized-record.md §"Determinism + idempotency key (F6 fix)"; data-model.md entity 3 `captured_at` field. |
| F7 — Wrong file path (`tools/memory.ts` doesn't exist) | MEDIUM | ✅ T028 → `tools/dialog/recall.ts` (new dir); T029 → `tools/dialog/delete.ts`; T050 → `tools/dialog/recall-cross.ts`. Dispatch plan + lane 5 updated. Verified: `Test-Path tools/memory.ts` = False; real layout is `tools/memory/{recall,delete,write,...}.ts` per-file. | tasks.md T028/T029/T050 + lane 5 + dispatch row. |
| F8 — Peer-id collision (`dialog-capture` namespace) | LOW | ✅ Reserved prefix `__dialog-capture__` (double-underscore convention signals synthetic). contracts/ingestion-pipeline.md mapping table + data-model.md entity 12 updated. | grep `__dialog-capture__` in contracts + data-model. |

### Gemini.md (verdict HIGH → resolved)

| External ID | Severity | Resolution | Verification |
|-------------|----------|------------|--------------|
| F1 — Watcher process leakage | HIGH | ✅ Same as claude.md F5 (independent confirmation). | Same fix. |
| F2 — Backfill vs retention race | MEDIUM | ✅ Added `--skip-pruning` flag to `dialog-backfill` (contracts/cli-commands.md). Bypasses retention for the current run only; normal `keep-N-sessions` + `size-cap-MB` resume on next forward capture. Use during initial setup or audit windows. | contracts/cli-commands.md §"`helpers dialog-backfill`" flags table + behavior step 6. |
| F3 — Redaction FP baseline tuning | MEDIUM | ✅ First-ingestion dry-run guidance added to quickstart.md scenario 2. New install policy: dry-run first → tune allowlist → real backfill with `--skip-pruning`. | quickstart.md §"FP baseline probe + first-ingestion dry-run". |
| F4 — Truncation threshold 32KB too conservative | LOW | ✅ Default bumped **32 KB → 64 KB** across spec FR-003, contracts/capture-hook.md config schema, data-model.md config table. 8 KB–1 MB range unchanged. 005's 64 KB soft payload comfortably accommodates the new default. | grep `65536` / `64 KB` in spec + contracts + data-model; grep `32768` returns 0. |
| F5 — Redaction log side-channel | LOW | ✅ Documented in contracts/normalized-record.md §"Side-channel acknowledgment (gemini.md F5)": acceptable trade-off for auditability, mitigations listed (purge-log, tracked-file disclosure surface, optional `redaction-log-detail: minimal` config). | contracts/normalized-record.md redaction log section. |

### Self-review L1 reclassification

- **L1 (initial)**: "Stop hook per-turn spawn cost — acceptable, monitoring only". LOW.
- **L1 (post-external-review)**: reclassified → **HIGH (resolved)**. The self-review missed that the in-process Map is invisible across detached spawns, making the dedup logic broken. External reviews (claude.md F5 + gemini.md F1, independent) caught this. Fix: F5 pidfile singleton.

This is a documented lesson for future `/speckit.analyze` runs: **process-cost dismissals need cross-process reasoning, not just per-invocation accounting**.

## Findings (post all remediations)

None CRITICAL. None HIGH. None MEDIUM. LOW count: 0 (L1 reclassified+fixed; L5 still plan-correct-deferred as before).

## Coverage Summary (post all remediations)

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 through FR-022 | ✅ | T001–T048 | Unchanged from prior pass |
| FR-023 (dialog_recall tool) | ✅ | T028 | NEW (F1 fix) |
| FR-024 (DialogRecallResult schema) | ✅ | T028 | NEW (F1 fix) |
| FR-025 (dialog_delete tool) | ✅ | T029 | NEW (F1 fix) |
| FR-026 (dialog_recall_cross_project tool) | ✅ | T050 | NEW (F1 fix) |

**Coverage rate**: 26/26 FRs explicitly covered (100%, was 24/24; +4 new FRs from F1 redesign). All 12 SCs covered. SC-002 still deferred to T019 per V5 (empirical).

## Constitution Alignment Issues

| Principle | Status | Notes |
|-----------|--------|-------|
| I–IX | ✅ All aligned | Unchanged from prior pass. F1 fix actually strengthens alignment: 008/FR-001 (frozen `memory_*` contract) was being silently violated; now respected via separate `dialog_*` tool family. |
| VI — Cross-AI review gate | ✅ **VALIDATED** | Two independent external reviews (claude.md + gemini.md) caught 6+ issues self-review dismissed or missed. Constitution Principle VI working as designed. |

## Unmapped Tasks

None. All 50 tasks (T001–T050) map to at least one FR or operational need.

## Metrics (post all remediations)

- Total Requirements: 26 FRs + 12 SCs = 38 (was 36; +4 new FRs from F1 redesign)
- Total Tasks: 50 (was 49; +1 for T050 cross-project dialog tool)
- Coverage % (FRs with ≥1 explicit task): 100%
- Ambiguity count: 0
- Duplication count: 0
- CRITICAL count: **0**
- HIGH count: **0**
- MEDIUM count: **0**
- LOW count: **0 active** (L1 reclassified+fixed; L5 plan-correct-deferred per V5)

## VERDICT

```yaml
verdict: PASS
reviewer: analyze
reviewed_at: 2026-06-14T20:00:00Z
commit: 4dd8e4fbbb82a4d72f0f8ec1575bb72b2ff92532
pass_history:
  - timestamp: 2026-06-14T00:00:00Z
    verdict: CRITICAL
    notes: "Initial — SC-001 timing inconsistency"
  - timestamp: 2026-06-14T12:00:00Z
    verdict: PASS
    notes: "Post self-remediation — 0/0/2 accepted LOW"
  - timestamp: 2026-06-14T20:00:00Z
    verdict: PASS
    notes: "Post external-review remediation — claude.md (5H+2M+1L) + gemini.md (1H+2M+2L) all resolved; L1 self-dismissal reclassified + fixed; F1 forced major redesign (separate dialog_* tool family, +4 FRs, +1 task)"
external_reviews_integrated:
  - provider: claude
    file: reviews/claude.md
    original_verdict: HIGH (5H/2M/1L)
    findings_resolved: 8/8 (F1-F8)
  - provider: gemini
    file: reviews/gemini.md
    original_verdict: HIGH (1H/2M/2L)
    findings_resolved: 5/5 (F1-F5)
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
blocking: false
constitution_validation: "Principle VI validated — external reviews caught 6+ issues self-review dismissed. Two independent PASSes now required from same external providers (re-review post-remediation) OR ≥2 NEW provider PASSes."
next_gate: "Re-review by claude + gemini (or 2 new providers) on the post-remediation artifacts. Their original verdicts were HIGH; the F1 redesign + F4 gate + F5 pidfile + F7 file-path fixes are material changes that warrant re-validation."
```
