# Contract — Guard & Feedback Hook I/O

**Hooks**: `guard-destructive.mjs`, `guard-secrets.mjs` (PreToolUse), `post-edit-feedback.mjs` (PostToolUse).
**Runtime**: `node` (≥20), invoked by Claude Code hook system. Single cross-platform implementation (FR-013, research R3).

## Registration (.claude/settings.json)

**Mode independence (post-external-review hermes.md F4)**: Claude Code's `--dangerously-skip-permissions` flag bypasses the interactive permission-prompt flow but does NOT disable PreToolUse/PostToolUse hooks (those fire at the harness layer, below the permission system). Guard hooks (FR-005/006/007) therefore remain fully active in that mode. Standing Orders are non-negotiable; the flag is documented as "skips prompts", not "skips guards".

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
3. **Consumer-extensible allowlist** (post-external-review hermes.md F11): `guard-secrets.mjs` reads an optional `secretAllowlist` array from `.claude/settings.json` at runtime. Entries are glob patterns matched against the normalized path. Default suffixes (`.example`, `.sample`, `.template`) remain hardcoded; `secretAllowlist` is purely additive (consumer can extend, never weaken defaults). Example:
   ```json
   { "secretAllowlist": ["**/*.staging", "**/test-fixtures/**", ".env.local-dev"] }
   ```
   This preserves FR-006 ("defaults never weakened") while permitting legitimate non-secret environment-specific config. Allowlist entries are logged to the hook's reason output so the consumer can audit which entries suppressed denials.
3. Every block/ask emits a reason naming the Standing Order (FR-005 "human-readable reason").
4. Hook crash or malformed stdin → exit 0 (fail-open for availability) **except** guard-secrets which fails-closed (deny) on parse errors — leak prevention outranks convenience.

## Coexistence with consumer hooks (post-external-review hermes.md F5)

**Multi-hook same-event scenario**: a consumer repo installing `devx-core` pack receives guard hooks (FR-005/006/007). The consumer's existing `.claude/settings.json` may already register other PreToolUse/PostToolUse hooks (e.g., from another plugin, or hand-written). Claude Code executes all registered hooks for a given event+matcher — order is **not guaranteed by the platform** and may vary across CC versions.

**Requirements on guard hooks**:

1. **Idempotent to double-firing**: if a guard hook is invoked twice for the same tool call (e.g., another hook re-routes or the consumer's hook chains), the second invocation MUST produce the same decision as the first. No side-effects that compound (e.g., log writes can repeat; state mutations cannot).
2. **Order-independent**: guards MUST reach the same block/deny/feedback decision regardless of whether they run before or after consumer hooks. The decision is a pure function of the tool-call payload (event input), not of prior-hook output.
3. **`ask` flow interaction**: if a guard hook emits `ask` and another hook emits `deny` for the same call, the most restrictive decision wins (`deny > ask > allow`). Guards MUST NOT downgrade another hook's deny to an ask.
4. **`additionalContext` accumulation**: post-edit feedback hooks (FR-007) emitting `additionalContext` SHOULD prefix their output with a stable marker (e.g., `[helpers/guard-feedback]`) so consumers can distinguish sources when multiple PostToolUse hooks contribute context.
5. **No hook-loopback**: guards MUST NOT register additional hooks at runtime, mutate `.claude/settings.json`, or otherwise widen their own execution surface. Self-modification is an incident.

**Consumer hook conflict resolution** (documented in `presets apply` warnings): if a consumer's existing hook targets the same event+matcher as a guard hook, `helpers presets apply` warns the user with both hook paths and recommends keeping both (idempotent coexistence) or unifying if functionally overlapping. The tool never silently overwrites consumer hooks.

## Test contract (SC-002)

`packages/cli/tests/integration/guards.test.ts` feeds scripted violation events through each hook binary via stdin and asserts: 100% of destructive/bypass/secret attempts produce `ask`/`deny` with non-empty reason; benign lookalikes (quoted strings, `.env.example`) pass through.
