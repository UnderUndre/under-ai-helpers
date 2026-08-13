---
description: Create or update the product/agency business plan before or alongside SpecKit features. First feature → create canon plan; second+ features → versioned update from spec delta. Stress-tested unit econ, focus gates, honest traction.
handoffs:
  - label: Start Feature Worktree
    agent: speckit.start
    prompt: Start isolated worktree for the feature described in the business plan
  - label: Write First Spec
    agent: speckit.specify
    prompt: Write the first feature spec aligned to the business plan
    send: true
  - label: Full Spec Combo
    agent: speckit.full-spec
    prompt: Specify + clarify the next feature under the current business plan
---

## User Input

```text
$ARGUMENTS
```

Optional args (any order, free text):

- Feature / product description (what is being built or changed)
- `--create` — force create mode even if a plan file exists (new brand/product plan)
- `--update` — force update mode (requires existing plan)
- `--path <file>` — explicit plan path (default: auto-detect under `docs/`)
- `--skip-stress` — do **not** use (debug only); stress tables are mandatory in normal mode
- `--request-external-review` — after write, print explicit prompt to run `/speckit.business-plan-review` (or manual Gemini/Grok pass); **auto-on** for CREATE and **major** bumps

ultrathink

> "Без юнит-экономики спека — это чертёж крана без давления в трубе." — Valera

## Goal

Make the **business plan a first-class SpecKit stage**, not a side PDF:

| Situation | Mode | Output |
| :--- | :--- | :--- |
| **No** `docs/**/*business-plan*.md` (or user `--create`) | **CREATE** | New versioned plan from template + market/stress pass |
| Plan exists and this is **2nd+** feature (or `--update`) | **UPDATE** | Same file(s), bump version, changelog row, patch sections touched by new spec/scope |
| Plan exists, first feature still in flight | **CREATE if empty stub / UPDATE if substantive plan** | Prefer update; never fork silent duplicates |

**When it runs in the pipeline**

1. **Before or at first `/speckit.specify`** (greenfield): plan MUST exist or be created in this command / specify gate.  
2. **On every later `/speckit.specify`** that changes ICP, pricing, packaging, focus gates, legal rails, or monetization: **UPDATE** after `spec.md` is stable (post-clarify preferred; minimum post-specify).  
3. Standalone: user runs `/speckit.business-plan <context>` anytime.

Does **not** replace `spec.md`. Plan = money/focus/go-to-market; spec = product behavior.

## Operating Constraints

**Writes (allowed paths only):**

- `docs/<product>-business-plan.md` and/or `docs/business-plan.md`
- Multi-brand: `docs/<brand>-business-plan.md` (e.g. `undreseller-business-plan.md`, `undrlla-business-plan.md`) when brands are publicly isolated
- Optional: `docs/business-plans/README.md` index if ≥2 brand plans
- Snapshot tag stage: `bizplan` via `snapshot-stage` when inside a feature git flow **or** tag on main docs commit when plan is repo-level

**Does NOT:**

- Implement product code
- Bypass focus gates invented in the plan
- Invent fake traction, 98% margins, or “Production Ready” at 0 revenue
- Mix crypto/polity narrative into sterile B2B agency plans (brand isolation)

## Detection Logic

```text
PLAN_GLOBS = docs/**/*business-plan*.md , docs/business-plan.md
FEATURE_SPECS = specs/**/spec.md  EXCEPT specs/main/**

EXISTING_PLANS = files matching PLAN_GLOBS
FEATURE_COUNT = count(FEATURE_SPECS)

If user --path → PLAN_PATH = that file
Else if single EXISTING_PLAN → PLAN_PATH = it
Else if multiple → ask user which brand/path OR update all that the feature touches
Else → PLAN_PATH = docs/business-plan.md  (or docs/<slug-product>-business-plan.md from args)

If user --create OR (not EXISTING_PLANS):
  MODE = create
Else if user --update OR FEATURE_COUNT >= 1 OR EXISTING_PLANS:
  MODE = update
```

**First-spec rule:** If `FEATURE_COUNT == 0` and `MODE` would be update without files → force **create**.

**Second+-spec rule:** If `FEATURE_COUNT >= 1` and plan exists → default **update** (even if user is about to write another spec).

## Execution Steps

### 0. Load inputs

1. Read `$ARGUMENTS` and repo context: `README*`, `AGENTS.md`, `.specify/memory/constitution.md`, existing `docs/*business-plan*`, latest `specs/**/spec.md` (if any).  
2. Load template: `.specify/templates/business-plan-template.md`.  
3. If feature slug known (cwd worktree or args), read `specs/<slug>/spec.md` when present.

### 1. Mode branch

#### A) CREATE (first plan)

1. Interview gaps **only** if blocking (max 5 questions). Prefer informed defaults + Assumptions section over endless Q&A. Blocking examples: who pays, price floor, Phase A sole SKU, legal entity path.  
2. Fill template completely.  
3. Run **Stress Pass** (section below) — mandatory.  
4. Set version **1.0** or **10.0** if continuing an external series; status honest (`Pre-revenue` / `Phase A` / traction N).  
5. Write `PLAN_PATH`.  
6. Changelog section: `vX ← ∅` initial.  
7. Report path + “next: `/speckit.start` + `/speckit.specify`” (or continue specify if already in flight).

