# Data Model: AI Helpers Distribution System

**Phase 1 output** | **Date**: 2026-04-09

---

## Core Types

### FileKind (enum)

Distinguishes source files (from `.claude/`) from generated outputs (Copilot/Gemini).

```ts
enum FileKind {
  Source = "source",       // File in .claude/, copied from upstream
  Generated = "generated", // File produced by a transformer
}
```

### FileClass (enum)

Determines lifecycle behavior during init and sync.

```ts
enum FileClass {
  Core = "core",     // Synced on every `sync`. Subject to Protected Slots.
  Config = "config", // Written only on `init`. User owns after first write.
  Binary = "binary", // Byte-copied via identity transformer. No slots.
}
```

**State transitions**:
- `core` on `init` → `managed`. On `sync` → re-evaluated (update/drift/orphan).
- `config` on `init` → `config-init`. On `sync` → **skipped** (never touched).
- `binary` follows `core` lifecycle but slots are forbidden.

### FileStatus (enum)

Tracks a file's current management state in the lock file.

```ts
enum FileStatus {
  Managed = "managed",         // Actively tracked and synced
  ConfigInit = "config-init",  // Written once at init, user-owned
  Orphaned = "orphaned",       // Source removed upstream, local kept
  Ejected = "ejected",         // User explicitly untracked
}
```

**State machine**:
```
           init
            │
  ┌─────────┴──────────┐
  │                     │
  ▼                     ▼
managed            config-init
  │                     │
  ├── sync (source deleted) ──► orphaned
  │                     │
  ├── eject ────────────┼──────► ejected
  │                     │
  ├── remove ───────────┼──────► (deleted from disk + lock)
  │                     │
  └── sync (success) ──►│       managed (stays)
                        │
                        └── config never transitions on sync
```

### ExitCode (enum)

```ts
enum ExitCode {
  Success = 0,
  UsageError = 1,
  DriftDetected = 2,
  StaleJournal = 3,
  UntrustedTransformer = 4,
  LockSchemaMismatch = 5,
  InternalError = 10,
}
```

---

## Entities

### HelpersConfig (manifest — loaded from source repo)

Declared in `helpers.config.ts` at source repo root. Loaded via `c12`.

```ts
interface HelpersConfig {
  version: 1;                          // Manifest schema version
  sources: string[];                   // Glob patterns under .claude/ (e.g., "commands/**/*.md")
  targets: Record<string, TargetConfig>;
}

interface TargetConfig {
  pipelines: TransformerPipeline[];
}

interface TransformerPipeline {
  transformer: string;                 // Built-in name or relative path to custom .ts file
  match: string;                       // Source glob to match (e.g., "commands/**/*.md")
  output: string;                      // Output path template (e.g., ".github/prompts/{{name}}.prompt.md")
  class?: FileClass;                   // Default: "core"
}
```

**Template variables in `output`**:
- `{{name}}` — filename without extension (e.g., `commit` from `commit.md`)
- `{{relativePath}}` — path relative to `.claude/` (e.g., `commands/commit.md`)
- `{{ext}}` — original file extension

### LockFile (target project — committed)

```ts
interface LockFile {
  schema: 1;
  toolVersion: string;                         // Package version that created this lock
  source: LockSource;
  installedAt: string;                         // ISO 8601
  targets: string[];                           // Active target names
  trustedTransformers: TrustedTransformer[];
  files: LockFileEntry[];
}

interface LockSource {
  url: string;                                 // e.g., "https://github.com/underundre/helpers"
  ref: string;                                 // Tag, branch, or SHA as requested
  commit: string;                              // Always resolved to full SHA
}

interface TrustedTransformer {
  path: string;                                // Relative path in source repo
  hash: string;                                // sha256 of transformer file
  trustedAt: string;                           // ISO 8601
}

// Discriminated union by `kind`
type LockFileEntry = SourceEntry | GeneratedEntry;

interface BaseLockEntry {
  path: string;                                // Normalized forward-slash path
  status: FileStatus;
}

interface SourceEntry extends BaseLockEntry {
  kind: "source";
  class: FileClass;
  sourceCanonicalHash: string;                 // Hash at sync time (slots stripped)
  localCanonicalHash: string;                  // Hash of local file (slots stripped)
  slotsHash?: string;                          // Hash of slot content only (optional)
}

interface GeneratedEntry extends BaseLockEntry {
  kind: "generated";
  transformer: string;                         // Transformer name that produced this
  fromSource: string;                          // Source file path this was generated from
  renderedHash: string;                        // Expected hash of generated output
  localRenderedHash: string;                   // Actual hash on disk
}
```

