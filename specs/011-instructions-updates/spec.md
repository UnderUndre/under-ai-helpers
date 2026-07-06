# Feature Specification: Instruction-Set Single-Source Architecture & Ethical-Reasoning Baseline

**Feature Branch**: `spec/011-instructions-updates`
**Created**: 2026-06-28
**Status**: Draft
**Input**: User description: "011-instructions-updates — make `.github/instructions/persona/copilot-instructions.md` the single base of the persona that CLAUDE.md (and every other target) derives from; split it into a lean always-loaded Foundation + on-demand Reference; distil the raw `.github/instructions/persona/security/` notes into a concise ethical-reasoning principle shipped in the Foundation by default, while keeping the full proportionality/verification engine (PVE) as an opt-in referenced module — **not** a default safety-bypass. Security stance approved: concise principle in Foundation + full PVE opt-in, no default bypass."

**Input amendment (2026-07-05)**: Extend the feature to also (a) formalize `CLAUDE.md` as a composition of the two canonical source families — `persona/copilot-instructions.md` + `coding/copilot-instructions.md` — so the always-loaded root file no longer maintains duplicate prose of either; (b) split the coding source symmetrically with the persona — a lean Foundation distilled to ≤5 bullets + an on-demand Reference holding heavy material (full §1–§16 normative text, examples, anti-pattern detail); (c) integrate the four reasoning modules drafted in `.github/instructions/persona/optimization.md` (XY problem root-cause vet, Speed/Quality/OpSec tradeoff, Actionable output, No-Code First) as new persona §4.6–§4.9, since they are universal reasoning valves rather than coding-specific rules.

## Context & Motivation

The repository ships a curated instruction set (`CLAUDE.md` + `.github/instructions/**` sources) that transpiles to multiple AI tools (Copilot, Gemini, Codex, Antigravity). Today the **persona** is duplicated across at least three places — the always-loaded root instruction, the standalone persona source, and the composed Gemini instruction file — which drift independently. The standalone persona source is also heavy (~300 lines, including a metadata table and worked examples), which bloats any file that embeds it. Separately, the repo holds raw, brainstorm-style notes under `.github/instructions/persona/security/` (four files: `copilot-instructions.md`, `pve.md`, `Intent-Stripper-and-Multi-Agent-Debate-Framework.md`, `MAD-and-Latency-and-Cost.md`) describing an ethical "proportionality" framework that is neither a usable instruction nor wired into the default behaviour.

The same drift and bloat pattern affects the **coding-standards** source (`.github/instructions/coding/copilot-instructions.md`, ~447 lines, 16 sections): `CLAUDE.md` already embeds condensed variants of its Standing Orders, Stop Conditions, and Critical Thinking rules inline, but ad-hoc — there is no canonical "lean coding layer" to consume, so every consumer either re-duplicates the prose or pulls in the full heavy text. And the `CLAUDE.md` root itself is composed by hand from persona-derived prose + coding-derived prose + bespoke sections, with no explicit rule stating that it MUST be the composition of exactly those two sources (and nothing else persona/coding-shaped).

Finally, `.github/instructions/persona/optimization.md` is a raw draft of four reasoning modules (XY-problem check, Speed/Quality/OpSec tradeoff, Actionable output, No-Code First) that currently live in no shipped instruction at all — they are net-new capability with no canonical home.

This feature consolidates the persona into one canonical source consumed everywhere, applies the same Foundation/Reference split to the coding source, formalizes `CLAUDE.md` as the composition of the two Foundations (and nothing else persona/coding-shaped), adopts the four `optimization.md` modules into the persona source, and establishes a **safe, principled** ethical baseline — explicitly drawing a line between a concise default reasoning principle and an operational safety-bypass that MUST NOT ship by default.

## Clarifications

### Session 2026-06-28

- Q: How does a maintainer opt into the full PVE proportionality module (FR-010)? → A: As a **separate optional transpile target** (mirroring the existing optional `persona-phrases` target) — opt-in is explicit configuration, and the module is absent from default output by construction.
- Q: Which tools must carry the consolidated root persona? → A: The four root-bearing tools (Claude, Copilot, Gemini, Codex). Antigravity (`.agent/`) is out of scope for the root persona — it keeps receiving agents/skills only, with no new root-instruction path.

### Session 2026-07-05

