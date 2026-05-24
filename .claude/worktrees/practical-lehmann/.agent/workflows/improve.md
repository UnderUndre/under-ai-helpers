# Session Review & Self-Improvement

ultrathink

> "Иногда лучше проспать понедельник, чем неделю отлаживать написанное в понедельник." — Valera on self-improvement wisdom.
> "Хорошо написанная программа — это программа, написанная два раза." — Refactoring truth.

Review this conversation. Extract actionable improvements in three categories, then **route each improvement to the correct repository** (upstream shared config vs. local project).

---

## 0. Detect Repo Context (MUST — first step)

Before touching any file, determine where you are:

```bash
# Check repo identity
git config --get remote.origin.url
git rev-parse --show-toplevel

# Check if this repo uses clai-helpers (consumer) or IS clai-helpers (upstream)
test -f helpers.config.ts && echo "UPSTREAM (UnderUndre/ai itself)"
test -f helpers-lock.json && echo "CONSUMER (uses clai-helpers sync)"
```

**Three possible contexts:**

| Context | Indicator | Write policy |
|---------|-----------|--------------|
| **Upstream** — working directly in [`github.com/UnderUndre/ai`](https://github.com/UnderUndre/ai) | `helpers.config.ts` at root, remote points to `UnderUndre/ai` | Edit `.claude/` directly. This IS the source of truth. |
| **Consumer** — project that pulls config via `clai-helpers init/sync` | `helpers-lock.json` at root, `.claude/` is managed | **Never edit `.claude/` locally** — it will be overwritten on next `sync`. Route shared improvements upstream. Local-only rules go to `<!-- HELPERS:CUSTOM START/END -->` protected slots or project-specific instruction files. |
| **Standalone** — neither | No `helpers-lock.json`, no `helpers.config.ts` | Treat as Consumer with no upstream. Rules live locally. Ask user if they want to adopt `clai-helpers`. |

---

## 1. Classify Each Improvement (shared vs. local)

For every finding from the review, ask: **"Would every other consumer of `UnderUndre/ai` benefit from this?"**

| Answer | Scope | Target |
|--------|-------|--------|
| **Yes** — universal pattern / anti-pattern / agent behavior | **Shared** | Upstream: `UnderUndre/ai` → `.claude/`, `.github/instructions/`, `CLAUDE.md` |
| **No** — project-specific stack (e.g., "our Redis key format", "this service uses pm2") | **Local** | Consumer repo only: project-specific docs, README, `<!-- HELPERS:CUSTOM -->` slots |
| **Maybe** — could go either way | Default to **Shared** if generic enough; otherwise ask user | — |

---

## 2. Review Output — Three Categories

### 2.1 New Rules (mistakes → prevention)

For each mistake or correction the user made in this session:

- Identify root cause (wrong assumption, missing context, bad pattern).
- Classify: shared vs. local (§1).
- Determine **target file** (pick from table below — only files that actually exist).

**Target files in upstream `UnderUndre/ai`**:

| Rule Type                        | Target File                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| Universal coding anti-pattern    | `.github/instructions/coding/copilot-instructions.md` (§14 Anti-Patterns)          |
| LLM integration pattern          | `.github/instructions/coding/copilot-instructions.md` (§15)                        |
| Concurrency / locking rule       | `.github/instructions/coding/copilot-instructions.md` (§16)                        |
| Commit convention / scope        | `.github/instructions/coding/git/copilot-instructions.md`                          |
| Persona behavior / tone          | `.github/instructions/persona/copilot-instructions.md`                             |
| Catchphrase / flavor             | `.github/instructions/persona/phrases/copilot-instructions.md`                     |
| Project overview / architecture  | `.github/instructions/project/copilot-instructions.md`                             |
| Agent domain behavior            | `.claude/agents/<agent-name>.md` (edit the specific agent file)                    |
| Reusable skill / decision framework | `.claude/skills/<skill-name>/SKILL.md` (or new dir if genuinely new)             |
| Slash command workflow           | `.claude/commands/<command>.md`                                                    |
| Release / versioning             | `.claude/skills/semver-versioning/SKILL.md`                                        |
| Root routing / must-know summary | `CLAUDE.md` (keep it a router — link to details, don't inline them)                |
| AI agent preference / feedback   | Memory file (`C:\Users\<user>\.claude\projects\...\memory\feedback_*.md`)          |

**Target files in consumer repo (local-only)**:

| Rule Type                        | Target File                                                             |
| -------------------------------- | ----------------------------------------------------------------------- |
| Project-specific architecture    | `docs/` (create if missing) or repo root `<PROJECT>_GUIDE.md`           |
| Protected override of shared config | `<!-- HELPERS:CUSTOM START/END -->` slot inside the synced file     |
| Deployment runbook               | `docs/` or `RUNBOOK.md`                                                 |

> **Do NOT add rules to `CLAUDE.md` body** — it is a router. Link to the details file, don't inline them.
> **Do NOT invent target files that don't exist** — check with `test -f <path>` before writing. If the right home doesn't exist yet, propose creating it and ask the user.

### 2.2 Validated Patterns (what worked well)

Identify non-obvious approaches that the user confirmed or accepted without pushback (silent consent counts).

- Save as `feedback` **memory** — persistent across sessions. Memory location comes from session-start hook or the `.remember/` directory.
- Memory entries are **per-user, not per-repo** — include enough context that the pattern is reusable in other consumer projects.

### 2.3 Repeated Workflows (candidates for automation)

If the same sequence of commands/tools was used 3+ times in this session:

- **If generic**: propose a new `/command` in `.claude/commands/` upstream + matching skill if there's a decision framework.
- **If project-specific**: propose a local script in `scripts/` or a hook in `.claude/settings.local.json`.
- For hooks modifying harness behavior (not just file watching): use the `update-config` skill.

---

## 3. Upstream Workflow (when change is Shared)

If `/improve` decided an improvement goes upstream to `UnderUndre/ai`:

### 3.1 Running INSIDE UnderUndre/ai (upstream clone)

```bash
# You're already here. Edit directly.
# 1. Make the edit
# 2. Validate
cd packages/cli && npm run validate && npm test
# 3. Commit using Conventional Commits
git add <files>
git commit -m "type(scope): subject"   # See .github/instructions/coding/git/copilot-instructions.md
# 4. Push (only with user approval per Standing Orders)
# 5. Tag/release via /bump if CLI code changed (not for .claude/ template edits)
```

**Never commit or push without explicit user request.**

### 3.2 Running INSIDE a consumer repo

```
1. Never edit .claude/ locally — it will be clobbered on next sync.
2. Options, in order of preference:

   A. If user has a local UnderUndre/ai clone:
      - Propose the exact edit with file path + diff
      - Ask user to apply there, commit, push
      - Then in consumer repo: `npx clai-helpers sync --upgrade`

   B. If user does NOT have a clone:
      - Offer to prepare a PR branch description + patch
      - User applies it via GitHub UI / gh CLI in UnderUndre/ai
      - Then in consumer: `npx clai-helpers sync --upgrade`

   C. For urgent project-specific override (can't wait for upstream):
      - Wrap custom content in `<!-- HELPERS:CUSTOM START --> ... <!-- HELPERS:CUSTOM END -->` inside the managed file
      - This survives sync
      - Still propose the upstream change for next cycle
```

### 3.3 Cross-check after sync

```bash
# In consumer repo, after the upstream change merged and you ran sync:
npx clai-helpers status --strict   # exit 0 = clean, exit 2 = drift
```

If drift is detected, someone touched a managed file locally — revisit §3.2.A.

---

## 4. Output Format

```markdown
### Context detected
- Repo: <upstream | consumer | standalone>
- Remote: <url>
- helpers-lock.json: <present|absent>

### Rules to Add
- [ ] **[shared]** `.github/instructions/coding/copilot-instructions.md` §14 — <rule> — triggered by: <what went wrong>
- [ ] **[shared]** `.claude/agents/<name>.md` — <agent behavior adjustment> — triggered by: <...>
- [ ] **[local]** `docs/RUNBOOK.md` — <project-specific rule>

### Patterns to Remember
- [ ] memory:feedback_<topic>.md — <pattern description> — confirmed by: <user action>

### Automation Candidates
- [ ] `/command-name` in `.claude/commands/` — <workflow> — repeated N times

### Upstream routing (if applicable)
- Change(s) flagged for upstream: <count>
- Suggested flow: <A | B | C from §3.2>
- Consumer action after merge: `npx clai-helpers sync --upgrade && npx clai-helpers status --strict`
```

---

## 5. Apply Rules

- **Apply approved changes immediately** in the correct repo only.
- **Ask before creating new files** — especially in upstream, where a new path changes the sync topology.
- **Never push or publish** without explicit user request (Standing Orders §1).
- If upstream edit was made here, leave consumer repos untouched — user will `sync` on their schedule.
