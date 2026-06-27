# SpecKit Analyze: 011-user-level-adaptation

**Reviewer**: analyze (Claude self-consistency)
**Reviewed at**: 2026-06-27T18:05:00+03:00 (re-run after remediation pass)
**Commit**: 2a99cf664e133e2a98c76bfc0fe49b33ace3f60d (working tree dirty: gemini-bot fixes + FR-023 oracle removal + analyze remediation, all pending commit)
**Artifacts**: spec.md, plan.md, tasks.md, research.md, data-model.md, contracts/ (9 contracts + index), quickstart.md (not re-audited this pass)

## Findings

> **Re-run status**: all 12 findings from the 2026-06-27T17:43:40 pass were remediated inline (see "Remediation Log" below). This pass re-scanned the post-remediation artifacts and found **zero new findings**. The table below preserves the original finding IDs with their resolved status for audit continuity; no open rows remain.

| ID | Category | Severity | Status | Resolution Summary |
|----|----------|----------|--------|--------------------|
| A1 | Inconsistency / convention | MEDIUM | RESOLVED | plan.md:44 + §Complexity Tracking now accurately cite the branch as `spec/011-user-level-adaptation` (not `011-…`) and re-justify the IX deviation on the corrected premise. spec.md:3 branch declaration left as-is — the override path covers the drift; renaming the branch mid-cycle was rejected as higher-risk per plan.md. |
| C1 | Constitution alignment | HIGH | RESOLVED | Same edit as A1 — the override-rationale factual basis is now correct. The `--override-gate` string in plan.md:44 carries the accurate branch name. |
| E1 | Coverage gap | HIGH | RESOLVED | T037 now has a Step 0 preflight: assert `helpers.config.ts` defines the `speckit` target with `transformer: "identity"` + `match: ".specify/**/*"`. Verified empirically at helpers.config.ts:82-90 (target exists, parameters match). The assertion is a regression guard against future drift. |
| E2 | Coverage gap | MEDIUM | RESOLVED | T018 now asserts SC-007 (CASCADE-verified zero rows + no orphaned sync/export files post-forget). T029 now asserts SC-003 (`git status --porcelain` empty after profile init in a git fixture), SC-005 (two-project differentiation, no cross-leak), and FR-014 (corrupt-row degrades to neutral default, no throw). |
| F1 | Inconsistency | MEDIUM | RESOLVED | T020 now names `last_inference_at` + `signals_since_last_eval` with the reset rule (stamp timestamp + zero counter on eval fire; never bump on config/scale/sync writes). T022b now states it increments the counter on each signal write and delegates the tick decision to T020. |
| F2 | Inconsistency | MEDIUM | RESOLVED | T019 now states the `DEFAULT 30` is owned by migration 004 at the DB layer (FR-015) and the service MUST NOT null the column on insert unless the user explicitly selects "forever". |
| F3 | Inconsistency | LOW | RESOLVED | profile-sync.md pull bullet now carries a "Source-of-truth rule": on successful pull, the imported row's `sync_encryption_salt` + `sync_pbkdf2_iterations` are set from the file header (file is authoritative for its own crypto); local row never re-derived. |
| F4 | Inconsistency | LOW | RESOLVED | profile-sync.md:6 overview now cross-refs the envelope contract below for where the KDF parameters travel. |
| F5 | Inconsistency | LOW | RESOLVED | tasks.md Critical Path recomputed: `T001 → … → T034 → T031 → T032`. T035 confirmed parallel (gated only by T034+T024+T028, does not gate T032). Correction explained inline. |
| G1 | Agent routing | LOW | RESOLVED | [BE] dispatch row updated: "single `sync_encryption_salt` + `sync_pbkdf2_iterations`", explicit "NO `sync_passphrase_hash`/`sync_passphrase_salt` columns, do not re-introduce the brute-force oracle", D009 marked superseded. |
| G2 | Agent routing | LOW | NO-ACTION | Lane audit passed on the prior pass; nothing to fix. |
| D1 | Duplication | LOW | RESOLVED | research.md D007 rationale now cross-refs FR-015 (was incorrectly tagged FR-018) + data-model.md:19 + T019. D009 already cross-refed FR-023 from the prior pass. |
| (new) SC-004 / SC-006 coverage | Coverage gap | MEDIUM | RESOLVED | SC-004 (mode-switch latency ≤1 interaction) now asserted in T035. SC-006 (sync < 1 min user effort) now asserted in T028 as a soft-bound timing check. |

