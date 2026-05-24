# Requirements — UnderUndre AI Helpers

> **Canonical project requirements.** What the project must deliver and how it must behave.
> Companion: [`architecture.md`](architecture.md) — topography and data flow.
> Governance: [`../../.specify/memory/constitution.md`](../../.specify/memory/constitution.md) — binding principles enforce most of this.

## 1. Functional Requirements

### 1.1 CLI commands (`clai-helpers`)

| Command | Purpose | Consumer use case |
|---------|---------|-------------------|
| `init` | Fresh install: fetch source repo, write derived trees, create `helpers-lock.json` | First-time setup |
| `sync` | Re-fetch source, regenerate derived trees, update lock | Periodic upgrade |
| `sync --upgrade` | Bump pinned ref to latest release | Major upgrades |
| `status` / `status --strict` | Detect drift between source and derived trees | CI gate (exit 2 = drift) |
| `diff` | Show what `sync` would change | Pre-flight |
| `regen` | In-place regeneration for upstream-template repo (no source fetch) | This repo only |
| `add-target <id>` | Enable additional target (`copilot`/`gemini`/`agent`/`codex`/...) | Late opt-in |
| `remove-target <id>` | Remove target's outputs and entry from config | Drop a tool |
| `remove` | Remove all generated content + lock | Uninstall |
| `recover` | Roll back staged operation after crash | Cleanup after failure |
| `eject` | Stop being managed — keep current files, drop lock | Permanent fork |
| `list-transformers` | Discover available transformers | Diagnostic |
| `doctor` | Validate config + environment | Diagnostic |

### 1.2 Pipeline behavior

- **Idempotent**: `sync` / `regen` on unchanged source = byte-identical output. Tested via golden fixtures (`tests/fixtures/golden/`).
- **Atomic**: writes go through staging dir + journal. `recover` rolls back partial state.
- **Concurrency-safe**: process lock (`helpers-lock.pid`) prevents two simultaneous runs corrupting state.
- **Cross-platform**: paths via `pathe`. PowerShell + bash + Git Bash all supported.
- **Offline mode**: `--offline` skips network for `sync` (uses cache); `--prefer-offline` tries cache first.
- **Auth resolution order**: explicit `--auth` → `GH_TOKEN` env → `GIGET_AUTH` env → `gh auth token` subprocess.
- **Protected slots**: `<!-- HELPERS:CUSTOM START/END -->` survive every regen/sync (Constitution Principle III).

### 1.3 Source / target model

