# Transformer Interface Contract

**Version**: 1.0.0 | **Source of truth for FR-008, FR-009, AD-9**

## Transformer Function Signature

```ts
export type TransformerFn = (
  source: ParsedFile,
  ctx: TransformContext
) => RenderedFile | RenderedFile[] | null;
```

### Input: ParsedFile

```ts
interface ParsedFile {
  /** Relative to .claude/ (e.g., "commands/commit.md") */
  sourcePath: string;
  /** Raw file content (UTF-8, LF-normalized) */
  content: string;
  /** Parsed YAML frontmatter, if present. undefined if no frontmatter. */
  frontmatter?: Record<string, unknown>;
  /** Content after frontmatter delimiter. Equals `content` if no frontmatter. */
  body: string;
  /** File extension including dot (e.g., ".md", ".json") */
  extension: string;
}
```

### Input: TransformContext

```ts
interface TransformContext {
  /** Full SHA of the source repo commit */
  sourceCommit: string;
  /** Package version (e.g., "1.0.0") */
  toolVersion: string;
  /** Target name this transformer runs for (e.g., "copilot") */
  targetName: string;
  /** Full resolved manifest */
  config: HelpersConfig;
}
```

### Output: RenderedFile

```ts
interface RenderedFile {
  /** Output path relative to target project root (e.g., ".github/prompts/commit.prompt.md") */
  targetPath: string;
  /** Full rendered content, including auto-generated header */
  content: string;
  /** Always FileKind.Generated for transformer outputs */
  kind: FileKind.Generated;
  /** Source file this was generated from */
  fromSource: string;
  /** Transformer name for provenance tracking */
  transformer: string;
}
```

## Return Semantics

| Return value | Meaning |
|---|---|
| `RenderedFile` | One output file from this source |
| `RenderedFile[]` | Multiple outputs (e.g., command + companion file) |
| `null` | Skip this source for this transformer (no output) |
| Throws | Abort the entire sync with error |

## Built-in Transformers

| Name | Source Match | Output |
|---|---|---|
| `identity` | Any | Same path (used for `.claude/` → `.claude/` copy) |
| `claude-to-copilot-prompt` | `commands/**/*.md` | `.github/prompts/{{name}}.prompt.md` |
| `claude-to-copilot-instructions` | `agents/**/*.md` | `.github/instructions/{{name}}.instructions.md` |
| `claude-to-copilot-root-instructions` | `CLAUDE.md` | `.github/copilot-instructions.md` |
| `claude-to-gemini-command` | `commands/**/*.md` | `.gemini/commands/{{name}}.toml` |
| `claude-to-gemini-agent` | `agents/**/*.md` | `.gemini/agents/{{name}}.md` |
| `claude-to-gemini-root` | `CLAUDE.md` | `GEMINI.md` (root) |

## Transformation Rules (per built-in)

### `identity`

- Copy content verbatim.
- If source has Protected Slots: preserve slot markers in output.
- Remap output path: if source is `CLAUDE.md` (no subdirectory), output to project root `CLAUDE.md`.

### `claude-to-copilot-prompt`

- Extract `description` from frontmatter (if present) or first `# Heading`.
- Write YAML frontmatter: `agent: {{name}}` where `{{name}}` is the filename stem.
- Body: original markdown body (after stripping Claude-specific frontmatter fields like `tools`, `skills`, `model`).
- Prepend auto-generated header as HTML comment.

### `claude-to-copilot-instructions`

- Strip Claude-specific frontmatter entirely (`name`, `tools`, `skills`, `model`).
- Keep `description` as a leading paragraph.
- Body: original markdown body unchanged.
- Prepend auto-generated header.

### `claude-to-copilot-root-instructions`

- Transform Claude root CLAUDE.md into Copilot's root instructions format.
- Rewrite references: `.claude/agents/X.md` → `.github/instructions/X.instructions.md`.
- Rewrite references: `.claude/commands/X.md` → `.github/prompts/X.prompt.md`.
- Strip Claude-specific sections (MCP Priority, Context Management in Russian, etc.) — keep only coding standards and project references.
- Prepend auto-generated header.

### `claude-to-gemini-command`

- Wrap the entire Claude command markdown in TOML `prompt = """..."""` syntax.
- Extract `description` to a top-level TOML `description = "..."` field.
- Embed YAML frontmatter inside the TOML prompt string (Gemini convention).
- Prepend auto-generated header as TOML comment.

### `claude-to-gemini-agent`

- Strip Claude-specific frontmatter fields (`tools`, `model`, `skills`).
- Keep `name` and `description`.
- Body: original markdown unchanged.
- Prepend auto-generated header.

### `claude-to-gemini-root`

- Transform Claude root CLAUDE.md into Gemini's format.
- Rewrite references: `.claude/` → `.gemini/`.
- Produce `.gemini/GEMINI.md` structure with resource hierarchy.
- Prepend auto-generated header.

## Custom Transformer Requirements

1. Must export a default function matching `TransformerFn` signature.
2. Must be a pure function (no side effects, no network, no fs).
3. Must include auto-generated header in output via `ctx` helpers (TBD in implementation).
4. Must return `null` to skip (not throw) when a source isn't applicable.
5. Subject to trust model (FR-007) — hash-pinned in lock file.
