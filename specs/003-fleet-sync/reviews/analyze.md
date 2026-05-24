# SpecKit Analyze: 003-fleet-sync

**Reviewer**: analyze (Claude self-consistency)
**Reviewed at**: 2026-05-08
**Commit**: ba99886e7c3fb0166a9c6c78f036c5c089159c60
**Artifacts**: spec.md, plan.md, tasks.md, data-model.md, contracts/{cli-commands,github-api-surface,config-schema}.md, research.md, quickstart.md, checklists/requirements.md

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| I1 | Inconsistency | MEDIUM | spec.md:92 (FR-006); tasks.md T020 ("pr-mode idempotent on existing-branch (returns succeeded with existing prUrl)") | Spec FR-006 lists "open PR for the same bump already exists (mode `pr`)" as a SKIP case; T020 specifies the same scenario returns `succeeded` with existing `prUrl`. Two conflicting semantic outcomes for the identical input. | Pick one: (a) treat existing-PR as `succeeded` (idempotent semantics — recommended; nothing went wrong, the bump is already in-flight) and update FR-006 to remove that bullet, OR (b) treat as `skipped` and update T020 + data-model `SyncOutcome` accordingly. |
| I2 | Inconsistency | MEDIUM | spec.md:99 (FR-013); contracts/cli-commands.md `fleet add-org/remove-org`; tasks.md T024 | FR-013 says new orgs are added "via a flag without editing config files by hand"; the actual contract delivers them via `fleet add-org <org>` / `fleet remove-org <org>` subcommands. Subcommand ≠ flag (different ergonomics, different help surface). Terminology drift between spec and contracts. | Update FR-013 to read "via a dedicated subcommand (`fleet add-org`/`fleet remove-org`) without editing config files by hand". The subcommand form is the correct, idiomatic call — keep contracts/tasks as-is and align the spec wording. |
| U1 | Underspecification | MEDIUM | spec.md (no mention of `--dry-run`); contracts/cli-commands.md `fleet sync` synopsis flags; tasks.md T021 ("confirm prompt skipped on `--yes`/`--dry-run`") | The `--dry-run` flag is documented in the CLI contract and referenced in T021's behavior, but spec.md never mentions it as a requirement or assumption. Implementation will deliver a feature the spec doesn't acknowledge. | Add a new functional requirement (FR-015) covering dry-run: "System MUST support `--dry-run` mode that performs discovery, selection resolution, and plan output but performs zero mutations (no clones, no pushes, no PR creation, no patch writes); intended for verification before a real run." |
| U2 | Underspecification | MEDIUM | spec.md (no mention of `--patch-output`); contracts/cli-commands.md (`--patch-output <dir>`); contracts/config-schema.md (`patchOutputDir`); tasks.md T019 (`<patchOutputDir>/<owner>__<repo>.patch`) | `patchOutputDir` (config) + `--patch-output` (flag) appear in plan/contracts/data-model/tasks. Spec mentions "patch file output" only conceptually inside FR-010. Where the patch file lands is implicitly user-configurable but not stated as a requirement in the spec. | Add a sentence to FR-010 (`patch` mode description): "The output directory defaults to `./.fleet-patches/` under the working directory and is overridable via `patchOutputDir` in user config or `--patch-output <dir>` flag." |
| I3 | Inconsistency | MEDIUM | data-model.md `FleetErrorCode` (lists both `git/push-rejected` and `git/branch-protected`); tasks.md T018 (bundles both as `reason: "git/branch-protected"`) | Data model differentiates two distinct push-failure causes (non-fast-forward vs branch-protection-rejection). T018's task description bundles them under a single error code (`git/branch-protected`), losing the distinction. A non-fast-forward failure (upstream advanced between clone and push) would be misreported as a branch-protection issue. | Rewrite T018's failure-handling sentence: "surface push-rejected as `SyncOutcome === 'skipped'`; if the underlying git error indicates branch protection, set `reason: 'git/branch-protected'`; otherwise set `reason: 'git/push-rejected'`. Detection by inspecting git stderr for known sentinels (`protected branch`, `non-fast-forward`)." |
| A1 | Ambiguity | LOW | spec.md:79 ("Network unavailable" edge case); data-model.md "Exit code derivation" (codes 0/1/2/3) | Edge case "Network unavailable" says "Exit non-zero with clear 'GitHub unreachable' message" without specifying whether this maps to exit code 2 (usage) or 3 (rate-limited / API-unreachable). Data-model exit-code section also doesn't enumerate this case. | In data-model.md `exitCode()` derivation, add: "exit 3 also applies when GitHub API is wholly unreachable (DNS failure, connection refused, all retries exhausted) — same family as rate-limited: 'transient external dependency, retry later'". |
| A2 | Ambiguity | LOW | spec.md:92 (FR-006 — "write conflict against latest default-branch HEAD") | "Write conflict" is undefined in the spec. Could mean: (a) git non-fast-forward push, (b) base ref moved between clone and PR creation (only relevant in fast-moving repos), (c) something else. Task T018 doesn't explicitly handle this case. | Either delete the "write conflict" clause (covered transitively by I3's push-rejected handling) or define it explicitly: "write conflict = `git push` exits non-zero with `non-fast-forward` indication, meaning the default branch advanced after the ephemeral clone fetched it." |
| G1 | Coverage Gap | LOW | spec.md SC-004 ("80% reduction in cd+sync invocations per quarter") | SC-004 is a usage-outcome metric not directly verifiable in code. No task targets it (no telemetry/instrumentation). Acceptable for an outcome metric, but worth flagging that it cannot fail the implementation gate. | Mark SC-004 as observational in the spec ("post-release self-report metric, no automated verification"). Optionally add a `/learn` candidate to surface this metric in `/speckit.retrospective`. |

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 (discover via GitHub API) | ✅ | T004, T008 | github-api wrapper + discovery orchestrator |
| FR-002 (list view tabular) | ✅ | T010, T012 | table renderer + list command handler |
| FR-003 (interactive multi-select picker) | ✅ | T014, T021 | picker wrapper + sync handler invokes it |
| FR-004 (non-interactive flags) | ✅ | T023 | extends sync.ts with --all/--repo/--filter |
| FR-005 (sequential sync) | ✅ | T021 | "sequential mode dispatch" |
| FR-006 (skip semantics) | ⚠️ partial | T017, T018, T019, T020 | Mode handlers return `skipped`; see I1, I3 inconsistencies |
| FR-007 (final summary) | ✅ | T021 | builds SyncSession + emits summary |
| FR-008 (exit code zero/non-zero) | ✅ | T012, T021 | exitCode() per data-model.md |
| FR-009 (list strictly read-only) | ✅ | T012, T013 | command + E2E asserts no mutation |
| FR-010 (three sync modes) | ✅ | T017, T018, T019, T021 | pr/push/patch + mode resolution; see U2 (patch-output detail missing in spec) |
| FR-011 (last-sync from git history) | ✅ | T004, T008 | readLastCommitForPath + discovery |
| FR-012 (auth required) | ✅ | T012, T021 | resolveAuth() reuse + exit 2 path |
| FR-013 (configurable scope) | ⚠️ | T006, T024 | covered, but spec wording says "flag" while delivery is subcommand — see I2 |
| FR-014 (rate-limit handling) | ✅ | T004, T005 | retry impl + 403 retry test |
| SC-001 (perf 5s/10s) | ✅ | T028 | benchmark task |
| SC-002 (30s usability) | ⚠️ implicit | T012, T013 | inherent in output design; not directly tested |
| SC-003 (95% no data loss) | ✅ | T015, T016, T026 | ephemeral cleanup + SIGINT + failure-isolation E2E |
| SC-004 (80% reduction) | ❌ observational | — | see G1 |
| SC-005 (failure isolation) | ✅ | T021, T026 | continue-on-failure dispatch + E2E |

