# SpecKit Review: 007-dialog-capture

**Reviewer**: gemini
**Reviewed at**: 2026-06-14T14:30:00Z
**Commit**: 4dd8e4fbbb82a4d72f0f8ec1575bb72b2ff92532
**Artifacts reviewed**: spec.md, plan.md, tasks.md, data-model.md, contracts/, quickstart.md, research.md, constitution.md

## Summary

The specification and plan for 007-dialog-capture are exceptionally thorough, addressing the complex lifecycle of dialog transcripts from capture to semantic recall. The layered approach (raw -> normalized -> ingested) provides a solid balance between privacy, auditability, and leverage. However, the current design of the capture trigger via the `Stop` hook introduces a significant risk of resource exhaustion (process leakage) if cross-process deduplication is not explicitly handled in the watcher implementation. Additionally, the interaction between historical backfill and aggressive retention policies needs more careful handling to avoid accidental data loss during initial setup.

## Findings

| ID | Severity | Area | Finding | Recommendation |
|---|---|---|---|---|
| F1 | **HIGH** | Reliability | **Watcher Process Leakage**: The `Stop` hook fires after every turn (potentially dozens of times per session). Since the hook spawns a detached CLI process for the watcher, and each spawn is a new process, the current plan lacks a cross-process mechanism to detect if a watcher is already active for a given `session_id`. This will result in N processes watching the same file for an N-turn session. | Implement a singleton check in `watcher.ts` using a lockfile or PID file (e.g., in `.ai/dialogs/raw/.partial/<session_id>.pid`) to ensure only one watcher is active per session. |
| F2 | **MEDIUM** | Operations | **Backfill vs. Retention Race**: `dialog-backfill` (T038) applies retention policies immediately. A user backfilling their entire history might find that `keep-N-sessions` (default 30) immediately deletes the raw transcripts for most of the newly-discovered sessions before they can even be audited. | Add a `--skip-pruning` flag to `dialog-backfill` or implement a "protection window" for newly backfilled sessions so they aren't pruned in the same run. |
| F3 | **MEDIUM** | Security | **Redaction False Positives**: While allowlists are mentioned, the default regex catalog is prone to high false-positive rates on codebases with heavy mock data or test fixtures (T019). Over-redaction can degrade the utility of the semantic search. | Add a "reporting" or "dry-run" mode to the initial capture pipeline that flags high-confidence vs. low-confidence redactions, allowing the user to tune the allowlist before the first large ingestion. |
| F4 | **LOW** | Performance | **Truncation Threshold**: The 32 KB default for `.md` records (FR-003) is quite conservative. While frontmatter summaries are preserved, developers searching the log archive via `grep` or standard editors may miss the "meat" of longer architectural discussions. | Consider increasing the default to 64 KB or 128 KB, as the underboard payload budget (1 MB) can easily accommodate larger text files. |
| F5 | **LOW** | Security | **Redaction Log Side-Channel**: The redaction log confirms the existence and type of secrets. While the secret itself is gone, the "scent" remains for any malicious actor who gains access to the repo. | This is an acceptable trade-off for auditability, but should be noted in the "Security notes" of the documentation. |

## Alternative approaches considered

**Ping-based Watcher**: Instead of a long-lived chokidar process, the hook could simply update a "last seen" timestamp in a registry. A single global `underboard` worker could then scan the registry and finalize any session that hasn't been "pinged" in 5 minutes. This would eliminate the need for N per-session processes. However, the current "detached watcher" approach is better for real-time finalization and local-only operation without `underboard` running.

## VERDICT

```yaml
verdict: HIGH
reviewer: gemini
reviewed_at: 2026-06-14T14:30:00Z
commit: 4dd8e4fbbb82a4d72f0f8ec1575bb72b2ff92532
critical_count: 0
high_count: 1
medium_count: 2
low_count: 2
```
