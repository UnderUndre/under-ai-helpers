# AI Dialog Archive

Catalog of archived conversations and IA tool sessions. Each row = one session.

**Columns**: Date | Tool | Branch | Theme | Summary | File

| Date | Tool | Branch | Theme | Summary | File |
|------|------|--------|-------|---------|------|
| 2026-06-10 | Claude Code | 006-ecosystem-parity | Ecosystem gaps → spec | 6-point gap analysis captured in spec.md (packaging, guards, perms, evals, SKILL.md, statusline). Clarified 5 questions, added dialog archival as User Story 7. | [spec/006-ecosystem-parity/v1](../specs/006-ecosystem-parity/spec.md) |

---

## How to Use

- **Audit**: grep or search this file for a date range or tool name.
- **Cross-tool reading**: follow the file link to read the session's outcome from another tool's session.
- **/learn input**: point `/learn` to `.ai/dialogs/log/` or full transcript to extract and elevate patterns.
- **Cleanup**: old rows may be archived to `INDEX.archive.md` after 12 months.

## Layers

- **`raw/`**: Full transcripts (Claude Code only, auto-captured, gitignored due to secrets).
- **`log/`**: Session summaries (advisory layer for non-CC tools).
- **`INDEX.md`**: This file — the entry point (tracked, commitable).
