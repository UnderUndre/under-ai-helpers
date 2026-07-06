# CLAUDE.md Composition Contract

**Type**: Interface contract
**File**: `./CLAUDE.md`

## Rule

`CLAUDE.md` composes exactly three layers:
1. **Persona Foundation** (sourced from `.github/instructions/persona/copilot-instructions.md` via `<!-- HELPERS:REF -->`)
2. **Coding Foundation** (sourced from `.github/instructions/coding/copilot-instructions.md` via `<!-- HELPERS:REF -->`)
3. **Bespoke sections** (hand-maintained in CLAUDE.md directly)

It MUST NOT contain any hand-maintained duplicate of persona or coding prose outside the explicit REF markers (FR-015).

## Marker Syntax

```markdown
<!-- HELPERS:REF ".github/instructions/persona/copilot-instructions.md" -->
<!-- HELPERS:REF ".github/instructions/coding/copilot-instructions.md" -->
```

- Path is relative to repo root.
- Marker is self-contained — no registry file needed.
- Claude Code resolves markers natively at load time.
- For Copilot/Gemini/Codex: the pipeline resolver reads the target file, strips its header, and inlines the body at generation time.

## CLAUDE.md Section Map

| Section in CLAUDE.md Currently | Source | After FR-015 |
|-------------------------------|--------|--------------|
| Header + Role/Repo overview | Bespoke | **Bespoke** — hand-maintained |
| Persona: Валера (L9–27) | Persona §2 (duplicate prose) | **REMOVED** — replaced by `<!-- HELPERS:REF -->` |
| Standing Orders (L31–43) | Coding §2 (duplicate) | **REMOVED** — comes from coding Foundation REF |
| Session Logging (L45–47) | Bespoke | **Bespoke** |
| Stop Conditions (L51–62) | Coding §3 (duplicate) | **REMOVED** — comes from coding Foundation REF |
| Critical Thinking (L64–75) | Persona §4.5 (duplicate) | **REMOVED** — comes from persona Foundation REF |
| Workflow: Plumber's Loop (L77–79) | Coding §5 (duplicate) | **REMOVED** — comes from coding Foundation REF |
| MCP Priority (L83–93) | Bespoke | **Bespoke** |
| Agent Routing (L97–107) | Bespoke | **Bespoke** |
| Intent Routing (L111–131) | Bespoke | **Bespoke** |
| AI-Generated Code Guardrails (L135–137) | Bespoke | **Bespoke** |
| Quick Reference (L141–184) | Bespoke | **Bespoke** |
| Project Reference (L188–204) | Bespoke | **Bespoke** |
| Ultrathink Convention (L208–212) | Bespoke | **Bespoke** |
| Context Management (L216–225) | Bespoke | **Bespoke** |

## Transformer Behavior

| Target | CLAUDE.md → Output | REF handling |
|--------|-------------------|--------------|
| **Claude** | `identity` → `CLAUDE.md` | **Preserved** — native resolver handles at load time |
| **Copilot** | `claude-to-copilot-root-instructions` → `.github/copilot-instructions.md` | **Resolved** — REF replaced with inlined Foundation content |
| **Gemini** | `claude-to-gemini-root` → `GEMINI.md` | **Resolved** — REF replaced with inlined Foundation content; ALL `-ref.md` files excluded |
| **Codex** | `claude-to-codex-root-instructions` (NEW) → `AGENTS.md` | **Resolved** — same as Copilot. *Note: Command-line transpiled Codex files (.claude/commands/ to .agents/commands/) remain flat and throw if reference markers are found.* |

## Ordering

The two `<!-- HELPERS:REF -->` markers sit at the top of `CLAUDE.md`, immediately after the header/metadata block and before the first bespoke section. This ensures:
- Foundation content (persona + coding rules) appears first in the file — matching the current CLAUDE.md order (persona first, then standing orders, etc.)
- Users see the core instruction content before operational tables

Within each Foundation reference, the original section ordering is preserved (no re-ordering of §1→§2→...).

## Command Plane (FR-022 / SC-014)

Reference markers (`<!-- HELPERS:REF -->`) are a **CLAUDE.md-only** mechanism. The `.claude/commands/**/*.md` plane MUST remain flat — command files are standalone instructions, never composite.

**Invariants**:
1. Any `<!-- HELPERS:REF -->` marker found in a file under `.claude/commands/` triggers a **build-blocking error** (sync hard-fails per SC-014).
2. The Codex commands pipeline (`.claude/commands/**/*.md` → `.agents/commands/*.md`) stays on the `identity` transformer — no resolver applied.
3. The lint check is implemented in T009.1, unit-tested in T014.1, validated end-to-end in T028.

This contract section exists to formally state the FR-022 / SC-014 invariant alongside the persona/coding/composition contracts, removing the previous contractual asymmetry (enforcement-only, no canonical statement).

## Invariants

1. Bespoke sections (identified in the Section Map above) are edited directly in `CLAUDE.md` and survive regeneration verbatim (SC-013).
2. If a bespoke section overlaps conceptually with Foundation content (e.g., "AI-Generated Code Guardrails" references coding §14), the Foundation content is the canonical source — the bespoke section provides supplementary context only.
3. The composition contract is NOT a full generation of `CLAUDE.md` from sources — bespoke sections remain hand-maintained in-tree. Full generation is explicitly out of scope for this feature.
4. The `IDENTITY` transformer for Claude target preserves REF markers as-is; no resolver is applied to the Claude target output.
