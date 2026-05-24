# AI Helpers

A collection of prompts, agents, skills, and a CLI tool for AI-assisted development. Write once in Claude format, sync to GitHub Copilot and Google Gemini automatically.

[Русская версия](README.ru.md)

## What's Inside

```
.claude/          # Source of truth: commands, agents, skills
.github/          # Copilot prompts & instructions (auto-generated)
.gemini/          # Gemini commands & agents (auto-generated)
packages/cli/     # CLI tool that does the transpilation
specs/            # Feature specifications and design docs
```

## CLI Tool: `clai-helpers`

The core of this repo. Treats `.claude/` as the single source of truth and transpiles it into Copilot and Gemini formats.

### Install in your project

```bash
npx clai-helpers init --source github:UnderUndre/ai
```

This will generate `.claude/`, `.github/prompts/`, `.github/instructions/`, `.gemini/commands/`, `.gemini/agents/`, `CLAUDE.md`, `GEMINI.md`, and a `helpers-lock.json` lock file.

### Update

```bash
npx clai-helpers sync --upgrade
```

### CI drift detection

```bash
npx clai-helpers status --strict
# Exit code 2 = someone edited a managed file
```

### Selective targets

```bash
# Only Claude (skip Copilot/Gemini)
npx clai-helpers init --source github:UnderUndre/ai --targets claude

# Add Copilot later
npx clai-helpers add-target copilot
```

Full CLI documentation: [packages/cli/README.md](packages/cli/README.md)

## What Gets Synced

| Source (`.claude/`) | Copilot (`.github/`) | Gemini (`.gemini/`) |
|---------------------|----------------------|---------------------|
| `commands/*.md` | `prompts/*.prompt.md` | `commands/*.toml` |
| `agents/*.md` | `instructions/*.instructions.md` | `agents/*.md` |
| `CLAUDE.md` | `copilot-instructions.md` | `GEMINI.md` |
| `skills/**/*` | -- (Claude-specific) | -- (Claude-specific) |

7 built-in transformers handle the format conversion. Custom transformers can be added for other targets (Cursor, Windsurf, etc.).

## Protected Slots

Inject project-specific content that survives across syncs:

```md
<!-- HELPERS:CUSTOM START -->
Your custom content here. Never overwritten by sync.
<!-- HELPERS:CUSTOM END -->
```

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `.claude/commands/` | Claude Code slash commands (54 commands) |
| `.claude/agents/` | Specialist agent definitions (27 agents) |
| `.claude/skills/` | Reusable skill modules (44 skills) |
| `packages/cli/` | The `clai-helpers` npm package |
| `specs/` | Feature specs, plans, contracts, tasks |
| `.specify/` | Spec Kit pipeline: memory (constitution), scripts, templates |
| `.github/instructions/` | Hand-written Copilot instruction files (coding, persona, project) |

## Development

```bash
# CLI tool
cd packages/cli
npm install
npm test        # 128 tests
npm run build   # Compile to dist/
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
