import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { ensureGitignoreEntries } from "../../src/core/gitignore.js";

describe("ensureGitignoreEntries", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "clai-gitignore-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeIgnore(content: string): Promise<void> {
    await writeFile(join(dir, ".gitignore"), content, "utf8");
  }

  async function readIgnore(): Promise<string> {
    return await readFile(join(dir, ".gitignore"), "utf8");
  }

  it("creates .gitignore if missing", async () => {
    const added = await ensureGitignoreEntries(dir, [{ pattern: ".helpers/" }]);

    expect(added).toEqual([".helpers/"]);
    const content = await readIgnore();
    expect(content).toContain("# clai-helpers (auto-managed");
    expect(content).toContain(".helpers/");
  });

  it("appends to existing file, preserving original content", async () => {
    await writeIgnore("node_modules/\ndist/\n");
    const added = await ensureGitignoreEntries(dir, [{ pattern: ".helpers/" }]);

    expect(added).toEqual([".helpers/"]);
    const content = await readIgnore();
    expect(content).toContain("node_modules/");
    expect(content).toContain("dist/");
    expect(content).toContain(".helpers/");
    // User's original lines come first
    expect(content.indexOf("node_modules/")).toBeLessThan(content.indexOf(".helpers/"));
  });

  it("is idempotent — does not duplicate on repeat call", async () => {
    await ensureGitignoreEntries(dir, [{ pattern: ".helpers/" }]);
    const added = await ensureGitignoreEntries(dir, [{ pattern: ".helpers/" }]);

    expect(added).toEqual([]);
    const content = await readIgnore();
    // Only one occurrence of the pattern line
    const occurrences = content.split(/\r?\n/).filter((l) => l.trim() === ".helpers/").length;
    expect(occurrences).toBe(1);
  });

  it("treats `.helpers` and `.helpers/` as equivalent", async () => {
    await writeIgnore(".helpers\n");
    const added = await ensureGitignoreEntries(dir, [{ pattern: ".helpers/" }]);

    expect(added).toEqual([]);
  });

  it("treats `/.helpers/` (rooted) as equivalent to `.helpers/`", async () => {
    await writeIgnore("/.helpers/\n");
    const added = await ensureGitignoreEntries(dir, [{ pattern: ".helpers/" }]);

    expect(added).toEqual([]);
  });

  it("ignores the pattern if only present as a comment", async () => {
    await writeIgnore("# .helpers/ is staging\n");
    const added = await ensureGitignoreEntries(dir, [{ pattern: ".helpers/" }]);

    expect(added).toEqual([".helpers/"]);
  });

  it("ignores the pattern if only present as a negation", async () => {
    await writeIgnore("!.helpers/\n");
    const added = await ensureGitignoreEntries(dir, [{ pattern: ".helpers/" }]);

    expect(added).toEqual([".helpers/"]);
  });

  it("handles multiple entries, adding only missing ones", async () => {
    await writeIgnore(".helpers/\n");
    const added = await ensureGitignoreEntries(dir, [
      { pattern: ".helpers/" }, // already present
      { pattern: ".draft/", comment: "scratch work" }, // new
    ]);

    expect(added).toEqual([".draft/"]);
    const content = await readIgnore();
    expect(content).toContain("# scratch work");
    expect(content).toContain(".draft/");
  });

  it("returns empty array when input is empty", async () => {
    const added = await ensureGitignoreEntries(dir, []);
    expect(added).toEqual([]);
  });

  it("handles file ending without newline — adds separator cleanly", async () => {
    await writeIgnore("node_modules");
    await ensureGitignoreEntries(dir, [{ pattern: ".helpers/" }]);
    const content = await readIgnore();
    // No merged line "node_modules# clai-helpers..."
    expect(content).not.toMatch(/node_modules#/);
    expect(content).toContain("node_modules\n");
  });
});
