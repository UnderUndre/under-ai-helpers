# Research — 006 Ecosystem Parity

**Date**: 2026-06-10 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Resolves all NEEDS CLARIFICATION items and records design decisions with alternatives considered. Confidence flags per repo Stop Conditions (<0.85 → marked ⚠️ verify).

---

## R1. Plugin / marketplace packaging format

**Decision**: Use the native Claude Code plugin marketplace format. Repo root gains a **generated** `.claude-plugin/marketplace.json` listing packs; each pack is a **generated** directory `packs/<pack-id>/` containing `.claude-plugin/plugin.json` + `commands/`, `agents/`, `skills/`, `hooks/` subsets copied from `.claude/` by the pipeline.

**Mechanics** (consumer side):

```
/plugin marketplace add UnderUndre/ai
/plugin install spec-pipeline@underundre
```

**Rationale**:
- Marketplace format is the ecosystem standard the spec targets (claude-plugins-official, superpowers all ship this way).
- Generating `packs/` from `.claude/` keeps Constitution Principle I (single source of truth) and Principle II (pipeline, not fork). Hand-maintained pack copies would drift — forbidden.
- A pack = a plugin. Plugin component namespacing (`pack:command`) prevents collisions with consumer-local commands.

**Alternatives rejected**:
- *Hand-authored `packs/` tree* — duplicates `.claude/`, violates Principle II, guaranteed drift.
- *marketplace.json `source` pointing at subpaths of `.claude/` directly* — impossible to partition: plugin source root defines component discovery; `.claude/` is one monolith. Partitioning requires physical pack dirs.
- *npm-only distribution of packs* — misses the entire point of US1; `/plugin` UX is the ecosystem norm for Claude Code.

