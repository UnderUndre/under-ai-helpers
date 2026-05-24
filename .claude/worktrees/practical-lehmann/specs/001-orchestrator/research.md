# Research: Multi-Model AI Orchestrator

**Date**: 2026-04-02 | **Status**: Complete

---

## R1. CLI Tool Headless Modes

### Decision: Use `-p`/`--print` flags for non-interactive execution

**Claude Code** (verified from `claude --help`):
- `claude -p "prompt"` — headless mode, prints response and exits
- `--dangerously-skip-permissions` — bypasses all permission checks (for sandboxed automation)
- `--permission-mode auto` — safer alternative, auto-approves tools
- `--output-format json|stream-json|text` — structured output (only with `--print`)
- `--input-format text|stream-json` — structured input (only with `--print`)
- Stdin piping: `echo "task" | claude -p`
- `--system-prompt` / `--append-system-prompt` — inject system context
- `--allowedTools "Bash(git:*) Edit"` — restrict available tools
- `--model sonnet|opus` — model override
- `--max-budget-usd` — cost cap per invocation
- `--no-session-persistence` — don't save session to disk

**Canonical invocation for orchestrator:**
```bash
claude -p --permission-mode bypassPermissions --output-format stream-json --append-system-prompt "$(cat ORCHESTRATOR_INSTRUCTIONS.md)" "Implement T003: Create User model in src/models/user.ts"
```

**Gemini CLI** (from training knowledge, needs live verification):
- `gemini -p "prompt"` — non-interactive execution
- `-y, --yes` — auto-approve tool use
- `-m, --model` — model selection
- Stdin piping: `echo "task" | gemini`

**GitHub Copilot CLI** (verified 2026-04-02, GA since March 2026):
- `copilot -p "prompt"` — non-interactive, processes single prompt and exits
- `--yolo` — auto-approves all tool permissions for the session
- `--output-format json` — JSONL output for programmatic integrations
- `--available-tools`, `--excluded-tools` — granular tool filtering with glob patterns
- `--autopilot` — continues executing without approval prompts
- Install: `npm install -g @github/copilot`
- Requires: GitHub Copilot subscription (Pro+)
- Source: https://github.com/github/copilot-cli

**Canonical invocation:**
```bash
copilot -p --yolo --output-format json "Implement T003: Create User model in src/models/user.ts"
```

**OpenCode** (verified 2026-04-02):
- `opencode run "prompt"` — non-interactive, exits after completion
- `--model ollama/qwen3` — model selection in `provider/model` format
- `--format json` — structured JSON event output
- `--attach http://localhost:4096` — attach to running server (avoids cold boot)
- Supports 75+ providers: Ollama (local), OpenRouter, GitHub Copilot, ChatGPT Plus
- Install: Go binary from https://opencode.ai
- Source: https://github.com/opencode-ai/opencode

**Canonical invocation (local Ollama):**
```bash
opencode run --model ollama/deepseek-coder-v2 --format json "Implement T003: Create User model in src/models/user.ts"
```

**Tools evaluated but not included:**
- **Aider** (`aider -m "task" --yes`) — most mature, best LLM compatibility, but NO structured JSON output. Plain text only → unreliable parsing for orchestrator.
- **Cline CLI 2.0** (`cline -y --json "task"`) — good JSON support, but Ollama only via API-compat layer, less direct than OpenCode.

**Rationale**: All five CLI tools (Claude, Gemini, Copilot, OpenCode, Qwen) support headless mode natively. No need for PTY emulation.

**Alternatives considered**:
- node-pty for interactive driving → unnecessary complexity, native build dependency
- OpenAI API proxy → strips tool-use capabilities, the whole reason we chose CLI tools
- Aider → no JSON output, parsing unreliable for automation

---

## R2. Process Spawning Strategy

### Decision: Use `execa` v9 (not node-pty)

Since both CLI tools support `--print` headless mode with JSON output, we do NOT need pseudo-terminal emulation.

| Approach | Pros | Cons |
|----------|------|------|
| **`execa` v9** ✅ | No native deps, great TypeScript API, built-in timeout, graceful kill | No PTY features |
| `node-pty` | Full PTY emulation, captures colors | Native build dependency (node-gyp), Windows pain |
| Raw `child_process.spawn` | Zero deps | Poor DX, manual error handling |

**Rationale**: `execa` v9 provides:
- Built-in timeout with `forceKillAfterDelay`
- Typed stdout/stderr streaming
- Process group kill support
- No native compilation needed
- Works identically on Windows/Linux/macOS

**Impact on spec**: NFR-001 should be updated — `node-pty` is no longer required. `strip-ansi` is still needed as safety filter for any ANSI leaks in output.

---

## R3. SQLite Library

### Decision: `better-sqlite3` (raw, no ORM)

| Library | Sync/Async | Type Safety | Complexity | Best For |
|---------|-----------|-------------|------------|----------|
| **`better-sqlite3`** ✅ | Synchronous | Manual + `@types` | Minimal | CLI tools, simple schemas |
| `drizzle-orm` + driver | Sync | Excellent | Medium | Growing schemas, migrations |
| `@libsql/client` | Async | Manual | Medium | Cloud sync (Turso) |

