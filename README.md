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

## CLI Tool: `underundre-clai-helpers`

The core of this repo. Treats `.claude/` as the single source of truth and transpiles it into Copilot and Gemini formats.

### Install in your project

```bash
npx underundre-clai-helpers init --source github:UnderUndre/under-ai-helpers
```

This will generate `.claude/`, `.github/prompts/`, `.github/instructions/`, `.gemini/commands/`, `.gemini/agents/`, `CLAUDE.md`, `GEMINI.md`, and a `helpers-lock.json` lock file.

### Update

```bash
npx underundre-clai-helpers sync --upgrade
```

### CI drift detection

```bash
npx underundre-clai-helpers status --strict
# Exit code 2 = someone edited a managed file
```

### Selective targets

```bash
# Only Claude (skip Copilot/Gemini)
npx underundre-clai-helpers init --source github:UnderUndre/ai --targets claude

# Add Copilot later
npx underundre-clai-helpers add-target copilot
```

Full CLI documentation: [packages/cli/README.md](packages/cli/README.md)

### Plugin Marketplace (feature 006)

Install curated packs from this repo's marketplace instead of the full template:

```bash
# Add the marketplace (inside Claude Code)
/plugin marketplace add UnderUndre/under-ai-helpers

# Install only what you need
/plugin install devx-core@underundre-ai
/plugin install spec-pipeline@underundre-ai
/plugin install security@underundre-ai
```

**8 domain packs**: devx-core, spec-pipeline, backend, frontend, testing, security, ops, extras.

### Permission Presets + Guard Hooks

```bash
# Apply permission presets (allow-list for routine ops, deny-list for secrets)
npx underundre-clai-helpers presets apply

# Preview changes
npx underundre-clai-helpers presets apply --dry-run

# Apply only statusline
npx underundre-clai-helpers presets apply --only statusline
```

Guard hooks (`.claude/hooks/*.mjs`) auto-block destructive commands and secret reads at the harness level — no prompt needed, no bypass possible (even under `--dangerously-skip-permissions`).

### Migrate from legacy full-template install

```bash
# Detect copied components, propose matching packs
npx underundre-clai-helpers migrate --dry-run

# Execute migration (interactive confirm)
npx underundre-clai-helpers migrate
```

### Health Check

```bash
npx underundre-clai-helpers doctor          # Full health matrix
npx underundre-clai-helpers doctor --json   # JSON output
npx underundre-clai-helpers doctor --quiet  # Failures only
```

### Hermes Wrapper

```bash
npx underundre-clai-helpers hermes "prompt"              # Forward prompt
npx underundre-clai-helpers hermes --from-file file.txt  # From file
npx underundre-clai-helpers hermes --background "prompt" # Detached mode
```

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
| `.claude/commands/` | Claude Code slash commands (75 commands) |
| `.claude/agents/` | Specialist agent definitions (27 agents) |
| `.claude/skills/` | Reusable skill modules (43 skills) |
| `.claude/hooks/` | Guard hooks (destructive/secret/post-edit) + advisory hooks |
| `packages/cli/` | The `underundre-clai-helpers` npm package |
| `packages/underboard/` | MCP memory + task board service |
| `presets/` | Permission presets + statusline (feature 006) |
| `packs/` | Generated pack trees for marketplace (feature 006, auto-generated) |
| `specs/` | Feature specs, plans, contracts, tasks |
| `.specify/` | Spec Kit pipeline: memory (constitution), scripts, templates |
| `.github/instructions/` | Hand-written Copilot instruction files (coding, persona, project) |
| `specs/main/` | **Canonical project architecture + requirements** (read this for deep-dive) |
| `docs/target-capabilities.md` | Per-target native-vs-conversion skill matrix |

## Development

```bash
# CLI tool
cd packages/cli
npm install
npm test        # 302 tests
npm run build   # Compile to dist/
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
