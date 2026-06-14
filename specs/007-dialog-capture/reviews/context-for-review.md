# Context for External Review: 007-dialog-capture

**Purpose**: orientation packet for `/speckit.review` reviewers (Codex Desktop, Antigravity, Gemini CLI, Copilot, independent Claude session). Read this first, then read the artifacts in the order below, then write `specs/007-dialog-capture/reviews/<your-provider>.md` with a VERDICT block.

**Constitution Principle VI gate**: your review is one of ≥2 required external PASSes before `/speckit.implement` can execute. You are the actual gate; the self-review (`reviews/analyze.md`) is the weakest gate by design ("the model that wrote the spec is the worst auditor of the spec").

---

## 1. TL;DR

**Feature**: automatic capture of Claude Code session transcripts → normalization with secret redaction → INDEX auto-population → ingestion into underboard's Honcho backend (Sessions + Messages) so past dialogs are semantically recallable via `memory_recall`. Phase 2 of dialog archival (006/US7) + the Honcho Session integration that 008 explicitly reserved for this feature.

**Why it exists**: closes the loop opened by 005 (memory backend), 006 (US7 dialog archival Phase 1 = directory scaffold + advisory rule only), 008 (Honcho Session entity reserved for "007 dialog ingestion"). Without 007, the dialog archive is a write-only `/dev/null` — raw CC transcripts exist on disk but nothing reads them.

**Status**: planning artifacts complete (`/speckit.full-spec` + `/speckit.full-plan`); self-review analyze **PASS** (post-remediation; 1 CRITICAL + 10 MEDIUM + 5 LOW initially, all CRITICAL/HIGH/MEDIUM resolved, 2 LOW accepted with rationale).

---

## 2. Project context (read this if you don't know the repo)

**Repo**: `UnderUndre/underhelpers/under-ai-helpers` — monorepo with two products:
1. **`clai-helpers` CLI** (`packages/cli/`) — npm package that transpiles `.claude/` config to other AI tools (Copilot, Gemini, Antigravity, Codex).
2. **AI config hub** — curated `.claude/` tree shipped as a template.
3. **`underboard`** (`packages/underboard/`) — MCP tool server for shared agent memory + task board, backed by Honcho v3 (semantic) + local FTS5 (lexical fallback).

**Parent features this depends on** (read these specs first if anything in 007 references them unclearly):

| Spec | What 007 inherits |
|------|-------------------|
| `specs/005-agents-board-and-memory/spec.md` | Memory contract: `memory_write` / `memory_recall` / `memory_recall_cross_project` / `memory_delete` MCP tools, project-scoped default (FR-015 in 007), content-hash dedup, payload limits (64 KB soft / 1 MB hard per entry). |
| `specs/006-ecosystem-parity/spec.md` US7 | `.ai/dialogs/{raw,log,INDEX.md}` directory scaffold (gitignored `raw/`, tracked `log/` + `INDEX.md`), CLAUDE.md "Session Logging (Advisory)" rule for non-CC tools. 007 = US7 Phase 2 (the active-capture half). |
| `specs/008-memory-backend-honcho/spec.md` | Honcho v3 integration (REST), project → workspace mapping, agent → peer, note → Conclusion. 008 explicitly **reserved** the Honcho Session entity for "007 dialog ingestion" — 007 uses Sessions (one per CC session) + Messages (one per CC message). |

**Constitution** (`.specify/memory/constitution.md` v1.5.0) governs: source-of-truth discipline (`.claude/` is canonical), transformer-not-fork (no new AI-tool target = no new transformer), SemVer 0.x rules, token economy, cross-AI review gate (this), artifact versioning (snapshot tags), two-phase review flow (`specs/<slug>` planning branch → `<slug>` impl branch).

---

## 3. Reading order (priority)

Don't read everything linearly — that's ~1500 LOC. Read in this order; bail to the next artifact as soon as you have enough context to find findings.