- Q: Should the three new blocks (CLAUDE.md = persona + coding composition rule, coding-standards distillation to ≤5 bullets, integration of `persona/optimization.md` modules) extend this feature's scope, or be split into separate features? → A: **Extend this feature** — all three blocks ride the same Foundation/Reference split pattern and the single-source theme; splitting would multiply overhead without reducing rework.
- Q: What composition model should `CLAUDE.md` use, given it must compose persona + coding without re-bloating the always-loaded layer? → A: **Symmetric split** — the coding source is also split into a lean Foundation + on-demand Reference (mirroring the persona split already mandated by FR-005), and `CLAUDE.md` composes ONLY the two Foundations; both References stay on-demand and out of every default target.
- Q: Which of the four optimization modules from `.github/instructions/persona/optimization.md` (XY problem, Speed/Quality/OpSec tradeoff, Actionable output, No-Code First) are adopted, and where do they live? → A: **All four are adopted into the persona source as new §4.6–§4.9** (No-Code First stays in the persona, not relocated to the coding source) because they are universal reasoning valves that apply across coding and non-coding domains.
- Q: What size budget should the coding Foundation TL;DR obey? → A: **≤ 30 lines / ≤ 3 KB** (5 bullets × ~6 lines each, one-line gist + Reference pointer) — roughly half the persona Foundation budget (SC-004: ≤90 lines / ≤8 KB), reflecting that the coding Foundation is a distillate, not the full normative text.
- Q: Which five coding-standards sections get distilled into the Foundation TL;DR? → A: **§2 Standing Orders + §3 Stop Conditions + §4 Universal Engineering Principles + §5 Plumber's Loop + §14 Anti-Patterns** — these carry ~80% of the enforceable rules; operational details (commit convention, linter config) live in the coding Reference and are linked, not embedded.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One canonical persona, zero drift (Priority: P1)

As the **maintainer**, I edit the persona in exactly one place and every tool's instruction file reflects that edit, so the persona can never drift between Claude, Copilot, Gemini, and Codex.

**Why this priority**: Drift is the originating problem — three diverging copies of the persona means the assistant behaves differently per tool and edits silently fall out of sync. Single-source is the core value; everything else builds on it.

**Independent Test**: Change one line in the canonical persona source, regenerate, and confirm the change appears in every generated target while no second hand-maintained copy of the persona identity exists anywhere.

**Acceptance Scenarios**:

1. **Given** the persona is defined once in the canonical source, **When** the maintainer edits it and regenerates, **Then** all target instruction files (Claude, Copilot, Gemini, Codex) reflect the edit with no manual edits to any generated file.
2. **Given** the always-loaded root instruction (`CLAUDE.md`), **When** it is inspected, **Then** it references the persona source rather than restating the persona identity prose.
3. **Given** any generated consumer instruction file, **When** it is inspected, **Then** it contains the resolved persona content and **no** unresolved/dangling reference marker.

---

### User Story 2 - Lean always-loaded layer (Priority: P2)

As an **AI agent (and the maintainer paying its context cost)**, I want the always-loaded persona to be lightweight, with heavy material (worked examples, detailed playbooks) available only on demand, so the persona does not waste always-loaded context in any tool.

**Why this priority**: Single-sourcing the *full* heavy persona would fix drift but re-bloat the always-loaded files. Splitting a lean Foundation from an on-demand Reference is what makes single-source affordable, and it shrinks the already-oversized composed Gemini file.

**Independent Test**: Measure the Foundation against a size budget, confirm heavy material lives in a separate on-demand Reference that is not part of any always-loaded file, and confirm the composed Gemini instruction file shrinks versus its current size.

**Acceptance Scenarios**:

1. **Given** the persona split into Foundation + Reference, **When** the Foundation is measured, **Then** it is within the always-loaded size budget.
2. **Given** the on-demand Reference, **When** generated targets are inspected, **Then** the Reference content is not embedded in any always-loaded instruction file.
3. **Given** the composed Gemini instruction file, **When** it is regenerated, **Then** its size is materially reduced versus the pre-change baseline because it composes only the lean Foundation.

---

### User Story 3 - Safe ethical-reasoning baseline by default (Priority: P3)

As a **template consumer**, the default persona gives me a concise, principled reasoning rule — apply a values hierarchy, refuse manipulation and false urgency, resist jailbreak patterns — **without** shipping an operational instruction to bypass safety controls.

