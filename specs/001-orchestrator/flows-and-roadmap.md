# Usage Flows & Roadmap

**Date**: 2026-04-02 | **Status**: Discussion captured, not yet implemented

---

## Usage Flows

### Flow 1: Single Feature (Full Cycle)

| Variant | When | Command |
|---------|------|---------|
| **A. Full autopilot** | Simple feature, trust AI | `orch run "Add JWT auth"` |
| **B. Hybrid** | Control spec, automate rest | `orch run "JWT auth" --spec-dir specs/005-auth/` |
| **C. Manual speckit + orch** | Critical feature, review every step | `orch run "JWT auth" --from implement --spec-dir specs/005-auth/` |

### Flow 2: Multiple Features

**Sequential** (safe): run one, merge, run next on updated main.

**Parallel** (needs `--base` flag, NOT YET IMPLEMENTED):

```bash
orch run "Feature A" --base main        # -> orch/run-abc123
orch run "Feature B" --base orch/run-abc123  # starts on top of A
```

**Risk**: If Feature A fails or changes contracts after Feature B started, B becomes invalid.
**Mitigation**: Mark B as `UNSTABLE_BASE` if its base branch hasn't merged to main yet. Warn operator before merge.

### Flow 3: Bug Fixes

| Scale | Tool | Example |
|-------|------|---------|
| One-liner | Direct CLI tool | `claude -p "Fix typo in auth.ts:42"` |
| Single module | Direct CLI tool | `claude -p "Fix race condition in worktree creation"` |
| Multi-module (>3 files) | Orch with minimal spec | `orch run "Fix cascade failure" --from implement` |

**Rule**: If fix touches >3 files or root cause is unclear, create at least a minimal spec.

**Proposed**: `orch fix` quick mode (NOT YET IMPLEMENTED):

```bash
orch fix "Race condition in worktree creation" --files src/worktree/manager.ts
```

**Safety**: Even quick fixes MUST use a temporary branch or worktree. Direct edits to working tree = risk of corruption if tool hallucinates.

### Flow 4: Other Scenarios

| Scenario | Flow |
|----------|------|
| Refactoring | `orch run "Refactor db to Drizzle" --from plan` -- needs plan, not spec |
| Code review | `orch review --branch feature-x` -- N models review a branch (NOT YET IMPLEMENTED) |
| Migration | `orch run "Migrate Express to Hono"` -- full pipeline |
| Prototype | `orch run "Prototype WebSocket sync" --dry-run` -- plan without execution |

---

## Roadmap: Planned Features

### Branch Strategy

Each roadmap feature gets its own branch and speckit flow. `001-orchestrator` = MVP (closed). This document is the master roadmap — individual branches reference it.

| Branch | Feature | Spec Dir | Depends On |
|--------|---------|----------|------------|
| `001-orchestrator` | MVP (done) | `specs/001-orchestrator/` | -- |
| `002-orch-review` | Standalone Review (P1) | `specs/002-orch-review/` | 001 merged |
| `003-orch-ensemble` | Ensemble Voting (P2) | `specs/003-orch-ensemble/` | 002 merged |
| `004-orch-fix` | Quick Fix Mode (P3) | `specs/004-orch-fix/` | 001 merged |
| `005-orch-base` | Parallel Features (P4) | `specs/005-orch-base/` | 001 merged |

### Priority Order

Based on review feedback from Gemini, Qwen, and GPT:

| # | Feature | Rationale |
|---|---------|-----------|
| P1 | `orch review` (Standalone Review) | MVP for multi-model value. Simpler than ensemble pipeline. Builds the engine that P2 reuses. Daily use case. |
| P2 | Ensemble Review (Multi-Model Voting) | Uses review engine from P1. Adds voting + feedback merge to pipeline stages. |
| P3 | `orch fix` (Quick Mode) | Common use case, but workaround exists (direct CLI tool). |
| P4 | `--base` flag + `UNSTABLE_BASE` | Parallel features -- nice to have, sequential works fine. |

---

### P1: `orch review` Standalone Review

**What**: Dispatch N tools to review an existing branch diff. No implementation, just feedback.

```bash
orch review --branch feature-x [--tools gemini,copilot,opencode]
```

**Output**:

