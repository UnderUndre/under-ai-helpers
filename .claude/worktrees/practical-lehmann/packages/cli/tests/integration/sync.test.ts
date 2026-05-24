/**
 * Integration test for sync flow (SC-002, SC-003).
 * Uses local fixtures — no network.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "pathe";
import { tmpdir } from "node:os";

import { parseSourceFile } from "../../src/core/parse.js";
import { matchGlob, resolveOutputPath } from "../../src/core/glob.js";
import { preloadAllTransformers, getTransformer } from "../../src/transformers/registry.js";
import { canonicalHash, slotsHash, renderedHash } from "../../src/core/hash.js";
import { parseSlots, mergeSlots } from "../../src/core/slots.js";
import { writeLock, readLock } from "../../src/core/lock.js";
import { FileKind, FileClass, FileStatus } from "../../src/types/common.js";
import type { HelpersConfig } from "../../src/types/config.js";
import type { RenderedFile } from "../../src/transformers/types.js";
import type { LockFile, SourceEntry, GeneratedEntry } from "../../src/types/lock.js";

const FIXTURE_DIR = join(import.meta.dirname, "../fixtures/source-repo");

const TEST_MANIFEST: HelpersConfig = {
  version: 1,
  sources: ["commands/**/*.md", "agents/**/*.md", "CLAUDE.md", "settings.json"],
  targets: {
    claude: {
      pipelines: [
        { transformer: "identity", match: "**/*", output: ".claude/{{relativePath}}" },
        { transformer: "identity", match: "CLAUDE.md", output: "CLAUDE.md" },
      ],
    },
    copilot: {
      pipelines: [
        { transformer: "claude-to-copilot-prompt", match: "commands/**/*.md", output: ".github/prompts/{{name}}.prompt.md" },
        { transformer: "claude-to-copilot-instructions", match: "agents/**/*.md", output: ".github/instructions/{{name}}.instructions.md" },
        { transformer: "claude-to-copilot-root-instructions", match: "CLAUDE.md", output: ".github/copilot-instructions.md" },
      ],
    },
  },
};

async function runInit(targetDir: string, targets: string[] = ["claude", "copilot"]): Promise<{ rendered: RenderedFile[]; lock: LockFile }> {
  await preloadAllTransformers(TEST_MANIFEST, targets);

  const { readdir } = await import("node:fs/promises");
  const { relative } = await import("pathe");
  const claudeDir = join(FIXTURE_DIR, ".claude");

  const sourceFiles: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) await walk(join(dir, entry.name));
      else {
        const rel = relative(claudeDir, join(dir, entry.name));
        if (TEST_MANIFEST.sources.some((p) => matchGlob(p, rel))) sourceFiles.push(rel);
      }
    }
  }
  await walk(claudeDir);
  sourceFiles.sort();

  const parsedFiles = await Promise.all(
    sourceFiles.map(async (relPath) => {
      const content = await readFile(join(claudeDir, relPath), "utf8");
      return parseSourceFile(relPath, content);
    }),
  );

  const allRendered: RenderedFile[] = [];
  const ctx = { sourceCommit: "abc123", toolVersion: "0.1.0", targetName: "", config: TEST_MANIFEST };
  const sourcePathMap = new Map<string, string>();

  for (const targetName of targets) {
    const target = TEST_MANIFEST.targets[targetName]!;
    ctx.targetName = targetName;
    for (const pipeline of target.pipelines) {
      const transformer = getTransformer(pipeline.transformer);
      for (const parsed of parsedFiles) {
        if (!matchGlob(pipeline.match, parsed.sourcePath)) continue;
        const result = transformer(parsed, ctx);
        if (!result) continue;
        const files = Array.isArray(result) ? result : [result];
        for (const file of files) {
          if (pipeline.transformer !== "identity") {
            file.targetPath = resolveOutputPath(pipeline.output, parsed.sourcePath);
          } else {
            sourcePathMap.set(file.fromSource, file.targetPath);
          }
          allRendered.push(file);
        }
      }
    }
  }

  // Write files to targetDir
  const seen = new Set<string>();
  for (const file of allRendered) {
    if (seen.has(file.targetPath)) continue;
    seen.add(file.targetPath);
    const fullPath = join(targetDir, file.targetPath);
    await mkdir(join(fullPath, ".."), { recursive: true });
    await writeFile(fullPath, file.content, "utf8");
  }

  // Build lock
  const lock: LockFile = {
    schema: 1, toolVersion: "0.1.0",
    source: { url: "github:test/repo", ref: "main", commit: "abc123" },
    installedAt: new Date().toISOString(),
    targets,
    trustedTransformers: [],
    files: [],
  };

  for (const file of allRendered) {
    if (seen.has(file.targetPath + "_done")) continue;
    seen.add(file.targetPath + "_done");
    if (file.transformer === "identity") {
      const ext = file.targetPath.match(/\.[^.]+$/)?.[0] ?? ".md";
      const slots = parseSlots(file.content, ext);
      const slotBodies = slots.map((s) => s.body);
      lock.files.push({
        path: file.targetPath, kind: FileKind.Source, class: FileClass.Core,
        status: FileStatus.Managed,
        sourceCanonicalHash: canonicalHash(file.content, slotBodies),
        localCanonicalHash: canonicalHash(file.content, slotBodies),
        slotsHash: slotsHash(slotBodies),
      } as SourceEntry);
    } else {
      lock.files.push({
        path: file.targetPath, kind: FileKind.Generated,
        transformer: file.transformer,
        fromSource: sourcePathMap.get(file.fromSource) ?? file.fromSource,
        renderedHash: renderedHash(file.content),
        localRenderedHash: renderedHash(file.content),
        status: FileStatus.Managed,
      } as GeneratedEntry);
    }
  }

  await writeLock(targetDir, lock);
  return { rendered: allRendered, lock };
}