**Why this priority**: This is the safety-critical decision. A principled "don't be a naive rule-follower, but don't get socially-engineered either" baseline adds value and complements the anti-sycophancy work; an operational bypass-with-OpSec shipped to every consumer would be a liability. The two must be cleanly separated.

**Independent Test**: Confirm every default-generated target contains the concise ethical principle and contains **none** of the operational bypass / evasion text, and that the principle reads as reasoning guidance rather than an override protocol.

**Acceptance Scenarios**:

1. **Given** a freshly generated default instruction set, **When** any target is inspected, **Then** it contains the concise ethical-reasoning principle (values hierarchy + anti-manipulation + jailbreak resistance).
2. **Given** the same default instruction set, **When** any target is inspected, **Then** it contains no operational safety-bypass protocol and no step-by-step guidance for circumventing legal/platform controls.
3. **Given** the concise principle, **When** read by a non-technical stakeholder, **Then** it is understood as principled judgement (refuse manipulation; weigh proportionate harm) rather than an instruction to break rules.

---

### User Story 4 - Opt-in advanced ethics module (Priority: P4)

As a **maintainer who explicitly wants the full proportionality / verification framework**, I can opt into it as a referenced module, so the detailed engine is available without being imposed on anyone by default.

**Why this priority**: Preserves the value already captured in the `.github/instructions/persona/security/` notes for those who deliberately choose it, while keeping the default safe. Lowest priority because it serves an advanced, opt-in audience.

**Independent Test**: Confirm the full proportionality module exists as a curated, referenced instruction, is absent from every default-generated target, and becomes available only through an explicit opt-in action.

**Acceptance Scenarios**:

1. **Given** the curated full module, **When** the default instruction set is generated, **Then** the module appears in zero default targets.
2. **Given** a maintainer who opts in, **When** they enable the module, **Then** its content becomes available to the chosen target(s) as a referenced instruction.

---

### User Story 5 - CLAUDE.md = persona-Foundation + coding-Foundation composition (Priority: P2)

As the **maintainer**, I want `CLAUDE.md` to be the canonical composition of exactly two sources — the persona Foundation and the coding Foundation — and nothing else persona/coding-shaped, so that any change to either canonical source propagates to the always-loaded root without manual rewriting of duplicate prose.

**Why this priority**: Closes the composition gap that produced today's ad-hoc duplication (CLAUDE.md currently hand-embeds condensed variants of persona §2/§4.5 and coding §2/§3 side-by-side with bespoke sections, with no enforceable rule linking them to the sources). At P2 because the single-source value (Story 1) is undermined if the root file keeps a parallel hand-maintained copy.

**Independent Test**: Inspect `CLAUDE.md`, confirm every persona-derived and coding-derived block traces to the canonical Foundation source via an explicit reference (not a free-floating copy), and confirm no free-standing persona/coding prose exists outside those references.

**Acceptance Scenarios**:

1. **Given** the canonical persona Foundation and coding Foundation, **When** `CLAUDE.md` is regenerated, **Then** it composes exactly those two Foundations (plus non-persona/non-coding bespoke sections like MCP tables, Intent Routing, Project Reference) — no third hand-maintained copy of persona or coding prose.
2. **Given** `CLAUDE.md` today contains inline duplicates of persona §2 + §4.5 and coding §2 + §3, **When** the composition rule is applied, **Then** those duplicates are replaced by references to the canonical Foundations and 0 lines of hand-duplicated persona/coding prose remain.
3. **Given** a maintainer edits the persona Foundation or coding Foundation, **When** `CLAUDE.md` is regenerated, **Then** the change propagates with no manual edit to `CLAUDE.md`.

---

### User Story 6 - Coding source split: lean Foundation + on-demand Reference (Priority: P2)

As an **AI agent (and the maintainer paying its context cost)**, I want the coding-standards source split symmetrically with the persona — a ≤5-bullet Foundation distilled from §2/§3/§4/§5/§14 for always-loaded use, with the heavy normative text (§1, §6–§13, §15–§16, full §14 anti-pattern detail) in an on-demand Reference — so the coding layer stops re-bloating every consumer that embeds it.