**Rationale**:
- Synchronous API is ideal for CLI tools (no async overhead in a sequential pipeline)
- Our schema is 6 tables (Run, Stage, Task, Tool, ToolMetrics, Contract) — simple enough for raw SQL
- Type safety via hand-written TypeScript interfaces matching schema.sql
- If schema grows past ~10 tables, migrate to Drizzle

---

## R4. MCP Server SDK

### Decision: `@modelcontextprotocol/sdk` (official)

**Pattern:**
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "orch", version: "1.0.0" });

server.tool("orch_run", { description: z.string() }, async ({ description }) => {
  // trigger pipeline
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Transports:**
- `StdioServerTransport` — standard for local MCP servers (Claude Code integration)
- `SSEServerTransport` — HTTP SSE for remote access

**MCP tools to expose:**
- `orch.run` — start a new orchestration run
- `orch.status` — get run status
- `orch.dispatch_task` — dispatch single task to specific tool
- `orch.merge` — trigger merge + validation
- `orch.tools_list` — list registered tools + health
- `orch.cleanup` — purge orphan worktrees

---

## R5. ANSI Stripping & Process Tree Kill

### Decision: `strip-ansi` v7 + `tree-kill`

**ANSI stripping:**
- `strip-ansi` v7+ (ESM-only) — de facto standard, ~8M weekly downloads
- Project will use `"type": "module"` in package.json → ESM compatible
- Alternative if CJS needed: pin `strip-ansi@6.0.1`

**Process tree kill:**
- `tree-kill` — cross-platform, kills PID and all descendants
- On Windows: uses `taskkill /pid X /T /F`
- On Unix: walks `/proc` or uses `pgrep`
- Signature: `kill(pid, signal?, callback?)`

**Why tree-kill over execa's built-in kill:**
- `execa` kills the direct child but may miss grandchildren (CLI tools spawn subprocesses: git, npm, tsc)
- `tree-kill` guarantees the entire process tree is terminated
- Use both: `execa` for normal lifecycle, `tree-kill` as nuclear option on timeout/abort

---

## R6. HTTP Server for Web UI API

### Decision: Hono

| Framework | Size | TypeScript | SSE Support | Rationale |
|-----------|------|-----------|-------------|-----------|
| **Hono** ✅ | ~14KB | Native | Built-in `streamSSE` | Ultralight, runs on Node/Bun/Edge, typed routes |
| Express | ~500KB | Via `@types` | Manual | Heavy, legacy patterns |
| Fastify | ~200KB | Plugin | Via plugin | Good but heavier than needed |

**Rationale**: Hono is the lightest TypeScript-native HTTP framework with built-in SSE streaming. Perfect for a CLI tool that optionally serves a web dashboard.

---

## R7. CLI Framework

### Decision: Commander.js

| Framework | TypeScript | Subcommands | Rationale |
|-----------|-----------|-------------|-----------|
| **Commander** ✅ | Good | Yes | Most popular, battle-tested, clean subcommand API |
| yargs | Good | Yes | Verbose config, complex API |
| citty / unbuild | Decent | Yes | Newer, less ecosystem |

**Commands structure:**
```
orch run "<description>" [--dry-run] [--tools <list>]
orch status [<run-id>]
orch tools list
orch tools test <name>
orch config set <key> <value>
orch config get <key>
orch cleanup [--force]
orch stats [--tool <name>]
orch mcp-serve [--port <port>]
```

---

## R8. Config Format

### Decision: YAML (`orch.config.yaml`)

```yaml
# orch.config.yaml
version: 1

defaults:
  maxRetries: 3
  timeouts:
    implementation: 300  # seconds
    review: 120
  buildCommand: "npm run build"
  validateCommand: "npx tsc --noEmit"

pipeline:
  specify: claude
  review-spec: gemini
  plan: claude
  review-plan: gemini
  contracts: claude
  tasks: claude
  review-tasks: gemini

ensemble:
  "[BE]": claude
  "[FE]": gemini
  "[DB]": claude
  "[OPS]": gemini
  "[E2E]": claude
  "[SEC]": claude

tools:
  claude:
    command: claude
    headlessFlags: ["-p", "--permission-mode", "bypassPermissions", "--output-format", "stream-json"]
    strengths: [backend, review, spec, security]
    priority: 1
    provider: anthropic
    enabled: true

  gemini:
    command: gemini
    headlessFlags: ["-p", "-y"]
    strengths: [frontend, review, spec]
    priority: 2
    provider: google
    enabled: true

  copilot:
    command: copilot
    headlessFlags: ["-p", "--yolo", "--output-format", "json"]
    strengths: [backend, frontend, review]
    priority: 3
    provider: github
    enabled: true

  opencode:
    command: opencode
    headlessFlags: ["run", "--format", "json"]
    strengths: [backend, database, devops]
    priority: 4
    provider: local
    enabled: false
    # Use with Ollama: add --model ollama/qwen3 or ollama/deepseek-coder-v2

  qwen:
    command: qwen-code
    headlessFlags: ["--non-interactive"]
    strengths: [backend, database]
    priority: 5
    provider: alibaba
    enabled: false
```

**Rationale**: YAML is more readable than JSON for config files with nested structures. Zod schema validates at load time.

**Tool count**: 5 tools (claude, gemini, copilot, opencode, qwen). Three proprietary (Anthropic, Google, GitHub), one open-source gateway (OpenCode → any Ollama model), one dedicated (Qwen/Alibaba).
