# Quickstart: Developer Experience Bundle v1

**Feature**: 004-devx-bundle-v1 | **Date**: 2026-05-24

## Prerequisites

- Node.js >= 20.x
- clai-helpers CLI installed (`npm install -g underundre-clai-helpers`)
- For hermes wrapper: Hermes Agent binary on PATH

## Quickstart Scenarios

### S1: Hermes wrapper — basic prompt

```bash
clai-helpers hermes "explain the two-phase review flow"
# Output: hermes response streamed to stdout
# Exit code: hermes exit code
```

### S2: Hermes wrapper — from file

```bash
clai-helpers hermes --from-file prompt.txt --model claude/claude-sonnet-4
# Reads prompt.txt, passes to hermes with model override
```

### S3: Hermes wrapper — background

```bash
clai-helpers hermes --background "long-running analysis task"
# Output: PID: 12345, Log: .hermes-output-20260524-151000.log
# Returns immediately with exit 0
```

### S4: Doctor — full check

```bash
clai-helpers doctor
# Output: colored status matrix with categories: system, tools, mcp, keys, structure, drift
```

### S5: Doctor — CI mode

```bash
clai-helpers doctor --json | jq '.checks[] | select(.status=="fail")'
# Exit 1 if any critical check fails
```

### S6: Two-phase review — full flow

```bash
# Planning phase
/speckit.start "add telemetry"     # creates specs/add-telemetry branch
# ... write spec.md, plan.md, tasks.md ...
git push -u origin specs/add-telemetry
# Open PR → AI review (speckit.review ×2) → merge

# Implementation phase
/speckit.implement                  # creates add-telemetry branch from merged main
# ... implement tasks ...
git push -u origin add-telemetry
# Open PR → code review → merge
```

### S7: Rules import (verification)

```bash
# After import, verify propagation:
npx clai-helpers sync
npx clai-helpers status --strict    # should show no drift
# Check CLAUDE.md for new guardrails table entries
```

## Validation Commands

```bash
# Hermes
clai-helpers hermes "test" && echo "OK"
clai-helpers hermes --model nonexistent 2>&1 | grep -q "install" && echo "hint works"

# Doctor
clai-helpers doctor --json | python3 -c "import sys,json; json.load(sys.stdin); print('valid JSON')"
clai-helpers doctor --quiet | wc -l  # should be 0 on healthy system

# Two-phase
git branch | grep specs/  # planning branches
```
