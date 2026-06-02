# Feature Specification: Agent Task Board + Shared Memory Service

**Feature Branch**: `specs/005-agents-board-and-memory`
**Created**: 2026-05-28
**Status**: Draft
**Input**: A user-level service that gives AI coding agents (Claude Code, Cursor, Codex, Gemini CLI, Hermes, etc.) a shared, persistent task board and a shared semantic memory store. Exposed as a protocol-compliant tool server (MCP) so any compliant agent can write and read. Has a visible web dashboard for the human operator. Cross-project by storage, project-scoped by default at retrieval. Local-first, no cloud dependency.

## User Scenarios & Testing

### User Story 1 — Persistent Shared Memory Across Sessions (Priority: P1)

As a developer working with one or more AI agents on a project, I want any agent to be able to record durable notes ("we decided JWT TTL = 1h", "the auth flow uses refresh tokens in Redis", "Postgres timezone is UTC") and any later agent session — in the same or a sibling project — to retrieve those notes by semantic similarity, so I do not pay the cost of re-deriving project context at every new session.

**Why this priority**: Cold-context regeneration is the single largest hidden cost across multi-session AI development. Without persistent memory, every new session spends its first 10–30 minutes re-reading files and re-learning facts the previous session already knew. Memory is the keystone capability — even without the board, memory alone delivers value.

**Independent Test**: Can be validated by: (a) starting one agent session, writing 3 facts about the current project via the memory tool, ending the session; (b) starting a fresh agent session in the same project, querying by a natural-language phrase semantically related to one of the facts, confirming the fact is returned in the top results.

**Acceptance Scenarios**:

1. **Given** the service is running and a memory entry "Auth uses JWT with 1h TTL" was written from project A, **When** any agent later calls the memory recall tool from project A with the query "how does authentication work here", **Then** the recall returns that entry in the top results with its source-agent and timestamp metadata.
2. **Given** a memory entry was written from project A, **When** an agent in project B calls the standard recall tool (default scope), **Then** the recall does NOT return entries from project A.
3. **Given** a memory entry was written from project A, **When** an agent in project B explicitly calls the cross-project recall tool, **Then** the recall returns entries from project A annotated with their source project identifier.
4. **Given** the service has accumulated 10,000 memory entries across all projects, **When** an agent calls recall, **Then** results are returned within the latency budget (see SC-004).
5. **Given** the service was shut down and restarted, **When** an agent calls recall, **Then** previously-written entries are returned (durability across restarts).
6. **Given** the embedding model has not yet been downloaded on first install, **When** the first memory write or recall is attempted, **Then** the system reports a clear "initializing model" state and either blocks the call until ready or queues it, but never silently drops the request.

---

### User Story 2 — Visible Task Board for Concurrent Agent Activity (Priority: P1)

As a developer running one or more AI agents (possibly in parallel across different projects and IDE tools), I want a single web dashboard that shows what every agent is currently working on, what is queued, and what is finished, grouped by project and by status, so I can see at a glance "is anything stuck?", "did Claude finish refactoring the auth?", "is Gemini still running the migration?".

**Why this priority**: Multi-agent workflows are opaque without an external observability surface. The human operator loses track of who is doing what within minutes of starting more than one session. The board is the operator's pane of glass — without it, parallelism delivers chaos, not throughput.

**Independent Test**: Can be validated by: (a) starting two agent sessions concurrently in two different projects; (b) having each agent create a task and update its status; (c) opening the dashboard in a browser; (d) confirming both tasks appear under their respective projects with current status, and confirming the dashboard updates without page refresh when an agent moves a task to a new status.

**Acceptance Scenarios**:

1. **Given** the service is running and the dashboard is open in a browser, **When** an agent creates a new task via the task tool, **Then** the new task appears as a card in the appropriate status column on the dashboard within the real-time latency budget (see SC-003).
2. **Given** the dashboard is open, **When** an agent moves a task from "in progress" to "done", **Then** the card transitions to the new column on the dashboard without page refresh.
3. **Given** multiple projects are present, **When** the operator opens the dashboard, **Then** the operator can filter the view to a single project, a subset of projects, or all projects.
4. **Given** multiple agents have tasks in flight, **When** the operator views the board, **Then** each card displays the source agent's identifier and the originating project's identifier.
5. **Given** the operator wants to see history, **When** the operator toggles the "include archived" view, **Then** archived (completed-and-archived) tasks become visible; by default they are hidden.
6. **Given** the dashboard is open across multiple browser tabs, **When** an event occurs, **Then** all open tabs receive the update simultaneously.

---

### User Story 3 — Explicit Cross-Project Memory Recall (Priority: P2)

As a developer reusing patterns across projects, I want an explicit, non-default way to ask "across all my projects, what have we learned about X?" — so I can pull reusable knowledge (auth setups, deployment patterns, recurring bug classes) without polluting day-to-day project-scoped recall with noise from unrelated work.

**Why this priority**: Cross-pollination is genuinely valuable but rare relative to project-scoped recall. Making it the default would drown signal in noise; making it explicit preserves both modes. Without it, the user must manually search across project databases.

**Independent Test**: Can be validated by writing memory entries from 3 different projects, then calling the explicit cross-project recall tool with a phrase relevant to entries in 2 of those projects, and confirming both projects' entries appear with provenance labels.

**Acceptance Scenarios**:

1. **Given** memory entries exist across multiple projects, **When** an agent calls the cross-project recall tool, **Then** results from any project are eligible, ranked by semantic similarity regardless of source project.
2. **Given** the cross-project tool returns results, **When** the agent receives them, **Then** each result carries an unambiguous source-project identifier.
3. **Given** an agent uses the default recall tool, **When** results are returned, **Then** they are confined to the agent's current project (no cross-contamination from the default path).

---

### User Story 4 — Agent Activity Log Stream in Dashboard (Priority: P2)

As an operator watching the board, I want to optionally see a streaming log of what the currently-active agent is doing inside a selected task ("reading file X", "ran tests, 3 failed", "calling tool Y") — so I can intervene when an agent is going down a wrong path without waiting for the task to finish.

**Why this priority**: Closes the observability gap from "I see the task moved" to "I see what the agent is actually doing right now". Highly valuable but more invasive (requires agents to opt in to streaming their activity), so secondary to the board itself.

**Independent Test**: Can be validated by an agent opting into log streaming on a task, performing several tool calls, and confirming each tool call appears in the dashboard's log panel for that task within the streaming latency budget.

**Acceptance Scenarios**:

1. **Given** an agent has opted into activity logging for a task, **When** the agent emits an activity event, **Then** the event appears in the dashboard's log panel for that task in real time.
2. **Given** an agent has NOT opted into logging, **When** the agent works on a task, **Then** no activity events are recorded for that task (silent execution is the default).
3. **Given** the operator selects a different task on the board, **When** the selection changes, **Then** the log panel switches to show that task's activity stream (live if active, historical if completed).

---

### User Story 5 — Operator-Driven Task Creation and Assignment (Priority: P3)

As an operator, I want to create a task in the dashboard ("refactor the user model") and assign it to a specific agent, so the next time that agent connects it picks up the task automatically.

**Why this priority**: Closes the loop from observability to direction. Lower priority because the agent-first flow (agent creates its own tasks) already delivers most value; operator-initiated tasks are a smaller secondary flow.

**Independent Test**: Can be validated by creating a task in the dashboard UI assigned to a specific agent name, then having an agent with that name call the "list assigned tasks" tool, and confirming the task is returned.

**Acceptance Scenarios**:

