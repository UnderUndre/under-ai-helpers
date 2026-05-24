# Feature Specification: Multi-Model AI Orchestrator

**Feature Branch**: `orchestrator`
**Created**: 2026-04-01
**Status**: Draft
**Input**: User description: "Multi-model AI orchestrator that spawns CLI coding tools (Claude Code, Gemini CLI, Qwen Code) through pipeline (sequential, quality-gated) and ensemble (parallel, worktree-isolated) phases"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - CLI Pipeline Orchestration (Priority: P1)

Operator submits an idea or task description via CLI. The orchestrator spawns **actual CLI tools** (Claude Code, Gemini CLI, Qwen Code, etc.) as child processes — each tool has native file editing, tool use, and git capabilities. The **pipeline** (sequential, quality-gated) phase: spec generation (Claude Code) -> spec review (Gemini CLI) -> plan generation (Qwen Code) -> plan review (Claude Code). Each step produces a speckit-compatible artifact. If a reviewer rejects an artifact, the pipeline loops back with feedback. After plan approval, the orchestrator generates **API contracts** (TypeScript interfaces) as a shared source of truth. Then dispatches **ensemble** (parallel) implementation: `[BE]` tasks → Claude Code in worktree-be, `[FE]` tasks → Gemini CLI in worktree-fe, `[DB]` tasks → Qwen Code in worktree-db — all as concurrent child processes with native file editing. Results are merged into a single branch with build validation.

**Why this priority**: This is the core product. Key architectural insight: spawning CLI tools (not calling OpenAI API) means each "model" can natively read/write files, run tests, and use git. No need for custom diff parsers or file editing protocols.

**Independent Test**: Run `orch run "Add user authentication with JWT"` from terminal. Verify that spec.md, plan.md, and tasks.md are generated sequentially by different CLI tools. Verify contracts are generated before parallel phase. Verify parallel implementation tasks execute in separate worktrees with native file editing. Verify merge + build validation passes.

**Also accessible via MCP**: From Claude Code, call `mcp__orch__run(description="Add JWT auth")` to trigger the same pipeline.

**Acceptance Scenarios**:

1. **Given** a configured tool registry with 1+ tools (recommended 3), **When** operator runs `orch run "Add JWT auth"`, **Then** the orchestrator spawns Tool A to generate spec.md, spawns Tool B to review it (first line of output: `APPROVE` or `REJECT`), and continues the pipeline until all artifacts pass quality gates.
2. **Given** approved spec.md, plan.md, and tasks.md with `[BE]`, `[FE]`, `[DB]` agent tags, **When** the ensemble phase begins, **Then** each agent-tagged task group is dispatched to its assigned tool in a separate git worktree with prompt containing file paths to contracts (read-only), all groups execute in parallel, and results are merged into a single branch with build validation.
3. **Given** a tool fails mid-task (timeout, rate limit, error), **When** the failure is detected, **Then** the orchestrator reassigns the failed task to the next available tool from the registry and logs the reassignment.
4. **Given** the pipeline spec reviewer (Tool B) rejects the spec (first output line: `REJECT`), **When** rejection feedback is returned, **Then** the orchestrator sends the original spec + rejection feedback back to the spec generator (Tool A) for revision, up to a configurable max retry count (default: 3).
5. **Given** parallel implementation produces merge conflicts, **When** the merge phase detects conflicts, **Then** the orchestrator logs conflicting files, attempts auto-resolution via a designated review tool, and if unresolvable, pauses and prompts the operator.

---

### User Story 2 - Web UI with Live Progress Dashboard (Priority: P2)

Operator opens a web UI (React) that connects to the orchestrator backend via SSE. The dashboard displays: current pipeline stage, which model is executing which task, a dependency graph visualization showing task status (pending/running/done/failed), and per-model lane progress. The operator can submit new runs, view historical runs, and inspect individual task outputs.

**Why this priority**: The CLI is sufficient for power users, but a visual dashboard dramatically improves observability. Seeing which model is doing what in real-time, especially during the parallel ensemble phase, is essential for debugging and trust. Depends on P1 backend being functional.

**Independent Test**: Start a run via CLI, open `http://localhost:3000` in browser. Verify SSE events stream in real-time showing stage transitions, model assignments, and task completion. Verify the dependency graph updates visually as tasks complete.

**Acceptance Scenarios**:

