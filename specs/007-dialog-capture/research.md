# Research: 007-dialog-capture

**Phase 0 output of `/speckit.plan`** · resolves spec verification items V1–V6 + locks technology decisions that gate Phase 1 design. Each item: Decision · Rationale · Alternatives · Verification status.

## V1 — Claude Code session-end hook availability

**Decision**: **File-watch with inactivity-timeout finalization is the primary trigger.** A complementary `Stop` hook (turn-level, fires when main agent finishes responding) provides a "user might be done" hint that resets the inactivity timer; the actual finalization fires after `N` minutes (default 5) of no transcript growth. There is no clean SessionEnd event exposed by Claude Code.

**Rationale**: Claude Code's documented hook surface (per `~/.claude/settings.json` schema and CC docs) covers `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Notification`, `Stop`, `SubagentStop`, `PreCompact`. None of these is a session-end event:
- `Stop` is per-turn (main agent finished a response) — fires dozens of times per session.
- Process-exit detection is OS-specific, fragile, and races with crash recovery.
- CC writes its transcript to `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl` continuously (append-only). That file's growth/cessation is the most reliable signal available.

This **clarifies the spec's FR-017 "primary/fallback" ordering rather than flipping it**: file-watch is the implementation's active path because V1 confirms `no SessionEnd` is the always-true case; the spec's conditional wording is preserved for forward-compatibility (if CC adds SessionEnd in a future release, the probe re-evaluates). User-visible behavior is identical — raw file appears within `(inactivity-timeout-minutes + 5s)` of last CC activity per the revised SC-001.

**Alternatives considered**:
- *Stop-hook with counter heuristic* (after K consecutive Stops with no UserPromptSubmit → session done): brittle, breaks on long single-prompt sessions.
- *Process watcher on CC's PID*: requires knowing CC's PID from inside a hook (not exposed); OS-specific (Windows job objects vs POSIX process groups); rejected as fragile.
- *Manual `/dialog-capture` slash command only*: violates FR-001 ("no user action"); rejected.

**Verification status**: ✅ Resolved (empirical — CC hook surface confirmed via CC docs + `settings.json` schema). Updates FR-017 wording.

---

## V2 — Claude Code transcript JSONL schema stability

**Decision**: Treat the CC JSONL schema as **stable enough for defensive parsing, not as a versioned contract**. The normalizer MUST parse defensively: read each line as JSON, extract known fields by name (not position), ignore unknown block types, and emit a `schema-warnings` count in the normalized record header when unknown fields appear.

**Rationale**: CC's transcript JSONL has a consistent shape across releases observed 2024–2026:

```jsonl
{"type":"user","uuid":"...","parentUuid":"...","timestamp":"2026-...","message":{"role":"user","content":[{"type":"text","text":"..."}]}}
{"type":"assistant","uuid":"...","parentUuid":"...","timestamp":"2026-...","message":{"role":"assistant","content":[{"type":"text","text":"..."},{"type":"tool_use","id":"...","name":"Bash","input":{...}}],"model":"claude-...","usage":{...}}}
{"type":"user","uuid":"...","parentUuid":"...","timestamp":"2026-...","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"...","content":"..."}]}}
```

Fields used by the normalizer: `type`, `uuid`, `parentUuid`, `timestamp`, `message.role`, `message.content[]` (block types: `text`, `tool_use`, `tool_result`, `thinking`, `image`), `message.model`, `message.usage`. No explicit `schema_version` field — evolution is implicit via field presence.

**Alternatives considered**:
- *Pin to a specific CC version*: impossible — CC auto-updates and the transcript format isn't version-gated.
- *Reject transcripts with unknown fields*: too strict — would block normalization on every CC feature drop.
- *Strict schema validation with Zod at parse time*: useful as a DEBUG-mode check, but production path must be defensive.

**Verification status**: ✅ Resolved (empirical — observed via local CC install). Adds a "defensive parsing" requirement to the normalizer contract.

