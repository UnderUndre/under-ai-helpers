# Data Model: Multi-Model AI Orchestrator

**Storage**: SQLite (better-sqlite3, synchronous)
**Location**: `~/.orch/orch.db` (user-level, not project-level)

---

## Entity Relationship

```mermaid
erDiagram
    Run ||--o{ Stage : "has"
    Run ||--o{ Task : "has"
    Run ||--o| Contract : "generates"
    Tool ||--o{ Stage : "executes"
    Tool ||--o{ Task : "executes"
    Tool ||--o{ ToolMetrics : "tracks"

    Run {
        text id PK "UUID"
        text description "Input from operator"
        text status "pending|pipeline|contracts|ensemble|merging|validating|completed|failed"
        text configSnapshot "JSON: tool assignments at start"
        text projectDir "Absolute path to project"
        text resultBranch "Git branch with merged result"
        text createdAt "ISO 8601"
        text completedAt "ISO 8601 nullable"
        text error "Error message nullable"
    }

    Stage {
        text id PK "UUID"
        text runId FK "References Run"
        text type "specify|review-spec|plan|review-plan|contracts|tasks|review-tasks|implement|validate"
        text toolName FK "References Tool"
        text status "pending|running|approved|rejected|failed"
        text prompt "Input prompt text"
        text outputPath "Path to generated artifact"
        integer attempt "Retry count, starts at 1"
        integer processId "OS PID of spawned CLI tool"
        integer durationMs "Wall-clock execution time"
        text startedAt "ISO 8601"
        text completedAt "ISO 8601 nullable"
        text error "Error/rejection feedback nullable"
    }

    Task {
        text id PK "e.g. T001"
        text runId FK "References Run"
        text agentTag "[BE]|[FE]|[DB]|[OPS]|[E2E]|[SEC]|[SETUP]"
        text storyLabel "nullable, e.g. [US1]"
        text description "Task description with file paths"
        text toolName FK "Assigned CLI tool"
        text status "pending|running|completed|failed|blocked"
        text worktreePath "Absolute path to git worktree"
        integer processId "OS PID of spawned CLI tool"
        integer lane "Parallel lane number"
        text blockedBy "Comma-separated task IDs nullable"
        integer durationMs "Wall-clock execution time"
        text startedAt "ISO 8601 nullable"
        text completedAt "ISO 8601 nullable"
        text error "Error message nullable"
    }

    Tool {
        text name PK "e.g. claude, gemini"
        text command "Shell command to spawn"
        text headlessFlags "JSON array of flags"
        text strengths "JSON array of tags"
        integer priority "Lower = preferred"
        text provider "anthropic|google|alibaba|github"
        integer enabled "0 or 1"
        text healthCheckPrompt "Prompt for health check"
    }

    ToolMetrics {
        integer id PK "Auto-increment"
        text toolName FK "References Tool"
        text stageType "Stage type this metric is for"
        real avgDurationMs "Average execution time"
        real successRate "0.0 to 1.0"
        integer totalRuns "Number of runs sampled"
        text lastUpdated "ISO 8601"
    }

    Contract {
        text id PK "UUID"
        text runId FK "References Run"
        text format "typescript|openapi"
        text filePath "Path to contract file"
        text generatedBy "Tool name that generated it"
        text lockedAt "ISO 8601 — immutable after this"
    }

    Worktree {
        text id PK "UUID"
        text runId FK "References Run"
        text taskId FK "References Task nullable"
        text path "Absolute path on disk"
        text branch "Git branch name"
        text status "active|completed|failed|abandoned"
        text createdAt "ISO 8601"
        text removedAt "ISO 8601 nullable"
    }
```

---

## SQLite DDL

```sql
-- schema.sql

CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','pipeline','contracts','ensemble','merging','validating','completed','failed')),
    config_snapshot TEXT, -- JSON
    project_dir TEXT NOT NULL,
    result_branch TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    completed_at TEXT,
    error TEXT
);

CREATE TABLE IF NOT EXISTS stages (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    type TEXT NOT NULL
        CHECK (type IN ('specify','review-spec','plan','review-plan','contracts','tasks','review-tasks','implement','validate')),
    tool_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','running','approved','rejected','failed')),
    prompt TEXT,
    output_path TEXT,
    attempt INTEGER NOT NULL DEFAULT 1,
    process_id INTEGER,
    duration_ms INTEGER,
    started_at TEXT,
    completed_at TEXT,
    error TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, -- T001, T002, etc.
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    agent_tag TEXT NOT NULL
        CHECK (agent_tag IN ('[BE]','[FE]','[DB]','[OPS]','[E2E]','[SEC]','[SETUP]')),
    story_label TEXT, -- [US1], [US2], etc.
    description TEXT NOT NULL,
    tool_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','running','completed','failed','blocked')),
    worktree_path TEXT,
    process_id INTEGER,
    lane INTEGER,
    blocked_by TEXT, -- comma-separated task IDs
    duration_ms INTEGER,
    started_at TEXT,
    completed_at TEXT,
    error TEXT
);

CREATE TABLE IF NOT EXISTS tools (
    name TEXT PRIMARY KEY,
    command TEXT NOT NULL,
    headless_flags TEXT, -- JSON array
    strengths TEXT, -- JSON array
    priority INTEGER NOT NULL DEFAULT 99,
    provider TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    health_check_prompt TEXT
);

CREATE TABLE IF NOT EXISTS tool_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_name TEXT NOT NULL REFERENCES tools(name),
    stage_type TEXT NOT NULL,
    avg_duration_ms REAL,
    success_rate REAL,
    total_runs INTEGER NOT NULL DEFAULT 0,
    last_updated TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    format TEXT NOT NULL CHECK (format IN ('typescript','openapi')),
    file_path TEXT NOT NULL,
    generated_by TEXT NOT NULL,
    locked_at TEXT
);

CREATE TABLE IF NOT EXISTS worktrees (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    task_id TEXT REFERENCES tasks(id),
    path TEXT NOT NULL,
    branch TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','completed','failed','abandoned')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    removed_at TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stages_run ON stages(run_id);
CREATE INDEX IF NOT EXISTS idx_tasks_run ON tasks(run_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_worktrees_run ON worktrees(run_id);
CREATE INDEX IF NOT EXISTS idx_worktrees_status ON worktrees(status);
CREATE INDEX IF NOT EXISTS idx_tool_metrics_tool ON tool_metrics(tool_name, stage_type);
```

---

## State Machines

### Run Status Flow
```
pending → pipeline → contracts → ensemble → merging → validating → completed
                                                                  ↘ failed (at any point)
```

### Stage Status Flow
```
pending → running → approved (for review stages)
                  → rejected → running (retry, up to maxRetries)
                  → failed
```

### Task Status Flow
```
pending → running → completed
                  → failed → blocked (cascade to dependents)
```

### Worktree Status Flow
```
active → completed (merged successfully)
       → failed (task failed)
       → abandoned (process crashed, cleanup pending)
```
