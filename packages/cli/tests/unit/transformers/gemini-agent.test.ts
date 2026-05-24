import { describe, it, expect } from "vitest";
import claudeToGeminiAgent from "../../../src/transformers/claude-to-gemini-agent.js";
import type { ParsedFile, TransformContext } from "../../../src/transformers/types.js";

const ctx: TransformContext = {
  sourceCommit: "abc123",
  toolVersion: "0.1.0",
  targetName: "gemini",
  config: { version: 1, sources: [], targets: {} },
};

describe("claude-to-gemini-agent", () => {
  it("keeps name and description, strips tools/model/skills", () => {
    const source: ParsedFile = {
      sourcePath: "agents/debugger.md",
      content: "---\nname: debugger\ndescription: Expert\ntools: [Read]\nmodel: inherit\nskills: debugging\n---\n\n# Debugger\nBody",
      frontmatter: { name: "debugger", description: "Expert", tools: ["Read"], model: "inherit", skills: "debugging" },
      body: "# Debugger\nBody",
      extension: ".md",
    };

    const result = claudeToGeminiAgent(source, ctx);
    const file = result as { targetPath: string; content: string };
    expect(file.targetPath).toBe(".gemini/agents/debugger.md");
    expect(file.content).toContain("name: debugger");
    expect(file.content).toContain("description: Expert");
    expect(file.content).not.toContain("tools:");
    expect(file.content).not.toContain("model:");
    expect(file.content).not.toContain("skills:");
    expect(file.content).toContain("# Debugger\nBody");
    expect(file.content).toContain("AUTO-GENERATED");
  });
});