```
Review Results for feature-x (3 reviewers):

  gemini:  APPROVE  "Clean implementation, good test coverage"
  copilot: APPROVE  "LGTM, minor: consider adding error boundary in UserForm"
  opencode: REJECT  "Missing input validation in POST /api/users"

Verdict: APPROVE (2/3 majority)

Consolidated feedback:
  1. [copilot] Add error boundary in UserForm (suggestion)
  2. [opencode] Add input validation in POST /api/users (required)
```

**Why P1**: This is the simplest multi-model feature. No pipeline integration, no retries, no worktrees. Just: get diff → spawn N tools → collect feedback → display. And the review engine it builds becomes the foundation for P2.

**Implementation**:

- `src/engine/review.ts` -- new module: parallel review dispatch + result aggregation
- `src/parsers/review-merger.ts` -- deduplicate and structure multi-model feedback
- `src/index.ts` -- new `orch review` command
- `src/mcp/server.ts` -- new `orch_review` MCP tool
- `.claude/commands/orch.review.md` -- slash command for Claude Code

**Claude Code slash command** (`/orch.review`):

```
/orch.review feature-x
/orch.review --tools gemini,copilot
/orch.review --against main
```

The command calls `orch_review` MCP tool which:

1. Gets the diff (merge-base by default, per ADR-003)
2. Dispatches N reviewers in parallel
3. Collects votes + feedback
4. Applies two-layer verdict (vote + gate, per ADR-001)
5. Returns consolidated report with required/suggestion items

---

### P2: Ensemble Review (Multi-Model Voting in Pipeline)

**Current**: Single reviewer per stage (e.g., `review-spec: gemini`).

**Proposed**: Multiple reviewers with voting strategy.

```yaml
pipeline:
  review-spec:
    mode: ensemble
    tools: [gemini, copilot, opencode]
    strategy: majority      # majority | unanimous | weighted
    arbiter: claude          # tie-breaker / override for split votes
    mergeFeedback: true
```

**Voting strategies**:

| Strategy | APPROVE when | REJECT when | Use case |
|----------|-------------|-------------|----------|
| `majority` | >50% approve | >50% reject | Default for most reviews |
| `unanimous` | 100% approve | Any reject | Security, API contracts |
| `weighted` | Arbiter decides on split | Arbiter decides on split | Mixed-capability ensemble |

**Arbiter model**: When votes are split, the arbiter (typically the most capable model) makes the final call.

**Arbiter fallback** (if arbiter unavailable):

1. Arbiter tool health-checked before ensemble dispatch
2. If unhealthy → fall back to `majority` strategy for this stage
3. Log warning: "arbiter unavailable, using majority fallback"
4. Never block the pipeline because the arbiter is down

**Weighted strategy details**: Weights are derived from `tool_metrics` (P5/US3 adaptive routing). Tool with higher `success_rate` for the specific `stage_type` gets a heavier vote. Fresh installs with no metrics data → equal weights (effectively `majority`).

**Contradictory feedback resolution**:
When reviewers directly contradict (e.g., Gemini: "reject — insecure", Claude: "approve — security is fine"):

1. Tag each feedback item with confidence: `required` (security, correctness) vs. `suggestion` (style, naming)
2. Security/correctness concerns from ANY reviewer always escalate — treated as required regardless of votes
3. If contradiction is on a factual clai-helpersm, arbiter verifies (or falls back to "apply the stricter interpretation")
4. Style/preference contradictions → majority wins, losers' feedback dropped

**Feedback merge on REJECT**:

1. Collect all REJECT feedbacks
2. Pass through a **summarizer model** (not just concatenate) to deduplicate and resolve contradictions
3. Output: structured list of `required` changes vs. `suggestions`
4. Feed as single combined feedback into retry

**Cost control**: N reviewers = N x cost. Mitigations:

- Default ensemble size: 2 (not 5) — diminishing returns past 3
- `--review-budget <usd>` flag caps total spend
- Cheaper models for first pass, expensive only as arbiter
- Skip ensemble for low-risk stages (e.g., `review-tasks` rarely needs 3 reviewers)

**Implementation**: Requires changes to:

- `src/config/schema.ts` -- pipeline stage config becomes `string | EnsembleReviewConfig`
- `src/engine/pipeline.ts` -- review execution dispatches to N tools in parallel
- Reuses `src/engine/review.ts` from P1
- `src/types.ts` -- `ReviewResult` gains `voters` and `arbiterDecision` fields

