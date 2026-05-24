/**
 * Fleet table renderer.
 * Renders FleetEntry[] as a terminal table (cli-table3) or JSON.
 */

import Table from "cli-table3";
import type { FleetEntry } from "./types.js";

// ── ANSI helpers ────────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "");
}

function red(str: string): string {
  return `\x1b[31m${str}\x1b[0m`;
}

function green(str: string): string {
  return `\x1b[32m${str}\x1b[0m`;
}

// ── Formatting helpers ──────────────────────────────────────────────

const MAX_REPO_NAME = 40;

function truncateRepoName(name: string): string {
  if (name.length <= MAX_REPO_NAME) return name;
  return name.slice(0, MAX_REPO_NAME - 1) + "…";
}

/**
 * Format pinned ref for display.
 * If it looks like a commit SHA (7+ hex chars, no 'v' prefix), show as `main@abc123d`.
 */
function formatRef(ref: string, branch?: string): string {
  const isCommitSha = /^[0-9a-f]{7,}$/.test(ref);
  if (isCommitSha && branch) {
    return `${branch}@${ref.slice(0, 7)}`;
  }
  if (isCommitSha) {
    return ref.slice(0, 7);
  }
  return ref;
}

function formatDrift(hasDrift: boolean, noColor: boolean): string {
  if (hasDrift) {
    const label = "⚠ YES";
    return noColor ? label : red(label);
  }
  const label = "✓ no";
  return noColor ? label : green(label);
}

function formatLastSync(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Render FleetEntry[] as a terminal table.
 */
export function renderFleetTable(
  entries: FleetEntry[],
  options?: { noColor?: boolean; scopeInfo?: string },
): string {
  const noColor = options?.noColor ?? false;

  if (entries.length === 0) {
    const scopeInfo = options?.scopeInfo ?? "user + 0 orgs";
    return `No clai-helpers projects found.\nScope: ${scopeInfo}`;
  }

  const table = new Table({
    head: ["Repo", "Branch", "Pinned", "Latest", "Drift", "Last Sync"],
    colWidths: [42, 12, 20, 16, 12, 14],
    style: {
      head: noColor ? [] : ["cyan"],
      border: noColor ? [] : ["gray"],
    },
    wordWrap: true,
  });

  for (const entry of entries) {
    const repoName = truncateRepoName(entry.fullName);
    const pinned = formatRef(entry.pinnedRef, entry.defaultBranch);
    const latest = entry.latestRef && entry.latestRef !== "unknown"
      ? formatRef(entry.latestRef)
      : "—";
    const drift = formatDrift(entry.hasDrift, noColor);
    const lastSync = formatLastSync(entry.lastSyncAt);

    table.push([
      noColor ? repoName : repoName,
      entry.defaultBranch,
      pinned,
      latest,
      drift,
      lastSync,
    ]);
  }

  const output = table.toString();
  return noColor ? stripAnsi(output) : output;
}

/**
 * Render FleetEntry[] as JSON string.
 */
export function renderFleetJson(entries: FleetEntry[]): string {
  return JSON.stringify(entries, null, 2);
}
