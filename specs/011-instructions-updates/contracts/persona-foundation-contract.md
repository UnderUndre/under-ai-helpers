# Persona Foundation/Reference Contract

**Type**: Content boundary contract
**Source**: `.github/instructions/persona/copilot-instructions.md` (current v2.1.0)

## Foundation (≤90 lines / ≤8 KB)

**File**: `.github/instructions/persona/copilot-instructions.md` (edited)

Must contain:

| # | Content | Source | Est. lines |
|---|---------|--------|------------|
| §1 | Instruction Hierarchy (priority chain: safety > correctness > ...) | Current §1, condensed to 1–2 lines | ~2 |
| §2 | Persona identity: Валера, Russian persona, digital plumber, catchphrase note | Current §2, full (~16 lines) | ~16 |
| §4.1 | Think Before You Speak: CoT requirement | Current §4.1, full | ~8 |
| §4.3 | Radical Honesty & Quality Gates: confidence<0.85 flag, failure-first | Current §4.3, condensed | ~12 |
| §4.5 | Critical Thinking & Anti-Sycophancy: 6 numbered rules | Current §4.5, condensed | ~10 |
| §4.6 | **NEW**: XY-problem root-cause vet (universal reasoning valve) | From `optimization.md` | ~15 |
| §4.7 | **NEW**: Speed/Quality/OpSec tradeoff calibration | From `optimization.md` | ~15 |
| §4.8 | **NEW**: Actionable output — always hand a usable tool | From `optimization.md` | ~10 |
| §4.9 | **NEW**: No-Code First — prefer existing SaaS/library | From `optimization.md` | ~10 |
| §7 | Operational Boundaries: security, safety anchor | Current §7, heavily condensed | ~3 |
| — | Concise ethical principle: values hierarchy + anti-manipulation + jailbreak resistance | NEW per FR-008 | ~8 |
| **Total** | | | **~89** |

> ✓ Foundation fits the ≤90-line budget. Relocated §7's detailed guidelines (context hygiene, complex safety checks) to the Reference file, keeping only a 3-line security anchor statement in the Foundation to prevent budget overflow.

**Explicitly EXCLUDED** from Foundation (moves to Reference):
- §3 Default Response Format (all templates)
- §4.2 Cognitive Hacks (Interview Mode, Failure First)
- §4.4 Communication Frameworks (RISEN, CO-STAR-A)
- §5 Error Handling Guide (full 5.1–5.7)
- §6 Socket Architecture
- §7.2–§7.4 Detailed Operational boundaries (relocated to Reference for budget)
- §8 Few-Shot Examples

## Reference

**File**: `.github/instructions/persona/copilot-instructions-ref.md` (NEW)

Must contain the full text of all excluded sections above, in original order, with no semantic changes. The Reference file header reads:

```markdown
# Persona Reference — Heavy Material (on-demand)

> This file is the on-demand companion to the Persona Foundation.
> It is NOT embedded in any always-loaded instruction.
> Accessed only when explicitly referenced.
```

## Invariants

1. No prose is duplicated between Foundation and Reference (each section lives in exactly one).
2. Foundation references are resolvable by both Claude Code (native `<!-- HELPERS:REF -->`) and generation-time resolver.
3. Reference is NOT included in Gemini target (maintainer decision, spec §Assumptions).
4. Foundation file header retains the standard `--- AUTO-GENERATED ---` or absence thereof per pipeline convention.
5. `optimization.md` (the draft) is archived/deleted after the four §4.6–§4.9 modules ship — no parallel maintenance.
