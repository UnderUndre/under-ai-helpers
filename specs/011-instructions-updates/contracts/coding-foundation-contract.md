# Coding Foundation/Reference Contract

**Type**: Content boundary contract
**Source**: `.github/instructions/coding/copilot-instructions.md` (current v2.0.0, 447 lines)

## Foundation (≤30 lines / ≤3 KB)

**File**: `.github/instructions/coding/copilot-instructions.md` (edited — trimmed from 447 lines)

Exactly 5 bullets, each with a one-line gist + Reference pointer:

| # | Bullet | Source § | Gist | Lines |
|---|--------|----------|------|-------|
| 1 | **Standing Orders** | §2 | "9 non-negotiable bans: no force flags, no secrets, no auto-commit, no destructive commands without triple consent, no env file reads, no manual version bumps, no editing generated files. See coding Reference §2 for full text." | ~5 |
| 2 | **Stop Conditions** | §3 | "6 triggers to halt and plan first: >3 files, ≥2 valid approaches, unfamiliar API, ambiguity, public API delete/rename, confidence <0.85. See coding Reference §3 for full text." | ~5 |
| 3 | **Universal Principles** | §4 | "13 SHOULD maxims: DRY, KISS, YAGNI, Crash Early, No Broken Windows, Boring is Good, Negative Lines, Small Batches, Principle of Least Astonishment, Fail Fast, Single Responsibility, Open/Closed, Defense in Depth. See coding Reference §4 for full text." | ~5 |
| 4 | **Plumber's Loop** | §5 | "7-step workflow: Classify → Analyze → Spec → Plan → Execute → Verify → Reflect. WRAP atomicity: <500 LOC/change, refactor XOR feature. Chain of Verification: tracer-bullet skeleton before flesh-out. See coding Reference §5 for full text." | ~5 |
| 5 | **Anti-Patterns** | §14 | "6 production-bug rules: no model-name identifiers in code, delete security theater, identity only from JWT, structural error classification via discriminated unions, Number.isFinite guard on numeric inputs, caller must guard `{committed}` mutations. See coding Reference §14 for detail + incident examples." | ~5 |
| **Total** | | | | **~25** |

> ✓ Within ≤30-line budget with ~5-line margin.

## Reference

**File**: `.github/instructions/coding/copilot-instructions-ref.md` (NEW)

Contains the full, unmodified text of all 16 sections (§1–§16), EXCEPT the sections reduced to the 5 bullets above. Specifically:

1. The file mirrors the original `copilot-instructions.md` structure with all sections present.
2. For §2, §3, §4, §5, §14: the Foundation bullet replaces the distilled summary; but the Reference must STILL contain the FULL text of these sections (the Reference is the complete reference — Foundation is the distillation).
3. All other sections (§1, §6–§13, §15–§16) are copied verbatim from the current source.

The Reference file header reads:

```markdown
# Coding Standards Reference — Full Normative Text (on-demand)

> This file is the on-demand companion to the Coding Foundation.
> It is NOT embedded in any always-loaded instruction.
> Accessed only when explicitly referenced.
```

## Invariants

1. Foundation bullets are the ONLY canonical distinction — no prose is rewritten, only gisted with a pointer.
2. Reference preserves the complete normative text of every § (including §2/§3/§4/§5/§14) — Foundation is the added-value distillation, NOT a replacement.
3. Reference is NOT included in Gemini target.
4. When any coding source section is substantively edited, the Foundation bullet for that section MUST be reviewed for drift (Edge Case in spec.md).