✅ RESOLVED 2026-06-14 (T002 probe): `marketplace.json` / `plugin.json` field set confirmed against [CC marketplace docs](https://docs.anthropic.com/en/docs/claude-code/plugin-marketplaces). Schema captured in `docs/target-capabilities.md` §"Claude Code". `marketplace.json` requires `name`, `owner{name,email?}`, `plugins[]`; plugin entries accept `name`, `source` (string relative path OR object with `source` enum: `github`/`url`/`git-subdir`/`npm` + fields), `description`, `version`, `author`, `displayName`, `homepage`, `repository`, `license`, `keywords`, `category`, `tags`, `strict`, `defaultEnabled`, `commands`, `agents`, `hooks`, `mcpServers`, `lspServers`, `skills`. Optional `metadata.pluginRoot` for path-prefix shorthand. `.claude-plugin/plugin.json` per-plugin: `name`, `description`, `version`, `author{name,email?}`, `homepage`, `repository`, `license`.

## R2. Pack partitioning

**Decision**: 8 domain packs mirroring the Agent Routing table. Membership mapping is **hand-written** in `helpers.config.ts` (new `packs` section — the config file is already the authoritative pipeline source). Initial cut:

| Pack | Agents | Indicative content |
|------|--------|--------------------|
| `devx-core` | debugger, explorer-agent, project-planner, orchestrator | clean-code, lint-and-validate, plan-writing, systematic-debugging, typescript-expert, behavioral-modes, brainstorming; /dispatch, /verify, /fix-*, /bump, /commit, /diff, /learn, /improve; guard hooks; statusline |
| `spec-pipeline` | — | /speckit.* (20 commands), spec/plan/tasks templates, snapshot scripts |
| `backend` | backend-specialist, database-architect | api-patterns, database-design, system-design-patterns, nodejs-best-practices, nestjs-expert, prisma-expert, python-patterns, mcp-builder |
| `frontend` | frontend-specialist, ui-ux-pro-max | react-patterns, tailwind-patterns, frontend-design, nextjs-best-practices, ui-ux-pro-max, i18n-localization |
| `testing` | test-engineer | testing-patterns, tdd-workflow, webapp-testing; /test, /fix-tests |
| `security` | security-auditor, penetration-tester | vulnerability-scanner, red-team-tactics |
| `ops` | devops-engineer | deployment-procedures, server-management, docker-expert; /deploy |
| `extras` | mobile-developer, game-developer, documentation-writer, seo-specialist | mobile-design, game-development, documentation-templates, seo-fundamentals, geo-fundamentals |

`devx-core` is the universal dependency (every other pack `dependsOn: ["devx-core"]` only where a real cross-reference exists — validator decides, see R9).

**Rationale**: Clarification session fixed "by domain, mirroring Agent Routing, agent travels with its skills and commands". 8 packs sits inside the agreed 6–8 range.

**Alternatives rejected**:
- *By artifact type (agents-pack, skills-pack…)* — breaks "agent travels with its skills"; a consumer installing `agents` without `skills` gets broken frontmatter refs.
- *One mega-pack* — reproduces today's full-template bloat; fails SC-003 (50% context reduction).

## R3. Guard hook runtime — cross-platform (FR-005/006/013)

**Decision**: Guard hooks are **Node.js scripts** (`.claude/hooks/*.mjs`), invoked as `node "$CLAUDE_PROJECT_DIR/.claude/hooks/<name>.mjs"`. Single implementation, no bash/PowerShell forks.

**Hook protocol** (PreToolUse): read tool-call JSON from stdin → emit JSON `hookSpecificOutput.permissionDecision`:
- **Destructive commands** (Standing Orders #3/#6: `rm -rf`, `git push --force`, `--force|--yes|-y` bypass flags, `DROP TABLE`, …) → `"ask"` — harness prompts the user for that specific invocation. Headless runs resolve `ask` to deny. This is exactly the clarified policy: *hard deny by default, per-invocation explicit override, defaults never weakened*.
- **Secret reads** (Standing Order #7: `.env`, `.env.*`, `**/.ssh/**`, `*.pem`, `id_rsa*`, …) → `"deny"` outright on Read/Grep/Glob/Bash-cat paths. Override path = the user explicitly whitelists in their own settings, not via our hook.
- **PostToolUse** (FR-007): after Edit/Write on source files, run the consumer's formatter/linter if detectable (`package.json#scripts.format|lint`), surface output as `additionalContext`. No-op when undetectable — never block on missing tooling.

**Rationale**:
- Node ≥20 is already the hard floor for every consumer of this npm CLI (`engines`) — the only runtime we can assume on Windows/macOS/Linux. Solves the "Windows without POSIX shell" edge case head-on.
- `ask` vs `deny` split maps 1:1 onto FR-005 (override allowed) vs FR-006 (deny).
- Pattern matching on **structured input** (tool name + parsed command string), with quoted-string stripping before matching to address the false-positive edge case (deny pattern inside a quoted arg / filename).

**Alternatives rejected**:
- *Dual bash + PowerShell scripts* — two implementations of security-critical regexes WILL drift; a drifted guard is a leak.
- *Pure settings.json `permissions.deny` rules only* — covers simple path/command prefixes but cannot strip quotes, canonicalize paths, or explain *why* (FR-005 demands human-readable reason). Presets (R4) and hooks are complementary layers.
- *Porting the 3 existing bash hooks now* — out of scope creep; they're advisory, not guards. Logged as polish-phase stretch.

## R4. Permission presets (FR-008)

**Decision**: Ship `presets/permissions.json` (in `devx-core` pack + repo root for CLI path) containing a curated `permissions.allow` / `permissions.deny` fragment. Applied by a new CLI command `helpers presets apply` that **merges** into the consumer's `.claude/settings.json`:
- allow: `Bash(npm test:*)`, `Bash(npm run validate:*)`, `Bash(npm run build:*)`, `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`, `Bash(npx tsc --noEmit:*)` etc. — read-only/idempotent routine ops.
- deny: `Read(./.env)`, `Read(./.env.*)`, `Read(**/.ssh/**)`, `Read(**/*.pem)`, plus destructive Bash prefixes as defense-in-depth under the hooks.

Merge semantics: never remove existing consumer entries; dedupe; idempotent re-run; `--dry-run` prints the diff. Backup written before first mutation (reuse `core/staging.ts` discipline).

**Rationale**: Plugins cannot ship `permissions` (hooks yes, permission rules no — settings are user-owned). So presets need the CLI as the delivery vehicle; the pack carries the JSON as payload + docs.

**Alternative rejected**: *docs-only "paste this into settings"* — guarantees drift and typos; FR-014's CLI-assisted philosophy applies here too.

## R5. Skill trigger evals (FR-009)

**Decision**:
- **Format**: co-located per skill — `.claude/skills/<name>/evals.json`: `{ cases: [{ prompt, expect: "<skill-name>", note? }] }`. Co-location means evals automatically travel with the skill into packs.
- **Runner**: repo-level Node script `scripts/skill-evals.mjs` (not CLI surface). Builds the catalog of all skill `name + description` frontmatter, then for each case asks the model "which skill triggers for this user message?" — model = Haiku-class for cost.
- **Flake policy**: each case runs N=3, pass threshold ≥2/3. A case failing 3/3 = regression; 1–2/3 = flagged flaky (warn, not fail) — satisfies the nondeterminism edge case.
- **CI**: `.github/workflows/skill-evals.yml`, triggered on PR paths `.claude/skills/**` (changed-skills only → ratchet) + weekly scheduled full run (silent-drift guard per spec assumption). Requires `ANTHROPIC_API_KEY` secret.
- **Backfill**: top-10 most-used skills by reference count — skills referenced in agent `skills:` frontmatter + Intent Routing table (deterministic, computable from the repo itself).

**Alternatives rejected**:
- *Deterministic keyword matching* — tests nothing real; triggering is an LLM judgment, the eval must exercise an LLM.
- *Full-catalog CI on every PR* — ~43 skills × cases × 3 runs per PR = cost explosion; ratchet was explicitly chosen in clarifications.
- *Eval runner inside `clai-helpers` CLI* — drags an API-key dependency into a file-transform tool; wrong layer. Can be promoted later if consumers ask.

## R6. Native SKILL.md delivery (FR-010)

**Decision**: Introduce a **target capability matrix** (`docs/target-capabilities.md`, machine-readable mirror in `helpers.config.ts` per-target flag `skillsNative: true|false`). For native targets, skills ship via `identity` transformer (byte-identical); conversion transformers remain only for non-native targets.

Current reality check (from `helpers.config.ts`): skills today only mirror to `.agent/skills/` (Antigravity) via identity — already native-style. The change is therefore: (a) **add** identity skill pipelines for targets confirmed to read SKILL.md natively (Codex/`.agents/skills/` ⚠️, Gemini CLI ⚠️, Cursor ⚠️ — each needs empirical verification, repo precedent: 2026-04-25 Antigravity/Codex probes), (b) codify the matrix so future target decisions are data-driven, (c) ensure no *new* conversion paths get authored for native targets.

**SC-005 note**: "conversion paths drop by half" is measured against the **planned-but-now-unnecessary** conversion work for new targets, plus any conversion path the matrix proves redundant. The honest baseline (today: zero skill-conversion transformers exist) is recorded here to keep `/speckit.analyze` from tripping on inflated claims.

**Alternative rejected**: *converting skills into per-tool formats* (e.g., Gemini TOML-ified skills) — the standard moved; maintenance surface without benefit.

## R7. Statusline preset (FR-011)

**Decision**: `presets/statusline.mjs` — Node script reading the statusline stdin JSON, printing one line: `<model> | <git branch> | ctx <used>%`. Installed by `helpers presets apply` writing `statusLine: { type: "command", command: "node .claude/statusline.mjs" }` into consumer settings (same merge machinery as R4). Carried in `devx-core` pack as payload.

⚠️ PARTIALLY RESOLVED 2026-06-14 (T002 probe): exact stdin JSON field names for statusline still DEFERRED — not covered in CC plugins/marketplaces docs. Branch is derivable via `git rev-parse --abbrev-ref HEAD` directly. Model/context-usage field names need runtime probe against local CC install (T032 first task). `docs/target-capabilities.md` V3 records the open question.

**Alternative rejected**: *bash statusline* — same cross-platform argument as R3.

## R8. Legacy migration command (FR-014)

**Decision**: New CLI subcommand `helpers migrate` (file: `packages/cli/src/cli/migrate.ts`):
1. **Detect**: scan consumer `.claude/{commands,agents,skills}` against upstream catalog using existing `core/hash.ts` manifest machinery. Classify per file: `identical` (hash match) / `slot-modified` (differs only inside HELPERS:CUSTOM slots) / `consumer-authored` (no upstream counterpart or non-slot diff).
2. **Propose**: compute minimal pack set covering all `identical` + `slot-modified` components; print table.
3. **Confirm**: `@inquirer/prompts` confirmation (already a dependency) — no `--yes` flag, per Standing Order #3.
4. **Apply**: remove `identical` duplicates; **never touch** `consumer-authored`; `slot-modified` → extract slot content, report for manual port, leave file with `.migrated-keep` note.
5. **Re-runnable**: pure function of current tree state; second run = no-op.

**Alternative rejected**: *docs-only migration guide* — explicitly rejected in clarifications ("CLI-assisted, not docs-only").

## R9. Pack dependency resolution (FR-003)

**Decision**: `dependsOn: string[]` in each pack's manifest (our extension field in `plugin.json`). Enforced at **generation time**: the pack assembler validates that every cross-component reference (agent frontmatter `skills:`, command → agent mentions) resolves inside the pack or its declared deps — build fails otherwise ("never a silent broken reference"). At **install time** Claude Code has no dependency engine ⚠️, so marketplace descriptions list deps and `helpers doctor` gains a check that flags installed packs with missing deps.

**Alternative rejected**: *fully self-contained packs (duplicate shared skills into every pack)* — N copies of `plan-writing` in N packs = drift, Principle II violation, context bloat on multi-pack installs.

## R10. Drift coverage for new artifact classes (FR-012)

**Decision**: `packs/` + `.claude-plugin/marketplace.json` are generated outputs of `helpers regen` — the existing drift check (`regen + git diff --exit-code` upstream; `status --strict` consumer) covers them with **zero new mechanism** once they're pipeline outputs. Eval defs, presets, hooks, statusline live under `.claude/` (source) so they're inputs, not drift surfaces; their pack copies are covered as generated outputs.

## R11. Dialog archival scaffold (FR-015 / US7)

**Current state** (verified 2026-06-10): `.ai/dialogs/{raw,log}/` exist, `INDEX.md` exists, `raw/.gitkeep` present; CLAUDE.md already carries the "Session Logging (Advisory)" rule. Remaining work: verify `.gitignore` covers `raw/` (tracked-vs-ignored split per FR-015), flesh INDEX.md entry template, cross-link from README. Raw-layer capture hook = milestone 007-dialog-capture, out of scope.

---

## Open items deferred to implementation (tracked in tasks.md)

| # | Item | Verification path |
|---|------|-------------------|
| V1 | marketplace.json / plugin.json current field set | Claude Code docs + empirical install |
| V2 | Native skills dir per target (Codex, Gemini CLI, Cursor) | Empirical probe per tool, repo precedent 2026-04-25 |
| V3 | Statusline stdin JSON schema | Docs + live session probe |
| V4 | Plugin-shipped hooks path var (`${CLAUDE_PLUGIN_ROOT}`) behavior on Windows | Empirical |
