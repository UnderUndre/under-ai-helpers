# Quickstart — 004-devx-bundle-v1

**Feature**: Developer Experience Bundle v1
**Date**: 2026-05-24

Developer quick-reference for the four components in this bundle. Each scenario is self-contained.

---

## Scenario 1: Start a New SpecKit Feature (Two-Phase Flow)

```bash
# Step 1: Start planning phase
# Creates branch specs/<slug> with spec file scaffold
npx clai-helpers speckit.start my-feature

# Branch created: specs/my-feature
# Files created: specs/my-feature/spec.md
# Push and open planning PR
git push -u origin specs/my-feature
gh pr create --title "Planning: my-feature" --base main --head specs/my-feature \
  --template spec.md
```

**What happens**: Branch `specs/my-feature` is created from `main`. Only `specs/my-feature/**` files are expected. CI runs reduced checks (markdown lint, link check, analyze regen).

---

## Scenario 2: Open Planning PR and Get AI Review

```bash
# Write spec artifacts in specs/my-feature/
# Then open planning PR
gh pr create --title "Planning: my-feature" \
  --body-file specs/my-feature/spec.md

# Trigger AI review via SpecKit
npx clai-helpers speckit.review

# Review output includes:
# - Completeness check (all required sections present)
# - Consistency check (FR coverage, acceptance scenario mapping)
# - Verdict: PASS / NEEDS_REVISION
```

**What happens**: The AI review gate runs on the planning PR. Spec artifacts are validated against the SpecKit schema. Review comments are posted on the PR. Merge is blocked until verdict is PASS.

---

## Scenario 3: Merge Planning PR, Start Implementation

```bash
# After planning PR is approved and merged
gh pr merge specs/my-feature --squash

# Step 2: Start implementation phase
# Creates branch <slug> from updated main
git checkout main && git pull
npx clai-helpers speckit.implement my-feature

# Branch created: my-feature (no prefix)
# CI runs full checks: test, build, lint, type check
```

**What happens**: Planning branch `specs/my-feature` is auto-deleted after merge. Implementation branch `my-feature` is created from `main` (now containing merged specs). Full CI suite runs on this branch.

---

## Scenario 4: Run Hermes Wrapper

### Basic mode — forward a prompt

```bash
npx clai-helpers hermes "Summarize the architecture of this project"
```

### Pipe mode — stdin as prompt

```bash
cat my-prompt.txt | npx clai-helpers hermes
echo "What does FR-009 do?" | npx clai-helpers hermes
```

### File mode — read prompt from file

```bash
npx clai-helpers hermes --from-file ./prompts/review-prompt.md
```

### Background mode — detach and log

```bash
npx clai-helpers hermes --background "Run full test suite and report"
# Output: PID=12345 Log=.hermes-output-2026-05-24T14-30-00.log
# Returns immediately with exit code 0
```

### With model/provider overrides

```bash
npx clai-helpers hermes --model claude-sonnet-4-20250514 "Analyze this" 
npx clai-helpers hermes --provider openrouter --toolsets "git,filesystem" "Deploy check"
```

**Error case** — hermes not on PATH:

```bash
npx clai-helpers hermes "test"
# Output: Error: hermes binary not found on PATH.
#         Install: https://hermes-agent.nousresearch.com/docs/install
# Exit code: 127
```

---

## Scenario 5: Run Doctor Check

### Default — colored status matrix

```bash
npx clai-helpers doctor
```

Output (example):

```
╔══════════════════════════════════════════════════════╗
║               clai-helpers Doctor Report              ║
╠══════════════════════════════════════════════════════╣
║ SYSTEM                                               ║
║   Node.js version      >=20.x         ✓ pass (22.1) ║
║   npm version          present         ✓ pass (10.7) ║
║   git version          present         ✓ pass (2.45) ║
║ CLI TOOLS                                            ║
║   gh CLI               installed       ✓ pass        ║
║   gh auth              authenticated   ✓ pass        ║
║   hermes               not found       ✗ fail        ║
║ MCP SERVERS                                          ║
║   context7             reachable       ✓ pass        ║
║   filesystem           reachable       ✓ pass        ║
║   github               reachable       ✓ pass        ║
║   sequential-thinking  timeout         ? unknown     ║
║ API KEYS                                             ║
║   ANTHROPIC_API_KEY    set             ✓ pass        ║
║   OPENAI_API_KEY       not set         ⚠ warn        ║
║ STRUCTURE                                            ║
║   .claude/ dirs        valid           ✓ pass        ║
║   .claude/ frontmatter valid           ✓ pass        ║
╚══════════════════════════════════════════════════════╝
Exit code: 1 (critical failures found)
```

