---
name: Spec Review
about: Planning PR for feature specs (specs/<slug> branch)
label: spec-review
---

## Feature

- **Slug**: 
- **Spec Directory**: `specs/<slug>/`

## Artifacts

- [ ] `spec.md` — Feature specification
- [ ] `plan.md` — Implementation plan
- [ ] `tasks.md` — Task breakdown with dependency graph
- [ ] `reviews/analyze.md` — Self-consistency analysis (verdict: PASS)

## AI Review Gate

Per Principle IX, this planning PR must receive:
- [ ] `/speckit.analyze` PASS

## Checklist

- [ ] No implementation code in this PR (spec-only)
- [ ] All acceptance criteria are testable
- [ ] Dependencies and assumptions documented
- [ ] Constitution alignment verified by analyze

## Notes

<!-- Additional context, design decisions, or open questions -->