1. **Given** the operator creates a task in the dashboard with title and assignee, **When** the task is saved, **Then** it appears in the "backlog" column attributed to the assigned agent.
2. **Given** an agent identifies itself by name on connection, **When** the agent calls the "list tasks assigned to me" tool, **Then** operator-created tasks assigned to that name are returned.
3. **Given** an operator-created task exists, **When** an agent picks it up and moves it to "in progress", **Then** the dashboard reflects the change without requiring the operator's action.

---

### Edge Cases

- **No project detectable**: agent calls a tool from a directory with no Git root and no project marker. → System MUST fall back to a reserved "global / uncategorized" project bucket and proceed; never refuse the call.
- **Two agents create concurrent updates to the same task**: → Last-write-wins is the V1 policy; no merge conflict UI. Each write returns the resulting state so callers can detect overwrites if they care.
- **Embedding model fails to download or load on first run**: → System MUST degrade gracefully to lexical-only retrieval, surface a clear status flag in the service health endpoint, and retry model load on a backoff schedule.
- **SQLite database file is corrupted or disk is full**: → System MUST refuse writes with a clear error rather than silently dropping; reads of valid data must still work where possible.
- **Identical-content memory writes from different agents in the same project**: → System MUST dedup with provenance merge. Exact content match (within the same project) extends the existing entry's provenance list with `(new_agent, new_timestamp)` rather than creating a duplicate entry. The original entry's identifier is returned to the second writer.
- **Stale tasks**: an agent crashed mid-task and never wrote a status update. → Behavior depends on the configured `stalledIndicator` mode (FR-015a). Under default `off`, tasks remain `in_progress` indefinitely until manually moved. Under `visual_after_hours`, the dashboard card displays a stalled indicator after the configured inactivity window. Status is NEVER auto-transitioned by the system.
- **Memory write with sensitive content (API key, password) accidentally included**: → System does not scan content; user is responsible. Service MUST provide a "delete memory by id" tool so leaks can be expunged manually.
- **Cross-agent name collisions**: two agents both self-identify as "claude" in different projects. → System treats agent names as opaque strings; project context disambiguates. No central agent registry in V1.
- **Service is not running when an agent calls a tool**: → MCP client surfaces a connection error; agent SHOULD continue its primary work and degrade to "no board, no memory" mode rather than fail the user's task.
- **Browser tab open for many days with intermittent network**: → SSE connection MUST auto-reconnect; on reconnect, dashboard fetches a state delta to catch up, not a full re-render.
- **Archived task is referenced later**: → Archived tasks MUST remain queryable by ID and via a "show archived" toggle; archival is hiding, not deletion.
- **A new agent type (not yet seen) calls a tool**: → System MUST accept the call without prior registration; the new agent name appears in the UI on first use.

## Requirements

### Functional Requirements

**Memory subsystem**

- **FR-001**: System MUST expose a programmatic tool, conformant to the Model Context Protocol (MCP), that an AI agent can call to write a new memory entry consisting of free-form text content, optional tags, and implicit metadata (timestamp, source agent identifier, project identifier). When the content of a new write EXACTLY matches the content of an existing entry within the same project, the system MUST NOT create a duplicate; instead it MUST extend the existing entry's provenance list with the new source agent and timestamp, and return the existing entry's identifier. Provenance is therefore an ordered list of `(source_agent, timestamp)` pairs, with the first entry capturing the original write and subsequent entries capturing later identical re-assertions.
- **FR-002**: System MUST expose an MCP tool to retrieve memory entries by semantic similarity to a natural-language query.
- **FR-003**: System MUST expose a SEPARATE MCP tool for cross-project recall, distinct from the default project-scoped tool, so the choice to look across projects is always explicit.
- **FR-004**: System MUST expose an MCP tool to list recent memory entries (chronological) within the current project, for surfacing "what did we just discuss". Content longer than 500 characters MUST be truncated and returned with a truncation indicator (`truncated: true`, `full_length: N`).
- **FR-004a**: System MUST expose an MCP tool `memory_get` to retrieve a full, untruncated memory entry by its unique identifier.
- **FR-005**: System MUST expose an MCP tool to delete a specific memory entry by its identifier, scoped by default to the calling agent's currently-detected project. Any delete request from an agent MUST be rate-limited (default: max 100 deletes per 60 seconds per agent name).
- **FR-005a**: System MUST expose a separate, explicit `memory_delete_cross_project` tool that requires the caller to supply the source `project_id` and is rate-limited in the same manner.
- **FR-006**: System MUST compute semantic embeddings for all memory content locally on the user's machine, requiring no calls to any external service for embedding computation.
- **FR-007**: Default memory retrieval (the project-scoped tool) MUST return ONLY entries that belong to the agent's currently-detected project.
- **FR-008**: Cross-project recall results MUST include the source project identifier on every returned entry.
- **FR-009**: Memory retrieval MUST combine lexical (keyword) and semantic (vector) signals to handle exact-token queries (e.g., function names) as well as paraphrased queries.

