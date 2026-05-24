# Feature Specification: AI Helpers Distribution System

**Feature Branch**: `002-ai-helpers-reuse`
**Created**: 2026-04-07
**Updated**: 2026-04-09 (v3.2 — review round 2: drop rename detection, headerless JSON validation, drop --only, generated auto-delete on transformer removal, single-file custom transformers, config scaffolding on sync, .helpers_new cleanup)
**Status**: Draft v3.2
**Input**: User description: "Как сделать, чтобы эту репу легче было переюзывать в других репах (без сабмодулей), в виде нмп пакета или через какой-нибудь uv как спек кит репа? И лучше чтобы можно было синкать."

---

## Core Concept

`underundre-helpers` is a **`.claude/`-to-X transpiler and distributor**, not a generic file syncer. The `.claude/` directory is the **single source of truth** for AI-tool configuration (commands, agents, skills, persona, instructions). All other AI-tool-specific files (`.github/prompts/`, `.gemini/commands/`, root-level `CLAUDE.md` / `GEMINI.md`, etc.) are **generated** from `.claude/` via declared **transformers** at install/sync time.

This eliminates content duplication in the source repository: write once in `.claude/`, generate for every supported AI tool.

---

## Architectural Decisions (locked)

These decisions resolve ambiguities found in v1/v2 review. Change them only with explicit re-spec.

