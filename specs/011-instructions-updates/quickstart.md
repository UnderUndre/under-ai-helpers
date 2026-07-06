# Quickstart: Maintaining the Instruction-Set Architecture

**Slug**: `011-instructions-updates`
**Audience**: Maintainers of the `under-ai-helpers` instruction set

## The Two Foundations

After this feature ships, the repo has two canonical Foundation sources — edit THESE files when you want to change always-loaded persona or coding rules:

| File | Budget | Purpose |
|------|--------|---------|
| `.github/instructions/persona/copilot-instructions.md` | ≤90 lines/≤8 KB | Persona identity + interaction protocols + ethical principle + optimization modules (§4.6–§4.9) |
| `.github/instructions/coding/copilot-instructions.md` | ≤30 lines/≤3 KB | 5 coding-standards bullets (Standing Orders, Stop Conditions, Universal Principles, Plumber's Loop, Anti-Patterns gist) |

**These are the single source of truth** for persona and coding rules respectively. Everything else derived from them.

## Daily Workflow

### 1. Edit a Foundation → sync → done

```bash
# 1. Edit the Foundation file
# 2. Regenerate all targets:
npx clai-helpers sync
# 3. Verify no drift:
npx clai-helpers status --strict
```

Your change propagates to ALL four tools (Claude, Copilot, Gemini, Codex) automatically. No manual edits to `CLAUDE.md`, `.github/copilot-instructions.md`, `GEMINI.md`, or `AGENTS.md`.

### 2. Need the full normative text of a coding rule?

Open the on-demand Reference:

```
.github/instructions/coding/copilot-instructions-ref.md   # Full §1–§16
.github/instructions/persona/copilot-instructions-ref.md   # Heavy persona material
```

These are NOT always-loaded. They're available only when you explicitly open them or when your AI tool accesses them via a reference link in the Foundation.

### 3. Edit a bespoke section of CLAUDE.md

Bespoke sections (MCP Priority, Agent Routing, Intent Routing, Quick Reference, Project Reference, Ultrathink, Context Management) are edited **directly in `CLAUDE.md`**. They are NOT part of the Foundation composition.

```bash
# Edit CLAUDE.md directly for bespoke sections
# Then regenerate to update downstream files:
npx clai-helpers sync
```

### 4. Add a new persona rule (e.g., §4.10)

Add it to the persona Foundation file **and** check the Foundation stays within the ≤90-line budget. If it overflows:
- Either condense existing Foundation sections to make room
- Or move material to the Reference file and link from the Foundation

### 5. Distil a new coding-standards section into the Foundation

If you add a §17 to the coding source:
1. Update the full text in `coding/copilot-instructions-ref.md` (Reference)
2. Consider: does this section belong in the Foundation (always-loaded) or just Reference?
3. If yes → rewrite `coding/copilot-instructions.md` with a new bullet; stay within ≤30 lines
4. If no → Reference-only (the default for new heavy sections)

### 6. Opt in to the PVE module

```bash
# In helpers.config.ts, add "pve" to the targets list for your environment:
# (Not in the repo's default helpers.config.ts — done in consumer repos)
```

The PVE module ships as an opt-in transpile target. It's NEVER in the default output.

## What NOT to Do

| DON'T | Why | Instead |
|-------|-----|---------|
| Edit `.github/copilot-instructions.md` directly | Generated file — overwritten by `sync` | Edit `.github/instructions/persona/copilot-instructions.md` |
| Duplicate persona prose in `CLAUDE.md` | Composition rule (FR-015) forbids it | Use `<!-- HELPERS:REF -->` markers |
| Edit `GEMINI.md` directly | Generated | Edit the Foundation sources + `sync` |
| Hand-edit persona/Coding Reference files in a consumer repo | Not the canonical source | Edit upstream in `.github/instructions/` + publish |

## Troubleshooting

**"Reference target not found" error on sync**
→ The `<!-- HELPERS:REF "..." -->` path points to a non-existent file. Verify the relative path from repo root.

**"Circular reference detected" build error on sync**
→ A nested reference loops back into a file that is already in the resolution lifecycle. Flatten the reference structure (references should only be 1 level deep).

**"Command-plane reference forbidden" build error on sync**
→ You attempted to use a `<!-- HELPERS:REF "..." -->` reference marker inside a command file under `.claude/commands/`. Commands must remain flat. Replace the marker with inline copy or remove it.

**"Coding Foundation exceeds 30 lines"**
→ Condense the bullets. Each bullet should be ~1 line of gist + 1 line of Reference pointer. Move examples to Reference.

**"Persona Foundation exceeds 90 lines"**
→ Move heavy sub-sections to the Reference. Candidates: §4.2 (Cognitive Hacks), §4.4 (Communication Frameworks).

**Bespoke section changed unexpectedly after sync**
→ The composition contract (FR-015 + SC-013) guarantees bespoke sections survive byte-for-byte. If they changed, the regeneration pipeline has a bug — check the transformer for the target that changed.

## Reference: Transformer Pipeline

```bash
# All relevant files:
packages/cli/src/transformers/
├── reference-resolver.ts                   # Shared REF marker engine
├── claude-to-copilot-root-instructions.ts  # Copilot: inlines Foundations
├── claude-to-gemini-root.ts                # Gemini: inlines Foundations-only
└── claude-to-codex-root-instructions.ts    # Codex: inlines Foundations (NEW)
```