**Task board subsystem**

- **FR-010**: System MUST expose MCP tools for an agent to create a task (with title, description, status, assignee), update a task's status, update a task's description or notes, and list tasks (filterable by status, assignee, project).
- **FR-011**: System MUST expose an MCP tool for an agent to retrieve tasks assigned to itself, scoped by default to the currently-detected project.
- **FR-011a**: System MUST expose a separate, explicit MCP tool `task_list_assigned_cross_project` to retrieve tasks assigned to the agent across all projects.
- **FR-012**: Each task MUST carry a stable identifier, a project identifier (auto-derived), a status, an assignee, a title, an optional description, an optional ordered list of dependency task identifiers, and timestamps for creation and last update.
- **FR-013**: Task status MUST be one of a fixed closed set: `backlog`, `in_progress`, `blocked`, `review`, `done`. The dashboard renders these as five columns. The system MUST reject status values outside this set. The `archived` flag is orthogonal to status (a task can be in any status AND archived); archived tasks are hidden from the default board view but remain queryable.
- **FR-014**: System MUST support task archival as a distinct action from deletion. Archive policy is operator-configurable with three modes: (a) `manual` — only explicit archive calls archive tasks; (b) `after_days` — `done` tasks auto-archive after a configurable number of days (default 30); (c) `done_collapse` — `done` status is treated as effectively archived (hidden from default view) and the explicit archive operation is a no-op. Mode is set in the service configuration; default mode is `manual`.
- **FR-015**: System MUST NOT permanently delete tasks via any tool exposed to agents; deletion is reserved to an explicit operator action via the dashboard or CLI.
- **FR-015a**: System MUST support a stalled-task indicator policy with two operator-configurable modes: (a) `off` — no stalled detection; (b) `visual_after_hours` — tasks in `in_progress` with no update for a configurable number of hours (default 24) display a visual "stalled" indicator on the dashboard card without changing the underlying status. Default mode is `off`. The system MUST NOT auto-transition stalled tasks to a different status under any setting.

**Project identity**

- **FR-016**: System MUST auto-derive the current project identifier from the agent's invocation context (working directory, ascended to the nearest project root marker — a Git repository root or an explicit marker file).
- **FR-017**: When no project root is detectable, System MUST fall back to a reserved "global / uncategorized" project identifier and proceed; the call MUST NOT fail.
- **FR-018**: System MUST treat the same project root path (canonicalized) as the same project across all agents and IDE tools — Claude in IDE A and Codex in IDE B in the same repo see the same project ID.

**Dashboard**