1. **Given** the orchestrator is running a pipeline, **When** the operator opens the web UI, **Then** they see a live pipeline visualization showing the current stage (spec/review/plan/tasks/implement), the model assigned to the active stage, and elapsed time.
2. **Given** the ensemble phase is active with 3 parallel model lanes, **When** tasks complete or fail, **Then** the dashboard updates within 1 second via SSE, showing per-lane progress bars, task status icons, and model names.
3. **Given** a completed run, **When** the operator clicks on a run in the history list, **Then** they see a summary: total time, per-model token usage, pass/fail status of each stage, and links to generated artifacts.
4. **Given** the dependency graph view, **When** a task transitions from pending to running, **Then** the corresponding node in the graph changes color and shows the assigned model name.

---

### User Story 3 - Adaptive Model Routing & Performance Tracking (Priority: P3)

The orchestrator tracks per-model performance metrics: response latency, token usage, success/failure rate, quality scores (based on review pass rates). Over time, the system builds a profile for each model's strengths. Operators can view a leaderboard and optionally enable adaptive routing, where the orchestrator automatically assigns models to stages based on historical performance rather than static configuration.

**Why this priority**: This is an optimization layer. The system must work with manual model assignment first (P1). Adaptive routing is a quality-of-life improvement that becomes valuable only after enough runs generate meaningful performance data.

**Independent Test**: Run 10+ orchestrations with different model assignments. Open the performance dashboard. Verify per-model metrics are recorded. Enable adaptive routing and verify the next run assigns models based on historical performance scores.

**Acceptance Scenarios**:

1. **Given** a completed orchestration run, **When** the run finishes, **Then** the system records per-model metrics: total tokens used, wall-clock time per stage, review pass/fail outcome, and stores them in a local SQLite database.
2. **Given** 5+ completed runs with metrics, **When** the operator runs `orch stats`, **Then** they see a table showing each model's average latency, token cost, success rate, and a "best for" recommendation per domain (backend, frontend, review, spec).
3. **Given** adaptive routing is enabled via `orch config set routing adaptive`, **When** a new run starts, **Then** the orchestrator assigns models to stages based on the highest historical success rate for that stage type, falling back to the default registry assignment if insufficient data exists.

---

### Edge Cases

- **Model disagreement loop**: Reviewer model rejects spec/plan repeatedly. Mitigation: max retry count (default 3), then escalate to operator with full rejection history.
- **Semantic merge conflicts**: `git merge` passes (different files), but models used different field names/types for the same entity. Mitigation: **Contract-first phase** — generate API contracts (TypeScript interfaces or OpenAPI spec) BEFORE parallel implementation. All agents receive contracts as read-only input. After merge, run `tsc --noEmit` or build validation. If validation fails → send errors + diffs to a dedicated "merge reviewer" model for inline fixes.
- **Textual merge conflicts**: Multiple models edit overlapping files. Mitigation: workspace isolation via git worktrees + automated merge attempt. On conflict → interactive resolution: show diff in Web UI, operator can edit manually and click "Continue".
- **Model timeout mid-task**: CLI tool stops responding or hangs. Mitigation: per-task timeout (configurable, default 300s for implementation, 120s for review), kill subprocess, reassign to next model in registry.
- **Dead worktrees and disk leaks**: Process crash, Ctrl+C, or antivirus block leaves orphan worktree directories. Mitigation: register worktrees in SQLite on creation, cleanup hook on process exit (`process.on('exit')`), `orch cleanup` command for manual purge, periodic GC on startup (remove worktrees older than 24h).
- **`node_modules` per worktree**: Each worktree needs dependencies to run lint/build. Mitigation: symlink `node_modules` from base repo to worktrees (or use `--shared` worktree strategy). For non-JS: language-specific dep sharing.
- **Tag hallucinations**: Model generates `[DATABASE_CONFIG]` instead of `[DB]`. Mitigation: strict whitelist validation in parser (`[SETUP]`, `[DB]`, `[BE]`, `[FE]`, `[OPS]`, `[E2E]`, `[SEC]`). Unknown tags → fallback to `[SETUP]` + warning.
- **Context deficit between parallel agents**: `[FE]` model doesn't see what `[BE]` model is writing. Mitigation: shared contracts (see semantic merge conflicts above) + read-only access to other worktrees' generated contracts.
- **Token estimation across models**: Claude/GPT/Llama have different tokenizers. Mitigation: use `tiktoken` for estimation (GPT-compatible), apply 1.2x safety multiplier. Warn at 80% of model's context window.
- **Graceful shutdown**: Operator clicks "Stop" or Ctrl+C. Mitigation: trap SIGINT/SIGTERM, kill all child CLI processes, remove worktrees (if no changes) or mark as "abandoned", update run status to `failed (aborted)` in SQLite.
- **Rate limiting from proxy**: Proxy returns 429. Mitigation: exponential backoff with jitter (initial 1s, max 60s, max retries 5), then fail task and attempt reassignment.
- **All models unavailable**: Every model in registry fails health check. Mitigation: fail fast with clear error message, do not retry indefinitely.
- **Partial ensemble completion**: 2 of 3 parallel lanes complete but 1 fails permanently. Mitigation: merge completed work, mark failed lane tasks as `[!]`, allow operator to retry or reassign.
- **Concurrent runs**: Two operators start runs simultaneously. Mitigation: run isolation via unique run IDs and separate worktree directories per run.
- **Interactive CLI hang**: Tool prompts for permission ("Allow? [Y/n]") and blocks forever. Mitigation: mandatory `headlessFlags` in tool registry (e.g., `claude -p`, `gemini -p -y`), watchdog timer that kills process if no stdout for 60s.
- **ANSI garbage in SSE stream**: CLI output full of escape codes, spinners, redraws. Mitigation: `strip-ansi` filter on all stdout before forwarding. Parse only semantic blocks (tool calls, file writes, errors) for structured SSE events.
- **Agent escapes scope**: CLI tool in `worktree-be` reads/modifies frontend files. Mitigation: scope-restriction prompt file in worktree root + contract files set to read-only permissions. Post-task validation: diff worktree and flag changes outside allowed directories.
- **Provider concurrency limits**: 5 parallel Claude Code instances hit Anthropic's 2-5 concurrent request limit. Mitigation: detect internal rate limit errors in stderr, queue affected tasks for retry, spread parallel lanes across different providers when possible.

