/**
 * Public API entry point for clai-helpers.
 * Exports types and utilities for programmatic use and custom transformer authoring.
 */

// Config helper
export { defineHelpersConfig } from "./core/manifest.js";

// Types
export type {
  HelpersConfig,
  TargetConfig,
  TransformerPipeline,
} from "./types/config.js";
export type {
  TransformerFn,
  ParsedFile,
  RenderedFile,
  TransformContext,
} from "./transformers/types.js";

// Enums
export { FileKind, FileClass, FileStatus, ExitCode } from "./types/common.js";
