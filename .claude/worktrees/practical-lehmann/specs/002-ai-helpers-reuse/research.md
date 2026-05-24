# Research: AI Helpers Distribution System

**Phase 0 output** | **Date**: 2026-04-09

---

## R-001: giget Programmatic API

**Decision**: Use `giget` v2.x as the fetch layer for downloading source repos.

**Key API findings**:

```ts
import { downloadTemplate } from "giget";

const result = await downloadTemplate("github:underundre/helpers#v1.0.0", {
  dir: "./output",          // destination directory
  auth: process.env.GH_TOKEN,  // Bearer token for private repos
  offline: true,            // cache-only, no network
  preferOffline: true,      // cache first, fallback to download
  force: true,              // overwrite existing dir
  forceClean: true,         // clean dir before extraction
});
// result = { dir: string, source: string, url: string }
```

- **Source format**: `"github:owner/repo#ref"` — ref = tag, branch, or SHA. Subpath: `"github:owner/repo/subdir#ref"`. Subgroup notation: `"::"` for nested GitLab groups.
- **Caching**: Built-in. Files cached to OS temp dir. `offline: true` = cache-only. `preferOffline: true` = cache-first.
- **Auth**: `auth` option → `Authorization: Bearer <token>`. Also reads `GIGET_AUTH` env var. Sufficient for private repos.
- **Return**: `{ dir, source, url }` — `dir` = local path to extracted content.

**Rationale**: giget is battle-tested by Nuxt (millions of installs). Handles GitHub API, tarball extraction, caching — exactly what we need. No git clone overhead.

**Alternatives considered**:
- `degit` — simpler but less maintained, no auth API, no cache control.
- `node-fetch` + GitHub API manual — reinvents what giget already provides.
- `simple-git` (clone) — slower, heavier, requires full git install.

**Integration note**: giget downloads entire repo to a temp dir. We then read files from there based on manifest `sources` globs. This means we fetch the whole repo once and filter locally, not per-file fetch. This is fine for repos with <1000 files (our typical case).

**Auth note for spec**: Spec says `GH_TOKEN` env var (FR-021). giget reads `GIGET_AUTH` natively. We should map: `GH_TOKEN || GIGET_AUTH`, then fall back to `gh auth token`. Implementation wrapper needed.

---

## R-002: c12 Config Loader

**Decision**: Use `c12` to load `helpers.config.ts` from the downloaded source repo.

**Key API findings**:

```ts
import { loadConfig } from "c12";

const { config, configFile, layers } = await loadConfig({
  cwd: "/path/to/downloaded/source",
  name: "helpers",            // looks for helpers.config.{ts,js,mjs,json,...}
  // configFile: "helpers.config",  // alternative explicit name
  defaults: { version: 1 },  // lowest priority defaults
  overrides: { /* from --source-config */ },  // highest priority overrides
});
```

- **TypeScript support**: Native via built-in `jiti` (JIT TypeScript execution). No `tsx`, no `ts-node` needed.
- **Layering**: `extends` key in config for chaining. `defaults` (lowest priority), `overrides` (highest). Merge via `defu` (deep merge, first-defined wins).
- **Return**: `{ config: object, configFile?: string, layers?: Array<{ config, configFile, cwd }> }`.

**Rationale**: c12 is the UnJS standard config loader. Used by Nuxt, Nitro, unbuild. Native TS/JS/JSON support. Layering solves our `--source-config` override use case natively.

**Alternatives considered**:
- `cosmiconfig` — popular, but no native TS support without plugins.
- Custom TS loader via `jiti` directly — works, but reimplements c12's layering logic.
- JSON-only manifest — loses TypeScript types and IntelliSense in source repo.

**Integration pattern**: 
1. `giget` downloads source repo → temp dir
2. `c12` loads `helpers.config.ts` from that temp dir
3. If user passed `--source-config`, load it as `overrides` layer
4. Result = merged manifest with all source paths, targets, and transformer pipelines

---

## R-003: AI Tool File Format Mappings

**Decision**: Transform `.claude/` markdown files into Copilot and Gemini native formats using declared transformer functions.

### Source Format: Claude Commands (`.claude/commands/*.md`)

```md
# Command Title

$ARGUMENTS

## Section
Content...
```

- **Frontmatter**: Optional. Only `description` field is common. Many commands have NO frontmatter.
- **Body**: Markdown with `# Title`, sections, code blocks. `$ARGUMENTS` placeholder for user input.
- **Convention**: Filename = command name (e.g., `commit.md` → `/commit`).

### Source Format: Claude Agents (`.claude/agents/*.md`)

```md
---
name: agent-name
description: Agent purpose...
tools: [Read, Grep, Glob, Bash, Edit, Write]
model: inherit
skills: clean-code, systematic-debugging
---

# Agent Title

Body with philosophy, mindset, decision processes...
```