- **FR-019**: System MUST serve a web dashboard reachable over HTTP on the local machine, that displays the task board grouped by status (kanban-style columns) with cards showing title, assignee, project, and updated-at timestamp.
- **FR-020**: Dashboard MUST allow filtering by project (one, several, or all), by assignee (agent name), by status, and by free-text search over title.
- **FR-021**: Dashboard MUST display a recent-memory feed showing the most recent memory entries with content snippet, source agent, source project, and timestamp.
- **FR-022**: Dashboard MUST push state changes to the browser in real time via a server-pushed streaming mechanism (no polling required for live updates).
- **FR-023**: Dashboard MUST support a per-task activity-log panel that, when a task with active logging is selected, streams agent activity events for that task as they occur.
- **FR-024**: Dashboard MUST allow the operator to create, edit, archive, and delete tasks via the UI (operator-side affordances complement agent-side affordances).
- **FR-024a**: Dashboard MUST treat all agent-written text (titles, descriptions, notes, logs, memories) as untrusted and MUST sanitize HTML and script tags using `DOMPurify` (or strict escaping) before rendering to prevent stored Cross-Site Scripting (XSS).
- **FR-025**: Dashboard MUST auto-reconnect to the streaming endpoint after network interruption and fetch the missed-state delta on reconnect.

**Service lifecycle and access**

- **FR-026**: System MUST be runnable as a long-lived local service that an end user starts once and that survives across IDE and agent restarts.
- **FR-027**: System MUST provide a user-facing CLI to start, stop, check status, and inspect basic metrics of the service.
- **FR-028**: System MUST listen exclusively on the loopback interface (`127.0.0.1`) by default. Remote access (binding to other interfaces like `0.0.0.0`) MUST require explicit CLI opt-in.
- **FR-028a**: System MUST require a secure, cryptographically random 32-byte Bearer token for all incoming HTTP and MCP-over-SSE requests. The token MUST be generated on first-time startup, saved to `~/.underboard/token` (under POSIX 0600 file permissions, or Windows User ACL equivalent), and verified on every request.
- **FR-028b**: System MUST validate `Host` and `Origin` request headers (via CORS/allowlist middleware) to reject any requests not originating from `localhost`, `127.0.0.1`, or their exact IP/port, defanging DNS rebinding and cross-origin browser exfiltration.
- **FR-029**: System MUST persist all data (tasks, memory entries, embeddings, events) durably to local storage so that restarts do not lose data.
- **FR-030**: System MUST tolerate concurrent writes from multiple agents without data loss; concurrent updates to the same task entity resolve as last-write-wins with the resulting state returned to each caller.

**Export and portability**

- **FR-031**: System MUST provide an export mechanism that produces a single portable archive of all tasks and memory entries (without embeddings — those can be recomputed on import).
- **FR-032**: System MUST provide an import mechanism that ingests such an archive and reconciles it with existing data (project IDs preserved when paths match, new project IDs assigned otherwise).

**Operational concerns**

- **FR-033**: System MUST expose a health-status endpoint that reports: service uptime, total tasks, total memory entries, embedding-model status (ready / loading / failed), and database file path and size.
- **FR-034**: System MUST tolerate the embedding model being unavailable: memory writes are still accepted (stored without vector; flagged for backfill), and memory recall falls back to lexical-only retrieval with a clear status flag in the response.

### Key Entities

- **Project**: A stable, opaque identifier representing a single codebase or workspace, derived from the canonicalized filesystem root of a Git repository or marker file. Carries a human-readable display name, an absolute root path, a first-seen timestamp, and a last-seen timestamp. The reserved value "global / uncategorized" is a Project too.
- **Task**: A unit of work attributed to a Project. Carries an identifier, title, optional description, status, assignee (agent name string), optional dependency task IDs, free-form notes field, creation and update timestamps, and an archived flag.
- **MemoryEntry**: A free-form note attributed to a Project, with provenance from one or more source agents. Carries an identifier, content text, optional tags, an ordered provenance list of `(source_agent, timestamp)` pairs (one entry per unique write of identical content within the project), a semantic embedding (a numerical vector representation), and a creation timestamp (equal to the timestamp of the first provenance entry).
- **AgentSession**: Implicit. The system does not register agents formally; it accepts whatever name the calling agent self-reports. Project ID + agent name together disambiguate concurrent activity.
- **Event**: A state-change record (task created, task moved, memory added, activity log appended) used for real-time push to connected dashboards. Carries a type, payload, timestamp.
- **ActivityLogEntry**: When an agent opts into activity logging on a task, each significant action (tool call, decision, file read) is recorded as an ActivityLogEntry attached to that Task. Carries a task ID, agent name, timestamp, action type, free-form detail.

