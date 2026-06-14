#!/usr/bin/env node
/**
 * Statusline preset (feature 006 US6).
 * Reads session JSON from stdin, outputs: <model> | <git branch> | ctx N%
 * Degrades gracefully on missing fields.
 *
 * Schema (V3 deferred per docs/target-capabilities.md — fields probed at runtime):
 * Expected fields: model, transcript_path, cwd
 * Context usage: not in current stdin payload — falls back to N/A.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

try {
  const raw = readFileSync(0, "utf8");
  const data = JSON.parse(raw);

  // Model — fall back to "unknown"
  const model = data.model || data.session?.model || "unknown";

  // Git branch — derive from cwd via `git rev-parse`
  let branch = "detached";
  try {
    const cwd = data.cwd || data.workspace?.current_dir || process.cwd();
    branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    branch = "no-git";
  }

  // Context usage — field name not yet confirmed (V3 deferred).
  // When CC exposes it, this will show "ctx N%". For now: N/A.
  const contextPct = data.context?.percent || data.session?.context_usage || null;
  const ctxStr = contextPct ? `ctx ${contextPct}%` : "ctx N/A";

  // Output single line
  process.stdout.write(`${model} | ${branch} | ${ctxStr}\n`);
} catch {
  // Degrade silently — statusline must never crash the session.
  process.stdout.write("statusline: (unavailable)\n");
}
