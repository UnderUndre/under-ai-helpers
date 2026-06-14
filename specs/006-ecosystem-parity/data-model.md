# Data Model — 006 Ecosystem Parity

**Date**: 2026-06-10 | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

No database. All entities are filesystem artifacts (JSON/MD) or in-memory structures of the pack assembler. Schemas formalized in [contracts/](contracts/).

---

## 1. Pack

A named, versioned, installable unit. **Source representation**: entry in `helpers.config.ts#packs`. **Generated representation**: `packs/<id>/` directory with `.claude-plugin/plugin.json`.

| Field | Type | Rules |
|-------|------|-------|
| `id` | string | kebab-case, unique, ∈ {devx-core, spec-pipeline, backend, frontend, testing, security, ops, extras} (initial set) |
| `name` | string | display name |
| `description` | string | ≤200 chars, consumer-facing |
| `version` | semver string | independent per pack; bumped when membership or member content changes (release task defines policy) |
| `agents` | string[] | basenames under `.claude/agents/` — must exist (validator) |
| `commands` | string[] | basenames/globs under `.claude/commands/` — must exist |
| `skills` | string[] | dir names under `.claude/skills/` — must exist |
| `hooks` | string[] | files under `.claude/hooks/` carried by this pack (guards → devx-core) |
| `payload` | string[] | non-component files (presets/*.json, statusline.mjs) |
| `dependsOn` | string[] | pack ids; acyclic (validator); every cross-pack reference must be covered |

**Invariants** (enforced by `core/packs/validate.ts` at generation time):
- I1: every listed component exists in `.claude/`.
- I2: every component belongs to ≥1 pack (full-catalog coverage — nothing orphaned).
- I3: a component may appear in **exactly one** pack (no duplication; shared needs → `dependsOn`).
- I4: agent frontmatter `skills:` resolve within own pack ∪ deps — else build fails (FR-003 "never a silent broken reference").
- I5: dependency graph is a DAG.

## 2. Marketplace manifest

`.claude-plugin/marketplace.json` — **generated** from pack entries. Consumer-facing catalog entry point.

| Field | Type | Rules |
|-------|------|-------|
| `name` | string | marketplace id (`underundre`) |
| `owner` | object | name/url from package.json metadata |
| `plugins[]` | array | one entry per pack: `{ name, source: "./packs/<id>", description, version }` |

**Invariant**: `plugins[]` is a pure projection of the packs config — regenerating with unchanged source is byte-identical (idempotence, requirements §1.2).

## 3. Guard rule

One harness-enforced policy entry inside a guard hook. Represented as a typed table in the hook source (not config — security defaults are code, reviewed via PR).

| Field | Type | Rules |
|-------|------|-------|
| `event` | enum | `PreToolUse` \| `PostToolUse` |
| `toolMatcher` | string | e.g. `Bash`, `Read`, `Edit\|Write` |
| `pattern` | RegExp + canonicalizer | matched against parsed/quote-stripped command or normalized path |
| `action` | enum | `ask` (destructive, FR-005) \| `deny` (secrets, FR-006) \| `feedback` (FR-007) |
| `reason` | string | human-readable, names the Standing Order — shown to session |
| `standingOrder` | int | 3, 6, or 7 — traceability to CLAUDE.md |

**Initial rule set**: destructive → `rm -rf`/`rd /s`, `git push --force|-f`, `git reset --hard` (on shared refs), `DROP TABLE|DATABASE`, bypass flags `--force|--yes|-y|--no-verify`; secrets → `.env`, `.env.*`, `**/.ssh/**`, `*.pem`, `id_rsa*`, `*.key` (curated list, security-auditor reviews).
**Invariant**: quoted-substring occurrences do not match (false-positive edge case); every rule has a non-empty `reason`.

## 4. Permission preset

`presets/permissions.json` — shippable allow/deny profile.

| Field | Type | Rules |
|-------|------|-------|
| `allow[]` | string[] | Claude Code permission rule syntax; read-only/idempotent ops only |
| `deny[]` | string[] | secrets + destructive; superset-consistent with guard rules (no contradiction: preset must not allow what guards deny) |

**Merge contract** (`helpers presets apply`): union with existing consumer lists, dedupe, never delete consumer entries, idempotent, `--dry-run` available.

## 5. Skill eval case

`.claude/skills/<name>/evals.json`.

| Field | Type | Rules |
|-------|------|-------|
| `cases[]` | array | ≥1 per gated skill (FR-009) |
| `cases[].prompt` | string | representative user phrase (RU or EN — both occur in this repo's docs) |
| `cases[].expect` | string | skill name; usually the owning skill, cross-skill negative cases allowed |
| `cases[].note` | string? | rationale |

**Run semantics**: N=3 model votes per case; pass ≥2/3; 0–1/3 = fail (regression), exactly 2/3 = pass-with-flake-warning. CI fails on any fail in the gated set (changed skills ∪ top-10 backfill).

## 6. Target capability matrix

`docs/target-capabilities.md` (human) + `skillsNative: boolean` per target in `helpers.config.ts` (machine).

| Field | Type | Rules |
|-------|------|-------|
| `target` | string | existing target ids: claude, copilot, gemini, agent, codex, … |
| `skillsNative` | bool | true → identity pipeline mandatory for skills; false → conversion permitted |
| `verifiedOn` | date | empirical verification date (repo precedent: 2026-04-25 probes) |
| `evidence` | string | how verified (docs link / installed-app probe) |

**Invariant**: a target with `skillsNative: true` MUST NOT have any non-identity transformer matching `.claude/skills/**` (validator + golden fixture).

## 7. Dialog archive entry (US7)

Row in `.ai/dialogs/INDEX.md`.

| Field | Rules |
|-------|-------|
| date | ISO `YYYY-MM-DD` |
| tool | claude \| gemini \| codex \| copilot \| antigravity \| … |
| branch | git branch at session time |
| theme | ≤6 words |
| outcome | one line |
| link | relative path into `raw/` (CC) or `log/` (others) |

**Storage split**: `raw/` gitignored, `log/` + `INDEX.md` tracked (FR-015).

## Relationships

```
helpers.config.ts#packs ──(assemble)──► packs/<id>/ ──(projection)──► marketplace.json
        │                                   ▲
        └──(validate I1–I5)── .claude/ ─────┘ (content copied per membership)

guard rules ──(registered in)── .claude/settings.json ──(shipped via)── devx-core pack
permission preset ──(applied by)── helpers presets ──(must not contradict)── guard rules
skill evals ──(co-located with)── .claude/skills/<name>/ ──(travel into)── packs
capability matrix ──(drives)── skill pipelines in helpers.config.ts targets
```