- `helpers.config.ts` (root) is **authoritative**. Loaded via `c12` (TS priority over JSON).
- `sources` = glob array. `targets` = map of `<id>` → `{ pipelines: [{ transformer, match, output, class? }] }`.
- Template variables in `output`: `{{relativePath}}`, `{{name}}`, `{{ext}}`, `{{subpath}}` (strips glob's non-wildcard prefix for mirror targets).
- Adding an AI tool = new transformer in `packages/cli/src/transformers/` + register + `helpers.config.ts` entry. **No new dir trees by hand** (Principle II).

## 2. Non-Functional Requirements

### 2.1 Tech stack constraints

- **Runtime**: Node.js ≥20 (enforced by `packages/cli/package.json#engines`).
- **Language**: TypeScript 5.7+, strict mode, **no `any`** (use `unknown` + narrowing).
- **Module system**: ESM only. `"type": "module"` is non-negotiable. No CommonJS fallback.
- **Distribution**: `dist/` compiled via `tsc`. `bin/helpers.mjs` is entry. Build enforced by `prepublishOnly`.
- **Tests**: Vitest unit + integration. Golden-fixture for every transformer.
- **Logging**: `consola` only. `console.log` banned (lint + review).
- **Paths**: `pathe` exclusively. Windows is primary dev environment; Git Bash compat required.
- **Scripts**: `.specify/scripts/powershell/*.ps1` is source of truth on Windows; bash ports alongside.
- **Dependencies**: minimal. Current core: `citty` (CLI), `consola` (log), `c12` + `defu` (config), `giget` (fetch), `pathe` (paths). Add new = new PR with justification.

### 2.2 Performance

- `init` / `sync` on this repo's `.claude/` (~300 source files) → ~735 derived files in <2s on commodity hardware (excluding network fetch).
- `status` (drift check) — purely local, <1s.
- Tests — full suite <10s.

### 2.3 Quality gates (before "done")

| Gate | Command | When |
|------|---------|------|
| Validate | `npm run validate` (`tsc --noEmit`) | After any TS edit |
| Test | `npm test` (vitest, all passing) | After any code edit |
| Build | `npm run build` (`tsc` to `dist/`) | Before publish |
| Drift | `npx clai-helpers status --strict` (consumer) **or** `regen + git diff --exit-code` (upstream) | After `.claude/` edit; CI gate |
| Constitution | `/speckit.analyze` PASS | Before `/speckit.implement` |
| Cross-AI Review (Principle VI) | ≥2 external reviewers PASS in `specs/<slug>/reviews/` | Before `/speckit.implement` |

`prepublishOnly` runs validate + test + build automatically on `npm publish`.

## 3. Operational Standards

### 3.1 Persona

**Valera** — senior plumber from Omsk turned IT architect. Blunt, expert, anti-sycophantic. Russian mat as punctuation. Token economy: no filler, no hedging, fragments OK. Catchphrases (1-3 per response max) opt-in via `persona-phrases` target.

Full base: [`../../.github/instructions/persona/copilot-instructions.md`](../../.github/instructions/persona/copilot-instructions.md).
Phrases pack: [`../../.github/instructions/persona/phrases/copilot-instructions.md`](../../.github/instructions/persona/phrases/copilot-instructions.md).

### 3.2 Workflow — Plumber's Loop

`Classify → Analyze → Spec → Plan → Execute → Verify → Reflect`. Defined in [`../../.github/instructions/coding/copilot-instructions.md`](../../.github/instructions/coding/copilot-instructions.md) §5, with **WRAP atomicity** (<500 LOC/change, refactor XOR feature) and **Chain of Verification** (tracer-bullet skeleton before flesh-out).

### 3.3 Standing Orders (MUST — see [`../../CLAUDE.md`](../../CLAUDE.md))

No commit/push/deploy without explicit user request. No package installs without approval. No `--force`/`--yes`. No secrets in code/commits/logs. No DB migrations executed directly. No destructive commands without triple consent. No reading `.env*` / `~/.ssh/`. No hand-edits to `package.json#version` (use `npm version` / `/bump`). No hand-edits to generated files.

### 3.4 Stop Conditions (MUST plan before code)

Change touches >3 files · ≥2 valid approaches · unsure about library API (→ check `context7` MCP) · ambiguous task (→ Interview Mode 3-5 questions) · about to delete/rename public API · confidence on a fact <0.85.

### 3.5 Commit conventions

Conventional Commits enforced by `commitlint`. Rules in [`../../.github/instructions/coding/git/copilot-instructions.md`](../../.github/instructions/coding/git/copilot-instructions.md). No co-author tags. English by default; Russian permitted in `.claude/commands/*.md` user-invokable aliases.

### 3.6 Versioning (Principle IV)

SemVer with **0.x-zone rules** until 1.0:
- Breaking change → MINOR (de facto major in 0.x).
- Feature → MINOR. Bugfix → PATCH.
- `chore:` / `docs:` / `refactor:` / `ci:` / `test:` / `build:` → **NO bump**.

Bump via `/bump` (loads `semver-versioning` skill). Never edit `package.json#version` by hand. Decision framework: [`../../.claude/skills/semver-versioning/SKILL.md`](../../.claude/skills/semver-versioning/SKILL.md).

### 3.7 Deep-thinking marker

45+ files in `.claude/commands/`, `.claude/agents/`, `.claude/skills/*/SKILL.md` carry `ultrathink` near the top — auto-engages maximum reasoning budget on load. **Do not strip.** Trivial / operational files (`commit`, `status`, `deploy`, `list`, `preview`) intentionally lack it.

## 4. Repository Rules

1. **`.claude/` is the source of truth.** Never edit derived trees by hand (Principle I).
2. **Hand-written exception**: `.github/instructions/{project,persona,coding}/` are consumed by Copilot directly, not generated.
3. **Tooling first.** Repeating task → `.claude/commands/*.md` + matching skill, not a one-off script. Slash commands transpile to Copilot prompts and Gemini TOML for free.
4. **DRY for instructions.** Cross-link to shared files; don't duplicate.
5. **Submodule boundary.** Pointer-only in parent repo. Content edits live in submodule commits.
6. **Add a transformer, not a fork** (Principle II). New target = new transformer + `helpers.config.ts` entry.
7. **Protected slots for project-specific overrides.** Consumer customization survives `sync` only inside `<!-- HELPERS:CUSTOM START/END -->`.
8. **`chore:` doesn't bump.** Editing `.claude/` is a template update, not a CLI code change. Real CLI feature → `feat(cli):` → minor bump.
9. **Russian + English both allowed** in command/skill descriptions and command aliases (`code_review.md`, `fix_from_review.md`). Commit messages: English by default.

## 5. Quick Reference — "Where do I…"

| Task | Where |
|------|-------|
| Add a slash command | `.claude/commands/<name>.md` → `helpers regen` |
| Add an agent | `.claude/agents/<name>.md` (frontmatter: `name`, `description`, `tools`, `skills`) |
| Add a skill | `.claude/skills/<name>/SKILL.md` (+ supporting files) |
| Add a target (e.g. Cursor) | New transformer in `packages/cli/src/transformers/` → register → `helpers.config.ts` |
| Change CLI behavior | `packages/cli/src/cli/<cmd>.ts` + tests in `packages/cli/tests/` |
| Change what's transpiled | `helpers.config.ts` (root) |
| Release CLI | `/bump` (semver-versioning skill) → user confirm → `npm publish` after approval |
| Update consumer config | Edit `.claude/`, commit, tag if desired. Consumers: `npx clai-helpers sync --upgrade` |
| Diagnose drift | `npx clai-helpers status --strict` (consumer) or `helpers regen + git diff` (upstream) |

## 6. See Also

- [`architecture.md`](architecture.md) — what's where.
- [`../../CLAUDE.md`](../../CLAUDE.md) — AI operating instructions.
- [`../../.specify/memory/constitution.md`](../../.specify/memory/constitution.md) — governance principles.
- [`../../.github/instructions/coding/copilot-instructions.md`](../../.github/instructions/coding/copilot-instructions.md) — universal coding standards (Standing Orders, Stop Conditions, anti-patterns).
- [`../../packages/cli/README.md`](../../packages/cli/README.md) — CLI user docs.
