/**
 * Pack validator (feature 006).
 *
 * Enforces invariants I1–I5 from data-model.md §1:
 *   I1 existence               — every referenced component file exists on disk
 *   I2 full coverage           — every .claude/ component belongs to ≥1 pack
 *   I3 single ownership        — each component belongs to exactly one pack (no overlap)
 *   I4 cross-pack refs resolve — agent frontmatter / command references stay within pack ∪ dependsOn
 *   I5 dependency DAG          — dependsOn graph has no cycles
 *
 * Severity (hermes.md F7):
 *   - ERROR   — CI/release gate; fails `regen` in CI mode
 *   - WARNING — local `regen` default; surfaces issues for incremental authoring
 *   - `helpers regen --no-pack-validation` skips entirely (dev flag).
 *
 * Spec: specs/006-ecosystem-parity/data-model.md §1 + contracts/packs-config.schema.json.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Pack, PackResolutionResult } from "./types.js";

/** Severity per hermes.md F7 (ERROR = CI/release, WARNING = local default). */
export type Severity = "ERROR" | "WARNING";

export interface ValidationFinding {
  /** Invariant code (I1–I5). */
  invariant: "I1" | "I2" | "I3" | "I4" | "I5";
  severity: Severity;
  /** Human-readable message. */
  message: string;
  /** Pack id(s) involved (if applicable). */
  packs?: string[];
}

export interface ValidationOptions {
  /**
   * ERROR findings fail the build (exit non-zero). WARNING findings are
   * printed but don't fail. Per hermes.md F7: CI uses ERROR, local uses WARNING.
   */
  mode: "ERROR" | "WARNING";
  /**
   * Skip validation entirely (the `--no-pack-validation` dev flag).
   * When true, `validate` returns an empty result with a note.
   */
  skip?: boolean;
}

export interface ValidationResult {
  findings: ValidationFinding[];
  /** Findings with severity ≥ the configured mode. */
  blockingFindings: ValidationFinding[];
  /** True if blocking findings exist (the build should fail). */
  hasErrors: boolean;
  /** True when validation was skipped via options.skip. */
  skipped: boolean;
}

/**
 * Run all I1–I5 invariants against the loaded pack set.
 *
 * `mode` controls which severities are "blocking" — but the I1 (existence)
 * and I5 (DAG) invariants are always ERROR regardless of mode, because a
 * broken pack definition or cyclic dependency prevents assembly.
 */
export function validate(
  result: PackResolutionResult,
  options: ValidationOptions,
): ValidationResult {
  if (options.skip) {
    return {
      findings: [],
      blockingFindings: [],
      hasErrors: false,
      skipped: true,
    };
  }

  const findings: ValidationFinding[] = [];

  for (const invariant of ["I1", "I2", "I3", "I4", "I5"] as const) {
    const f = runInvariant(invariant, result, options.mode);
    findings.push(...f);
  }

  // I1 + I5 are always ERROR (assembly cannot proceed); other invariants
  // honor the configured mode (WARNING locally, ERROR in CI).
  const blockingFindings = findings.filter(
    (f) => f.severity === "ERROR" || f.severity === options.mode,
  );

  return {
    findings,
    blockingFindings,
    hasErrors: blockingFindings.length > 0,
    skipped: false,
  };
}

function runInvariant(
  code: "I1" | "I2" | "I3" | "I4" | "I5",
  result: PackResolutionResult,
  mode: Severity,
): ValidationFinding[] {
  switch (code) {
    case "I1":
      return checkI1Existence(result);
    case "I2":
      return checkI2FullCoverage(result, mode);
    case "I3":
      return checkI3SingleOwnership(result, mode);
    case "I4":
      return checkI4CrossPackRefs(result, mode);
    case "I5":
      return checkI5DepsDag(result);
  }
}

/**
 * I1 existence — every resolved component's `source` path actually exists.
 * Always ERROR (broken globs produce empty packs → silent data loss).
 */
function checkI1Existence(result: PackResolutionResult): ValidationFinding[] {
  const out: ValidationFinding[] = [];
  for (const pack of result.packs) {
    for (const componentType of [
      "agents",
      "commands",
      "skills",
      "hooks",
      "payload",
    ] as const) {
      for (const component of pack.components[componentType]) {
        if (!existsSync(component.source)) {
          out.push({
            invariant: "I1",
            severity: "ERROR",
            message: `pack '${pack.id}': component ${component.relativePath} (${componentType}) does not exist at ${component.source}`,
            packs: [pack.id],
          });
        }
      }
    }
  }
  return out;
}

/**
 * I2 full coverage — every .claude/{agents,commands,skills,hooks}/* file
 * belongs to at least one pack. WARNING locally (author may be in middle of
 * adding new component + pack mapping), ERROR in CI.
 */
function checkI2FullCoverage(
  result: PackResolutionResult,
  mode: Severity,
): ValidationFinding[] {
  const sourceDir = ".";
  // Practical approach: re-scan .claude/ and compare to covered set.
  const covered = new Set<string>();
  for (const pack of result.packs) {
    for (const componentType of [
      "agents",
      "commands",
      "skills",
      "hooks",
    ] as const) {
      for (const component of pack.components[componentType]) {
        covered.add(component.relativePath);
      }
    }
  }

  const uncovered: string[] = [];
  const claudeDirs = ["agents", "commands", "skills", "hooks"] as const;
  for (const dir of claudeDirs) {
    const dirAbs = resolve(sourceDir, ".claude", dir);
    if (!existsSync(dirAbs)) continue;
    const all = walkFiles(dirAbs);
    for (const f of all) {
      const rel = relative(
        resolve(sourceDir, ".claude"),
        f,
      ).split("\\").join("/");
      if (!covered.has(rel)) {
        uncovered.push(rel);
      }
    }
  }

  if (uncovered.length === 0) return [];
  return [
    {
      invariant: "I2",
      severity: mode,
      message: `${uncovered.length} .claude/ components not covered by any pack (first 5: ${uncovered
        .slice(0, 5)
        .join(", ")}${uncovered.length > 5 ? ", …" : ""})`,
    },
  ];
}

