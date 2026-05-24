import { describe, it, expect } from "vitest";
import claudeToCopilotPrompt from "../../../src/transformers/claude-to-copilot-prompt.js";
import type { ParsedFile, TransformContext } from "../../../src/transformers/types.js";

const ctx: TransformContext = {
  sourceCommit: "abc123",
  toolVersion: "0.1.0",
  targetName: "copilot",
  config: { version: 1, sources: [], targets: {} },
};

describe("claude-to-copilot-prompt", () => {
  it("generates .github/prompts/*.prompt.md with agent frontmatter", () => {
    const source: ParsedFile = {
      sourcePath: "commands/commit.md",
      content: "---\ndescription: Create a commit\n---\n\n# Commit\nBody",
      frontmatter: { description: "Create a commit" },
      body: "# Commit\nBody",
      extension: ".md",
    };

    const result = claudeToCopilotPrompt(source, ctx);
    const file = result as { targetPath: string; content: string };
    expect(file.targetPath).toBe(".github/prompts/commit.prompt.md");
    expect(file.content).toContain("agent: commit");
    expect(file.content).toContain("AUTO-GENERATED");
    expect(file.content).toContain("# Commit\nBody");
  });

  it("uses filename stem as agent name", () => {
    const source: ParsedFile = {
      sourcePath: "commands/deploy.md",
      content: "# Deploy",
      body: "# Deploy",
      extension: ".md",
    };

    const result = claudeToCopilotPrompt(source, ctx);
    const file = result as { content: string };
    expect(file.content).toContain("agent: deploy");
  });
});