### JSON output — machine-readable

```bash
npx clai-helpers doctor --json | jq '.checks[] | select(.status=="fail")'
```

### Quiet mode — failures only

```bash
npx clai-helpers doctor --quiet
# Only prints failing checks, suppresses passes and warnings
```

---

## Scenario 6: Understand Imported AI Engineering Coach Rules

The 45 anti-pattern rules from `microsoft/AI-Engineering-Coach` are imported and adapted into three locations:

### In CLAUDE.md guardrails

```markdown
## AI-Generated Code Guardrails

### Anti-Pattern: God Object
**Why it bites**: Single class/function accumulates responsibilities until
it becomes untestable and fragile. Change one thing, break three others.
**Correct pattern**: Single responsibility. Extract. Compose.

### Anti-Pattern: Magic Numbers
**Why it bites**: Bare numeric literals in logic. Six months later nobody
knows what `86400` means. Bugs breed in mystery constants.
**Correct pattern**: Named constants. `const SECONDS_PER_DAY = 86400`.
... (45 rules total)
```

### In code-review-checklist skill

Checklist augmented with applicable rules — each rule becomes a review checklist item with pass/fail criteria.

### In lint-and-validate skill

Rules with automatable checks (e.g., magic numbers, console.log in production, missing error handling) are added as lint targets.

### Attribution

```bash
cat docs/CREDITS.md
# Contains: MIT license notice for microsoft/AI-Engineering-Coach

cat vendor/AI-Engineering-Coach-LICENSE
# Contains: Copy of the MIT license from upstream repo
```

---

## Scenario 7: Full Cycle — Start to Merge

Complete walkthrough of the two-phase flow for a feature called `batch-processor`:

```bash
# 1. Start planning
npx clai-helpers speckit.start batch-processor
# → Branch specs/batch-processor created

# 2. Write spec artifacts
# Edit specs/batch-processor/spec.md with requirements, scenarios, edge cases

# 3. Open planning PR
git add specs/batch-processor/
git commit -m "spec: batch-processor requirements and acceptance scenarios"
git push -u origin specs/batch-processor
gh pr create --title "Planning: batch-processor" \
  --template spec.md

# 4. AI review on planning PR
npx clai-helpers speckit.review
# → Verdict: PASS (or iterate on feedback)

# 5. Merge planning PR
gh pr merge specs/batch-processor --squash
# → Branch specs/batch-processor auto-deleted

# 6. Start implementation
git checkout main && git pull
npx clai-helpers speckit.implement batch-processor
# → Branch batch-processor created from main (with merged spec)

# 7. Implement the feature
# Write code, tests, etc. Reference specs/batch-processor/spec.md for requirements

# 8. Open implementation PR
git push -u origin batch-processor
gh pr create --title "Implement: batch-processor" \
  --template impl.md
# → Full CI runs: test, build, lint, type check, analyze regen

# 9. Code review + merge
# Standard code review process
gh pr merge batch-processor --squash

# Done. Feature shipped through two-phase governance.
```

### If spec needs patch during implementation

```bash
# Spec issue discovered during implementation
git checkout main
# Create a normal PR to fix the spec
git checkout -b fix/batch-processor-spec-typo
# Edit specs/batch-processor/spec.md
git commit -am "fix: correct batch-processor spec edge case"
git push -u origin fix/batch-processor-spec-typo
gh pr create --title "Fix: batch-processor spec typo"
# Merge to main; implementation branch rebases or merges from main
```

This does NOT block the implementation branch — it's a normal bug-fix PR to main.
