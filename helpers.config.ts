// @ts-check
/** @type {import("clai-helpers").HelpersConfig} */
export default {
  version: 1,

  sources: [
    // AI prompts, commands, agents, skills (root-relative paths)
    ".claude/commands/**/*.md",
    ".claude/agents/**/*.md",
    ".claude/skills/**/*",
    "CLAUDE.md",
    // Copilot instructions (already-formatted, copy as-is)
    ".github/instructions/**/*.md",
    // Speckit pipeline scripts
    ".specify/**/*",
  ],

  targets: {
    claude: {
      pipelines: [
        {
          transformer: "identity",
          match: ".claude/**/*",
          output: "{{relativePath}}",
        },
        {
          transformer: "identity",
          match: "CLAUDE.md",
          output: "CLAUDE.md",
          class: "core",
        },
      ],
    },

    copilot: {
      pipelines: [
        {
          transformer: "claude-to-copilot-prompt",
          match: ".claude/commands/**/*.md",
          output: ".github/prompts/{{name}}.prompt.md",
        },
        {
          transformer: "claude-to-copilot-instructions",
          match: ".claude/agents/**/*.md",
          output: ".github/instructions/{{name}}.instructions.md",
        },
        {
          transformer: "claude-to-copilot-root-instructions",
          match: "CLAUDE.md",
          output: ".github/copilot-instructions.md",
        },
        {
          transformer: "identity",
          match: ".github/instructions/**/*.md",
          output: "{{relativePath}}",
        },
      ],
    },

    gemini: {
      pipelines: [
        {
          transformer: "claude-to-gemini-command",
          match: ".claude/commands/**/*.md",
          output: ".gemini/commands/{{name}}.toml",
        },
        {
          transformer: "claude-to-gemini-agent",
          match: ".claude/agents/**/*.md",
          output: ".gemini/agents/{{name}}.md",
        },
        {
          transformer: "claude-to-gemini-root",
          match: "CLAUDE.md",
          output: "GEMINI.md",
        },
      ],
    },

    speckit: {
      pipelines: [
        {
          transformer: "identity",
          match: ".specify/**/*",
          output: "{{relativePath}}",
        },
      ],
    },

    // Antigravity IDE target. Reads from `.agent/` layout: agents/, skills/,
    // workflows/ (commands live in workflows/ for Antigravity, confirmed
    // empirically against installed app as of 2026-04-25 — NOT .agent/commands/
    // как утверждают сторонние гайды). Auto-regenerated via identity transformer
    // so it cannot drift from `.claude/`. Principle II forbids hand-maintained mirrors.
    agent: {
      pipelines: [
        {
          transformer: "identity",
          match: ".claude/agents/**/*",
          output: ".agent/agents/{{subpath}}",
        },
        {
          transformer: "identity",
          match: ".claude/skills/**/*",
          output: ".agent/skills/{{subpath}}",
        },
        {
          transformer: "identity",
          match: ".claude/commands/**/*",
          output: ".agent/workflows/{{subpath}}",
        },
      ],
    },

    // Codex Desktop App target. Confirmed empirically against ChatGPT Desktop
    // with Codex tool as of 2026-04-25 — the app suggests `.agents/commands/`
    // (plural `.agents`) for Claude-style commands. Not yet in OpenAI's
    // published docs; revisit if app changes convention.
    // AGENTS.md is the cross-tool foundation file read by both Codex Desktop
    // and Antigravity v1.20.3+ — single output serves both.
    codex: {
      pipelines: [
        {
          transformer: "identity",
          match: ".claude/commands/**/*.md",
          output: ".agents/commands/{{name}}.md",
        },
        {
          transformer: "identity",
          match: "CLAUDE.md",
          output: "AGENTS.md",
          class: "core",
        },
      ],
    },

    // Optional: Valera persona catchphrases (Russian-flavored). Consumer repos
    // that don't want cultural/language flavor in their AI prompts should omit
    // this target. Core persona (without phrases) is in `.github/instructions/
    // persona/copilot-instructions.md` and ships via copilot/gemini targets
    // unconditionally. See Principle V.
    "persona-phrases": {
      pipelines: [
        {
          transformer: "identity",
          match: ".github/instructions/persona/phrases/**/*",
          output: "{{relativePath}}",
        },
      ],
    },
  },
};
