# Quickstart: Multi-Model AI Orchestrator

## Prerequisites

- Node.js 22+ (LTS)
- Git
- At least ONE AI CLI tool installed:
  - `claude` (Claude Code) — `npm install -g @anthropic-ai/claude-code`
  - `gemini` (Gemini CLI) — `npm install -g @google/gemini-cli` or via Google's installer
  - `copilot` (GitHub Copilot CLI) — `npm install -g @github/copilot` (requires Copilot Pro+ subscription)
  - `opencode` (OpenCode) — Go binary from https://opencode.ai (supports Ollama local models)
  - `qwen-code` — via Alibaba's installer

## Installation

```bash
# From this repo
cd packages/orchestrator
npm install
npm link  # makes `orch` available globally
```

## First Run

### 1. Configure tools

```bash
# Copy example config
cp orch.config.example.yaml orch.config.yaml

# Edit to match your installed tools
# At minimum, enable one tool and set its command
```

### 2. Verify tools are available

```bash
orch tools list
# Should show enabled tools with ✓/✗ status

orch tools test claude
# Should show: claude ✓ (healthy, 1234ms)
```

### 3. Dry run (see the plan)

```bash
cd /path/to/your/project
orch run "Add user authentication with JWT" --dry-run
```

Expected output:
```
Pipeline Plan:
  1. specify    → claude
  2. review-spec → gemini
  3. plan       → claude
  4. review-plan → gemini
  5. contracts  → claude
  6. tasks      → claude
  7. review-tasks → gemini

Ensemble Plan (based on task agent tags):
  [BE] → claude
  [FE] → gemini
  [DB] → claude

No processes spawned (dry-run mode).
```

### 4. Real run

```bash
orch run "Add user authentication with JWT"
```

Expected flow:
```
[pipeline] [claude]  Generating spec.md...
[pipeline] [claude]  ✓ spec.md generated (45s)
[pipeline] [gemini]  Reviewing spec.md...
[pipeline] [gemini]  ✓ APPROVED (22s)
[pipeline] [claude]  Generating plan.md...
...
[contracts] [claude]  Generating API contracts...
[contracts] [claude]  ✓ contracts locked (read-only)
[ensemble]  Starting parallel implementation...
  Lane 1 [DB]  → claude (worktree-db)
  Lane 2 [BE]  → claude (worktree-be)
  Lane 3 [FE]  → gemini (worktree-fe)
[ensemble]  [DB] ✓ T003 completed (60s)
[ensemble]  [BE] ✓ T004 completed (90s)
[ensemble]  [FE] ✓ T005 completed (75s)
[merge]     Merging worktrees...
[merge]     ✓ No conflicts
[validate]  Running: npx tsc --noEmit
[validate]  ✓ Build validation passed
[complete]  Result branch: orch/run-abc123
```

### 5. Check status

```bash
orch status
# or
orch status <run-id>
```

### 6. Use from Claude Code (MCP)

```bash
# Start MCP server
orch mcp-serve

# In Claude Code settings, add:
# "mcpServers": { "orch": { "command": "orch", "args": ["mcp-serve"] } }
```

Then from Claude Code:
```
> Use the orch tool to run "Add user authentication"
```

## Verification Checklist

- [ ] `orch tools list` shows at least 1 enabled tool
- [ ] `orch tools test <name>` returns healthy
- [ ] `orch run --dry-run "test"` shows pipeline plan without spawning processes
- [ ] `orch run "simple task"` completes full pipeline + ensemble
- [ ] Result branch contains merged code from all parallel agents
- [ ] `orch status` shows completed run
- [ ] `orch cleanup` removes orphan worktrees
