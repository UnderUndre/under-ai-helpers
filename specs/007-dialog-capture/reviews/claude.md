# SpecKit Review: 007-dialog-capture (claude)

**Reviewer**: claude
**Reviewed at**: 2026-06-14T18:20:00Z
**Reviewer version**: Claude (Opus 4.8) — independent session, not the spec/plan author model
**Commit reviewed**: 4dd8e4fbbb82a4d72f0f8ec1575bb72b2ff92532 (HEAD on `main` at review time)
**Artifacts reviewed**: spec.md, reviews/analyze.md, research.md, contracts/{ingestion-pipeline,normalized-record,capture-hook}.md, tasks.md, data-model.md (skim), reviews/gemini.md, plus parent specs/008-memory-backend-honcho/spec.md and live repo code (`packages/underboard/src/tools/memory/`).

## Summary

Strong, unusually thorough spec — the capture-side lifecycle (raw → normalized → redacted → INDEX) is well-reasoned and the self-review already cleaned up the obvious timing/coverage gaps. **But the review packet pointed me at the right place (§6.1 hidden coupling with parent features) and that is exactly where the design cracks.** The ingest/recall half (US4) silently modifies a memory-tool contract that 008 freezes, leaves the cross-entity recall ranking undefined, leans on a Honcho endpoint nobody concretely probed, and builds on an 008 backend that **does not yet exist in code** — with no declared prerequisite. Two of my findings are repo-grounded factual errors (a task pointing at a non-existent file; zero Honcho references in `underboard/src`). Gemini's watcher-leakage HIGH is real and I confirm it independently; notably the self-review dismissed that same issue as LOW. Capture-side (US1–US3) is buildable as an MVP; the leverage story (US4) needs rework before `/speckit.implement`.

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| F1 | Parent-contract drift | **HIGH** (near-CRITICAL) | spec.md:242 (Out of Scope) vs tasks.md:117–118 (T028/T029), :163 (T041); contracts/ingestion-pipeline.md:196–213; specs/008…/spec.md:125 (FR-001) | Spec Out-of-Scope says underboard's memory backend "doesn't change it," but T028/T029 modify the recall + delete tools and T041 extends `/health`, AND a **new `DialogRecallResult` output variant** is introduced into `memory_recall`. 008/FR-001 is explicit: "the agent-facing MCP memory tool contract from 005 (…input/output schemas…) MUST remain unchanged for both backends." 007 silently amends a contract a parent feature declared frozen. | Either (a) route dialog recall through a **separate** `dialog_recall` tool and leave `memory_recall`'s 005/008 schema untouched, or (b) explicitly amend 005's `contracts/memory-tools.md` + 008/FR-001 to a versioned discriminated-union output and note the breaking change. Delete the false "doesn't change underboard" out-of-scope line either way. Promote to CRITICAL if maintainer intent is that the 005/008 tool schema is hard-frozen. |
| F2 | Recall design hole | **HIGH** | spec.md:101 (US4 acc.1), :208 (SC-004); contracts/ingestion-pipeline.md:192–213 | After 007, `memory_recall` must return **both** Conclusion-backed notes (008) and Session-backed dialogs (007) — two distinct Honcho entities, two search endpoints, two relevance scales. No fusion/interleave/ranking is specified for producing one top-5. "Right answer in top-5" (SC-004) is unverifiable when notes and dialogs are ranked on non-comparable scores with no merge rule. | Specify the fusion explicitly: separate K per `type`, or a normalized cross-entity score, or a `type`-filter query param so dialog vs note recall are distinct calls. Make SC-004 measure the actual merged path, not session-search in isolation. |
| F3 | Optimistic API assumption | **HIGH** | research.md:70–73 (V4), contracts/ingestion-pipeline.md:77 (`sessions:search`); specs/008…/spec.md:15 | The entire US4 leverage story rides on `POST /v3/workspaces/{ws}/sessions:search`. V4's 2026-06-13 probe lists create/post-message/list explicitly but only vaguely asserts "search endpoints span Session + Conclusion content"; 008 live-probed "search and conclusions endpoints" — **neither concretely verified a session-content semantic-search endpoint + response shape.** The most load-bearing dependency is the least grounded. The `sessions:search` colon-action path is a Google-AIP convention Honcho may not use. | Add a pre-implement V-item that probes the exact session-search endpoint on Honcho v3.0.9, records request+response, and confirms it searches **Message content** (not just session metadata). If absent, US4 design must change (dialogs-as-Conclusions, or a local index shim). |
| F4 | Silent unbuilt dependency | **HIGH** | tasks.md:4 (Prerequisites), :44–47, Phase 6; live: `grep -ri honcho packages/underboard/src` → **0 hits**; `tools/memory/recall.ts:1–3` uses better-sqlite3 + local embed | US4's task chain (T006 honcho-client → T026 ingest → T027 worker → T028 recall) assumes 008's Honcho backend exists. It does not: zero Honcho references in `underboard/src`; `recall.ts` runs the 005 local SQLite/hybrid-retrieve/ONNX stack. 008 is spec-only/unmerged in code. tasks.md declares **no** 008-merge prerequisite, gate, or precondition (the review packet §7.7 asked this directly — answer is "silent"). | Add an explicit "008 merged + Honcho client live in `underboard/src`" gate before Phase 6, or descope US4 to the existing local `hybridRetrieve` path until 008 lands. State the dependency in tasks.md Prerequisites. |
| F5 | Watcher process leakage | **HIGH** | contracts/capture-hook.md:64–73 (detached spawn per Stop) vs :101–106 (in-process per-session Map); analyze.md:31 (L1 dismissal) | **Independently confirms gemini.md F1.** The `Stop` hook spawns a fresh detached CLI process every turn; `watcher.ts` dedups via an **in-process** `Map` keyed by session_id. A Map in process A is invisible to process B, so "spawn a watcher if not already watching" cannot see watchers from prior detached spawns → up to N watchers + N inactivity timers per N-turn session on the same file. Notably, analyze.md L1 dismissed this as mere "per-turn spawn cost … acceptable value/cost ratio" — that is the papered-over remediation §5 invited me to challenge. Two independent reviewers now flag it. | Cross-process singleton: pidfile/lockfile per session_id (e.g. `~/.underboard/dialog-watch/<session_id>.pid`) checked before spawning a watcher; or a single long-lived watcher daemon the hook pings (gemini's "ping-based watcher" alternative). Re-classify L1 from LOW. |
| F6 | Determinism contradiction | **MEDIUM** | contracts/normalized-record.md:87 (`captured_at` = "when the normalizer ran") vs :118–124 (Determinism), spec.md:67 (US2 acc.2), :186 (FR-022), :216 (SC-012) | `captured_at` is defined as the normalizer's wall-clock run time, but US2-acc.2 ("two runs → byte-identical"), FR-022/SC-012 ("renormalize touches only changed records, clean git diffs") require frontmatter stable across runs. `content_hash` covers only the **body**, so the rewrite-decision key vs "byte-identical output" is never reconciled. As written, every backfill/renormalize re-stamps `captured_at` and dirties every file → "only changed records appear in git diff" is false. | Derive `captured_at` from the persisted finalize-trigger time (a stable input), and define the idempotency key explicitly as body `content_hash`, excluding volatile frontmatter from the rewrite decision. |
| F7 | Wrong file path | **MEDIUM** | tasks.md:117 (T028), :118 (T029), :362 (dispatch); real layout `packages/underboard/src/tools/memory/{recall,delete}.ts` | T028/T029 and the dispatch plan target `packages/underboard/src/tools/memory.ts` — that file **does not exist** (`Test-Path` → False). The memory tools are per-file: `tools/memory/recall.ts`, `delete.ts`, `write.ts`, `recall-cross.ts`, etc. An implementer following the task verbatim creates an orphan `memory.ts` that never wires into the tool registry, or stalls discovering the real layout. | Point T028 → `tools/memory/recall.ts`, T029 → `tools/memory/delete.ts` (+ `recall-cross.ts`/`delete-cross.ts` if cross-project dialog paths are in scope per FR-015). |
| F8 | Peer-id collision | **LOW** | contracts/ingestion-pipeline.md:87; specs/008…/spec.md:143 (agent → peer) | The synthetic `dialog-capture` peer shares the same workspace peer namespace as real agent peers (008: agent → peer). If a real agent is ever named `dialog-capture`, attribution/recall collide. | Reserve/namespace the synthetic peer id (e.g. `__dialog-capture__` or a peer-type discriminator) and document it as reserved in 008's mapping. |

## Cross-artifact Consistency Notes

- **Out-of-Scope vs tasks** (F1): spec.md:242 and :248 both claim no backend change / "no new template content," but tasks T028/T029/T041 (and T042 editing CLAUDE.md) do change shared/managed surfaces. The out-of-scope section reads as aspirational rather than descriptive of the task list.
- **research.md "New runtime dependencies: chokidar"** (research.md:173–176) vs **plan-level dependency on 008's `undici`/Honcho stack**: the dependency accounting only counts the capture-side dep and silently treats the entire Honcho backend as pre-existing. Consistent with F4.
- **`DialogRecallResult.relevance_score` (0..1, "Honcho-provided")** vs current `MemoryRecallResult.score`/`similarity` (recall.ts:11–19): different field names and scales for the same `memory_recall` envelope — surfaces again under F1/F2. A consumer of `memory_recall` today destructures `{score, similarity}`; a dialog result has neither.
- analyze.md coverage table maps FR-015 → T028 and treats T028 as in-scope underboard work, which contradicts the spec's own Out-of-Scope line. The self-review did not flag its own scope contradiction (expected — §7.5 blind spot).

## Constitution Alignment

- **Principle I (source of truth)** — OK; capture hook lives in `.claude/hooks/`, logic in `packages/`. No reverse-flow edits.
- **Principle II (transformer not fork)** — OK; no new transpile target. A Stop hook is config, not a fork.
- **Principle V (token economy)** — tension via F5. A per-turn detached spawn that can accumulate N live watcher processes is the opposite of economy; the L1 acceptance under-measured it. Not a MUST-violation, but the cost/benefit was hand-waved (§7.4 blind spot confirmed).
- **No hard MUST violation** against the constitution itself. The sharper conflict is with a **sibling spec's** MUST (008/FR-001) — see F1. That is governance-relevant but resolvable by amending the 005/008 contract or routing through a separate tool; it does not by itself trip a constitution Principle.
- **Principle VII (artifact versioning)** — snapshot tags blocked by repo submodule conflicts; per §9 I do not flag this as a defect.

## What you would NOT have done this way

I would not have overloaded the existing `memory_recall` tool with a second, structurally different result type. Notes (distilled facts → Conclusions) and dialogs (long, noisy conversations → Sessions/Messages) are different artifacts with different relevance characteristics — the spec itself argues this in V4 to justify using Sessions over Conclusions, then collapses them back into one recall envelope at the tool boundary. A separate `dialog_recall` (or a required `type` filter on `memory_recall`) would: keep 008/FR-001's schema frozen (kills F1), make the ranking question well-posed per-entity (kills F2), and let SC-004 measure a clean path. The cross-entity "one top-5 for everything" convenience is not worth the contract drift it forces.

Secondary: I would sequence 008-merge-in-code as an explicit gate rather than an assumption. US1–US3 are a genuinely shippable MVP without Honcho; US4 should not enter the task graph until the backend it integrates against exists.

## Questions for maintainer

1. Is the 005/008 `memory_recall` input/output schema intended to be **hard-frozen** (making F1 CRITICAL), or is a versioned discriminated-union extension acceptable (F1 stays HIGH)?
2. Has the Honcho **session-content search** endpoint actually been exercised end-to-end (query in → ranked Message excerpts out), or only the create/post/list surface? (Determines whether F3 is "verify" or "redesign.")
3. Is 008 expected to merge **before** 007 implementation starts? If so, F4 is a sequencing note; if 007 may start first, US4 needs descoping to the local backend.

## VERDICT

```yaml
verdict: HIGH
reviewer: claude
reviewed_at: 2026-06-14T18:20:00Z
commit: 4dd8e4fbbb82a4d72f0f8ec1575bb72b2ff92532
critical_count: 0
high_count: 5
medium_count: 2
low_count: 1
notes: "Capture-side (US1–US3) is a buildable MVP. US4 ingest/recall needs rework before implement: it modifies a memory-tool contract 008 freezes (F1), leaves cross-entity recall ranking undefined (F2), depends on an unverified session-search endpoint (F3) and an 008 backend absent from code with no declared gate (F4). F5 confirms gemini's watcher leakage (self-review wrongly downgraded it to LOW). F7 is a concrete wrong-file-path bug in T028/T029."
```