---

### P3: `orch fix` Quick Mode

Skip full pipeline for bug fixes. Single-tool dispatch with file scope.

```bash
orch fix "Description" --files src/a.ts src/b.ts [--tool claude]
```

**Implementation**: New command in `src/index.ts` that:

1. Creates a temporary branch (NEVER direct edits to working tree)
2. Reads specified files as context
3. Spawns one tool with fix prompt + file contents
4. Runs validation command after fix
5. Shows diff for operator review — **NO auto-merge by default**
6. `--auto-merge` flag available but prints warning: "Auto-merge skips human review"

**Safeguards** (from Qwen review):

- Operator always sees the diff before merge (unless `--auto-merge`)
- If fix touches files NOT in `--files` list → warn per ADR-005 (hard stop + allowlist)
- Prompt includes explicit instruction: "This is a targeted fix, not a refactor. Do not change unrelated code."
- One bug can be a symptom of a deeper issue — `orch fix` output includes: "Consider running full analysis if this area has recurring bugs"

**Additional implementation**:

- `src/mcp/server.ts` -- new `orch_fix` MCP tool
- `.claude/commands/orch.fix.md` -- slash command for Claude Code

**Claude Code slash command** (`/orch.fix`):

```
/orch.fix Race condition in worktree creation --files src/worktree/manager.ts
/orch.fix Missing null check in config loader --files src/config/loader.ts --tool claude
```

The command calls `orch_fix` MCP tool which:

1. Creates temporary branch from HEAD
2. Reads `--files` as context, passes to the tool
3. Spawns single tool with targeted fix prompt
4. Runs scoped validation (target files) + global validation (`validateCommand`)
5. Shows diff for operator review
6. On approval: merges temp branch. On reject: deletes temp branch.

---

### P4: `--base` Flag for Parallel Features

```bash
orch run "Feature B" --base orch/run-abc123
```

Creates worktrees from the specified base branch instead of HEAD.

**`UNSTABLE_BASE` tracking**: If the base branch hasn't been merged to main:

- Mark the run as `UNSTABLE_BASE` in DB
- Warn operator before merge: "Base branch orch/run-abc123 is not yet in main"
- If base branch fails later, cascade-notify dependent runs

**Rollback mechanism** (from Qwen review):
When base branch (Feature A) fails after dependent (Feature B) started:

1. `UNSTABLE_BASE` runs get status `BASE_FAILED`
2. `orch status` shows: "Run xyz depends on failed base orch/run-abc123"
3. `orch rebase --run xyz --base main` re-applies Feature B's changes on updated main (may conflict)
4. If rebase fails → operator must manually resolve or restart B from scratch
5. Worktrees for failed dependent runs are NOT auto-deleted — operator decides

---

## Cross-Cutting Concerns

### Post-Merge Lint/Format (from review feedback)

After `merger.ts` merges worktrees, run `prettier --write` + `eslint --fix` before validation. Multiple AI tools editing the same codebase can produce inconsistent style even if each individual output is correct.

```
merge worktrees → prettier --write . → eslint --fix . → validateCommand
```

### Context Persistence (from Gemini review)

When different models handle different pipeline stages (Claude writes spec, Gemini reviews, Claude plans), the plan model should see review feedback from the spec stage. Current pipeline passes artifacts (file paths) but not conversation history.

**Proposed**: `run_context.json` per run that accumulates stage outputs and review feedback. Each stage prompt includes relevant prior context, not just artifact paths.

**Size limits** (from Qwen review): Context can grow unbounded on complex features.

- Max context per stage injection: 8KB (configurable via `defaults.maxContextBytes`)
- Strategy: most recent stages first, oldest truncated
- Review feedback: keep only `required` items, drop `suggestions` from prior stages
- After run completes: archive context to `~/.orch/runs/<id>/context.json`, don't keep in active DB

### Model Accuracy Rating (from Qwen review)

Track per-model review accuracy to improve ensemble voting weights over time.

```
After each pipeline completion:
  1. For each review stage, record: model → decision (APPROVE/REJECT)
  2. After implementation + validation: record actual outcome (tests pass/fail)
  3. Compute: was the review correct?
     - APPROVE + tests pass = true positive
     - REJECT + retry fixed real issue = true positive
     - APPROVE + tests fail = false positive (missed bug)
     - REJECT + no real issue found on retry = false negative (wasted cycle)
  4. Update tool_metrics: review_accuracy field
```

