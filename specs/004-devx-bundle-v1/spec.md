# Feature Specification: Developer Experience Bundle v1

**Feature Branch**: `feature/004-devx-bundle-v1`
**Created**: 2026-05-24
**Status**: Draft
**Input**: Four-component DX improvement bundle: two-phase review flow, hermes wrapper command, doctor overhaul, AI Engineering Coach rules import.

## User Scenarios & Testing

### User Story 1 - Two-Phase Review for SpecKit Features (Priority: P1)

As a project maintainer running SpecKit features, I want a structured planning-PR-then-implementation-PR flow so that spec artifacts are reviewed and merged before any code is written, preventing spec churn during implementation.

**Why this priority**: Without this, specs and code interleave in the same branch, causing messy merges and unreviewed architectural decisions. This is the governance backbone.

**Independent Test**: Can be validated by creating a `specs/<slug>` branch, opening a PR with only spec files, running AI review, merging, then creating a `<slug>` branch for code — all without touching other components.

**Acceptance Scenarios**:

1. **Given** a SpecKit feature is started via `/speckit.start`, **When** the workflow creates the branch, **Then** it creates a `specs/<slug>` planning branch (NOT `feature/<slug>`) containing only `specs/<slug>/**` files.
2. **Given** a planning PR is open on branch `specs/<slug>`, **When** CI runs, **Then** only markdown lint, link check, and `/speckit.analyze` regen + verdict run (no full test suite).
3. **Given** the planning PR is merged, **When** `/speckit.implement` is invoked, **Then** a new `<slug>` implementation branch is created from main with the merged spec as reference.
4. **Given** an implementation PR is open on branch `<slug>`, **When** CI runs, **Then** full test suite, build, lint, type check, and re-validation of `/speckit.analyze` run.
5. **Given** during implementation the spec turns out wrong, **When** the developer patches the spec, **Then** they create a normal PR to main (treated as bug fix), not blocking the implementation branch.
6. **Given** a production hotfix (<50 LOC, fixes prod incident, has ticket reference), **When** the developer applies it, **Then** the two-phase flow is skipped (explicit carve-out in constitution).

---

### User Story 2 - Hermes CLI Wrapper (Priority: P1)

As a developer using the clai-helpers toolchain, I want a `clai-helpers hermes` subcommand that wraps the `hermes -z` invocation so I don't have to copy-paste magic invocation snippets every time I want to delegate work to Hermes Agent.

**Why this priority**: Eliminates a friction point for every Hermes invocation. High-frequency, high-value UX win.

**Independent Test**: Can be validated by running `clai-helpers hermes "test prompt"`, piping stdin, using `--from-file`, and verifying `--background` spawns a detached process with PID output.

**Acceptance Scenarios**:

1. **Given** hermes binary is on PATH, **When** user runs `clai-helpers hermes <prompt>`, **Then** the prompt is forwarded to hermes and hermes's exit code is returned.
2. **Given** hermes binary is on PATH, **When** user runs `clai-helpers hermes --from-file <path>`, **Then** the file contents are read and passed as the prompt to hermes.
3. **Given** piped input, **When** user runs `cat prompt.txt | clai-helpers hermes`, **Then** stdin is read and passed as the prompt.
4. **Given** `--background` flag, **When** user runs the command, **Then** hermes spawns detached, the command prints PID + log path (`.hermes-output-<timestamp>.log`), and exits 0 immediately.
5. **Given** `--model <name>` flag, **When** user runs the command, **Then** the model override is forwarded to hermes. Default: `glm/glm-5.1`, env override: `HERMES_DEFAULT_MODEL`.
6. **Given** `--provider <name>` flag, **When** user runs the command, **Then** the provider override is forwarded. Default: `custom`.
7. **Given** `--toolsets <csv>` flag, **When** user runs the command, **Then** the toolsets string is passed through to hermes.
8. **Given** hermes binary is NOT on PATH, **When** user runs the command, **Then** a clear install hint is printed and exit code is 127.
9. **Given** any hermes execution, **When** hermes exits, **Then** clai-helpers returns hermes's exit code.

---

### User Story 3 - Doctor Health Check Overhaul (Priority: P2)

