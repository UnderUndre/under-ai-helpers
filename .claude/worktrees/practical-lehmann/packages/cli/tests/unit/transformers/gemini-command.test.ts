import { describe, it, expect } from "vitest";
import claudeToGeminiCommand from "../../../src/transformers/claude-to-gemini-command.js";
import type { ParsedFile, TransformContext } from "../../../src/transformers/types.js";

const ctx: TransformContext = {
  sourceCommit: "abc123",
  toolVersion: "0.1.0",
  targetName: "gemini",
  config: { version: 1, sources: [], targets: {} },
};

describe("claude-to-gemini-command", () => {
  it("wraps content in TOML prompt format", () => {
    const source: ParsedFile = {
      sourcePath: "commands/commit.md",
      content: "---\ndescription: Create a commit\n---\n\n# Commit\nBody",
      frontmatter: { description: "Create a commit" },
      body: "# Commit\nBody",
      extension: ".md",
    };

    const result = claudeToGeminiCommand(source, ctx);
    const file = result as { targetPath: string; content: string };
    expect(file.targetPath).toBe(".gemini/commands/commit.toml");
    expect(file.content).toContain('description = "Create a commit"');
    expect(file.content).toContain('prompt = """');
    expect(file.content).toContain('"""');
    expect(file.content).toContain("AUTO-GENERATED");
  });
});
