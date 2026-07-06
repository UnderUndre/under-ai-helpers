# Research: Instruction-Set Single-Source Architecture

**Phase**: Phase 0 (design decisions & alternatives)
**Date**: 2026-07-05
**Slug**: `011-instructions-updates`

## 1. Reference Resolution Mechanism

### Problem

`CLAUDE.md` needs to compose persona-Foundation + coding-Foundation without duplicating their prose inline. Claude Code natively resolves reference markers at load time; Copilot, Gemini, and Codex do not.

### Candidate Solutions

| Approach | Pros | Cons |
|----------|------|------|
| **A. `<!-- HELPERS:REF "path" -->` marker** — explicit relative file path as marker content | - Simple to implement (string replace)
- Self-documenting (the path tells what's included)
- No new config/registry needed
- Works with any transformer | - Path is relative to repo root, not to CLAUDE.md's position
- Broken paths fail at gen time with clear error
- Single level (no chaining) by design |
| **B. `{include path}` mustache/handlebars-style** | - Familiar syntax from templating | - Requires template engine dependency
- Conflicts with existing `{{ }}` in `helpers.config.ts`
- Over-engineered for single-level include |
| **C. Abstract identifier registry** (e.g., `<!-- HELPERS:REF persona-foundation -->` with a mapping config) | - Decouples marker from filesystem path | - Adds registry maintenance burden
- Another config file to manage
- No clear benefit over direct path |
| **D. Compose at the CLI/distribution level** (e.g., `clai-helpers compose CLAUDE.md`) | - Clean separation of concerns | - Adds a new CLI command
- Pipelines already handle the same problem
- More moving parts |

**Decision**: **Approach A** (`<!-- HELPERS:REF "path" -->`). Minimal surface area, self-documenting, implementable as a shared utility function in ~30 lines. Rejected B (unnecessary dependency), C (registry overhead), D (new command when pipeline already exists).

### Resolution Rules

- Marker syntax: `<!-- HELPERS:REF "relative/path/to/file.md" -->` (path relative to repo root).
- Resolver reads target file, extracts body content (strips AUTO-GENERATED header if present), replaces marker inline.
- Single level only. If resolved file contains another `<!-- HELPERS:REF -->`, resolver throws (bounded recursion per FR-013 edge case).
- **Cycle detection**: resolver tracks absolute file paths in `context.visited: Set<string>`. If a path is revisited (A → B → A loop, or A → A self-reference), resolver throws instantly instead of stack-overflowing. Aligned with plan.md §Research Summary and antigravity F3 fix.
- Missing target file → resolver throws with clear error message (safe-fail per Edge Cases).
- Result is cached per resolve call (same path appears multiple times in one file? improbable for CLAUDE.md but supported statelessly).

### Implementation

New file `packages/cli/src/transformers/reference-resolver.ts`:

```typescript
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { TransformerFn, RenderedFile, ParsedFile } from './types';

const REF_MARKER_RE = /<!-- HELPERS:REF "([^"]+)" -->/g;
const MAX_RESOLVE_DEPTH = 1;

export interface ResolveContext {
  repoRoot: string;          // absolute path to repo root
  sourcePath: string;        // path of file containing the marker
  visited: Set<string>;      // cycle guard — absolute paths already resolved
}

export function resolveReferences(
  content: string,
  context: ResolveContext,
  depth = 0
): string {
  if (depth >= MAX_RESOLVE_DEPTH) {
    throw new Error(
      `Reference resolution depth exceeded (max ${MAX_RESOLVE_DEPTH}) in ${context.sourcePath}. ` +
      `Recursive/nested references are not supported.`
    );
  }

  return content.replace(REF_MARKER_RE, (_match, targetPath: string) => {
    const absolutePath = resolve(context.repoRoot, targetPath);
    if (context.visited.has(absolutePath)) {
      throw new Error(
        `Reference cycle detected: "${targetPath}" (resolved to ${absolutePath}) ` +
        `was already visited. Chain: ${[...context.visited, absolutePath].join(' → ')}.`
      );
    }
    if (!existsSync(absolutePath)) {
      throw new Error(
        `Reference target not found: "${targetPath}" (resolved to ${absolutePath}). ` +
        `Referenced from marker in ${context.sourcePath}.`
      );
    }
    context.visited.add(absolutePath);
    const refContent = readFileSync(absolutePath, 'utf-8');
    // Strip AUTO-GENERATED header if present (between first --- delimiters)
    const body = refContent.replace(/^---[\s\S]*?---\n/, '');
    return body;
  });
}
```

## 2. Split Boundaries

### Persona Foundation vs Reference

Current persona v2.1.0: 312 lines, 8 sections.

| Section | Lines | Destination | Rationale |
|---------|-------|-------------|-----------|
| §1 Instruction Hierarchy | ~10 | **Foundation** | Always-loaded: defines priority chain |
| §2 Persona: Валера | ~16 | **Foundation** | Core identity, always needed |
| §3 Default Response Format | ~35 | **Reference** | Heavy templates, not needed every turn |
| §4 Interaction Protocols (4.1–4.5) | ~50 | **Foundation** | Core behavioral rules, always-loaded by spec |
| §4.6–§4.9 (new optimization modules) | ~60 | **Foundation** | New universal reasoning valves per FR-019 |
| §5 Error Handling Guide | ~40 | **Reference** | Debug playbook, on-demand |
| §6 Socket Architecture | ~7 | **Reference** | Architectural metaphor, on-demand |
| §7 Operational Boundaries | ~17 | **Foundation** | Core rules (security, context hygiene) |
| §8 Few-Shot Examples | ~100 | **Reference** | Heavy examples, on-demand |
| Concise ethical principle (new) | ~8 | **Foundation** | Required by FR-008 |

Foundation total: ~10+16+50+60+17+8 = ~161 lines → exceeds SC-004 (≤90 lines). **Problem**: §4 protocols (existing 4.1–4.5 + new 4.6–4.9) total ~110 lines alone.

**Resolution**: Foundation gets the concise ethical principle + persona identity (§2) + instruction hierarchy (§1, one-line) + §4.1 (Think Before You Speak) + §4.3 (Radical Honesty, condensed) + §4.5 (Critical Thinking & Anti-Sycophancy) + §7 (boundaries, condensed). The remaining §4 material (4.2 Cognitive Hacks, 4.4 Communication Frameworks) moves to Reference. Foundation trimmed to ~85–90 lines.

### Coding Foundation vs Reference

Current coding v2.0.0: 447 lines, 16 sections.

| Section | Lines | Destination | Rationale |
|---------|-------|-------------|-----------|
| §2 Standing Orders | ~10 | **Foundation** | Bullet 1 |
| §3 Stop Conditions | ~11 | **Foundation** | Bullet 2 |
| §4 Universal Engineering Principles | ~19 | **Foundation** | Bullet 3 |
| §5 Plumber's Loop | ~24 | **Foundation** | Bullet 4 |
| §14 Anti-Patterns | ~91 | **Foundation** | Bullet 5 (one-line gist + Ref pointer only) |
| §1, §6–§13, §15–§16, full §14 | ~292 | **Reference** | Heavy normative text, examples |

Foundation: 5 bullets × ~5 lines = ~25–30 lines. Within SC-011 budget.

**Important**: §14 Anti-Patterns is the hardest to distil — 91 lines of detailed rules with incident examples. Foundation bullet: "Anti-Patterns — 6 production-bug rules (model-name identifiers, security theater, JWT-only identity, structural error classification, Number.isFinite input guard, caller-guarded mutations). See coding Reference §14 for detail." That's ~3 lines, well within budget.

## 3. Transformer Impact Analysis

| Transformer | Change | Impact |
|-------------|--------|--------|
| `identity.ts` | None | Used for `.claude/` → `.claude/` and `.github/instructions/` → `.github/instructions/` — no reference resolution needed here |
| `claude-to-copilot-root-instructions.ts` | **Apply reference-resolver** | Reads CLAUDE.md, resolves `<!-- HELPERS:REF -->` markers by inlining Foundation content before outputting `.github/copilot-instructions.md` |
| `claude-to-gemini-root.ts` | **Apply reference-resolver** | Same as copilot-root, but Gemini target excludes Persona Reference and Coding Reference |
| `claude-to-codex-root-instructions.ts` | **NEW** | Replace current `identity` pipeline for CLAUDE.md → AGENTS.md with reference-resolving transformer |
| Registry (`registry.ts`) | **May edit** | Only if new transformer needs registration |
| `claude-to-copilot-instructions.ts` | None | Agent instructions don't contain reference markers |
| `claude-to-copilot-prompt.ts` | None | Commands don't contain reference markers |

## 4. Test Strategy

**Unit tests** (inline assertions, no snapshots):
- New: `reference-resolver.test.ts` — test marker regex, file resolution (with temp fixture), depth limit, missing file error.
- Updated: `copilot-root-instructions.test.ts` — test that CLAUDE.md with markers → resolved output.
- Updated: `gemini-root.test.ts` — test Foundation-only resolution (Reference files excluded).
- New: `codex-root-instructions.test.ts` — test that AGENTS.md output has resolved references.

**Integration tests**: Existing golden files in `tests/fixtures/golden/` need updating because the generated CLAUDE.md → Copilot/Gemini/Codex outputs will change. The golden file update happens in the implementation branch PR.

## 5. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Reference marker breaks downstream consumer | Low | High | Tests: golden file comparisons catch regressions. Safe-fail: missing reference → throw, never emit unresolved marker. |
| Persona Foundation budget exceeded | Medium | Medium | Split boundary analysis §2.1 identifies overflow; flagged in tasks for implementation review. |
| Optimization module duplicates existing §4 rule | Low | Medium | FR-020 precedence: existing wins, module re-scoped. Pre-merge review catches. |
| Codex target missed in pipeline update | Medium | Low | Codex uses identity today — upgrading to reference-resolver is tracked in tasks. CI golden file diff will catch. |
| Gemini file size reduction <40% | Low | Medium | Foundation-only composition ensures Reference excluded. Baseline measurement tracked. |
