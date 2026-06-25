# Feature Specification: User-Level Knowledge Adaptation

**Feature Branch**: `011-user-level-adaptation`
**Created**: 2026-06-25
**Status**: Draft
**Input**: User description: "User-level knowledge adaptation subsystem: privacy-preserving storage, switchable assessment modes, per-project context, optional sync between machines. AI must determine the user's technical knowledge level and communicate/explain at that level so the user understands what's being discussed. The info may be sensitive to store in git (embarrassment, privacy concerns) — must be handled. Knowledge grows over time — must support updates (how and when?)."

## Clarifications

### Session 2026-06-25

- Q: What retention policy applies to raw signals in the inferred/hybrid signal set? → A: Configurable (user selects: off / 30d / 90d / forever).
- *Session ended early at user request after Q1. Remaining candidate questions (calibration trigger timing, inferred-mode revision cadence, offline sync conflict policy, SC-002 measurability proxy) deferred to `/speckit.plan` or a later `/speckit.clarify` pass.*

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Adaptive Explanation at My Level (Priority: P1)

As a user of any technical background, I want the AI assistant to explain concepts, decisions, and code at a depth matching my current knowledge level, so that I understand what is being discussed without being overwhelmed (too deep) or talked down to (too shallow).

**Why this priority**: This is the core value proposition. Every other story (privacy, assessment, sync) exists to serve this one. Without adaptive explanation, the subsystem has no user-facing payoff.

**Independent Test**: Can be fully tested by setting a known level on a fresh project and asking the assistant to explain a concept; the explanation depth, vocabulary, and assumed prior knowledge must visibly match the configured level, and must differ when the level is changed.

**Acceptance Scenarios**:

1. **Given** a project with my level set to "beginner", **When** I ask the assistant to explain a database migration, **Then** the explanation uses plain-language analogies, defines jargon on first use, and avoids assuming familiarity with advanced patterns.
2. **Given** the same project with my level changed to "expert", **When** I ask the same question, **Then** the explanation uses precise technical terminology, omits introductory definitions, and references advanced patterns directly.
3. **Given** my level is unset, **When** I start a session, **Then** the assistant falls back to a neutral default depth and, at the first natural opportunity, offers to calibrate the level rather than guessing silently.

---

### User Story 2 - Private Storage I Control (Priority: P2)

As a user who may not want my knowledge level exposed to teammates or the public, I want my profile stored locally and never committed to git by default, with an explicit opt-in if I choose to share an anonymized version, so that my privacy and dignity are respected.

**Why this priority**: Privacy is the stated constraint that blocks naive solutions. Without it, users will either refuse to use the feature or be embarrassed. This must be trustworthy before assessment depth matters.

**Independent Test**: Can be fully tested by initializing a profile, running a normal git workflow, and verifying the profile file is never staged, never appears in diffs, and cannot be committed without an explicit export step.

**Acceptance Scenarios**:

1. **Given** a freshly initialized profile, **When** I run `git status` and `git add -A`, **Then** the profile file is excluded from staging and does not appear in the working tree diff.
2. **Given** I want to share my level with a team, **When** I invoke the explicit export action, **Then** an anonymized, shareable artifact is produced that contains only the level classification (not raw interaction history, not identifying signals).
3. **Given** I decide to revoke what I shared, **When** I invoke the forget/remove action, **Then** the local profile is destroyed and the export artifact's removal is tracked, with no residual data left in git history by the export mechanism.

---

### User Story 3 - Choose How My Level Is Assessed (Priority: P3)

As a user with different comfort levels around transparency, I want to choose among multiple assessment modes — self-declaration, AI-inferred, a hybrid of both, or an optional calibration quiz — and switch between them at any time, so that I control how my level is determined and can pick the mode I trust.

**Why this priority**: No single assessment mode satisfies all users (self-report is inaccurate; inference feels spooky). Switchability is the compromise that makes the subsystem acceptable to a wide audience.

**Independent Test**: Can be fully tested by setting each of the four modes in sequence on the same project and confirming the level source, transparency output, and update behavior differ per mode.

**Acceptance Scenarios**:

1. **Given** I selected "self-declared" mode, **When** the assistant needs my level, **Then** it uses the value I entered and does not override it silently.
2. **Given** I selected "AI-inferred" mode, **When** the assistant has observed several of my interactions, **Then** it maintains an inferred level and exposes, on demand, the signals it used so the inference is auditable rather than opaque.
3. **Given** I selected "hybrid" mode, **When** the inferred level diverges from my self-declared one beyond a threshold, **Then** the assistant proposes a revision and waits for my confirmation rather than applying it.
4. **Given** I selected "quiz" mode, **When** I trigger calibration, **Then** the assistant asks a short, leveled set of questions and derives the level from my answers.
5. **Given** any mode is active, **When** I switch to a different mode, **Then** the previously captured data is preserved (not destroyed) and the new mode takes effect from the next interaction.

