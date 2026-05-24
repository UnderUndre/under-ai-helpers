/**
 * claude-to-copilot-instructions: Convert Claude agent to Copilot instructions.
 * agents/*.md → .github/instructions/*.instructions.md
 */

import { basename } from "pathe";
import { FileKind } from "../types/common.js";
import { injectHeader } from "../core/header.js";
import type { TransformerFn, ParsedFile, TransformContext, RenderedFile } from "./types.js";

const claudeToCopilotInstructions: TransformerFn = (
  source: ParsedFile,
  _ctx: TransformContext,
): RenderedFile => {
  const name = basename(source.sourcePath, source.extension);

  // Keep description as leading paragraph, strip other Claude frontmatter
  const description = source.frontmatter?.description as string | undefined;
  const leadParagraph = description ? `${description}\n\n` : "";

  const rawContent = `${leadParagraph}${source.body}`;
  const content = injectHeader(rawContent, source.sourcePath, source.extension);

  return {
    targetPath: `.github/instructions/${name}.instructions.md`,
    content,
    kind: FileKind.Generated,
    fromSource: source.sourcePath,
    transformer: "claude-to-copilot-instructions",
  };
};

export default claudeToCopilotInstructions;