describe("sync flow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "helpers-sync-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("Protected Slot content preserved byte-for-byte after sync (SC-003)", async () => {
    // Init
    await runInit(tempDir);

    // Modify the slot content in CLAUDE.md
    const claudeMdPath = join(tempDir, "CLAUDE.md");
    const original = await readFile(claudeMdPath, "utf8");
    const customContent = "My very specific project notes\nDo not lose this!";
    const modified = original.replace(
      /<!-- HELPERS:CUSTOM START -->\n[\s\S]*?<!-- HELPERS:CUSTOM END -->/,
      `<!-- HELPERS:CUSTOM START -->\n${customContent}\n<!-- HELPERS:CUSTOM END -->`,
    );
    await writeFile(claudeMdPath, modified, "utf8");

    // Re-run init (simulating sync) — should merge slots
    const claudeDir = join(FIXTURE_DIR, ".claude");
    const sourceContent = await readFile(join(claudeDir, "CLAUDE.md"), "utf8");
    const parsed = parseSourceFile("CLAUDE.md", sourceContent);

    await preloadAllTransformers(TEST_MANIFEST, ["claude"]);
    const transformer = getTransformer("identity");
    const result = transformer(parsed, {
      sourceCommit: "def456", toolVersion: "0.1.0", targetName: "claude", config: TEST_MANIFEST,
    })!;
    const file = Array.isArray(result) ? result[0]! : result;

    // Merge with existing slots
    const existingSlots = parseSlots(modified, ".md");
    const merged = mergeSlots(file.content, existingSlots, ".md");

    // Verify slot content preserved byte-for-byte
    expect(merged).toContain(customContent);
    const mergedSlots = parseSlots(merged, ".md");
    expect(mergedSlots[0]!.body).toBe(customContent);
  });

  it("generated file with local edits is silently overwritten", async () => {
    await runInit(tempDir);

    // Modify a generated file
    const promptPath = join(tempDir, ".github/prompts/commit.prompt.md");
    await writeFile(promptPath, "I modified this!", "utf8");

    // Re-generate — should overwrite
    await preloadAllTransformers(TEST_MANIFEST, ["copilot"]);
    const claudeDir = join(FIXTURE_DIR, ".claude");
    const content = await readFile(join(claudeDir, "commands/commit.md"), "utf8");
    const parsed = parseSourceFile("commands/commit.md", content);
    const transformer = getTransformer("claude-to-copilot-prompt");
    const result = transformer(parsed, {
      sourceCommit: "abc123", toolVersion: "0.1.0", targetName: "copilot", config: TEST_MANIFEST,
    })!;
    const file = Array.isArray(result) ? result[0]! : result;

    // The new content should NOT contain the local modification
    expect(file.content).not.toContain("I modified this!");
    expect(file.content).toContain("agent: commit");
  });

  it("lock file round-trips correctly through init", async () => {
    const { lock } = await runInit(tempDir);

    const loaded = await readLock(tempDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.files.length).toBe(lock.files.length);
    expect(loaded!.targets).toEqual(lock.targets);
    expect(loaded!.source.commit).toBe("abc123");
  });
});
