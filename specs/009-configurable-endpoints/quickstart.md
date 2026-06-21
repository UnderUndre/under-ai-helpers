# Quickstart: Configurable Endpoints & API Keys for Underboard

**Feature**: 009-configurable-endpoints | **Date**: 2026-06-21

## Overview

This quickstart guides you through configuring Underboard with customized endpoints, ports, API keys, and embedding models.

## Precedence Rule

Underboard resolves configuration parameters field-by-field in the following priority order:
1. **CLI options** (passed directly to `underboard start`)
2. **Environment variables** (set in shell or loaded from `.env` files cascading from the current directory and `~/.underboard/.env`)
3. **Config file** (defined in `~/.underboard/config.json`)
4. **Default values**

## Scenario 1: Using Environment Variables and `.env`

You can define your configurations in a `.env` file inside your working directory:

```bash
# .env file
PORT=4285
UNDERBOARD_DB_PATH=/tmp/data.db
HONCHO_ENDPOINT=http://127.0.0.1:9000
HONCHO_TOKEN=my-honcho-bearer-token
HONCHO_TIMEOUT_MS=10000
EMBEDDING_MODEL_NAME=custom-mini-lm.onnx
EMBEDDING_MODEL_PATH=/home/user/.underboard/models/custom-mini-lm.onnx
LLM_ENDPOINT=https://api.openai.com/v1
LLM_API_KEY=sk-proj-xyz123
LLM_MODEL=gpt-4o
```

Start Underboard without passing additional arguments:

```bash
underboard start
```

It will automatically pick up the `.env` settings.

## Scenario 2: Configuring via Command Line Arguments (MCP Server configuration)

If you are configuring Underboard as an MCP server within Claude Desktop or Cursor/opencode, you can specify all arguments in the `args` array:

```json
{
  "mcpServers": {
    "underboard": {
      "command": "node",
      "args": [
        "/path/to/underboard/dist/cli/index.js",
        "start",
        "--port", "4288",
        "--db-path", "/home/user/.underboard/custom.db",
        "--honcho-endpoint", "http://10.0.0.5:8000",
        "--honcho-token", "my-secret-token",
        "--honcho-timeout", "3000",
        "--embedding-model-path", "/home/user/.underboard/models/model.onnx",
        "--llm-endpoint", "http://127.0.0.1:11434/v1",
        "--llm-model", "llama3",
        "--stdio"
      ]
    }
  }
}
```

These arguments take top precedence and overwrite any environment variables or config.json keys.

> **Note**: `--llm-endpoint` is a base URL (e.g. `http://127.0.0.1:11434/v1`). The client appends `/chat/completions` automatically. Do NOT include `/chat/completions` in the endpoint value.

## Scenario 3: Plaintext Credentials in `config.json`

If storing credentials in `~/.underboard/config.json`:

```json
{
  "port": 4280,
  "db_path": "~/.underboard/data.db",
  "honcho": {
    "endpoint": "http://127.0.0.1:8000",
    "token": "plaintext-token-allowed-here",
    "timeout_ms": 5000
  },
  "embedding": {
    "model_name": "paraphrase-multilingual-MiniLM-L12-v2.onnx"
  },
  "llm": {
    "endpoint": "https://api.openai.com/v1",
    "api_key": "sk-proj-api-key-plaintext-allowed",
    "model": "gpt-4o"
  }
}
```

When booting, Underboard prints configuration details to `stderr` with the sensitive fields redacted. Output truncated for brevity — all config fields are echoed; sensitive ones redacted per FR-007:

```text
Underboard Configuration:
  port: 4280
  db_path: /home/user/.underboard/data.db
  archive_mode: manual
  ...
  honcho.endpoint: http://127.0.0.1:8000
  honcho.token: ***
  honcho.timeout_ms: 5000
  embedding.model_name: paraphrase-multilingual-MiniLM-L12-v2.onnx
  embedding.model_path: undefined
  llm.endpoint: https://api.openai.com/v1
  llm.api_key: ***
  llm.model: gpt-4o
```
