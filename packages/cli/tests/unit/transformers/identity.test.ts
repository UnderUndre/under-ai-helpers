import { describe, it, expect } from "vitest";
import identity from "../../../src/transformers/identity.js";
import { FileKind } from "../../../src/types/common.js";
import type { ParsedFile, TransformContext } from "../../../src/transformers/types.js";

const ctx: TransformContext = {
  sourceCommit: "abc123",
  toolVersion: "0.1.0",
  targetName: "claude",
  config: { version: 1, sources: [], targets: {} },
};

describe("identity transformer", () => {
  it("copies content as-is for subdirectory files", () => {
    const source: ParsedFile = {
      sourcePath: "commands/commit.md",
      content: "# Commit\nBody",
      body: "# Commit\nBody",
      extension: ".md",
    };

    const result = identity(source, ctx);
    expect(result).not.toBeNull();
    const file = result as { targetPath: string; content: string };
    expect(file.targetPath).toBe(".claude/commands/commit.md");
    expect(file.content).toBe("# Commit\nBody");
  });

  it("remaps CLAUDE.md to project root", () => {
    const source: ParsedFile = {
      sourcePath: "CLAUDE.md",
      content: "# Root instructions",
      body: "# Root instructions",
      extension: ".md",
    };

    const result = identity(source, ctx);
    const file = result as { targetPath: string };
    expect(file.targetPath).toBe("CLAUDE.md");
  });

  it("preserves Protected Slot markers", () => {
    const content = `# Title\n<!-- HELPERS:CUSTOM START -->\nCustom\n<!-- HELPERS:CUSTOM END -->\nFooter`;
    const source: ParsedFile = {
      sourcePath: "CLAUDE.md",
      content,
      body: content,
      extension: ".md",
    };

    const result = identity(source, ctx);
    const file = result as { content: string };
    expect(file.content).toContain("HELPERS:CUSTOM START");
    expect(file.content).toContain("Custom");
  });

  it("sets kind to Generated", () => {
    const source: ParsedFile = {
      sourcePath: "test.md",
      content: "test",
      body: "test",
      extension: ".md",
    };

    const result = identity(source, ctx);
    const file = result as { kind: string };
    expect(file.kind).toBe(FileKind.Generated);
  });
});