As a developer setting up or troubleshooting the clai-helpers environment, I want a comprehensive `clai-helpers doctor` command that checks system requirements, tool availability, MCP connectivity, API key presence, and structural validity, outputting a colored status matrix.

**Why this priority**: Diagnostic tooling is essential for onboarding and debugging, but the existing `doctor` command only checks lock integrity. This can ship after the hermes wrapper since it's not blocking daily workflow.

**Independent Test**: Can be validated by running `clai-helpers doctor` and checking output format (colored table), `--json` output (valid JSON), and `--quiet` output (failures only).

**Acceptance Scenarios**:

1. **Given** the command is run, **When** system checks execute, **Then** node version (>=20.x), npm version, git version, and OS are reported.
2. **Given** the command is run, **When** CLI tool checks execute, **Then** gh CLI presence + auth status, hermes binary presence + version are reported.
3. **Given** the command is run, **When** MCP server checks execute, **Then** context7, filesystem MCP, github MCP, and sequential-thinking reachability are reported (or marked "unknown" if ping fails).
4. **Given** the command is run, **When** API key checks execute, **Then** existence (NOT values) of ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, GH_TOKEN, ZHIPU_API_KEY, and GLM_API_KEY is reported. For ZHIPU/GLM: both are checked; warning if only one present; critical fail only if both missing.
5. **Given** the command is run, **When** structural checks execute, **Then** `.claude/` subdirectory validity (commands/, agents/, skills/ exist; each .md has valid frontmatter with name + description; orphan skill references from agents are warned) is reported.
6. **Given** the command is run, **When** drift check executes, **Then** `clai-helpers status --strict` is invoked internally and its result is surfaced.
7. **Given** `--json` flag, **When** the command completes, **Then** output is machine-readable JSON with check results.
8. **Given** `--quiet` flag, **When** the command completes, **Then** only failures are printed.
9. **Given** any critical check fails, **When** the command exits, **Then** exit code is 1. Non-critical warnings do not affect exit code.

---

### User Story 4 - AI Engineering Coach Rules Import (Priority: P3)

As a project maintainer, I want to import the 45 anti-pattern rules from Microsoft's AI-Engineering-Coach repository into our code guardrails, so that our AI-generated code review checklist is comprehensive and benefits from Microsoft's curated expertise.

**Why this priority**: Content enrichment. Valuable but not blocking — existing guardrails work, this augments them.

**Independent Test**: Can be validated by checking that the imported rules appear in CLAUDE.md's guardrails section, the code-review-checklist skill, and the lint-and-validate skill, with proper attribution in docs/CREDITS.md.

**Acceptance Scenarios**:

1. **Given** the rules are imported, **When** a developer reads CLAUDE.md, **Then** the "AI-Generated Code Guardrails" section contains translated rules from AI-Engineering-Coach with anti-pattern name, why-it-bites description, and correct-pattern example.
2. **Given** the rules are imported, **When** a developer reads `.claude/skills/code-review-checklist/SKILL.md`, **Then** applicable rules augment the checklist.
3. **Given** the rules are imported, **When** a developer reads `.claude/skills/lint-and-validate/SKILL.md`, **Then** rules with automatable checks are included.
4. **Given** the rules are imported, **When** `npx clai-helpers sync` runs, **Then** the augmented content propagates to Copilot/Gemini targets.
5. **Given** the attribution requirements, **When** a developer checks `docs/CREDITS.md`, **Then** MIT license notice referencing microsoft/AI-Engineering-Coach is present.
6. **Given** license compliance, **When** a developer checks `vendor/AI-Engineering-Coach-LICENSE`, **Then** the MIT license file copy exists.

---

### Edge Cases

- What happens when `/speckit.start` is invoked on a repo with no initial commit? → Should abort with clear error: "Create an initial commit first."
- What happens when `specs/<slug>` branch already exists (stale from previous attempt)? → `/speckit.start` should detect and warn, offer to reuse or abort.
- What happens when hermes binary exists but segfaults during execution? → The wrapper returns hermes's non-zero exit code; `--background` mode should detect early failure (process exits within 2 seconds) and surface it.
- What happens when `doctor` is run in a directory without `.claude/`? → Structural checks report missing; other checks (system, CLI tools) still run. Exit code depends on criticality.
- What happens when a rule from AI-Engineering-Coach conflicts with an existing guardrail? → Existing guardrail takes precedence; imported rule is noted but not duplicated. Flag in CREDITS.md as "adapted".
- What happens when AI-Engineering-Coach repo structure changes or rules are added/removed? → Import is a one-time manual process; re-import is a separate task. Document the process in the spec for repeatability.

