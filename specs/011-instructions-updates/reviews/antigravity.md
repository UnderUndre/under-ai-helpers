# SpecKit Review: 011-instructions-updates

**Reviewer**: antigravity (Google Antigravity IDE)
**Reviewed at**: 2026-07-05T12:00:00Z
**Commit**: cfe85f969bb6c1a9fe8cae43c3905f5b95e30a9a
**Artifacts reviewed**: spec.md, plan.md, tasks.md, data-model.md, quickstart.md, contracts/coding-foundation-contract.md, contracts/composition-contract.md, contracts/persona-foundation-contract.md, research.md, checklists/requirements.md, .specify/memory/constitution.md

## Summary

The SpecKit planning artifacts for `011-instructions-updates` represent a high-fidelity, thoroughly designed architectural change. The split of both persona instructions and coding rules into a lean Foundation and on-demand Reference is robust, solves the problem of drift across tools, and provides a clear mechanism for reducing context pollution. However, the review has identified some subtle edge cases regarding the complexity of Codex's pass-through pipelines and validation budget constraints that require medium-to-high attention prior to implementation.

## Findings

| ID | Severity | Area | Finding | Recommendation |
|---|---|---|---|---|
| F1 | RESOLVED | Architecture | **Pipeline Resolution for Codex vs. AGENTS.md vs CLI Commands**. `helpers.config.ts` lists two pipelines/patterns for Codex: (1) `CLAUDE.md` to `AGENTS.md` and (2) `.claude/commands/**/*.md` to `.agents/commands/*.md`. The transition of `CLAUDE.md` to the reference-resolver pipeline for `AGENTS.md` (T013) is clear. However, if individual agent command files in `.claude/commands/` ever use references in the future, the current `identity` transformer will output unresolved references. Furthermore, `identity` for Codex commands means they remain un-resolved. | **Fixed**: Spec, plan, tasks, and data-model updated to enforce command flatness (FR-022, SC-014). Any reference marker found in `.claude/commands/` will now trigger a build-blocking error (T009.1, T014.1, T028). |
| F2 | RESOLVED | Performance / Scale | **Persona Foundation size budget tightness**. The budget is ≤90 lines / ≤8 KB (SC-004), while the calculated foundation content size is estimated at ~116 lines in the persona contract. Although T001 and T008 handle the budget verification, the margin is negative (~26 lines over budget). If the condensation is too aggressive, it risks stripping out key persona behavioral rules or critical interaction protocols. | **Fixed**: Updated `persona-foundation-contract.md` to relocate §7 operational boundaries (context hygiene, nested safety checks) to the Reference file, keeping only a 3-line security anchor statement in the Foundation. This meets the ≤90-line budget cleanly. |
| F3 | RESOLVED | Failure modes | **Circular/Chain reference limit detection robustness**. In `research.md §1`, the proposed `resolveReferences` throws if depth reaches `MAX_RESOLVE_DEPTH = 1`. However, if file A references file B, and file B references file C, this is depth 2. If file A references file B, and file B references file A, this is a loop. The implementation in `research.md` tracks `depth` statelessly and replaces markers recursively, but the implementation doesn't track *visited files*. If a loop exists (e.g., A references A), it will recursively resolve until stack overflow. | **Fixed**: Plan template for `resolveReferences` updated to track absolute file paths in `context.visited: Set<string>` to throw instantly if a cyclic loop is detected. Resolver unit tests updated to verify (T014). |
| F4 | RESOLVED | Logical Consistency | **Gemini target line counts discrepancy**. In `spec.md SC-005`, the Gemini root baseline is described as "665 lines as of 2026-07-05 commit `cfe85f9`". Yet `plan.md §2` states "composed Gemini file... current ~951 lines". This discrepancy makes the size reduction assertion (≥40%) ambiguous between the spec's numbers and the plan's numbers. | **Fixed**: Plan updated to align baseline count to the canonical 665 lines from the spec. |

## Alternative approaches considered

1. **JSON/YAML Configuration for Bespoke Sections**: Instead of keeping bespoke sections of `CLAUDE.md` directly in `CLAUDE.md` and parsing around them, we could define the bespoke content (MCP config, project overview) in a separate `config.json` or `metadata.yaml` file, making `CLAUDE.md` 100% generated. This was rejected in `spec.md` (Out of Scope) to avoid migrations of existing files all at once, which is a sensible staging of this feature.

## VERDICT

```yaml
verdict: PASS
reviewer: antigravity
reviewed_at: 2026-07-05T12:35:00Z
commit: cfe85f969bb6c1a9fe8cae43c3905f5b95e30a9a
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```
