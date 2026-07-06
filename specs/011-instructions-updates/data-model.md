# Data Model: Instruction-Set Architecture

**Phase**: Phase 1 (entity relationship)
**Date**: 2026-07-05
**Slug**: `011-instructions-updates`

## 1. Entity Overview

Six source entities (canonical instruction files) → four generated targets per tool → one always-loaded root composition.

```text
Canonical Sources                     Transpile Layer                  Generated Targets
==================                    ==============                   =================

.github/instructions/persona/
  copilot-instructions.md   ──────┐  ┌─ identity (copy)      ──► .github/instructions/
  (Foundation)                    ├──┤                          persona/copilot-instructions.md
                                   │  │                          (unchanged verbatim)
  copilot-instructions-ref.md ────┤  └─ identity (copy)      ──► .github/instructions/
  (Reference)                     │                            persona/copilot-instructions-ref.md
                                   │                            (unchanged verbatim)
                                   │
.github/instructions/coding/       │
  copilot-instructions.md   ──────┼──┐ identity (copy)      ──► .github/instructions/
  (Foundation)                    ├──┤                          coding/copilot-instructions.md
                                   │  │                          (unchanged verbatim)
  copilot-instructions-ref.md ────┤  └─ identity (copy)      ──► .github/instructions/
  (Reference)                     │                            coding/copilot-instructions-ref.md
                                   │                            (unchanged verbatim)
                                   │
CLAUDE.md                    ──────┤
  (composition root:               │
   <!-- HELPERS:REF --> markers    │
   + bespoke sections)             │
                                   │
                                   ├── identity (pass-through) ──► CLAUDE.md
                                   │    [Claude target, native resolver handles REF]
                                   │
                                   ├── claude-to-copilot-root-instructions
                                   │    [RESOLVE referencess, inline Foundations]
                                   │                              ──► .github/copilot-instructions.md
                                   │
                                   ├── claude-to-gemini-root
                                   │    [RESOLVE referencess, Foundation only,
                                   │     exclude Reference files]
                                   │                              ──► GEMINI.md
                                   │
                                   └── claude-to-codex-root-instructions (NEW)
                                        [RESOLVE referencess, inline Foundations]
                                                                  ──► AGENTS.md

.github/instructions/persona/security/ (PVE source — 4 brainstorm files)
  copilot-instructions.md        ──────┐
  pve.md                          ──────┤ (curated INTO PVE module)
                                       ├── identity (copy) [optional] ──► .github/instructions/
                                       │   [registered as "pve" target,    pve/copilot-instructions.md
  Intent-Stripper-and-MAD-FW.md   ──────┤    match .github/instructions/
  MAD-and-Latency-and-Cost.md     ──────┘    pve/**/*]
```

## 2. Entity Properties

### Persona Foundation
- **Path**: `.github/instructions/persona/copilot-instructions.md`
- **Size budget**: ≤90 lines / ≤8 KB (SC-004)
- **Contents**: §1 hierarchy (condensed) + §2 identity + §4.1 (Think) + §4.3 (Honesty, condensed) + §4.5 (Anti-Sycophancy) + §4.6–§4.9 (optimization modules) + §7 (boundaries, condensed) + concise ethical principle
- **Lifecycle**: Canonical source — edit here, propagates everywhere
- **Consumer targets**: All four tools (Claude native REF, others inline)

### Persona Reference
- **Path**: `.github/instructions/persona/copilot-instructions-ref.md`
- **Size**: ~200–250 lines (estimated)
- **Contents**: §3 response formats (full) + §5 error playbook (full) + §6 socket architecture + §8 few-shot examples + §4.2 + §4.4 (moved from Foundation to meet budget)
- **Lifecycle**: On-demand — never embedded in always-loaded files
- **Consumer targets**: Only Copilot (via identity copy). Gemini explicitly excluded per maintainer decision.