## Requirements

### Functional Requirements

- **FR-001**: SpecKit MUST create a planning branch named `specs/<slug>` for spec-only artifacts, reviewed via AI review gate (Principle VI) before merge.
- **FR-002**: SpecKit MUST create an implementation branch named `<slug>` (after planning PR merge) for code changes, reviewed via standard code review.
- **FR-003**: SpecKit MUST allow spec patches during implementation via normal PR to main without blocking the implementation branch (drift policy).
- **FR-004**: The constitution MUST include a hotfix carve-out: production hotfixes (<50 LOC, prod incident with ticket) skip the two-phase flow.
- **FR-005**: CI MUST run reduced checks (markdown lint, link check, analyze regen) on `specs/*` PRs and full checks (test, build, lint, type check) on `<slug>` PRs.
- **FR-006**: PR templates MUST be created at `.github/PULL_REQUEST_TEMPLATE/spec.md` and `.github/PULL_REQUEST_TEMPLATE/impl.md` with defined sections.
- **FR-007**: GitHub auto-cleanup MUST delete `specs/<slug>` branches after merge.
- **FR-008**: `/speckit.start` MUST create the `specs/<slug>` planning branch first; `/speckit.implement` MUST switch to `<slug>` implementation branch.
- **FR-009**: `clai-helpers hermes <prompt>` MUST forward the prompt to hermes binary and return hermes's exit code.
- **FR-010**: `clai-helpers hermes --from-file <path>` MUST read prompt from file.
- **FR-011**: `clai-helpers hermes` MUST accept piped stdin as prompt input.
- **FR-012**: `clai-helpers hermes --background` MUST spawn hermes detached, print PID + log path, exit 0 immediately.
- **FR-013**: `clai-helpers hermes --model <name>` MUST override model (default: `glm/glm-5.1`, env: `HERMES_DEFAULT_MODEL`).
- **FR-014**: `clai-helpers hermes --provider <name>` MUST override provider (default: `custom`).
- **FR-015**: `clai-helpers hermes --toolsets <csv>` MUST pass through toolsets to hermes.
- **FR-016**: `clai-helpers hermes --verbose` MUST pass through verbose flag.
- **FR-017**: `clai-helpers hermes` MUST detect hermes binary on PATH; if missing, print install hint and exit 127.
- **FR-018**: `clai-helpers doctor` MUST report system info (node >=20.x, npm, git, OS).
- **FR-019**: `clai-helpers doctor` MUST check CLI tools (gh auth status, hermes presence + version).
- **FR-020**: `clai-helpers doctor` MUST check MCP servers (context7, filesystem, github, sequential-thinking) for reachability.
- **FR-021**: `clai-helpers doctor` MUST check API key existence (ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, GH_TOKEN, ZHIPU_API_KEY, GLM_API_KEY) without reading or printing values. For ZHIPU/GLM: checks both `ZHIPU_API_KEY` AND `GLM_API_KEY`; warns if only one is present; fails critical only if BOTH are missing.
- **FR-022**: `clai-helpers doctor` MUST validate `.claude/` structural integrity (directories, frontmatter, orphan references).
- **FR-023**: `clai-helpers doctor` MUST invoke `clai-helpers status --strict` internally and surface results.
- **FR-024**: `clai-helpers doctor --json` MUST output machine-readable JSON.
- **FR-025**: `clai-helpers doctor --quiet` MUST output only failures.
- **FR-026**: `clai-helpers doctor` MUST exit 0 if all critical checks pass, 1 if any critical check fails. Non-critical warnings do not affect exit code.
- **FR-027**: The project MUST import 45 anti-pattern rules from microsoft/AI-Engineering-Coach (`src/core/rules/*.md`) translated to our format (anti-pattern name, why-it-bites, correct-pattern).
- **FR-028**: Imported rules MUST be appended to CLAUDE.md "AI-Generated Code Guardrails" section.
- **FR-029**: Applicable rules MUST augment `.claude/skills/code-review-checklist/SKILL.md`.
- **FR-030**: Automatable rules MUST augment `.claude/skills/lint-and-validate/SKILL.md`.
- **FR-031**: Attribution MUST be added to `docs/CREDITS.md` with MIT notice referencing microsoft/AI-Engineering-Coach.
- **FR-032**: A copy of the MIT license MUST be placed at `vendor/AI-Engineering-Coach-LICENSE`.
- **FR-033**: After content import, `npx clai-helpers sync` MUST propagate to Copilot/Gemini targets.

