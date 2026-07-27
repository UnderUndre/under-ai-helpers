# Architecture — UnderUndre AI Helpers

> **Canonical project architecture.** Read this first to understand topography and data flow.
> Companion: [`requirements.md`](requirements.md) — what the project must deliver.
> AI operating instructions: [`../../CLAUDE.md`](../../CLAUDE.md) — how Claude/Copilot/Gemini behave inside this repo.
> Governance: [`../../.specify/memory/constitution.md`](../../.specify/memory/constitution.md) — binding principles.

## 1. Mission

A monorepo with two products under one roof:

1. **`clai-helpers` CLI** (`packages/cli/`) — npm package that treats `.claude/` as the single source of truth and transpiles it to GitHub Copilot, Google Gemini, Antigravity, Codex Desktop, and other AI-tool formats.
2. **AI configuration hub** — curated `.claude/` tree (commands, agents, skills) that ships with the CLI as a reference template via `github:UnderUndre/under-ai-helpers`.

Write AI tool configuration **once** in Claude Code format. Sync everywhere else automatically. No manual duplication across `.github/prompts/`, `.gemini/commands/`, `.agent/workflows/`, `.agents/commands/`, etc.

## 2. Source of Truth

Authoritative content. Edits start here.

| Path | What lives here |
| ------ | ----------------- |
| `.claude/commands/` | 75+ Claude Code slash commands (`/speckit.*`, `/bump`, `/commit`, `/brainstorm`, ...). |
| `.claude/agents/` | 27+ specialist agent definitions (`backend-specialist`, `debugger`, `orchestrator`, ...). YAML frontmatter + markdown body. |
| `.claude/skills/` | 44+ reusable skill modules. Each = directory with `SKILL.md` + optional supporting files. Includes `knowledge-adaptation/` — agent-side adaptation skill for user-level knowledge level consumption. |
| `CLAUDE.md` | Root persona/operating instructions. Composed from persona Foundation + coding Foundation via `<!-- HELPERS:REF -->` markers + hand-maintained bespoke sections (MCP, Agent Routing, Intent Routing, Quick Ref, Project Ref, Ultrathink, Context Mgmt). The two Foundations are single-source for all four tools; bespoke sections are edited directly in CLAUDE.md. |
| `helpers.config.ts` | Authoritative pipeline configuration: `sources` glob + `targets` map (transformer + match + output) + `packs` section (pack membership mapping + marketplace metadata, feature 006). |
| `.claude/hooks/*.mjs` | Harness-enforced guard hooks (destructive-command ask-gate, secret-read deny, post-edit lint feedback) — Node, cross-platform (feature 006). Plus `dialog-capture.mjs` — Stop-hook wrapper that spawns the dialog-capture pipeline (feature 007). |
| `presets/` | Shippable permission preset (`permissions.json`) + statusline script (`statusline.mjs`), applied to consumer settings via `helpers presets apply` (feature 006). Plus `presets/redaction/` — redaction catalogs (`catalog_cloud.yml`, `catalog_pii.yml`, `allowlist.yml`) consumed by the dialog normalizer (feature 007). |
| `.claude/skills/<name>/evals.json` | Co-located skill trigger eval cases; CI ratchet gate via `scripts/skill-evals.mjs` + `.github/workflows/skill-evals.yml` (feature 006). |
| `.specify/` | SpecKit pipeline scripts + templates + `memory/constitution.md` (governance). |

## 3. Generated Outputs

Produced by `clai-helpers regen` (upstream) or `clai-helpers sync` (consumer). **Never edit by hand** (Constitution Principle I) — overwritten on next regeneration. Manual customization only inside `<!-- HELPERS:CUSTOM START/END -->` slots (Principle III).