**Why this priority**: Without this split, the symmetric composition in Story 5 has nothing lean to compose from on the coding side; the choice is "embed the full ~447-line coding source" or "hand-maintain a third copy". Symmetric split is what makes the composition affordable and removes the last duplication vector.

**Independent Test**: Measure the coding Foundation against its size budget (≤30 lines / ≤3 KB), confirm heavy normative material lives in a separate on-demand Reference, and confirm the composed `CLAUDE.md` shrinks because it composes two lean Foundations instead of one lean + one heavy.

**Acceptance Scenarios**:

1. **Given** the coding source split into Foundation + Reference, **When** the Foundation is measured, **Then** it is within the always-loaded size budget (≤30 lines / ≤3 KB) and contains exactly the five distilled bullets (Standing Orders, Stop Conditions, Universal Principles, Plumber's Loop, Anti-Patterns) each with a one-line gist + Reference pointer.
2. **Given** the on-demand coding Reference, **When** any always-loaded instruction file is inspected (including `CLAUDE.md`), **Then** the heavy Reference content is NOT embedded.
3. **Given** the composed `CLAUDE.md`, **When** it is regenerated, **Then** it consumes the coding Foundation (not the full coding source) and its size reflects two lean Foundations rather than one lean + one heavy.

---

### User Story 7 - Optimization modules adopted into persona §4.6–§4.9 (Priority: P3)

As a **template consumer**, the default persona equips me with four universal reasoning valves — XY-problem root-cause vet, Speed/Quality/OpSec tradeoff calibration, Actionable-output rule (always hand a usable tool), and No-Code First (prefer existing SaaS/library over hand-rolled code) — so the assistant applies them across coding and non-coding domains rather than only when explicitly prompted.

**Why this priority**: Promotes a raw brainstorm draft (`.github/instructions/persona/optimization.md`) into shipped, canonical behaviour; the modules are universal reasoning heuristics that complement (and do not conflict with) the ethical-reasoning principle in Story 3. At P3 because they add capability but the safety baseline (Story 3) and the architecture (Stories 1, 2, 5, 6) must be in place first.

**Independent Test**: Confirm the four modules ship in the persona source as §4.6–§4.9, that every default-generated target contains them, and that each module reads as a universal reasoning valve (applicable to non-coding tasks too), not as a coding-only rule.

**Acceptance Scenarios**:

1. **Given** the persona source, **When** it is inspected, **Then** it contains §4.6 (XY problem), §4.7 (Speed/Quality/OpSec), §4.8 (Actionable output), §4.9 (No-Code First) — all four adopted from `optimization.md`.
2. **Given** a freshly generated default target, **When** any target is inspected, **Then** all four modules appear in the persona-derived content.
3. **Given** the four modules, **When** a non-coding task is presented, **Then** the modules still apply (they are framed as universal reasoning valves, not coding-only rules).

---

### Edge Cases

- **Missing/renamed persona source**: if the referenced Foundation cannot be found at generation time, the system MUST fail safe — it MUST NOT emit an unresolved reference marker into a consumer file, and MUST surface a clear error/warning instead.
- **Tool without native reference resolution**: for any target whose loader does not resolve references at load time, the persona content MUST be inlined at generation time so the consumer file is self-contained.
- **Recursive/nested references**: reference resolution MUST be bounded and MUST NOT loop indefinitely.
- **Reference marker compatibility**: The `<!-- HELPERS:REF "path" -->` marker syntax is confirmed to be compatible with Claude Code's native loader resolution rules.
- **Codex commands restriction**: `<!-- HELPERS:REF -->` reference markers MUST NOT be used in Codex individual command source files (under `.claude/commands/`). The build system or static check MUST enforce that individual commands remain flat and use `identity` copying only. Any reference marker found in command sources MUST trigger a build failure.
- **Protected/custom consumer content**: existing protected-slot custom content in generated files MUST survive regeneration unchanged.
- **Consumer wants no ethical content**: the concise principle is part of the default Foundation; removing it requires an explicit edit to the canonical source (it is not silently injected outside the persona).
- **Language mismatch**: the persona identity is authored in Russian and operating principles in English; generation MUST preserve both verbatim without translation or mangling.
- **Coding Foundation distillation drift**: if the heavy coding source (§1–§16) is edited, the Foundation's 5-bullet distillation MUST be reviewed for drift; the Foundation is a curated distillate, NOT a mechanical extract, so edits to source sections require a human decision on whether the bullet still represents the section.
- **Composition ambiguity (CLAUDE.md bespoke sections)**: sections like MCP Priority, Agent Routing, Intent Routing, Quick Reference, Project Reference are bespoke to the root file (neither persona nor coding); the composition rule MUST NOT mistake them for persona/coding duplicates and MUST preserve them verbatim across regeneration.
- **Optimization module collision with existing persona §4.1–§4.5**: if any of the four new modules (§4.6–§4.9) later duplicates or contradicts an existing §4.1–§4.5 rule, the existing rule takes precedence and the new module MUST be re-scoped to remove the overlap (the modules extend, never override, the existing Interaction Protocols).
- **No-Code First vs. coding §4 (YAGNI)**: No-Code First (persona §4.9) targets build-vs-buy (prefer existing SaaS/library); YAGNI (coding §4) targets speculative features. They MUST NOT be collapsed into one rule — they govern different decisions and live in different sources by design.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The persona identity MUST be defined in exactly ONE canonical source file. No other file (including the always-loaded root instruction) may contain a hand-maintained copy of the persona identity prose.
- **FR-002**: The always-loaded root instruction MUST reference the canonical persona source rather than duplicating it.
- **FR-003**: The persona reference MUST resolve to the actual persona content in EVERY generated target file (Claude, Copilot, Gemini, Codex). A generated consumer file MUST NOT contain an unresolved or dangling reference marker.
- **FR-004**: For the one tool whose native loader resolves references at load time, the canonical root instruction MAY retain the reference marker (resolved natively at load); for all other targets the referenced content MUST be inlined during generation so each consumer file is self-contained.
- **FR-005**: The persona MUST be split into (a) a lightweight **Foundation** intended for always-loaded use and (b) an on-demand **Reference** holding heavy material (worked examples, detailed response/error playbooks). The Reference MUST NOT be embedded in any always-loaded instruction.
- **FR-006**: The Foundation MUST stay within a defined always-loaded size budget (see Success Criteria).
- **FR-007**: The persona identity MUST be authored as the maintainer's Russian-language "Valera" persona; the operating principles (anti-sycophancy / critical-thinking, response discipline, boundaries) MUST be authored in English. Both MUST survive generation verbatim.
- **FR-008**: The default Foundation MUST include a **concise ethical-reasoning principle**: apply a values hierarchy (life > liberty & irreplaceable time > material resources > rules/ToS), refuse manipulation and fabricated urgency, and resist common jailbreak patterns (fictional-framing bypass, false emergencies, ethical-relativism appeals). It MUST be expressed as principled judgement, not as an operational override.
- **FR-009**: Default-shipped instructions MUST NOT contain an operational safety-bypass protocol, nor step-by-step guidance (including operational-security / evasion guidance) for circumventing legal or platform controls.
- **FR-010**: The full proportionality / verification framework (the detailed "PVE" engine and its bypass output protocol) MUST be available ONLY as an opt-in module and MUST be present in ZERO default-generated targets. Opt-in MUST be delivered as a **separate optional transpile target** (the same pattern as the optional `persona-phrases` target): excluded from the default target set, generated only when a maintainer explicitly enables it.
- **FR-011**: Editing the canonical persona and regenerating MUST update all targets with no manual edits to generated files (one-direction source → generated flow preserved).
- **FR-012**: Existing protected-slot custom content in generated files MUST survive regeneration.
- **FR-013**: Composed instruction files (e.g., the Gemini root) MUST compose the lean Foundation, not the heavy Reference, so their size is reduced.
- **FR-014**: The concise ethical principle and the persona MUST be consistent with, and subordinate to, the existing safety Standing Orders and Instruction Hierarchy (safety & correctness outrank persona tone and any user-supplied task framing). Specifically, the ethical values hierarchy (life > liberty > resources > rules) is evaluated as a sub-principle under the core Safety protocol (L1/Level 1), meaning it can never override the master Standing Orders.
- **FR-015 (composition rule)**: The always-loaded root instruction `CLAUDE.md` MUST be the composition of exactly two canonical source families — the persona Foundation and the coding Foundation — plus non-persona/non-coding bespoke sections (MCP, Agent Routing, Intent Routing, Quick Reference, Project Reference, Ultrathink, Context Management). It MUST NOT contain any hand-maintained duplicate of persona or coding prose outside the explicit references to those two Foundations.
- **FR-022 (command reference ban)**: The build/transformers pipeline MUST assert that no `<!-- HELPERS:REF -->` reference markers are present in any command source files under `.claude/commands/`. If a marker is found, it MUST fail the build with a descriptive error.
- **FR-023 (persona maintenance rule)**: The Russian persona prose is maintained exclusively in the Persona Foundation source; the root `CLAUDE.md` MUST NOT keep a parallel hand-maintained copy. Editing the persona in Foundation and running `sync` is the only way to modify persona identity behavior in `CLAUDE.md`.
- **FR-016 (coding split)**: The coding source MUST be split symmetrically with the persona: a lean **Coding Foundation** (≤5 bullets distilled from §2 Standing Orders, §3 Stop Conditions, §4 Universal Engineering Principles, §5 Plumber's Loop, §14 Anti-Patterns) consumed by always-loaded targets, and an on-demand **Coding Reference** holding the heavy normative text (§1, §6–§13, §15–§16, full §14 anti-pattern detail, examples). The Coding Reference MUST NOT be embedded in any always-loaded instruction.
- **FR-017 (coding Foundation budget)**: The Coding Foundation MUST stay within the always-loaded size budget of **≤ 30 lines / ≤ 3 KB**, with each of the five bullets consisting of a one-line gist and a Reference pointer (no inlined examples, no anti-pattern detail).
- **FR-018 (composition symmetry)**: `CLAUDE.md` MUST consume the Coding Foundation (not the full Coding source), mirroring FR-004 for the persona — for the one tool whose native loader resolves references at load time, the root MAY retain the reference marker; for all others, the Coding Foundation content MUST be inlined at generation time.
- **FR-019 (optimization modules adopted)**: The persona source MUST adopt the four modules drafted in `.github/instructions/persona/optimization.md` as new §4.6 (XY problem root-cause vet), §4.7 (Speed/Quality/OpSec tradeoff calibration), §4.8 (Actionable output — always hand a usable tool), §4.9 (No-Code First — prefer existing SaaS/library over hand-rolled code). They MUST be framed as universal reasoning valves (applicable across coding and non-coding domains), not as coding-only rules.
- **FR-020 (optimization module precedence)**: §4.6–§4.9 MUST extend, not override, the existing persona §4.1–§4.5 Interaction Protocols. If any module overlaps or conflicts with an existing §4.1–§4.5 rule, the existing rule takes precedence and the new module MUST be re-scoped to remove the overlap before shipping.
- **FR-021 (optimization modules propagate to all default targets)**: All four optimization modules MUST appear in 100% of default-generated targets (Claude, Copilot, Gemini, Codex) via the persona Foundation, and MUST NOT be opt-in (they are default behaviour, distinct from the opt-in PVE module in FR-010).

### Key Entities

- **Persona Foundation**: the single canonical, lean persona source — identity (Russian Valera) + operating principles (English) + concise ethical principle. Consumed by all targets; always-loaded-friendly.
- **Persona Reference**: on-demand companion holding heavy material (worked examples, detailed response/error playbooks). Linked, never always-loaded.
- **Ethical-Reasoning Principle**: a concise, default, in-Foundation rule (values hierarchy + anti-manipulation + jailbreak resistance) framed as judgement, not override.
- **Proportionality / Verification Module (PVE)**: the full ethical-override framework distilled from the `.github/instructions/persona/security/` notes (primarily `copilot-instructions.md` + `pve.md`); opt-in via a **separate optional transpile target**, referenced, never in default output.
- **Reference Marker**: the pointer placed in the canonical root instruction that resolves to Foundation content — natively at load for the one tool that supports it, and at generation time (inlined) for all others.
- **Generated Target Instruction Files**: the per-tool root/instruction outputs (Claude, Copilot, Gemini, Codex) produced from the canonical sources.
- **Coding Foundation**: the lean, always-loaded distillate of the coding-standards source — exactly 5 bullets (Standing Orders, Stop Conditions, Universal Principles, Plumber's Loop, Anti-Patterns), each with a one-line gist + Reference pointer. Bounded by ≤30 lines / ≤3 KB. Mirrors the persona Foundation split.
- **Coding Reference**: on-demand companion to the Coding Foundation, holding the heavy normative text (§1, §6–§13, §15–§16, full §14 anti-pattern detail, examples). Linked, never always-loaded, mirroring the Persona Reference.
- **Bespoke Root Sections**: sections of `CLAUDE.md` that are neither persona-derived nor coding-derived (MCP Priority, Agent Routing, Intent Routing, Quick Reference, Project Reference, Ultrathink Convention, Context Management). Survive regeneration verbatim under the composition rule (FR-015).
- **Optimization Modules (§4.6–§4.9)**: four universal reasoning valves adopted from `.github/instructions/persona/optimization.md` into the persona source — XY-problem root-cause vet, Speed/Quality/OpSec tradeoff calibration, Actionable output (always hand a usable tool), No-Code First (prefer existing SaaS/library over hand-rolled code). Default-shipped via the persona Foundation to all targets; not opt-in (distinct from the PVE module).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The persona identity prose appears in exactly ONE source file — 0 hand-maintained duplicates — verifiable by content search across the repo.
- **SC-002**: Editing the canonical persona and regenerating propagates the change to 100% of target instruction files with 0 manual edits to generated files.
- **SC-003**: 0 generated consumer instruction files contain an unresolved reference marker after generation.
- **SC-004**: The Foundation is within the always-loaded budget of **≤ 90 lines / ≤ 8 KB**.
- **SC-005**: The composed Gemini instruction file is reduced by **≥ 40%** in size versus its pre-change baseline (**665 lines as of 2026-07-05 commit `cfe85f9`**; target post-regen ≤ 399 lines).
- **SC-006**: The always-loaded root instruction (`CLAUDE.md`) contains 0 lines of duplicated persona identity prose (only a reference).
- **SC-007**: 100% of default-generated targets contain the concise ethical principle AND 0 of them contain any operational bypass / evasion text.
- **SC-008**: The full proportionality module is present only in its opt-in reference location and in 0 default-generated targets.
- **SC-009**: A regeneration run after a persona edit completes with no drift reported by the repo's drift check (or, in the upstream-in-place repo, a clean regeneration with the expected diff confined to persona-derived files).
- **SC-010**: The always-loaded root instruction (`CLAUDE.md`) contains 0 lines of hand-duplicated persona or coding prose — every persona-derived and coding-derived block traces to its Foundation via an explicit reference (verifiable by content search across the repo for prose blocks that exist in both `CLAUDE.md` and a canonical source without an intervening reference marker).
- **SC-011**: The Coding Foundation is within its always-loaded budget of **≤ 30 lines / ≤ 3 KB** and contains exactly 5 bullets (Standing Orders, Stop Conditions, Universal Principles, Plumber's Loop, Anti-Patterns), each with a one-line gist + Reference pointer.
- **SC-012**: 100% of default-generated targets (Claude, Copilot, Gemini, Codex) contain all four optimization modules (§4.6 XY, §4.7 Speed/Quality/OpSec, §4.8 Actionable, §4.9 No-Code First) via the persona Foundation — and 0 of them require opt-in to receive the modules.
- **SC-013**: Bespoke root sections of `CLAUDE.md` (MCP, Agent Routing, Intent Routing, Quick Reference, Project Reference, Ultrathink, Context Management) survive regeneration byte-for-byte unchanged (0 diff on those sections across a regenerate cycle).
- **SC-014**: Attempting to run `sync` when a command file in `.claude/commands/` contains a `<!-- HELPERS:REF` marker results in a hard building error, terminating execution.
- **SC-015 (Reference file isolation)**: The resolved Reference MD files (persona `copilot-instructions-ref.md` and coding `copilot-instructions-ref.md`) must use plain markdown link patterns to be loaded on-demand, and they must NOT contain the `.instructions.md` suffix (so that Copilot does not load them automatically in the background).

## Assumptions

- The canonical persona source is the existing hand-written `.github/instructions/persona/copilot-instructions.md`, leaned into the **Foundation**; heavy material (current §3 response formats, §4 interaction detail, §5 error playbook, §8 few-shot examples) moves to a sibling on-demand **Reference** file.
- The **native-resolving tool** is Claude Code (resolves a reference marker in `CLAUDE.md` at load time); all other tools require generation-time inlining.
- Per maintainer decision: the on-demand **Reference is intentionally NOT distributed to the Gemini target** (the Gemini file composes only the Foundation); it remains available to Copilot (and as a link) and is not always-loaded anywhere.
- The concise ethical principle is **distilled from** the existing `.github/instructions/persona/security/` notes (primarily `copilot-instructions.md`'s values hierarchy + `pve.md`'s 4-step proportionality reasoning) but reduced to a principle; the operational engine/output-protocol is **not** in the default.
- **Approved scope decision**: concise ethical principle ships in the Foundation by default to all consumers; the full PVE ships only opt-in. (Recorded here for the cross-AI review gate to affirm — see Out of Scope.)
- This feature governs only the template's *shipped instructions*; it makes no change to any underlying model's safety training or platform compliance.
- The canonical coding-standards source is the existing hand-written `.github/instructions/coding/copilot-instructions.md`; its Foundation distillate is the ≤5-bullet TL;DR (Standing Orders + Stop Conditions + Universal Principles + Plumber's Loop + Anti-Patterns), and the heavy remainder (§1, §6–§13, §15–§16, full §14 anti-pattern detail, examples) becomes the on-demand Coding Reference.
- The four optimization modules are adopted wholesale from `.github/instructions/persona/optimization.md` into persona §4.6–§4.9 with light editorial cleanup for tone/length consistency but NO semantic change to the rules. `optimization.md` itself is consumed (archived or deleted) once the modules ship — it is not maintained as a parallel source.
- The composition rule (FR-015) treats `CLAUDE.md`'s bespoke sections (MCP, Agent Routing, Intent Routing, Quick Reference, Project Reference, Ultrathink, Context Management) as in-tree, hand-maintained content that is OUTSIDE the persona/coding composition contract; they survive regeneration verbatim and are edited directly in `CLAUDE.md`'s source.
- Per the existing `.github` rule, generated files (including `.github/copilot-instructions.md`) remain non-editable; `CLAUDE.md` is a generated artifact once FR-015 lands, edited only via its sources.

## Out of Scope

- **Shipping an operational safety-bypass / proportionality-override as default behaviour.** Explicitly rejected by the maintainer; the default carries only the concise principle. (This is the safety-critical line; the cross-AI review gate should affirm it before implementation.)
- Modifying or overriding any model-level safety system or platform compliance.
- The runtime Multi-Agent-Debate (MAD) infrastructure and latency/cost tooling described in `.github/instructions/persona/security/MAD-and-Latency-and-Cost.md` and `Intent-Stripper-and-Multi-Agent-Debate-Framework.md` — a separate concern.
- Adding a root-instruction path for Antigravity (`.agent/`): the consolidated root persona targets the four root-bearing tools only (Claude / Copilot / Gemini / Codex); Antigravity continues to receive agents/skills with no root persona.
- The concrete implementation of reference resolution within the transpile pipeline (transformer/code design) — belongs to `/speckit.plan` and `/speckit.tasks`.
- **Rewriting the coding-standards content itself.** This feature splits the existing coding source into Foundation + Reference and distils the 5 Foundation bullets, but does NOT revise the substance of §1–§16 (no new engineering rules, no removed rules — only a re-partitioning).
- **Adopting any further modules beyond the four in `optimization.md`.** Other brainstorm drafts under `.github/instructions/persona/security/` (the non-PVE files), `.ai/`, or future `optimization-v2.md` are out of scope; only §4.6–§4.9 ship in this feature.
- **Changing which sections of `CLAUDE.md` are bespoke vs composed.** The MCP/Agent/Intent/Quick-Ref/Project-Ref/Ultrathink/Context-Management sections are treated as fixed bespoke inputs; reclassifying any of them as persona-derived or coding-derived is out of scope.
- **Migrating `CLAUDE.md` from hand-maintained to fully generated in one step.** FR-015 lands the composition rule and removes persona/coding duplicates; full generation of `CLAUDE.md` from sources (bespoke sections included) is a possible follow-up feature, not this one.

## Dependencies

- The transpile pipeline must gain the ability to resolve reference markers at generation time for the non-native targets (the enabling capability; detailed in planning). Until then, FR-003/FR-004 cannot be satisfied for Copilot/Codex.
- Existing per-tool generation paths for Claude, Copilot, Gemini, and Codex, plus the protected-slot mechanism (FR-012).
