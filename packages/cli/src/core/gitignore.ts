/**
 * Idempotent `.gitignore` maintenance for `clai-helpers` managed entries.
 *
 * Only appends entries that are not already present (as standalone lines,
 * tolerating leading `/`, trailing `/`, and surrounding whitespace).
 * Never removes or reorders anything the user wrote.
 */

import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "pathe";

const MANAGED_HEADER = "# clai-helpers (auto-managed by `clai-helpers init`)";

export interface GitignoreEntry {
  /** Raw pattern to write (e.g. `.helpers/`). */
  pattern: string;
  /** Optional per-line comment appended before the pattern. */
  comment?: string;
}

/**
 * Ensure each given entry appears in the consumer's `.gitignore`.
 *
 * Idempotent: running `init` twice does not duplicate entries. Comments and
 * user-authored lines are preserved. Returns the list of entries that were
 * actually added (may be empty when everything was already present).
 */
export async function ensureGitignoreEntries(
  root: string,
  entries: readonly GitignoreEntry[],
): Promise<string[]> {
  if (entries.length === 0) return [];

  const gitignorePath = join(root, ".gitignore");
  const existing = await readIfExists(gitignorePath);
  const existingPatterns = extractPatterns(existing);

  const toAdd = entries.filter((e) => !existingPatterns.has(normalize(e.pattern)));
  if (toAdd.length === 0) return [];

  const block = buildBlock(toAdd);
  const separator = existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "";
  const next = existing + separator + block;

  await writeFile(gitignorePath, next, "utf8");
  return toAdd.map((e) => e.pattern);
}

async function readIfExists(path: string): Promise<string> {
  try {
    await access(path);
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

/**
 * Extract the set of ignore patterns from a gitignore file. Lines that are
 * empty, comments, or negations are skipped. Patterns are normalized for
 * equivalence checks (trailing `/`, leading `/`, trimmed whitespace).
 */
function extractPatterns(content: string): Set<string> {
  const patterns = new Set<string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    patterns.add(normalize(line));
  }
  return patterns;
}

/**
 * Normalize a pattern for equivalence:
 * - strip surrounding whitespace
 * - strip a single leading `/` (rooted vs relative are equivalent at repo root)
 * - strip a trailing `/` (directory indicator is informational, not semantic)
 */
function normalize(pattern: string): string {
  let p = pattern.trim();
  if (p.startsWith("/")) p = p.slice(1);
  if (p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function buildBlock(entries: readonly GitignoreEntry[]): string {
  const lines: string[] = [MANAGED_HEADER];
  for (const entry of entries) {
    if (entry.comment) lines.push(`# ${entry.comment}`);
    lines.push(entry.pattern);
  }
  return lines.join("\n") + "\n";
}
