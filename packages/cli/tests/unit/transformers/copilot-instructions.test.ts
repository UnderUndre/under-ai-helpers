import { describe, it, expect } from "vitest";
import claudeToCopilotInstructions from "../../../src/transformers/claude-to-copilot-instructions.js";
import type { ParsedFile, TransformContext } from "../../../src/transformers/types.js";

const ctx: TransformContext = {
  sourceCommit: "abc123",
  toolVersion: "0.1.0",
  targetName: "copilot",
  config: { version: 1, sources: [], targets: {} },
};

describe("claude-to-copilot-instructions", () => {
  it("generates .github/instructions/*.instructions.md", () => {
    const source: ParsedFile = {
      sourcePath: "agents/debugger.md",
      content: "---\nname: debugger\ndescription: Expert in debugging\ntools: [Read]\n---\n\n# Debugger\nBody",
      frontmatter: { name: "debugger", description: "Expert in debugging", tools: ["Read"] },
      body: "# Debugger\nBody",
      extension: ".md",
    };

    const result = claudeToCopilotInstructions(source, ctx);
    const file = result as { targetPath: string; content: string };
    expect(file.targetPath).toBe(".github/instructions/debugger.instructions.md");
    expect(file.content).toContain("Expert in debugging");
    expect(file.content).toContain("# Debugger");
    expect(file.content).not.toContain("tools:");
    expect(file.content).toContain("AUTO-GENERATED");
  });

  it("uses description as leading paragraph", () => {
    const source: ParsedFile = {
      sourcePath: "agents/reviewer.md",
      content: "---\ndescription: Code reviewer\n---\n\nBody",
      frontmatter: { description: "Code reviewer" },
      body: "Body",
      extension: ".md",
    };

    const result = claudeToCopilotInstructions(source, ctx);
    const file = result as { content: string };
    // Description should appear before body
    const descIdx = file.content.indexOf("Code reviewer");
    const bodyIdx = file.content.indexOf("Body");
    expect(descIdx).toBeLessThan(bodyIdx);
  });
});