| Target | Path | Produced from | Transformer |
| -------- | ------ | --------------- | ------------- |
| Copilot | `.github/prompts/*.prompt.md` | `.claude/commands/*.md` | `claude-to-copilot-prompt` |
| Copilot | `.github/instructions/<agent>.instructions.md` | `.claude/agents/*.md` | `claude-to-copilot-instructions` |
| Copilot | `.github/copilot-instructions.md` | `CLAUDE.md` (with REF resolution → inlined Foundations) | `claude-to-copilot-root-instructions` |
| Gemini | `.gemini/commands/*.toml` | `.claude/commands/*.md` | `claude-to-gemini-command` |
| Gemini | `.gemini/agents/*.md` | `.claude/agents/*.md` | `claude-to-gemini-agent` |
| Gemini | `GEMINI.md` (root) | `CLAUDE.md` (+ Foundation-only REF resolution; Reference files excluded) | `claude-to-gemini-root` |
| Antigravity | `.agent/agents/**`, `.agent/skills/**`, `.agent/workflows/**` | `.claude/{agents,skills,commands}/**` | `identity` (mirror) |
| Codex Desktop | `.agents/commands/*.md` | `.claude/commands/*.md` | `identity` |
| Codex Desktop / Antigravity | `AGENTS.md` (root) | `CLAUDE.md` (with REF resolution → inlined Foundations) | `claude-to-codex-root-instructions` |
| Speckit (mirror) | `.specify/**` | `.specify/**` | `identity` |
| Persona phrases (opt-in) | `.github/instructions/persona/phrases/**` | self | `identity` |
| Plugin marketplace | `.claude-plugin/marketplace.json` | `helpers.config.ts#packs` | pack assembler (feature 006) |
| Packs (8 domain plugins) | `packs/<pack-id>/**` | `.claude/{agents,commands,skills,hooks}/**` + `presets/` per membership mapping | pack assembler, `identity` content copy (feature 006) |

Pipeline registry: `packages/cli/src/transformers/registry.ts`. Adding a new AI-tool target = new transformer + entry in `helpers.config.ts` (Principle II).

## 4. Hand-Written (NOT auto-generated)

The exception. Files Copilot consumes directly, never sourced from `.claude/`. Some are split into Foundation (always-loaded, canonical) + Reference (on-demand, heavy material).

| Path | Purpose |
| ------ | --------- |
| `.github/instructions/coding/copilot-instructions.md` | **Coding Foundation** (≤30 lines, 5 bullets). Always-loaded distillation of Universal Coding Standards (v2.0.0). Standing Orders, Stop Conditions, Plumber's Loop, anti-patterns gist. |
| `.github/instructions/coding/copilot-instructions-ref.md` | **Coding Reference** (on-demand). Full §1–§16 normative text, examples, anti-pattern detail. Referenced from Foundation, never always-loaded. |
| `.github/instructions/coding/git/copilot-instructions.md` | Commit message rules. Enforced by `commitlint.config.js` + `.cz-config.cjs`. |
| `.github/instructions/persona/copilot-instructions.md` | **Persona Foundation** (≤90 lines/≤8 KB). Valera identity + interaction protocols (§4.1–§4.9) + ethical principle + boundaries. |
| `.github/instructions/persona/copilot-instructions-ref.md` | **Persona Reference** (on-demand). Full §3 response formats, §5 error playbook, §6 socket, §8 examples, §4.2+§4.4 moved to meet Foundation budget. |
| `.github/instructions/persona/phrases/copilot-instructions.md` | Valera catchphrases (opt-in via `persona-phrases` target). |
| `.github/instructions/pve/copilot-instructions.md` | **PVE module** (opt-in via `pve` target). Full proportionality/verification framework; NOT in default output. |
| `.github/instructions/project/copilot-instructions.md` | **Redirect to this file + [`requirements.md`](requirements.md).** |
| `README.md` / `README.ru.md` | User-facing onboarding. |
| `CONTRIBUTING.md` | Contributor guidelines. |

**Key rule**: persona/coding Foundations are the single source of truth. `CLAUDE.md` composes them via `<!-- HELPERS:REF -->` markers (FR-015), never duplicates their prose. Reference files are on-demand only — excluded from always-loaded targets and from Gemini by design.

## 5. CLI Package Layout

`packages/cli/` — the npm-published artifact (`clai-helpers`).

| Path | What |
| ------ | ------ |
| `src/cli/` | Subcommands: `init`, `sync`, `status`, `diff`, `regen`, `doctor`, `add-target`, `remove-target`, `remove`, `recover`, `eject`, `list-transformers`, `migrate` (legacy → packs, feature 006), `presets` (apply permission/statusline presets, feature 006), `dialog` (backfill/renormalize/purge/doctor/internal-capture-event, feature 007). |
| `src/transformers/` | 7+ transformers (`identity` + `claude-to-*`). Pluggable via `registry.ts`. Skill delivery is `identity` for targets with native SKILL.md support — see `docs/target-capabilities.md` (feature 006). |
| `src/core/packs/` | Pack assembler: membership validation (existence, single ownership, cross-pack dependency DAG), pack tree + `marketplace.json` generation (feature 006). |
| `src/dialog-capture/` | Dialog capture pipeline (feature 007): file-watch wrapper (chokidar), normalizer (defensive JSONL → markdown), redaction engine (catalog + allowlist + external-scanner hook), atomic INDEX updater, retention pruner, CLI command implementations. See `specs/007-dialog-capture/contracts/`. |
| `src/core/` | Config loader (`c12`), pipeline executor, file ops, fetch (giget), hash, slots, journal, drift detection. |
| `bin/helpers.mjs` | Binary entry point. Calls `runCli()` from `dist/cli.js`. |
| `tests/unit/` | Unit tests (transformers, core modules, slots). |
| `tests/integration/` | Integration tests (init, sync, regen, drift, version-pinning, concurrency, recovery). |
| `tests/fixtures/golden/` | Golden-fixture tests for every transformer (Principle II corollary). |
| `package.json` | npm metadata. Version lives here, bumped only via `npm version` / `/bump` (Principle IV). `prepublishOnly` runs validate + test + build. |

