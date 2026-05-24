# Speckit Agent Routing & Dependency Graph

> **Date**: 2026-04-01
> **Status**: Draft
> **Scope**: Enhance `speckit.tasks` and `speckit.implement` with agent assignment, dependency graph, and parallel execution lanes

---

## Problem

Current `speckit.tasks` generates a flat task list with `[P]` markers for parallelism but has no concept of:
- Which specialist agent should execute each task
- Explicit dependency chains between tasks
- Parallel execution lanes for orchestration
- Cross-platform degradation (Claude Code vs Gemini/Copilot)

## Solution: Annotated Tasks + Dependency Graph + Adaptive Execution

One tasks.md format that serves all platforms:
- **Claude Code**: reads graph, dispatches parallel agents via Agent tool
- **Gemini/Copilot/others**: reads graph as execution order hints, agent tags as role context

---

## 1. Agent Roles

Six roles. Tests are owned by domain agents (BE writes BE tests, FE writes FE tests). Only cross-boundary tests get a dedicated agent.

| Tag | Agent | Domain |
|-----|-------|--------|
| `[SETUP]` | — (self) | Project init, shared config, scaffolding |
| `[BE]` | backend-specialist | API routes, services, middleware, server logic |
| `[FE]` | frontend-specialist | Components, pages, styles, client state, UI design |
| `[DB]` | database-architect | Schema, migrations, seeds, indexes |
| `[OPS]` | devops-engineer | Docker, CI/CD, infra, deploy configs |
| `[E2E]` | test-engineer | Cross-boundary integration/E2E tests only |
| `[SEC]` | security-auditor | Security audit, vulnerability review (conditional) |

### Assignment Rules

**By file path (primary):**
- `src/models/`, `prisma/`, `drizzle/`, `migrations/`, `schema.*` → `[DB]`
- `src/api/`, `src/services/`, `src/middleware/`, `server/`, `src/routes/` → `[BE]`
- `src/components/`, `src/pages/`, `src/app/`, `styles/`, `public/` → `[FE]`
- `Dockerfile`, `.github/workflows/`, `infra/`, `deploy/`, CI configs → `[OPS]`
- `tests/e2e/`, `tests/integration/` (cross-domain) → `[E2E]`

**By task description (fallback):**
- "audit", "security review", "vulnerability" → `[SEC]`
- "create schema", "add migration", "seed data" → `[DB]`
- "implement endpoint", "add route", "create service" → `[BE]`
- "create component", "add page", "style" → `[FE]`

**Phase-based defaults:**
- Phase 1 tasks without clear domain → `[SETUP]`

**Conditional agents:**
- `[SEC]` — only added when spec.md/plan.md mentions security requirements
- `[E2E]` — only added when spec.md mentions E2E testing or cross-boundary scenarios

---

## 2. Task Format

### Before (current)
```
- [ ] T001 Create project structure per implementation plan
- [ ] T005 [P] Implement auth middleware in src/middleware/auth.py
- [ ] T012 [P] [US1] Create User model in src/models/user.py
```

### After (new)
```
- [ ] T001 [SETUP] Create project structure per implementation plan
- [ ] T005 [BE] [US1] Implement auth middleware in src/middleware/auth.py
- [ ] T012 [DB] [US1] Create User model in src/models/user.py
```

**Changes from current format:**
- `[P]` marker **removed** from tasks — parallelism is now derived from Dependency Graph (no dependency = parallel)
- `[AGENT_TAG]` added after task ID
- Field order: `- [ ] ID [AGENT] [STORY?] Description with file path`

---

## 3. Dependency Graph Format

Three sections appended to the bottom of tasks.md:

### 3.1 Dependencies

```markdown
## Dependency Graph

### Legend
- `→` means "unlocks" (left must complete before right can start)
- `+` means "all of these" (join point)
- Tasks not listed here have no dependencies (can start immediately)

### Dependencies
T001 → T002, T003            # project setup unlocks DB schema and CI config
T003 → T004, T005            # DB model unlocks BE service and FE form
T004 + T005 → T006           # E2E needs both BE and FE ready
T008 → T009                  # API endpoint before integration test
```

**Rules:**
- Only blocking dependencies are listed
- Task not in graph = no dependencies = can start immediately
- Comments (`#`) explain the "why" for each dependency

### 3.2 Parallel Lanes

```markdown
## Parallel Lanes

| Lane | Agent | Tasks | Blocked By |
|------|-------|-------|------------|
| 1 | [SETUP] | T001 | — |
| 2 | [DB] → [BE] | T003 → T004 → T008 | T001 |
| 3 | [DB] → [FE] | T003 → T005 → T007 | T001 |
| 4 | [OPS] | T002, T010 | T001 |
| 5 | [E2E] | T006 | T004 + T005 |
| 6 | [SEC] | T011 | all US1 tasks |
```