## Clarifications

### Session 2026-04-02

- Q: How does the orchestrator pass context to CLI tools at each pipeline step? → A: Short prompt with file paths — tool reads files itself (e.g., `"Review spec.md at ./specs/001/spec.md. Output APPROVE or REJECT with feedback."`)
- Q: Canonical terminology: "model" vs "tool"? → A: "tool" for CLI tool (claude, gemini, qwen-code), "model" only when referring to the LLM inside the tool
- Q: Spawning strategy — confirm execa v9 over node-pty? → A: Confirmed. execa v9 primary, node-pty removed from spec. No native dependencies.
- Q: Minimum number of tools for MVP? → A: Minimum 1 tool to run. Recommended 3: Claude Code + Gemini CLI + Qwen Code. GitHub Copilot CLI = optional/experimental.
- Q: Review output protocol for APPROVE/REJECT parsing? → A: First line of output must be `APPROVE` or `REJECT`. Remaining lines = feedback. Parser reads `line[0]`.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Architecture: CLI Tools as Workers (not OpenAI proxy)

Instead of calling models via OpenAI-compatible API (which strips tool-use and file-editing capabilities), the orchestrator spawns **actual CLI tools** as child processes. Each CLI tool (Claude Code, Gemini CLI, Qwen Code, GitHub Copilot CLI) has native ability to read/write files, run commands, and use git — solving the "how do they edit code" problem entirely.

