/**
 * claude-to-copilot-prompt: Convert Claude command to Copilot prompt format.
 * commands/*.md → .github/prompts/*.prompt.md
 */

import { basename } from "pathe";
import { FileKind } from "../types/common.js";
import { injectHeader } from "../core/header.js";
import type { TransformerFn, ParsedFile, TransformContext, RenderedFile } from "./types.js";

const claudeToCopilotPrompt: TransformerFn = (
  source: ParsedFile,
  _ctx: TransformContext,
): RenderedFile => {
  const name = basename(source.sourcePath, source.extension);

  // Build Copilot prompt frontmatter
  const frontmatter = `---\nagent: ${name}\n---`;

  // Build body: original body (stripping Claude-specific frontmatter fields)
  const body = source.body;

  const rawContent = `${frontmatter}\n\n${body}`;
  const content = injectHeader(rawContent, source.sourcePath, source.extension);

  return {
    targetPath: `.github/prompts/${name}.prompt.md`,
    content,
    kind: FileKind.Generated,
    fromSource: source.sourcePath,
    transformer: "claude-to-copilot-prompt",
  };
};

export default claudeToCopilotPrompt;
