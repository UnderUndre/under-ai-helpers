# Architecture — UnderUndre AI Helpers

> **Canonical project architecture.** Read this first to understand topography and data flow.
> Companion: [`requirements.md`](requirements.md) — what the project must deliver.
> AI operating instructions: [`../../CLAUDE.md`](../../CLAUDE.md) — how Claude/Copilot/Gemini behave inside this repo.
> Governance: [`../../.specify/memory/constitution.md`](../../.specify/memory/constitution.md) — binding principles.

## 1. Mission

A monorepo with two products under one roof:

1. **`clai-helpers` CLI** (`packages/cli/`) — npm package that treats `.claude/` as the single source of truth and transpiles it to GitHub Copilot, Google Gemini, Antigravity, Codex Desktop, and other AI-tool formats.
2. **AI configuration hub** — curated `.claude/` tree (commands, agents, skills) that ships with the CLI as a reference template via `github:UnderUndre/ai`.

Write AI tool configuration **once** in Claude Code format. Sync everywhere else automatically. No manual duplication across `.github/prompts/`, `.gemini/commands/`, `.agent/workflows/`, `.agents/commands/`, etc.

## 2. Source of Truth

Authoritative content. Edits start here.

| Path | What lives here |
|------|-----------------|
| `.claude/commands/` | 50+ Claude Code slash commands (`/speckit.*`, `/bump`, `/commit`, `/brainstorm`, ...). |
| `.claude/agents/` | 27+ specialist agent definitions (`backend-specialist`, `debugger`, `orchestrator`, ...). YAML frontmatter + markdown body. |
| `.claude/skills/` | 40+ reusable skill modules. Each = directory with `SKILL.md` + optional supporting files. |
| `CLAUDE.md` | Root persona/operating instructions for Claude Code. Cross-links to coding standards, persona, and this spec. |
| `helpers.config.ts` | Authoritative pipeline configuration: `sources` glob + `targets` map (transformer + match + output) + `packs` section (pack membership mapping + marketplace metadata, feature 006). |
| `.claude/hooks/*.mjs` | Harness-enforced guard hooks (destructive-command ask-gate, secret-read deny, post-edit lint feedback) — Node, cross-platform (feature 006). |
| `presets/` | Shippable permission preset (`permissions.json`) + statusline script (`statusline.mjs`), applied to consumer settings via `helpers presets apply` (feature 006). |
| `.claude/skills/<name>/evals.json` | Co-located skill trigger eval cases; CI ratchet gate via `scripts/skill-evals.mjs` + `.github/workflows/skill-evals.yml` (feature 006). |
| `.specify/` | SpecKit pipeline scripts + templates + `memory/constitution.md` (governance). |

## 3. Generated Outputs

Produced by `clai-helpers regen` (upstream) or `clai-helpers sync` (consumer). **Never edit by hand** (Constitution Principle I) — overwritten on next regeneration. Manual customization only inside `<!-- HELPERS:CUSTOM START/END -->` slots (Principle III).

| Target | Path | Produced from | Transformer |
|--------|------|---------------|-------------|
| Copilot | `.github/prompts/*.prompt.md` | `.claude/commands/*.md` | `claude-to-copilot-prompt` |
| Copilot | `.github/instructions/<agent>.instructions.md` | `.claude/agents/*.md` | `claude-to-copilot-instructions` |
| Copilot | `.github/copilot-instructions.md` | `CLAUDE.md` | `claude-to-copilot-root-instructions` |
| Gemini | `.gemini/commands/*.toml` | `.claude/commands/*.md` | `claude-to-gemini-command` |
| Gemini | `.gemini/agents/*.md` | `.claude/agents/*.md` | `claude-to-gemini-agent` |
| Gemini | `GEMINI.md` (root) | `CLAUDE.md` (+ phrases + coding) | `claude-to-gemini-root` |
| Antigravity | `.agent/agents/**`, `.agent/skills/**`, `.agent/workflows/**` | `.claude/{agents,skills,commands}/**` | `identity` (mirror) |
| Codex Desktop | `.agents/commands/*.md` | `.claude/commands/*.md` | `identity` |
| Codex Desktop / Antigravity | `AGENTS.md` (root) | `CLAUDE.md` | `identity` |
| Speckit (mirror) | `.specify/**` | `.specify/**` | `identity` |
| Persona phrases (opt-in) | `.github/instructions/persona/phrases/**` | self | `identity` |
| Plugin marketplace | `.claude-plugin/marketplace.json` | `helpers.config.ts#packs` | pack assembler (feature 006) |
| Packs (8 domain plugins) | `packs/<pack-id>/**` | `.claude/{agents,commands,skills,hooks}/**` + `presets/` per membership mapping | pack assembler, `identity` content copy (feature 006) |

