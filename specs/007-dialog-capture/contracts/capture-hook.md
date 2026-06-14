# Contract: Capture Hook + File-Watch Wrapper

**Artifact**: `.claude/hooks/dialog-capture.mjs` + `packages/cli/src/dialog-capture/watcher.ts`
**Spec refs**: FR-001, FR-002, FR-010, FR-011, FR-014, FR-017 (clarified)
**Research refs**: V1 (no CC SessionEnd → file-watch primary)

## Hook surface (Claude Code side)

Registered in `.claude/settings.json` for the `Stop` event only (turn-level — fires when the main agent finishes responding). The hook is fire-and-forget; it MUST return within 100 ms to avoid blocking CC.

### Hook registration (`.claude/settings.json`)

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/dialog-capture.mjs",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

- `matcher: ""` — match all Stop events.
- `timeout: 5` (seconds) — CC kills the hook after 5s; our internal budget is 100 ms.

### Hook payload (stdin from CC)

CC pipes a JSON event on stdin. Fields actually used by our hook:

```ts
type StopHookEvent = {
  session_id: string;        // CC session UUID (matches transcript filename)
  transcript_path: string;   // absolute path to ~/.claude/projects/<enc>/<uuid>.jsonl
  cwd: string;               // current working directory
  stop_hook_active: boolean; // CC's own re-entry guard
};
```

The hook ignores all other fields. Unknown fields are tolerated (forward-compat).

### Hook output (stdout)

Empty. CC treats any stdout as a hint to inject into context; we MUST NOT inject anything (capture is silent). Stderr is captured by CC for diagnostics only.

### Hook exit codes

| Code | Meaning | CC behavior |
|------|---------|-------------|
| `0` | Acknowledged; async work spawned | Session continues |
| `1` | Hook failed; capture deferred to safety-net tick | Session continues (fail-soft per FR-014) |
| `124` | Hook exceeded CC's 5s timeout | Session continues; log entry to `~/.underboard/logs/` |

The hook MUST NEVER block CC session-end regardless of internal state.

## Hook body (`.claude/hooks/dialog-capture.mjs`)

Thin wrapper, < 50 LOC. Responsibilities:

1. Read stdin JSON.
2. Spawn `node packages/cli/dist/cli.js dialog internal-capture-event` detached (via `child_process.spawn(..., { detached: true, stdio: 'ignore' })`).
3. Unref the child (parent exits, child runs to completion).
4. Exit 0 immediately.

**Why a wrapper, not inline logic**: keeps the hook auditable + Constitution Principle I intact (`.claude/` is source of truth; the wrapper IS source; actual logic lives in `packages/cli/`).

## File-watch wrapper (`packages/cli/src/dialog-capture/watcher.ts`)

The hook spawns this CLI subcommand (`helpers dialog internal-capture-event`). It is the **primary capture path** (V1 finding: no clean SessionEnd event).

### Behavior

```
On each Stop hook event:
  1. Resolve the transcript file from event.transcript_path
  2. Stat the file → record (size, mtime)
  3. Reset the inactivity timer to N minutes (default 5, configurable via
     helpers.config.ts#dialogs.inactivity-timeout-minutes)
  4. Spawn a chokidar watcher on the transcript file (if not already watching)

On each file change (chokidar event):
  - Reset the inactivity timer

On inactivity timeout (no file change for N minutes):
  1. Finalize: copy transcript_path → .ai/dialogs/raw/<YYYY-MM-DD>-<session_id>-claude.jsonl
     (atomic: write-temp + rename; if copy fails, retry once; if still fails,
     log + leave to safety-net tick)
  2. Close the chokidar watcher for this session
  3. Spawn normalize + index + spool pipeline (async; fails-soft per FR-014)
  4. Report outcome to ~/.underboard/logs/dialog-capture.log
```

### Concurrent session handling + cross-process watcher singleton (FR-011, F5 fix)

**Problem (post-external-review F5 — independently flagged by claude.md + gemini.md)**: The `Stop` hook spawns a fresh detached CLI process every turn. The original design used an **in-process** `Map<session_id, Watcher>` to dedup — but a Map in process A is invisible to process B, so each detached spawn cannot see prior watchers. Result: N Stop hooks per N-turn session → up to N concurrent watchers on the same transcript file → N inactivity timers racing to finalize → corruption risk.

**Fix**: cross-process singleton via pidfile per `session_id`.

```
On each Stop hook event → `helpers dialog internal-capture-event` invocation:
  1. Compute session_id from event payload
  2. Pidfile path: ~/.underboard/dialog-watch/<session_id>.pid
  3. Try to acquire exclusive lock (create file with O_EXCL, write current PID):
     - SUCCESS: this process owns the watcher. Proceed to spawn chokidar + inactivity timer.
     - FAIL (file exists): read PID; check if process alive (kill -0 / OpenProcess):
       - ALIVE: send SIGHUP / "ping" event to reset that watcher's inactivity timer
         (mechanism: write to ~/.underboard/dialog-watch/<session_id>.ping; watcher
         watches its own .ping file via chokidar and resets timer on change)
       - DEAD (stale pidfile from crash): unlink pidfile, retry acquire (max 3 times)
  4. On watcher shutdown (inactivity timeout fires → finalize → exit):
     - Release: unlink pidfile atomically
```

**Properties**:

- **Cross-process**: pidfile + PID-liveness check works across spawned processes; no shared in-process state.
- **One watcher per session**: regardless of how many Stop hooks fire, only one watcher ever runs per `session_id`.
- **Inactivity timer reset**: subsequent Stop hooks (within the same CC session) ping the existing watcher via `.ping` file instead of spawning a new one. Resets the inactivity timer so a long session doesn't finalize mid-conversation.
- **Crash-safe**: stale pidfile (process died without cleanup) detected via PID-liveness check; reclaimed on next Stop hook.
- **Cross-platform**: `kill -0` on POSIX, `OpenProcess` + `GetExitCodeProcess` on Windows. Both `pathe`-normalized.
- **Race-safe**: O_EXCL file creation is atomic per-filesystem; first writer wins.