### Coding Foundation
- **Path**: `.github/instructions/coding/copilot-instructions.md`
- **Size budget**: ≤30 lines / ≤3 KB (SC-011)
- **Contents**: 5 bullets — §2 (Standing Orders), §3 (Stop Conditions), §4 (Universal Principles), §5 (Plumber's Loop), §14 (Anti-Patterns gist)
- **Lifecycle**: Canonical source — edit here, propagates everywhere
- **Consumer targets**: All four tools

### Coding Reference
- **Path**: `.github/instructions/coding/copilot-instructions-ref.md`
- **Size**: ~400–420 lines (estimated — the heavy remainder)
- **Contents**: §1 (full) + §6–§13 (full) + §15–§16 (full) + §14 (full anti-pattern detail + examples) + remaining prose from edited sections
- **Lifecycle**: On-demand — never embedded in always-loaded files
- **Consumer targets**: Only Copilot (via identity copy). Gemini excluded.

### CLAUDE.md (Composition Root)
- **Path**: `./CLAUDE.md`
- **Source-of-truth**: Generated artifact (managed by composition rule FR-015)
- **Contents**: Project overview (bespoke) + `<!-- HELPERS:REF "persona-foundation" -->` + bespoke sections (MCP, Agent Routing, Intent Routing, Quick Ref, Project Ref, Ultrathink, Context Mgmt) + `<!-- HELPERS:REF "coding-foundation" -->`
- **Lifecycle**: Edited via its canonical sources (persona Foundation + coding Foundation) + direct edits to bespoke sections
- **Native resolver**: Claude Code resolves REF markers at load time
- **Gen-time resolution**: Copilot/Gemini/Codex transformers inline Foundation content

### PVE Module
- **Source**: `.github/instructions/persona/security/` (4 existing brainstorm files — `copilot-instructions.md` + `pve.md` are curated into PVE; `Intent-Stripper-and-Multi-Agent-Debate-Framework.md` and `MAD-and-Latency-and-Cost.md` are out of scope)
- **Path**: curated INTO `.github/instructions/pve/copilot-instructions.md` (NEW file)
- **Size**: ~60–80 lines (curated from `.github/instructions/persona/security/` notes)
- **Contents**: Full proportionality/verification framework — values hierarchy + 4-step reasoning engine + output protocol
- **Lifecycle**: Opt-in transpile target; NOT in default output (FR-009)
- **Registration**: `helpers.config.ts` — new optional target `"pve"`, identity transformer, match `.github/instructions/pve/**/*`

## 3. Data Flow: Sync Pipeline

```text
Source edits                      sync/regen                          Generated outputs
───────────                       ──────────                          ─────────────────
persona/copilot-instructions.md ──┐
persona/copilot-instructions-ref  ├── identity ──► persona/*           (unchanged)
coding/copilot-instructions.md ───┤
coding/copilot-instructions-ref ──┘

CLAUDE.md ──┬── identity     ──────────────────────────────► CLAUDE.md           (REF markers preserved)
            ├── claude-to-copilot-root-instructions
            │   [resolveREF] ──────────────────────────────► .github/copilot-instructions.md  (inlined)
            ├── claude-to-gemini-root
            │   [resolveREF, exclude -ref files] ──────────► GEMINI.md            (Foundation only)
            └── claude-to-codex-root-instructions (NEW)
                [resolveREF] ──────────────────────────────► AGENTS.md            (inlined)

.claude/commands/*.md  ── identity [STRICT FLAT LINT] ───────► .agents/commands/*.md (assert no REF markers)

.github/instructions/persona/security/{copilot-instructions,pve}.md ── [manual curate] ──► .github/instructions/pve/copilot-instructions.md
                                                                       └── identity [optional pve target] ──► (same path, pass-through)
```

## 4. Verification Queries

The following queries verify the architecture invariants (mapping to SC):

| Query | Target | Success |
|-------|--------|---------|
| `grep -r "§2 Persona" CLAUDE.md .github/instructions/persona/` | SC-010 | Persona identity prose found in EXACTLY 2 files (canonical Foundation + Reference). Not in CLAUDE.md body (only as REF marker). |
| `wc -l .github/instructions/coding/copilot-instructions.md` | SC-011 | ≤30 lines |
| `wc -l .github/instructions/persona/copilot-instructions.md` | SC-004 | ≤90 lines |
| `grep -r "<!-- HELPERS:REF" .agents/commands/` | FR-022 | 0 matches. Build fails if reference markers exist in commands tree. |
| `grep -r "bypass-protocol\|operational-security\|evasion-guidance" .github/ GEMINI.md AGENTS.md` | SC-007 | 0 matches in generated targets |
| `diff <(git show HEAD:CLAUDE.md | sed -n '/## MCP Priority/,/## Context Management/p') <(sed -n '/## MCP Priority/,/## Context Management/p' CLAUDE.md)` | SC-013 | 0 diff on bespoke sections |
| `npx clai-helpers status --strict` | SC-009 | Exit 0 |