**No new findings** on this re-run. All originally-open severities are closed.

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 (per-project profile) | Yes | T004, T006 | Core |
| FR-002 (adapt explanation depth) | Yes | T010-T013, T033 | Skill-side |
| FR-003 (neutral default + calibration offer) | Yes | T013 (skill), T014 (test) | — |
| FR-004 (local storage, git-excluded) | Yes | T001 (migration), underboard store reuse | SC-003 now asserted (T029) |
| FR-005 (anonymized export) | Yes | T015, T016 | — |
| FR-006 (≥4 assessment modes) | Yes | T008 (config), T020, T022 | — |
| FR-007 (mode switch preserves data) | Yes | T008, T035 | T035 explicit + SC-004 latency |
| FR-008 (auditable signals) | Yes | T021 | — |
| FR-009 (N-signal re-eval cadence) | Yes | T020, T022b | Lazy-tick state fields named in T020/T022b |
| FR-010 (per-project scoping, stable_key) | Yes | T004 (profile-service), underboard reuse | — |
| FR-011 (sync mechanism) | Yes | T026, T027 | — |
| FR-012 (conflict surfacing) | Yes | T026, T027 | — |
| FR-013 (forget/remove + revocation tracking) | Yes | T017, T018 | SC-007 now asserted (T018) |
| FR-014 (safe degrade on corruption) | Yes | T029 | Corruption-degrades assertion added |
| FR-015 (retention policy, default 30) | Yes | T019, migration 004 | DB DEFAULT ownership documented in T019 |
| FR-016 (3/5/continuous scale switch) | Yes | T005, T008 | — |
| FR-017 (sub-domain expansion) | Yes | T008, T025 | — |
| FR-018 (vendor-neutral encrypted file transport) | Yes | T026 | — |
| FR-019 (hybrid proposal + staleness) | Yes | T008 (accept/reject), T020 (proposal write) | — |
| FR-020 (canonical domain vocabulary) | Yes | T008 | — |
| FR-021 (record-signal capture tool) | Yes | T022b | Counter increment + tick delegation explicit |
| FR-022 (skill registration, BOTH paths) | Yes | T033 | — |
| FR-023 (sync crypto, no oracle) | Yes | T026, T036 | T036 negative assertion (a.1) + dispatch hint guards against re-introduction |
| FR-024 (.specify CLI distribution) | Yes | T037 | Preflight assertion on helpers.config.ts |
| SC-001 (80% probe match) | Yes | T030 | Rubric defined |
| SC-002 (75% + distinguishable) | Yes | T030 | — |
| SC-003 (100% git exclusion) | Yes | T029 | `git status --porcelain` assertion |
| SC-004 (mode switch latency) | Yes | T035 | Next-call latency assertion |
| SC-005 (per-project differentiation) | Yes | T029 | Two-project no-leak assertion |
| SC-006 (sync < 1min + conflict surfacing) | Yes | T028 | Soft-bound timing assertion + conflict detection |
| SC-007 (no recoverable data post-forget) | Yes | T018 | Zero-rows + no-orphan-files assertion |

**Coverage: 31/31 requirements (24 FR + 7 SC) now have ≥1 task with explicit assertions where the SC demanded measurable behavior.** Up from 93.5% on the prior pass.

## Constitution Alignment Issues

- **Principle IX (Two-Phase Review Flow)** — DEVIATION acknowledged in plan.md §Constitution Check. Override rationale now factually accurate (branch cited as `spec/011-user-level-adaptation`). The override path remains required at `/speckit.implement` via `--override-gate`; the audit trail will now carry correct facts. No open constitution issue.

