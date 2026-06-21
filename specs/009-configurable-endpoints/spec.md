# Feature Specification: Configurable Endpoints and API Keys for Underboard

**Feature Branch**: `009-configurable-endpoints`  
**Created**: 2026-06-20  
**Status**: Draft  
**Input**: User description: "009-configurable-endpoints — add Honcho port/url, embedding model, and LLM configuration (endpoint, API key, model) to variables and arguments"

## Context

### Relationship to Feature 008 (F2 — review fix)

Feature **008-memory-backend-honcho** wires the Honcho backend (`createBackend()`, `HonchoClient`, `HonchoBackend`) into the server. Feature **009** makes those endpoints configurable. **Dependencies:**

- **008 FR-005** (ONNX pipeline removal) is **deferred** — 009's US2 (embedding config) targets code that 008 plans to delete. If 008 ships first, 009/US2 scope shrinks. If 009 ships first, US2 is config plumbing for a pipeline that will be replaced.
- **008 wiring** (`createBackend()` call sites, MCP server dispatch through `MemoryBackend`) is a **blocking prerequisite** for 009 — see FR-012. Without 008's wiring, 009 config is inert (user sets `--honcho-endpoint`, nothing consumes it).
- **Resolution**: 009 adds explicit wiring tasks (FR-012) that depend on 008's `createBackend` being callable from `startServer` → `createMcpServer` → memory tools. If 008 hasn't wired this, 009's wiring tasks do it.

Underboard relies on third-party services and models for its semantic memory and dialogue features:
1. **Honcho v3**: The primary semantic storage backend, accessed via HTTP.
2. **Embedding Model**: A local ONNX model used for local vector search embeddings.
3. **LLM**: Needed for the dialectic deep recall feature to synthesize memories.

Currently, parameters like Honcho URL/port/token, embedding model path, and LLM settings are either hardcoded or lack clean environment variable/CLI option parity. 

To ensure parity and developer flexibility, all these parameters need to be made configurable using a unified priority tree: CLI options > Environment variables (and `.env` files) > `config.json` file settings > Default values.

## Relationship to Feature 008 (Memory Backend Honcho)

This feature depends on and completes the work begun in [`specs/008-memory-backend-honcho`](../008-memory-backend-honcho/). Key reconciliation:

- **008/FR-005 (ONNX removal) is CANCELLED.** The local ONNX embedding pipeline (onnxruntime-node, model-downloader, stub tokenizer, sqlite-vec) stays as a **third-tier retrieval path**. 009/US2 configures this live code. The decision: local embedding + Honcho coexist — Honcho is the semantic backend when available, local ONNX is the fallback/standalone tier, FTS5 is the last resort.
- **008/FR-001 through FR-004 (Honcho seam) remain in force.** The `MemoryBackend` interface, `HonchoBackend` class, `createBackend()` factory, and HonchoClient are all valid.
- **CRITICAL wiring gap (from 008 review):** `createBackend()` has zero call sites — `startServer` never constructs it, `mcp-server.ts` dispatches memory tools through the old direct-SQLite path (`memoryRecall`/`memoryWrite`). **009 MUST close this gap** by adding wiring tasks (see T-WIRE-* in tasks.md), otherwise SC-001 cannot pass: setting `--honcho-endpoint` produces no behavioral change.
- **Cross-project tools (`recall-cross`, `delete-cross`) are registered in 008 scope**, not 009. 009 configures Honcho but does not register new MCP tools. Cross-project recall end-to-end testing requires 008's tool registration tasks to complete first.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Custom Honcho backend configuration (Priority: P1)

An operator wants to run Underboard against a custom Honcho deployment (e.g., hosted remotely or on a custom port). They configure the Honcho endpoint and token via environment variables or CLI options. The MCP server boots up and successfully routes memory conclusions to the custom Honcho instance.

**Why this priority**: Honcho is the primary semantic storage backend, and being unable to configure its location blocks remote deployments or custom developer setups.

