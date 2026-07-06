# Implementation Plan: Instruction-Set Single-Source Architecture & Ethical-Reasoning Baseline

**Branch**: `spec/011-instructions-updates` | **Date**: 2026-07-05 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/011-instructions-updates/spec.md` + `/speckit.clarify` (2026-07-05, 5 Q→A)

## Summary

Consolidate `.github/instructions/persona/copilot-instructions.md` and `.github/instructions/coding/copilot-instructions.md` into lean, single-source Foundations with on-demand References; formalize `CLAUDE.md` as composition of persona-Foundation + coding-Foundation + bespoke sections; adopt four optimization modules (§4.6–§4.9) into persona source; ship concise ethical-reasoning principle by default with full PVE as opt-in transpile target.

**Three work streams**: (A) Source file restructuring (persona split, coding split, CLAUDE.md composition), (B) Pipeline engineering (reference-resolver utility with recursion/loop check, command safety assertion static check, PVE target registration, transformer updates), (C) Content authoring (optimization modules adoption, ethical principle distilment from `.github/instructions/persona/security/` notes).

**Key constraint**: Claude Code is the only tool with native reference-marker resolution; all other targets require generation-time inlining. Codex command transpiles MUST remain flat and throw if references are present.

## Technical Context

**Language/Version**: TypeScript 5.7+, Node.js 20+ (ESM)
**Primary Dependencies**: Existing `clai-helpers` CLI (`packages/cli/`), citty, consola, js-yaml, pathe
**Storage**: File-based (no database) — `.github/instructions/**/*.md`, `CLAUDE.md`, `packages/cli/src/transformers/*.ts`
**Testing**: vitest 3.x (unit tests for transformers with inline assertions, integration tests with golden files)
**Target Platform**: Node.js CLI (the `<slug>` implementation branch); source files are Markdown/TypeScript
**Project Type**: CLI tool + template configuration (instruction-set consolidation)
**Performance Goals**: Persona Foundation ≤90 lines/≤8 KB; Coding Foundation ≤30 lines/≤3 KB; composed Gemini file ≥40% smaller than current 665 lines (target ≤399). Canonical baseline per spec SC-005.
**Constraints**: No duplicate prose across CLAUDE.md and source files after composition; source-of-truth discipline (`.claude/` → generated, never reverse); existing protected-slot markers (`<!-- HELPERS:CUSTOM START/END -->`) must survive regeneration; Codex target currently uses `identity` transformer on `CLAUDE.md` → `AGENTS.md` — needs reference-resolution upgrade
**Scale/Scope**: 3 source files edited + 2 new source files created + 3–4 transformers modified + 1 new optional target registered + `CLAUDE.md` recomposed; ~15–20 files total across the implementation branch

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Rationale |
|-----------|--------|-----------|
| **I. Source of Truth** | PASS | No reverse sync; hand-written persona/coding .md files under `.github/instructions/` are the explicit exception preserved by pipeline exclusion. New Reference files follow same exclusion. |
| **II. Transformer, Not Fork** | PASS | No new directory trees. New reference-resolver utility is shared, not a new directory of targets. PVE target reuses existing optional-target pattern (`persona-phrases`). |
| **III. Protected Slots** | PASS | FR-012 requires protected-slot preservation. CLAUDE.md bespoke sections are not protected slots — they are pipeline sources. |
| **IV. SemVer Discipline** | N/A | No API changes to `clai-helpers` public surface. Internal transformer signatures unchanged (no user-facing API). |
| **V. Token Economy** | WATCH | Adding Reference files increases total file count, but Foundation files reduce always-loaded token consumption — net positive for every downstream session. Reference files are on-demand only. |
| **VI. Cross-AI Review** | PASS | Planning phase only. Implementation will require gate as per constitution. |
| **VII. Artifact Versioning** | PASS | `snapshot-stage.ps1` used for clarify, plan, tasks stages. |
| **VIII. Self-Maintaining** | PASS | No new knowledge patterns required. |
| **IX. Two-Phase Review** | PASS | Current branch is `spec/` prefix (planning phase). Implementation branch (`011-instructions-updates`) created from `main` after planning PR merges. |

**No violations.** The only WATCH is Principle V (Token Economy) — justified because the Foundation/Reference split is the only way to reconcile zero-drift single-source with lean always-loaded. Complexity is proportional to the problem (duplication today is the pain).

## Project Structure

### Documentation (this feature)

```text
specs/011-instructions-updates/
├── spec.md              # Feature specification
├── plan.md              # This file (/speckit.full-plan Phase 1)
├── research.md          # Phase 0: design decisions, alternatives, risks
├── data-model.md        # Phase 1: entity relationship (source files ↔ generated targets)
├── quickstart.md        # Phase 1: maintainer workflow for the new composition
├── contracts/           # Phase 1: interface contracts between layers
│   ├── persona-foundation-contract.md
│   ├── coding-foundation-contract.md
│   └── composition-contract.md
└── tasks.md             # Phase 2 output (/speckit.full-plan Phase 2)
```

### Source Code (repository root)

```text
# After implementation, the relevant tree is:
.github/instructions/
├── persona/
│   ├── copilot-instructions.md          ← EDITED: Foundation (≤90 lines)
│   ├── copilot-instructions-ref.md       ← NEW: Persona Reference
│   └── phrases/copilot-instructions.md   ← UNCHANGED
└── coding/
    ├── copilot-instructions.md           ← EDITED: Foundation (≤30 lines, 5 bullets)
    └── copilot-instructions-ref.md       ← NEW: Coding Reference

CLAUDE.md                                  ← EDITED: reference markers + bespoke sections

# PVE module source — curated FROM existing brainstorm notes:
.github/instructions/persona/security/      ← SOURCE (4 files, unchanged)
├── copilot-instructions.md                 ← values hierarchy source
├── pve.md                                  ← 4-step reasoning engine source
├── Intent-Stripper-and-Multi-Agent-Debate-Framework.md  ← out-of-scope (MAD)
└── MAD-and-Latency-and-Cost.md             ← out-of-scope (MAD)

.github/instructions/pve/                   ← NEW (curated destination)
└── copilot-instructions.md                 ← curated PVE module (60-80 lines)

packages/cli/src/transformers/
├── types.ts                               ← UNCHANGED (TransformerFn signature)
├── registry.ts                            ← EDITED: register new transformer if needed
├── reference-resolver.ts                  ← NEW: shared utility for <!-- HELPERS:REF -->
├── claude-to-copilot-root-instructions.ts ← EDITED: apply reference-resolver
├── claude-to-gemini-root.ts               ← EDITED: apply reference-resolver (Foundation only)
├── claude-to-codex-root-instructions.ts   ← NEW: identity + reference-resolver for Codex
└── ...                                    ← UNCHANGED (identity.ts, copilot-instructions.ts, etc.)

helpers.config.ts                          ← EDITED: PVE optional target, codex pipeline update
```

**Structure Decision**: Single project (DEFAULT) — the existing monorepo with `packages/cli/` for pipeline code and `.github/instructions/` for source content. No new top-level directories. The feature touches both source-of-truth files AND pipeline code, which is normal for this repo.

## Complexity Tracking

> No Constitution violations to justify — leaving empty per template guidance.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| *None* | | |

## Research Summary

See [research.md](research.md) for full Phase 0 analysis. Key findings:

1. **Reference resolution approach**: `<!-- HELPERS:REF "path" -->` marker syntax — explicit file paths (relative to repo root) rather than abstract identifiers. Resolver reads file, extracts body, replaces marker inline. Bounded depth=1 (recursion guard) and guarded against circular/cyclic imports using a tracking set in context.

```typescript
// Code block duplicate search/replace cleanup
// (Removed duplicate placeholder)
```
export interface ResolveContext {
  repoRoot: string;      // absolute path to repo root
  sourcePath: string;    // path of file containing the marker
  visited: Set<string>;  // Set to track visited files and prevent cycle recursion
}

export function resolveReferences(
  content: string,
  context: ResolveContext,
  depth = 0
): string {
  if (depth >= MAX_RESOLVE_DEPTH) {
    throw new Error(
      `Reference resolution depth exceeded (max \${MAX_RESOLVE_DEPTH}) in \${context.sourcePath}. ` +
      `Recursive/nested references are not supported.`
    );
  }

  return content.replace(REF_MARKER_RE, (_match, targetPath: string) => {
    const absolutePath = resolve(context.repoRoot, targetPath);
    
    if (context.visited.has(absolutePath)) {
      throw new Error(
        `Circular reference detected: "\${targetPath}" has already been resolved. ` +
        `Path trace: \${Array.from(context.visited).join(' -> ')} -> \${absolutePath}`
      );
    }
    
    if (!existsSync(absolutePath)) {
      throw new Error(
        `Reference target not found: "\${targetPath}" (resolved to \${absolutePath}). ` +
        `Referenced from marker in \${context.sourcePath}.`
      );
    }
    
    context.visited.add(absolutePath);
    const refContent = readFileSync(absolutePath, 'utf-8');
    // Strip AUTO-GENERATED header if present (between first --- delimiters)
    const body = refContent.replace(/^---[\\s\\S]*?---\\n/, '');
    
    // Resolve nested refs recursively if depth allows
    const resolvedBody = resolveReferences(body, context, depth + 1);
    context.visited.delete(absolutePath); // Backtrack for sibling references
    return resolvedBody;
  });
}
```
1.1 **Command reference validation**: The `identity` transformer (used for commands) or a lint stage in the regeneration CLI pipeline will check files in `.claude/commands/`. If the `REF_MARKER_RE` matches, it throws a build-blocking error to guarantee command-plane flatness.
2. **Split boundaries**: persona Foundation retains §1 (hierarchy) + §2 (identity) + §4 (protocols, expanded with §4.6–§4.9) + §7 (boundaries, heavily condensed to keep under budget) + concise ethical principle = ~80–90 lines. Reference gets §3 (response formats) + §5 (error playbook) + §6 (socket) + §8 (examples) + worked details from §4 = ~220 lines. To satisfy SC-004 within the strict 90-line limit, §7's detailed guidelines are relocated to the Reference file, keeping only a 3-line security anchor in the Foundation.
3. **Coding Foundation**: exactly 5 bullets for §2 Standing Orders, §3 Stop Conditions, §4 Universal Principles, §5 Plumber's Loop, §14 Anti-Patterns = ~25–30 lines. Reference gets §§1,6–13,15–16, full §14 detail + examples.
4. **PVE target**: NEW file `.github/instructions/pve/copilot-instructions.md` — curated from `.github/instructions/persona/security/` notes (primarily `copilot-instructions.md` + `pve.md`; the two `MAD-*.md` files are out of scope), following `persona-phrases` registration pattern.
5. **Codex pipeline**: currently `identity` on CLAUDE.md → AGENTS.md. New `claude-to-codex-root-instructions.ts` transformer = identity wrapper + reference-resolver call. Registered in `helpers.config.ts` codex target.
6. **Gemini baseline alignment**: Spec SC-005 defines Gemini baseline as 665 lines. Any mentions in planning docs describing it as 951 lines refer to an older checkout. We use 665 lines as the canonical baseline, targeting ≤399 lines (≥40% reduction).
