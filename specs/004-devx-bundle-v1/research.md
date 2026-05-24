# Research Decisions — 004-devx-bundle-v1

**Feature**: Developer Experience Bundle v1
**Date**: 2026-05-24
**Status**: Finalized during planning

---

## 1. Hermes Spawn Strategy

**Decision**: Use `child_process.spawn` for hermes wrapper subprocess management.

**Options considered**:

| Option | Pros | Cons |
|--------|------|------|
| `child_process.exec` | Simple API, buffered output | No streaming; max buffer limits; can't detach; exit-code propagation awkward with large output |
| `child_process.fork` | IPC channel for parent-child messaging | Requires Node.js module entry point; hermes is a native binary, not a Node module; IPC overhead wasted |
| **`child_process.spawn`** | Streaming stdout/stderr; `detached` + `unref` for background mode; direct exit-code propagation; no buffer limits | Slightly more verbose API |

**Rationale**: The hermes wrapper has three operating modes (basic, pipe, background). `spawn` is the only option that supports all three natively:

- **Basic/pipe**: Stream hermes output directly to parent stdout/stderr via `child.stdout.pipe(process.stdout)`. Zero buffering overhead.
- **Background**: Use `spawn` with `{ detached: true, stdio: 'ignore' }` + `child.unref()`. Print PID and log path, exit 0 immediately. `exec` cannot detach; `fork` requires a JS entry point.

Exit code forwarding is trivial: `child.on('close', code => process.exit(code))`.

---

## 2. MCP Health Check Approach

**Decision**: Use JSON-RPC `initialize` request with 3-second timeout per server. Best-effort — unreachable servers marked `unknown`, not `fail`.

**Options considered**:

| Option | Pros | Cons |
|--------|------|------|
| Full MCP client (SDK) | Complete protocol support; can call `tools/list` | Heavy dependency; requires MCP SDK install; overkill for a health ping |
| **JSON-RPC `initialize` ping** | Lightweight; no external deps; stdio-based; validates server boots + speaks protocol | Doesn't verify tool availability; server might init but fail on `tools/list` |
| Skip MCP checks | Zero complexity | Defeats purpose of doctor command; MCP misconfiguration is a top support issue |

**Rationale**: The doctor command needs to answer "is this MCP server reachable?" — not "does it expose every tool?". A JSON-RPC `initialize` handshake (send `{"jsonmethod":"initialize","params":{...}}`, read response) confirms:

1. The server binary exists and starts.
2. It speaks JSON-RPC over stdio.
3. It responds within 3 seconds.

This is 80/20 — catches the common failures (missing binary, wrong config, hung server) without pulling in an MCP SDK dependency. Servers that pass init but fail on specific tools are a separate diagnostic; that's a future enhancement.

The 3-second timeout prevents `doctor` from hanging on unresponsive servers (spec requirement: complete all checks in under 10 seconds). With 4 MCP servers, worst case is 12s sequential; in practice, checks run concurrently via `Promise.allSettled` and finish well within budget.

---

## 3. AI-Engineering-Coach Rule Translation

**Decision**: Content adaptation — translate rules from Microsoft's format to our format (anti-pattern name, why-it-bites, correct-pattern), with no runtime dependency on the source repo.

**Options considered**:

| Option | Pros | Cons |
|--------|------|------|
| Verbatim copy | Zero drift from upstream; easy to re-import | Format mismatch (their `.md` structure ≠ our guardrail format); licensing ambiguity on verbatim chunks; doesn't integrate with CLAUDE.md tone/persona |
| **Content adaptation** | Matches our format + Valera tone; no runtime dep; single import step | One-time manual effort; upstream changes require manual re-import |
| Code dependency (git submodule / npm) | Always up-to-date with upstream | Runtime/network dependency; submodule complexity; their format still needs translation layer; brittle coupling to external repo structure |

**Rationale**: Microsoft's rules live in `src/core/rules/*.md` in a specific Markdown structure. Our guardrails use a different schema: anti-pattern name, "why-it-bites" explanation, correct-pattern example. A verbatim copy would be unstructured noise in CLAUDE.md.

Content adaptation means:

1. Read each of the 45 rule files.
2. Extract the core concept.
3. Rewrite in our format with Valera's voice (blunt, pipe metaphors where they fit).
4. Place into CLAUDE.md guardrails, code-review-checklist skill, and lint-and-validate skill.

This is a one-time import. We record the process for repeatability (per spec assumption #6). MIT license is preserved in `vendor/AI-Engineering-Coach-LICENSE` and attributed in `docs/CREDITS.md`. No runtime coupling to the external repo — if Microsoft restructures or adds rules, that's a separate import task.

---

## 4. Branch Naming Convention

**Decision**: Two-phase naming — `specs/<slug>` for planning branches, `<slug>` for implementation branches. Drop the `feature/<N>-<slug>` convention entirely for new features.

**Options considered**:

| Option | Pros | Cons |
|--------|------|------|
| Keep `feature/<N>-<slug>` | Consistent with existing branches; no migration | No visual distinction between planning and implementation; same branch holds specs + code (the problem we're solving); `NNN-` numbering requires manual bookkeeping |
| `specs/<slug>` + `<slug>` (two-phase) | Clear visual distinction; planning branches auto-filtered by CI (`paths: ['specs/<slug>/**']`); GitHub auto-cleanup targets `specs/*` pattern; no numbering needed | Breaking change from current convention; existing in-flight branches keep old names (mixed naming in repo) |
| `plan/<slug>` + `impl/<slug>` | Even more explicit naming | Longer prefixes; `impl/` could conflict with implementation-detail branch naming elsewhere; no clear improvement over the simpler two-phase approach |

**Rationale**: The two-phase flow exists because specs and code need different review gates. Branch naming must encode this phase:

- `specs/<slug>` — signals "this PR contains only spec artifacts, use reduced CI".
- `<slug>` — signals "this PR contains code, run full CI".

The `feature/` prefix with numbering (`feature/004-devx-bundle-v1`) conflates planning and implementation into one branch. The new convention makes the phase explicit in the branch name itself, which enables:

1. **CI path filtering**: GitHub Actions can pattern-match `specs/*` branches for reduced checks.
2. **GitHub auto-cleanup**: `specs/*` branches deleted after merge (spec requirement FR-007).
3. **Developer clarity**: `git branch --list 'specs/*'` shows all open planning work.

This is a deliberate breaking change (spec assumption #1, assumption #10). Existing in-flight features keep their old branch names; only new features use the two-phase convention. The transition is documented in the constitution amendment for Principle VIII.
