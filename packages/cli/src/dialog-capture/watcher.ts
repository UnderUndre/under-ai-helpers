/**
 * File-watch wrapper (feature 007 US1, FR-001/FR-017).
 *
 * Per external-review F5: cross-process singleton via pidfile.
 * The Stop hook spawns a fresh detached process every turn; an in-process
 * Map is invisible across processes. Pidfile ensures exactly one watcher
 * per session_id regardless of how many Stop hooks fire.
 *
 * On inactivity timeout (default 5 min): finalize raw transcript →
 * normalize → INDEX → spool.
 */

import { watch, FSWatcher } from "chokidar";
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, renameSync, copyFileSync, statSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const PIDFILE_DIR = resolve(process.env.HOME || process.env.USERPROFILE || ".", ".underboard", "dialog-watch");

interface WatcherState {
  watcher: FSWatcher | null;
  inactivityTimer: ReturnType<typeof setTimeout> | null;
  pidfilePath: string;
  pingfilePath: string;
}

/**
 * Ensure only one watcher process is active per session_id (F5 fix).
 * Returns true if THIS process owns the watcher; false if another is active.
 */
export function acquireWatcherLock(sessionId: string): boolean {
  mkdirSync(PIDFILE_DIR, { recursive: true });
  const pidfile = resolve(PIDFILE_DIR, `${sessionId}.pid`);

  if (existsSync(pidfile)) {
    try {
      const existingPid = parseInt(readFileSync(pidfile, "utf8").trim(), 10);
      // Check if that process is still alive
      if (isProcessAlive(existingPid)) {
        // Process alive → ping it to reset timer, we exit
        const pingfile = resolve(PIDFILE_DIR, `${sessionId}.ping`);
        writeFileSync(pingfile, String(Date.now()));
        return false; // Another watcher owns this session
      }
      // Stale pidfile — reclaim
      unlinkSync(pidfile);
    } catch {
      // Read error — reclaim
      try { unlinkSync(pidfile); } catch {}
    }
  }

  // Acquire
  writeFileSync(pidfile, String(process.pid));
  return true;
}

export function releaseWatcherLock(sessionId: string): void {
  const pidfile = resolve(PIDFILE_DIR, `${sessionId}.pid`);
  try { unlinkSync(pidfile); } catch {}
}

/**
 * Start watching a CC transcript file. When no activity for `timeoutMinutes`,
 * finalize the transcript to `.ai/dialogs/raw/`.
 *
 * Returns when the transcript is finalized (or watcher is shut down).
 */
export async function watchTranscript(
  transcriptPath: string,
  sessionId: string,
  cwd: string,
  options: {
    inactivityTimeoutMinutes: number;
    partialPromotionAgeMinutes: number;
  },
): Promise<void> {
  if (!acquireWatcherLock(sessionId)) {
    // Another watcher owns this session — exit silently
    return;
  }

  const state: WatcherState = {
    watcher: null,
    inactivityTimer: null,
    pidfilePath: resolve(PIDFILE_DIR, `${sessionId}.pid`),
    pingfilePath: resolve(PIDFILE_DIR, `${sessionId}.ping`),
  };

  const timeoutMs = options.inactivityTimeoutMinutes * 60 * 1000;

  const finalize = () => {
    try {
      finalizeTranscript(transcriptPath, sessionId, cwd);
    } catch (e) {
      console.error(`[dialog-capture] finalize error: ${(e as Error).message}`);
    }
    state.watcher?.close();
    if (state.inactivityTimer) clearTimeout(state.inactivityTimer);
    releaseWatcherLock(sessionId);
  };

  const resetTimer = () => {
    if (state.inactivityTimer) clearTimeout(state.inactivityTimer);
    state.inactivityTimer = setTimeout(finalize, timeoutMs);
  };

  // Watch transcript file for changes
  state.watcher = watch(transcriptPath, { persistent: true });

  state.watcher.on("change", () => {
    resetTimer();
  });

  // Also watch the ping file (subsequent Stop hooks ping via this)
  const pingWatcher = watch(state.pingfilePath, { persistent: true });
  pingWatcher.on("change", () => {
    resetTimer();
  });

  // Also watch for new transcript lines (chokidar 'add' fires on first)
  state.watcher.on("add", () => {
    resetTimer();
  });

  // Start initial timer
  resetTimer();

  // Promote orphan .partial/ files older than the threshold
  promoteOrphans(cwd, options.partialPromotionAgeMinutes);

  // Keep the process alive until finalize fires
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (!existsSync(state.pidfilePath)) {
        // Lock released externally — shutdown
        clearInterval(checkInterval);
        state.watcher?.close();
        pingWatcher.close();
        resolve();
      }
    }, 5000);
  });
}

/**
 * Finalize: copy transcript → raw/, write meta sidecar.
 */
function finalizeTranscript(
  transcriptPath: string,
  sessionId: string,
  cwd: string,
): void {
  if (!existsSync(transcriptPath)) {
    console.error(`[dialog-capture] transcript not found: ${transcriptPath}`);
    return;
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const filename = `${dateStr}-${sessionId}-claude.jsonl`;
  const rawDir = resolve(cwd, ".ai", "dialogs", "raw");
  const dest = resolve(rawDir, filename);
  const tempDest = `${dest}.tmp`;

  mkdirSync(rawDir, { recursive: true });

  // Atomic copy: write-temp + rename
  copyFileSync(transcriptPath, tempDest);
  renameSync(tempDest, dest);

  // Write meta sidecar (F6 fix: captured_at is stable across renormalize)
  const metaPath = `${dest}.meta.json`;
  writeFileSync(
    metaPath,
    JSON.stringify({
      session_uuid: sessionId,
      captured_at: now.toISOString(),
      transcript_path: transcriptPath,
      size_bytes: statSync(dest).size,
    }) + "\n",
    "utf8",
  );

  console.log(`[dialog-capture] raw transcript captured: ${dest}`);

  // Spawn normalizer (async, non-blocking)
  try {
    spawn(
      process.execPath,
      [resolve(cwd, "packages", "cli", "dist", "cli.js"), "dialog", "internal-normalize", dest],
      { detached: true, stdio: "ignore", cwd },
    ).unref();
  } catch {
    // Normalizer spawn failure is non-blocking (FR-014)
  }
}

/**
 * Promote orphan .partial/ files that are older than the promotion age.
 */
function promoteOrphans(cwd: string, promotionAgeMinutes: number): void {
  const partialDir = resolve(cwd, ".ai", "dialogs", "raw", ".partial");
  if (!existsSync(partialDir)) return;

  const threshold = Date.now() - promotionAgeMinutes * 60 * 1000;
  let entries: string[] = [];
  try { entries = readdirSync(partialDir); } catch { return; }

  for (const entry of entries) {
    if (!entry.endsWith(".jsonl")) continue;
    const abs = resolve(partialDir, entry);
    try {
      const st = statSync(abs);
      if (st.mtimeMs < threshold) {
        // Promote to clean raw/
        const cleanName = entry.replace(".partial", "");
        const dest = resolve(partialDir, "..", cleanName);
        renameSync(abs, dest);
        console.log(`[dialog-capture] promoted orphan: ${cleanName}`);
      }
    } catch {}
  }
}

/**
 * Cross-platform process-aliveness check.
 * Per gemini-code-assist review: on Windows, process.kill(pid, 0) throws
 * for signal 0. Need to check error code: ESRCH = process doesn't exist.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code !== "ESRCH"; // EPERM = alive but no permission; ESRCH = dead
  }
}