- **Frontmatter**: YAML. Fields: `name`, `description`, `tools` (array), `model`, `skills` (comma-separated).
- **Body**: Rich markdown — philosophy, phases, decision frameworks.

### Target: GitHub Copilot Prompts (`.github/prompts/*.prompt.md`)

```md
---
agent: agent-name
---
```

- **Frontmatter**: Minimal — only `agent` field mapping to an agent name.
- **Body**: Often empty in this repo (agent routing).
- **Transformation logic**: Extract command body as prompt content. Map `$ARGUMENTS` to Copilot's `{{input}}` syntax (if applicable). Set `agent` in frontmatter if the command references an agent.

### Target: GitHub Copilot Instructions (`.github/instructions/*.instructions.md`)

- **Frontmatter**: None.
- **Body**: Full markdown with rules, guidelines, coding standards.
- **Naming convention**: File named `copilot-instructions.md` in topic subdirs.
- **Transformation logic**: Strip Claude-specific frontmatter (`tools`, `skills`, `model`). Keep `description` as first paragraph. Preserve body.

### Target: GitHub Copilot Root (`.github/copilot-instructions.md`)

- **No frontmatter**, just markdown.
- **Acts as router** — references sub-instruction files.
- **Transformation logic from `.claude/CLAUDE.md`**: Rewrite agent routing table to reference `.github/instructions/` paths instead of `.claude/agents/`.

### Target: Gemini Commands (`.gemini/commands/*.toml`)

```toml
description = "Command purpose."

prompt = """
---
description: Command purpose.
---

## Section
Content with $ARGUMENTS placeholder...
"""
```

- **TOML wrapper** around embedded markdown prompt.
- **Fields**: `description` (top-level string), `prompt` (multi-line string containing YAML frontmatter + markdown).
- **Transformation logic**: Wrap Claude command body in TOML `prompt = """..."""` string. Copy `description` to top-level TOML field.

### Target: Gemini Root (`.gemini/GEMINI.md` and root `GEMINI.md`)

- Plain markdown. Separate structure from `CLAUDE.md`.
- Contains directory mapping, resource hierarchy.
- **Transformation logic from `.claude/CLAUDE.md`**: Rewrite directory references from `.claude/` to `.gemini/`. Adjust resource hierarchy section.

**Key implementation notes**:
- Copilot prompt files are intentionally minimal (agent routing stubs). For rich prompts, the body from Claude command should be injected.
- Gemini TOML format wraps markdown inside a `prompt` field — this is a string escape + wrapper operation, not a deep parse.
- `$ARGUMENTS` placeholder is universal across all formats — no rewriting needed.
- Claude `tools` and `skills` frontmatter has no Copilot/Gemini equivalent — dropped during transform.

---

## R-004: CLI Framework Selection

**Decision**: Use `citty` (UnJS) for CLI framework.

**Rationale**: Same ecosystem as giget/c12. Typed args, subcommands, auto-help. Tiny footprint. Used by Nuxt CLI.

**Alternatives considered**:
- `commander.js` — mature but verbose, no native TS types for subcommands.
- `yargs` — powerful but heavy, pulls in many deps.
- `cac` — good but less maintained than citty.
- `clipanion` (Yarn) — good TS support but complex plugin model we don't need.

---

## R-005: Hashing Strategy

**Decision**: Use `ohash` for SHA-256 (from UnJS) or Node.js built-in `crypto.createHash('sha256')`.

**Rationale**: `ohash` is tiny and consistent across platforms. But `crypto` is built-in with zero deps. For v1, use `crypto` directly — no extra dependency for a single function.

**Final choice**: Node.js built-in `crypto.createHash('sha256')`. Drop `ohash` from deps.

---

## R-006: Protected Slots Parsing

**Decision**: Custom regex-based parser per format (not AST).

**Rationale**: Slot markers are simple line-level patterns. No need for full markdown/YAML/TS AST. A regex scanner that finds matching start/end markers and captures the body between them is sufficient and fast.

**Implementation approach**:
1. Map file extension → marker pair (FR-013 in spec).
2. Scan file line-by-line. When start marker found, begin capturing.
3. When end marker found, store captured body as a slot.
4. Validate: every start has an end. Unbalanced = error.
5. On merge: rebuild file by replacing slot bodies with previously captured content.

**Edge case**: Nested slots? Spec doesn't mention them. Decision: **not supported**. A start marker inside an existing slot body is treated as literal text, not a nested slot. This keeps the parser simple and deterministic.

---

## R-007: EXDEV Fallback Strategy

**Decision**: `fs.rename` with fallback to `fs.copyFile` + `fs.unlink` on `EXDEV` error.

**Implementation**:
```ts
async function atomicMove(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      await fs.copyFile(src, dest);
      await fs.unlink(src);
    } else {
      throw err;
    }
  }
}
```

**Note**: Staging dir at `<target>/.helpers/staging/` should be on the same volume as target in the vast majority of cases. EXDEV fallback is a safety net for Docker bind-mounts and other edge cases.
