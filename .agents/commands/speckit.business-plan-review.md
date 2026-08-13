---
description: Independent external audit of docs/*business-plan*.md (unit econ, focus, GTM spine). Writes docs/reviews/business-plan-<provider>.md. Recommended on CREATE and major bumps — NOT a Principle VI implement gate by itself.
---

## User Input

```text
$ARGUMENTS
```

Optional: `--path <plan.md>`, provider hint, or focus areas (`pricing`, `focus`, `gtm`, `legal`).

ultrathink

> "Чужой глаз видит кассовый разрыв, который автор уже назвал стратегией." — Valera

## Goal

Run a **business-plan-only** adversarial review (same spirit as Gemini/Grok stress on undreseller/undrlla v10.x).  

**Does not** replace `/speckit.review` on features.  
**Does not** alone block `/speckit.implement` (Principle VI stays on spec/plan/tasks + commercial **drift** lens).  
**Does** produce an auditable external verdict for CREATE/major plan changes.

## Operating Constraints

**READ-ONLY** on plan content except writing the review file.  
Do **not** edit the business plan in this command — recommend patches; user or `/speckit.business-plan --update` applies them.

## Provider tag

Same table as `/speckit.review`: `claude` | `codex` | `antigravity` | `gemini` | `copilot` | other (ask user).

## Execution

### 1. Load

- All `docs/**/*business-plan*.md` and `docs/business-plan.md` (or `--path`)
- Optional: latest related `specs/**/spec.md` only for drift hints (not full feature review)
- Constitution Principle VII-B

### 2. Audit dimensions

| ID | Lens | Probe |
| :--- | :--- | :--- |
| A | Traction honesty | Fake “Production Ready”? |
| B | Unit econ stress | Missing stress column, fantasy margin, FX/tax ignored |
| C | Focus law | Dual-front, Lab leak, secondary brand eng pre-gate |
| D | Pricing / SKU | Floors, killed SKUs still sold, discovery without prepay/timebox |
| E | GTM spine | ICP, channels, CAC, convert KPI, artifacts, kill-criteria present? |
| F | Legal rails | LLC/5472/TOS traps on micro-revenue |
| G | Brand isolation | Narrative bleed |
| H | Operational valves | ERP weld, catalog limits, client stall SLA |
| I | Market claims | Unverified “facts” stated as gospel without assumption tag |

Severity: CRITICAL / HIGH / MEDIUM / LOW — same heuristic as feature review (CRITICAL = will burn cash or break gate in ≤90 days).

### 3. Verdict

| Verdict | Condition |
| :--- | :--- |
| **PASS** | 0 CRITICAL, 0 HIGH |
| **MEDIUM** | HIGH present, 0 CRITICAL — ship only with explicit accept |
| **HIGH** | Multiple HIGH or near-CRITICAL |
| **CRITICAL** | Any CRITICAL — do not use plan as commercial canon until patched |

### 4. Write

Create `docs/reviews/` if needed. Write:

`docs/reviews/business-plan-<provider>.md`

```markdown
# Business Plan Review

**Reviewer**: <provider>
**Reviewed at**: <ISO>
**Plans**: <paths>
**Commit**: <SHA>

## Summary
…

## Findings
| ID | Severity | Area | Finding | Recommendation |
|----|----------|------|---------|----------------|

## VERDICT
```yaml
verdict: PASS | MEDIUM | HIGH | CRITICAL
reviewer: <provider>
reviewed_at: …
plans: […]
critical_count: N
high_count: N
```
```

Also print path + top findings to user.  
Suggest: `/speckit.business-plan --update` to apply CRITICAL/HIGH fixes.

## When to run

| Event | Policy |
| :--- | :--- |
| `/speckit.business-plan` **CREATE** | **RECOMMENDED** (≥1 external) |
| **Major** version bump | **REQUIRED** by process (document if skipped) |
| Minor/patch from feature delta | Optional |
| Before first paid public offer | **RECOMMENDED** even if minor |

## Context

$ARGUMENTS