This feeds into `weighted` voting strategy — models with higher accuracy get heavier votes.

### Complexity Heuristics (from Qwen review)

File count is a poor proxy for complexity. Better signals:

| Signal | How to detect | Weight |
|--------|--------------|--------|
| Files changed | `--files` count or git diff | Low |
| Cyclomatic complexity | Static analysis of touched functions | Medium |
| Cross-module deps | How many imports point to changed files | High |
| Test coverage | Are changed lines covered by tests? | High |
| Critical path | Auth, payments, data mutations | Very high |

For v1: use file count (it's what we have). For v2: integrate with `orch review` to surface complexity score.

### Manual Approval Checklist (from Qwen review)

For high-risk operations, `orch` can generate a checklist before proceeding:

```bash
orch run "Migrate auth to OAuth2" --require-approval

# Output:
# Pre-flight checklist for "Migrate auth to OAuth2":
#   [ ] 12 files will be modified (3 in auth/, 2 in api/, 7 tests)
#   [ ] Touches critical path: authentication
#   [ ] No existing tests cover OAuth2 flow
#   [ ] Estimated cost: ~$2.40 (7 pipeline stages + 4 ensemble tasks)
#
# Proceed? (y/n)
```

---

## Architecture Decision Records

Policy decisions that must be resolved before implementation. Raised by GPT review.

### ADR-001: Review Verdict Semantics (gate model)

**Problem**: A reviewer can APPROVE but include a `required` feedback item. This is a semantic conflict — is merge allowed or not?

**Decision**: Two-layer result model.

```typescript
interface ReviewVerdict {
  vote: "APPROVE" | "REJECT";       // the reviewer's overall opinion
  gate: "pass" | "blocked";          // computed: can pipeline proceed?
  items: ReviewItem[];                // individual feedback entries
}

interface ReviewItem {
  severity: "required" | "suggestion";
  category: "security" | "correctness" | "style" | "performance";
  description: string;
  filePath?: string;
  reviewer: string;
}
```

**Gate computation**:

- If ANY item has `severity: "required"` AND `category: "security" | "correctness"` → `gate: "blocked"` regardless of vote
- Otherwise → `gate` follows the vote
- This means: APPROVE with a style suggestion = pass. APPROVE with a security concern = blocked.

**Rationale**: Vote captures the reviewer's gestalt opinion (useful for analytics/accuracy tracking). Gate captures the merge-safety decision (used by pipeline). Separating them avoids the "APPROVE but actually blocked" ambiguity.

---

### ADR-002: Partial Failure Policy for Ensemble

**Problem**: What happens when a reviewer in the ensemble is unavailable, times out, or returns garbage?

**Decision**: Per-stage degradation policy with quorum.

```yaml
pipeline:
  review-spec:
    mode: ensemble
    tools: [gemini, copilot, opencode]
    strategy: majority
    arbiter: claude
    quorum:
      minVoters: 2            # minimum valid responses needed
      allowDegraded: true     # proceed with fewer than all tools
    failPolicy: fail-open     # fail-open | fail-closed
```

**Behavior matrix**:

| Scenario | `allowDegraded: true` | `allowDegraded: false` |
|----------|----------------------|------------------------|
| 3/3 respond | Normal voting | Normal voting |
| 2/3 respond (1 timeout) | Vote with 2, log warning | Stage fails, retry |
| 1/3 respond | Below quorum → fallback to single-reviewer mode | Stage fails |
| Arbiter down | Fall back to `majority` among available voters | Stage fails |
| All down | Stage fails (no fallback) | Stage fails |

**Unparseable output**: Treated same as timeout — that voter is excluded from quorum count. Logged for model accuracy tracking (counts as tool error, not review error).

**Default**: `minVoters: 2`, `allowDegraded: true`, `failPolicy: fail-open`. Override to `fail-closed` for security-sensitive stages.

---

### ADR-003: Diff Base for `orch review`

**Problem**: What diff does `orch review` show to reviewers? Different bases give different results.

**Decision**: Default to merge-base, explicit override.

```bash
# Default: merge-base of branch against target (PR-like, reproducible)
orch review --branch feature-x

# Explicit overrides:
orch review --branch feature-x --against main          # diff vs current main HEAD
orch review --branch feature-x --against merge-base    # default (explicit)
orch review --working-tree                              # uncommitted changes
```

**Rationale**: `merge-base` is what GitHub/GitLab PRs show. It's reproducible (same result regardless of when main moves). `--against main` is useful for "what will this look like after merge" but drifts over time.

**Implementation**: `git diff $(git merge-base feature-x main)..feature-x` for default mode.

---

### ADR-004: Budget Enforcement

**Problem**: `--review-budget` is mentioned but enforcement model is undefined.

**Decision**: Hard preflight estimate + soft runtime warning. No runtime cancellation in v1.

```bash
orch run "Feature X" --review-budget 5.00

# Output before starting:
# Estimated cost: $3.20 (7 pipeline stages × avg $0.35 + 4 ensemble tasks × $0.15)
# Budget: $5.00 — within limit, proceeding.

# If over budget:
# Estimated cost: $7.40 — exceeds budget of $5.00
# Options:
#   1. Proceed anyway (--force-budget)
#   2. Reduce ensemble reviewers to 1
#   3. Skip review stages (--skip-review)
#   4. Abort
```

**Cost estimation**: Based on `tool_metrics.avg_duration_ms` × approximate token rate per tool. Rough but useful for order-of-magnitude. Not a billing guarantee.

**v2 improvement**: Runtime tracking with warning at 80% consumed. Still no cancellation — partial reviews are worse than slightly over-budget complete reviews.

---

### ADR-005: `orch fix` Scope Enforcement

**Problem**: AI tool modifies files outside the `--files` scope. What happens?

**Decision**: Hard stop with allowlist for adjacent files.

**Allowed modifications outside `--files`**:

- Test files that import the target file (e.g., `--files src/auth.ts` → `tests/auth.test.ts` is OK)
- Type definition files directly imported by target (`types.ts`, `schema.ts`)
- Lock files (`package-lock.json`) if dependencies changed

**Everything else**: Hard stop. Show diff of unexpected changes, ask operator:

```
WARNING: Tool modified files outside scope:
  + src/middleware/cors.ts (not in --files, not a test/type file)

Options:
  1. Accept all changes
  2. Accept only in-scope changes (revert cors.ts)
  3. Abort entire fix
```

---

### ADR-006: Run Dependency Model (`--base`)

**Problem**: Single parent or full DAG?

**Decision**: Single parent only in v1. Explicit non-goal for DAG.

```
runs table: add column `base_run_id TEXT REFERENCES runs(id)` (nullable, single FK)
```

**v1 constraint**: Each run has at most one parent run. No diamond dependencies (A → B, A → C, D depends on B+C). If needed, operator manually sequences: B first, merge, then C on top of merged B.

**Documented limitation**: "The orchestrator tracks single-parent run dependencies. For complex multi-branch workflows, use sequential runs or manage branches manually."

This avoids the complexity explosion of DAG traversal, cascade status propagation, and multi-parent rebase — all of which are hard problems that don't block the MVP.

---

### ADR-007: Context Persistence Content

**Problem**: What goes into `run_context.json` — raw prompts/responses or structured summaries?

**Decision**: Structured summaries by default. Raw artifacts via `--debug-context` flag.

**Default content** (per stage entry):

```json
{
  "stage": "review-spec",
  "tool": "gemini",
  "vote": "REJECT",
  "gate": "blocked",
  "items": [
    {"severity": "required", "category": "security", "description": "Missing rate limiting on login endpoint"}
  ],
  "durationMs": 12400,
  "timestamp": "2026-04-02T10:30:00Z"
}
```

**NOT stored by default**: full prompt text, full tool output, system prompts, template content.

**`--debug-context` flag**: Saves raw prompt + response per stage to `~/.orch/runs/<id>/debug/`. Auto-deleted after 7 days. Warning on creation: "Debug context may contain sensitive data."

**Security**: Context is scrubbed for env var values, API keys, and token patterns before storage. If a secret pattern is detected, the entire field is replaced with `[REDACTED]`.

---

## Known Edge Cases

Collected from GPT, Gemini, and Qwen reviews. To be addressed during implementation.

| # | Edge Case | Affected Feature | Proposed Handling |
|---|-----------|-----------------|-------------------|
| 1 | Reviewer APPROVE + required security item | P1/P2 review | ADR-001: gate overrides vote |
| 2 | Two reviewers same issue, different severity | P2 ensemble | Take the higher severity |
| 3 | One tool garbage output, others valid, quorum barely met | P2 ensemble | ADR-002: exclude broken voter, proceed if quorum met |
| 4 | `orch fix` passes targeted validation, fails global `npm run validate` | P3 fix | Run BOTH scoped and global validation. Fail = no merge. |
| 5 | `--base` branch squash-merged, old branch name gone | P4 base | Track by commit SHA, not branch name. `base_commit_sha` column. |
| 6 | Rebase succeeds syntactically but specs/contracts are now stale | P4 base | After rebase, re-run `review-tasks` stage to catch semantic drift |
| 7 | `run_context.json` contains secrets from tool output | Cross-cutting | ADR-007: regex scrub for secret patterns before storage |
| 8 | Weighted voting reinforces bad model via noisy accuracy data | P2 weighted | Minimum 10 data points before weight diverges from equal. Decay old data (rolling 30-day window). |
| 9 | Contradictory required items from different reviewers | P2 ensemble | Arbiter resolves. If no arbiter: stricter interpretation wins. |
| 10 | All ensemble reviewers timeout simultaneously | P2 ensemble | ADR-002: stage fails (no fallback possible). Operator notified. |

---

## Open TODOs from Code Reviews

Accepted feedback that hasn't been implemented yet. Track per-branch.

### For 001-orchestrator (before merge)

All resolved — see PR #1 comment fixes.

### For 002-orch-review

| # | Source | TODO | File |
|---|--------|------|------|
| 1 | Gemini #2 | Add web workspace to CI when web is shipping-ready | `.github/workflows/ci.yml` |
| 2 | Gemini #9 | Make output format a `ToolConfig` property instead of hardcoded provider check | `src/engine/pipeline.ts`, `src/types.ts`, `src/config/schema.ts` |
| 3 | Gemini #3 | Decide: remove orch Dockerfile or document it as "for future containerized mode" | `packages/orchestrator/Dockerfile` |
| 4 | Gemini #8 | Wire runs API routes to actual DB when review needs run tracking | `src/api/routes/runs.ts` |

### For 003-orch-ensemble

| # | Source | TODO | Ref |
|---|--------|------|-----|
| 1 | ADR-001 | Implement two-layer review verdict (`vote` + `gate`) | `src/types.ts`, `src/parsers/review-parser.ts` |
| 2 | ADR-002 | Implement quorum + degradation policy for ensemble | `src/engine/review.ts` (new) |
| 3 | ADR-004 | Implement `--review-budget` preflight estimation | `src/index.ts`, `src/engine/pipeline.ts` |
| 4 | Qwen | Implement model accuracy rating (true/false positive tracking) | `src/db/metrics.ts` |
| 5 | Qwen | Context size limits (8KB cap, recent-first truncation) | `src/engine/pipeline.ts` |

### For 004-orch-fix

| # | Source | TODO | Ref |
|---|--------|------|-----|
| 1 | ADR-005 | Implement scope enforcement (hard stop + allowlist) | `src/engine/fix.ts` (new) |
| 2 | Qwen | Run both scoped AND global validation | `src/engine/fix.ts` |

### For 005-orch-base

| # | Source | TODO | Ref |
|---|--------|------|-----|
| 1 | ADR-006 | Single parent only, add `base_run_id` column | `src/db/schema.sql`, `src/db/runs.ts` |
| 2 | Qwen | Track by commit SHA not branch name | `src/db/schema.sql` |
| 3 | Edge case #6 | Re-run review-tasks after rebase to catch semantic drift | `src/engine/pipeline.ts` |

---

## Decision: When to Use Speckit vs Orch

```
Is it a bug?
  ├── One-liner → direct CLI tool
  ├── Multi-file → orch fix (when available) or minimal spec + orch
  └── Unknown root cause → speckit spec first

Is it a feature?
  ├── Trivial (<1 file) → direct CLI tool
  ├── Small (1-3 files) → orch run (full autopilot)
  ├── Medium (3-10 files) → speckit spec → orch run --spec-dir
  └── Large (10+ files) → full speckit flow → orch run --from implement

Is it a refactor?
  ├── Rename/move → direct CLI tool
  ├── Pattern change → orch run --from plan
  └── Architecture change → full speckit flow
```
