# Underboard

A local-first Model Context Protocol (MCP) tool server that provides AI agents with a shared **Task Board** and **Long-term Semantic Memory**.

## Features

- **Task Management**: A Kanban-style board for agents to create, update, and track tasks. Prevents duplicate work when switching between different AI tools or agents.
- **Semantic Memory**: Persistent memory for agents to store facts, decisions, and documentation.
- **Multi-Backend Memory**:
  - **Honcho v3 (Primary)**: High-quality semantic search using the Honcho REST API.
  - **Local Lexical (Fallback)**: Built-in SQLite FTS5 (BM25) search for offline work or when Honcho is unavailable.
- **Dialog Capture**: Automatically ingests normalized conversation logs (Phase 2) to build a project's knowledge base over time.
- **Web Dashboard**: A lightweight, local web interface to visualize tasks and memory feed.

## Installation

```bash
cd packages/underboard
npm install
npm run build
```

## Setup in AI Tools

### Claude Code

Add the server to your `claude_desktop_config.json`.

You can run it globally if you have used `npm link`:

```json
{
  "mcpServers": {
    "underboard": {
      "command": "underboard",
      "args": ["start", "--port", "4284", "--stdio"]
    }
  }
}
```

Or run it directly via Node using the absolute path:

```json
{
  "mcpServers": {
    "underboard": {
      "command": "node",
      "args": [
        "C:/Users/Admin/Documents/Repos/underhelpers/under-ai-helpers/packages/underboard/dist/cli/index.js",
        "start",
        "--port",
        "4284",
        "--stdio"
      ]
    }
  }
}
```

*Note: Make sure to include the `--stdio` flag. This allows Claude Desktop to communicate with the server directly over standard input/output. Also, ensure each argument (e.g., `start`, `--port`, `4282`, `--stdio`) is a separate element in the `"args"` array. Passing them as a single string will cause the execution to fail.*

### Configuration

Underboard uses a cascading precedence tree for configuration on a per-field basis:
**CLI Options > Environment Variables (and `.env` files) > Config file (`~/.underboard/config.json`) > Default values.**

#### Config options and defaults:

| Parameter | CLI Option | Environment Variable | Default Value | Description |
|-----------|------------|----------------------|---------------|-------------|
| HTTP Port | `--port <port>` | `PORT` | `4280` | HTTP port for the dashboard. |
| Database Path | `--db-path <path>` | `UNDERBOARD_DB_PATH` | `~/.underboard/data.db` | Path to the SQLite database. Tilde `~` is expanded to homedir. |
| Honcho Endpoint | `--honcho-endpoint <url>` | `HONCHO_ENDPOINT` | `http://127.0.0.1:8000` | Coordinates to your Honcho v3 instance. |
| Honcho Token | `--honcho-token <token>` | `HONCHO_TOKEN` | `undefined` | Bearer token for Honcho API (redacted as `***` in log output). |
| Honcho Timeout | `--honcho-timeout <ms>` | `HONCHO_TIMEOUT_MS` | `5000` | Connection and request timeout in milliseconds. |
| Embedding Model Name | `--embedding-model-name <name>` | `EMBEDDING_MODEL_NAME` | `paraphrase-multilingual-MiniLM-L12-v2.onnx` | Model name metadata. |
| Embedding Model Path | `--embedding-model-path <path>` | `EMBEDDING_MODEL_PATH` | `undefined` | Path to local ONNX model file. If unset, embedding is disabled. |
| LLM Endpoint | `--llm-endpoint <url>` | `LLM_ENDPOINT` | `undefined` | OpenAI-compatible endpoint. Suffix `/chat/completions` is auto-stripped. |
| LLM API Key | `--llm-api-key <key>` | `LLM_API_KEY` | `undefined` | API key for LLM operations (redacted as `***` in log output). |
| LLM Model Name | `--llm-model <model>` | `LLM_MODEL` | `undefined` | LLM model identifier. |

> [!NOTE]
> Sensitive configuration headers (Honcho Token and LLM API Key) are redacted in startup echoes and stderr blocks. When created/rewritten, `config.json` restricts permissions to `0600` (owner read/write only). Dotenv is resolved Cascading-style: first `~/.underboard/.env` is loaded, then cwd `.env` (overriding home).

## CLI Commands

The `underboard` binary (available via `npm link` or direct path) provides management commands:

```bash
underboard start   # Start the MCP server + Dashboard
underboard stop    # Stop the running server
underboard status  # Check server health and backend connectivity
underboard export  # Export the memory database
underboard import  # Import entries into memory
```

## Architecture

Underboard is designed to be the "shared brain" for your agent fleet. It treats the current working directory as the project scope, automatically detecting Git roots to isolate tasks and memories between different repositories.

For more technical details, see `specs/005-agents-board-and-memory/` and `specs/008-memory-backend-honcho/`.

## License

MIT