---

### User Story 4 - Per-Project Context (Priority: P4)

As a user who is senior in some codebases and junior in others, I want my knowledge level scoped per project, so that the assistant does not assume I am equally expert everywhere and adapts to my actual familiarity with each project's domain.

**Why this priority**: A single global level produces wrong behavior the moment a user works across heterogeneous projects. Per-project scoping is what makes the adaptation honest.

**Independent Test**: Can be fully tested by configuring two projects with different levels and verifying the assistant's explanation depth differs when the same concept is discussed in each.

**Acceptance Scenarios**:

1. **Given** I am "expert" in Project A and "beginner" in Project B, **When** I ask about a concept present in both, **Then** the assistant adapts its depth to whichever project context is active.
2. **Given** I open a project I have never profiled, **When** I start a session, **Then** the assistant treats the level as unknown for that project and does not import a level from an unrelated project.
3. **Given** I work in Project A, **When** my level there improves, **Then** the change is confined to Project A and does not silently alter Project B's profile.

---

### User Story 5 - Sync Between My Machines (Priority: P5)

As a user who works across multiple machines, I want to synchronize my per-project profiles between them so that calibration done on one machine is available on another, without forcing me to store the profile in a public git repository.

**Why this priority**: Portability matters once the core adaptation is trusted, but it is not blocking: a user can survive re-calibrating on a second machine. Hence lowest priority among the five.

**Independent Test**: Can be fully tested by creating a profile on Machine 1, invoking sync, and confirming the same profile appears and takes effect on Machine 2 without either machine committing the profile to the project's git history.

**Acceptance Scenarios**:

1. **Given** a profile exists on Machine 1 and sync is configured, **When** I invoke the sync action, **Then** the profile becomes available on Machine 2 without manual file copying.
2. **Given** conflicting updates on two machines, **When** sync runs, **Then** the conflict is surfaced to the user with a clear choice rather than silently overwriting either side.
3. **Given** I have opted out of sync, **When** I work normally, **Then** no profile data leaves the local machine.

---

### Edge Cases

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right edge cases.
-->