## 5.1 Memory Board Service Layout

`packages/underboard/` — standalone MCP tool server (`underboard`) for agent task board + shared semantic memory. Independently versioned from `clai-helpers`.

| Path | What |
| ------ | ------ |
| `src/server/` | MCP server (stdio + SSE transport), HTTP server (dashboard + health), tool registry. |
| `src/storage/` | SQLite (better-sqlite3) stores: project, task, memory, event, sync_queue, tombstones. Migrations. FTS5 for lexical retrieval. Dialog spool tables (`dialog_quarantine_spool`, `dialog_outage_spool`, `dialog_tombstones`) added by feature 007. |
| `src/memory-backend/` | Pluggable memory backend boundary: `MemoryBackend` interface, `HonchoBackend` (REST semantic), `LocalLexicalBackend` (FTS5 fallback), `BackendFactory`, reconciler. |
| `src/dialog-ingest/` | Dialog ingestion pipeline (feature 007): quarantine spool, outage spool, tombstones, event-driven worker, Honcho Session/Message client. Receives normalized records from `packages/cli/src/dialog-capture/` and routes them into Honcho Sessions per the 008 mapping. |
| `src/retrieval/` | Lexical retrieval only: BM25 (FTS5). Semantic search delegated to Honcho backend. |
| `src/project/` | CWD → project ID detector (Git root / `.under-project` marker). |
| `src/events/` | In-process event bus for SSE push to dashboard clients. |
| `src/tools/` | MCP tool implementations: memory (write, recall, cross-project, list, get, delete, deep-recall), tasks (create, update, list, assigned, archive), activity log, knowledge profile (get, set, config, signals, quiz, export, forget, sync). |
| `src/knowledge/` | Knowledge adaptation service layer (feature 011): profile-service, inference-engine, quiz-engine, signal-retention, export-service, sync-service. |
| `src/cli/` | Commander CLI: start, stop, status, export, import. |
| `dashboard/` | Static HTML/CSS/JS SPA (vanilla, no build step). Kanban board, memory feed, activity log. |
| `tests/` | Unit + integration tests (vitest). |
| Spec: `specs/005-agents-board-and-memory/` | Feature spec, plan, data model, contracts (005 original). |
| Spec: `specs/008-memory-backend-honcho/` | Backend seam + Honcho integration spec, plan, data model, contracts (008). |
| Spec: `specs/007-dialog-capture/` | Dialog capture pipeline spec, plan, contracts (007). Phase 2 of 006/US7 — feeds the Honcho Session entity reserved by 008. |
| Spec: `specs/009-configurable-endpoints/` | Configuration resolution (CLI > Env > config.json > default) for ports, DB, Honcho, LLM, and ONNX model paths (009). |

**Backend dependency**: Honcho v3.0.9 (self-hosted Docker stack: Postgres 16 + pgvector, Redis 7, TEI embed + rerank) or local FTS5 for offline-only fallback. Local ONNX embedding model is used for local vector search embeddings when configured.

## 6. SpecKit Integration

