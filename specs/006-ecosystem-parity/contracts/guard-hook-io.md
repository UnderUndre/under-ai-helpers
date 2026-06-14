# Contract — Guard & Feedback Hook I/O

**Hooks**: `guard-destructive.mjs`, `guard-secrets.mjs` (PreToolUse), `post-edit-feedback.mjs` (PostToolUse).
**Runtime**: `node` (≥20), invoked by Claude Code hook system. Single cross-platform implementation (FR-013, research R3).

## Registration (.claude/settings.json)

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guard-destructive.mjs" }] },
      { "matcher": "Read|Grep|Glob|Bash", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guard-secrets.mjs" }] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/post-edit-feedback.mjs" }] }
    ]
  }
}
```

Pack distribution carries the same registrations in the pack's hook config; path resolution via plugin root variable (verify on Windows — research V4).

## Input (stdin, JSON)

Harness-provided tool-call event. Fields consumed:

| Field | Used by |
|-------|---------|
| `tool_name` | all |
| `tool_input.command` (Bash) | guard-destructive, guard-secrets |
| `tool_input.file_path` / `path` / `pattern` (Read/Grep/Glob) | guard-secrets |
| `tool_input.file_path` (Edit/Write) | post-edit-feedback |

## Output (stdout, JSON) + exit codes

### guard-destructive — action `ask` (FR-005)

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "ask",
    "permissionDecisionReason": "Standing Order #6: destructive command (`git push --force`). Confirm THIS invocation to proceed; defaults stay unchanged."
  }
}
```

- Interactive session → user confirms/denies **that one invocation** (US2 scenario 4).
- Headless/CI → `ask` resolves to deny. SC-002 suite counts this as blocked.
- Non-matching command → exit 0, no output (allow).

### guard-secrets — action `deny` (FR-006)

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Standing Order #7: secret file read (.env). Whitelist explicitly in your settings if truly intended."
  }
}
```

### post-edit-feedback (FR-007)

Runs detected formatter/linter (`package.json#scripts.format|lint`, else no-op) on the edited file; emits:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "<truncated lint/format output, max 2000 chars>"
  }
}
```

Never blocks; absent tooling → silent exit 0. Hook self-timeout 30s.

## Matching rules (false-positive policy)

1. Bash commands are tokenized; **quoted substrings are stripped before pattern matching** — `echo "rm -rf docs example"` must NOT trigger (spec edge case).
2. Paths are normalized (pathe-style) before secret-glob matching — `foo/.env.example`? `.env.example` is NOT a secret (explicit allowlist for `.example`/`.sample`/`.template` suffixes).
3. Every block/ask emits a reason naming the Standing Order (FR-005 "human-readable reason").
4. Hook crash or malformed stdin → exit 0 (fail-open for availability) **except** guard-secrets which fails-closed (deny) on parse errors — leak prevention outranks convenience.

## Test contract (SC-002)

`packages/cli/tests/integration/guards.test.ts` feeds scripted violation events through each hook binary via stdin and asserts: 100% of destructive/bypass/secret attempts produce `ask`/`deny` with non-empty reason; benign lookalikes (quoted strings, `.env.example`) pass through.
