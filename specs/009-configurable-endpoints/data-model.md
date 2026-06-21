# Data Model: Configuration Configuration Schema for Underboard

**Feature**: 009-configurable-endpoints | **Date**: 2026-06-21

## Overview

Configuration is resolved at runtime using a unified priority tree: CLI options > Environment variables (and `.env` files) > `config.json` file settings > Default values. The resolved values are modeled as a structured configuration object (`UnderboardConfig`) representing the application's runtime parameters.

No database migrations are introduced in this feature. All configurations are handled at the application tier.

## Configuration Schema

The resolved configuration is represented in TypeScript by the following interface structure:

```typescript
export interface UnderboardConfig {
  port: number;
  db_path: string;
  archive_mode: string;
  archive_after_days: number;
  stalled_mode: string;
  stalled_after_hours: number;
  retrieval: {
    lexical_weight: number;
    semantic_weight: number;
    default_top_k: number;
    default_threshold: number;
    max_results: number;
  };
  honcho: {
    endpoint: string;
    token?: string;
    timeout_ms: number;
  };
  embedding: {
    model_name: string;
    model_path?: string;
  };
  llm: {
    endpoint?: string;
    api_key?: string;
    model?: string;
  };
}
```

## Default Values

The default configuration (defined in `packages/underboard/src/cli/config.ts`) is:

```typescript
const DEFAULT_CONFIG: UnderboardConfig = {
  port: 4280,
  db_path: path.join(os.homedir(), ".underboard", "data.db"),
  archive_mode: "manual",
  archive_after_days: 30,
  stalled_mode: "off",
  stalled_after_hours: 24,
  retrieval: {
    lexical_weight: 0.4,
    semantic_weight: 0.6,
    default_top_k: 5,
    default_threshold: 0.3,
    max_results: 50,
  },
  honcho: {
    endpoint: "http://127.0.0.1:8000",
    timeout_ms: 5000,
  },
  embedding: {
    model_name: "paraphrase-multilingual-MiniLM-L12-v2.onnx",
    // model_path is intentionally absent to disable local embedding-dependent
    // features unless explicitly configured by the user.
  },
  llm: {
    // LLM parameters default to undefined (dialectic synthesis disabled).
  },
};
```

## Mapping & Priority Resolution

For each configuration parameter, resolution follows the precedence rules below:

| Field | CLI Option | Environment Variable | Config File (`config.json`) | Default Value |
|---|---|---|---|---|
| `port` | `--port` | `PORT` | `"port"` | `4280` |
| `db_path` | `--db-path` | `UNDERBOARD_DB_PATH` | `"db_path"` | `~/.underboard/data.db` |
| `honcho.endpoint` | `--honcho-endpoint` | `HONCHO_ENDPOINT` | `"honcho": { "endpoint" }` | `http://127.0.0.1:8000` |
| `honcho.token` | `--honcho-token` | `HONCHO_TOKEN` | `"honcho": { "token" }` | `undefined` |
| `honcho.timeout_ms`| `--honcho-timeout` | `HONCHO_TIMEOUT_MS` | `"honcho": { "timeout_ms" }` | `5000` |
| `embedding.model_name` | `--embedding-model-name` | `EMBEDDING_MODEL_NAME` | `"embedding": { "model_name" }` | `paraphrase-multilingual-MiniLM-L12-v2.onnx` |
| `embedding.model_path` | `--embedding-model-path` | `EMBEDDING_MODEL_PATH` | `"embedding": { "model_path" }` | `undefined` |
| `llm.endpoint` | `--llm-endpoint` | `LLM_ENDPOINT` | `"llm": { "endpoint" }` | `undefined` |
| `llm.api_key` | `--llm-api-key` | `LLM_API_KEY` | `"llm": { "api_key" }` | `undefined` |
| `llm.model` | `--llm-model` | `LLM_MODEL` | `"llm": { "model" }` | `undefined` |
