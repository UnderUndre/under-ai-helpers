# Feature Specification: Ecosystem Parity — Packaging, Enforcement & Quality Gates

**Feature Branch**: `006-ecosystem-parity`
**Created**: 2026-06-10
**Status**: Draft
**Input**: User description: "006 — напиши все пункты в новую спеку" — capture all six gaps identified in the 2026 ecosystem comparison (plugin marketplace packaging, harness-enforced guard hooks, permission presets, skill trigger evals, native SKILL.md distribution, statusline preset) as one feature.

## Context

A June 2026 comparison of this repo against the Claude Code ecosystem (anthropics/skills, claude-plugins-official, obra/superpowers, wshobson/agents, davila7/claude-code-templates, disler/claude-code-hooks-mastery) concluded: **content coverage is ahead of the field, but distribution and enforcement infrastructure lags behind**. Six gaps, in priority order:

1. No plugin/marketplace packaging — distribution is file-copying via CLI; consumers get the entire template (27 agents, ~70 commands, ~50 skills) whether they need it or not.
2. Guard hooks are thin (3 hooks) — Standing Orders (#3 no bypass flags, #6 no destructive commands, #7 no secret reads) exist only as prompt text, not harness enforcement.
3. No permission presets — no allow-list for routine operations, no deny-list for secrets/destructive actions.
4. No skill evals — ~50 skills ship with zero verification that they trigger correctly.
5. Transpiler converts skills for targets that now read the open SKILL.md standard natively — wasted maintenance surface.
6. No statusline preset.

## Clarifications

### Session 2026-06-10

- Q: Status of the plugin/marketplace channel relative to the existing npm CLI? → A: Plugin channel is **primary for Claude Code** consumers; CLI remains canonical for all other targets and file-based installs.
- Q: Pack partitioning scheme? → A: **By domain**, mirroring the Agent Routing table (~6–8 packs, e.g., devx-core, spec-pipeline, security, frontend, backend, testing, mobile/game, docs); an agent travels with its skills and commands.
- Q: Guard enforcement policy? → A: **Hard deny by default with per-invocation user override** — blocked action proceeds only after explicit user confirmation of that specific invocation; defaults are never weakened.
- Q: Skill eval rollout? → A: **Ratchet** — CI gate on new/changed skills from day one, plus backfill of the top-10 most-used skills within this feature; 100% catalog coverage is a follow-up milestone, not a release blocker.
- Q: Legacy consumer migration support? → A: **CLI-assisted** — a migration command detects copied legacy components, proposes matching packs, and removes duplicates after user confirmation; not docs-only.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install curated packs from a plugin marketplace (Priority: P1)

A developer setting up a consumer repo adds this repository as a plugin marketplace and installs only the packs relevant to their project (e.g., the spec-pipeline pack and the security pack). Only the installed packs' agents, commands, and skills become active in their AI tool — not the full template.

**Why this priority**: Distribution is the core product of this repo. The ecosystem standard moved from "copy files" to "install plugins"; full-template installs bloat consumer context and bury relevant components under irrelevant ones.

**Independent Test**: In a fresh consumer repo, add the marketplace, install exactly one pack, and verify (a) the pack's components are active, (b) components from other packs are absent, (c) no manual file copying occurred.

**Acceptance Scenarios**:

1. **Given** a fresh consumer repo with no prior template install, **When** the user adds the marketplace and installs a single pack, **Then** only that pack's agents/commands/skills are available and the rest of the catalog is not loaded.
2. **Given** an installed pack, **When** the user lists installed plugins, **Then** the pack appears with its name and version.
3. **Given** a consumer repo with a legacy full-template install (CLI file copies), **When** the user runs the CLI-assisted migration, **Then** copied components are detected, matching packs are proposed, and duplicates are removed after user confirmation — no duplicate or conflicting components remain.
4. **Given** a pack that depends on components of another pack, **When** the user installs it, **Then** the dependency is either resolved automatically or the install fails with an explicit message — never a silent broken reference.

---

### User Story 2 - Standing Orders enforced by the harness, not by prompt goodwill (Priority: P1)

An AI agent session (or a careless human) attempts a destructive command (`rm -rf`, `git push --force`, a `--yes`/`--force` bypass flag) or tries to read a secret file (`.env`, SSH keys). The harness blocks the action before execution and explains why, regardless of what the model "remembered" from its prompt.

**Why this priority**: Standing Orders #3/#6/#7 are MUST-level rules, but today they are advisory prompt text — a model under context pressure can and will forget them. Harness-level guards are deterministic.

**Independent Test**: In a sandbox repo with the template installed, run a scripted suite of violation attempts (destructive commands, bypass flags, secret reads); every attempt must be blocked with a human-readable reason.

**Acceptance Scenarios**:

1. **Given** a repo with the template installed, **When** an agent attempts a destructive command, **Then** the command is blocked before execution and the reason is reported to the session.
2. **Given** the same repo, **When** an agent attempts to read a secret file, **Then** the read is denied.
3. **Given** the same repo, **When** an agent completes a file edit, **Then** automated format/lint feedback runs without being asked.
4. **Given** a blocked action the user actually intended, **When** the user explicitly confirms that specific invocation, **Then** the action can proceed without permanently weakening the default guard.

---

### User Story 3 - Permission presets out of the box (Priority: P2)

A developer installs the template and immediately gets a sane permission profile: routine read-only operations (tests, type-checks, status queries) run without permission prompts, while secret reads and destructive operations are pre-denied.

**Why this priority**: Complements US2 (deny side) and removes friction (allow side). Fewer prompts = fewer reflexive "allow all" decisions by users, which is itself a security win.

**Independent Test**: Run a scripted routine dev session (test, build, lint, git status) before and after preset install; count permission prompts and verify denied operations.

**Acceptance Scenarios**:

1. **Given** a consumer repo with presets installed, **When** an agent runs routine read-only project commands, **Then** no permission prompts appear for those operations.
2. **Given** the same repo, **When** an agent attempts an operation on the deny-list, **Then** it is denied without user interaction.

---

### User Story 4 - Skill evals as a CI quality gate (Priority: P2)

A maintainer edits a skill (description, structure, or content). CI runs trigger evals — representative user phrases that must activate the right skill — and fails if a change breaks triggering or routing.

**Why this priority**: ~50 skills with zero verification means every edit is a blind change. Pipes without pressure testing.

**Independent Test**: Introduce a deliberately broken skill description in a branch; CI eval job must fail. Revert; CI must pass.

**Acceptance Scenarios**:

1. **Given** the eval suite, **When** run against the gated set (new/changed skills plus the backfilled top-10), **Then** every skill in that set has at least one passing trigger eval.
2. **Given** a skill edit that breaks triggering, **When** CI runs, **Then** the eval job fails and names the regressed skill.
3. **Given** eval nondeterminism, **When** a single eval run flakes, **Then** the retry/threshold policy distinguishes flake from regression.

---

### User Story 5 - Native SKILL.md distribution where supported (Priority: P3)

Targets that consume the open SKILL.md standard natively (Codex, Cursor, Gemini CLI, Antigravity) receive skills unchanged; format conversion is maintained only for targets that lack native support. Drift checking covers both delivery paths.

**Why this priority**: Reduces transpiler maintenance surface and conversion bugs, but nothing is broken today — pure efficiency gain.

**Independent Test**: Run regeneration; verify native-standard targets receive skills byte-identical to source, legacy targets remain functionally unchanged, and the drift check passes for both.

**Acceptance Scenarios**:

1. **Given** a target with native SKILL.md support, **When** sync/regen runs, **Then** skills are delivered unchanged from source (no format conversion).
2. **Given** a target without native support, **When** sync/regen runs, **Then** converted output is produced exactly as before.
3. **Given** any delivery path, **When** the strict drift check runs, **Then** it detects mismatches in both native and converted artifacts.

---

### User Story 6 - Statusline preset (Priority: P3)

A developer installs the statusline preset and sees session vitals (model, git branch, context usage) at a glance during every session.

**Why this priority**: Quality-of-life; default equipment in the ecosystem, one-hour job, lowest stakes.

**Independent Test**: Install preset in a consumer repo; statusline renders model, branch, and context usage in a live session.

**Acceptance Scenarios**:

1. **Given** a consumer repo, **When** the statusline preset is installed, **Then** the status line displays model, branch, and context usage.

---

### Edge Cases

- Legacy consumer repo already contains copied template files; pack install must not create duplicates or ambiguous precedence (migration/dedupe behavior required).
- An agent in pack A references a skill that lives in pack B which is not installed — cross-pack dependencies must be declared and resolved, or packs must be self-contained.
- Consumer machine is Windows without a POSIX shell — guard hooks must still enforce (current hooks are bash-only).
- Permission/guard pattern false-positives: a deny pattern matching inside a quoted string or a legitimate filename must not block safe operations.
- The user genuinely intends a normally-blocked action (e.g., deliberate force-push to own fork) — explicit per-invocation override path without weakening defaults.
- Eval flakiness: model nondeterminism must not produce noisy CI failures (threshold/retry policy).
- Version skew: pack version vs CLI version vs template content version — a consumer must be able to tell which versions they run and whether they drift.
- Marketplace install attempted from a tool that has no plugin support — clear fallback message pointing to the CLI path.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST be consumable as a plugin marketplace exposing independently installable packs of curated content.
- **FR-002**: The curated catalog (agents, commands, skills, hooks, presets) MUST be partitioned into domain-based packs mirroring the Agent Routing taxonomy (~6–8 packs; an agent is bundled with its skills and commands); installing a pack MUST activate only that pack's components.
- **FR-003**: Each pack MUST declare its version and any cross-pack dependencies; installation MUST resolve declared dependencies or fail with an explicit message.
- **FR-004**: Existing CLI distribution flows (init, sync, status/drift, regen) MUST continue to work unchanged for targets and consumers not using the plugin channel.
- **FR-005**: Destructive command attempts (Standing Orders #3/#6 categories: destructive deletions, force operations, confirmation-bypass flags) MUST be blocked at harness level before execution, with a human-readable reason. The only escape hatch is an explicit per-invocation user confirmation of that specific action; overrides MUST NOT persist beyond the single invocation or weaken the default policy.
- **FR-006**: Secret-file read attempts (Standing Order #7 categories: env files, key material) MUST be denied at harness level.
- **FR-007**: Completed file modifications MUST trigger automated format/lint feedback at harness level without user request.
- **FR-008**: The template MUST ship permission presets: an allow-list covering routine read-only project operations and a deny-list covering secrets and destructive operations.
- **FR-009**: Skill trigger evals (representative phrase → expected skill activation) MUST gate CI for every new or modified skill from this feature's release onward; the top-10 most-used existing skills MUST be backfilled within this feature. Full catalog coverage is a tracked follow-up milestone. CI MUST fail when an eval regresses.
- **FR-010**: Skills MUST be delivered unchanged (open SKILL.md standard) to targets with native support; format conversion MUST be retained only for targets lacking native support.
- **FR-011**: A statusline preset (model, branch, context usage) MUST be shipped as an installable component.
- **FR-012**: The strict drift check MUST cover all new artifact classes introduced by this feature (pack manifests, guard rules, permission presets, eval definitions, statusline preset).
- **FR-013**: Guard and feedback hooks MUST function on Windows, macOS, and Linux consumer machines.
- **FR-014**: A CLI-assisted migration MUST detect legacy copied components in a consumer repo, propose the matching packs, and remove duplicates only after user confirmation; migration MUST be re-runnable and MUST NOT delete consumer-authored customizations.

### Key Entities

- **Pack**: A named, versioned, installable unit grouping agents, commands, skills, hooks, and presets around a theme; declares cross-pack dependencies.
- **Marketplace manifest**: The catalog document listing available packs, their versions, and descriptions; the consumer-facing entry point.
- **Guard rule**: A harness-enforced policy entry — trigger event, match pattern, action (block/deny/feedback), and explanation message.
- **Permission preset**: A shippable allow/deny profile applied to a consumer repo's tool-permission configuration.
- **Skill eval case**: A representative input phrase paired with the skill expected to activate, plus pass/fail thresholds.
- **Target capability matrix**: A record of which downstream tool consumes which artifact format natively vs via conversion; drives delivery-path selection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new consumer goes from zero to a working installed pack in under 5 minutes with no manual file copying.
- **SC-002**: 100% of scripted Standing-Order-violation attempts (destructive commands, bypass flags, secret reads) are blocked in the test suite — versus 0% harness-enforced today.
- **SC-003**: Context footprint of installed configuration for a single-pack consumer is at least 50% smaller than today's full-template install.
- **SC-004**: At release: 100% of new/changed skills are eval-gated and the top-10 most-used skills have passing trigger evals; 100% catalog coverage reached by the follow-up milestone.
- **SC-005**: The number of maintained format-conversion paths for skills drops by at least half.
- **SC-006**: Permission prompts during a scripted routine dev session drop by at least 70% with presets installed.

## Assumptions

- The plugin/marketplace channel is **primary for Claude Code** consumers (docs lead new CC consumers through plugin install); the npm CLI remains the canonical path for non-plugin targets (Copilot, Gemini, Cline, Roo, Kilo, Qwen) and for consumers preferring file-based installs. *(Confirmed in Clarifications 2026-06-10.)*
- Pack partitioning follows the existing agent-routing domains (e.g., spec-pipeline, security, frontend, backend, devx-core) rather than inventing a new taxonomy.
- Guards default to **hard deny** (Standing Orders are MUST-level), with explicit per-invocation override as the only escape hatch — mirroring Standing Order #3's "stop, ask user".
- Evals run in CI on skill-affecting changes (not on every commit) to control cost; a scheduled full run guards against silent drift.
- The empty `specs/006-` directory found in the repo was an accidental artifact and was removed as part of creating this spec.
- Analytics/observability dashboards are **out of scope** — `underboard` already covers task/memory infrastructure; orchestration is `undrestrator`'s domain.
- No new content (agents/skills/commands) is authored in this feature — it is packaging, enforcement, and quality infrastructure for existing content.

## Out of Scope

- Authoring new agents, skills, or commands.
- Analytics/usage dashboards (covered by `underboard`).
- Swarm/multi-agent orchestration changes (covered by `undrestrator`).
- Rewriting the CLI's existing transpile logic for commands/agents/rules (only the skill delivery path changes).
