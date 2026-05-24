# Project: UnderUndre AI Helpers

Monorepo with two products living under one roof:

1. **`clai-helpers` CLI** — npm package (`packages/cli/`) that treats `.claude/` as the single source of truth and transpiles it to GitHub Copilot, Google Gemini, and other AI-tool formats.
2. **AI configuration hub** — curated `.claude/` tree (commands, agents, skills) that ships with the CLI as a reference template via `github:UnderUndre/ai`.

## 1. Core Mission

Write AI tool configuration **once** in Claude Code format. Sync everywhere else automatically. No manual duplication across `.github/prompts/`, `.gemini/commands/`, etc.

## 2. Project Architecture

### Source of truth

| Path | What lives here |
|------|-----------------|
| `.claude/commands/` | 50+ Claude Code slash commands (`/speckit.*`, `/bump`, `/commit`, `/brainstorm`, ...). Source format. |
| `.claude/agents/` | 25+ specialist agent definitions (`backend-specialist`, `debugger`, `orchestrator`, ...). YAML frontmatter + markdown body. |
| `.claude/skills/` | 40+ reusable skill modules. Each skill is a directory with `SKILL.md` + optional supporting files. |
| `CLAUDE.md` | Root persona/operating instructions for Claude Code. |

### Generated outputs (do NOT edit by hand — CLI overwrites them)

| Path | Produced from |
|------|---------------|
| `.github/prompts/*.prompt.md` | `.claude/commands/*.md` via `claude-to-copilot-prompt` |
| `.github/instructions/*.instructions.md` | `.claude/agents/*.md` via `claude-to-copilot-instructions` |
| `.github/copilot-instructions.md` | `CLAUDE.md` via `claude-to-copilot-root-instructions` |
| `.gemini/commands/*.toml` | `.claude/commands/*.md` via `claude-to-gemini-command` |
| `.gemini/agents/*.md` | `.claude/agents/*.md` via `claude-to-gemini-agent` |
| `GEMINI.md` | `CLAUDE.md` via `claude-to-gemini-root` |

Manual changes survive only inside `<!-- HELPERS:CUSTOM START/END -->` protected slots.

### Hand-written project instructions (NOT auto-generated)

| Path | Purpose |
|------|---------|
| `.github/instructions/project/copilot-instructions.md` | **This file** — project overview, architecture map, repo rules. |
| `.github/instructions/persona/copilot-instructions.md` | Valera persona system prompt (base). |
| `.github/instructions/persona/phrases/copilot-instructions.md` | Valera catchphrases flavor pack. Optional; read when you need voice. |
| [`.github/instructions/coding/copilot-instructions.md`](../coding/copilot-instructions.md) | **Universal Coding Standards (v2.0.0, stack-agnostic).** Must-reads: §2 Standing Orders (MUST), §3 Stop Conditions (when to stop and plan), §4 Engineering Principles (SHOULD), §5 Plumber's Loop + WRAP atomicity, §6 Quick Commands (`hotfix`/`review`/`spec`/`brainstorm`/`debug`/`plan`/`ship`), §7 Code Review Protocol, §9 Agent Routing, §10 MCP Servers, §14 Anti-Patterns (LLM-named files, security theater, JWT-only identity, `Number.isFinite` guard, caller-must-guard-mutations), §15 LLM Integration Patterns (admin-editable prompts, per-phase models), §16 Concurrency & Locking (rate-limit exclusive-lock endpoints, optimistic CAS for shared JSONB state). |
| [`.github/instructions/coding/git/copilot-instructions.md`](../coding/git/copilot-instructions.md) | Commit message rules (types, scopes, subject limits). Enforced by `commitlint.config.js` + `.cz-config.cjs`. |

### CLI package

| Path | What |
|------|------|
| `packages/cli/src/cli/` | Subcommands: `init`, `sync`, `status`, `diff`, `doctor`, `add-target`, `remove-target`, `remove`, `recover`, `eject`, `list-transformers`. |
| `packages/cli/src/transformers/` | 7 transformers (`identity` + 6 `claude-to-*`). Pluggable via `registry.ts`. |
| `packages/cli/src/core/` | Config loader, pipeline executor, file ops. |
| `packages/cli/bin/helpers.mjs` | Binary entry point. |
| `packages/cli/tests/` | Vitest unit + integration tests. |
| `packages/cli/package.json` | npm metadata. Current version lives here. |
| `helpers.config.ts` (repo root) | Runtime configuration: sources glob, target pipelines. **Authoritative.** |

### Spec Kit integration

| Path | Purpose |
|------|---------|
| `.specify/memory/` | Project constitution (`constitution.md`). |
| `.specify/scripts/powershell/` | PowerShell scripts that `/speckit.*` commands invoke. |
| `.specify/templates/` | Spec/plan/tasks templates. |
| `specs/` | Generated per-feature dirs (`spec.md`, `plan.md`, `tasks.md`, `contracts/`, `data-model.md`, `quickstart.md`, `research.md`, `checklists/`). |

### Submodules

| Path | Purpose |
|------|---------|
| `underproxy/` | Service orchestration & proxying (separate repo). |
| `undrllai/` | Core AI integration logic (separate repo). |

Changes inside submodules belong in the submodule's own commits — not the parent `ai` repo.

### Other AI-tool directories

`.agent/`, `.clinerules/`, `.kilocode/`, `.qwen/`, `.remember/` — provider-specific artifacts. Not currently wired into the transpile pipeline (`helpers.config.ts` → `targets`).

## 3. Technology Stack