| # | Artifact | LOC | Why read it | What to scrutinize |
|---|----------|-----|-------------|--------------------|
| 1 | `spec.md` | 180 | **The contract.** User stories, FRs, SCs, edge cases. | Internal consistency. Vague verbs. Untestable SCs. Scope creep vs Phase 1 (006). |
| 2 | `reviews/analyze.md` (post-remediation) | 130 | What the self-review already caught + fixed. **Don't re-report fixed findings.** | Whether the "resolved" fixes are actually solid or papered-over. |
| 3 | `research.md` | 130 | V1–V7 empirical findings that drive every other decision. | Whether the empirical claims (esp. V1 no-SessionEnd, V2 schema stability, V7 Honcho DELETE cascade) are credible or optimistic. |
| 4 | `contracts/capture-hook.md` | 165 | Hook + file-watch + config + probe mechanism. | Fail-soft claims. Path-traversal guards. Probe re-evaluation logic. |
| 5 | `contracts/normalized-record.md` | 250 | Markdown schema + redaction catalog format + engine API + golden fixtures. | Redaction coverage gaps. Allowlist abuse vectors. Determinism holes. |
| 6 | `contracts/ingestion-pipeline.md` | 215 | SQLite schema + worker algorithm + Honcho mapping + dedup/tombstones. | Transaction boundaries. Backoff correctness. Tombstone escape hatches. |
| 7 | `contracts/cli-commands.md` | 215 | `dialog-backfill` / `renormalize` / `purge` / `doctor`. | Standing Order #3 compliance (no `--yes` bypass). Sticky-recovery semantics. |
| 8 | `data-model.md` | 260 | 13 entities + state machines + ERD. | State machine completeness. Missing transitions. FK integrity. |
| 9 | `tasks.md` | 432 | 49 tasks, dependency graph, parallel lanes, dispatch plan. | Critical path realism. Implicit task sequencing. Shared-file conflicts. |
| 10 | `plan.md` | 170 | Tech context + project structure + constitution gates. | Skip if you've read 1–9; mostly a wrapper. |
| 11 | `quickstart.md` | 175 | 6 test scenarios + 6 edge probes. | Whether the tests would actually catch the spec's acceptance criteria. |

**Skip** `checklists/requirements.md` — internal-to-analyze artifact, no review value.

---

## 4. Decisions already made (don't re-litigate)

Eight clarifications from `/speckit.full-spec` Phase 1 + Phase 2 (all user-approved; see `spec.md §Clarifications Session 2026-06-14`):

