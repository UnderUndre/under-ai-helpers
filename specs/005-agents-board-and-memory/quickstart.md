# Quickstart: Agent Task Board + Shared Memory Service

**Feature**: 005-agents-board-and-memory | **Date**: 2026-05-28

## Prerequisites

- Node.js 20+ LTS
- npm 10+
- Git (for project auto-detection)

## Setup

```bash
# From monorepo root
cd packages/underboard
npm install
npm run build
```

## First Run

```bash
# Start the service (default port 4280)
npm run start

# Or with custom port
npm run start -- --port 8080
```

On first start:
1. SQLite database created at `~/.underboard/data.db`
2. Cryptographically secure random 32-byte Bearer token generated and saved at `~/.underboard/token` (under strict `0600` permissions on Unix, standard User ACL on Windows).
3. Multilingual embedding model `paraphrase-multilingual-MiniLM-L12-v2.onnx` (~120MB) downloaded to `~/.underboard/models/`. One-time internet access is required. For air-gapped environments, manually sideload the model or use `underboard model fetch`.
4. MCP server listens exclusively on loopback `http://127.0.0.1:4280/mcp` (SSE transport), secured via CORS Host/Origin middleware.
5. Dashboard served at `http://127.0.0.1:4280/` (requires Bearer token parameter on initial load: `http://127.0.0.1:4280/?token=<token>`).
6. Health endpoint at `http://127.0.0.1:4280/health` (requires Bearer token header).

## Connect an Agent

### Claude Code (MCP config)

Add to your project's MCP configuration (`mcp.json`):
```json
{
  "mcpServers": {
    "underboard": {
      "url": "http://127.0.0.1:4280/mcp/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer <YOUR_TOKEN_HERE>",
        "X-Agent-CWD": "/absolute/path/to/project",
        "X-Agent-Name": "claude"
      }
    }
  }
}
```

### Cursor / Codex / Other SSE compatible clients

Add as SSE connection. If headers are not supported by the client, pass context and auth token as query parameters:
```text
http://127.0.0.1:4280/mcp/sse?token=<YOUR_TOKEN>&cwd=<CWD>&name=<AGENT_NAME>
```

**Compatibility Matrix**:
- **Claude Code**: Supports standard headers (`Authorization`, `X-Agent-CWD`, `X-Agent-Name`). Recommended connection method.
- **Cursor**: Supports query parameters for SSE authentication and project context.
- **Codex**: Supports standard headers or custom environment initialization scripts.

Agent tools available immediately:
- **Memory**: `memory_write`, `memory_recall`, `memory_recall_cross_project`, `memory_list_recent`, `memory_delete`
- **Tasks**: `task_create`, `task_update`, `task_list`, `task_list_assigned`, `task_archive`
- **Activity**: `activity_log_start`, `activity_log_emit`, `activity_log_get`

## CLI Commands

```bash
underboard start [--port PORT]           # Start service (foreground)
underboard stop                          # Stop running service
underboard status                        # Check service health
underboard model fetch                   # Explicitly fetch embedding model (offline prep)
underboard memory wipe --confirm         # Confirm bulk-wipe operations (operator-only)
underboard export [path]                 # Export all data to JSON archive
underboard import <path>                 # Import archive (reconcile by git remote stable_key)
```

## Development

```bash
npm run dev          # TypeScript watch mode
npm test             # Run all tests
npm run test:unit    # Unit tests only
npm run test:integration  # Integration tests only
npm run validate     # tsc --noEmit
```

## Dashboard

Open `http://localhost:4280/` in a browser:
- Kanban board with 5 columns (backlog → done)
- Filter by project, assignee, status, text search
- Recent memory feed sidebar
- Activity log panel (when a task with logging is selected)
- Real-time updates via SSE (no page refresh needed)
- Operator can create, edit, archive, delete tasks

## Configuration

Config file: `~/.underboard/config.json` (created on first run with defaults)

```json
{
  "port": 4280,
  "db_path": "~/.underboard/data.db",
  "archive_mode": "manual",
  "archive_after_days": 30,
  "stalled_mode": "off",
  "stalled_after_hours": 24,
  "retrieval": {
    "lexical_weight": 0.4,
    "semantic_weight": 0.6,
    "default_top_k": 5,
    "default_threshold": 0.3,
    "max_results": 50
  }
}
```

## Project Detection

The service auto-detects project identity from the agent's CWD:
1. Walk up from CWD to find `.git/` directory or `.under-project` marker file
2. Canonicalize the root path
3. Hash → project ID
4. No detectable root → "global" project (everything still works)

## Data Locations

| What | Path |
|------|------|
| Database | `~/.underboard/data.db` |
| Security Token | `~/.underboard/token` |
| Embedding model | `~/.underboard/models/paraphrase-multilingual-MiniLM-L12-v2.onnx` |
| Config | `~/.underboard/config.json` |
| Logs | stdout/stderr (no log files in V1) |
