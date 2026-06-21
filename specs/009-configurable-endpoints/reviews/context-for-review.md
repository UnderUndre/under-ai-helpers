# Review Context: Configurable Endpoints and API Keys for Underboard

This document provides context for external AI reviewers (`codex`, `antigravity`, `gemini`, `copilot`) to perform cross-AI review for feature `009-configurable-endpoints` per UnderUndre AI Helpers Constitution Principle VI.

## 1. Feature Objective

The goal is to allow configuration of Underboard's endpoints, timeouts, API keys, embedding models, and database paths via CLI arguments, environment variables, config files, and defaults.

The priority order is strictly **per-field**:
`CLI Options > Environment Variables (including .env files) > config.json settings > Default values`

## 2. Key Requirements

1. **Honcho Configuration**: Honcho endpoint, token, and timeout configuration via CLI (`--honcho-endpoint`, `--honcho-token`, `--honcho-timeout`), env (`HONCHO_ENDPOINT`, `HONCHO_TOKEN`, `HONCHO_TIMEOUT_MS`), or `config.json` under `"honcho"`.
2. **Embedding Configuration**: Local ONNX model name and model path configuration. If no path is specified, embedding features are disabled (warnings logged to `stderr` and server starts successfully).
3. **LLM Configuration**: OpenAI-compatible LLM endpoint, API key, and model name configuration for dialectic deep recall.
4. **Database Configuration**: SQLite database path configuration (`--db-path`, `UNDERBOARD_DB_PATH`, `config.json#db_path`).
5. **Redaction**: All configurations echoed to log/console MUST redact sensitive parameters (`honcho.token`, `llm.api_key`) as `***`.
6. **Graceful Fallbacks**: Honcho request timeouts/outages must degrade gracefully to local FTS5 lexical BM25 fallback without server crashes.

## 3. Architecture & Target Files

The configuration loader lives in `packages/underboard/src/cli/config.ts` using `c12`. We will:

- Update `UnderboardConfig` interface.
- Implement field-by-field merge resolution.
- Modify `packages/underboard/src/cli/index.ts` to parse options.
- Update `packages/underboard/src/memory-backend/backend-factory.ts` and `honcho-client.ts` to respect timeouts and handle outages gracefully.
- Update `packages/underboard/src/embedding/embedding-service.ts` to conditionally initialize model depending on whether a path is present.

## 4. Verification & Testing

Tests under `packages/underboard/tests/` will verify:

- Resolution precedence (CLI overrides Env overrides config).
- Stderr printing of warning logs.
- Sensitive value redaction.
- Graceful degradation on Honcho timeouts.

## 5. Reviewer Instructions

Verify if the proposed spec (`spec.md`), plan (`plan.md`), and tasks (`tasks.md`) are consistent and robust.
Produce your review in `specs/009-configurable-endpoints/reviews/<provider>.md` using the following YAML frontmatter verdict structure at the end of your file:

```yaml
verdict: PASS | MEDIUM | HIGH | CRITICAL
reviewer: <provider> (e.g. gemini, copilot, antigravity, codex)
reviewed_at: <ISO timestamp>
commit: 73896450d320126e99b0ff2351273dc4664e02be
critical_count: <N>
high_count: <N>
medium_count: <N>
low_count: <N>
```
