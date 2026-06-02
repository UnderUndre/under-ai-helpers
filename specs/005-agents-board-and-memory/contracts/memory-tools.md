# MCP Tool Contracts: Memory Subsystem

**Feature**: 005-agents-board-and-memory | **Date**: 2026-05-28

## Common Parameters & Authentication

**Authentication**:
All incoming HTTP and SSE connection requests MUST carry a cryptographically secure Bearer token in the `Authorization` header:
```http
Authorization: Bearer <32_byte_random_token>
```
If the token is invalid, the server responds with a `401 Unauthorized` status.

**Common Context**:
After successful authentication, all tools receive an implicit `__context` object from the MCP server middleware:
```typescript
interface ToolContext {
  project_id: string;     // Derived path-independently using stable_key, falling back to CWD hash
  agent_name: string;     // Self-reported by MCP client
  cwd: string;            // Current working directory
}
```

**Client Context Injection**:
Clients MUST pass working directory and self-reported name:
- Via standard MCP `initialize` inside `clientInfo.cwd` and `clientInfo.name` (custom fields).
- Or via custom HTTP headers `X-Agent-CWD` and `X-Agent-Name` on connection to `/mcp/sse`.
If both are missing, the server defaults CWD to its own execution directory and name to `"unknown"`, and logs an error to `/health`.

## Tools

### `memory_write`

Write a new memory entry. Deduplicates on exact content match within project.

**Input**:
```typescript
{
  content: string;        // Required. Max 1MB hard limit, warn at 64KB
  tags?: string[];        // Optional. Free-form labels
}
```

**Output**:
```typescript
{
  id: string;             // UUIDv7 of the entry (existing if dedup)
  created: boolean;       // false if dedup merged into existing
  provenance: Array<{
    agent: string;
    ts: string;           // ISO 8601 UTC
  }>;
}
```

**Errors**:
- `CONTENT_TOO_LARGE` — content exceeds 1MB
- `WRITE_FAILED` — SQLite write error (disk full, corrupted DB)

**Side effects**: Inserts into `memory_entries`, `memory_fts`. Queues embedding computation. Emits `memory_added` event.

---

### `memory_recall`

Retrieve memory entries by semantic + lexical similarity, scoped to current project.

**Input**:
```typescript
{
  query: string;          // Required. Natural language or keyword
  top_k?: number;         // Default: 5, max: 50
  threshold?: number;     // Default: 0.3, range: [0, 1]
}
```

**Output**:
```typescript
{
  results: Array<{
    id: string;
    content: string;
    tags: string[] | null;
    provenance: Array<{ agent: string; ts: string }>;
    score: number;        // Combined 0-1
    similarity: number;   // Semantic cosine 0-1
    created_at: string;
  }>;
  embedding_status: "ready" | "lexical_only";
}
```

**Notes**:
- Hybrid scoring: `score = 0.4 * lexical_bm25_normalized + 0.6 * semantic_cosine`
- If embedding model unavailable, returns `embedding_status: "lexical_only"` with lexical-only results
- `similarity` is the raw cosine score before fusion

---

### `memory_recall_cross_project`

Retrieve memory entries across all projects.

**Input**:
```typescript
{
  query: string;          // Required
  top_k?: number;         // Default: 5, max: 50
  threshold?: number;     // Default: 0.3
}
```

**Output**:
```typescript
{
  results: Array<{
    id: string;
    content: string;
    tags: string[] | null;
    provenance: Array<{ agent: string; ts: string }>;
    project_id: string;   // Source project identifier
    project_name: string; // Human-readable project name
    score: number;
    similarity: number;
    created_at: string;
  }>;
  embedding_status: "ready" | "lexical_only";
}
```

**Notes**: Same scoring as `memory_recall` but without project filter. Every result includes source project metadata.

---

### `memory_list_recent`

List recent memory entries chronologically within current project.

**Input**:
```typescript
{
  limit?: number;         // Default: 20, max: 100
}
```

**Output**:
```typescript
{
  entries: Array<{
    id: string;
    content: string;      // Truncated to 500 chars with "..." suffix if longer
    truncated: boolean;   // true if content exceeds 500 chars
    full_length: number;  // total character length of the original content
    tags: string[] | null;
    provenance: Array<{ agent: string; ts: string }>;
    created_at: string;
  }>;
}
```

---

### `memory_get`

Retrieve a full, untruncated memory entry by its unique identifier.

**Input**:
```typescript
{
  id: string;             // Required. UUIDv7 of the entry
}
```

**Output**:
```typescript
{
  id: string;
  content: string;        // Full, untruncated content text
  tags: string[] | null;
  provenance: Array<{ agent: string; ts: string }>;
  created_at: string;
}
```

**Errors**:
- `ENTRY_NOT_FOUND` — ID does not exist

---

### `memory_delete`

Delete a memory entry by ID, scoped by default to the calling agent's current project.

**Input**:
```typescript
{
  id: string;             // Required. UUIDv7 of the entry
}
```

**Output**:
```typescript
{
  deleted: boolean;       // false if entry not found or scoped to another project
  id: string;
}
```

**Side effects**: Deletes from `memory_entries`, `memory_fts`, `memory_vectors`. Emits `memory_deleted` event.

**Rate Limiting & Scope**: Rate-limited to a maximum of 100 delete calls per 60 seconds per `agent_name`. If exceeded, returns `RATE_LIMIT_EXCEEDED` error. Deletion is strictly scoped to the calling agent's `project_id` context. If the entry belongs to a different project, returns `NOT_AUTHORIZED`.

---

### `memory_delete_cross_project`

Delete a memory entry by ID across projects. Explicitly requires the target `project_id`.

**Input**:
```typescript
{
  id: string;             // Required. UUIDv7 of the entry
  project_id: string;     // Required. Target project identifier
}
```

**Output**:
```typescript
{
  deleted: boolean;
  id: string;
}
```

**Rate Limiting & Safety**: Rate-limited to max 100 deletes per 60 seconds per `agent_name`. If a call attempts to delete >10 items in a single session, the server blocks bulk delete, returning `BULK_DELETE_BLOCKED`, advising the operator to use the CLI: `underboard memory wipe --confirm`.

---

## Security & Data Integrity

1. **Origin & Host Header Validation**: HTTP server middleware MUST reject all requests whose `Origin` header (when present) is not `http://localhost:<port>` or `http://127.0.0.1:<port>`, and whose `Host` header is not `localhost:<port>` or `127.0.0.1:<port>`, blocking DNS rebinding and cross-origin browser exfiltration.
2. **Dashboard XSS Sanitization**: The web dashboard MUST sanitize all rendered agent-written content using `DOMPurify` before writing to the DOM, protecting the operator from malicious stored script executions.