## Assumptions

1. **Single user, single machine, V1.** No multi-user, no multi-tenant, no cloud sync. The user runs the service on their own dev machine and is the sole human operator.
2. **Bearer token + loopback binding is the security model.** While agents on the local machine are trusted, the loopback-only binding, Host/Origin header validation, and Bearer token prevent local browser-based exfiltration and DNS rebinding attacks.
3. **Project identity is path-independent when Git is available.** Two worktrees of the same Git repo count as the same project. To support portability, project identity is derived from the Git remote URL (if available) as a stable key, falling back to absolute root path hash.
4. **Agent name is self-reported.** No registry, no enforcement of uniqueness. "claude" and "Claude" are different agent names. The system trusts what the agent declares.
5. **Embedding model is local and self-contained.** A multilingual open-weights model (`paraphrase-multilingual-MiniLM-L12-v2`) is cached and used. One-time internet access is required during first-time startup or CLI model fetching to download the ~120MB model. Subsequent execution is 100% offline-first.
6. **Memory entries are immutable once written.** The only mutation available is deletion. There is no edit operation in V1. (Rationale: simpler model; agents that want to "update" a fact write a new entry — historical record preserved.)
7. **Tasks are mutable.** Title, description, status, assignee, notes can be changed at any time. History of task mutations is NOT preserved in V1 (no audit log of task edits).
8. **Last-write-wins for concurrent task edits.** No optimistic locking, no CRDT. The simpler model is sufficient for solo-user usage.
9. **Real-time push uses a server-pushed streaming mechanism over standard HTTP.** No persistent bidirectional protocol is required in V1.
10. **The service is a separate package from the existing orchestrator.** It can run with or without the orchestrator and is independently versioned and installable.
11. **Storage is a single file on disk.** Backup is the user's responsibility. The export tool produces portable archives for migration.
12. **The embedding model has an on-disk footprint of at most a few hundred megabytes.** `paraphrase-multilingual-MiniLM-L12-v2` is ~120MB on disk and uses ~250-400MB RAM, running comfortably on commodity CPU-only laptop hardware under the 512MB RAM budget.
13. **The default port is fixed by convention** and overridable via config or CLI flag. Port-conflict handling is "fail loud on bind error with a clear message".
14. **The web dashboard is a static, client-rendered application** served by the same service process — no separate frontend server.
15. **The MCP protocol version targeted is the version current at the time of release**, and the service will accept clients on that version and one prior minor version where possible.
16. **Default memory recall result count is 5, default similarity threshold is 0.3** (both per-call overridable via tool arguments). The cap on a single recall call is 50 results.
17. **Memory entry content soft-warns at 64 KB and hard-rejects at 1 MB.** Soft warn is a non-fatal response flag; hard reject returns an error before any storage operation.
18. **Project marker file is `.under-project`** (a sentinel file in the project root used when no `.git` directory is present). The file may be empty; its presence alone is sufficient to mark the directory as a project root.
19. **Service auto-start at user login is OUT OF SCOPE for V1.** The user manually starts the service via the CLI. Installation as a system / user service (systemd unit, Windows service, launchd agent) is deferred to a later version.
20. **Task dependencies are advisory in V1.** The dashboard MAY display dependency relationships (e.g., showing "blocked by task X"), but the system does NOT enforce status transitions based on dependencies. An agent may move a dependent task to `in_progress` even if its prerequisite is not `done`.
21. **Task status transitions carry advisory semantics.** Agents use `blocked` to represent external dependencies (waiting on another task or human response), and `review` to request human verification before completion.
22. **Provenance lists are capped to prevent token-cost explosion.** We cap provenance at 20 entries (preserving the first 5 original and last 10 recent assertions, incrementing a `truncated_count` for the discarded middle). This is an intentional V1 design trade-off.
23. **Cross-platform Bearer-token file permissions are robust.** On Unix, `~/.underboard/token` uses strict `0600` permissions. On Windows, permissions fall back to standard User ACL permissions (user-only read/write) without throwing errors.

