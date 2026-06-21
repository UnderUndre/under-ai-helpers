# Configuration Schema Contract

**Feature**: 009-configurable-endpoints | **Date**: 2026-06-21

## Overview

This contract defines the interfaces, environment variables, and CLI mappings for configuration loading and merging in Underboard.

## 1. CLI Arguments Schema

The `underboard start` command supports the following options:

```typescript
export interface CliOptions {
  port?: string;
  dbPath?: string;
  honchoEndpoint?: string;
  honchoToken?: string;
  honchoTimeout?: string;
  embeddingModelName?: string;
  embeddingModelPath?: string;
  llmEndpoint?: string;
  llmApiKey?: string;
  llmModel?: string;
}
```

CLI options take top priority and are mapped from:
- `--port <number>`
- `--db-path <path>`
- `--honcho-endpoint <url>`
- `--honcho-token <token>`
- `--honcho-timeout <ms>`
- `--embedding-model-name <name>`
- `--embedding-model-path <path>`
- `--llm-endpoint <url>`
- `--llm-api-key <key>`
- `--llm-model <model>`

## 2. Environment Variables Mapping

Environment variables map directly to config fields:

| Env Var Name | Config Key Path | Type |
|---|---|---|
| `PORT` | `port` | number |
| `UNDERBOARD_DB_PATH` | `db_path` | string |
| `HONCHO_ENDPOINT` | `honcho.endpoint` | string |
| `HONCHO_TOKEN` | `honcho.token` | string |
| `HONCHO_TIMEOUT_MS` | `honcho.timeout_ms` | number |
| `EMBEDDING_MODEL_NAME` | `embedding.model_name` | string |
| `EMBEDDING_MODEL_PATH` | `embedding.model_path` | string |
| `LLM_ENDPOINT` | `llm.endpoint` | string |
| `LLM_API_KEY` | `llm.api_key` | string |
| `LLM_MODEL` | `llm.model` | string |

## 3. Config File Schema (`config.json`)

The `~/.underboard/config.json` schema matches the interface below:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "port": { "type": "integer" },
    "db_path": { "type": "string" },
    "archive_mode": { "type": "string" },
    "archive_after_days": { "type": "integer" },
    "stalled_mode": { "type": "string" },
    "stalled_after_hours": { "type": "integer" },
    "retrieval": {
      "type": "object",
      "properties": {
        "lexical_weight": { "type": "number" },
        "semantic_weight": { "type": "number" },
        "default_top_k": { "type": "integer" },
        "default_threshold": { "type": "number" },
        "max_results": { "type": "integer" }
      }
    },
    "honcho": {
      "type": "object",
      "properties": {
        "endpoint": { "type": "string" },
        "token": { "type": "string" },
        "timeout_ms": { "type": "integer" }
      }
    },
    "embedding": {
      "type": "object",
      "properties": {
        "model_name": { "type": "string" },
        "model_path": { "type": "string" }
      }
    },
    "llm": {
      "type": "object",
      "properties": {
        "endpoint": { "type": "string" },
        "api_key": { "type": "string" },
        "model": { "type": "string" }
      }
    }
  }
}
```

## 4. Redaction Behavior

Any debug logs, console output, or telemetry emitting the configuration object MUST redact values inside:
- `honcho.token`
- `llm.api_key`

If the value is non-empty, it MUST be printed as `"***"`.

Additionally:
- **process.env dumps**: Any routine that dumps `process.env` (or a subset thereof) MUST redact known secret env vars (`HONCHO_TOKEN`, `LLM_API_KEY`) as `"***"`.
- **config.json permissions**: When `config.json` is created or rewritten and contains `honcho.token` or `llm.api_key`, the file MUST be created with `0600` permissions (owner read/write only).

## 5. LLM Endpoint Semantics

`LLM_ENDPOINT` / `--llm-endpoint` / `config.json#llm.endpoint` is a **base URL**. The LLM client appends `/chat/completions` automatically.

- Valid: `https://api.openai.com/v1`, `http://127.0.0.1:11434/v1`
- Invalid: `https://api.openai.com/v1/chat/completions` (trailing path will cause double-append)

## 6. Numeric Coercion

CLI options and env vars for numeric fields (`port`, `honcho.timeout_ms`) arrive as strings (commander parses to string, `process.env` is string). The config loader MUST coerce via `Number()` and validate with `Number.isFinite()` before merging. Non-numeric values produce a clear error: `Invalid numeric value for <field>: "<input>"`.

## 7. Config File Migration

On startup, if the existing `~/.underboard/config.json` is missing keys introduced by this feature (`honcho`, `embedding`, `llm`), the loader re-writes the file with the merged shape: existing user values preserved, new keys added at defaults. This ensures users see the full schema when editing `config.json` manually. Rewrite uses `0600` permissions if secrets are present.