- **FR-001**: System MUST accept a natural language task description via CLI command (`orch run "<description>"`) and execute the full speckit pipeline (specify -> clarify -> plan -> tasks -> implement).
- **FR-002**: System MUST maintain a **tool registry** configuration file (`orch.config.yaml`) that defines available CLI tools with: `name`, `command` (e.g., `claude`, `gemini`, `qwen-code`, `gh copilot`), `headlessFlags` (e.g., `--dangerously-skip-permissions`, `--print`, `--yes` — flags to disable interactive prompts), `strengths` (tags: `backend`, `frontend`, `review`, `spec`), `priority` (number), `workingDir` strategy, `enabled` (boolean).
- **FR-003**: System MUST execute pipeline stages sequentially by spawning the assigned CLI tool as a child process with the stage prompt piped via stdin or `--prompt` flag. The tool operates in the project directory and produces speckit-compatible artifacts.
- **FR-004**: System MUST implement quality gates between pipeline stages: a review CLI tool evaluates the artifact and outputs `APPROVE` or `REJECT` with structured feedback. On rejection, the system loops back to the generator with feedback appended (max retries configurable, default 3).
- **FR-005**: System MUST parse the generated `tasks.md` to extract agent-tagged tasks (`[BE]`, `[FE]`, `[DB]`, etc.) and map them to assigned CLI tools per the tool registry configuration.
- **FR-005b**: System MUST generate **API contracts** (TypeScript interfaces or OpenAPI spec) from the plan/data-model BEFORE dispatching parallel implementation tasks. Contracts are read-only input for all parallel workers. This prevents semantic drift between agents.
- **FR-006**: System MUST execute ensemble (parallel) tasks by creating isolated git worktrees per lane, spawning the assigned CLI tool process in each worktree directory, and collecting results. Each CLI tool has full native file editing within its worktree. Before spawning, the orchestrator MUST: (a) generate a scope-restriction prompt file (`ORCHESTRATOR_INSTRUCTIONS.md`) in worktree root that constrains the agent to its domain directories only and marks contracts as read-only, (b) set contract files to read-only (`chmod 444` or equivalent) to prevent agents from modifying shared interfaces, (c) pass the task description + contract paths + scope instructions as the initial prompt to the CLI tool.
- **FR-007**: System MUST merge parallel worktree results into a single result branch using `git merge`. After merge, MUST run build validation (`tsc --noEmit`, `npm run build`, or equivalent per tech stack). If validation fails → dispatch a "merge reviewer" CLI tool with error logs + diffs to fix inline.
- **FR-008**: System MUST provide real-time progress output in CLI via structured log lines: `[STAGE] [TOOL] [STATUS] message`. Must capture stdout/stderr from child CLI processes and forward to log stream.
- **FR-009**: System MUST expose an HTTP API with SSE endpoint (`GET /api/runs/:id/events`) that streams run progress events to connected web clients.
- **FR-010**: System MUST handle tool failures gracefully: detect process exit codes, timeouts, and crashes, then attempt reassignment to the next available CLI tool per the registry's priority order.
- **FR-011**: System MUST track execution time per tool per run and persist in SQLite. Token tracking is best-effort (only if CLI tool exposes usage stats in output).
- **FR-012**: System MUST support a `--dry-run` flag that shows the pipeline plan (which tool does what at each stage) without spawning any processes.
- **FR-013**: System MUST persist run history (run ID, timestamp, task description, tool assignments, per-stage results, total time) in a local SQLite database.
- **FR-014**: System MUST support configuration commands: `orch config set <key> <value>`, `orch config get <key>`, `orch tools list`, `orch tools test <name>` (spawn tool with health check prompt).
- **FR-015**: System MUST generate speckit-compatible artifacts: `spec.md`, `plan.md`, `tasks.md` matching templates with `[AGENT]` tags and Dependency Graph.
- **FR-016**: System MUST expose an **MCP server** (`orch-mcp`) that allows Claude Code (or any MCP client) to orchestrate runs programmatically. MCP tools: `orch.run`, `orch.status`, `orch.dispatch_task`, `orch.merge`, `orch.tools_list`.
- **FR-017**: System MUST manage worktree lifecycle: create on task start, symlink `node_modules`/dependencies from base repo, cleanup on task completion or failure. Register all worktrees in SQLite. `orch cleanup` command for manual purge.
- **FR-018**: System MUST pass context to tools via **prompt with file paths** (not inline content). Format: short instruction + absolute paths to artifacts. Tool reads files itself. Example: `"Review the spec at /path/to/spec.md. If acceptable, output APPROVE on first line. Otherwise output REJECT on first line followed by feedback."`
- **FR-019**: Review stages MUST parse the **first line** of tool output for `APPROVE` or `REJECT`. Remaining lines are treated as feedback. If first line is neither, treat as parse error and retry once.
- **FR-020**: System MUST validate agent tags against strict whitelist (`[SETUP]`, `[DB]`, `[BE]`, `[FE]`, `[OPS]`, `[E2E]`, `[SEC]`). Unknown tags → fallback to `[SETUP]` + warning in logs.

### Non-Functional Requirements