## Clarifications

### Session 2026-05-28

Resolved via interactive clarify session:

- **C-1 (Task auto-archive policy)** — RESOLVED: configurable with three modes — `manual` (default), `after_days` (default N=30), and `done_collapse`. Captured in FR-014.
- **C-2 (Memory deduplication on identical content)** — RESOLVED: dedup with provenance merge. Exact content match within the same project extends the existing entry's provenance list with `(new_agent, new_timestamp)`. Captured in FR-001 and the MemoryEntry entity.
- **C-3 (Stalled-task detection)** — RESOLVED: configurable with two modes — `off` (default) and `visual_after_hours` (default N=24). System NEVER auto-transitions status. Option to auto-move to `blocked` was rejected. Captured in FR-015a.
- **C-4 (Task status set)** — RESOLVED: closed set of five — `backlog`, `in_progress`, `blocked`, `review`, `done`. The `archived` flag is orthogonal. Captured in FR-013.
- **C-5 (Memory recall defaults)** — RESOLVED via Assumption 16: default top-K = 5, default similarity threshold = 0.3, max per call = 50, both overridable per call.

Items folded into Assumptions section (no interactive question needed):

- Memory entry size limits → Assumption 17
- Project marker file convention → Assumption 18
- Service auto-start at login → Assumption 19 (deferred)
- Task dependencies enforcement → Assumption 20 (advisory only)

## Success Criteria

### Measurable Outcomes

- **SC-001**: An agent in project A can write a memory entry, end its session, a new agent session in project A can start, and the new session can retrieve the entry via natural-language semantic query — in over 95% of typical-phrasing trials, the entry appears in the top 5 results.
- **SC-002**: An agent in project B calling the default (project-scoped) recall tool receives ZERO results that originated in project A — measurable as 100% scope isolation in default-path queries.
- **SC-003**: A dashboard tab open in a browser shows a task status change within 500 milliseconds of the change being committed by the writing agent, measured at the 95th percentile under typical load.
- **SC-004**: A memory recall query against a store of 10,000 entries returns ranked results within 500 milliseconds at the 95th percentile on commodity laptop hardware (no GPU).
- **SC-005**: A memory write call returns acknowledgement (entry persisted and retrievable) within 1 second at the 95th percentile on commodity laptop hardware.
- **SC-006**: Project auto-detection succeeds (returns a non-fallback project identifier) for any working directory inside a Git working tree.
- **SC-007**: Service idle resident memory stays under 512 megabytes including the loaded embedding model; under 64 megabytes when the embedding model is unloaded.
- **SC-008**: The operator can identify "what is each currently-running agent doing" by opening the dashboard URL and visually scanning the in-progress column — measurable as: the operator completes this scan in under 5 seconds in user testing.
- **SC-009**: Service uptime remains continuous across at least 7 days of typical use on a developer machine, with zero crashes attributable to the service itself (excluding OS reboots and intentional shutdowns).
- **SC-010**: Export-then-import on a populated database produces an end-state in which 100% of tasks and memory entries are preserved (content, project assignment, source-agent attribution) and semantic recall on the imported data returns equivalent results to the original.
- **SC-011**: Dashboard auto-reconnect after a 30-second network interruption restores live updates within 5 seconds of network restoration, and the catch-up delta accounts for all events missed during the gap.
- **SC-012**: The system accepts memory writes and recalls without external network access (offline-first verification): with the machine disconnected from the internet after first install, all memory operations continue to work.