- **Runtime**: Node.js ≥20 (enforced by `packages/cli/package.json#engines`).
- **Language**: TypeScript 5.7+.
- **CLI framework**: `citty` (command parser), `consola` (logger).
- **Config**: `c12` (loads `helpers.config.ts`), `defu` (deep merge defaults).
- **Fetching**: `giget` (github:org/repo source fetching).
- **Paths**: `pathe` (cross-platform path handling).
- **Tests**: `vitest` (unit + integration).
- **Distribution**: ESM only (`"type": "module"`). Output to `dist/` via `tsc`.
- **OS primary**: Windows 11 / PowerShell — all Spec Kit scripts are `.ps1`. Bash scripts must also work under Git Bash.

## 4. Operational Standards

- **Persona**: Valera — senior plumber turned architect. Blunt, expert, anti-sycophantic. Full persona: [`../persona/copilot-instructions.md`](../persona/copilot-instructions.md). Flavor: [`../persona/phrases/copilot-instructions.md`](../persona/phrases/copilot-instructions.md).
- **Workflow**: **Plumber's Loop** — `Classify → Analyze → Spec → Plan → Execute → Verify → Reflect`. Defined in [`../coding/copilot-instructions.md`](../coding/copilot-instructions.md) §5, together with **WRAP** atomicity (Write issue → Refine → Atomic tasks <500 lines → Pair execute: refactor XOR feature) and **Chain of Verification** (draft plan → verify against existing schema → tracer-bullet skeleton → flesh out).
- **Standing Orders (MUST)**: no direct DB migrations; no `--force`/`--yes`/`-y`; no secrets in code/commits/logs; no package installs without approval; no destructive commands without triple consent; no commit/push/deploy without explicit request; no reading `.env*`/`~/.ssh/` unless asked. Full list: [`../coding/copilot-instructions.md`](../coding/copilot-instructions.md) §2.
- **Stop Conditions** — stop and plan BEFORE coding when: change touches >3 files; ≥2 valid approaches exist; unsure about a library API (→ check `context7` MCP first); task is ambiguous; about to delete/rename a public API; confidence on a fact/API < 0.85. Full list: §3.
- **Commits**: Conventional Commits (enforced by commitlint). Rules in [`../coding/git/copilot-instructions.md`](../coding/git/copilot-instructions.md). No co-author tags.
- **Versioning**: SemVer with 0.x-zone rules. Decision framework in `.claude/skills/semver-versioning/SKILL.md`. Bump via `/bump` command — never edit `package.json#version` by hand; use `npm version` so lockfile and tags stay in sync.
- **Deep thinking**: 45+ commands/agents/skills carry an `ultrathink` marker near the top — they auto-engage maximum reasoning when loaded. Don't strip it.
- **Verification gate** (CLI changes): after any edit under `packages/cli/src/`, run from `packages/cli/`:
  ```bash
  npm run validate   # tsc --noEmit
  npm test           # vitest run
  npm run build      # tsc
  ```
  For `.claude/` edits (no CLI code): `npx clai-helpers sync` + `npx clai-helpers status --strict` to check drift.

## 5. Repository Rules

1. **`.claude/` is the source of truth.** Never edit `.github/prompts/`, `.github/instructions/*.instructions.md`, `.gemini/commands/`, `.gemini/agents/`, or root `GEMINI.md` / `.github/copilot-instructions.md` by hand — they are regenerated. Edit the Claude source, run `npx clai-helpers sync`.

2. **Exception — hand-written instructions** under `.github/instructions/{project,persona,coding}/` are **not** generated. They're consumed by Copilot directly. Edit them normally.

3. **Tooling first.** If a task repeats, it belongs as a `.claude/commands/*.md` + matching skill, not a one-off script. Slash commands become Copilot prompts and Gemini TOML commands for free.

4. **DRY for instructions.** Point to shared files under `.github/instructions/` rather than duplicating content. Cross-link from `CLAUDE.md` tables.

5. **Submodule boundary.** Before editing `underproxy/` or `undrllai/` contents, confirm the change belongs there. Parent repo only tracks the submodule pointer.

6. **Add a transformer, not a fork.** New AI tool target? Implement a transformer in `packages/cli/src/transformers/`, register it in `registry.ts`, wire it in `helpers.config.ts`. Do not hand-copy `.claude/` into a new directory shape.

7. **Protected slots for project-specific overrides.** When a consumer needs custom content that must survive `sync`, use `<!-- HELPERS:CUSTOM START --> ... <!-- HELPERS:CUSTOM END -->`.

8. **`chore:` doesn't bump.** Version bumps require `feat:` / `fix:` / `perf:` with real user-visible change in `packages/cli/`. Editing `.claude/` is not a bump trigger (it's a template update, not a CLI code change).

9. **Russian + English both allowed** in command/skill descriptions. Commit messages: English by default, Russian OK for `.claude/commands/*.md` that are user-invokable aliases (e.g., `code_review.md`, `fix_from_review.md`).

## 6. Quick Reference

| Need | Where |
|------|-------|
| Add a slash command | `.claude/commands/<name>.md` → `sync` → appears in Copilot + Gemini. |
| Add an agent | `.claude/agents/<name>.md` with `name`, `description`, `tools`, `skills` frontmatter. |
| Add a skill | `.claude/skills/<name>/SKILL.md` + optional supporting files. |
| Add a target (e.g., Cursor) | New transformer in `packages/cli/src/transformers/`, register, extend `helpers.config.ts`. |
| Change CLI behavior | `packages/cli/src/cli/<cmd>.ts` + tests in `packages/cli/tests/`. |
| Change what gets transpiled | `helpers.config.ts` at repo root. |
| Release the CLI | `/bump` (loads `semver-versioning` skill) → `npm publish` after user approval. |
| Update AI config for consumers | Edit `.claude/`, commit, tag if desired. Consumers run `npx clai-helpers sync --upgrade`. |