- What happens when a user's self-declared level is obviously inflated or deflated (Dunning-Kruger)? The hybrid mode must surface a gentle, non-judgmental proposal rather than a confrontation.
- What happens when the inferred level cannot be determined (insufficient interaction history)? The system must fall back to the neutral default and signal low confidence rather than guessing.
- What happens when a user switches assessment mode mid-session? The active mode takes effect immediately; in-flight explanations are not retroactively regenerated.
- What happens when a per-project profile is corrupted or partially missing? The system must degrade to "unknown level" safely, not crash or silently apply a wrong level.
- What happens when the user exports an anonymized profile, shares it, then later wants to "unshare"? The export is a point-in-time snapshot; the local profile continues to evolve independently, and the shared artifact must be revocable from the team's view.
- What happens when two teammates on the same project have very different levels? Each receives explanations at their own level; the system never averages levels across people.
- What happens when the user works offline and sync cannot run? Local adaptation continues unaffected; sync retries on reconnect without data loss.

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST maintain a per-project knowledge-level profile that the assistant consults when producing explanations.
- **FR-002**: System MUST adapt explanation depth, vocabulary, and assumed prior knowledge to the level recorded in the active project's profile.
- **FR-003**: System MUST default to a neutral explanation depth when no profile exists, and MUST offer to calibrate at the first natural opportunity rather than guessing silently.
- **FR-004**: System MUST store the profile locally by default and MUST exclude it from the project's git history unless the user explicitly opts in.
- **FR-005**: System MUST provide an explicit, user-initiated export action that produces an anonymized, shareable artifact containing only the level classification — never raw interaction history or identifying signals.
- **FR-006**: System MUST support at least four assessment modes: self-declared, AI-inferred, hybrid, and calibration quiz.
- **FR-007**: System MUST allow the user to switch assessment mode at any time without destroying previously captured data.
- **FR-008**: In AI-inferred and hybrid modes, system MUST expose, on demand, the signals used to derive the level so that inference is auditable rather than opaque.
- **FR-009**: In hybrid mode, system MUST propose level revisions for user confirmation rather than applying them silently.
- **FR-010**: System MUST scope profiles per project and MUST NOT import a level from one project into another without explicit user action.
- **FR-011**: System MUST provide a sync mechanism that propagates per-project profiles between a user's own machines without committing them to the project's public git history.
- **FR-012**: System MUST surface sync conflicts to the user with a clear resolution choice rather than silently overwriting.
- **FR-013**: System MUST provide a forget/remove action that destroys the local profile and tracks removal of any shared export.
- **FR-014**: System MUST degrade safely to "unknown level" on corrupted or missing profiles, without crashing or applying a wrong level.
- **FR-018**: In inferred and hybrid modes, system MUST apply a user-configurable retention policy to raw signals in the signal set, with at least these options: retain indefinitely, retain for 30 days, retain for 90 days, or retain none (aggregate-only). The default MUST be the most privacy-protective non-zero option that still permits inference.
- **FR-015**: System MUST support the level scale granularity as a user-selectable, switchable option across at least these representations: a 3-step scale (beginner/intermediate/expert), a 5-step scale (novice/beginner/intermediate/advanced/expert), and a continuous confidence value. The user MUST be able to switch granularity at any time without losing the underlying calibration data; the stored representation MUST be granular enough to losslessly project onto any of the supported scales.
- **FR-016**: System MUST use an expandable-hybrid model within a single project: by default the profile holds one global level value, and the user MUST be able to expand it into a per-sub-domain matrix (e.g., separate levels for the project's frontend, backend, database, and ops surfaces) on demand, while un-expanded domains continue to inherit the global value.
- **FR-017**: System MUST support at least one always-available sync transport — an encrypted file the user carries manually (e.g., via USB or a cloud drive of their choice) with no vendor dependency — and MUST allow additional transports (such as a private gist, a cloud-storage-backed secret, or a dedicated sync provider) to be added as selectable options. The default transport MUST be the vendor-neutral encrypted file so that no user is forced into a specific platform.

### Key Entities *(include if feature involves data)*

- **Profile**: The per-project record of the user's knowledge level, the active assessment mode, the source of the current level value (self-declared, inferred, quiz-derived), a timestamp of last update, and (in inferred/hybrid modes) a reference to the auditable signal set used. Holds one global level by default and MAY hold a per-sub-domain expansion.
- **Level Classification**: The value assigned to the user within a profile, stored in an internal representation granular enough to losslessly project onto any supported scale (3-step, 5-step, or continuous). The active display scale is a user-selectable attribute of the profile, switchable without data loss.
- **Scale Selector**: A per-profile setting that determines how the stored Level Classification is presented and consumed by the assistant (3-step / 5-step / continuous). Switchable at any time.
- **Sub-Domain Expansion**: An optional per-project structure that splits the global level into domain-specific levels (e.g., frontend, backend, database, ops). Un-expanded domains inherit the global value.
- **Assessment Mode**: An enumerable state (self-declared / inferred / hybrid / quiz) that determines how the level value is produced and revised.
- **Signal Set**: In inferred and hybrid modes, the collection of observed interaction cues the assistant used to derive or revise the level. Referenced from the profile; never included in anonymized exports.
- **Export Artifact**: A point-in-time, anonymized snapshot of the level classification, shareable with a team, revocable, and containing no Signal Set data.
- **Sync Transport**: A selectable mechanism for propagating profiles between a user's machines. At least one vendor-neutral transport (an encrypted file the user carries manually) MUST always be available; additional transports (private gist, cloud-storage secret, dedicated provider) MAY be added as options.

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: Users with a calibrated profile report understanding the assistant's explanations on the first read at least 80% of the time, versus a neutral-depth baseline.
- **SC-002**: In blind comparison, an expert user and a beginner user, both calibrated on the same project, rate their respective explanations as "appropriately pitched" at least 75% of the time.
- **SC-003**: 100% of new profiles are excluded from the project's git history by default, verifiable by a clean working tree check after initialization.
- **SC-004**: Switching assessment mode takes effect on the very next explanation, with no more than one interaction of latency, for at least 90% of switches.
- **SC-005**: A user working on two projects with different levels receives correctly differentiated explanations within the first two interactions in each project, in at least 90% of trials.
- **SC-006**: Sync between two machines completes a one-way propagation of a profile in under one minute of user effort, and surfaces any conflict rather than overwriting, in 100% of conflict cases.
- **SC-007**: After invoking the forget/remove action, no recoverable profile data remains on the local machine, verifiable by an absence check.
