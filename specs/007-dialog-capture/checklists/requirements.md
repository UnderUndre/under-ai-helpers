# Specification Quality Checklist: Dialog Capture — Raw-Layer Hooks, Normalization & Memory Ingestion

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-06-14
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain (3 Phase-1 + 5 Phase-2 raised, all resolved in Session 2026-06-14)
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- **Domain caveat**: References to Claude Code (the only tool with a free, complete transcript), underboard's memory backend, and Honcho (via 008) appear in the spec because they ARE the business domain of this capture feature — 006/US7 and 008 explicitly reserved 007 for this exact integration. Runtime/code-structure choices (hook framework, normalizer language, scanner library) stay with `/speckit.plan`.
- **Six Verification Items are deliberately empirical pre-implementation probes, not spec ambiguities**: V1 (CC hook availability), V2 (transcript schema stability), V3 (underboard payload limits vs long transcripts), V4 (Honcho Session entity behavior), V5 (redaction FP rate), V6 (CC own-log retention). They gate plan-phase decisions (trigger mechanism, representation choice, pruning safety) — first tasks of the plan.
- **Phase 1 (3 questions, all resolved)**: FR-004 → hybrid redaction (in-repo regex + optional external scanner hook); FR-006/006a/006b → opt-out with configurable deferred-ingestion quarantine window; FR-017 → hybrid (SessionEnd primary, file-watch fallback if V1 fails).
- **Phase 2 (5 questions, all resolved)**: FR-003 → hybrid message-stream format (compact header + truncated body, 32 KB default); FR-018/019 → forward-only default + explicit `dialog-backfill` command; FR-020 → event-driven hybrid worker (health-recovery + capture-completion + 5-min safety-net); SC-004 → top-5 matching 008/SC-001; FR-021/022 → per-record catalog-version stamp + opt-in `dialog-renormalize` command.
- **Net spec growth from clarifications**: +7 FRs (006a, 006b, 018, 019, 020, 021, 022), +3 SCs (010, 011, 012), US4 acceptance scenarios 4→6, US6 acceptance scenarios 3→4. Final: 24 FRs, 12 SCs, 8 clarifications, 6 verification items, 12 edge cases.
- **Cross-feature traceability**: This spec closes the loop opened by 005 (memory), 006 (US7 dialog archival Phase 1), and 008 (Honcho Session entity reservation). The dependency chain is recorded in Context.
- **Branch / snapshot blocked**: Repo `main` has unresolved submodule conflicts (`.agents/marketingskills`, `undrecreaitwins`) at spec time. `create-new-feature.ps1` cannot run on a dirty tree; `snapshot-stage.ps1` cannot tag without a clean commit. Files are written directly to the existing `specs/007-dialog-capture/` directory; branch creation + spec-stage snapshot deferred until conflicts are resolved.
