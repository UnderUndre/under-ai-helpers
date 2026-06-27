# Contracts: User-Level Knowledge Adaptation

This directory defines the MCP tool contracts for the knowledge adaptation subsystem. Each tool is implemented as a module under `packages/underboard/src/tools/knowledge/` and follows the existing underboard MCP tool pattern (`Input` interface → function → `Output` interface).

## Tool Summary

| Tool | Input | Output | Purpose |
|------|-------|--------|---------|
| [profile-get](profile-get.md) | `{ domain? }` | `{ exists, level, assessment_mode, sub_domains }` | Read active profile for project |
| [profile-set](profile-set.md) | `{ level, domain? }` | `{ success, profile_id, created }` | Set self-declared level |
| [profile-config](profile-config.md) | `{ assessment_mode?, display_scale?, sync_enabled?, sync_transport?, retention_days?, inference_threshold_n?, expand_domain?, collapse_domain?, accept_proposed_revision?, reject_proposed_revision? }` | `{ success, effective, pending_proposal? }` | Configure profile / sync settings / accept-reject hybrid proposal |
| [profile-signals](profile-signals.md) | `{ limit?, domain? }` | `{ available, summary, derivation, recent_signals }` | Expose auditable signals |
| [profile-record-signal](profile-record-signal.md) | `{ signal_type, signal_value, domain?, metadata? }` | `{ success, signal_id, triggered_evaluation, retained_signal_count }` | Append observed signal (the capture path for inferred/hybrid) |
| [profile-quiz](profile-quiz.md) | `{ action, question_id?, answer? }` | varies by action | Calibration quiz lifecycle |
| [profile-export](profile-export.md) | `{ domains? }` | `{ artifact, hash }` | Anonymized export |
| [profile-forget](profile-forget.md) | `{ confirm }` | `{ success, deleted_rows, exports_revoked }` | Destroy profile |
| [profile-sync](profile-sync.md) | `{ action, resolution?, options? }` | varies by action | Multi-machine sync (atomic, distinct error codes) |

## User Story Mapping

| User Story | Primary Tools |
|------------|---------------|
| US1 — Adaptive Explanation | `profile-get` (consumed by agents) |
| US2 — Private Storage | `profile-export`, `profile-forget`, `profile-set` (git-excluded store) |
| US3 — Assessment Mode | `profile-config`, `profile-quiz`, `profile-signals`, `profile-record-signal` |
| US4 — Per-Project Context | `profile-get` (with domain parameter), `profile-config` (expand/collapse domain) |
| US5 — Sync | `profile-sync` |

## Non-MCP Interface: Knowledge Adaptation Skill

The agent-side adaptation behavior is NOT an MCP tool. It is codified as a `.claude/skills/knowledge-adaptation/` skill that teaches agents:

1. At session start: call `knowledge_profile_get` to read the active level
2. Adjust explanation depth, vocabulary, and assumed prior knowledge to match
3. Respect mode-specific behavior (self-declared = never override; hybrid = propose; inferred = auto-update)
4. Offer calibration when no profile exists (US1 acceptance scenario 3)
5. Expose on-demand level info to the user (FR-008)
6. In inferred/hybrid modes: after each interaction, call `knowledge_profile_record_signal` to capture observed cues (FR-021) — without this, the signal set stays empty and inference never produces a level

**Skill registration (FR-022)** — a skill file that no agent loads is inert. The skill is registered via BOTH:
- a one-line directive in `CLAUDE.md` (always-loaded) instructing the assistant to call `knowledge_profile_get` and consult the skill at session start, AND
- the skill name `knowledge-adaptation` in the `skills:` frontmatter of the domain agents that produce explanations (at minimum: the generalist orchestrator and any specialist agents designated as explainers).

See `plan.md §Source Code > .claude/skills/knowledge-adaptation/` for the file tree.
