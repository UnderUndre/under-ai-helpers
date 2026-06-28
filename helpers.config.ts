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
    // claude target (source-of-truth itself). skillsNative: true.
    claude: {
      skillsNative: true,
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
    // skillsNative: true (feature 006 FR-010/SC-005) — Antigravity reads SKILL.md natively.
    agent: {
      skillsNative: true,
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

  packs: {
    marketplace: {
      name: "underundre-ai",
      owner: {
        name: "UnderUndre",
        email: "underundre@users.noreply.github.com"
      }
    },
    packs: {
      "devx-core": {
        description: "Core developer experience: regen, deps, deploy, bump, commit, enhance, create, debugger, plan, project-planner, devops-engineer, semver, deployment, server-mgmt, plan-writing, bash/powershell, perf, debugging, clean-code, TDD",
        version: "1.0.0",
        agents: ["devops-engineer", "project-planner", "create", "debugger", "enhance", "plan"],
        commands: ["regen", "deps-check", "deploy", "bump", "commit", "create", "debugger", "enhance", "plan", "project-planner", "devops-engineer", "regen"],
        skills: ["semver-versioning", "deployment-procedures", "server-management", "plan-writing", "bash-linux", "powershell-windows", "performance-profiling", "systematic-debugging", "clean-code", "tdd-workflow"],
        hooks: ["intent-hint", "agent-skills-reminder", "session-checkpoint"],
        dependsOn: []
      },
      "spec-pipeline": {
        description: "SpecKit pipeline: spec, plan, clarify, tasks, implement, orchestrate, dispatch, review, analyze, checklist, scope, status, diff, retrospective",
        version: "1.0.0",
        agents: ["orchestrator", "orchestrate", "plan", "project-planner"],
        commands: ["spec", "plan", "speckit.*", "orchestrate", "orchestrate", "dispatch", "orch.status", "orch.tools", "orch.run", "speckit.*"],
        skills: ["plan-writing", "architecture"],
        dependsOn: ["devx-core"]
      },
      "backend": {
        description: "Backend development: API, database, server, deployment, Node.js, Prisma, NestJS, Next.js backend",
        version: "1.0.0",
        agents: ["backend-specialist", "database-architect", "devops-engineer", "nginx", "nginx-config"],
        commands: ["backend-specialist", "database-architect", "devops-engineer", "deploy", "database-architect", "api-patterns", "deployment-procedures", "server-management", "prisma-expert", "nestjs-expert", "nextjs-best-practices"],
        skills: ["api-patterns", "database-design", "deployment-procedures", "server-management", "nodejs-best-practices", "prisma-expert", "nestjs-expert", "nextjs-best-practices"],
        dependsOn: ["devx-core"]
      },
      "frontend": {
        description: "Frontend development: React, Tailwind, Next.js, mobile, game dev, UI/UX",
        version: "1.0.0",
        agents: ["frontend-specialist", "ui-ux-pro-max", "mobile-developer", "game-developer", "game-developer"],
        commands: ["frontend-specialist", "ui-ux-pro-max", "mobile-developer", "game-developer", "game-developer"],
        skills: ["react-patterns", "tailwind-patterns", "nextjs-best-practices", "frontend-design", "mobile-design", "game-development", "game-art", "game-audio", "game-design", "2d-games", "3d-games", "pc-games", "mobile-games", "web-games", "vr-ar", "mobile-games", "mobile-design"],
        dependsOn: ["devx-core"]
      },
      "testing": {
        description: "Testing & quality: unit, integration, E2E, debugging, linting, performance profiling, code review",
        version: "1.0.0",
        agents: ["test-engineer", "debugger", "test", "code-review", "test-engineer", "debugger"],
        commands: ["test", "test-engineer", "debug", "debugger", "fix-tests", "fix-types", "code_review", "lint-and-validate", "test", "test-engineer", "debugger"],
        skills: ["testing-patterns", "webapp-testing", "code-review-checklist", "lint-and-validate", "systematic-debugging", "performance-profiling", "tdd-workflow"],
        dependsOn: ["devx-core"]
      },
      "security": {
        description: "Security: auditing, penetration testing, vulnerability scanning, red team, code review",
        version: "1.0.0",
        agents: ["security-auditor", "penetration-tester"],
        commands: ["security-auditor", "penetration-tester", "security-auditor"],
        skills: ["red-team-tactics", "vulnerability-scanner", "security-auditor", "code-review-checklist"],
        dependsOn: ["devx-core"]
      },
      "ops": {
        description: "Operations: deployment, CI/CD, server management, Docker, Prisma, Nginx, semver, bump, deploy, server mgmt",
        version: "1.0.0",
        agents: ["devops-engineer", "deploy"],
        commands: ["deploy", "devops-engineer", "deploy", "deployment-procedures", "server-management", "semver-versioning", "docker-expert", "prisma-expert", "nginx", "nginx-config", "bump"],
        skills: ["deployment-procedures", "server-management", "semver-versioning", "docker-expert", "prisma-expert", "server-management"],
        dependsOn: ["devx-core"]
      },
      "extras": {
        description: "Extras: mobile, game dev, legacy code, legacy bash hooks, game art/audio/design, 2D/3D/PC/mobile/web/VR games, mobile design, legacy code migration",
        version: "1.0.0",
        agents: ["mobile-developer", "game-developer", "legacy-code", "game-developer"],
        commands: ["mobile-developer", "game-developer", "legacy-code", "game-developer", "game-art", "game-audio", "game-design", "2d-games", "3d-games", "pc-games", "mobile-games", "web-games", "vr-ar", "mobile-games", "mobile-design"],
        skills: ["game-development", "game-art", "game-audio", "game-design", "2d-games", "3d-games", "pc-games", "mobile-games", "web-games", "vr-ar", "mobile-games", "mobile-design", "legacy-code"],
        dependsOn: ["devx-core"]
      }
    }
  },
}