| Path | Purpose |
| ------ | --------- |
| `.specify/memory/constitution.md` | Governance: principles + workflow + amendments. Loaded by `/speckit.plan` Constitution Check gate. |
| `.specify/scripts/{powershell,bash}/` | Scripts that `/speckit.*` commands invoke. PowerShell is source of truth on Windows; bash ports for *nix parity. |
| `.specify/templates/` | Spec / plan / tasks / checklist templates. |
| `specs/<feature-slug>/` | Per-feature artifacts: `spec.md`, `plan.md`, `tasks.md`, `contracts/`, `data-model.md`, `quickstart.md`, `research.md`, `checklists/`, `reviews/<provider>.md`. Active: `specs/006-ecosystem-parity/` — marketplace packaging, guard hooks, permission presets, skill evals, native SKILL.md delivery, statusline, dialog archive. `specs/007-dialog-capture/` — Phase 2 of 006/US7: CC transcript capture, normalization, INDEX auto-population, Honcho Session ingestion with quarantine window. `specs/008-memory-backend-honcho/` — backend seam + Honcho integration. `specs/010-user-level-adaptation/` — user-level knowledge adaptation subsystem: privacy-preserving per-project profiles, switchable assessment modes, per-sub-domain level scoping, multi-machine sync via encrypted file transport, agent-side skill for explanation depth adaptation. `specs/023-language-guard-validator-leftovers/` — LanguageGuardValidator API layer: config CRUD, enabled toggle, configVersion optimistic locking, audit log API. |
| `specs/main/` | **This directory.** Project-wide architecture + requirements (canonical, not feature-scoped). |
| `specs/011-instructions-updates/` | Instruction-set single-source architecture — persona/coding Foundation/Reference split, CLAUDE.md composition via REF markers, optimization modules adoption, PVE module opt-in. |

Stage tags (Principle VII): `<stage>/<slug>/v<N>` — created by `snapshot-stage.{sh,ps1}`, idempotent via `--points-at HEAD`. `/speckit.diff` and `/speckit.retrospective` read these tags.

## 8. Other AI-Tool Directories

`.clinerules/`, `.kilocode/`, `.qwen/`, `.remember/` — provider-specific artifacts not currently wired into the transpile pipeline. Add via new transformer + `helpers.config.ts` entry if needed (Principle II).

## 9. Data Flow

```
                     ┌──────────────────────────────┐
        edit         │   .claude/**                  │
        ─────────►   │   .github/instructions/        │
                     │   ├── persona/  (Foundation)   │
                     │   ├── coding/   (Foundation)   │
                     │   ├── *-ref.md  (Reference)    │
                     │   └── pve/      (opt-in)       │
                     │   CLAUDE.md (REF markers)      │
                     │   helpers.config               │
                     └────────┬───────────────────────┘
                              │
                  helpers regen / helpers sync
                              │
        ┌─────────────────────┼──────────────────────────────┐
        ▼                     ▼                              ▼
  ┌──────────┐        ┌──────────────┐          ┌──────────────────┐
  │ .github/ │        │   .gemini/   │          │   .agent/        │
  │ prompts/ │        │   commands/  │          │   .agents/       │
  │ instr/   │        │   agents/    │          │   AGENTS.md      │
  │ copilot- │        │   GEMINI.md  │          │   (REF resolved) │
  │ instr.md │        │   (REF       │          │                  │
  │ (REF     │        │    resolved, │          │                  │
  │  resolved)│        │   no -ref)   │          │                  │
  └──────────┘        └──────────────┘          └──────────────────┘
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
           │  │ MemoryBackend   ││
           │  │ (interface)     ││
           │  └───┬─────────┬───┘│
           │      │         │    │
           │ ┌────┴───┐ ┌──┴────┴──┐
           │ │Honcho  │ │Local     ││
           │ │Backend │ │Lexical   ││
           │ │(REST)  │ │(FTS5)   ││
           │ └───┬────┘ └──┬──────┘│
           │     │         │       │
           │ ┌───┴─────┐  ┌┴──────┐│
           │ │SQLite   │  │SQLite ││
           │ │+sync_q  │  │memory ││
           │ │+tombstn │  │entries││
           │ └─────────┘  └───────┘│
           └──────────┬───────────┘
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

External (REST over localhost):
           ┌─────────────────────┐
           │  Honcho v3 (Docker) │
           │  Postgres + pgvector│
           │  TEI embed + rerank │
           │  Redis 7            │
           └─────────────────────┘
```

Single-user, localhost-only. Semantic tier = Honcho REST. Offline = local FTS5 lexical fallback. SQLite file at `~/.underboard/data.db`.

## 11. See Also

- [`requirements.md`](requirements.md) — what the project must do (functional + non-functional + repo rules).
- [`../../CLAUDE.md`](../../CLAUDE.md) — AI agent operating instructions.
- [`../../.specify/memory/constitution.md`](../../.specify/memory/constitution.md) — binding principles (governance).
- [`../../.github/instructions/coding/copilot-instructions.md`](../../.github/instructions/coding/copilot-instructions.md) — universal coding standards.
- [`../../packages/cli/README.md`](../../packages/cli/README.md) — CLI user docs.
