/**
 * Pack domain types (feature 006).
 *
 * Config-level types live in `types/config.ts` (PackDefinition, PacksConfig,
 * MarketplaceConfig). This file extends those with resolved-domain types
 * produced by the loader/validator/assembler: a `Pack` is a `PackDefinition`
 * whose glob references have been expanded to concrete file paths and whose
 * cross-pack dependencies have been resolved.
 *
 * Spec: specs/006-ecosystem-parity/data-model.md §1 (Pack), §6 (Target
 * capability matrix).
 */

import type {
  PackDefinition,
  PacksConfig,
  MarketplaceConfig,
  HelpersConfig,
  TargetConfig,
} from "../../types/config.js";

/**
 * Component type discriminator. Matches the keys of `PackDefinition` minus
 * metadata fields (description, version, dependsOn).
 */
export type PackComponentType =
  | "agents"
  | "commands"
  | "skills"
  | "hooks"
  | "payload";

/** Ordered list used by validators that iterate per-type. */
export const PACK_COMPONENT_TYPES: readonly PackComponentType[] = [
  "agents",
  "commands",
  "skills",
  "hooks",
  "payload",
] as const;

/**
 * Single resolved component reference inside a pack.
 *
 * `source` is the absolute path inside the source `.claude/` tree (or repo
 * root for `payload`); `relativePath` is the same path relative to the source
 * root, which is what the assembler writes into the pack tree.
 */
export interface PackComponent {
  /** Discriminator. */
  type: PackComponentType;
  /** Absolute path inside the source repo. */
  source: string;
  /** Repo-relative path (used as the in-pack path by the assembler). */
  relativePath: string;
  /** Component basename without extension (e.g., `backend-specialist`). */
  name: string;
}

/**
 * Resolved pack: a `PackDefinition` whose globs have been expanded and whose
 * `dependsOn` references have been type-checked against sibling pack ids.
 */
export interface Pack {
  /** Pack id (key in `PacksConfig.packs`). */
  id: string;
  /** Original definition from `helpers.config.ts#packs`. */
  definition: PackDefinition;
  /** Resolved components, grouped by type for assembler convenience. */
  components: Record<PackComponentType, PackComponent[]>;
  /** Total component count (sum across all types). */
  componentCount: number;
}

/**
 * Per-target capability record. Source of truth: `docs/target-capabilities.md`.
 * Drives whether `identity` or a conversion transformer applies to skills
 * for a given target (spec FR-010, SC-005 revised).
 */
export interface CapabilityMatrixEntry {
  /** Target name (key in `HelpersConfig.targets`). */
  target: string;
  /** Whether the target consumes SKILL.md natively. */
  skillsNative: boolean;
  /** Probe status from docs/target-capabilities.md. */
  verificationStatus: "verified" | "deferred" | "non-native";
  /** Path to the target's native skills dir relative to consumer repo root, or null if non-native. */
  nativeSkillsDir: string | null;
  /** Free-form evidence (probe date, source URL, local dir inspected). */
  evidence: string;
}

/** All known target capability entries. */
export type CapabilityMatrix = Record<string, CapabilityMatrixEntry>;

/**
 * Build a CapabilityMatrix from a loaded `HelpersConfig`.
 *
 * Reads `targets.<name>.skillsNative` flags and merges with documented
 * evidence. Targets without an explicit flag default to `skillsNative: false`
 * (safe default — conversion retained until probed otherwise).
 */
export function deriveCapabilityMatrix(config: HelpersConfig): CapabilityMatrix {
  const matrix: CapabilityMatrix = {};
  for (const [name, target] of Object.entries(config.targets)) {
    matrix[name] = capabilityEntryFor(name, target);
  }
  return matrix;
}

function capabilityEntryFor(
  name: string,
  target: TargetConfig,
): CapabilityMatrixEntry {
  const native = target.skillsNative === true;
  // docs/target-capabilities.md is the empirical record; this function
  // trusts whatever the config declares and tags verificationStatus by name.
  // Real verification lives in docs/target-capabilities.md (T002 deliverable).
  const knownVerified: Record<string, boolean> = {
    claude: true,
    agent: true, // Antigravity
  };
  const knownNonNative: Record<string, boolean> = {
    copilot: true,
  };
  let status: CapabilityMatrixEntry["verificationStatus"];
  if (knownVerified[name]) {
    status = "verified";
  } else if (knownNonNative[name]) {
    status = "non-native";
  } else {
    status = "deferred";
  }
  return {
    target: name,
    skillsNative: native,
    verificationStatus: status,
    nativeSkillsDir: native ? nativeSkillsDirFor(name) : null,
    evidence: `config flag + docs/target-capabilities.md §${name}`,
  };
}

function nativeSkillsDirFor(targetName: string): string | null {
  switch (targetName) {
    case "claude":
      return ".claude/skills";
    case "agent":
      return ".agent/skills";
    case "codex":
      return ".agents/skills"; // tentative — V2 deferred
    case "gemini":
      return ".gemini/skills"; // tentative — V2 deferred
    default:
      return null;
  }
}

/**
 * Result of resolving all packs from a config. Returned by the loader
 * (`loader.ts`); consumed by the validator (`validate.ts`) and assembler
 * (`assemble.ts`).
 */
export interface PackResolutionResult {
  /** All packs, indexed by id. Empty if `config.packs` is absent. */
  packs: Pack[];
  /** Capability matrix derived from the config. */
  capabilityMatrix: CapabilityMatrix;
  /** Marketplace config (null if `config.packs` is absent). */
  marketplace: MarketplaceConfig | null;
  /** Source config, retained for downstream tools (e.g., drift detection). */
  config: HelpersConfig;
  /** Warnings emitted during resolution (non-blocking). */
  warnings: string[];
}

/** Re-exports for convenience. */
export type { PackDefinition, PacksConfig, MarketplaceConfig };