1. **Redaction policy source** → hybrid (in-repo regex catalog as baseline + optional external-scanner hook for paranoid consumers). FR-004.
2. **Ingestion default** → opt-out with deferred-ingestion quarantine window (default 7 days, configurable 0–90). FR-006/006a/006b.
3. **Capture trigger** → hybrid (file-watch primary because V1 confirmed CC has no SessionEnd; spec FR-017 preserves conditional wording for forward-compat). Dated drift note in spec.
4. **Normalized-record body format** → hybrid (compact metadata header + truncated body at 32 KB default with raw pointer). FR-003.
5. **Historical backfill** → forward-only default + explicit `dialog-backfill` command. FR-018/019.
6. **Worker cadence** → event-driven hybrid (underboard-recovered + capture-completed + 5-min safety-net tick). FR-020.
7. **Recall top-K for dialogs** → top-5 (matches 008/SC-001's notes baseline). SC-004.
8. **Redaction catalog versioning** → per-record version stamp + opt-in `dialog-renormalize` command (not auto-retroactive). FR-021/022.

Seven V-items in `research.md` (empirical pre-implementation verifications; all marked resolved except V5 which is deferred to T019 by design):

- V1 — CC exposes no SessionEnd hook (file-watch is the primary path).
- V2 — CC JSONL schema stable enough for defensive parsing (no version field).
- V3 — Honcho Session+Message sidesteps 005's per-entry 1 MB limit (per-Message chunks).
- V4 — Honcho Session entity is the right representation (008 reserved it for exactly this).
- V5 — Redaction FP rate is corpus-dependent; baseline measurement deferred to first impl task.
- V6 — CC keeps transcripts indefinitely in `~/.claude/projects/`; pruning in our `raw/` is safe.
- V7 — Honcho DELETE is soft-delete with cascade; tombstone is authoritative anti-resurrection record.

**If you disagree with one of these**, your finding should explain why the decision is wrong on the merits (cite evidence), not just that it could have gone another way. These were user-approved after Socratic questioning; re-opening requires new information.

---

## 5. What self-review already caught (don't repeat)

`reviews/analyze.md` initially surfaced 1 CRITICAL + 10 MEDIUM + 5 LOW. All CRITICAL/HIGH/MEDIUM resolved before this review request. **Don't re-report these** — verify the fix is real, but don't list it as a new finding:

| ID | Initial finding | Fix applied |
|----|-----------------|-------------|
| C1 | SC-001 "5 seconds of session end" impossible with 5-min inactivity-timeout | spec SC-001 + US1 acc.1 revised to `(inactivity-timeout-minutes + 5s)` with dated drift note per Constitution IX |
| M1 | FR-006b no explicit test | T030 expanded with assertion (e) |
| M2 | FR-010 no explicit test | T012 expanded with assertion (d) |
| M3 | FR-014 no consolidated fail-soft test | T049 added |
| M4 | FR-017 probe mechanism underspecified | contracts/capture-hook.md §"Capture-mode probe" added |
| M5 | partial-ingest tombstone cleanup undefined | contracts/ingestion-pipeline.md §"`memory_delete` integration" rewritten + V7 added |
| M6 | terminology drift "primary/fallback" | research.md V1 wording fixed; spec FR-017 drift note added |
| M7 | T040 cli/dialog.ts race | dependency `T039 → T040` added |
| M8 | Honcho DELETE soft vs hard ambiguous | research.md V7 added (empirical: soft+cascade, 30-day retention); contract updated |
| M9 | `--rule-id` searches wrong thing (literal vs pattern) | contracts/cli-commands.md clarified |
| M10 | `outcome` fallback undefined for tool-only sessions | data-model.md 3-step fallback chain added |
| L1 | Stop hook per-turn spawn cost | accepted as LOW (monitoring via T048) |
| L2 | no drift note on V1 reality change | fixed via M6 |
| L3 | FR-018 no test | T012 assertion (e) added |
| L4 | FR-014 scattered | fixed via M3 |
| L5 | SC-002 deferred to T019 | accepted as LOW (V5 by design) |

**If you find a fix is shallow or papered-over**, that's a valid new HIGH finding — explain why the remediation doesn't actually resolve the underlying issue.

---

## 6. Review priorities (where to look hardest)

Ordered by historical frequency of AI-generated-spec failure modes. Spend 60% of your time on the top 3.

### 6.1 Hidden coupling with parent features (HIGH-LEVERAGE)

007's value depends on contracts defined in 005 (memory tool schema, payload limits, project-scoped recall) and 008 (Honcho workspace mapping, agent → peer, note → Conclusion). If 007 violates either:

- **005 contract drift**: does 007's `type=dialog` discriminator + new "dialog-capture" peer break 005's recall output schema?
- **008 mapping conflict**: 008 says agent → peer; 007 introduces a synthetic `dialog-capture` peer per project workspace. Is this consistent with 008's peer model? Does it collide with real agent peer IDs?
- **Payload limit math**: 005 says 64 KB soft / 1 MB hard per memory entry. 007 uses Honcho Message (not memory entry) — but the local spool still has 1 MB limits. Verify the chunking claim in research V3 actually holds.

### 6.2 Empirical claims that smell optimistic

- **V1 (CC has no SessionEnd hook)**: based on CC docs + `settings.json` schema. If a reviewer has more recent CC knowledge, flag if this is wrong.
- **V2 (CC JSONL schema stable enough for defensive parsing)**: claim is "shape consistent 2024–2026". If you've seen CC schema breaks, surface them.
- **V4 (Honcho Session entity exists and supports search)**: claim based on local Docker probe 2026-06-13. Honcho v3 is the pinned version. If you know Honcho's API drift history, flag.
- **V7 (Honcho DELETE is soft + cascade, 30-day retention)**: probed 2026-06-14 on local stack. Verify against your knowledge of Honcho v3.0.9.

### 6.3 Redaction coverage (SC-002 ≥99%)

The redaction engine is the trust foundation. Catalog defaults in `contracts/normalized-record.md §catalog_cloud.yml + catalog_pii.yml`:

- Are the regex patterns actually correct? (AWS AKIA prefix list complete? JWT regex handles all variant encodings? SSH private key block regex handles PKCS#8 / EC / OpenSSH new format?)
- Allowlist precedence (`allow` ALWAYS wins over rule match) — can it be abused to suppress legitimate catches? Path-glob + pattern-context allowlists both exist; check for unintended interactions.
- External-scanner hook contract — subprocess boundary: what happens if the scanner echoes secret content to stdout despite the contract saying "MUST NOT echo match content"? Is the engine hardened against this?
- FP baseline (V5) is deferred — is the spec's "≥99% coverage" measurable at all, or is it aspirational?

### 6.4 State machine holes (data-model.md)

- Quarantine spool `pending → graduated → (purged | archived-graduated)`: what if a record is purged at T=6.9d and the worker ticks at T=7.0d? Race condition?
- Outage spool `pending → ingested | tombstoned`: what if the tombstone arrives while ingest is in flight (T049 fail-soft covers partial case, but verify)?
- Tombstone by content_hash: if a `dialog-renormalize` produces a new content_hash (different redactions), is the old tombstone still meaningful? Does the new hash bypass it correctly? (research V7 + contracts/ingestion-pipeline.md cover this — verify)

### 6.5 Task graph realism

- Critical path is 11 tasks deep (T001 → T047). Is that realistic for the scope?
- T049 (consolidated fail-soft E2E) depends on T041 + T027 + T034. Is that the right fan-in? Should it also depend on T008 (watcher) and T015 (normalizer) since both have fail-soft surfaces?
- T012 (US1 E2E) now has 5 assertions (a-e). Is this too much for one task? Should it be split?

---

## 7. Known model blind spots

This spec was written, planned, and self-analyzed by the same model (Claude). Known failure modes that fit this pattern:

1. **Optimistic API assumptions** — if the spec says "Honcho does X" or "CC exposes Y", and you have first-hand knowledge, weigh that higher than the spec's claim. The model writing this got its API knowledge from docs + a single 2026-06-13 probe; it hasn't battle-tested edge cases.
2. **Self-reinforcing terminology** — the same entity might be described slightly differently across spec/plan/contracts/data-model. If you spot drift, flag it (it's how the initial C1 got caught).
3. **Edge cases that sound covered but aren't** — "concurrent sessions", "crash mid-ingest", "schema drift" are all mentioned; verify the spec actually specifies recovery, not just acknowledgment.
4. **Token economy hand-waving** — Principle V says every file in `.claude/` earns its place. 007 adds a Stop hook that fires on every CC turn. Is the cost/benefit argued honestly, or is it "this is fine" hand-waving?
5. **"Constitution-aligned" claims without evidence** — plan.md says all 9 principles pass. Verify against the actual principle text in `.specify/memory/constitution.md`, especially Principle II (transformer not fork — does adding a hook count as adding a target?) and Principle V (token economy).
6. **Forward-compat placeholders that aren't real** — FR-017's "if CC adds SessionEnd later, the probe re-evaluates" sounds nice but the probe mechanism (contracts/capture-hook.md §"Capture-mode probe") might not actually detect a new event type. Verify the probe would notice.
7. **Implicit dependency on 008 being merged** — 007 assumes 008's Honcho integration is in place. If 008 hasn't shipped, 007's US4 (semantic recall) is non-functional. Is this dependency explicit in tasks.md, or silent?

---

## 8. Out of scope (don't flag these)

- underboard's memory backend itself (delivered by 005/008) — 007 consumes the API.
- Non-CC tool transcript capture beyond the 006 advisory rule — each tool is its own feature.
- Analytics/observability dashboards over dialogs (underboard's dashboard covers it).
- Multi-agent orchestration replay (undrestrator's domain).
- Cross-repo dialog aggregation (single-repo scope per 005 project model).
- Replacing the 006 advisory log-layer rule with hard automation for non-CC tools.
- Authoring new agents/skills/commands beyond the capture pipeline.
- Building a new secret-scanning engine (leverage external tools in plan phase).
- Dialog-to-task extraction (future feature, not 007).

---

## 9. Repository state caveat

Repo `main` has unresolved submodule conflicts (`.agents/marketingskills` AA, `undrestrator` UU) at the time of planning. Spec artifacts are uncommitted in `specs/007-dialog-capture/`. Snapshot tags (`spec/plan/tasks/007-dialog-capture/v1`) are blocked by this. **This is a repo-hygiene issue, not a planning defect** — don't flag the uncommitted state or missing tags as findings unless you see evidence the artifacts themselves are inconsistent because of it.

---

## 10. VERDICT format (write this to `specs/007-dialog-capture/reviews/<your-provider>.md`)

```markdown
# SpecKit Review: 007-dialog-capture (<provider>)

**Reviewer**: <provider-name>
**Reviewed at**: <ISO 8601 timestamp>
**Reviewer version**: <your model/version>
**Commit reviewed**: 4dd8e4fbbb82a4d72f0f8ec1575bb72b2ff92532 (HEAD on `main` at review time)
**Artifacts reviewed**: <list which of the 11 you actually read>

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| F1 | ... | CRITICAL / HIGH / MEDIUM / LOW | spec.md:LXX | ... | ... |

## Cross-artifact Consistency Notes

(Any drift between spec/plan/contracts/tasks you spotted, even if not severity-flagging.)

## Constitution Alignment

(List any Principle I–IX concerns; empty section is fine.)

## What you would NOT have done this way

(Optional: architectural dissent. Where would you have chosen differently? Helps the maintainer weigh alternatives even if your view doesn't prevail.)

## VERDICT

\`\`\`yaml
verdict: PASS | MEDIUM | HIGH | CRITICAL
reviewer: <provider-name>
reviewed_at: <ISO timestamp>
commit: 4dd8e4fbbb82a4d72f0f8ec1575bb72b2ff92532
critical_count: <N>
high_count: <N>
medium_count: <N>
low_count: <N>
notes: "<1-3 sentences: top concern if any, or 'no blocking issues'>"
\`\`\`
```

**Severity calibration** (use the same heuristic as `/speckit.analyze`):

- **CRITICAL**: blocks `/speckit.implement` outright — constitution MUST violation, scope-destroying gap, or unachievable SC.
- **HIGH**: rework recommended before implementation — duplicate/conflicting FR, ambiguous security/perf attribute, untestable acceptance.
- **MEDIUM**: should-fix during implementation — terminology drift, missing NFR task coverage, underspecified edge case.
- **LOW**: nice-to-have — wording, style, minor redundancy.

**PASS condition**: zero CRITICAL AND zero HIGH. MEDIUM and LOW can coexist with PASS (logged for implementer's awareness).

---

## 11. Anti-sycophancy reminder

Don't be polite about the spec. If something is wrong, say so bluntly with evidence. The maintainer (Valera persona — blunt Russian plumber turned IT architect) explicitly does not want hedging. Better to flag a false-positive finding than to miss a real one. Two reviewers from different providers is the minimum signal-to-noise filter; your independent angle is the value.

If you found zero issues, say so explicitly and explain what you scrutinized — generic "looks good" is not a review.

---

## 12. Suggested time budget

- Read sections 1–5 of this doc: 5 min
- Read `spec.md` + `reviews/analyze.md`: 15 min
- Read `research.md` + 1–2 contracts: 20 min
- Scan `tasks.md` + `data-model.md`: 15 min
- Form findings + write VERDICT: 20 min

**~75 min total per reviewer.** If you have less time, prioritize: spec → analyze → research V1+V7 → contracts/normalized-record (redaction) → tasks critical path.

---

## 13. Contact / clarifications

If a contract or spec wording is ambiguous and you can't form a finding without more info, write the question in your review file under a `## Questions for maintainer` section. Don't guess silently — the maintainer prefers explicit questions over plausible-but-wrong assumptions.