- **Principle VI (Cross-AI Review Gate)** — NOT evaluable by this command (it produces the analyze half). For the implement gate: post-remediation artifacts have **zero valid external reviewer PASS verdicts** — `reviews/trae.md` verdict was against superseded commit 7fdaf53 (per claude.md F12), `reviews/claude.md` is a self-review not an external reviewer, and the pass-2 crypto change plus this remediation pass invalidate any prior FR-023 coverage. The implement gate will need ≥2 fresh external reviewer PASS verdicts (Codex/Antigravity/Gemini CLI/Copilot — distinct providers) against the final commit.

- **Principle VII (Artifact Versioning)** — Not checked here; snapshot-stage runs at the pipeline-stage level.

- All other principles (I-VIII): no violations detected.

## Unmapped Tasks

All 38 tasks (T001-T037 + T022b) map to at least one FR or SC. No orphan tasks. No uncovered SCs remain.

## Metrics

- Total Requirements: 24 FRs + 7 SCs = 31
- Total Tasks: 38 (T001-T037 + T022b)
- Coverage % (requirements with ≥1 task): **100%** (31/31; up from 93.5%)
- Ambiguity count: 0
- Duplication count: 0 (D1 cross-refs added, no longer drift risk)
- CRITICAL count: 0
- HIGH count: 0
- MEDIUM count: 0
- LOW count: 0

## VERDICT

```yaml
verdict: PASS
override_reason: ~
reviewer: analyze
reviewed_at: 2026-06-27T18:05:00+03:00
commit: 2a99cf664e133e2a98c76bfc0fe49b33ace3f60d
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
notes: >
  All 12 findings from the 2026-06-27T17:43:40 MEDIUM run were remediated inline
  (see Remediation Log). Re-scan of post-remediation artifacts found zero new
  findings. Coverage rose to 100% (31/31 FR+SC), with every measurable SC now
  backed by an explicit test assertion. Principle IX deviation is acknowledged
  and its override rationale is now factually accurate. Principle VI remains
  open for the implement gate: ≥2 fresh external reviewer PASS verdicts are
  required on the final commit (post-pass-2 crypto + this remediation), because
  prior reviews predate the FR-023 revision. Ready for /speckit.review.
```

## Remediation Log

| Finding | Files Touched | Summary |
|---------|---------------|---------|
| A1 + C1 | plan.md:44, plan.md:135 | Branch name corrected to `spec/011-user-level-adaptation`; override string + Complexity Tracking re-justified on accurate premise. |
| E1 | tasks.md T037 | Step 0 preflight: assert `speckit` target in helpers.config.ts (verified at :82-90). |
| F1 | tasks.md T020, T022b | Lazy-tick fields named; reset/increment rules stated. |
| F2 | tasks.md T019 | DB DEFAULT 30 ownership documented; service MUST NOT null. |
| E2 | tasks.md T018, T029 | SC-007, SC-003, SC-005, FR-014 assertions added. |
| SC-004 | tasks.md T035 | Mode-switch next-call latency assertion. |
| SC-006 | tasks.md T028 | Sync round-trip soft-bound timing assertion. |
| F3 | contracts/profile-sync.md | Pull source-of-truth rule (file header wins on successful pull). |
| F4 | contracts/profile-sync.md:6 | Envelope cross-ref from overview. |
| F5 | tasks.md:313 | Critical Path recomputed with T031; T035 confirmed parallel. |
| G1 | tasks.md [BE] dispatch | "sync salts" plural removed; oracle-warning added; D009 marked superseded. |
| D1 | research.md D007 | FR-015 cross-ref corrected (was FR-018); data-model.md/T019 pointers added. |

**Verification**: `npm run validate` clean; `npm test` 302/302 passed. No code artifacts changed in this remediation pass — only spec/plan/tasks/contracts/research docs.