| #         | Decision                                                                                                                                                                                                                          | Rationale                                                                                                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AD-1**  | **Distribution: `npx underundre-helpers`** (Node 20+, TypeScript). No uvx, no Python, no standalone binary in v1.                                                                                                                 | User's projects are TypeScript-first. Tooling stack must match primary stack for long-term maintenance velocity. Node is universally present in the target audience. Single ecosystem = single mental model.                            |
| **AD-2**  | **Engine: built on top of [`giget`](https://github.com/unjs/giget)** for fetch + cache + GitHub auth. Protected Slots, transformers, and lock file are written from scratch as a thin layer on top.                               | `giget` (UnJS) handles git fetch, GitHub API, auth, and caching — battle-tested by Nuxt. We add only the value layer: parsing, transformation, slot preservation, lock management. No need to reinvent fetch logic.                      |
| **AD-3**  | **Source of truth: `.claude/` directory** in the source repo. All other AI-tool layouts (`.github/prompts/`, `.gemini/commands/`, root `CLAUDE.md`, etc.) are **generated outputs**, not tracked sources.                         | Eliminates duplication at the source. Adding a new AI tool requires writing one transformer, not duplicating every file. Source repo stays small and authoritative.                                                                      |
| **AD-4**  | **Manifest: `helpers.config.ts`** at the source repo root, loaded via [`c12`](https://github.com/unjs/c12) (TS/JS/JSON supported). Declares: source paths in `.claude/`, transformer pipelines, output target paths.              | TS gives types, comments, and IntelliSense. `c12` is the UnJS standard config loader (used by Nuxt, Nitro). One config file, full type safety, no YAML schema headaches.                                                                 |
| **AD-5**  | **Lock file: `helpers-lock.json`** at target project root, **committed to git**. Stores per-file `sha256`, transformer name, and source path provenance.                                                                          | JSON is native to Node. Reproducibility across team members. Provenance lets `helpers status` answer "where did this generated file come from?".                                                                                         |
| **AD-6**  | **Merge strategy: Protected Slots only** for source files copied via `identity` transformer (e.g., `.claude/CLAUDE.md` → `CLAUDE.md`). **Generated files (Copilot/Gemini outputs) are read-only and ALWAYS overwritten on sync.** | 3-way merge is fragile. Generated files have no meaningful "user edits" — customizations belong in `.claude/` source. Protected Slots only matter for files where the user legitimately co-authors content with the tool.                |
| **AD-7**  | **Default source repo: `github.com/underundre/helpers`** (hardcoded), overridable via `--source <url>` and persisted in `helpers-lock.json`.                                                                                      | One default for the common case, full freedom for forks.                                                                                                                                                                                 |
| **AD-8**  | **Generated files MUST carry an auto-generated header.** Exact format per file type is defined normatively in **FR-010** — AD-8 establishes the policy, FR-010 is the single source of truth for templates. Headers are **excluded** from canonical hash computation (FR-018b) so header edits don't produce false-positive drift. | Prevents users from editing generated files and losing changes silently. Makes provenance visible without opening the lock file. Standard practice (Protocol Buffers, GraphQL Codegen, OpenAPI). Centralizing the template in FR-010 prevents golden-test hash mismatches caused by accidental header drift between sections of this spec. |
| **AD-9**  | **Transformer model: `Source → Parse → Transform → Render → Target`**. Each transformer is a pure function with typed input/output. Built-in transformers ship with the package; custom transformers can live in source repo.    | A clear pipeline model prevents the "if filename === X" lasagna that happens when transformers grow organically. Pure functions are testable in isolation.                                                                               |
| **AD-10** | **v1 ships with built-in transformers for Claude (identity), GitHub Copilot, and Google Gemini.** Cursor, Aider, Continue.dev, etc. are out of scope for v1.                                                                      | Three real transformers prove the model works. Adding more is a follow-up PR, not a redesign.                                                                                                                                            |

---

## Source / Target Mapping (canonical)

This is how the source `.claude/` directory maps to outputs across supported AI tools.

| `.claude/` source                  | `claude` target (identity) | `copilot` target                          | `gemini` target                       |
| ---------------------------------- | -------------------------- | ----------------------------------------- | ------------------------------------- |
| `.claude/commands/<name>.md`       | `.claude/commands/<name>.md` | `.github/prompts/<name>.prompt.md`        | `.gemini/commands/<name>.toml`        |
| `.claude/agents/<name>.md`         | `.claude/agents/<name>.md`   | `.github/instructions/<name>.instructions.md` | `.gemini/agents/<name>.md`        |
| `.claude/skills/<name>.md`         | `.claude/skills/<name>.md`   | (skipped — Copilot has no skills concept) | (skipped)                             |
| `.claude/CLAUDE.md`                | `CLAUDE.md` (root)         | `.github/copilot-instructions.md`         | `GEMINI.md` (root)                    |
| `.claude/settings.json`            | `.claude/settings.json` (config-class) | (skipped)                       | (skipped)                             |

The exact transformation rules (frontmatter mapping, body rewriting) are defined per-transformer in implementation, not in the spec.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quick Project Setup (Priority: P1)

As a developer starting a new AI-assisted TypeScript project, I want to quickly pull the "Valera" persona, coding standards, Claude commands, **and the GitHub Copilot / Gemini equivalents** into my repo with one command — no submodules, no manual copying.

**Why this priority**: Essential for the "reuse" goal. If setup is hard, developers won't use it.

**Independent Test**: Run `npx underundre-helpers init` in a fresh empty directory. Verify:

1. `.claude/` is populated with all source files from the latest tag.
2. `.github/prompts/`, `.github/instructions/`, `.github/copilot-instructions.md` are generated from `.claude/` content.
3. `.gemini/commands/`, `.gemini/agents/`, `GEMINI.md` are generated.
4. Root `CLAUDE.md` is generated from `.claude/CLAUDE.md`.
5. `helpers-lock.json` exists at project root with per-file hashes and transformer provenance.
6. Every generated file starts with the AUTO-GENERATED header.

**Acceptance Scenarios**:

1. **Given** an empty directory, **When** I run `npx underundre-helpers init`, **Then** `.claude/`, `.github/`, `.gemini/`, root `CLAUDE.md`, root `GEMINI.md`, and `helpers-lock.json` are all created. Exit code `0`.
2. **Given** a directory with no conflicting files, **When** I run init, **Then** the tool proceeds without prompting regardless of `--interactive` flag.
3. **Given** a directory containing **at least one conflicting file** and `--interactive` is **not** set, **When** I run init, **Then** the tool writes new versions to `<file>.helpers_new`, leaves originals untouched, exits with code `2`.
4. **Given** conflicting files with `--interactive` set, **When** I run init, **Then** the tool prompts per-file using the menu defined in FR-015, which varies by file kind:
   - **Source file with ≥1 Protected Slot**: `[k]eep / [o]verwrite / [m]erge-via-slots / [d]iff / [a]bort`
   - **Source file with no slots**: `[k]eep / [o]verwrite / [d]iff / [a]bort` (no `merge-via-slots` option)
   - **Generated file**: no prompt — always overwritten, warning printed listing the overwrites (generated files have no user content per AD-6)
   - **Config-class file** (`class: config`): prompt shown **only on init**; on `sync`, config files are skipped and never prompted per FR-006.
5. **Given** I pass `--targets claude,copilot` (omitting gemini), **When** init runs, **Then** only Claude and Copilot outputs are generated; Gemini files are skipped and not recorded in the lock file.

---

### User Story 2 - Automated Updates (Sync) (Priority: P1)

As a maintainer of multiple projects, I want to update the shared persona, commands, and standards in `.claude/` upstream and have all generated outputs (Claude/Copilot/Gemini) re-synced in every downstream project.

**Why this priority**: Solves the "Sync" requirement and prevents fragmentation across AI tools.

**Independent Test**:

1. In source repo: edit `.claude/commands/commit.md`, tag `v1.1.0`.
2. In a downstream repo previously initialized at `v1.0.0`, ensure `CLAUDE.md` contains a Protected Slot block with project-specific text.
3. Run `npx underundre-helpers sync --upgrade`.
4. Verify: `.claude/commands/commit.md` is updated; `.github/prompts/commit.prompt.md` and `.gemini/commands/commit.toml` are **regenerated** to match; root `CLAUDE.md` Protected Slot content is preserved byte-for-byte; lock file shows new version and hashes.

**Acceptance Scenarios**:

1. **Given** a project initialized at `v1.0.0`, **When** I run `sync --upgrade`, **Then** all source files in `.claude/` are updated, all generated outputs are regenerated, and all hashes in the lock file are refreshed.
2. **Given** a managed file with content inside Protected Slots (e.g., root `CLAUDE.md`), **When** I run sync, **Then** the slot content is preserved verbatim and the rest is updated/regenerated.
3. **Given** a generated file (e.g., `.github/prompts/commit.prompt.md`) has been edited locally, **When** I run sync (with or without `--interactive`), **Then** the local edits are **silently overwritten** per AD-6 / FR-015 (generated files are read-only from the user's perspective; no prompt is shown even in interactive mode), and a warning is printed in the run summary listing overwritten paths.
4. **Given** a managed source file (`.claude/CLAUDE.md`) has local edits **outside** Protected Slots and `--interactive` is not set, **When** I run sync, **Then** a `.helpers_new` is written, the original is untouched, exits with code `2`.
5. **Given** the source repo has deleted a file from `.claude/`, **When** I run sync, **Then**:
   - The corresponding **source file** is marked `orphaned` in the lock file and **kept locally** (user may have customized it via slots; tool never auto-deletes source files). User resolves via `eject` (untrack, keep forever) or `remove` (delete locally).
   - **All generated descendants** of that source (Copilot/Gemini outputs, etc.) are **automatically deleted** from disk and from the lock file without prompting. Rationale: generated files are read-only (AD-6) and contain no user content — there is nothing to preserve, and keeping stale generated prompts for deleted sources would actively mislead the AI tools.
   - A warning in the run summary lists both the orphaned source and the auto-deleted generated files.

---

### User Story 3 - Version Pinning (Priority: P2)

As a project lead, I want to pin my project to a specific tagged version of helpers to avoid breaking changes in production workflows.

**Independent Test**: `npx underundre-helpers init --version v1.0.0`, verify all files (source + generated) match `v1.0.0`. Tag `v1.1.0` upstream. Run `helpers status` — shows "update available". Run `helpers sync` (without `--upgrade`) — no-op except drift healing.

**Acceptance Scenarios**:

1. **Given** the source has multiple tags, **When** I run `init --version v1.0.0`, **Then** files match `v1.0.0`, lock records `version: v1.0.0`.
2. **Given** a pinned version, **When** I run `sync` without `--upgrade`, **Then** drift is healed against the pinned version; no version change.
3. **Given** a pinned version, **When** I run `sync --upgrade` or `sync --version v1.1.0`, **Then** the project moves to the new version.

---

### User Story 4 - CI Drift Detection (Priority: P2)

As a tech lead, I want CI to fail when someone has edited a managed file locally without using Protected Slots, so the team doesn't silently fork the standards.

**Independent Test**: In GH Actions, run `npx underundre-helpers status --strict`. Non-zero exit if any file's local hash differs from lock-file hash and the diff is outside Protected Slots.

**Acceptance Scenarios**:

1. **Given** a clean repo, **When** CI runs `status --strict`, **Then** exit code is `0`.
2. **Given** a generated file has been edited locally, **When** CI runs `status --strict`, **Then** exit code is `2` (generated files must never be edited).
3. **Given** a source file has been edited outside Protected Slots, **When** CI runs `status --strict`, **Then** exit code is `2`.

---

### User Story 5 - Selective Target Generation (Priority: P3)

As a developer who only uses Claude Code (not Copilot or Gemini), I want to skip generating files for AI tools I don't use.

**Acceptance Scenarios**:

1. **Given** I run `init --targets claude`, **When** init completes, **Then** only `.claude/` and root `CLAUDE.md` are present; no `.github/` or `.gemini/` files are generated.
2. **Given** an existing project initialized with `--targets claude`, **When** I later run `helpers add-target copilot`, **Then** all Copilot outputs are generated and added to the lock file.
3. **Given** a project with all targets, **When** I run `helpers remove-target gemini`, **Then** all Gemini-generated files are deleted and removed from the lock file.

---

### Edge Cases

- **Private source repo**: Tool reads `GH_TOKEN` env var, falls back to `gh auth token` if `gh` CLI is installed. No credentials persisted to lock or disk.
- **Network failure / process crash mid-sync**: See FR-019 and FR-020. Per-file writes go through `<target>/.helpers/staging/` and are committed via `fs.rename` (with `EXDEV` fallback to copy+unlink). A Write-Ahead Journal at `<target>/.helpers/journal.json` plus per-file backups at `<target>/.helpers/backup/<run-id>/` enable `helpers recover --resume` or `helpers recover --rollback` after any crash. The lock file is updated last, only after all journal entries are done.
- **File deleted in source**: Differentiated behavior by kind. **Source files** are marked `orphaned` in the lock file and kept locally (may contain user slot content); resolved via `eject` or `remove`. **Generated descendants** of an orphaned source are **automatically deleted** from disk and from the lock file on the same sync run, because they are read-only with no user content (AD-6). Run summary lists both orphaned sources and auto-deleted generated files.
- **File renamed in source**: **v1 does not detect renames.** `giget` downloads a flat snapshot with no git history — rename detection is impossible without a separate diff data source (e.g., GitHub compare API). All renames are treated as `delete + add`: old path becomes orphan (source) or is auto-deleted (generated); new path appears as a fresh file. Protected Slot content in the old file is **not** auto-migrated — user must manually copy slot content from orphan to the new file, then `eject` or `remove` the orphan. Rename-aware sync is deferred to v2.
- **Concurrent sync runs**: A `helpers-lock.json.lock` advisory file is created during operation; second invocation aborts with clear error.
- **Cross-platform line endings**: Tool normalizes to `LF` for hash computation. Writes use `LF` unless target file already exists with `CRLF` (preserves existing convention).
- **Encoding**: All text files read/written as **UTF-8 without BOM**. Tool refuses BOM-prefixed files with actionable error.
- **Source repo on a branch, not tag**: Allowed via `--ref <branch-or-sha>`. Lock records exact commit SHA, not branch name, for reproducibility.
- **Binary files in `.claude/`**: Allowed; copied via `identity` transformer only; never subject to Protected Slots; cannot be transformed to other formats.
- **User edits a generated file**: On next sync, the edit is silently overwritten and listed in the warning summary. Generated files have no Protected Slots — all customization must happen in `.claude/`.
- **Transformer fails on malformed source**: Sync aborts with the offending source file path and parser error. No partial output is written for that transformer's targets.
- **Adding a new transformer (e.g., for Cursor) in a downstream project**: User can pass `--source-config ./helpers.local.config.ts` to extend or override the manifest from the source repo.
- **A transformer is removed in upstream**: Its previously-generated outputs are **automatically deleted** from disk and from the lock file on next sync — consistent with AD-6 (generated files are read-only, contain no user content). A warning in the run summary lists the deleted paths. This is the same behavior as generated descendants of an orphaned source (US2 scenario 5).

---

## Requirements *(mandatory)*

### Functional Requirements

#### Distribution & CLI

- **FR-001**: Tool MUST be distributable via `npx underundre-helpers` (npm package). Node 20+. Written in TypeScript, compiled to ESM. No Python, no uvx, no standalone binary in v1.
- **FR-002** (CLI Contract — normative): Tool MUST expose the commands listed below. This table is the single source of truth for the CLI surface in v1. Any flag mentioned elsewhere in this spec but absent from this table is a spec bug.

  **Global flags** (accepted by every command unless noted):
  `--dry-run`, `--offline`, `--non-interactive` (default), `--interactive`, `--yes`, `--no-color`, `--json`, `--verbose`, `--help`.

  | Command | Purpose | Command-specific flags |
  |---|---|---|
  | `init` | First-time bootstrap in an empty or new project | `--source <url>`, `--version <tag>`, `--ref <branch\|sha>`, `--targets <list>`, `--source-config <path>`, `--trust-custom` |
  | `sync` | Re-pull source, re-run transformers, update files | `--upgrade`, `--version <tag>`, `--ref <branch\|sha>`, `--source-config <path>`, `--trust-custom` |
  | `status` | Show tracked files, version, drift, orphans, pending `.helpers_new` side-files | `--strict`, `--targets <list>` |
  | `diff` | Show pending changes (source updates + retransforms) | `[<path>...]`, `--targets <list>` |
  | `eject` | Untrack a file (keep local copy, update lock) | `<path>` (required), `--cascade` (also untrack generated descendants if source) |
  | `remove` | Delete a file locally and untrack it | `<path>` (required). Destructive — requires `--yes` or `--interactive` |
  | `add-target` | Enable a target and generate its files | `<name>` (required) |
  | `remove-target` | Delete all files for a target, untrack them | `<name>` (required). Destructive — requires `--yes` or `--interactive` |
  | `list-transformers` | Show built-in and custom transformers with descriptions | `--json` |
  | `doctor` | Verify lock integrity, rehash, validate manifest, report `.helpers_new` side-files | `--fix` (auto-correct safe issues), `--clean` (delete all `.helpers_new` side-files) |
  | `recover` | Recover from stale journal after a crashed run (see FR-020b) | `--resume` \| `--rollback` \| `--abandon` (mutually exclusive, one required) |

  **Flag semantics**:
  - `--dry-run`: Print the plan of operations, write nothing. Exits `0`.
  - `--offline`: Do not contact any remote. Use `giget` cache. Fails with actionable error if required source is not cached.
  - `--non-interactive` (default): Never prompt. On conflict, write `.helpers_new` side-files and exit `2`. CI-safe.
  - `--interactive`: Prompt per-conflict using the menus defined in FR-015.
  - `--yes`: Auto-confirm destructive operations. Without `--yes` and without `--interactive`, destructive operations exit `1` with actionable error.
  - `--targets <list>`: Comma-separated target names (e.g., `claude,copilot`). Omitted targets are ignored for reads; `init`/`add-target`/`remove-target` use it to scope writes.
  - `--source-config <path>`: Path to a local manifest override or extension loaded via `c12` layering on top of the upstream `helpers.config.ts` (allows downstream-only transformers).
  - `--trust-custom`: Pre-approve loading custom transformers from the source without the FR-007 trust prompt. Per-run only.
  ~~`--only <path-glob>` was removed from v1 — partial sync semantics (scope of discovery, orphan detection, lock consistency) are underspecified and risk disk/lock divergence. Deferred to v2.~~

  **Exit codes**:
  - `0`: Success, no changes needed or changes applied cleanly.
  - `1`: Usage error (bad flags, missing args, unknown target).
  - `2`: Drift or conflicts detected in non-interactive mode (not an error, a signal).
  - `3`: Stale journal present — user must run `helpers recover`.
  - `4`: Untrusted custom transformer in source — user must re-run with `--trust-custom` or interactive mode.
  - `5`: Lock file schema mismatch — run `helpers doctor`.
  - `>=10`: Internal error (crash, unexpected I/O failure).

- **FR-003**: All commands MUST respect the `--non-interactive` / `--interactive` pair. Default is non-interactive for CI safety. `--interactive` and `--non-interactive` MUST be mutually exclusive; passing both is a usage error (exit `1`).
- **FR-004**: All destructive operations (`remove`, `remove-target`, `recover --abandon`, and any interactive "overwrite" choice on a source file with drift) MUST require either `--interactive` confirmation or an explicit `--yes` flag. Without either, destructive operations exit `1` with an actionable error naming the operation and the required flag.

#### Manifest & Source Layout

- **FR-005**: Source repo MUST contain a `helpers.config.ts` (or `.js`, or `.json`) at its root, loaded via `c12`. Tool MUST refuse to operate on a source without one.
- **FR-006** (Manifest & File Classes): The manifest MUST declare:
  - `version`: manifest schema version (currently `1`).
  - `sources`: list of glob patterns under `.claude/` to include (e.g., `commands/**/*.md`, `agents/**/*.md`, `CLAUDE.md`).
  - `targets`: map of target name → list of transformer pipelines. Each pipeline declares `transformer` (built-in name or path to custom), `match` (source glob), `output` (target path template using `{{name}}`, `{{relativePath}}`, etc.), and optional `class: core | config`.

  **File class lifecycle — normative**:

  | Lifecycle aspect | `class: core` | `class: config` |
  |---|---|---|
  | Written on `init` | Yes | Yes (template copied once) |
  | **New config file on `sync --upgrade`** | N/A (core files always exist after init) | **Yes — scaffolded.** If a new version adds a `class: config` file that doesn't exist locally, `sync` writes it (same as init). If it already exists locally, it is NOT overwritten. |
  | Overwritten on `sync` | Yes (subject to Protected Slots and drift rules) | **No — never** (existing config files are not touched) |
  | Overwritten on `sync --upgrade` | Yes | **No — never** (user owns config after init) |
  | Tracked in lock file | Yes, `status: managed` | Yes, `status: config-init` |
  | Appears in `helpers status` | Yes (drift + version info) | Yes, but always shown as `config-init`, never as `managed` |
  | Counted as drift by `status --strict` | Yes | **No — never** (user is free to edit) |
  | Can become `orphaned` | Yes | **No** — if removed from source manifest, config files are silently untracked from lock without deletion or warning (they became the user's files at init) |
  | Included in `helpers diff` | Yes | No (no upstream updates to compare) |
  | Verified by `helpers doctor` | Full content verification via `canonicalHash` | Existence check only (file still exists at path); content intentionally ignored |
  | `eject` / `remove` applicable | Yes | `remove` only (since never managed after init) |
  | Protected Slots supported | Yes | Yes, but pointless — no resync ever happens |

  This guarantees that config files (e.g., `.claude/settings.json`, per-project API keys scaffolding) are set up once by `init` and then owned entirely by the user, while core files stay in sync with upstream.

  **US2 acceptance scenario 1 clarification**: "all source files in `.claude/` are updated" in that scenario refers specifically to `class: core` files. Config-class files are excluded from `sync` by design per this table.
- **FR-007** (Custom Transformers & Trust Model): The manifest MAY declare custom transformers as paths to TS/JS files (resolved relative to the source repo root, e.g., `./transformers/my-cursor.ts`) exporting a function `(source: ParsedFile, ctx: TransformContext) => RenderedFile | RenderedFile[] | null`. v1 also ships built-in transformers: `identity`, `claude-to-copilot-prompt`, `claude-to-copilot-instructions`, `claude-to-copilot-root-instructions`, `claude-to-gemini-command`, `claude-to-gemini-agent`, `claude-to-gemini-root`.

  **Security model — Custom transformer code execution is a supply-chain attack surface.** Loading a custom transformer means executing arbitrary JS/TS code from the source repo on the user's machine. The tool MUST mitigate this risk as follows:

  1. **First-time trust prompt**: On the first load of any custom transformer file, the tool computes `sha256` of the transformer file contents and checks `trustedTransformers` in `helpers-lock.json`. If no entry exists, the tool refuses to execute it and prompts the user (in interactive mode) or exits with code `4` (in non-interactive mode) listing the untrusted transformer path and hash.
  2. **Explicit bypass**: `--trust-custom` flag pre-approves all custom transformers for the current run. Useful for CI pipelines where the source repo is vetted by policy. Trust decisions made via `--trust-custom` **are** recorded in `trustedTransformers` and persist across runs.
  3. **Trust revocation on hash change**: If a transformer's file hash changes from what's recorded in the lock file, trust is revoked and the prompt/exit is re-triggered. Users must explicitly re-approve after upstream changes.
  4. **No sandboxing in v1**: The tool does NOT run custom transformers in a VM / isolate / subprocess with restricted permissions. This is explicitly out of scope. The trust model is based on user consent + hash verification, not runtime isolation. Users are warned in the trust prompt that custom transformers have full Node.js filesystem and network access.
  5. **Built-in transformers are exempt** from the trust model — they ship with the package and are trusted by installation.
  6. **Single-file constraint (v1)**: Custom transformers MUST be self-contained single files with no local imports (e.g., no `import { x } from './utils.ts'`). The trust model hashes only the entry-point file. If a transformer imports a sibling utility that changes, the hash remains unchanged, silently bypassing trust revocation. This is an acknowledged v1 limitation. v2 may introduce transitive dependency hashing or bundle-before-hash. Tool SHOULD detect `import`/`require` statements referencing relative paths in custom transformer files and print a warning.

  This is equivalent in spirit to the npm `postinstall` trust model (or lack thereof): you're trusting the source you chose to use. Tool surfaces this choice explicitly rather than hiding it.

#### Transformers

- **FR-008**: A transformer MUST be a pure function with the signature `(source: ParsedFile, ctx: TransformContext) => RenderedFile | RenderedFile[] | null`. Returning `null` skips the source for this transformer (e.g., skills are skipped by Copilot).
- **FR-009**: Tool MUST run all matching transformers for each source file and write all rendered outputs. Multiple transformers MAY produce outputs for the same source (e.g., one source produces three target files across three AI tools).
- **FR-010** (Header Policy — normative): Generated files MUST carry an auto-generated header as the first line(s) of the file. This FR is the single source of truth; AD-8 references it. The exact header text is:

  `AUTO-GENERATED FROM {{sourcePath}} by underundre-helpers v{{toolVersion}} @ {{sourceCommit}}. DO NOT EDIT. Run: npx underundre-helpers sync`

  Comment syntax wraps the text according to file format:
  - **Markdown / HTML**: `<!-- ${text} -->`
  - **TOML / YAML / hash-comment families**: `# ${text}`
  - **JSONC / JS / TS / C-family**: `// ${text}`
  - **Plain JSON**: header is **NOT** written into the file (JSON has no comments). Provenance for plain-JSON generated files lives **only** in the lock file. Tool MUST refuse to overwrite a plain-JSON file unless its path is recorded in the lock as `kind: generated`. Per-format special case explicitly acknowledged here — no other format gets this exception.
  - **Binary**: header is not applicable. Binary files may only be produced by the `identity` transformer; transforming binary to other formats is out of scope.

  The header is **excluded** from `canonicalHash` (FR-018b) but included in `renderedHash` (the exact bytes-on-disk hash). This means:
  - `renderedHash` detects any byte-level change including header drift.
  - `canonicalHash` detects only meaningful content drift, so a tool-version bump (which changes the header) does not show up as drift in `status --strict`.
- **FR-011** (Generated file validation — two classes): Tool MUST validate that no manually-edited file masquerades as generated. Validation differs by format:

  **Header-capable formats** (Markdown, TOML, YAML, JS, TS, JSONC): On sync, if a generated file's AUTO-GENERATED header is missing, malformed, or refers to a different source path than the lock records, the sync aborts with an actionable error naming the file.

  **Headerless formats** (plain JSON, binary): These formats cannot carry an in-file header (FR-010). Validation relies **exclusively on the lock file**: the file's `path` must appear in `helpers-lock.json` as `kind: "generated"` with matching `transformer` and `fromSource` fields. If a file at a lock-recorded generated path exists but is NOT in the lock, or its lock entry was deleted, the tool treats it as a manual file and refuses to overwrite (exits with error suggesting `remove` or `eject`).

  This split ensures plain-JSON generated files are not falsely flagged for "missing header" — their provenance lives only in the lock.

#### Protected Slots (source files only)

- **FR-012**: Protected Slots apply **only** to files copied via the `identity` transformer or to source files in `.claude/`. Generated files (Copilot/Gemini outputs) MUST NOT contain Protected Slots; any such markers in generated files are an error.
- **FR-013**: Protected Slot markers are format-aware:
  - **Markdown / HTML**: `<!-- HELPERS:CUSTOM START -->` ... `<!-- HELPERS:CUSTOM END -->`
  - **YAML / `.gitignore` / shell / hash-comment files**: `# HELPERS:CUSTOM START` ... `# HELPERS:CUSTOM END`
  - **JS / TS / JSONC / C-family**: `// HELPERS:CUSTOM START` ... `// HELPERS:CUSTOM END`
  - **Plain JSON**: slots are **not supported**. File is fully managed or fully ejected.
- **FR-014**: A file MAY contain multiple Protected Slot blocks. Each is preserved independently. Unbalanced markers fail the operation with a clear error.
- **FR-015** (Interactive Conflict Menus — normative): When a managed source file has local modifications **outside** any Protected Slot (i.e., canonical drift per FR-018b), the tool MUST NOT silently overwrite. Behavior depends on mode and file kind:

  **Non-interactive (default)**:
  - Source file with drift: write new version to `<path>.helpers_new`, leave original untouched. Exit `2`.
  - Generated file with local edits: **silently overwrite** (AD-6: generated files are read-only from the user's perspective; any edit is discarded). Print a warning listing overwritten paths in the run summary. Not an error.
  - Config-class file on `sync`: skipped entirely (FR-006). No warning.

  **Interactive (`--interactive`)**:
  - **Source file with ≥1 Protected Slot**: Prompt `[k]eep / [o]verwrite / [m]erge-via-slots / [d]iff / [a]bort`. `merge-via-slots` keeps the user's slot bodies and updates everything else from source.
  - **Source file with no slots**: Prompt `[k]eep / [o]verwrite / [d]iff / [a]bort`. `merge-via-slots` is **not** offered because there are no slots to merge.
  - **Generated file**: **Never prompt.** Always overwritten (AD-6). Listed in warning summary.
  - **Config-class file on `init`**: Prompt `[k]eep / [o]verwrite / [d]iff / [a]bort`. On `sync`, config files are skipped (see FR-006).

  The `[o]verwrite` choice for a source file with drift is a destructive operation and MUST be subject to FR-004 (requires confirmation even in interactive mode for clarity).

#### Lock File

- **FR-016**: Tool MUST maintain `helpers-lock.json` at the target project root. Schema:

  ```json
  {
    "schema": 1,
    "toolVersion": "1.0.0",
    "source": {
      "url": "https://github.com/underundre/helpers",
      "ref": "v1.0.0",
      "commit": "<full-sha>"
    },
    "installedAt": "2026-04-07T12:00:00Z",
    "targets": ["claude", "copilot", "gemini"],
    "trustedTransformers": [
      {
        "path": "transformers/my-custom.ts",
        "hash": "sha256:...",
        "trustedAt": "2026-04-07T12:00:00Z"
      }
    ],
    "files": [
      {
        "path": ".claude/commands/commit.md",
        "kind": "source",
        "class": "core",
        "sourceCanonicalHash": "sha256:abc...",
        "localCanonicalHash": "sha256:abc...",
        "slotsHash": "sha256:xyz...",
        "status": "managed"
      },
      {
        "path": ".claude/settings.json",
        "kind": "source",
        "class": "config",
        "sourceCanonicalHash": "sha256:...",
        "localCanonicalHash": "sha256:...",
        "status": "config-init"
      },
      {
        "path": ".github/prompts/commit.prompt.md",
        "kind": "generated",
        "transformer": "claude-to-copilot-prompt",
        "fromSource": ".claude/commands/commit.md",
        "renderedHash": "sha256:def...",
        "localRenderedHash": "sha256:def...",
        "status": "managed"
      }
    ]
  }
  ```

  - `sourceCanonicalHash` / `localCanonicalHash` are defined in FR-018b.
  - `slotsHash` is optional (present only on files with ≥1 slot), informational only.
  - `renderedHash` / `localRenderedHash` apply to generated files only.
  - `status` enum: `managed | config-init | orphaned | ejected`.
  - `trustedTransformers` records custom transformer trust decisions (FR-007).
- **FR-017**: Lock file MUST be committed to git. Tool MUST NOT add it to `.gitignore`.
- **FR-018**: All hashes are `sha256` of normalized content (LF line endings, UTF-8 no BOM).

- **FR-018b** (Canonical Hash — drift detection model): To distinguish legitimate edits inside Protected Slots from forbidden drift outside them, the tool MUST compute and store two distinct hashes per source file:
  - **`canonicalHash`**: sha256 of the file content after the following normalization pipeline:
    1. Normalize line endings to LF.
    2. Strip UTF-8 BOM if present (though FR-025 forbids BOM anyway).
    3. For each Protected Slot block, replace the body (content strictly between start and end markers, exclusive) with a fixed placeholder: `\n<<HELPERS:SLOT>>\n`. Markers themselves are preserved.
    4. For generated files: **additionally** strip the auto-generated header line (entire first line if it matches the FR-010 template; otherwise no strip).
    5. Hash the resulting bytes.
  - **`slotsHash`**: sha256 of the concatenation of all slot bodies in document order, separated by `\x00`. Present only on files with ≥1 slot. Informational only — used by `helpers diff` to show "your customizations changed" signals, never causes strict-mode failure.
  - **`renderedHash`** (generated files only): sha256 of the literal bytes on disk, including the header. Used by `helpers doctor` to detect byte-level corruption.

  **Drift detection rules**:
  - A source file has **drift** iff `canonicalHash(local)` ≠ `canonicalHash(lock)`. This means content outside Protected Slots was modified.
  - A generated file has **drift** iff `renderedHash(local)` ≠ `renderedHash(lock)`. Any edit to a generated file is drift (generated files have no slots).
  - `status --strict` exits non-zero iff any tracked file has drift per the above.
  - A file with differing `slotsHash` but identical `canonicalHash` is **not** drift. `helpers status` shows it as `customized` (informational), `--strict` treats it as clean.

#### Network, Security, Atomicity, Recovery

- **FR-019** (Per-file atomic writes): Tool MUST use per-file atomic writes. Staging directory MUST be located at **`<target-project-root>/.helpers/staging/`** — explicitly inside the target project root — to guarantee same-volume semantics for `fs.rename`. If `fs.rename` still returns `EXDEV` (e.g., bind-mounts, overlay filesystems, container edge cases), the tool MUST fall back to `copy + fsync + unlink(src)` with the same pre-rename lock on the destination. Tool MUST NOT use a system-temp directory (e.g., `/tmp`, `%TEMP%`) for staging of final writes.

- **FR-020** (Whole-sync recoverability via Write-Ahead Journal): The tool does **NOT** clai-helpersm whole-tree transactional atomicity — per-file `rename` cannot provide that. Instead:
  1. Before any file mutation, the tool writes a **Write-Ahead Journal** at `<target-project-root>/.helpers/journal.json` containing: run id, plan of operations (ordered list of `{op: write|delete|rename, path, stagedPath?, backupPath?}`), starting lock state hash, target lock state hash. Journal is fsync'd before proceeding.
  2. For every file that will be overwritten or deleted, the tool first **copies the existing file** to `<target>/.helpers/backup/<run-id>/<path>` and records that path in the journal entry.
  3. The tool then applies each planned operation in order. After each operation completes, the corresponding journal entry is marked `done` and the journal is re-fsync'd.
  4. The lock file is updated **last**, only after all journal entries are `done`.
  5. On successful completion, the journal and backup directory are deleted.
  6. On crash: the next invocation of **any** `helpers` command MUST detect the stale journal and refuse to proceed until the user runs `helpers recover`.

- **FR-020b** (Recovery command — `helpers recover`): A new first-class command that, given a stale journal, offers the user two options:
  - **`--resume`**: Re-attempt the plan from the first non-`done` entry. Safe if staging files still exist.
  - **`--rollback`**: Restore all files from the backup directory for this run id, then delete the journal. Returns the project to its exact pre-sync state.
  - **`--abandon`**: Delete the journal and backup without touching files. Dangerous; requires `--yes`. Used when user has already manually fixed the state.

  The guarantee provided to the user is: **"either the sync completes, or `helpers recover --rollback` returns your project byte-identical to its pre-sync state"**. This is weaker than "never half-applied" but achievable and honest.

- **FR-021**: For private source repos, tool MUST read `GH_TOKEN` from env, fall back to `gh auth token` if the `gh` CLI is available, and never persist credentials to disk or to the lock file.
- **FR-022**: A `<target-project-root>/.helpers/lock.pid` advisory file MUST prevent concurrent runs in the same project. The file contains the pid of the running process; stale files (pid not alive) are automatically cleared with a warning.

#### Operational

- **FR-023**: Tool MUST NOT require git submodules in the target.
- **FR-024**: Tool MUST work on Windows, macOS, and Linux. Path separators normalized to `/` in the lock file.
- **FR-025**: Tool MUST refuse to operate on files containing UTF-8 BOM and print actionable error.
- **FR-026**: All commands MUST support `--dry-run` (print intended changes, write nothing).

### Non-Functional Requirements

- **NFR-001**: `init` of the full helpers suite (all three targets) MUST complete in **<10 seconds** on a 50 Mbit/s connection with warm `giget` cache, **<30 seconds** cold-cache.
- **NFR-002**: Tool MUST work offline against a previously cached source if `--offline` is passed (uses `giget`'s cache directory).
- **NFR-003**: All user-visible output MUST be valid UTF-8 and respect `NO_COLOR` env var.
- **NFR-004**: Tool MUST be installable via `npx` without a separate global install step (i.e., the package's `bin` field works correctly).

### Key Entities

- **Source File**: a file under `.claude/` in the source repo, declared by a glob in the manifest's `sources` list.
- **Transformer**: a pure function `(ParsedFile, ctx) => RenderedFile | RenderedFile[] | null` that converts a source into one or more target files in another AI tool's format.
- **Target**: a named group of transformer pipelines (e.g., `claude`, `copilot`, `gemini`). Users opt in/out per target.
- **Generated File**: a file produced by a transformer, written to a path declared in the manifest. Always carries the AUTO-GENERATED header. Read-only from the user's perspective.
- **Manifest** (`helpers.config.ts`, in source): declares sources, targets, and transformer pipelines.
- **Protected Slot**: a delimited region of a **source file** whose content is preserved across syncs.
- **Lock File** (`helpers-lock.json`, in target, committed): records source URL, resolved commit SHA, per-file class/kind/hashes/provenance.
- **Orphan**: a file that was tracked at the previous sync but has been removed from the source manifest. Kept locally; flagged for user resolution.
- **Drift**: any local modification to a tracked file outside Protected Slots (sources) or any local modification to a generated file (always drift).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `init --targets claude,copilot,gemini` of the full helpers suite completes in **<10s warm-cache / <30s cold-cache** on a 50 Mbit/s connection.
- **SC-002**: Across **5 distinct downstream test projects** (synthetic harness in CI), **100%** of source files in `.claude/` and **100%** of generated files for all three targets are correctly produced on `init`, verified by hash comparison against fixtures.
- **SC-003**: Across the same 5 test projects, **100%** of content inside Protected Slots in source files is preserved byte-for-byte after sync.
- **SC-004**: For each built-in transformer (`identity`, `claude-to-copilot-prompt`, `claude-to-copilot-instructions`, `claude-to-copilot-root-instructions`, `claude-to-gemini-command`, `claude-to-gemini-agent`, `claude-to-gemini-root`), at least **one round-trip golden test** validates `source → render → expected output`.
- **SC-005**: Tool runs successfully via `npx underundre-helpers <cmd>` on a system with **only Node 20+ installed** (no global helpers package).
- **SC-006**: `status --strict` correctly identifies drift in **100%** of cases across a deterministic test fixture of **30 drift scenarios** (10 source-edit, 10 generated-edit, 10 orphan).
- **SC-007** (Recoverability, not transactional atomicity): A failed sync (simulated via killed network, killed process, power-loss emulation via `SIGKILL` at random journal offsets) is **100%** recoverable to a consistent state across ≥50 fault-injection runs. Specifically: for every failed run, exactly one of the following holds — (a) `helpers recover --resume` brings the project to the target post-sync state, byte-identical to a clean completion, or (b) `helpers recover --rollback` brings the project to the exact pre-sync state, byte-identical to before the run started. No run leaves the project in a state where both options fail. The tool never reports "done" on a crashed run.
- **SC-008**: Tool operates correctly on Windows, macOS, and Linux runners in CI; same lock file content (after path normalization) on all three platforms.
- **SC-009**: Selective targets work end-to-end: `init --targets claude`, then `add-target copilot`, then `remove-target copilot` results in a project state **byte-identical** to the original `init --targets claude` state.

---

## Out of Scope (v1)

- **3-way merge** (git-style ancestor merge). v1 uses Protected Slots only.
- **uvx / Python distribution**. Node-only.
- **Standalone binary** (pkg, nexe, deno compile). v1 requires Node 20+.
- **GUI / TUI**. CLI only.
- **Plugin system** for runtime-loaded resolvers. Custom transformers are file-path imports declared in manifest, not a plugin registry.
- **Mirror / proxy registry** support.
- **Incremental sync** (file-level diff over the wire). v1 re-fetches on each sync.
- **Encrypted Protected Slots** for secrets. Slots are plaintext only — secrets belong in `.env`.
- **Built-in transformers for Cursor, Aider, Continue.dev, Codeium, Windsurf**. Only Claude / Copilot / Gemini in v1.
- **Bidirectional sync** (changes in generated files flowing back to `.claude/`). One-way only.
- **Watch mode** (`helpers watch` for live regeneration). v1 is invoked manually or by CI only.
- **Deterministic JSON patching**: In v1, JSON files must be either fully managed as identity-copied binaries or treated as `class: config` (write-once at init). Selective key-level JSON patching (e.g., "update `scripts.lint` but preserve all other keys in `package.json`") is deferred to v2. Users who need this should model their config generation as a separate transformer that outputs complete JSON files from templates.
- **Sandboxed custom transformer execution**: Custom transformers run in the host Node.js process with full access. v1 relies on FR-007's trust prompt + hash-pinning. Running transformers in VM / isolated-vm / subprocess with restricted `fs`/`net` permissions is deferred. Users who cannot accept the trust model should avoid sources that declare custom transformers.
- **Transactional whole-tree atomicity**. See FR-020: v1 provides per-file atomicity plus journal-based recoverability via `helpers recover`, not single-transaction "never half-applied" semantics.
- **Custom slot markers**. Users cannot configure their own marker syntax; FR-013 markers are fixed.
- **Slot content versioning / history**. Only the current slot content is preserved. History is the user's git.
- **Partial sync (`--only <glob>`)**: Semantics of scoped discovery, orphan detection, and lock consistency under partial sync are complex. Deferred to v2.
- **Rename-aware sync**: Detecting file renames across versions requires git history or GitHub compare API. `giget` provides flat snapshots only. Renames treated as `delete + add` in v1. Deferred to v2.

---

## Migration Note (for the source repo itself)

This specification implies that `github.com/underundre/helpers` (this repo) must restructure its own content so that `.claude/` is the canonical source, and existing `.github/instructions/` / `.gemini/` content is **derived** from `.claude/`. This migration is a separate task tracked in `tasks.md` once `plan.md` is generated. Until migration is complete, the tool can still be developed and tested against fixture repos in `tests/fixtures/`.