Pipeline registry: `packages/cli/src/transformers/registry.ts`. Adding a new AI-tool target = new transformer + entry in `helpers.config.ts` (Principle II).

## 4. Hand-Written (NOT auto-generated)

The exception. Files Copilot consumes directly, never sourced from `.claude/`.

| Path | Purpose |
|------|---------|
| `.github/instructions/coding/copilot-instructions.md` | Universal Coding Standards (v2.0.0, stack-agnostic). Standing Orders, Stop Conditions, Plumber's Loop, anti-patterns. |
| `.github/instructions/coding/git/copilot-instructions.md` | Commit message rules. Enforced by `commitlint.config.js` + `.cz-config.cjs`. |
| `.github/instructions/persona/copilot-instructions.md` | Valera persona base. |
| `.github/instructions/persona/phrases/copilot-instructions.md` | Valera catchphrases (opt-in via `persona-phrases` target). |
| `.github/instructions/project/copilot-instructions.md` | **Redirect to this file + [`requirements.md`](requirements.md).** |
| `README.md` / `README.ru.md` | User-facing onboarding. |
| `CONTRIBUTING.md` | Contributor guidelines. |

## 5. CLI Package Layout

`packages/cli/` — the npm-published artifact (`clai-helpers`).

| Path | What |
|------|------|
| `src/cli/` | Subcommands: `init`, `sync`, `status`, `diff`, `regen`, `doctor`, `add-target`, `remove-target`, `remove`, `recover`, `eject`, `list-transformers`, `migrate` (legacy → packs, feature 006), `presets` (apply permission/statusline presets, feature 006). |
| `src/transformers/` | 7+ transformers (`identity` + `claude-to-*`). Pluggable via `registry.ts`. Skill delivery is `identity` for targets with native SKILL.md support — see `docs/target-capabilities.md` (feature 006). |
| `src/core/packs/` | Pack assembler: membership validation (existence, single ownership, cross-pack dependency DAG), pack tree + `marketplace.json` generation (feature 006). |
| `src/core/` | Config loader (`c12`), pipeline executor, file ops, fetch (giget), hash, slots, journal, drift detection. |
| `bin/helpers.mjs` | Binary entry point. Calls `runCli()` from `dist/cli.js`. |
| `tests/unit/` | Unit tests (transformers, core modules, slots). |
| `tests/integration/` | Integration tests (init, sync, regen, drift, version-pinning, concurrency, recovery). |
| `tests/fixtures/golden/` | Golden-fixture tests for every transformer (Principle II corollary). |
| `package.json` | npm metadata. Version lives here, bumped only via `npm version` / `/bump` (Principle IV). `prepublishOnly` runs validate + test + build. |

## 5.1 Memory Board Service Layout

`packages/underboard/` — standalone MCP tool server (`underboard`) for agent task board + shared semantic memory. Independently versioned from `clai-helpers`.

| Path | What |
|------|------|
| `src/server/` | MCP server (stdio + SSE transport), HTTP server (dashboard + health), tool registry. |
| `src/storage/` | SQLite (better-sqlite3) stores: project, task, memory, event. Migrations. sqlite-vec + FTS5 for retrieval. |
| `src/embedding/` | ONNX Runtime wrapper + all-MiniLM-L6-v2 model auto-download. |
| `src/retrieval/` | Hybrid retrieval: BM25 (FTS5) + cosine (sqlite-vec) score fusion. |
| `src/project/` | CWD → project ID detector (Git root / `.under-project` marker). |
| `src/events/` | In-process event bus for SSE push to dashboard clients. |
| `src/tools/` | MCP tool implementations: memory (write, recall, cross-project, list, delete), tasks (create, update, list, assigned, archive), activity log. |
| `src/cli/` | Commander CLI: start, stop, status, export, import. |
| `dashboard/` | Static HTML/CSS/JS SPA (vanilla, no build step). Kanban board, memory feed, activity log. |
| `tests/` | Unit + integration tests (vitest). |
| Spec: `specs/005-agents-board-and-memory/` | Feature spec, plan, data model, contracts. |

## 6. SpecKit Integration