**Purpose:**
- Visual map of parallelism for humans
- Execution plan for Claude Code orchestrator
- Guide for manual multi-session parallelism (Gemini/Copilot)

### 3.3 Agent Summary

```markdown
## Agent Summary

| Agent | Task Count | Can Start After |
|-------|-----------|-----------------|
| [SETUP] | 1 | immediately |
| [DB] | 2 | T001 |
| [BE] | 3 | T003 |
| [FE] | 3 | T003 |
| [OPS] | 2 | T001 |
| [E2E] | 1 | T004 + T005 |
| [SEC] | 1 | all US1 complete |
```

---

## 4. Generation Logic Changes (speckit.tasks)

### Step 3 additions to task generation workflow:

1. **Agent Assignment** — after generating tasks, assign agent tag using Assignment Rules (Section 1)

2. **Dependency Resolution** — build graph:
   - Parse plan.md and data-model.md: entity → service → endpoint → UI = natural chain
   - Default rules within a user story:
     - `[SETUP]` blocks everyone
     - `[DB]` → `[BE]` (when BE uses the model)
     - `[DB]` → `[FE]` (when FE binds to the model directly)
     - `[BE]` → `[FE]` (when FE calls the API)
     - `[E2E]` depends on all tasks in its user story
     - `[SEC]` depends on all tasks in its user story
     - `[OPS]` depends only on `[SETUP]` (parallel to everything else)
   - Explicit dependencies from contracts/ (interface A used in B)
   - Shared file dependencies: tasks touching same file → sequential

3. **Lane Generation** — group dependency chains into parallel lanes by agent flow

### Step 5 additions to report:

- Task count per agent (not only per story)
- Number of parallel lanes
- Critical path (longest dependency chain) with estimated bottleneck

---

## 5. Execution Changes (speckit.implement)

### Claude Code — Full Orchestration

```
1. Parse Dependency Graph from tasks.md
2. Validate graph (see 7.2 — no cycles, no orphans, all IDs exist)
3. Execute phase by phase (phases = sync barriers, see 7.4):

   For each phase:
   a. Find all tasks with no unresolved dependencies → start group
   b. Launch parallel tasks via Agent tool:
      - [BE] task → Agent(subagent_type="backend-specialist", isolation="worktree")
      - [FE] task → Agent(subagent_type="frontend-specialist", isolation="worktree")
      - [DB] task → Agent(subagent_type="database-architect", isolation="worktree")
      - [OPS] task → Agent(subagent_type="devops-engineer", isolation="worktree")
      - [SEC] task → Agent(subagent_type="security-auditor", isolation="worktree")
      - [E2E] task → Agent(subagent_type="test-engineer", isolation="worktree")
      - [SETUP] task → execute directly (no subagent, no worktree)
   c. On task completion → mark [X], merge worktree, unblock dependents
   d. On task failure → mark [!], cascade [~] to all dependents (see 7.3)
   e. Launch next available group in parallel
   f. Phase complete when all tasks are [X], [!], or [~]

4. Conflict prevention:
   - Parallel agents use git worktree isolation (see 7.5)
   - Shared files extracted to [SETUP] tasks before fork point (see 7.1)
   - Sequential tasks in same lane share workspace (no worktree needed)

5. End-of-execution report:
   - [X] completed: N tasks
   - [!] failed: N tasks (with error details)
   - [~] blocked: N tasks (with failed dependency chain)
   - [ ] remaining: N tasks (if execution was stopped early)
```

### Gemini / Copilot / Others — Graceful Degradation

```
1. Read tasks.md as usual (sequential execution)
2. Dependency Graph → execution order guide
3. Agent tags → role context switching ("now acting as [BE]")
4. Agent Summary → information for human to launch parallel sessions
5. Parallel Lanes → manual multi-session guide
```

**What does NOT change:**
- Checklist gate before execution — stays
- Phase-by-phase execution order — stays, phases are sync barriers (see 7.4)
- Progress tracking — stays, extended with `[→]`, `[!]`, `[~]` statuses (see 7.3)
- Halt on failure — stays, now with cascade blocking of dependents

---

## 6. Files to Modify

| File | Change |
|------|--------|
| `.claude/commands/speckit.tasks.md` | Add agent assignment, dependency resolution, lane generation logic |
| `.specify/templates/tasks-template.md` | Add Dependency Graph, Parallel Lanes, Agent Summary sections |
| `.claude/commands/speckit.implement.md` | Add graph parsing, parallel agent dispatch, lane-scoped failure |
| `.agent/workflows/speckit.tasks.md` | Mirror changes from `.claude/commands/` |
| `.agent/workflows/speckit.implement.md` | Mirror changes from `.claude/commands/` |

---

## 7. Edge Cases & Mitigations

### 7.1 Race Conditions on Shared Files

