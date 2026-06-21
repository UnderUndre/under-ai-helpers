# SpecKit Review: 009-configurable-endpoints

**Reviewer**: opencode (GLM-5.2-max)
**Reviewed at**: 2026-06-21T14:30:00Z
**Commit**: 73896450d320126e99b0ff2351273dc4664e02be
**Artifacts reviewed**: spec.md, plan.md, tasks.md, data-model.md, contracts/config.md, quickstart.md, research.md, analyze.md, checklists/requirements.md, constitution.md

## Summary

Spec is well-structured: clear FRs, explicit priority tree, good acceptance scenarios. But `analyze.md` verdict of "0 findings, 100% consistent" is wrong — probing against actual code (`packages/underboard/src/cli/{config,index}.ts`) and cross-document semantics surfaced 7 HIGH gaps and several MEDIUM concerns. The biggest risks: (a) a dead config field with no consumer, (b) an assumed response-shape change with no FR or task, (c) undefined write semantics during Honcho fallback, and (d) tasks.md violates Principle IX by not creating the implementation branch before touching `packages/underboard/src/`.

## Findings

| ID | Severity | Area | Finding | Recommendation |
|---|---|---|---|---|
| F1 | HIGH | Logical consistency | `--embedding-model-name` / `EMBEDDING_MODEL_NAME` / `embedding.model_name` appear in spec FR-002 (L73-75), data-model.md (L37, L71), contracts/config.md (L20, L34, L51) — but NO task consumes the value. T009-T010 only use `model_path`. Current `embedding-service.ts` loads from path, not name. The field is dead weight in the schema. | Either: (a) remove `model_name` from FR-002/data-model/contracts, OR (b) add a task that makes the loader use `model_name` for logging/metadata. Pick one before implement. |
| F2 | HIGH | Logical consistency | research.md L31 claims `memory_recall` returns `embedding_status: "lexical_only"` when embeddings disabled. But: spec FR-002 has no such requirement, `mcp-server.ts` (per audit) returns matches array only, and no task modifies the response shape. The "lexical_only" status is an assumed API change with no FR or task backing. | Add explicit FR: "When embeddings are disabled, `memory_recall` response MUST include `embedding_status: 'lexical_only'` field." Add a task under US2 to modify the tool response. Or strike the claim from research.md. |
| F3 | HIGH | Edge case / Hidden assumption | `underboard model fetch` (spec FR-002 L77, code `cli/index.ts:48-56`) currently takes NO arguments and downloads to a hardcoded path. Spec says "downloads the default model to `~/.underboard/models/`" but doesn't address: if `EMBEDDING_MODEL_PATH` is set to a custom location, does `model fetch` download there or ignore the setting? User who runs `model fetch` then points to a custom path will find the model in the wrong place. | Specify `model fetch` behavior in FR-002: either (a) "always downloads to `~/.underboard/models/` regardless of `EMBEDDING_MODEL_PATH`" or (b) "respects `EMBEDDING_MODEL_PATH` if set". Add acceptance scenario. |
| F4 | HIGH | Failure modes | FR-009 says "return partial results" on Honcho timeout — defined for `memory_recall` (fall back to FTS5). But for `memory_write`, "partial result" is undefined. Does the write go local-only? Is it queued in the existing sync queue (`migrations/003_dialog_spools.sql`)? Does the caller get a success-with-warning, a hard error, or silent local write? Spec and tasks don't resolve this. | Extend FR-009 to cover write semantics: "On Honcho timeout, `memory_write` MUST succeed locally and enqueue for sync; response MUST include `synced: false` flag." Add task to modify `memory_write` tool. |
| F5 | HIGH | Constitution / Workflow | Principle IX (Two-Phase Review Flow, constitution.md L99-117): planning branch `specs/<slug>` holds spec-only artifacts; implementation branch `<slug>` (created from main AFTER planning PR merges) holds code. tasks.md T002-T015 all edit `packages/underboard/src/` — but no task creates the implementation branch first. An executor following tasks.md literally will commit code to `specs/009-configurable-endpoints`, violating the two-phase flow. | Add T000 (Phase 1, [SETUP]): "Create implementation branch `009-configurable-endpoints` from `main` after planning PR merge, before any code edit." Reference Principle IX in task description. |
| F6 | HIGH | Logical consistency | FR-007 (redaction) says secrets redacted "in all log/debug output". But `process.env` is a separate surface — if a debug routine dumps `process.env` (common in MCP servers for diagnostics), `HONCHO_TOKEN` and `LLM_API_KEY` leak in cleartext. Spec doesn't address this. Also: `config.json` containing plaintext secrets (per clarification Q1) has no file-permission guidance — default `0644` is world-readable on multi-user systems. | Extend FR-007: "process.env dumps in debug output MUST redact known secret env vars. When `config.json` contains `honcho.token` or `llm.api_key`, file MUST be created with `0600` permissions." Add task. |
| F7 | HIGH | Edge case | Spec FR-002 acceptance scenario 1 says "loads the custom model" — but doesn't define behavior when `EMBEDDING_MODEL_PATH` is SET but file is MISSING. Checklists/requirements.md CHK008 mentions this case ("logs warning, degrades gracefully") but spec/plan/tasks don't encode it as a FR or task. Executor will guess. | Add to FR-002: "If `EMBEDDING_MODEL_PATH` is set but the file does not exist, the server MUST log an error to `stderr` and disable embedding features (same as unset behavior), NOT crash." Add task or extend T009. |
| F8 | MEDIUM | Hidden assumption | `LLM_ENDPOINT` semantics undefined: is it the base URL (`https://api.openai.com/v1`) or the full chat completions path (`.../v1/chat/completions`)? Spec FR-003 says "OpenAI-compatible endpoint" but different OpenAI clients expect different shapes. Tasks T012-T013 don't resolve. | Specify in FR-003 or data-model.md: "`LLM_ENDPOINT` is the base URL; the client appends `/chat/completions`." |
| F9 | MEDIUM | Terminology | research.md L29 + T010 use status `"failed"` for "embedding disabled by config (path unset)". But `"failed"` conventionally means "tried and errored". Conflating "disabled by config" with "load error" confuses monitoring and debug. | Distinguish: `embedding_status ∈ {active, disabled, failed}`. `disabled` = path unset. `failed` = path set but load error. Update research.md L29, T010, spec FR-002. |
| F10 | MEDIUM | Failure modes | FR-009 graceful degradation on persistent Honcho outage will spam `stderr` on every request. No rate-limit or backoff specified. For long-running MCP servers with Honcho down for hours, this floods logs. | Add to FR-009: "Degradation warnings are rate-limited: at most 1 warning per 5 minutes per operation type after the first occurrence." |
| F11 | MEDIUM | Logical consistency | `--honcho-timeout` value type: contracts/config.md L19 declares `honchoTimeout?: string` (commander parses as string), but `honcho.timeout_ms` in data-model.md L33 is `number`. No task explicitly handles the string→number conversion. T004 ("merge field-by-field") doesn't mention type coercion. | Add to T004: "Numeric CLI options (`--port`, `--honcho-timeout`) MUST be parsed via `Number()` with `Number.isFinite` guard before merge." |
| F12 | MEDIUM | Stakeholder clarity | Config file migration undefined. Existing `config.json` on user disks (written by `config.ts:44` with old `DEFAULT_CONFIG`) won't have `honcho`/`embedding`/`llm` keys after upgrade. c12 merges defaults, so runtime works — but if user opens their `config.json` to configure, they see stale shape and don't know to add new keys. | Add to FR-008 or new FR: "On startup, if `config.json` is missing new keys (`honcho`, `embedding`, `llm`), Underboard MUST re-write the file with merged shape (existing keys preserved, new keys added with defaults) so users see the full schema." |
| F13 | MEDIUM | Stakeholder clarity | `analyze.md` self-review verdict is PASS with "0 findings, 100% consistent". This review found 7 HIGH + 6 MEDIUM findings against the same artifact set. The `analyze.md` either didn't probe deeply or was sycophantic. This is itself a process signal. | Re-run `/speckit.analyze` with adversarial stance, OR note in analyze.md that self-review has known blind spots that external review caught. |
| F14 | LOW | Task ambiguity | T001 "Verify the repository configuration structure" has no acceptance criteria. "Verify" is unverifiable as written. | Rewrite T001: "Read `packages/underboard/src/cli/config.ts`, confirm `UnderboardConfig` interface location, document current shape in research.md appendendum." |
| F15 | LOW | Polish | quickstart.md L99-110 echoes only new fields (`port`, `db_path`, `honcho.*`, `embedding.*`, `llm.*`). Existing fields (`archive_mode`, `stalled_mode`, `retrieval.*`) not shown. Reader can't tell if they're echoed or hidden. | Clarify in quickstart.md: "Output truncated for brevity — all config fields are echoed; sensitive ones redacted." |

## Alternative approaches considered

1. **Config validation via Zod**: spec/plan use TypeScript interfaces only. A Zod schema would give runtime validation of `config.json` user input (catches `"port": "not-a-number"`). Not considered in research.md. Worth weighing — adds one dependency, gains error messages for misconfigured users. Author's call.

2. **Secrets via OS keychain (keytar/node-keytar)**: Instead of plaintext in `config.json` or env vars, use OS keychain (macOS Keychain, Windows Credential Manager). Heavier dependency, native module compile pain, but eliminates the redaction problem entirely. Probably overkill for a local-first MCP server — flagging for awareness, not recommending.

3. **`.underboard/.env` over cwd `.env`**: Clarification Q2 chose cwd + `~/.underboard/.env` cascade. Alternative: only `~/.underboard/.env` (more predictable, no accidental cwd leaks if user runs underboard from a dir with an unrelated `.env`). Clarification rationale was sound; flagging the tradeoff for record.

## VERDICT

```yaml
verdict: HIGH
reviewer: opencode
reviewed_at: 2026-06-21T14:30:00Z
commit: 73896450d320126e99b0ff2351273dc4664e02be
critical_count: 0
high_count: 7
medium_count: 7
low_count: 2
```
