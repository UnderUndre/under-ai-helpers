/**
 * claude-to-gemini-command: Wrap Claude command markdown in TOML prompt format.
 * commands/*.md → .gemini/commands/*.toml
 */

import { basename } from "pathe";
import { FileKind } from "../types/common.js";
import { injectHeader } from "../core/header.js";
import type { TransformerFn, ParsedFile, TransformContext, RenderedFile } from "./types.js";

const claudeToGeminiCommand: TransformerFn = (
  source: ParsedFile,
  _ctx: TransformContext,
): RenderedFile => {
  const name = basename(source.sourcePath, source.extension);
  const description = (source.frontmatter?.description as string) ?? name;

  // Embed the full original content (including frontmatter) in TOML prompt string
  const tomlContent = `description = ${JSON.stringify(description)}\n\nprompt = """\n${source.content}\n"""`;
  const content = injectHeader(tomlContent, source.sourcePath, ".toml");

  return {
    targetPath: `.gemini/commands/${name}.toml`,
    content,
    kind: FileKind.Generated,
    fromSource: source.sourcePath,
    transformer: "claude-to-gemini-command",
  };
};

export default claudeToGeminiCommand;