- **NFR-001**: CLI tools are spawned via `execa` v9 (no native dependencies, no PTY required). Tools MUST be launched with `headlessFlags` from registry config (e.g., `claude -p`, `gemini -p`) to prevent interactive hangs. All stdout/stderr MUST be filtered: (a) `strip-ansi` for color codes, (b) custom filter for cursor movement, line clears, and spinner redraws (`\r`, `\x1B[2K`, etc.). Only semantic output lines forwarded to SSE/logs.
- **NFR-002**: System MUST work on Windows 11 (primary environment), with Linux/macOS as secondary targets.
- **NFR-003**: CLI response time for `orch run --dry-run` MUST be under 500ms (no process spawning).
- **NFR-004**: SSE event latency from backend state change to client receipt MUST be under 1 second.
- **NFR-005**: System MUST handle up to 5 parallel CLI tool processes without resource exhaustion (memory, file handles, git worktrees). NOTE: API-level rate limits apply at the provider level (e.g., Anthropic's concurrent request limit). The orchestrator MUST detect when a child CLI tool fails due to internal API rate limiting (parse stderr for "rate limit", "429", "too many requests") and distinguish this from task-level failures. On API rate limit → queue the task for retry with backoff, do not reassign to the same provider.
- **NFR-006**: API keys MUST NOT appear in logs or config files. Tool-specific auth is managed by each CLI tool's own configuration (e.g., `~/.claude/credentials`, `~/.config/gemini`).
- **NFR-007**: All generated artifacts MUST be valid markdown parseable by standard markdown parsers.
- **NFR-008**: System MUST be installable as a global CLI tool via `npm install -g` or direct binary. MCP server startable via `orch mcp-serve`.
- **NFR-009**: Graceful shutdown: trap SIGINT/SIGTERM, kill entire process tree (not just direct child — CLI tools may spawn sub-shells), cleanup worktrees (if no changes), update run status to `failed (aborted)` in SQLite. Use `tree-kill` or `taskkill /T /F /PID` on Windows to ensure all descendants are terminated.

### Key Entities

- **Run**: A single end-to-end orchestration. Has: `id` (UUID), `description` (input text), `status` (pending | pipeline | contracts | ensemble | merging | validating | completed | failed), `createdAt`, `completedAt`, `config` (snapshot of tool assignments at start time).
- **Stage**: A step within a run's pipeline. Has: `id`, `runId`, `type` (specify | review-spec | plan | review-plan | contracts | tasks | implement | validate), `toolName`, `status` (pending | running | approved | rejected | failed), `prompt` (text), `outputPath` (file path), `startedAt`, `completedAt`, `attempt` (retry count), `processId` (OS PID for tracking).
- **Task**: A parsed task from tasks.md during ensemble execution. Has: `id` (e.g., T001), `runId`, `agentTag` ([BE], [FE], [DB], etc.), `description`, `toolName` (assigned CLI tool), `status` (pending | running | completed | failed | blocked), `worktreePath`, `processId`.
- **Tool**: An entry in the tool registry. Has: `name`, `command` (shell command to spawn), `args` (default arguments), `headlessFlags` (string[] — flags to disable interactive prompts, e.g., `["--dangerously-skip-permissions", "--print"]`), `strengths` (string[]), `priority` (number, lower = preferred), `enabled` (boolean), `healthCheckPrompt` (string for testing), `provider` (string — e.g., `anthropic`, `google`, `alibaba` — for rate limit grouping).
- **ToolMetrics**: Aggregated performance data. Has: `toolName`, `stageType`, `avgDurationMs`, `successRate` (0-1), `totalRuns`, `lastUpdated`.
- **Contract**: Generated API contract for a run. Has: `runId`, `format` (typescript | openapi), `filePath`, `generatedBy` (tool name), `lockedAt` (timestamp — immutable after lock).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Operator can go from idea to merged implementation branch in a single `orch run` command, with spec/plan/tasks generated and reviewed by different CLI tools, contracts generated, and implementation executed in parallel with build validation.
- **SC-002**: Pipeline quality gates catch at least one issue per 5 runs on average (measured by rejection rate > 0), demonstrating that multi-tool review adds value over single-tool generation.
- **SC-003**: Parallel ensemble execution completes at least 30% faster than sequential execution of the same tasks (measured by wall-clock time comparison on identical task sets).
- **SC-004**: Tool failure recovery succeeds in 90%+ of transient failure cases (timeout, crash) without operator intervention.
- **SC-005**: Web UI SSE dashboard renders live progress within 1 second of backend state changes for all connected clients.
- **SC-006**: System handles 10+ consecutive runs without memory leaks, zombie worktrees, or database corruption.
- **SC-007**: MCP server is callable from Claude Code and successfully orchestrates a full pipeline run.
- **SC-008**: Contract-first approach prevents semantic merge conflicts in 95%+ of parallel implementation runs (measured by build validation pass rate after merge).
