import { defineHelpersConfig } from "clai-helpers";

export default defineHelpersConfig({
  version: 1,

  sources: ["commands/**/*.md", "agents/**/*.md", "CLAUDE.md", "settings.json"],

  targets: {
    claude: {
      pipelines: [
        {
          transformer: "identity",
          match: "**/*",
          output: ".claude/{{relativePath}}",
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
          class: "config",
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