#### B) UPDATE (second+ feature or explicit)

1. Read existing plan end-to-end.  
2. Diff against new/changed `spec.md` + user args: ICP, SKUs, pricing, gates, legal, risks, roadmap, unit econ.  
3. **Do not** full-rewrite unless user asked. Patch minimal sections.  
4. Bump version **patch** (copy/ops) or **minor** (new SKU/gate) or **major** (positioning/focus law break). Default: minor if new feature monetization; patch if wording only.  
5. Prepend/append **Changelog** row: `vNEW ← vOLD` with table of deltas + why (spec slug link).  
6. Re-run **Stress Pass** on any changed price/CAC/focus claim.  
7. Write file. Snapshot if applicable.

### 2. Stress Pass (mandatory — “Gemini/Grok valves”)

Before marking done, verify and encode:

| Valve | Rule |
| :--- | :--- |
| Traction honesty | Never “Production Ready” at 0 closed deals |
| Unit econ | At least one **stress** column (stall, low convert, FX 4.5–6%, tax) |
| Focus law | Phase A sole cash-engine explicit; dual-front banned or gated |
| Services prepay | Discovery/Blueprint-like SKUs: **100% prepay** preference under $5k |
| Timebox | Client data delay → freeze / as-is / non-refundable language if services |
| Convert | Discovery→build target + **stress 10–15%** for new bureau |
| Cold CAC | $0 paid cold until proof (cases/videos) unless plan justifies otherwise |
| Legal micro-revenue | Don’t light US LLC/5472 burn on $19 rails without gate |
| Brand isolation | B2B sterile vs polity/crypto surfaces split if both exist |
| Fantasy margins | Ban “98% margin @ 10 users with fixed GPU” class claims |
| GTM spine present | ICP, hero ladder, Phase A channels, CAC policy, convert KPI, sales artifacts, kill-criteria — not a full media plan |

If a claim fails stress → fix plan text, don’t ship vibes.

### 2b. Review policy (hybrid — do not invent a third implement-gate)

Business-plan quality uses **three layers**. This command owns A; feature pipeline owns B; C is for CREATE/major only.

| Layer | Who | When | Output |
| :--- | :--- | :--- | :--- |
| **A. Stress Pass** | This command (authoring model) | Every CREATE/UPDATE | In-plan stress tables; fail → fix before done |
| **B. Commercial drift lens** | `/speckit.analyze` + `/speckit.review` | Every feature gate before implement | Findings in `specs/<slug>/reviews/*` — plan vs spec/plan/tasks consistency only |
| **C. External biz audit** | Independent provider (Gemini/Grok/Codex/…) via `/speckit.business-plan-review` | **CREATE** always recommended; **major** bump MUST request; minor optional | `docs/reviews/business-plan-<provider>.md` (or `docs/business-plans/reviews/`) |

**Not** Principle VI: implement is **not** blocked solely by missing bizplan external review. Missing/contradictory plan on a **monetized** feature **is** blocked via analyze/review lens B (HIGH/CRITICAL).

After CREATE or major UPDATE completion report, always include:

```text
External biz review: RECOMMENDED | REQUIRED (major)
  Run: /speckit.business-plan-review
  Or paste plan into independent model; save docs/reviews/business-plan-<provider>.md
```

### 3. Multi-brand

If repo has **publicly isolated** brands (agency vs polity):

- One file per brand under `docs/`.  
- UPDATE only brands touched by the feature.  
- Cross-link focus law (e.g. polity frozen until agency cash) explicitly in both.

### 4. Snapshot (Principle VII)

When the plan change is committed with a feature slug:

```powershell
.specify\scripts\powershell\snapshot-stage.ps1 -Stage bizplan -Slug <slug-or-main>
```

```bash
.specify/scripts/bash/snapshot-stage.sh bizplan <slug-or-main>
```

Use slug `main` or product id if plan is repo-global and not feature-scoped.

### 5. Completion report

```text
✓ Business plan [CREATE|UPDATE] vX.Y
  Path:    docs/...
  Mode:    first-spec | feature-N update
  Stress:  PASS | PASS-with-assumptions
  GTM spine: present | missing-sections
  External biz review: skip | RECOMMENDED | REQUIRED (major)
  Next:    /speckit.specify ...  OR  /speckit.business-plan-review  OR  continue pipeline
```

List open assumptions (max 5). Do not dump entire plan into chat — path + delta summary only.

## Quality bar (reject own draft if)

- Status lies about traction  
- No changelog on update  
- No stress unit econ  
- Phase A sells three heroes at once with no gate  
- Custom/integration scope unlimited inside fixed price  
- Plan contradicts constitution red lines without explicit override note  

## Coordination

| Command | Duty |
| :--- | :--- |
| `/speckit.start` | Remind: if no plan file, run `/speckit.business-plan` before specify |
| `/speckit.specify` | **Gate:** create plan if missing on first feature; **hook:** queue update after spec if plan exists and feature is commercial/scope-expanding |
| `/speckit.full-spec` | Same gates as specify (inherits) |
| `/speckit.clarify` | If answers change pricing/ICP/gates → run update business-plan before plan stage |
| `/speckit.plan` | Read current business plan as commercial constraint input |
| `/speckit.implement` | Does not edit plan; may flag drift in completion notes |

## Context

$ARGUMENTS
