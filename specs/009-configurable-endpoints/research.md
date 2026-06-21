# Research: Configuration Loading, Dotenv Cascading & Redaction

**Feature**: 009-configurable-endpoints | **Date**: 2026-06-21

## R1: Unified Priority Resolution via c12
The c12 library supports cascading configuration, defaults, and dotenv file loading.
To achieve exact per-field precedence (`CLI options` > `Environment variables/.env` > `config.json` > `Defaults`) and allow partial merges, we implement a field-by-field manual mapping.

### Precedence Resolution Strategy
For every configuration field, the final value is resolved as:
`Value = CLI_Option ?? Process_Env ?? Config_File ?? Default_Value`

This ensures that:
1. CLI options always override environment variables.
2. Environment variables (which includes those loaded from `.env` files via `c12Load({ dotenv: true })`) override config.json values.
3. Nested configurations are fully merged rather than overridden as complete objects.

## R2: Dotenv Cascading behavior

> **F6 correction (review fix)**: c12's `dotenv: true` loads `.env` relative to a single resolved `cwd` (default: `process.cwd()`). It does **NOT** automatically cascade across both `cwd` and `~/.underboard/.env`. The previous claim ("loads from both cwd AND `~/.underboard/.env`") is unverified and likely false.

**Verified approach**: explicitly load `~/.underboard/.env` using `dotenv.config({ path: path.join(os.homedir(), '.underboard', '.env') })` before c12 runs, so its values populate `process.env` and participate in the Environment Variable tier. Then c12's `dotenv: true` loads the cwd `.env` (higher precedence in case of overlap).

This ensures SC-002 passes regardless of where the server is launched from.

## R3: Redaction of Sensitive Settings
To prevent leakages of api keys or auth tokens to stderr during startup or in debug outputs, a utility function is introduced to sanitize the loaded configuration.
- Fields matching `honcho.token` and `llm.api_key` are replaced with `"***"` if they are defined.
- Other parameters like endpoints, ports, database paths, and model paths remain in cleartext for debugging purposes.

## R4: Disabling Embeddings on Missing Model Path
Underboard will not provide a default value for the local ONNX embedding model path (`embedding.model_path`). 
- If `embedding_model_path` resolves to undefined, `initializeEmbedding` is skipped, and the model loading status transitions to `"disabled"`.
- The MCP server startup logs a warning: `Warning: embedding features disabled (EMBEDDING_MODEL_PATH is not configured)` to `stderr`.
- If `embedding_model_path` IS set but the file does not exist, status transitions to `"failed"` (error to `stderr`), embedding features inactive. Server does not crash.
- `embedding.model_name` is metadata only — logged at startup, available in config echo, NOT used by the ONNX loader (which uses `model_path`).
- `memory_recall` response includes `embedding_status: "disabled"` or `"failed"` (per FR-010) and falls back to lexical FTS5 retrieval.
- **Terminology**: `embedding_status` in the `memory_recall` **response** uses the existing union `"ready" | "lexical_only"` (backward compat — already returned by `recall.ts:23`, `hybrid-retrieval.ts:27`). 009's new states (`disabled` = path unset, `failed` = path set but load error) are **internal embedding subsystem states** surfaced in the **startup `stderr` log**, not in the recall response union. The `"lexical_only"` response umbrella covers both internal states. This avoids a breaking change to `MemoryRecallOutput`. Callers needing the distinction read the startup log.

## R5: Graceful Honcho Timeout Handling
When Honcho is configured as the active memory backend, all REST client operations are wrapped with the configured timeout (`honcho.timeout_ms` / `HONCHO_TIMEOUT_MS`).
- If Honcho REST requests time out or fail, a warning is printed to `stderr` (rate-limited: max 1 per 5 min per operation type after first occurrence).
- `memory_recall`: falls back to local database storage (FTS5 BM25 search). Returns partial results.
- `memory_write`: succeeds locally, enqueues for sync (existing sync queue). Response includes `synced: false` flag.
- The server MUST NOT crash or raise hard exceptions on Honcho timeout/outage.

## R6: Code Quality Notes (from Claude review F16)
- `honcho-client.ts:19` has a junk comment: `endpoint: string; // e.g., "http://127.0.0.1:7e76f2a0"` — hex string where a port belongs. Fix to `http://127.0.0.1:8000` during implementation.
- Default Honcho endpoint `127.0.0.1:8000` may not match the actual deployed container port. The user's Honcho instance maps host **8083**→container 8080 (internal 8000 per infra recon). The default `:8000` assumes direct container access. Users running via host port mapping MUST set `--honcho-endpoint http://127.0.0.1:8083`. Consider updating the default or documenting this clearly in quickstart.md.