**Problem**: Parallel agents (`[BE]` and `[FE]`) both need to modify `package.json`, `tsconfig.json`, or other shared configs. Without file locks, one overwrites the other.

**Mitigation**: Shared config changes are **extracted into explicit `[SETUP]` tasks** during generation and placed BEFORE the parallel fork point. The rule:

- `speckit.tasks` scans all tasks for overlapping file paths
- Any file touched by 2+ agents → gets its own `[SETUP]` task (e.g., `T002 [SETUP] Install all dependencies in package.json`)
- This task becomes a dependency for both agents in the graph
- **No agent may write to a file owned by another agent's task**

If a shared file change is discovered mid-execution (agent needs a dep not in package.json), the orchestrator **halts the lane**, creates a blocking `[SETUP]` micro-task, executes it, then resumes.

### 7.2 Markdown Parsing Reliability

**Problem**: LLM parsing `→` and `+` from raw markdown could glitch during generation or consumption.

**Mitigation**: Strict format rules enforced in the template:

```
# VALID formats (one per line, no exceptions):
T001 → T002                    # single unlock
T001 → T002, T003              # fan-out (one unlocks many)
T002 + T003 → T004             # fan-in (many unlock one)

# INVALID (generator must not produce):
T001 → T002 → T003             # chaining (use two lines instead)
T001, T002 → T003, T004        # multi-to-multi (decompose)
```

Additionally, `speckit.tasks` performs a **self-validation pass** after generating the graph:
- Every task ID in Dependencies must exist in the task list
- No circular dependencies (A→B→A)
- No orphan tasks referenced that don't exist
- Fan-in uses `+` only, fan-out uses `,` only

If validation fails → generation stops and reports the error. No invalid graph gets written.

### 7.3 Cascade Failures & Deadlocks

**Problem**: If Lane 2 (`[BE]`) fails, Lane 5 (`[E2E]`) waits for `[BE] + [FE]` forever.

**Mitigation**: Three new task statuses beyond `[ ]` and `[X]`:

```
- [ ] T004 [BE] ...          # pending
- [→] T004 [BE] ...          # in_progress
- [X] T004 [BE] ...          # completed
- [!] T004 [BE] ...          # FAILED
- [~] T006 [E2E] ...         # BLOCKED (cascade from T004 failure)
```

**Cascade rules:**
1. Task fails → mark `[!]`
2. Walk dependency graph forward from failed task
3. All downstream dependents → mark `[~]` (BLOCKED)
4. Independent lanes continue unaffected
5. End-of-execution report lists: completed, failed, blocked, and remaining

**No infinite waits.** Orchestrator checks: "Are all unblocked tasks either `[X]` or `[!]`?" → execution complete.

### 7.4 Phase Boundaries vs Dependency Graph

**Problem**: Phases (Setup → Foundation → US1 → US2) and the dependency graph can conflict. If US2 has no deps on US1, should it start before US1 finishes?

**Mitigation**: **Phases are sync barriers. Graph is ordering within a phase.**

```
Phase 1 (Setup)       → BARRIER → must complete before Phase 2
Phase 2 (Foundation)  → BARRIER → must complete before any US phase
Phase 3+ (User Stories):
  - US phases respect priority order by DEFAULT (P1 → P2 → P3)
  - BUT: if plan.md explicitly marks stories as independent,
    multiple US phases can run in parallel
  - Dependency graph governs ordering WITHIN each phase
Final Phase (Polish)  → BARRIER → waits for all US phases
```

This means:
- Setup and Foundation are always sequential barriers
- User stories default to sequential (P1 first, then P2) for safety
- Parallel user stories are opt-in via plan.md annotation
- Graph handles parallelism within each phase (BE and FE in parallel within US1)

### 7.5 Claude Code Parallel Execution Capabilities

**Confirmed capability**: Claude Code Agent tool supports launching multiple subagents in a single message. They run concurrently and return independently. This is not simulated — it's real parallel execution.

**Constraints to document:**
- Each Agent call is independent (no shared memory between parallel agents)
- Agent results return asynchronously — orchestrator processes them as they arrive
- `run_in_background: true` enables non-blocking dispatch
- Agents can be launched with `isolation: "worktree"` for full git-level isolation (each agent gets its own working copy)

**Worktree strategy for maximum safety:**
- Parallel agents within same phase → each gets `isolation: "worktree"`
- Results merged by orchestrator after all agents in group complete
- Eliminates file conflicts entirely at git level
- Tradeoff: slower (worktree creation + merge), but zero race conditions

**Recommended default**: Use worktree isolation for parallel agents. Fall back to shared workspace only for sequential tasks within the same lane.

---

## 8. Non-Goals

- No new CLI tooling or scripts — this is pure prompt/template changes
- No changes to speckit.specify, speckit.plan, or speckit.analyze
- No new agent definitions — uses existing agents as-is
