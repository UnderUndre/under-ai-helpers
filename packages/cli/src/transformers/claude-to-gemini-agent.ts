/**
 * claude-to-gemini-agent: Convert Claude agent to Gemini agent format.
 * agents/*.md → .gemini/agents/*.md
 * Strips tools/model/skills, keeps name+description.
 */

import { basename } from "pathe";
import { FileKind } from "../types/common.js";
import { injectHeader } from "../core/header.js";
import type { TransformerFn, ParsedFile, TransformContext, RenderedFile } from "./types.js";

const claudeToGeminiAgent: TransformerFn = (
  source: ParsedFile,
  _ctx: TransformContext,
): RenderedFile => {
  const name = basename(source.sourcePath, source.extension);

  // Build Gemini frontmatter: keep name and description only
  const fm = source.frontmatter ?? {};
  const geminiName = (fm.name as string) ?? name;
  const description = (fm.description as string) ?? "";

  const frontmatter = `---\nname: ${geminiName}\ndescription: ${description}\n---`;
  const rawContent = `${frontmatter}\n\n${source.body}`;
  const content = injectHeader(rawContent, source.sourcePath, ".md");

  return {
    targetPath: `.gemini/agents/${name}.md`,
    content,
    kind: FileKind.Generated,
    fromSource: source.sourcePath,
    transformer: "claude-to-gemini-agent",
  };
};

export default claudeToGeminiAgent;
