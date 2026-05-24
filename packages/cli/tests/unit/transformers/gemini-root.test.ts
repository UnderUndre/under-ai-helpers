import { describe, it, expect } from "vitest";
import claudeToGeminiRoot from "../../../src/transformers/claude-to-gemini-root.js";
import { parseSourceFile } from "../../../src/core/parse.js";
import type { TransformContext, ParsedFile } from "../../../src/transformers/types.js";

function makeCtx(parsedFiles: ParsedFile[] = []): TransformContext {
  return {
    sourceCommit: "abc123",
    toolVersion: "test",
    targetName: "gemini",
    config: { version: 1, sources: [], targets: {} },
    allParsedFiles: parsedFiles,
  };
}

function makeClaude(): ParsedFile {
  return parseSourceFile("CLAUDE.md", "# Claude Instructions\n\nWhatever.\n");
}

describe("claude-to-gemini-root compose", () => {
  it("produces minimal valid GEMINI.md when no auxiliary sources are present", () => {
    const ctx = makeCtx([makeClaude()]);
    const result = claudeToGeminiRoot(makeClaude(), ctx);

    expect(result).not.toBeNull();
    const r = Array.isArray(result) ? result[0]! : result!;
    expect(r.targetPath).toBe("GEMINI.md");
    expect(r.content).toContain("# GEMINI Instructions");
    expect(r.content).not.toContain("## CATCHPHRASES");
    expect(r.content).not.toContain("## AI Coding Standards");
    expect(r.fromSource).toBe("CLAUDE.md");
    expect(r.transformer).toBe("claude-to-gemini-root");
  });

  it("composes CATCHPHRASES section when persona/phrases file is present", () => {
    const phrases = parseSourceFile(
      ".github/instructions/persona/phrases/copilot-instructions.md",
      '# AI_CATCHPHRASES.prompt.md\n\n- "Адовъ говнокод!" — test phrase.\n',
    );
    const ctx = makeCtx([makeClaude(), phrases]);
    const result = claudeToGeminiRoot(makeClaude(), ctx);

    const r = Array.isArray(result) ? result[0]! : result!;
    expect(r.content).toContain("## CATCHPHRASES");
    expect(r.content).toContain('"Адовъ говнокод!"');
    // Body's own H1 is stripped — we don't want a stray `# AI_CATCHPHRASES.prompt.md`
    // floating under our `## CATCHPHRASES` header.
    expect(r.content).not.toContain("# AI_CATCHPHRASES.prompt.md");
  });

  it("composes AI Coding Standards section when coding file is present", () => {
    const coding = parseSourceFile(
      ".github/instructions/coding/copilot-instructions.md",
      "# AI_CODING_prompt.md\n\n## 1. Instruction Priority\n\nMUST rules.\n",
    );
    const ctx = makeCtx([makeClaude(), coding]);
    const result = claudeToGeminiRoot(makeClaude(), ctx);

    const r = Array.isArray(result) ? result[0]! : result!;
    expect(r.content).toContain("## AI Coding Standards & Engineering Guide");
    expect(r.content).toContain("MUST rules");
    expect(r.content).not.toContain("# AI_CODING_prompt.md");
  });

  it("EXCLUDES project overview even when a project file is present in sources", () => {
    const project = parseSourceFile(
      ".github/instructions/project/copilot-instructions.md",
      "# Project: UnderUndre AI Helpers\n\nMonorepo with two products.\n",
    );
    const phrases = parseSourceFile(
      ".github/instructions/persona/phrases/copilot-instructions.md",
      '# phrases\n\n"Метнулся." — test.\n',
    );
    const ctx = makeCtx([makeClaude(), project, phrases]);
    const result = claudeToGeminiRoot(makeClaude(), ctx);

    const r = Array.isArray(result) ? result[0]! : result!;
    expect(r.content).toContain('"Метнулся."');
    expect(r.content).not.toContain("Project: UnderUndre");
    expect(r.content).not.toContain("Monorepo with two products");
  });

  it("rewrites .claude/ references to .gemini/ inside composed body", () => {
    const coding = parseSourceFile(
      ".github/instructions/coding/copilot-instructions.md",
      "# coding\n\nSee `.claude/agents/debugger.md` and `.claude/commands/commit.md`.\n",
    );
    const ctx = makeCtx([makeClaude(), coding]);
    const result = claudeToGeminiRoot(makeClaude(), ctx);

    const r = Array.isArray(result) ? result[0]! : result!;
    expect(r.content).toContain(".gemini/agents/debugger.md");
    expect(r.content).toContain(".gemini/commands/commit.toml");
    expect(r.content).not.toContain(".claude/agents/debugger.md");
    expect(r.content).not.toContain(".claude/commands/commit.md");
  });

  it("strips Protected Slot markers and their content from composed body", () => {
    const coding = parseSourceFile(
      ".github/instructions/coding/copilot-instructions.md",
      `# coding\n\nBefore slot.\n\n<!-- HELPERS:CUSTOM START -->\nSecret local content.\n<!-- HELPERS:CUSTOM END -->\n\nAfter slot.\n`,
    );
    const ctx = makeCtx([makeClaude(), coding]);
    const result = claudeToGeminiRoot(makeClaude(), ctx);

    const r = Array.isArray(result) ? result[0]! : result!;
    expect(r.content).toContain("Before slot.");
    expect(r.content).toContain("After slot.");
    expect(r.content).not.toContain("HELPERS:CUSTOM");
    expect(r.content).not.toContain("Secret local content");
  });

  it("produces both sections in intended order (phrases first, coding second)", () => {
    const phrases = parseSourceFile(
      ".github/instructions/persona/phrases/copilot-instructions.md",
      "# phrases\n\nPHRASES_BODY\n",
    );
    const coding = parseSourceFile(
      ".github/instructions/coding/copilot-instructions.md",
      "# coding\n\nCODING_BODY\n",
    );
    const ctx = makeCtx([makeClaude(), phrases, coding]);
    const result = claudeToGeminiRoot(makeClaude(), ctx);

    const r = Array.isArray(result) ? result[0]! : result!;
    const phrasesIdx = r.content.indexOf("PHRASES_BODY");
    const codingIdx = r.content.indexOf("CODING_BODY");
    expect(phrasesIdx).toBeGreaterThan(-1);
    expect(codingIdx).toBeGreaterThan(-1);
    expect(phrasesIdx).toBeLessThan(codingIdx);
  });

  it("demotes inner headings so they nest under the outer ## section", () => {
    const coding = parseSourceFile(
      ".github/instructions/coding/copilot-instructions.md",
      "# coding\n\n## Metadata\n\nmeta.\n\n## 1. Priority\n\n### Sub\n\nsub body\n",
    );
    const ctx = makeCtx([makeClaude(), coding]);
    const result = claudeToGeminiRoot(makeClaude(), ctx);

    const r = Array.isArray(result) ? result[0]! : result!;
    // Outer section header stays ##
    expect(r.content).toContain("## AI Coding Standards & Engineering Guide");
    // Inner headings demoted: ## → ###, ### → ####
    expect(r.content).toContain("### Metadata");
    expect(r.content).toContain("### 1. Priority");
    expect(r.content).toContain("#### Sub");
    // Old (undemoted) forms must not appear at outline positions that conflict
    // with the outer section. We check by ensuring there's no line exactly
    // equal to "## Metadata" or "## 1. Priority" in the output.
    const lines = r.content.split("\n");
    expect(lines).not.toContain("## Metadata");
    expect(lines).not.toContain("## 1. Priority");
  });

  it("does NOT demote headings inside fenced code blocks", () => {
    const coding = parseSourceFile(
      ".github/instructions/coding/copilot-instructions.md",
      "# coding\n\n## Real heading\n\n```markdown\n## Example heading (in code)\n```\n",
    );
    const ctx = makeCtx([makeClaude(), coding]);
    const result = claudeToGeminiRoot(makeClaude(), ctx);

    const r = Array.isArray(result) ? result[0]! : result!;
    expect(r.content).toContain("### Real heading");
    // The example inside the fence stays at its original level
    expect(r.content).toContain("## Example heading (in code)");
  });

  it("handles missing allParsedFiles gracefully (no composition, still produces file)", () => {
    const ctx = {
      sourceCommit: "abc123",
      toolVersion: "test",
      targetName: "gemini",
      config: { version: 1, sources: [], targets: {} },
      // allParsedFiles intentionally undefined — old-style callers
    };
    const result = claudeToGeminiRoot(makeClaude(), ctx as TransformContext);

    const r = Array.isArray(result) ? result[0]! : result!;
    expect(r.content).toContain("# GEMINI Instructions");
  });
});
