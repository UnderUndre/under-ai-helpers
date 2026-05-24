/**
 * Integration test for full init flow (SC-002).
 * Uses local fixture as source instead of giget network fetch.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, readdir, access } from "node:fs/promises";
import { join } from "pathe";
import { tmpdir } from "node:os";

import { parseSourceFile } from "../../src/core/parse.js";
import { matchGlob, resolveOutputPath } from "../../src/core/glob.js";
import { preloadAllTransformers, getTransformer } from "../../src/transformers/registry.js";
import { canonicalHash, slotsHash, renderedHash } from "../../src/core/hash.js";
import { parseSlots } from "../../src/core/slots.js";
import { detectHeader } from "../../src/core/header.js";
import { writeLock, readLock, validateLock } from "../../src/core/lock.js";
import { FileKind, FileClass, FileStatus } from "../../src/types/common.js";
import type { HelpersConfig } from "../../src/types/config.js";
import type { RenderedFile } from "../../src/transformers/types.js";
import type { LockFile, SourceEntry, GeneratedEntry } from "../../src/types/lock.js";
import { mkdir, writeFile } from "node:fs/promises";

const FIXTURE_DIR = join(import.meta.dirname, "../fixtures/source-repo");

// Manifest matching the fixture source repo
const TEST_MANIFEST: HelpersConfig = {
  version: 1,
  sources: [
    "commands/**/*.md",
    "agents/**/*.md",
    "CLAUDE.md",
    "settings.json",
  ],
  targets: {
    claude: {
      pipelines: [
        { transformer: "identity", match: "**/*", output: ".claude/{{relativePath}}" },
        { transformer: "identity", match: "CLAUDE.md", output: "CLAUDE.md" },
        { transformer: "identity", match: "settings.json", output: ".claude/settings.json", class: "config" as FileClass },
      ],
    },
    copilot: {
      pipelines: [
        { transformer: "claude-to-copilot-prompt", match: "commands/**/*.md", output: ".github/prompts/{{name}}.prompt.md" },
        { transformer: "claude-to-copilot-instructions", match: "agents/**/*.md", output: ".github/instructions/{{name}}.instructions.md" },
        { transformer: "claude-to-copilot-root-instructions", match: "CLAUDE.md", output: ".github/copilot-instructions.md" },
      ],
    },
    gemini: {
      pipelines: [
        { transformer: "claude-to-gemini-command", match: "commands/**/*.md", output: ".gemini/commands/{{name}}.toml" },
        { transformer: "claude-to-gemini-agent", match: "agents/**/*.md", output: ".gemini/agents/{{name}}.md" },
        { transformer: "claude-to-gemini-root", match: "CLAUDE.md", output: "GEMINI.md" },
      ],
    },
  },
};

const CTX: {
  sourceCommit: string;
  toolVersion: string;
  targetName: string;
  config: HelpersConfig;
  allParsedFiles: ReturnType<typeof parseSourceFile>[];
} = {
  sourceCommit: "abc123def456",
  toolVersion: "0.1.0",
  targetName: "",
  config: TEST_MANIFEST,
  allParsedFiles: [],
};

/**
 * Discover source files from fixture .claude/ dir.
 */
async function discoverFixtureFiles(): Promise<string[]> {
  const claudeDir = join(FIXTURE_DIR, ".claude");
  const files: string[] = [];

  async function walk(dir: string, base: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), rel);
      } else {
        files.push(rel);
      }
    }
  }

  await walk(claudeDir, "");
  return files.sort();
}

/**
 * Run all transformer pipelines and produce rendered files.
 */
async function runFullInit(
  targetNames: string[] = ["claude", "copilot", "gemini"],
): Promise<RenderedFile[]> {
  await preloadAllTransformers(TEST_MANIFEST, targetNames);

  const claudeDir = join(FIXTURE_DIR, ".claude");
  const sourceFiles = await discoverFixtureFiles();
  const parsedFiles = await Promise.all(
    sourceFiles.map(async (relPath) => {
      const content = await readFile(join(claudeDir, relPath), "utf8");
      return parseSourceFile(relPath, content);
    }),
  );

  const allRendered: RenderedFile[] = [];
  CTX.allParsedFiles = parsedFiles;
  for (const targetName of targetNames) {
    const target = TEST_MANIFEST.targets[targetName]!;
    CTX.targetName = targetName;

    for (const pipeline of target.pipelines) {
      const transformer = getTransformer(pipeline.transformer);

      for (const parsed of parsedFiles) {
        if (!matchGlob(pipeline.match, parsed.sourcePath)) continue;
        const result = transformer(parsed, CTX);
        if (!result) continue;

        const files = Array.isArray(result) ? result : [result];
        for (const file of files) {
          if (pipeline.transformer !== "identity") {
            file.targetPath = resolveOutputPath(pipeline.output, parsed.sourcePath);
          }
          allRendered.push(file);
        }
      }
    }
  }

  return allRendered;
}