| Path | Purpose |
|------|---------|
| `.specify/memory/constitution.md` | Governance: principles + workflow + amendments. Loaded by `/speckit.plan` Constitution Check gate. |
| `.specify/scripts/{powershell,bash}/` | Scripts that `/speckit.*` commands invoke. PowerShell is source of truth on Windows; bash ports for *nix parity. |
| `.specify/templates/` | Spec / plan / tasks / checklist templates. |
| `specs/<feature-slug>/` | Per-feature artifacts: `spec.md`, `plan.md`, `tasks.md`, `contracts/`, `data-model.md`, `quickstart.md`, `research.md`, `checklists/`, `reviews/<provider>.md`. Active: `specs/006-ecosystem-parity/` — marketplace packaging, guard hooks, permission presets, skill evals, native SKILL.md delivery, statusline, dialog archive. |
| `specs/main/` | **This directory.** Project-wide architecture + requirements (canonical, not feature-scoped). |

Stage tags (Principle VII): `<stage>/<slug>/v<N>` — created by `snapshot-stage.{sh,ps1}`, idempotent via `--points-at HEAD`. `/speckit.diff` and `/speckit.retrospective` read these tags.

## 7. Submodules

| Path | Purpose |
|------|---------|
| `underproxy/` | Service orchestration & proxying (separate repo). |
| `undrllai/` | Core AI integration logic (separate repo). |

`.gitmodules` has `ignore = dirty` to suppress working-tree noise; pointer drift still surfaces. Changes inside submodules belong in the submodule's own commits — not the parent repo (except pointer bumps).

## 8. Other AI-Tool Directories

`.clinerules/`, `.kilocode/`, `.qwen/`, `.remember/` — provider-specific artifacts not currently wired into the transpile pipeline. Add via new transformer + `helpers.config.ts` entry if needed (Principle II).

## 9. Data Flow

```
                     ┌─────────────────┐
        edit         │   .claude/**    │           edit
        ─────────►   │   CLAUDE.md     │   ◄─────────
                     │   helpers.config│
                     └────────┬────────┘
                              │
                  helpers regen (upstream)  /  helpers sync (consumer)
                              │
        ┌─────────────────────┼─────────────────────────┐
        ▼                     ▼                         ▼
  ┌──────────┐        ┌──────────────┐          ┌──────────────┐
  │ .github/ │        │   .gemini/   │          │   .agent/    │
  │ prompts/ │        │   commands/  │          │   .agents/   │
  │ instr/   │        │   agents/    │          │   AGENTS.md  │
  │ copilot- │        │   GEMINI.md  │          │              │
  │ instr.md │        │              │          │              │
  └──────────┘        └──────────────┘          └──────────────┘
   (Copilot)             (Gemini)            (Antigravity / Codex)
```

Drift check: `clai-helpers status --strict` (consumer) or `regen + git diff --exit-code` (upstream CI). Exit 2 = managed file edited by hand.

## 10. Memory Board Data Flow

```
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │ Claude Code  │  │   Gemini CLI │  │  Codex/Hermes│
  │   (MCP)      │  │    (MCP)     │  │    (MCP)     │
  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
         │                 │                  │
         └────────────┬────┴──────────────────┘
                      │ SSE transport (MCP)
                      ▼
           ┌─────────────────────┐
           │  packages/           │
           │  underboard/         │
           │  ┌─────────────────┐│
           │  │   MCP Server    ││
           │  │   + Tool Reg.   ││
           │  └────────┬────────┘│
           │           │          │
           │  ┌────────┴────────┐│
           │  │ Storage Layer   ││
           │  │ (SQLite + vec   ││
           │  │  + FTS5)        ││
           │  └────────┬────────┘│
           │           │          │
           │  ┌────────┴────────┐│
           │  │ Embedding Svc   ││
           │  │ (ONNX Runtime   ││
           │  │  MiniLM)        ││
           │  └─────────────────┘│
           └──────────┬──────────┘
                      │
              ┌───────┴───────┐
              │  Event Bus    │
              │  (in-process) │
              └───────┬───────┘
                      │ SSE
                      ▼
              ┌───────────────┐
              │   Dashboard   │
              │   (browser)   │
              └───────────────┘
```

Single-user, localhost-only, offline-first. SQLite file at `~/.underboard/data.db`.

## 11. See Also

- [`requirements.md`](requirements.md) — what the project must do (functional + non-functional + repo rules).
- [`../../CLAUDE.md`](../../CLAUDE.md) — AI agent operating instructions.
- [`../../.specify/memory/constitution.md`](../../.specify/memory/constitution.md) — binding principles (governance).
- [`../../.github/instructions/coding/copilot-instructions.md`](../../.github/instructions/coding/copilot-instructions.md) — universal coding standards.
- [`../../packages/cli/README.md`](../../packages/cli/README.md) — CLI user docs.