### Key Entities

- **PlanningBranch**: Git branch `specs/<slug>` containing only spec artifacts. Lifecycle: created by `/speckit.start`, reviewed via `/speckit.review`, merged to main.
- **ImplementationBranch**: Git branch `<slug>` containing code changes. Lifecycle: created by `/speckit.implement`, reviewed via `/code_review`, merged after planning branch.
- **HealthCheck**: Structured result with check name, category (system/tools/mcp/keys/structure/drift), status (pass/warn/fail/unknown), detail string.
- **HermesInvocation**: Configuration for a hermes subprocess: prompt source (arg/file/stdin), model, provider, toolsets, background flag.

## Assumptions

1. The two-phase review flow uses `specs/<slug>` and `<slug>` naming (no `feature/` prefix on planning branch, no prefix on impl branch). This differs from the current `feature/<N>-<slug>` convention — a deliberate change.
2. Hermes binary name is `hermes` on PATH (or `hermes.exe` on Windows). No custom binary path support in v1.
3. `--background` log files go to the current working directory as `.hermes-output-<timestamp>.log`.
4. MCP server health checks attempt a basic `tools/list` call via stdio protocol; if the server binary is not configured or not on PATH, the check marks "unknown" (not "fail").
5. API key environment variable names follow the standard convention: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GH_TOKEN`. ZHIPU/GLM keys: **doctor checks BOTH `ZHIPU_API_KEY` AND `GLM_API_KEY`, requires at least one present (warning if only one, fail-critical only if both missing)**. RESOLVED — no longer an assumption.
6. The imported rules from AI-Engineering-Coach are adapted (not verbatim copied) to match our format and Valera tone. The 45 rules are treated as advisory content, not executable code.
7. The `doctor` command replaces the existing lock-integrity-only implementation. The old behavior is subsumed under the new drift-check category.
8. `specs/<slug>` PR CI config will use path filters (`paths: ['specs/<slug>/**']`) to trigger reduced CI. Implementation PR CI will not have path filters.
9. The constitution amendment for Principle VIII (Two-Phase Review Flow) adds a new principle or extends the existing workflow section. The exact constitutional mechanism (new principle vs. amendment to existing) is an implementation detail.
10. `/speckit.start` branch naming convention change: planning branch is `specs/<slug>` (not `feature/<N>-<slug>`). The `feature/` prefix and `NNN-` numbering are dropped for the new flow. Existing features in flight keep their old branch names.

## Clarifications

### Session 2026-05-24

(No interactive clarification session was run — all ambiguities resolved via assumptions above. Non-critical items documented in Assumptions section.)

## Success Criteria

### Measurable Outcomes

- **SC-001**: A new SpecKit feature can go through the full planning PR → review → merge → implementation PR → review → merge flow with zero manual branch management beyond `/speckit.start` and `/speckit.implement`.
- **SC-002**: `clai-helpers hermes "test"` completes in under 2 seconds for prompt forwarding (excluding hermes execution time).
- **SC-003**: `clai-helpers doctor` completes all checks in under 10 seconds on commodity hardware.
- **SC-004**: `clai-helpers doctor --json` produces valid JSON parseable by `jq`.
- **SC-005**: All 45 AI-Engineering-Coach rules are represented in at least one of: CLAUDE.md guardrails, code-review-checklist skill, or lint-and-validate skill.
- **SC-006**: After import + sync, `clai-helpers status --strict` reports no drift between `.claude/` source and generated targets.
