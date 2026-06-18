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

Add the server to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "underboard": {
      "command": "node",
      "args": ["/path/to/under-ai-helpers/packages/underboard/dist/cli/index.js", "start"]
    }
  }
}
```

### Configuration

Underboard uses `c12` for configuration. You can provide settings via environment variables or a config file:

| Variable | Description | Default |
|----------|-------------|---------|
| `HONCHO_ENDPOINT` | URL to your Honcho v3 instance | `http://127.0.0.1:8000` |
| `HONCHO_TOKEN` | Bearer token for Honcho API | `undefined` |
| `UNDERBOARD_DB_PATH` | Path to the SQLite database | `~/.underboard/data.db` |
| `UNDERBOARD_PORT` | Port for the dashboard | `3000` |

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