describe("init flow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "helpers-init-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("generates all manifest paths for all 3 targets", async () => {
    const rendered = await runFullInit();

    // Should have files for each target
    const paths = rendered.map((f) => f.targetPath);

    // Claude target files
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain(".claude/commands/commit.md");
    expect(paths).toContain(".claude/commands/deploy.md");
    expect(paths).toContain(".claude/agents/debugger.md");

    // Copilot target files
    expect(paths).toContain(".github/prompts/commit.prompt.md");
    expect(paths).toContain(".github/prompts/deploy.prompt.md");
    expect(paths).toContain(".github/instructions/debugger.instructions.md");
    expect(paths).toContain(".github/copilot-instructions.md");

    // Gemini target files
    expect(paths).toContain(".gemini/commands/commit.toml");
    expect(paths).toContain(".gemini/commands/deploy.toml");
    expect(paths).toContain(".gemini/agents/debugger.md");
    expect(paths).toContain("GEMINI.md");
  });

  it("generated files have AUTO-GENERATED header (except JSON)", async () => {
    const rendered = await runFullInit();

    for (const file of rendered) {
      if (file.transformer === "identity") continue; // identity doesn't add header
      const ext = file.targetPath.match(/\.[^.]+$/)?.[0] ?? ".md";
      if (ext === ".json") continue; // JSON has no header

      const header = detectHeader(file.content, ext);
      expect(header, `Missing header in ${file.targetPath}`).not.toBeNull();
      expect(header?.valid, `Invalid header in ${file.targetPath}`).toBe(true);
    }
  });

  it("init with --targets claude generates only Claude files", async () => {
    const rendered = await runFullInit(["claude"]);
    const paths = rendered.map((f) => f.targetPath);

    // Should have Claude files
    expect(paths.some((p) => p.startsWith(".claude/") || p === "CLAUDE.md")).toBe(true);

    // Should NOT have Copilot or Gemini files
    expect(paths.some((p) => p.startsWith(".github/"))).toBe(false);
    expect(paths.some((p) => p.startsWith(".gemini/") || p === "GEMINI.md")).toBe(false);
  });

  it("lock file is valid with correct entries", async () => {
    const rendered = await runFullInit();

    // Build lock file
    const lock: LockFile = {
      schema: 1,
      toolVersion: "0.1.0",
      source: { url: "github:test/repo", ref: "main", commit: "abc123def456" },
      installedAt: new Date().toISOString(),
      targets: ["claude", "copilot", "gemini"],
      trustedTransformers: [],
      files: [],
    };

    const seen = new Set<string>();
    for (const file of rendered) {
      if (seen.has(file.targetPath)) continue;
      seen.add(file.targetPath);

      if (file.transformer === "identity") {
        const slots = parseSlots(file.content, file.targetPath.match(/\.[^.]+$/)?.[0] ?? ".md");
        const slotBodies = slots.map((s) => s.body);
        lock.files.push({
          path: file.targetPath,
          kind: FileKind.Source,
          class: FileClass.Core,
          status: FileStatus.Managed,
          sourceCanonicalHash: canonicalHash(file.content, slotBodies),
          localCanonicalHash: canonicalHash(file.content, slotBodies),
          slotsHash: slotsHash(slotBodies),
        } as SourceEntry);
      } else {
        lock.files.push({
          path: file.targetPath,
          kind: FileKind.Generated,
          transformer: file.transformer,
          fromSource: file.fromSource,
          renderedHash: renderedHash(file.content),
          localRenderedHash: renderedHash(file.content),
          status: FileStatus.Managed,
        } as GeneratedEntry);
      }
    }

    // Build source-path mapping for fromSource resolution
    const sourcePathMap = new Map<string, string>();
    for (const file of rendered) {
      if (file.transformer === "identity") {
        sourcePathMap.set(file.fromSource, file.targetPath);
      }
    }

    // Fix fromSource references to use lock entry paths
    for (const entry of lock.files) {
      if (entry.kind === "generated") {
        const resolved = sourcePathMap.get(entry.fromSource);
        if (resolved) entry.fromSource = resolved;
      }
    }

    // Validate lock
    const errors = validateLock(lock);
    expect(errors, `Lock validation errors: ${errors.map((e) => e.message).join(", ")}`).toHaveLength(0);

    // Write and read back
    await writeLock(tempDir, lock);
    const loaded = await readLock(tempDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.schema).toBe(1);
    expect(loaded!.files.length).toBeGreaterThan(0);
    expect(loaded!.targets).toEqual(["claude", "copilot", "gemini"]);
  });

  it("copilot root instructions rewrites .claude/ to .github/ paths", async () => {
    const rendered = await runFullInit(["copilot"]);
    const rootInstructions = rendered.find((f) => f.targetPath === ".github/copilot-instructions.md");

    expect(rootInstructions).toBeDefined();
    expect(rootInstructions!.content).toContain(".github/instructions/debugger.instructions.md");
    expect(rootInstructions!.content).toContain(".github/prompts/commit.prompt.md");
    expect(rootInstructions!.content).not.toContain(".claude/agents/");
    expect(rootInstructions!.content).not.toContain(".claude/commands/");
  });

  it("gemini root is composed and degrades gracefully when phrases/coding sources are missing", async () => {
    // The claude-to-gemini-root transformer composes GEMINI.md from
    //   .github/instructions/persona/phrases/copilot-instructions.md
    //   .github/instructions/coding/copilot-instructions.md
    // This fixture repo doesn't ship those, so the transformer must still
    // produce a valid GEMINI.md — just without the body sections.
    const rendered = await runFullInit(["gemini"]);
    const geminiRoot = rendered.find((f) => f.targetPath === "GEMINI.md");

    expect(geminiRoot).toBeDefined();
    expect(geminiRoot!.content).toContain("# GEMINI Instructions");
    expect(geminiRoot!.fromSource).toBe("CLAUDE.md");
    expect(geminiRoot!.transformer).toBe("claude-to-gemini-root");
    // Project overview is NEVER included in GEMINI.md, even when present in
    // source repo — consumers have their own project identity.
    expect(geminiRoot!.content).not.toContain("## Project: UnderUndre");
  });

  it("identity transformer preserves Protected Slot markers", async () => {
    const rendered = await runFullInit(["claude"]);
    const claudeMd = rendered.find((f) => f.targetPath === "CLAUDE.md");

    expect(claudeMd).toBeDefined();
    expect(claudeMd!.content).toContain("HELPERS:CUSTOM START");
    expect(claudeMd!.content).toContain("Project-specific instructions go here.");
    expect(claudeMd!.content).toContain("HELPERS:CUSTOM END");
  });

  it("copilot/gemini outputs strip Protected Slot content", async () => {
    const rendered = await runFullInit(["copilot", "gemini"]);

    const copilotRoot = rendered.find((f) => f.targetPath === ".github/copilot-instructions.md");
    const geminiRoot = rendered.find((f) => f.targetPath === "GEMINI.md");

    expect(copilotRoot!.content).not.toContain("HELPERS:CUSTOM START");
    expect(copilotRoot!.content).not.toContain("Project-specific instructions");
    expect(geminiRoot!.content).not.toContain("HELPERS:CUSTOM START");
    expect(geminiRoot!.content).not.toContain("Project-specific instructions");
  });

  it("gemini command wraps content in TOML prompt format", async () => {
    const rendered = await runFullInit(["gemini"]);
    const commitToml = rendered.find((f) => f.targetPath === ".gemini/commands/commit.toml");

    expect(commitToml).toBeDefined();
    expect(commitToml!.content).toContain('description = "Create a conventional commit message"');
    expect(commitToml!.content).toContain('prompt = """');
    expect(commitToml!.content).toContain('"""');
  });

  it("all lock file paths use forward slashes", async () => {
    const rendered = await runFullInit();
    for (const file of rendered) {
      expect(file.targetPath, `Backslash in path: ${file.targetPath}`).not.toContain("\\");
    }
  });
});
