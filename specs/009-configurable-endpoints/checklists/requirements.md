# Requirements Checklist: Configurable Endpoints and API Keys for Underboard

**Purpose**: Verify the correct loading, priority, and validation of all third-party endpoints and API keys.
**Created**: 2026-06-20
**Feature**: [spec.md](../spec.md)

## Configuration Priority

- [ ] CHK001 Verify that CLI arguments (e.g., `--honcho-endpoint`) take highest precedence and override environment variables.
- [ ] CHK002 Verify that environment variables (e.g., `HONCHO_ENDPOINT`) override properties in `config.json`.
- [ ] CHK003 Verify that properties in `config.json` override hardcoded default values.
- [ ] CHK004 Verify that `.env` files in the current working directory are successfully loaded and override default properties.

## Logging & Protocol Safety

- [ ] CHK005 Verify that in `--stdio` mode, all warnings and information messages are routed to `stderr` (no stdout pollution).
- [ ] CHK006 Verify that starting in `--stdio` mode with unreachable endpoints doesn't crash the JSON-RPC initialization handshake.

## Embedding Model Configuration

- [ ] CHK007 Verify that `--embedding-model-name` and `--embedding-model-path` override the default ONNX model.
- [ ] CHK008 Verify that if `EMBEDDING_MODEL_PATH` is unset, status is `"disabled"` (warning to stderr, degrades gracefully).
- [ ] CHK008a Verify that if `EMBEDDING_MODEL_PATH` is SET but file missing, status is `"failed"` (error to stderr, degrades gracefully, no crash).
- [ ] CHK008b Verify that `underboard model fetch` always downloads to `~/.underboard/models/` regardless of `EMBEDDING_MODEL_PATH`.
- [ ] CHK008c Verify that `memory_recall` response includes `embedding_status` field (`ready`/`lexical_only`).

## LLM Configuration

- [ ] CHK009 Verify that `--llm-endpoint`, `--llm-api-key`, and `--llm-model` are correctly parsed and loaded.
- [ ] CHK010 Verify that deep recall tool fails gracefully with an informative error if it is used but no LLM API key is configured.
- [ ] CHK010a Verify that `LLM_ENDPOINT` is treated as base URL (client appends `/chat/completions`; double-append is prevented).

## Security & Redaction

- [ ] CHK011 Verify that `process.env` dumps in debug output redact `HONCHO_TOKEN` and `LLM_API_KEY` as `***`.
- [ ] CHK012 Verify that `config.json` containing secrets is created with `0600` permissions.

## Honcho Fallback

- [ ] CHK013 Verify that `memory_write` on Honcho timeout returns `synced: false` and persists locally.
- [ ] CHK014 Verify that degradation warnings are rate-limited (max 1 per 5 min per op type) during prolonged outage.

## Config Migration

- [ ] CHK015 Verify that upgrading from an old `config.json` (missing `honcho`/`embedding`/`llm` keys) re-writes the file with new keys at defaults, preserving existing user values.