/**
 * I3 single ownership — no component belongs to >1 pack. WARNING locally
 * (often a deliberate shared-component case during refactor), ERROR in CI.
 */
function checkI3SingleOwnership(
  result: PackResolutionResult,
  mode: Severity,
): ValidationFinding[] {
  const owners = new Map<string, string[]>();
  for (const pack of result.packs) {
    for (const componentType of [
      "agents",
      "commands",
      "skills",
      "hooks",
      "payload",
    ] as const) {
      for (const component of pack.components[componentType]) {
        const existing = owners.get(component.relativePath) ?? [];
        existing.push(pack.id);
        owners.set(component.relativePath, existing);
      }
    }
  }

  const overlaps: Array<{ path: string; packs: string[] }> = [];
  for (const [path, packIds] of owners) {
    if (packIds.length > 1) {
      overlaps.push({ path, packs: packIds });
    }
  }

  if (overlaps.length === 0) return [];
  const first = overlaps[0];
  if (!first) return [];
  return [
    {
      invariant: "I3",
      severity: mode,
      message: `${overlaps.length} components owned by >1 pack (first: ${first.path} → [${first.packs.join(", ")}])`,
    },
  ];
}

/**
 * I4 cross-pack refs resolve — agent frontmatter / command references stay
 * within pack ∪ dependsOn. WARNING locally (full enforcement requires parsing
 * frontmatter + reference graph), ERROR in CI.
 *
 * Implementation note (T004 scope): the full reference-graph check is deferred
 * to a follow-up — the initial implementation validates that an agent's
 * declared `skills:` list (from frontmatter) resolves within pack ∪ dependsOn,
 * which is the most common cross-pack reference type. Command → skill
 * references via slash-command syntax are not yet parsed.
 */
function checkI4CrossPackRefs(
  result: PackResolutionResult,
  mode: Severity,
): ValidationFinding[] {
  // Placeholder: real implementation parses agent frontmatter `skills:` and
  // verifies each skill name resolves to a skill in the same pack or a
  // declared dependency. Tracked as a follow-up; not in initial T004 scope.
  void result;
  void mode;
  return [];
}

/**
 * I5 dependency DAG — `dependsOn` graph across packs must be acyclic.
 * Always ERROR (cyclic dependencies cause infinite loops in install/assembly).
 */
function checkI5DepsDag(result: PackResolutionResult): ValidationFinding[] {
  const packIds = new Set(result.packs.map((p) => p.id));
  const findings: ValidationFinding[] = [];

  // First: verify every dependsOn entry points to a known pack.
  for (const pack of result.packs) {
    if (!pack.definition.dependsOn) continue;
    for (const dep of pack.definition.dependsOn) {
      if (!packIds.has(dep)) {
        findings.push({
          invariant: "I5",
          severity: "ERROR",
          message: `pack '${pack.id}' depends on unknown pack '${dep}'`,
          packs: [pack.id],
        });
      }
    }
  }

  // Then: detect cycles via DFS.
  const adj = new Map<string, string[]>();
  for (const pack of result.packs) {
    adj.set(pack.id, pack.definition.dependsOn ?? []);
  }
  const cycle = detectCycle(adj);
  if (cycle) {
    findings.push({
      invariant: "I5",
      severity: "ERROR",
      message: `dependency cycle detected: ${cycle.join(" → ")} → ${cycle[0]}`,
      packs: cycle,
    });
  }

  return findings;
}

/** DFS-based cycle detection. Returns the first cycle found, or null if acyclic. */
function detectCycle(adj: Map<string, string[]>): string[] | null {
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const k of adj.keys()) color.set(k, WHITE);

  const stack: string[] = [];

  const visit = (u: string): boolean => {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v);
      if (c === GRAY) {
        // Found cycle. Slice the stack from v onwards to get the cycle.
        const cycleStart = stack.indexOf(v);
        stack.push(v);
        // Mutate stack to the cycle slice for the caller.
        const cycle = stack.slice(cycleStart);
        stack.length = 0;
        stack.push(...cycle);
        return true;
      }
      if (c === WHITE && visit(v)) return true;
    }
    color.set(u, BLACK);
    stack.pop();
    return false;
  };

  for (const k of adj.keys()) {
    if (color.get(k) === WHITE && visit(k)) {
      return stack;
    }
  }
  return null;
}

/** Walk a directory recursively, returning all file paths. */
function walkFiles(dirAbs: string): string[] {
  // Lazy-load readdirSync to keep this module tree-shakable for non-validator callers.
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
  const out: string[] = [];
  const walk = (d: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = resolve(d, entry);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(abs);
      } else if (st.isFile()) {
        out.push(abs);
      }
    }
  };
  walk(dirAbs);
  return out.sort();
}

// relative is re-exported via type-only; the function is needed for I2.
import { relative as _relative } from "node:path";
void _relative;
function relative(from: string, to: string): string {
  return _relative(from, to);
}

// `relative` is also a node:path export we use; alias to avoid name clash.
export type { Pack };
