# UnderUndre AI Helpers Constitution

Binding principles for `clai-helpers` CLI + the curated `.claude/` template it ships. Every `/speckit.*` command checks plans and tasks against this file. Violations halt work until resolved or the constitution is explicitly amended.

## Core Principles

### I. Source of Truth Discipline

`.claude/` is **the** authoritative AI configuration. All downstream formats (`.github/prompts/`, `.github/instructions/*.instructions.md`, `.gemini/`, `GEMINI.md`, `.github/copilot-instructions.md`) are **generated**, never hand-edited.

- Edits flow one direction: `.claude/` → transformers → consumer tree.
- Any reverse flow (editing a generated file) is an incident and must be rolled back via `clai-helpers sync`.
- Hand-written instruction files under `.github/instructions/{project,persona,coding}/` are the explicit exception and are preserved by pipeline exclusion, not by luck.

### II. Transformer, Not Fork

New AI-tool target = one new transformer in `packages/cli/src/transformers/` + registration + pipeline entry in `helpers.config.ts`. Duplicating `.claude/` into a new directory tree is forbidden.

- Rationale: two copies of the same instruction drift. The CLI pipeline is the anti-drift discipline.
- Corollary: `.agent/`, `.gemini/`, `.github/prompts/` etc. MUST be produced by the pipeline, not maintained by hand.

### III. Protected Slots over Hand-Editing

Project-specific overrides inside managed files MUST use `<!-- HELPERS:CUSTOM START --> … <!-- HELPERS:CUSTOM END -->` markers. These survive `sync`. Unmarked hand-edits to managed files are lost silently on next sync — by design.

- Consumer projects never edit generated trees directly.
- Upstream improvements that would benefit every consumer go through `UnderUndre/ai` + `sync`, not local patch.

### IV. SemVer Discipline in the 0.x Zone (NON-NEGOTIABLE)

While `clai-helpers` is pre-1.0:

- **Breaking change** → MINOR bump (de facto major in 0.x semantics).
- **Feature** → MINOR bump.
- **Bugfix** → PATCH bump.
- **`chore:` / `docs:` / `refactor:` / `ci:` / `test:` / `build:`** → NO bump. Every `chore: bump version` commit is a smell.
- Going to `1.0.0` is a one-way public promise of API stability. Not before migration notes, deprecation cycles, and a tagged RC.

Full framework: `.claude/skills/semver-versioning/SKILL.md`. Bump via `/bump` command — never by hand-editing `package.json#version`.

### V. Token Economy for AI Artifacts

Every file in `.claude/` earns its place by being invoked. Decorative clones, stale mirrors, and "just in case" agents bloat the context window of every downstream Claude session.

- A file not referenced by any command, agent, or skill in 60 days is a candidate for deletion.
- `ultrathink` markers belong on entry points (commands + primary agents + decision-framework skills), not on every file. Each marker costs reasoning budget on load.
- Persona flavor (catchphrases, aphorisms) MUST be opt-in via a separate transpile target so non-Russian-speaking consumers can omit it.

## Technical Constraints

- **Runtime**: Node.js ≥20. Enforced by `packages/cli/package.json#engines`.
- **Language**: TypeScript 5.7+, strict mode, no `any`.
- **Module system**: ESM only. `"type": "module"` in package.json is non-negotiable; no CommonJS fallback.
- **Distribution**: `dist/` compiled via `tsc`. `bin/helpers.mjs` is the entry. Build is enforced by `prepublishOnly`.
- **Tests**: Vitest unit + integration. Golden-fixture tests in `tests/fixtures/golden/` for every transformer.
- **Logging**: `consola` only. `console.log` is banned by lint and code review.
- **Paths**: Cross-platform via `pathe`. Windows primary dev environment, Git Bash compatible.
- **Scripts**: `.specify/scripts/powershell/*.ps1` is the source of truth; bash ports live alongside for *nix parity.

## Development Workflow

### Plumber's Loop (required for every non-trivial change)

`Classify → Analyze → Spec → Plan → Execute → Verify → Reflect`. Defined in `.github/instructions/coding/copilot-instructions.md` §5.

### WRAP atomicity

`W`rite-issue → `R`efine → `A`tomic-tasks (<500 LOC each) → `P`air-execute (one PR = one concern: refactor XOR feature, never both).

### `/speckit.*` pipeline for features

`/speckit.specify` → `/speckit.clarify` → `/speckit.plan` → `/speckit.tasks` → `/speckit.analyze` → `/speckit.implement` → `/speckit.status`. This file (the constitution) is loaded at the Constitution Check gate of `/speckit.plan`. Violations block until resolved.

### Quality gates before `done`

- `npm run validate` (tsc --noEmit) — clean.
- `npm test` — all pass.
- `npm run build` — produces `dist/`.
- `npx clai-helpers status --strict` — no drift between `.claude/` source and generated targets.

### Release gate

`/bump` → confirmation → `npm version` → `git push --follow-tags` → `npm publish` (which triggers `prepublishOnly` = validate + test + build). No manual version edits. No publish from dirty tree.

## Governance

1. **This constitution supersedes ad-hoc practice.** If an agent, skill, or command contradicts a principle here, the principle wins until the constitution is amended.
2. **Amendments require a commit** that touches `.specify/memory/constitution.md` plus any dependent `.claude/` files (e.g., changing Principle IV requires updating `semver-versioning` skill and `/bump` command to match).
3. **`/speckit.analyze` enforces constitution alignment** — any misalignment in spec/plan/tasks is flagged CRITICAL.
4. **Complexity must be justified.** Every new agent, transformer, target, or skill adds load to every downstream session. A change that doesn't earn its weight is rejected.
5. **Anti-sycophancy applies to review of this file too.** If a principle above is wrong for the project, say so and propose an amendment. Don't quietly ignore it.

**Version**: 1.0.0 | **Ratified**: 2026-04-17 | **Last Amended**: 2026-04-17
