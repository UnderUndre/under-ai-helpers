# MCP Tool Contracts: Task Board Subsystem

**Feature**: 005-agents-board-and-memory | **Date**: 2026-05-28

## Tools

### `task_create`

Create a new task on the board.

**Input**:
```typescript
{
  title: string;              // Required
  description?: string;       // Optional
  status?: string;            // Default: "backlog". Must be in closed set.
  assignee?: string;          // Optional agent name
  dependencies?: string[];    // Optional array of task IDs
}
```

**Output**:
```typescript
{
  id: string;                 // UUIDv7
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  assignee: string | null;
  dependency_ids: string[];
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  warnings?: string[];        // Non-fatal validation notes, e.g. dependency IDs that don't resolve
}
```

**Validation**:
- `title` must be non-empty, max 1000 chars
- `status` must be in `['backlog', 'in_progress', 'blocked', 'review', 'done']`
- `dependencies` must reference existing task IDs (warning, not error, if not found)

**Side effects**: Emits `task_created` event.

---

### `task_update`

Update an existing task's mutable fields.

**Input**:
```typescript
{
  id: string;                 // Required
  title?: string;
  description?: string;
  status?: string;            // Must be in closed set
  assignee?: string;          // null to clear
  notes?: string;             // Replaces entirely (last-write-wins)
  if_match?: {
    updated_at: string;       // Optional. Compare-and-Swap (CAS) to prevent silent overwrites.
  };
}
```

**Output**:
```typescript
{
  // Same shape as task_create output
}
```

**Errors**:
- `TASK_NOT_FOUND` — ID doesn't exist
- `INVALID_STATUS` — status not in closed set
- `CONCURRENCY_CONFLICT` — the task's `updated_at` does not match the provided `if_match.updated_at` (returns current state so the caller can re-evaluate).

**Side effects**: Updates `updated_at`. Emits `task_updated` event with changed fields.

---

### `task_list`

List tasks with optional filters.

**Input**:
```typescript
{
  status?: string | string[];     // Single or multiple statuses
  assignee?: string;              // Filter by agent name
  project_id?: string;            // Override project scope (default: auto-detected)
  search?: string;                // Free-text search over task title (case-insensitive LIKE)
  archived?: boolean;             // Default: false (exclude archived)
  limit?: number;                 // Default: 50, max: 200
  offset?: number;                // Pagination offset
}
```

**Output**:
```typescript
{
  tasks: Array<{
    // Same shape as task_create output
  }>;
  total: number;                  // Total matching (before limit/offset)
}
```

---

### `task_list_assigned`

List tasks assigned to the calling agent within the currently-detected project scope.

**Input**:
```typescript
{
  status?: string | string[];     // Optional status filter
  include_archived?: boolean;     // Default: false
}
```

**Output**:
```typescript
{
  tasks: Array<{
    // Same shape as task_create output
  }>;
}
```

**Notes**: Uses `agent_name` and `project_id` from tool context to filter. Project-scoped by default.

---

### `task_list_assigned_cross_project`

List tasks assigned to the calling agent across all projects.

**Input**:
```typescript
{
  status?: string | string[];     // Optional status filter
  include_archived?: boolean;     // Default: false
}
```

**Output**:
```typescript
{
  tasks: Array<{
    // Same shape as task_create output
  }>;
}
```

**Notes**: Uses `agent_name` from tool context to filter across all project scopes.

---

### `task_archive`

Archive a task (hide from default board view without deletion).

**Input**:
```typescript
{
  id: string;                     // Required
}
```

**Output**:
```typescript
{
  // Same shape as task_create output, archived: true
}
```

**Side effects**: Sets `archived = true`, updates `updated_at`. Emits `task_archived` event.

---

### `activity_log_start`

Opt into activity logging for a task. Agent must call this before emitting activity events.

**Input**:
```typescript
{
  task_id: string;                // Required
}
```

**Output**:
```typescript
{
  logging: boolean;               // Always true on success
  task_id: string;
}
```

---

### `activity_log_emit`

Record an activity event for a task with active logging.

**Input**:
```typescript
{
  task_id: string;                // Required
  action_type: string;            // e.g., "tool_call", "file_read", "test_run", "decision"
  detail: string;                 // Free-form description
}
```

**Output**:
```typescript
{
  logged: boolean;                // Always true on success
  id: string;                     // Activity log entry ID
}
```

**Side effects**: Emits `activity_logged` event for SSE push to dashboard.

---

### `activity_log_get`

Retrieve activity log entries for a task.

**Input**:
```typescript
{
  task_id: string;                // Required
  limit?: number;                 // Default: 50
  offset?: number;                // Pagination
}
```

**Output**:
```typescript
{
  entries: Array<{
    id: string;
    task_id: string;
    agent_name: string;
    action_type: string;
    detail: string | null;
    timestamp: string;
  }>;
}
```

## Status Transition Rules

No enforced transitions in V1. Any status can be set to any other valid status. Advisory dependency display only (FR-020 from spec). The closed set is:

| Status | Display Column |
|--------|---------------|
| `backlog` | Backlog |
| `in_progress` | In Progress |
| `blocked` | Blocked |
| `review` | Review |
| `done` | Done |

### Status Semantics & Conventions

To prevent inconsistent usage across different agents, the following conventions are advised:
- `backlog`: Task is defined and queued but no work has started.
- `in_progress`: The agent is actively executing tasks related to this issue.
- `blocked`: Work is halted due to external factors (e.g., waiting on another task or human approval, rate limits, or waiting on operator/human input).
- `review`: Code has been written or action completed; the agent is waiting on human verification/approval before finishing.
- `done`: All requirements are satisfied, tests pass, and the operator has approved the result.

`archived` is orthogonal — a task in any status can be archived. Archived tasks hidden from default views but queryable.

## Event Types

| Event Type | Payload Fields | Triggered By |
|------------|---------------|--------------|
| `task_created` | `{ id, project_id, title, status, assignee }` | `task_create` |
| `task_updated` | `{ id, changes: {...}, status }` | `task_update` |
| `task_archived` | `{ id, project_id }` | `task_archive` |
| `memory_added` | `{ id, project_id, content_snippet }` | `memory_write` |
| `memory_deleted` | `{ id, project_id }` | `memory_delete` |
| `activity_logged` | `{ task_id, agent_name, action_type }` | `activity_log_emit` |