### Concurrent session handling (different sessions, FR-011)

- One pidfile + one watcher per distinct `session_id`. Two CC sessions running concurrently on the same repo → two pidfiles, two watchers, no collision.
- Finalization writes to a unique filename (`<date>-<session_id>-...`); concurrent sessions never overwrite each other.
- The inactivity timer is per-session (per-pidfile); one session's timeout does NOT fire for another.

### Crash recovery (US1 scenario 4)

If CC crashes mid-session:
- The chokidar watcher (running in a detached process from the last Stop hook) eventually times out → finalizes a `.partial` raw file with `is_partial: true`.
- On next CC session start, the watcher's startup check finds orphan `.partial/` files older than 1 hour → promotes them to clean `raw/` with a `.partial` flag in normalized header.

### Capture-mode probe (FR-017 "selected at first run")

The spec's "two paths mutually exclusive per repo (selected at first run based on V1 probe result)" mechanism, specified:

**Probe procedure** (runs once per `(repo, underboard-version)` pair, on first Stop-hook invocation after install or upgrade):

1. Emit a synthetic `Stop` event to self (hook wrapper invokes `helpers dialog internal-capture-event --probe`).
2. Wait 60 seconds. If a synthetic Stop event was received by the watcher within that window AND CC's hook-emitted events have a stable `session_id` field across multiple Stop invocations within a single CC session, the probe concludes `mode: session-end-hook` is viable.
3. Otherwise, `mode: file-watch` is the active path.
4. Probe result is cached at `~/.underboard/dialog-capture-mode.json`:

```json
{
  "mode": "file-watch",          // "session-end-hook" | "file-watch"
  "probed_at": "2026-06-14T12:34:56Z",
  "underboard_version": "<current-underboard-pkg-version>",
  "cc_version": "<detected-from-settings-schema-or-'unknown'>",
  "probe_reason": "no synthetic Stop event received within 60s window"
}
```

**Re-probe triggers**:
- underboard version upgrade (different `underboard_version` than cached).
- Explicit `helpers dialog-doctor --reprobe` invocation.
- User-initiated (e.g., after a CC upgrade that might add SessionEnd support).

**Forward-compatibility**: if CC adds a real SessionEnd event in a future release, the re-probe will detect it and switch to the `session-end-hook` path. Existing capture state (raw files, INDEX, spools) is unaffected by the mode switch — both paths produce the same artifacts.

**Probe failure handling**: if the probe itself errors (config load fail, watcher init fail), default to `mode: file-watch` (the empirically known-working path per V1) and log to `~/.underboard/logs/dialog-capture.log`.

### Configuration override

| Config key | Default | Range | Notes |
|-----------|---------|-------|-------|
| `inactivity-timeout-minutes` | `5` | 1–60 | Finalization trigger |
| `partial-promotion-age-minutes` | `60` | 15–1440 | Orphan `.partial/` promotion threshold |

## Capture config schema (extends `helpers.config.ts`)

```ts
// helpers.config.ts (existing file, additive change)
export default defineConfig({
  // ... existing keys ...
  dialogs: {
    capture: 'on',                          // 'on' | 'off' — master switch (FR-010)
    ingest: 'on',                           // 'on' | 'off' — full opt-out (FR-006b)
    'ingest-delay-days': 7,                 // 0–90, quarantine window (FR-006a)
    'normalized-max-bytes': 65536,          // 8 KiB – 1 MiB, truncation (FR-003); default 64 KiB post gemini.md F4
    'keep-n-sessions': 30,                  // 1–1000, retention count (FR-009)
    'size-cap-mb': 500,                     // 50–10000, retention size (FR-009)
    'archive-path': null,                   // string | null — pruned-raw destination
    'redaction-catalog-dir': 'presets/redaction/',  // catalog location
    'external-scanner': null,               // string | null — optional hook command
    'inactivity-timeout-minutes': 5,        // 1–60, file-watch finalization trigger
    'partial-promotion-age-minutes': 60,    // 15–1440, orphan promotion
  },
});
```

Loaded via `c12` (existing in `packages/cli/`). Missing keys fall back to defaults; invalid values fail-loud at config load time (no silent fallbacks per AGENTS.md anti-pattern #1).

## Fail-soft guarantees (FR-014)

Every step in the pipeline MUST log + continue on error:

| Failure point | Behavior | User-visible impact |
|---------------|----------|---------------------|
| Hook spawn fails | CC log gets exit 1; safety-net tick retries | None (capture deferred) |
| chokidar throws | Watcher logs + exits; safety-net tick takes over | None |
| Transcript file missing on finalize | Log + skip | Missing session in archive |
| Normalize throws | Log + leave raw in place; INDEX row not added | Missing session in INDEX |
| INDEX write fails | Log + leave raw + normalized in place | Missing row in INDEX |
| Spool enqueue fails | Log + capture still complete; ingest deferred | Session not recallable until next tick |

**The CC session is never blocked by any of these failures.** The user's work proceeds regardless of capture-pipeline state.

## Security notes

- The hook receives `transcript_path` from CC. Treat as untrusted input — validate that the path is inside `~/.claude/projects/` before reading (defense-in-depth).
- The hook runs as the user; no privilege escalation.
- Spawned children inherit the user's environment; no secrets are passed via argv.
- The detached child writes only to `.ai/dialogs/` and `~/.underboard/`; no writes outside these scopes.
