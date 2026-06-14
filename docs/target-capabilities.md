# Target Capabilities Matrix

**Purpose** (per spec 006 FR-010 + T002 empirical verification): record which downstream AI-tool targets consume which artifact format natively vs via conversion. Drives delivery-path selection in `helpers.config.ts#targets.<name>.skillsNative` and the validator invariant "skillsNative ⇒ no non-identity transformer matches `.claude/skills/**`".

**Status legend**: ✅ verified · ⚠️ deferred (probe pending) · ❌ confirmed non-native · 🔁 conversion-only

**Probe methodology**: empirical, against installed apps + official docs. Each entry records: probe date, source (local dir inspection / official docs URL), evidence.

---

## Claude Code (the reference target)

| Property | Value | Evidence |
|----------|-------|----------|
| `skillsNative` | ✅ `true` | CC IS the source-of-truth format; `.claude/skills/<name>/SKILL.md` IS the open standard. |
| Skills dir | `.claude/skills/<name>/SKILL.md` | repo-local (this repo has 43 skill dirs at `.claude/skills/`) |
| Plugin format | `.claude-plugin/plugin.json` + `skills/` + `commands/` + `agents/` + `hooks/hooks.json` | [docs.anthropic.com/en/docs/claude-code/plugins](https://docs.anthropic.com/en/docs/claude-code/plugins) (probed 2026-06-14) |
| Plugin root var | `${CLAUDE_PLUGIN_ROOT}` (cross-platform variable substitution, not shell-dependent) | same docs — "use this variable in hooks and MCP server configs to reference files within the plugin's installation directory" |
| Statusline stdin | ⚠️ deferred — see V3 below | not covered in plugins/marketplaces docs; needs `/settings` or statusline-specific docs |

---

## Antigravity (`.agent/` target)

| Property | Value | Evidence |
|----------|-------|----------|
| `skillsNative` | ✅ `true` | Local dir inspection 2026-06-14: `.agent/skills/` contains 43 skill dirs (mirrors `.claude/skills/`); `identity` transformer used in `helpers.config.ts`. |
| Skills dir | `.agent/skills/<name>/SKILL.md` | local |
| Statusline | N/A (different platform) | — |

---

## Codex Desktop (`.agents/` target)

| Property | Value | Evidence |
|----------|-------|----------|
| `skillsNative` | ⚠️ deferred — local `.agents/skills/` does NOT exist | Local dir inspection 2026-06-14: `.agents/` contains `commands/` + `marketingskills/` only; no `skills/` subdir. The naming `marketingskills` (single word) suggests Codex uses a non-SKILL.md layout. **Needs probe against actual Codex app or its docs.** |
| Skills dir | unknown | — |
| Notes | `helpers.config.ts:121` comment: "with Codex tool as of 2026-04-25 — the app suggests `.agents/commands/`" (commands only, not skills) | existing config comment |

---

## Gemini CLI (`.gemini/` target)

| Property | Value | Evidence |
|----------|-------|----------|
| `skillsNative` | ⚠️ deferred — local `.gemini/skills/` does NOT exist | Local dir inspection 2026-06-14: `.gemini/` contains `agents/` + `commands/` only; no `skills/` subdir. **Needs probe against actual Gemini CLI app or its docs.** |
| Skills dir | unknown | — |

---

## Cursor

| Property | Value | Evidence |
|----------|-------|----------|
| `skillsNative` | ⚠️ deferred — no Cursor-specific dir in this repo | Not currently a wired target in `helpers.config.ts`. **Needs empirical probe if/when Cursor is added as a target.** |
| Skills dir | unknown | — |

---

## Copilot (`.github/` target)

| Property | Value | Evidence |
|----------|-------|----------|
| `skillsNative` | ❌ `false` | Copilot consumes `.github/instructions/<agent>.instructions.md` (transformed from `.claude/agents/`) + `.github/prompts/*.prompt.md` (from `.claude/commands/`). Skills as a concept map to Copilot via instructions, NOT via SKILL.md. Conversion transformer `claude-to-copilot-instructions` retained. |
| Skills dir | N/A (skills → instructions conversion) | existing pipeline |

---

## Verification queue (T002 deliverable)

| # | Item | Status | Action |
|---|------|--------|--------|
| V1 | `marketplace.json` / `plugin.json` field set | ✅ Resolved 2026-06-14 via [CC marketplace docs](https://docs.anthropic.com/en/docs/claude-code/plugin-marketplaces). Schema: `name`, `owner{name,email}`, `plugins[]` with `name`, `source` (string\|object: relative/github/url/git-subdir/npm), `description`, `version`, `author`, `homepage`, `repository`, `license`, `keywords`, `category`, `tags`, `strict`, `defaultEnabled`, `displayName`, `commands`, `agents`, `hooks`, `mcpServers`, `lspServers`, `skills`. Optional `metadata.pluginRoot` for path-prefix shorthand. | Pack assembler (T005) and pack manifest schema (T003) use this exact field set. |
| V2 | Native skills dir per non-CC target | ⚠️ Partial — Antigravity confirmed native (`.agent/skills/`); Codex/Gemini/Cursor DEFERRED. None of those three have local `skills/` subdirs in this repo; need probe against actual apps. | T030 (`Add identity skill pipelines for verified-native targets`) gates on per-target verification: only Antigravity gets identity pipeline in this release; Codex/Gemini/Cursor remain conversion-only until probed. |
| V3 | Statusline stdin JSON schema | ⚠️ Deferred — not in CC plugins/marketplaces docs. | T032 (statusline preset implementation) MUST probe via local CC install: pipe known JSON to a stub script and capture field names. Schemas that have been extended historically: `model`, `cwd`, `transcript_path`; context-usage field name needs runtime confirmation. |
| V4 | `${CLAUDE_PLUGIN_ROOT}` on Windows | ✅ Resolved 2026-06-14 via CC marketplace docs. The variable is platform-independent (CC's own substitution, not shell expansion). | Guard hooks (FR-005/006/007) and any plugin-shipped scripts use `${CLAUDE_PLUGIN_ROOT}/...` cross-platform. |

---

## Updates

- **2026-06-14**: initial draft (T002 partial). V1 + V4 resolved via CC docs; Antigravity V2 resolved via local inspection; Codex/Gemini/Cursor V2 + statusline V3 deferred to first runtime probe.
