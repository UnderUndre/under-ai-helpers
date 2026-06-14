# Quickstart — Ecosystem Parity (consumer walkthrough)

Validates the feature end-to-end from a consumer's chair. Each section maps to a user story; run top-to-bottom in a **fresh consumer repo** for the full acceptance pass.

## 1. Install a pack from the marketplace (US1)

```text
# In Claude Code, inside your project:
/plugin marketplace add UnderUndre/ai
/plugin install spec-pipeline@underundre
```

**Verify**: `/plugin` lists `spec-pipeline` with version; `/speckit.specify` is available; agents/skills from other packs (e.g., `frontend-specialist`) are NOT loaded. Time-to-working < 5 min (SC-001).

Pack needs another pack? Install fails-loud or doctor flags it:

```bash
npx clai-helpers doctor          # warns: spec-pipeline depends on devx-core → install hint
```

## 2. Migrate a legacy full-template install (US1, FR-014)

```bash
npx clai-helpers migrate --dry-run   # see what would happen
npx clai-helpers migrate             # detect → propose packs → confirm → dedupe
```

**Verify**: identical copies removed, your own agents/commands untouched, slot-customizations reported. Re-run says "nothing to migrate".

## 3. Guards in action (US2)

With `devx-core` pack installed (or upstream repo itself):

| Try | Expect |
|-----|--------|
| `git push --force` via agent | Prompt: "Standing Order #6 … Confirm THIS invocation" — ask-gate |
| `rm -rf build` via agent | Same ask-gate |
| `npm install --yes whatever` | Ask-gate (bypass flag) |
| Agent reads `.env` | Hard deny with reason |
| Agent reads `.env.example` | Passes (allowlisted suffix) |
| `echo "rm -rf is dangerous"` | Passes (quoted-string strip) |
| Edit a `.ts` file | Lint/format feedback appears without asking |

Scripted version: `cd packages/cli && npm run test:integration -- guards` (SC-002: 100% blocked).

## 4. Permission presets (US3)

```bash
npx clai-helpers presets apply --dry-run   # diff preview
npx clai-helpers presets apply
```

**Verify**: `npm test`, `git status`, `git diff` run promptless; `.env` read pre-denied. Prompt count over a routine session drops ≥70% (SC-006).

## 5. Skill evals (US4)

```bash
node scripts/skill-evals.mjs --changed          # what CI runs on your PR
node scripts/skill-evals.mjs --all              # full catalog (weekly job)
node scripts/skill-evals.mjs --skill tdd-workflow
```

**Verify**: break a skill description on a branch → CI `skill-evals` job fails naming the skill; revert → green. Top-10 backfilled skills each have ≥1 passing case (SC-004).

## 6. Native SKILL.md delivery (US5)

```bash
npx clai-helpers regen
git diff --exit-code                            # drift gate
diff -r .claude/skills .agent/skills            # byte-identical (native target)
```

**Verify**: native targets receive unconverted skills; `docs/target-capabilities.md` lists per-target verdict + verification evidence; `status --strict` covers `packs/` and `marketplace.json` (FR-012).

## 7. Statusline (US6)

```bash
npx clai-helpers presets apply --only statusline
```

**Verify**: next Claude Code session shows `<model> | <branch> | ctx N%`.

## 8. Dialog archive (US7)

**Verify**: `.ai/dialogs/log/` + `INDEX.md` tracked in git, `.ai/dialogs/raw/` gitignored; CLAUDE.md carries the Session Logging rule; INDEX.md rows follow `date | tool | branch | theme | outcome | link`.