### Journal (Write-Ahead Log — `.helpers/journal.json`)

```ts
interface Journal {
  runId: string;                               // UUID for this run
  command: "init" | "sync";                    // Which command started this run
  startedAt: string;                           // ISO 8601
  preLockHash: string;                         // SHA-256 of lock file before run
  postLockHash: string;                        // Expected SHA-256 of lock file after run
  operations: JournalOperation[];
}

interface JournalOperation {
  id: number;                                  // Sequential index
  op: "write" | "delete" | "rename";
  path: string;                                // Target file path
  stagedPath?: string;                         // Path in .helpers/staging/ (for writes)
  backupPath?: string;                         // Path in .helpers/backup/<runId>/ (for overwrites)
  done: boolean;                               // Marked true after successful completion
}
```

### Transformer Types

```ts
interface ParsedFile {
  sourcePath: string;                          // Relative to .claude/ (e.g., "commands/commit.md")
  content: string;                             // Raw file content
  frontmatter?: Record<string, unknown>;       // Parsed YAML frontmatter (if present)
  body: string;                                // Content after frontmatter
  extension: string;                           // e.g., ".md"
}

interface TransformContext {
  sourceCommit: string;                        // Full SHA of source repo
  toolVersion: string;                         // Package version
  targetName: string;                          // e.g., "copilot", "gemini"
  config: HelpersConfig;                       // Full resolved manifest
}

interface RenderedFile {
  targetPath: string;                          // Output path (e.g., ".github/prompts/commit.prompt.md")
  content: string;                             // Full rendered content including header
  kind: FileKind;                              // Always "generated" for transformer output
  fromSource: string;                          // Source path this was generated from
  transformer: string;                         // Transformer name
}

type TransformerFn = (
  source: ParsedFile,
  ctx: TransformContext
) => RenderedFile | RenderedFile[] | null;
```

---

## Relationships

```
HelpersConfig (source repo)
  └── targets
       └── pipelines[]
            ├── match → SourceFiles[]
            └── transformer → TransformerFn → RenderedFile[]

LockFile (target project)
  ├── source → { url, ref, commit }
  ├── targets[] → active target names
  ├── trustedTransformers[] → { path, hash }
  └── files[]
       ├── SourceEntry → tracks .claude/ files
       └── GeneratedEntry → tracks transformed outputs
            └── fromSource → links back to SourceEntry.path

Journal (.helpers/journal.json)
  └── operations[]
       └── each references a file path in LockFile.files[]
```

---

## Validation Rules

| Entity | Rule | Enforcement |
|---|---|---|
| HelpersConfig | `version` must be `1` | Checked on load; mismatch = error |
| HelpersConfig | All `sources` globs must match ≥1 file | Warning (not error) |
| HelpersConfig | All transformer `match` must be subset of `sources` | Error on load |
| LockFile | `schema` must be `1` | Exit code 5 if mismatch |
| LockFile | Every `GeneratedEntry.fromSource` must reference existing `SourceEntry.path` | `doctor` checks this |
| LockFileEntry | `path` uses `/` separators, never `\` | Normalized on write |
| Journal | Exactly one journal at a time (`.helpers/lock.pid` prevents races) | FR-022 |
| Journal | All `done: false` entries = incomplete run | Triggers `helpers recover` |
| ProtectedSlot | Every start marker must have matching end marker | Error on parse |
| ProtectedSlot | Slots only on `kind: source` files with `class: core` | Error if found in generated |
| TransformerFn | Must be pure (no side effects) | Convention, not enforced at runtime |
