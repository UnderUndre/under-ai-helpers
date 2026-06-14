import type { FileClass } from "./common.js";

/**
 * Root manifest schema loaded from helpers.config.ts via c12.
 */
export interface HelpersConfig {
  /** Schema version. Must be 1. */
  version: 1;
  /** Glob patterns for source files under .claude/ */
  sources: string[];
  /** Target name → pipeline configuration */
  targets: Record<string, TargetConfig>;
  /**
   * Pack membership mapping + marketplace metadata (feature 006).
   * Optional: when absent, the repo behaves as a flat template (no pack partitioning).
   * Schema source of truth: specs/006-ecosystem-parity/contracts/packs-config.schema.json
   */
  packs?: PacksConfig;
}

export interface TargetConfig {
  /** Ordered list of transformer pipelines */
  pipelines: TransformerPipeline[];
  /**
   * Whether this target consumes the open SKILL.md standard natively (feature 006).
   * When true, skills are delivered via the `identity` pipeline (no format conversion);
   * legacy conversion transformers MUST NOT match `.claude/skills/**` for this target.
   * Default: false. Verified via T002 empirical probe; evidence recorded in
   * docs/target-capabilities.md.
   */
  skillsNative?: boolean;
}

export interface TransformerPipeline {
  /** Built-in transformer name or path to custom .ts/.js file */
  transformer: string;
  /** Source glob to match (relative to .claude/) */
  match: string;
  /**
   * Output path template (relative to target project root).
   * Template variables: {{name}}, {{relativePath}}, {{ext}}
   */
  output: string;
  /** File class. Default: "core" */
  class?: FileClass;
}

/**
 * Pack partitioning + marketplace metadata (feature 006).
 *
 * A "pack" = a plugin in the Claude Code marketplace format (terminology per
 * spec.md §Context). Packs partition the curated catalog (agents, commands,
 * skills, hooks, presets) into domain-based installable units mirroring the
 * Agent Routing taxonomy (~6–8 packs).
 */
export interface PacksConfig {
  /** Marketplace metadata. Drives `.claude-plugin/marketplace.json` generation. */
  marketplace: MarketplaceConfig;
  /** Pack id → pack definition. Min 1 pack. */
  packs: Record<string, PackDefinition>;
}

export interface MarketplaceConfig {
  /** Marketplace name (lowercase kebab-case, per schema pattern `^[a-z][a-z0-9-]*$`). */
  name: string;
  /** Output directory for generated pack trees. Default: "packs". */
  outputDir?: string;
}

export interface PackDefinition {
  /** Human-readable description (≤200 chars per schema). */
  description: string;
  /** Semver version string (pattern `^\d+\.\d+\.\d+$`). */
  version: string;
  /** Agent basenames or globs (relative to `.claude/agents/`). */
  agents?: string[];
  /** Command basenames or globs (relative to `.claude/commands/`). */
  commands?: string[];
  /** Skill basenames or globs (relative to `.claude/skills/`). */
  skills?: string[];
  /** Hook filenames under `.claude/hooks/` carried by this pack (guards → devx-core). */
  hooks?: string[];
  /** Non-component files (presets/*.json, statusline.mjs) relative to repo root. */
  payload?: string[];
  /** Cross-pack dependency ids. Must form a DAG (validator invariant I5). */
  dependsOn?: string[];
}