---

## V3 — underboard payload limits vs long CC transcripts

**Decision**: **Chunk at the Honcho Session boundary** (see V4). One CC session = one Honcho Session; each CC message becomes one Honcho Message within that Session. The 005 per-entry limit (64 KB soft / 1 MB hard) applies to a single Message — typical CC messages are well under this. The local normalized `.md` file truncates at `dialog-normalized-max-bytes` (32 KB default) with a raw pointer, so the tracked file never exceeds the soft limit. Underboard's lexical store indexes the normalized `.md` body; Honcho indexes the full Message stream.

**Rationale**: A 6-hour CC session can produce 5–50 MB of JSONL. Storing that as a single memory entry would blow the 1 MB hard limit and produce unrecallable blobs. Honcho's Session/Message model (V4) sidesteps this: Session is a container with no per-instance size limit; each Message is a discrete searchable unit. Recall granularity = Message level (user turn, assistant turn, tool call+result), which is what an agent actually wants when querying "what did we say about X?".

**Alternatives considered**:
- *Single memory entry per session, truncated*: loses everything past the truncation point; recall useless for long sessions.
- *Split by N-message chunks*: arbitrary boundary; cuts mid-thought.
- *Summary-only ingest*: loses audit fidelity (US2 hybrid format would be pointless).

**Verification status**: ✅ Resolved (architectural). Honcho's Session/Message model is the natural fit.

---

## V4 — Honcho Session entity behavior

**Decision**: **Use Honcho Session + Message as the dialog representation.** One Honcho Session per CC session (title = CC session's derived theme + date); one Honcho Message per CC message (preserving role, timestamp, content blocks). Conclusions (008's `memory_write` representation) stay for hand-written notes; dialogs use Sessions — they're structurally different artifacts (conversations vs facts).

**Rationale**: Honcho v3 (verified via local Docker stack live-probe 2026-06-13) exposes:
- `POST /v3/workspaces/{workspace_id}/sessions` — create session (title, metadata)
- `POST /v3/workspaces/{workspace_id}/sessions/{session_id}/messages` — add message (sender_id, content)
- `GET /v3/workspaces/{workspace_id}/sessions/{session_id}/messages` — list
- Search endpoints span Session + Conclusion content

This was the representation 008 explicitly reserved: *"sessions unused by this feature (reserved for 007 dialog ingestion)"*. Sessions support search/recall natively, so US4's `memory_recall` works by routing dialog-typed queries to Honcho's session-search endpoint.

**Alternatives considered**:
- *Conclusion-per-CC-message*: conflates two semantic layers (decided facts vs conversational exchanges); breaks 008's Conclusions API contract for `memory_write`.
- *Single Conclusion-per-CC-session*: same payload-limit problem as V3-alt-1; loses Message-level recall granularity.

**Verification status**: ✅ Resolved (architectural + empirical via Honcho v3 probe).

---

## V5 — Redaction policy false-positive baseline

**Decision**: **Defer FP measurement to first implementation task (T0XX in tasks.md).** Ship the default regex catalog with documented expected-FP patterns (test fixtures, mock constants, env-var names that look like keys). Provide an allowlist mechanism for legitimate contexts. Run an FP-baseline task on a sample of real CC transcripts from this repo before declaring SC-002 met.

**Rationale**: FP rate depends entirely on the corpus. A repo with heavy test coverage for auth code will have high FP without allowlist; a docs-only repo will have near-zero FP. The spec can't pin a number; the implementation must measure and tune.

**Documented expected-FP patterns** (default catalog must allowlist or document):
- `AKIAIOSFODNN7EXAMPLE` (AWS docs canonical example) — allowlist as `EXAMPLE` suffix.
- `eyJhbGciOiJIUzI1...` JWT test fixtures — allowlist by surrounding `// TEST TOKEN` markers or path match `tests/**`.
- `ssh-rsa AAAAB3Nza...test...` SSH public keys (not private) — distinguishable from private key blocks (`-----BEGIN ... PRIVATE KEY-----`).
- Phone-number-shaped constants in IDs (e.g., user IDs `15551234567`) — allowlist when field name indicates ID.

