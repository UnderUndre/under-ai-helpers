/**
 * Integration test for selective targets (SC-009).
 * init --targets, add-target, remove-target flows.
 */

import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "pathe";

import { parseSourceFile } from "../../src/core/parse.js";
import { matchGlob, resolveOutputPath } from "../../src/core/glob.js";
import { preloadAllTransformers, getTransformer } from "../../src/transformers/registry.js";
import type { HelpersConfig } from "../../src/types/config.js";
import type { RenderedFile } from "../../src/transformers/types.js";

const FIXTURE_DIR = join(import.meta.dirname, "../fixtures/source-repo");

const FULL_MANIFEST: HelpersConfig = {
  version: 1,
  sources: ["commands/**/*.md", "agents/**/*.md", "CLAUDE.md"],
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
    gemini: {
      pipelines: [
        { transformer: "claude-to-gemini-command", match: "commands/**/*.md", output: ".gemini/commands/{{name}}.toml" },
        { transformer: "claude-to-gemini-agent", match: "agents/**/*.md", output: ".gemini/agents/{{name}}.md" },
        { transformer: "claude-to-gemini-root", match: "CLAUDE.md", output: "GEMINI.md" },
      ],
    },
  },
};

async function renderTargets(targets: string[]): Promise<RenderedFile[]> {
  await preloadAllTransformers(FULL_MANIFEST, targets);
  const claudeDir = join(FIXTURE_DIR, ".claude");

  const sourceFiles: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) await walk(join(dir, entry.name));
      else {
        const rel = relative(claudeDir, join(dir, entry.name));
        if (FULL_MANIFEST.sources.some((p) => matchGlob(p, rel))) sourceFiles.push(rel);
      }
    }
  }
  await walk(claudeDir);

  const parsedFiles = await Promise.all(
    sourceFiles.sort().map(async (relPath) => {
      const content = await readFile(join(claudeDir, relPath), "utf8");
      return parseSourceFile(relPath, content);
    }),
  );

  const rendered: RenderedFile[] = [];
  const ctx = { sourceCommit: "abc123", toolVersion: "0.1.0", targetName: "", config: FULL_MANIFEST };

  for (const targetName of targets) {
    const target = FULL_MANIFEST.targets[targetName]!;
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
          }
          rendered.push(file);
        }
      }
    }
  }
  return rendered;
}

describe("selective targets", () => {
  it("init --targets claude → only Claude files", async () => {
    const rendered = await renderTargets(["claude"]);
    const paths = rendered.map((f) => f.targetPath);

    expect(paths.some((p) => p.startsWith(".claude/") || p === "CLAUDE.md")).toBe(true);
    expect(paths.some((p) => p.startsWith(".github/"))).toBe(false);
    expect(paths.some((p) => p.startsWith(".gemini/") || p === "GEMINI.md")).toBe(false);
  });

  it("add-target copilot → Copilot files appear", async () => {
    const copilotOnly = await renderTargets(["copilot"]);
    const paths = copilotOnly.map((f) => f.targetPath);

    expect(paths).toContain(".github/prompts/commit.prompt.md");
    expect(paths).toContain(".github/instructions/debugger.instructions.md");
    expect(paths).toContain(".github/copilot-instructions.md");
  });

  it("claude + copilot combined → both present, no Gemini", async () => {
    const rendered = await renderTargets(["claude", "copilot"]);
    const paths = rendered.map((f) => f.targetPath);

    expect(paths.some((p) => p.startsWith(".claude/") || p === "CLAUDE.md")).toBe(true);
    expect(paths.some((p) => p.startsWith(".github/"))).toBe(true);
    expect(paths.some((p) => p.startsWith(".gemini/") || p === "GEMINI.md")).toBe(false);
  });

  it("all three targets → full set of files", async () => {
    const rendered = await renderTargets(["claude", "copilot", "gemini"]);
    const paths = rendered.map((f) => f.targetPath);

    expect(paths.some((p) => p.startsWith(".claude/") || p === "CLAUDE.md")).toBe(true);
    expect(paths.some((p) => p.startsWith(".github/"))).toBe(true);
    expect(paths.some((p) => p.startsWith(".gemini/") || p === "GEMINI.md")).toBe(true);
  });
});
