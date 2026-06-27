# Hermes task runner

Portable, committed-to-repo tooling for driving [Hermes](https://github.com/dvoiniki/hermes)
autonomous coding agents against this monorepo. Use this when a task is large enough that
hand-editing is slow, but bounded enough that a focused subagent can complete it in one shot.

This is the **battle-tested path on Windows** — the `hermes` CLI flags (`-z`, `-Q`) are
unreliable here (TTY / `prompt_toolkit` issues). The Python `AIAgent` API below works
across Windows / macOS / Linux.

---

## Files

| File                       | Purpose                                                        |
| -------------------------- | ------------------------------------------------------------- |
| `run-agent.py`             | Portable wrapper: auto-detects Hermes, loads prompt from file  |
| `task-prompt.template.txt` | Reusable prompt skeleton — copy & fill per task               |
| `../.claude/commands/hermes-invocation.md` | Full operational playbook (orchestrator-side)  |

---

## One-time setup

### 1. Install Hermes

Follow the official Hermes install docs. The short version:

```bash
# option A — pipx (recommended)
pipx install hermes-agent

# option B — venv manually
python -m venv ~/.hermes/venv
source ~/.hermes/venv/bin/activate        # Windows: ~\.hermes\venv\Scripts\activate
pip install hermes-agent
```

Verify `run_agent` is importable from the resolved Python:

```bash
python -c "import run_agent; print('ok')"
```

### 2. Tell the runner where Hermes lives

The runner auto-detects common install locations. If yours differs, set one env var:

```bash
# point directly at the venv python that has run_agent
export HERMES_PYTHON=/path/to/hermes/venv/bin/python
# Windows PowerShell:
#   $env:HERMES_PYTHON = "C:\Users\you\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe"
```

Optional tuning (all have sensible defaults):

```bash
export HERMES_MODEL="agy/gemini-3.5-flash-low"      # model id
export HERMES_PROVIDER="custom"                     # provider
export HERMES_BASE_URL="http://localhost:20128/v1"  # OpenAI-compatible endpoint
export HERMES_MAX_ITERATIONS=140                    # tool-call cap (90 small, 140 big)
export HERMES_SKIP_MEMORY=0                         # 1 = stateless batch runs
```

---

## Run a task

### 1. Write the prompt

Copy the template, fill the `{{PLACEHOLDERS}}`:

```bash
cp scripts/hermes/task-prompt.template.txt .hermes/029/t014.txt
# edit .hermes/029/t014.txt
```

Keep prompts under `.hermes/<spec-id>/` — that folder is gitignored (scratch artifacts,
not committed). See the template file for the full structure; the key sections are
`READ FIRST`, `CHANGES`, `SELF-VERIFY`, `RULES`.

### 2. Launch

**Small task (blocking, < 3 min):**

```bash
python scripts/hermes/run-agent.py .hermes/029/t014.txt
```

**Big task (background, 4-8 min):**

```bash
# bash/zsh
python scripts/hermes/run-agent.py .hermes/029/t008.txt > .hermes/029/t008.out 2>&1
echo "exit=$?"

# PowerShell
& python scripts/hermes/run-agent.py .hermes/029/t008.txt *> .hermes/029/t008.out
Write-Output "exit=$LASTEXITCODE"
```

> **Do NOT pipe through `tee` / `Tee-Object`** — it swallows the process-completion signal
> in background mode. Redirect straight to a file.

### 3. Monitor

The wrapper's stdout only gets the **final** response. To watch the agent think in real time,
tail the Hermes agent log:

```bash
# Linux/macOS
tail -f ~/.hermes/logs/agent.log

# PowerShell
Get-Content "$env:LOCALAPPDATA\hermes\logs\agent.log" -Tail 4 -Wait
```

Healthy progress signals:
- API call count climbing steadily (70-90+ for big tasks is normal, not stuck).
- `cache=90%+` — the agent is re-reading context efficiently.
- Tool errors — the agent retries/fixes on its own; only intervene if it loops > 5x.
- `total` tokens approaching ~210k — near the context window; it wraps up soon.

### 4. Verify (do NOT skip)

The agent runs `tsc` in its `SELF-VERIFY` step, but **always re-check yourself**:

```bash
cd apps/api  && npx tsc --noEmit 2>&1 | grep -E "funnel|your-file"
cd apps/web  && npx tsc --noEmit 2>&1 | grep -E "MergeView|your-file"
```

Also run `git status --short` and delete any out-of-scope artifacts the agent created
(stray test files, `_gate-override.md` style notes, etc.).

---

## When to use this vs. editing directly

| Situation                                              | Use Hermes? |
| ------------------------------------------------------ | ----------- |
| Big multi-file feature (mutation + lock + cost cap)    | ✅ Yes       |
| Complex UI with new patterns (dual canvas, modal flow) | ✅ Yes       |
| Compiler / algorithm extension across many cases       | ✅ Yes       |
| Single small file, < 50 lines, mechanical              | ❌ No — edit directly, faster |
| Cross-cutting refactor needing global judgment         | ❌ No — orchestrate yourself |
| Anything needing interactive back-and-forth            | ❌ No — Hermes is one-shot    |

---

## Troubleshooting

| Symptom                                          | Fix                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `could not find a Hermes installation`           | Set `HERMES_PYTHON` to your venv python                             |
| `NoConsoleScreenBufferError`                     | You're using `hermes` CLI instead of this wrapper — use `run-agent.py` |
| Agent edits files outside the scope              | Your `RULES` section wasn't explicit enough — list off-limits files |
| Agent invents env vars / error classes           | `CHANGES` section lacked exact names — be more specific             |
| `tsc` errors the agent didn't report             | Agent's `SELF-VERIFY` ran in a different cwd — always re-check      |
| Background run "hangs"                           | Check `agent.log` — it's likely still working (high API call count) |

---

## Prompt-writing tips (what makes subagents succeed)

1. **`READ FIRST` with line ranges** — saves 30-50% of API calls; the agent skips
   re-discovering conventions.
2. **Numbered `CHANGES` with exact names** — env vars, error classes, lock keys, Redis
   TTLs. Ambiguity → the agent invents things.
3. **`SELF-VERIFY` with `tsc`** — the agent self-corrects before returning. You get a
   clean file, not a draft.
4. **`RULES` with explicit off-limits list** — prevents scope creep. The agent WILL edit
   tangential files otherwise.
5. **One task per invocation** — don't batch unrelated tasks; context window fills and
   quality drops after ~task 3.
