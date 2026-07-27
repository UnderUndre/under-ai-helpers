import { describe, it, expect } from "vitest";
import { renderFleetTable, renderFleetJson } from "../../../src/core/fleet/table.js";
import type { FleetEntry } from "../../../src/core/fleet/types.js";

// ── Helpers ─────────────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function makeEntry(overrides: Partial<FleetEntry> = {}): FleetEntry {
  return {
    fullName: "user/repo",
    shortName: "repo",
    defaultBranch: "main",
    pinnedRef: "v0.3.0",
    pinnedSource: "github:UnderUndre/under-ai-helpers",
    latestRef: "v0.4.0",
    hasDrift: true,
    lastSyncAt: "2026-01-15T10:30:00Z",
    state: "active",
    unreadableReason: null,
    ...overrides,
  };
}

function makeEntries(n: number): FleetEntry[] {
  return Array.from({ length: n }, (_, i) =>
    makeEntry({
      fullName: `user/repo-${String(i + 1).padStart(3, "0")}`,
      shortName: `repo-${String(i + 1).padStart(3, "0")}`,
      pinnedRef: i % 2 === 0 ? "v0.3.0" : "v0.4.0",
      hasDrift: i % 2 === 0,
      lastSyncAt: new Date(Date.now() - i * 86400000).toISOString(),
    }),
  );
}

// ── Tests ───────────────────────────────────────────────────────────

describe("renderFleetTable", () => {
  // ── 1. Empty state (0 rows) ───────────────────────────────────────

  it("shows empty state message for 0 rows", () => {
    const output = renderFleetTable([], { scopeInfo: "user (3) + 1 orgs (myorg)" });
    expect(output).toContain("No clai-helpers projects found");
    expect(output).toContain("Scope: user (3) + 1 orgs (myorg)");
  });

  // ── 2. Golden snapshot for 1 row ──────────────────────────────────

  it("renders 1 row correctly", () => {
    const entries = [makeEntry()];
    const output = renderFleetTable(entries, { noColor: true });

    expect(output).toContain("user/repo");
    expect(output).toContain("main");
    expect(output).toContain("v0.3.0");
    expect(output).toContain("v0.4.0");
    expect(output).toContain("YES");
    expect(output).toContain("2026-01-15");
  });

  // ── 3. Golden snapshot for 5 rows ─────────────────────────────────

  it("renders 5 rows correctly", () => {
    const entries = makeEntries(5);
    const output = renderFleetTable(entries, { noColor: true });

    expect(output).toContain("user/repo-001");
    expect(output).toContain("user/repo-005");
    // Table should have header + 5 data rows
    const lines = output.split("\n");
    // cli-table3 renders borders between rows
    expect(lines.length).toBeGreaterThan(5);
  });

  // ── 4. Golden snapshot for 50 rows (performance check) ────────────

  it("renders 50 rows without error", () => {
    const entries = makeEntries(50);
    const start = performance.now();
    const output = renderFleetTable(entries, { noColor: true });
    const elapsed = performance.now() - start;

    expect(output).toContain("user/repo-001");
    expect(output).toContain("user/repo-050");
    // Should render in under 500ms even on slow machines
    expect(elapsed).toBeLessThan(500);
  });

  // ── 5. noColor: true → zero ANSI escape codes ────────────────────

  it("produces no ANSI codes when noColor is true", () => {
    const entries = [makeEntry({ hasDrift: true })];
    const output = renderFleetTable(entries, { noColor: true });

    expect(ANSI_RE.test(output)).toBe(false);
  });

  // ── 6. Drift coloring ─────────────────────────────────────────────

  it("colors drift=true in red and drift=false in green", () => {
    const driftYes = renderFleetTable([makeEntry({ hasDrift: true })]);
    const driftNo = renderFleetTable([makeEntry({ hasDrift: false })]);

    // hasDrift=true should contain red ANSI code (31m)
    expect(driftYes).toContain("\x1b[31m");
    expect(driftYes).toContain("YES");

    // hasDrift=false should contain green ANSI code (32m)
    expect(driftNo).toContain("\x1b[32m");
    expect(driftNo).toContain("✓ no");
  });

  // ── 7. Long repo name truncation ──────────────────────────────────

  it("truncates repo names longer than 40 chars with …", () => {
    const longName = "a-very-long-org-name/this-is-an-extremely-long-repository-name-that-exceeds-limit";
    const entries = [makeEntry({ fullName: longName, shortName: "this-is-an-extremely-long-repository-name-that-exceeds-limit" })];
    const output = renderFleetTable(entries, { noColor: true });

    // Should be truncated — the full name should NOT appear
    expect(output).not.toContain(longName);
    // Should contain truncation marker
    expect(output).toContain("…");
  });

  // ── 8. Floating ref display (commit SHA) ──────────────────────────

  it("displays commit SHA refs as branch@shortsha", () => {
    const entries = [makeEntry({ pinnedRef: "abc123def456789", defaultBranch: "develop" })];
    const output = renderFleetTable(entries, { noColor: true });

    // Should show develop@abc123d (7-char sha)
    expect(output).toContain("develop@abc123d");
  });

  // ── 9. renderFleetJson produces valid JSON ────────────────────────

  describe("renderFleetJson", () => {
    it("produces valid JSON matching FleetEntry[] shape", () => {
      const entries = [
        makeEntry({ fullName: "user/repo1" }),
        makeEntry({ fullName: "user/repo2", hasDrift: false }),
      ];

      const json = renderFleetJson(entries);
      const parsed = JSON.parse(json) as FleetEntry[];

      expect(parsed).toHaveLength(2);
      expect(parsed[0]!.fullName).toBe("user/repo1");
      expect(parsed[1]!.fullName).toBe("user/repo2");

      // Verify shape: all FleetEntry keys present
      const requiredKeys: (keyof FleetEntry)[] = [
        "fullName", "shortName", "defaultBranch", "pinnedRef",
        "pinnedSource", "latestRef", "hasDrift", "lastSyncAt",
        "state", "unreadableReason",
      ];
      for (const key of requiredKeys) {
        expect(key in parsed[0]!).toBe(true);
      }
    });
  });
});
