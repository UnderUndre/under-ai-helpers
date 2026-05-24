# Quickstart: underundre-helpers

## Prerequisites

- Node.js 20+
- npm (comes with Node)

## Install in a new project

```bash
# In your project directory
npx underundre-helpers init
```

This will:
1. Download the latest tagged release from `github.com/underundre/helpers`
2. Copy `.claude/` files (commands, agents, persona, CLAUDE.md)
3. Generate `.github/prompts/`, `.github/instructions/`, `.github/copilot-instructions.md` for Copilot
4. Generate `.gemini/commands/`, `.gemini/agents/`, `GEMINI.md` for Gemini
5. Create `helpers-lock.json` (commit this!)

## Pin to a version

```bash
npx underundre-helpers init --version v1.0.0
```

## Only Claude (skip Copilot/Gemini)

```bash
npx underundre-helpers init --targets claude
```

## Update to latest

```bash
npx underundre-helpers sync --upgrade
```

## Check drift (CI)

```bash
npx underundre-helpers status --strict
# Exit code 2 = someone edited a managed file
```

## Customize without breaking sync

Add Protected Slots in your `CLAUDE.md`:

```md
# Some managed section (will be updated on sync)

<!-- HELPERS:CUSTOM START -->
Your project-specific content here.
This block is preserved across syncs.
<!-- HELPERS:CUSTOM END -->

# Another managed section
```

## Add a target later

```bash
npx underundre-helpers add-target copilot
```

## Untrack a file

```bash
npx underundre-helpers eject .claude/commands/deploy.md
```

The file stays on disk but won't be managed by sync anymore.

## Recovery after crash

If sync crashes mid-way:

```bash
npx underundre-helpers recover --rollback   # undo everything
# or
npx underundre-helpers recover --resume     # continue where it left off
```

## See what's tracked

```bash
npx underundre-helpers status
npx underundre-helpers list-transformers
npx underundre-helpers doctor
```