**Alternatives considered**:
- *Pre-pin FP rate <1%*: unverifiable in spec; sets up implementation for failure.
- *Skip FP tracking*: violates SC-002's "false-positive rate documented and tunable".

**Verification status**: ⚠️ Deferred to first implementation task. Plan includes T0XX "Seed FP baseline corpus + measure initial FP rate" as the gate before SC-002 sign-off.

---

## V6 — Claude Code own-log retention

**Decision**: **Pruning in `.ai/dialogs/raw/` is safe** — CC keeps transcripts in `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl` indefinitely (no automatic rotation observed). Pruning in our `raw/` layer is never destruction of the only copy; CC's own log remains the source of truth until the user manually purges it (which is outside our control).

**Rationale**: Empirical observation on local CC install — transcripts from months-old sessions are still on disk. CC does not document a retention policy; behavior is "keep until user clears `~/.claude/projects/`". This means:
- FR-009's retention policy can prune aggressively without losing data permanently.
- `dialog-backfill` (FR-019) can reach back arbitrarily far in time.
- Re-normalization (FR-022) of a pruned-raw record uses the persisted normalized `.md` as the source of truth (the raw is gone, but the normalized form survives because it's tracked).

**Edge case**: if the user clears CC's own log AND our `raw/` was pruned, the session is unrecoverable. Acceptable — that's a deliberate user action against two independent stores.

**Verification status**: ✅ Resolved (empirical).

---

## V7 — Honcho v3 DELETE semantics (added 2026-06-14 post-analyze)

**Decision**: Treat Honcho DELETE as **soft-delete with cascade** based on empirical probe (extends V4). `DELETE /v3/workspaces/{ws}/sessions/{id}` removes the Session and cascades to its Messages; the operation is recoverable within Honcho's retention window (configurable server-side, default 30 days). For tombstone semantics (FR-008), the tombstone is the authoritative "this content_hash must never be re-ingested" record; Honcho's own soft-delete is defense-in-depth, not the contract.

**Rationale**: Live-probe 2026-06-14 of local Honcho v3.0.9 confirmed:
- `DELETE /v3/workspaces/{ws}/sessions/{id}` returns 204 immediately.
- Subsequent `GET /v3/workspaces/{ws}/sessions/{id}` returns 404 (Session is hidden from listing + recall).
- Honcho server-side retention policy (configured in `docker-compose.yml` → `HONCHO_RETENTION_DAYS=30`) controls when soft-deleted rows are physically purged.
- Messages under a deleted Session are also hidden (cascade confirmed).

**Implications for partial-ingest cleanup (M5 finding)**:

If `memory_delete` is called mid-ingest (some Messages posted to Honcho Session before the delete request):
1. Worker detects the in-flight ingest via `dialog_outage_spool.honcho_session_id` state.
2. Worker completes the in-flight ingest (idempotent via Honcho metadata check — re-POSTs are no-ops for Messages already present).
3. Worker issues `DELETE` on the Honcho Session → cascade-removes all Messages (posted-or-not).
4. Tombstone inserted by content_hash → prevents re-ingestion from re-normalization.

If `memory_delete` is called BEFORE any ingest started (Honcho Session never created):
1. Tombstone alone suffices.
2. Outage spool row marked `status='tombstoned'` without ever calling Honcho DELETE.

**Alternatives considered**:
- *Treat Honcho DELETE as hard*: would force a Honcho version-pin + behavior contract that the upstream may break. Soft-delete is the realistic assumption.
- *Don't cascade; DELETE each Message individually*: N+1 calls per session; rejected.
- *Purge via direct DB access*: bypasses Honcho's API; rejected (breaks abstraction).

**Verification status**: ✅ Resolved via empirical probe of local Honcho v3.0.9 stack. Updates contracts/ingestion-pipeline.md §"`memory_delete` integration".

---

---

## V8 — Honcho v3 `sessions:search` endpoint (added 2026-06-14 post-external-review claude.md F3)

**Decision**: **DEFERRED to pre-implementation probe.** The endpoint `POST /v3/workspaces/{ws}/sessions:search` (or its actual Honcho v3 equivalent) is the most load-bearing dependency in US4 (every `dialog_recall` call routes through it) and the **least empirically grounded**. V4's 2026-06-13 probe asserted "search endpoints span Session + Conclusion content" without concretely recording request shape, response shape, or whether search covers Message content vs session metadata only. External review (claude.md F3) correctly flagged this.

**Rationale**: Honcho v3's API surface (Google-AIP-style colon-action routes) is documented loosely. The `sessions:search` path was assumed based on convention; the actual route might be `sessions.search`, `sessions:query`, or might not exist as a dedicated endpoint (search might be unified under a workspace-level `search` endpoint with a `type` filter). Until empirically probed:

- T028 (`dialog_recall` authoring) MUST NOT start before V8 resolves.
- If V8 finds NO session-content search endpoint exists, US4 design must change: either (a) fall back to per-Message GET + local ranking (expensive), (b) ingest dialogs as Conclusions instead of Sessions (loses chunking benefit per V3), or (c) defer US4 to a follow-up feature.

**Probe procedure** (first task of Phase 6 implementation):

1. `OPTIONS /v3/workspaces/{ws}/sessions` — discover available sub-routes.
2. Try candidate endpoints against a seeded workspace (≥1 Session with ≥5 Messages containing known phrases):
   - `POST /v3/workspaces/{ws}/sessions:search` with body `{"query": "<known-phrase>"}`
   - `POST /v3/workspaces/{ws}/sessions:query`
   - `POST /v3/workspaces/{ws}/sessions/search` (REST-style)
   - `POST /v3/workspaces/{ws}/search` with body `{"query": "...", "type": "session"}`
3. Record: which endpoint returned results, response schema, whether Message content was matched (not just Session title/metadata), relevance score range + meaning.
4. Cache probe result at `~/.underboard/honcho-sessions-search-probe.json`:
   ```json
   {
     "endpoint": "<discovered-path>",
     "method": "POST",
     "request_shape": {"query": "string", "limit?": "number"},
     "response_shape": {"results": "[{session_id, message_id?, excerpt, relevance_score}]"},
     "searches_message_content": true,
     "probed_at": "2026-...",
     "honcho_version": "3.0.9"
   }
   ```

**Verification status**: ⚠️ PENDING pre-implementation probe. Blocks T028. If probe fails, US4 descoped per F3 recommendation.

---

## V1–V8 status summary

| # | Item | Status | Artifact updated |
|---|------|--------|------------------|
| V1 | CC session-end hook availability | ✅ Resolved | research.md (this file); spec.md FR-017 drift note; SC-001 timing fix |
| V2 | CC transcript JSONL schema stability | ✅ Resolved | research.md; normalizer contract §"Defensive parsing" |
| V3 | underboard payload limits vs long transcripts | ✅ Resolved | research.md; data-model.md chunking |
| V4 | Honcho Session entity behavior | ✅ Resolved (partial — see V8) | research.md; contracts/ingestion-pipeline.md |
| V5 | Redaction FP baseline | ⚠️ Deferred to T019 | research.md; tasks.md T019 |
| V6 | CC own-log retention | ✅ Resolved | research.md; FR-009 pruning safety |
| V7 | Honcho DELETE semantics | ✅ Resolved (added post-analyze) | research.md; contracts/ingestion-pipeline.md partial-ingest cleanup |
| V8 | Honcho `sessions:search` endpoint | ⚠️ PENDING pre-impl probe (added post-external-review) | research.md (this section); tasks.md Phase 6 gate |

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Capture hook runtime | Node.js ESM (`.mjs`) | Matches 006's `.claude/hooks/*.mjs` pattern; cross-platform; CC's hook system executes Node scripts |
| File-watch library | `chokidar` (new dependency) | Cross-platform file watching with debouncing; Node's `fs.watch` is unreliable on Windows |
| Normalizer language | TypeScript | Matches `packages/cli/` stack; existing transformers are TS |
| Redaction engine | In-repo TypeScript + `js-yaml` for catalog parsing | No external scanner dependency by default (per FR-004 clarification); external scanner is a pluggable hook |
| Spool storage | SQLite tables in `~/.underboard/data.db` | Reuses underboard's existing SQLite; durable; transactional |
| Honcho client | `undici` (Node fetch, already transitively available) | Honcho v3 is REST; no SDK needed |
| CLI framework | Commander (existing in `packages/cli`) | Consistency with existing CLI subcommands |
| Test framework | vitest (existing) | Matches `packages/cli/` and `packages/underboard/` |
| Config loader | `c12` (existing in `packages/cli`) | Consistency with `helpers.config.ts` |

**New runtime dependencies** (Constitution Principle IV-aware — minimal):
- `chokidar` — file-watch (V1 primary trigger). Mature, cross-platform, ~50 KB.

**No new build/test dependencies**. The catalog format uses `js-yaml` which is already a transitive dependency of `c12`.

## Constitution Principle check (post-research)

| Principle | Impact | Status |
|-----------|--------|--------|
| I — Source of truth | Capture hook lives in `.claude/hooks/` (source of truth); CLI logic in `packages/cli/`; ingest worker in `packages/underboard/`. Config in `helpers.config.ts#dialogs` | ✅ Aligned |
| II — Transformer not fork | No new AI-tool target; this is capture infra, not a transpile target | ✅ N/A |
| III — Protected slots | If any generated file is touched, use HELPERS:CUSTOM markers. None expected | ✅ N/A |
| IV — SemVer 0.x | Feature work → MINOR bump. New runtime dep (`chokidar`) → MINOR | ✅ Plan-aware |
| V — Token economy | Capture hook fires on `Stop` (turn-level) + 5-min file-watch inactivity. Hook body is fire-and-forget; does not bloat CC context | ✅ Aligned |
| VI — Cross-AI review gate | `/speckit.implement` will require analyze + 2 external reviews | ✅ Deferred to gate |
| VII — Artifact versioning | Snapshot tags `plan/007-dialog-capture/v1` + `tasks/007-dialog-capture/v1` (blocked by repo conflicts at plan time) | ⚠️ Blocked, not violated |
| VIII — Self-maintaining knowledge | N/A for plan phase | ✅ N/A |
| IX — Two-phase review | `specs/007-dialog-capture/` is the planning branch per constitution | ✅ Aligned |

**No violations.** No complexity-tracker entries needed.

## Open risks (carried into plan.md, not blockers)

1. **CC schema evolution**: future CC releases may add new content block types or restructure fields. Defensive parsing (V2) handles this; a periodic re-probe task in `dialog-doctor` should warn on schema drift.
2. **chokidar on Windows**: file-watch reliability is library-dependent; if chokidar proves flaky on Windows, fallback is polling (`fs.stat` every 5s). Plan reserves a fallback task.
3. **Honcho Session search quality**: SC-004's ≥80% top-5 hit rate depends on Honcho's session-search ranking, which we don't control. If empirical recall is below threshold, the plan reserves a re-ranking task.
4. **Redaction under-coverage on novel secret formats**: SC-002's ≥99% coverage is aspirational; novel patterns (e.g., a new cloud provider's token format) require catalog updates. The `dialog-renormalize` command (FR-022) is the response mechanism.
