# Manifest Contract: helpers.config.ts

**Version**: 1.0.0 | **Source of truth for FR-005, FR-006**

## Location

`helpers.config.ts` (or `.js`, `.mjs`, `.json`) at the **source repo root**.

Loaded via `c12` with `name: "helpers"`.

## Schema

```ts
import { defineHelpersConfig } from "underundre-helpers";

export default defineHelpersConfig({
  version: 1,

  sources: [
    "commands/**/*.md",
    "agents/**/*.md",
    "skills/**/*.md",
    "CLAUDE.md",
    "settings.json",
  ],

  targets: {
    claude: {
      pipelines: [
        {
          transformer: "identity",
          match: "**/*",
          output: ".claude/{{relativePath}}",
          // class defaults to "core"
        },
        {
          transformer: "identity",
          match: "CLAUDE.md",
          output: "CLAUDE.md",
          class: "core",
        },
        {
          transformer: "identity",
          match: "settings.json",
          output: ".claude/settings.json",
          class: "config", // written only on init
        },
      ],
    },

    copilot: {
      pipelines: [
        {
          transformer: "claude-to-copilot-prompt",
          match: "commands/**/*.md",
          output: ".github/prompts/{{name}}.prompt.md",
        },
        {
          transformer: "claude-to-copilot-instructions",
          match: "agents/**/*.md",
          output: ".github/instructions/{{name}}.instructions.md",
        },
        {
          transformer: "claude-to-copilot-root-instructions",
          match: "CLAUDE.md",
          output: ".github/copilot-instructions.md",
        },
      ],
    },

    gemini: {
      pipelines: [
        {
          transformer: "claude-to-gemini-command",
          match: "commands/**/*.md",
          output: ".gemini/commands/{{name}}.toml",
        },
        {
          transformer: "claude-to-gemini-agent",
          match: "agents/**/*.md",
          output: ".gemini/agents/{{name}}.md",
        },
        {
          transformer: "claude-to-gemini-root",
          match: "CLAUDE.md",
          output: "GEMINI.md",
        },
      ],
    },
  },
});
```

## Type Definitions

```ts
interface HelpersConfig {
  /** Schema version. Must be 1. */
  version: 1;

  /** Glob patterns for source files under .claude/ */
  sources: string[];

  /** Target name → pipeline configuration */
  targets: Record<string, TargetConfig>;
}

interface TargetConfig {
  /** Ordered list of transformer pipelines */
  pipelines: TransformerPipeline[];
}

interface TransformerPipeline {
  /** Built-in transformer name or path to custom .ts/.js file */
  transformer: string;

  /** Source glob to match (relative to .claude/) */
  match: string;

  /**
   * Output path template (relative to target project root).
   * Template variables: {{name}}, {{relativePath}}, {{ext}}
   */
  output: string;

  /** File class. Default: "core" */
  class?: "core" | "config" | "binary";
}
```

## Validation Rules

| Rule | Severity | When checked |
|---|---|---|
| `version` must be `1` | Error | On load |
| `sources` must be non-empty array | Error | On load |
| Every `sources` glob must match ≥1 file in source `.claude/` | Warning | On init/sync |
| Every pipeline `match` must be a subset of `sources` | Error | On load |
| Pipeline `output` must contain valid template variables only | Error | On load |
| Pipeline `transformer` must be a known built-in or valid file path | Error | On load (custom: deferred to trust check) |
| Custom transformer file must exist at declared path | Error | After giget download |
| No two pipelines across all targets may produce the same `output` path | Error | On load |
| `targets` must have at least one entry | Error | On load |

## Template Variables

| Variable | Expansion | Example |
|---|---|---|
| `{{name}}` | Filename stem (no extension) | `commit` from `commands/commit.md` |
| `{{relativePath}}` | Full relative path from `.claude/` | `commands/commit.md` |
| `{{ext}}` | Original extension with dot | `.md` |

## Layering (via --source-config)

When `--source-config ./helpers.local.config.ts` is passed:

1. `c12` loads the source manifest as base layer
2. Local config loaded as `overrides` layer (highest priority)
3. Merge via `defu`: local additions win, base provides defaults

This allows downstream projects to:
- Add custom targets (e.g., Cursor)
- Add custom transformers
- Override pipeline configuration without forking the source