**Independent Test**: Start the server with `HONCHO_ENDPOINT=http://127.0.0.1:8080` (or CLI option `--honcho-endpoint http://127.0.0.1:8080`) and verify that it attempts to connect to port 8080.

**Acceptance Scenarios**:

1. **Given** a running Honcho instance on a non-standard port, **When** Underboard starts with `--honcho-endpoint` pointing to it, **Then** it successfully connects and registers the project workspace.
2. **Given** a custom Honcho token provided via `HONCHO_TOKEN` env variable, **When** a write/recall command is run, **Then** all requests to Honcho carry the custom token in their `Authorization` headers.

---

### User Story 2 - Embedding model selection (Priority: P1)

> **F3 caveat (review fix)**: The current embedding tokenizer (`embedding-service.ts:91-104`) is a **hash stub** (`Math.abs(hash) % 30000`), not a real WordPiece/SentencePiece tokenizer. Embeddings produced are semantically meaningless regardless of which ONNX model is loaded. US2 configures the model **path** and **name** — it does NOT fix the tokenizer. Semantic search quality is tracked separately as a 008 follow-up (replace stub with real tokenizer matching the model's vocabulary). Do not interpret US2's acceptance criteria as proof of working semantic recall.

A developer wants to customize the local ONNX embedding model or specify its exact file path on disk without having it tied to default directory locations.

**Why this priority**: Required for offline work environments or custom semantic search models.

**Independent Test**: Start the server pointing to a custom embedding model file using `--embedding-model-path` and verify that the embedding pipeline initializes using the specified model.

**Acceptance Scenarios**:

1. **Given** an alternative ONNX model file on disk, **When** starting with `--embedding-model-path`, **Then** the local ONNX runtime loads the custom model.
2. **Given** no model path configured, **When** starting, **Then** the server starts successfully but logs a warning to `stderr` that embedding/semantic features are inactive (`embedding_status: "disabled"`) until `EMBEDDING_MODEL_PATH` is set.
3. **Given** `EMBEDDING_MODEL_PATH` is set but the file does not exist, **When** starting, **Then** the server logs an error to `stderr` (`embedding_status: "failed"`), disables embedding features, and starts without crashing.
4. **Given** `EMBEDDING_MODEL_PATH` points to `~/custom/model.onnx` and user runs `underboard model fetch`, **Then** the model is downloaded to `~/.underboard/models/` (default location), NOT to `~/custom/`. The user must manually relocate or re-point `EMBEDDING_MODEL_PATH`.

> **NEEDS-FIX (out of 009 scope, tracked separately):** The current `tokenize()` in `embedding-service.ts:91-104` is a hash-of-word-chars stub (`Math.abs(hash) % 30000`), not a WordPiece/SentencePiece tokenizer matching the MiniLM model vocabulary (~250k multilingual tokens). This means embeddings are semantically near-random regardless of which `.onnx` model is loaded. 009/US2 delivers **config plumbing only** — the ability to point at a model file. Semantic recall quality is a pre-existing bug (005-era) tracked for a separate fix (real tokenizer implementation). The green checkmark on US2 acceptance scenarios validates configuration resolution, NOT semantic search quality. Do not mistake it for working semantic recall.

---

### User Story 3 - LLM configuration for dialectic synthesis (Priority: P2)

An operator wants to enable the deep recall (dialectic) feature. They configure the LLM provider, API key, endpoint, and model name using env vars or CLI arguments. The dialectic tool uses these settings to call the LLM and synthesize memories.

**Why this priority**: Required to enable LLM-bound synthesis features without hardcoding API endpoints or keys.

**Independent Test**: Configure an OpenAI-compatible endpoint and model name, execute a deep recall query, and verify that the request is routed to the configured endpoint with the correct API key header.

**Acceptance Scenarios**:

1. **Given** custom LLM endpoint and API key, **When** deep recall is invoked, **Then** a request is sent to the configured LLM endpoint.
2. **Given** no LLM API key, **When** deep recall is invoked, **Then** the tool returns a clear error message stating that LLM credentials are missing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Underboard MUST support configuring the Honcho endpoint, token, and timeout via:
  - Environment variables: `HONCHO_ENDPOINT`, `HONCHO_TOKEN`, `HONCHO_TIMEOUT_MS`
  - CLI options: `--honcho-endpoint`, `--honcho-token`, `--honcho-timeout`
  - Config file (`config.json`): Nested under the `"honcho"` key: `"endpoint"`, `"token"`, `"timeout_ms"`. (Default: `http://127.0.0.1:8000` for endpoint, `5000` for timeout_ms).
- **FR-002**: Underboard MUST support configuring the embedding model name and file path via:
  - Environment variables: `EMBEDDING_MODEL_NAME`, `EMBEDDING_MODEL_PATH`
  - CLI options: `--embedding-model-name`, `--embedding-model-path`
  - Config file (`config.json`): Nested under the `"embedding"` key: `"model_name"`, `"model_path"`. (Default: `paraphrase-multilingual-MiniLM-L12-v2.onnx` for name).
  - `embedding.model_name` is metadata only — logged at startup and available in the config echo. It is NOT used by the ONNX loader (which uses `model_path`). It exists for operator visibility and future telemetry.
  - **No default `model_path`**. If `EMBEDDING_MODEL_PATH` / `--embedding-model-path` / `config.embedding.model_path` is not provided, embedding-dependent features (semantic recall, vector search) MUST be **disabled**. The server MUST start successfully but log a warning to `stderr` with `embedding_status: "disabled"`.
  - **Missing file on set path**: If `model_path` IS set but the file does not exist on disk, the server MUST log an error to `stderr` with `embedding_status: "failed"` and disable embedding features (same observable behavior as `disabled` for callers). The server MUST NOT crash.
  - The `underboard model fetch` command downloads the default model (`paraphrase-multilingual-MiniLM-L12-v2.onnx`) to `~/.underboard/models/` **regardless of `EMBEDDING_MODEL_PATH`** — it is a bootstrap convenience, not a dynamic download. After fetching, the user MUST still point `EMBEDDING_MODEL_PATH` to the file explicitly via one of the configuration sources.
- **FR-003**: Underboard MUST support configuring the external LLM endpoint, API key, and model name via:
  - Environment variables: `LLM_ENDPOINT`, `LLM_API_KEY`, `LLM_MODEL`
  - CLI options: `--llm-endpoint`, `--llm-api-key`, `--llm-model`
  - Config file (`config.json`): Nested under the `"llm"` key: `"endpoint"`, `"api_key"`, `"model"`. (Default values are empty, requiring explicit configuration to enable LLM features).
  - `LLM_ENDPOINT` is the **base URL** (e.g. `https://api.openai.com/v1` or `http://127.0.0.1:11434/v1`). The LLM client appends `/chat/completions` automatically. Users MUST NOT include the `/chat/completions` suffix in the endpoint value.
- **FR-004**: Underboard MUST prioritize configuration sources on a **per-field** basis: for each individual field, CLI options > Environment variables (and `.env` files) > Config file (`~/.underboard/config.json`) > Default values. Sources are NOT all-or-nothing — a user may set `port` via CLI and `db_path` via `config.json`, and both resolve independently at their highest-priority source.
- **FR-005**: All warning/info output regarding configuration checks or connectivity errors MUST be printed to `stderr` in STDIO mode to avoid corrupting the MCP communication stream.
- **FR-006**: Underboard MUST support configuring the SQLite database path via:
  - Environment variable: `UNDERBOARD_DB_PATH`
  - CLI option: `--db-path <path>`
  - Config file (`config.json`): `"db_path"` key (snake_case). (Default: `~/.underboard/data.db`).
- **FR-007**: Sensitive values (`honcho.token`, `llm.api_key`) MAY be stored as plaintext in `config.json`. When echoing configuration (startup banner, debug output, stderr warnings), these values MUST be redacted as `***`. Non-sensitive values (endpoints, ports, model names) are not redacted. Additionally:
  - **process.env dumps**: If any debug or diagnostic routine dumps `process.env` (or a subset), known secret env vars (`HONCHO_TOKEN`, `LLM_API_KEY`) MUST be redacted as `***`.
  - **config.json permissions**: When `config.json` is created or rewritten and contains `honcho.token` or `llm.api_key`, the file MUST be created with `0600` permissions (owner read/write only).
- **FR-008**: Underboard MUST load `.env` files from **two explicit paths**: (1) `~/.underboard/.env` (loaded first via `dotenv.config()` before c12), and (2) cwd `.env` (loaded by c12's `dotenv: true`). Values from cwd `.env` override `~/.underboard/.env` for overlapping keys. CLI options (FR-004) take precedence over all `.env`-sourced values.
- **FR-009**: When a Honcho request times out (exceeds `honcho.timeout_ms`) or the instance is unreachable, Underboard MUST degrade gracefully without crashing or returning a hard error response. Operation-specific behavior:
  - **`memory_recall`**: Fall back to local storage (FTS5 / local-lexical backend). Return partial results to the caller.
  - **`memory_write`**: Succeed locally (local DB write), enqueue for sync (existing sync queue per `migrations/003_dialog_spools.sql`). Response MUST include `synced: false` flag so callers know the write is pending replication.
  - **Warning rate-limiting**: Degradation warnings to `stderr` are rate-limited to at most **1 warning per 5 minutes per operation type** (`recall`, `write`) after the first occurrence, to prevent log flooding during prolonged outages. The first occurrence is always logged immediately.
- **FR-010**: `memory_recall` response MUST include an `embedding_status` field reflecting the embedding subsystem state. The existing union `"ready" | "lexical_only"` (already returned by `recall.ts:23`, `hybrid-retrieval.ts:27`) is EXTENDED to:
  - `"ready"` — embeddings loaded and used for semantic recall (ONNX active).
  - `"lexical_only"` — embeddings unavailable; recall falls back to lexical FTS5 only. This covers two sub-cases that 009 introduces:
    - `model_path` not configured → intentional off (config `disabled`).
    - `model_path` configured but file missing or load error → failure (`failed`).
  The `"lexical_only"` umbrella is preserved for backward compatibility. Callers needing the distinction (config-disabled vs load-failed) read the startup `stderr` log, where the server emits the specific reason. This avoids a breaking change to the existing `MemoryRecallOutput` union while adding operational visibility.
- **FR-011**: On startup, if the existing `~/.underboard/config.json` is missing new keys introduced by this feature (`honcho`, `embedding`, `llm`), Underboard MUST re-write the file with the merged shape: existing keys preserved, new keys added with default values. This ensures users see the full schema when they open `config.json` to configure new options. The rewrite MUST preserve existing user values and use `0600` permissions if secrets are present (per FR-007).
- **FR-012 (F1 — wiring)**: The resolved config MUST be threaded into `startServer` → `createMcpServer` → memory tools. Specifically:
  - `startServer(opts)` MUST accept the resolved `UnderboardConfig` and pass it to `createMcpServer`.
  - `createMcpServer(db, config)` MUST call `createBackend(db, config)` (feature 008's factory) and dispatch `memory_recall`/`memory_write` through the returned `MemoryBackend` instead of direct `memoryRecall(db,…)`/`memoryWrite(db,…)` calls.
  - Without this wiring, config resolution (T004) is inert — a user sets `--honcho-endpoint` and nothing changes.
- **FR-013 (F4 — embedding refactor)**: `initializeEmbedding()` MUST be refactored from a no-arg module singleton (reading hardcoded `MODEL_DIR`/`MODEL_NAME`/`MODEL_PATH` consts) to accept a config object `{ model_path?: string; model_name: string }`. The `http-server.ts:277` call site MUST pass the resolved embedding config. `embed()` and `getEmbeddingStatus()` remain singletons but read from a module-level config snapshot set by `initializeEmbedding(config)`.
- **FR-014 (F14 — layering)**: BM25 fallback and timeout handling belong in `honcho.ts` (the backend wrapper), NOT in `honcho-client.ts` (the REST client). `HonchoBackend.recall` already catches errors and falls back to `this.local.recall()` — this is the correct layer. `honcho-client.ts` stays storage-agnostic: it throws on timeout, the backend decides degradation. T007 is re-scoped to "verify existing fallback + wire config," not "implement fallback in client."

### CLI Arguments for MCP Server Configuration

The variables below are exposed as CLI arguments to `underboard start`, allowing MCP clients (opencode, Claude Desktop, Cline) to configure the server purely via the `args` array — no `env` block required. Env var and `config.json` equivalents remain available per FR-004 priority.

| CLI Argument            | Env Var              | Default                       | FR         |
| ----------------------- | -------------------- | ----------------------------- | ---------- |
| `--port <port>`         | `PORT`               | `4280`                        | (existing) |
| `--db-path <path>`      | `UNDERBOARD_DB_PATH` | `~/.underboard/data.db`       | FR-006     |
| `--honcho-endpoint <url>`  | `HONCHO_ENDPOINT` | `http://127.0.0.1:8000`       | FR-001     |
| `--honcho-token <token>`   | `HONCHO_TOKEN`    | `undefined`                   | FR-001     |
| `--honcho-timeout <ms>`    | `HONCHO_TIMEOUT_MS` | `5000`                       | FR-001     |
| `--embedding-model-path <path>` | `EMBEDDING_MODEL_PATH` | *(none — embedding disabled if unset)* | FR-002 |
| `--embedding-model-name <name>` | `EMBEDDING_MODEL_NAME` | `paraphrase-multilingual-MiniLM-L12-v2.onnx` | FR-002 |
| `--llm-endpoint <url>`  | `LLM_ENDPOINT`       | `undefined`                   | FR-003     |
| `--llm-api-key <key>`   | `LLM_API_KEY`        | `undefined`                   | FR-003     |
| `--llm-model <model>`   | `LLM_MODEL`          | `undefined`                   | FR-003     |

**MCP server launch example** (opencode / Claude Desktop config):

```json
{
  "mcpServers": {
    "underboard": {
      "command": "node",
      "args": [
        "/path/to/underboard/dist/cli/index.js",
        "start",
        "--port",
        "4284",
        "--db-path",
        "~/.underboard/data.db",
        "--honcho-endpoint",
        "http://127.0.0.1:8000",
        "--honcho-token",
        "secret-token",
        "--stdio"
      ]
    }
  }
}
```

### Key Entities

- **UnderboardConfig**: Holds the consolidated configuration schema representing HTTP port, DB path, Honcho settings, embedding settings, and LLM settings.

## Clarifications

### Session 2026-06-21

- Q: Should secrets (Honcho token, LLM API key) be allowed as plaintext in `config.json`, or restricted to env/CLI only? → A: Plaintext allowed in `config.json`; values redacted as `***` in all log/debug output.
- Q: Should `.env` file loading be enabled, and from which paths? → A: c12 default cascading: cwd `.env` + `~/.underboard/.env`. CLI options override `.env` values.
- Q: What should happen when a Honcho request times out? → A: Graceful degradation — warn to stderr, fall back to local FTS5/lexical backend, return partial results. No crash.
- Q: Should there be a default embedding model path? → A: No default `model_path`. If not configured, embedding features disabled (server starts, warns to stderr). `model fetch` downloads it but user must point to it explicitly.
- Q: Should config source priority be all-or-nothing or per-field merge? → A: Per-field merge (c12 default). Each field resolves independently at its highest-priority source.

### Review Fixes Session 2026-06-21 (Claude review CRITICAL → opencode review HIGH)

- **F1 (CRITICAL, fixed)**: `createBackend()` had zero call sites — `startServer` never constructed it, `mcp-server.ts` dispatched memory tools through direct-SQLite path. Added T016 [BE] to wire `startServer` → `createBackend` → dispatch through `MemoryBackend`. Without this, SC-001 cannot pass.
- **F2 (CRITICAL, fixed)**: 009/US2 (configure embedding) contradicted 008/FR-005 (delete embedding). **Resolution: 008/FR-005 CANCELLED** — local ONNX embedding stays as third-tier. Honcho seam (008/FR-001-004) kept. See "Relationship to Feature 008" section above.
- **F3 (HIGH, fixed)**: US2 acceptance scenarios can pass while tokenizer is a hash stub producing garbage embeddings. Added NEEDS-FIX note scoping US2 as "config plumbing only." Tokenizer fix tracked separately.
- **F4 (HIGH, fixed)**: `initializeEmbedding()` is argument-less singleton with hardcoded module consts. T009 rewritten to explicitly cover the singleton → config-injected refactor + `http-server.ts:277` call site update.
- **F6 (HIGH, fixed)**: research.md R2 falsely claimed c12 cascades `.env` from cwd + `~/.underboard/.env`. Corrected: c12 loads cwd only. Added T-VERIFY-ENV to empirically confirm two-path loading works.
- **F9 (MEDIUM, fixed)**: `embedding_status: "lexical_only"` already exists in code (`recall.ts:23`). FR-010 rewritten to EXTEND existing union rather than replace it. Internal states (`disabled`/`failed`) surfaced in stderr log, not response union (backward compat).
- **F14 (MEDIUM, fixed)**: T007 retargeted from `honcho-client.ts` (wrong layer) to `honcho.ts` (backend owns degradation). Client stays storage-agnostic.
- **F8 (MEDIUM, noted)**: Cross-project tools unregistered — 008 scope, dependency noted in tasks.md Phase 3.
- **F16 (LOW, noted)**: `honcho-client.ts:19` hex comment + default port mismatch flagged in research.md R6.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running `underboard start --honcho-endpoint http://localhost:9000` overrides the default endpoint and routes Honcho requests to port 9000.
- **SC-002**: Environment variables defined in a local `.env` file are successfully loaded by c12 and populated in the server configuration.
- **SC-003**: Running in `--stdio` mode with invalid credentials/endpoints prints warnings to `stderr` and does not crash the MCP initialization stream.
- **SC-004**: Running `underboard start --db-path /tmp/test.db` creates/opens SQLite at the specified path, not the default `~/.underboard/data.db`.
- **SC-005**: Starting with no `EMBEDDING_MODEL_PATH` configured boots the server successfully; semantic recall returns a warning that embeddings are inactive.
- **SC-006**: When Honcho is unreachable (timeout), `memory_recall` returns local FTS5 results with a `stderr` warning instead of a hard error.
- **SC-007**: Startup config echo on `stderr` shows `honcho.token: ***` and `llm.api_key: ***` (redacted), while `honcho.endpoint: http://127.0.0.1:8000` is shown in clear.
- **SC-008**: `memory_recall` response contains `embedding_status` field (`"ready"` when ONNX active, `"lexical_only"` when disabled/failed) matching the embedding subsystem state.
- **SC-009**: When `memory_write` is called and Honcho is unreachable, the response includes `synced: false`, and the write is locally persisted + enqueued for sync.
- **SC-010**: A debug routine that dumps `process.env` shows `HONCHO_TOKEN: ***` and `LLM_API_KEY: ***` (redacted), not cleartext values.
- **SC-011**: Upgrading from an old `config.json` (without `honcho`/`embedding`/`llm` keys) results in the file being rewritten with new keys added at default values, existing user values preserved.
- **SC-012**: During a 10-minute Honcho outage with continuous `memory_recall` calls, `stderr` receives at most 2 degradation warnings (1 initial + 1 after 5 min), not one per call.
- **SC-013**: A user sets `--honcho-endpoint http://localhost:9000` and `memory_recall` dispatches through `createBackend()` → `HonchoBackend` → `HonchoClient` with the custom endpoint (FR-012 wiring verified end-to-end).
- **SC-014**: `initializeEmbedding({ model_path: '/custom/model.onnx', model_name: '...' })` loads the model from the specified path; `http-server.ts` passes resolved config (FR-013 refactor verified).