**Coverage**: 14/14 functional requirements (100% with 2 partial flagged) + 4/5 success criteria with verifiable tasks (SC-004 by design observational).

## Constitution Alignment Issues

(None.)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Source of Truth Discipline | ✅ PASS | Feature lives in `packages/cli/src/{cli,core}/fleet/`. No `.claude/` edits planned. |
| II. Transformer, Not Fork | ✅ PASS (N/A) | Not a transpile target. No new transformer. |
| III. Protected Slots | ✅ PASS (N/A) | Doesn't mutate managed-file semantics; PR/push artifacts are bumps, not new slots. |
| IV. SemVer 0.x | ✅ PASS | Plan acknowledges minor bump on release; tasks don't pre-bump. |
| V. Token Economy | ✅ PASS | `packages/cli/` only; no `.claude/` files; no `ultrathink` markers added. |
| VI. Cross-AI Review Gate | ✅ PASS | Tasks acknowledge `/speckit.implement` blocks until analyze.md PASS + ≥2 external reviewer PASS. This file is gate 1; reviews/{codex,antigravity,gemini,copilot}.md (≥2) are gate 2. |
| VII. Artifact Versioning | ✅ PASS | Snapshot-stage tagging is procedural in `/speckit.*` commands themselves; no parallel `.history/` files in feature artifacts. |
| VIII. Self-Maintaining Knowledge | ✅ PASS | T030 references `/learn` for capturing implementation gotchas. No conflict with mechanisms. |

## Unmapped Tasks

(None.)

Every task in T001–T030 maps to at least one functional requirement, success criterion, or pipeline-stage gate. Polish-phase tasks (T027 subcommand registration, T029 README, T030 knowledge capture) are scaffolding that supports the FRs they wire together; T028 directly enforces SC-001.

## Metrics

- Total Requirements (FR): 14
- Total Success Criteria (SC): 5
- Total Tasks: 30
- Coverage % (FR with ≥1 task): 100% (14/14, 2 partial)
- Coverage % (SC with verifiable task): 80% (4/5; SC-004 observational by design)
- Ambiguity count: 2 (A1, A2 — both LOW)
- Duplication count: 0
- Underspecification count: 2 (U1, U2 — both MEDIUM)
- Inconsistency count: 3 (I1, I2, I3 — all MEDIUM)
- Coverage-Gap count: 1 (G1 — LOW)
- Constitution-violation count: 0
- Routing-violation count: 0
- CRITICAL count: 0
- HIGH count: 0
- MEDIUM count: 5
- LOW count: 3

## VERDICT

```yaml
verdict: PASS
reviewer: analyze
reviewed_at: 2026-05-08
commit: ba99886e7c3fb0166a9c6c78f036c5c089159c60
critical_count: 0
high_count: 0
medium_count: 5
low_count: 3
```

**Gate decision**: PASS per the heuristic (zero CRITICAL + zero HIGH). All MEDIUM/LOW findings are tractable spec/task wording adjustments — they should be resolved before `/speckit.implement` for cleaner execution but do not block the gate. None require architectural rework.

**Next gate** (Constitution Principle VI): `/speckit.review` from ≥2 distinct external AI reviewers (Codex Desktop, Antigravity, Gemini CLI, Copilot, or independent Claude session) writing PASS or OVERRIDDEN verdicts to `specs/003-fleet-sync/reviews/<provider>.md`. After both gate verdicts are PASS, `/speckit.implement` unblocks.
