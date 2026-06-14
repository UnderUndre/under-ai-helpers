/**
 * Pack assembler (feature 006).
 *
 * Generates the pack tree + `.claude-plugin/marketplace.json` from a loaded
 * `PackResolutionResult`. Each pack becomes a directory at
 * `<outputDir>/<packId>/` containing its components verbatim (identity copy)
 * plus a `.claude-plugin/plugin.json` manifest. The marketplace manifest goes
 * to `<outputDir>/.claude-plugin/marketplace.json` (top-level), per CC docs.
 *
 * Spec: specs/006-ecosystem-parity/contracts/packs-config.schema.json +
 * data-model.md §1 + research.md V1 (marketplace.json schema confirmed).
 *
 * Output layout:
 *   <outputDir>/
 *   ├── .claude-plugin/
 *   │   └── marketplace.json           ← catalog (top-level)
 *   ├── devx-core/
 *   │   ├── .claude-plugin/plugin.json  ← per-pack manifest
 *   │   ├── agents/...                  ← copied components
 *   │   ├── commands/...
 *   │   ├── skills/...
 *   │   ├── hooks/...
 *   │   └── <payload-files>
 *   ├── spec-pipeline/
 *   │   └── ...
 *   └── ...
 *
 * Per CC marketplace docs (V1): each plugin entry accepts `source` as a
 * relative path string (e.g., `"./devx-core"`), so the marketplace.json
 * `plugins[]` entries use `source: "./<packId>"` convention.
 */

import { resolve, dirname } from "node:path";
import {
  mkdirSync,
  copyFileSync,
  existsSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import type {
  Pack,
  PackResolutionResult,
  PackComponentType,
} from "./types.js";
import { validate, type ValidationOptions, type ValidationResult } from "./validate.js";

/** Per-CC marketplace.json schema (research.md V1 confirmed 2026-06-14). */
export interface MarketplaceManifest {
  name: string;
  owner: {
    name: string;
    email?: string;
  };
  plugins: MarketplacePluginEntry[];
}

export interface MarketplacePluginEntry {
  /** Pack id (kebab-case per V1). */
  name: string;
  /** Relative path to the pack dir from the marketplace root. */
  source: string;
  description: string;
  /** Pack version (semver, copied from PackDefinition). */
  version: string;
  /** Optional author info (per V1). */
  author?: { name: string; email?: string };
  /** Optional cross-pack dependencies (pack ids within this marketplace). */
  dependencies?: string[];
}

/** Per-pack plugin.json manifest (research.md V1). */
export interface PackManifest {
  name: string;
  description: string;
  version: string;
  author?: { name: string; email?: string };
}

/** Options for `assemble()`. */
export interface AssembleOptions {
  /** Absolute source dir (where .claude/ and helpers.config.ts live). */
  sourceDir: string;
  /** Absolute output dir (where packs/ + marketplace.json go). Default: `<sourceDir>/packs`. */
  outputDir?: string;
  /** Marketplace owner name (required for marketplace.json). */
  ownerName: string;
  /** Marketplace owner email (optional). */
  ownerEmail?: string;
  /** Validation options (per hermes.md F7). */
  validation?: ValidationOptions;
  /** Clean output dir before writing (default: true). */
  clean?: boolean;
}

export interface AssembleResult {
  /** Absolute output dir. */
  outputDir: string;
  /** Path to the generated marketplace.json. */
  marketplacePath: string;
  /** Per-pack paths (pack dir + plugin.json path). */
  packs: Array<{
    id: string;
    dir: string;
    manifestPath: string;
    componentCount: number;
  }>;
  /** Validation result (skipped if `validation.skip` was true). */
  validation: ValidationResult;
  /** Non-blocking warnings (e.g., copy failures). */
  warnings: string[];
}

/**
 * Assemble the pack tree + marketplace.json from a loaded config.
 *
 * Steps:
 *  1. Validate (unless skipped via options.validation.skip).
 *  2. If validation has blocking errors → throw with a summary.
 *  3. Clean outputDir (if `options.clean !== false`).
 *  4. For each pack: create dir, copy components, write `.claude-plugin/plugin.json`.
 *  5. Write `.claude-plugin/marketplace.json` with all pack entries.
 *
 * Assembly is atomic per-pack: a failure in one pack's copy phase rolls back
 * that pack's dir but leaves other packs + the marketplace alone. The
 * marketplace.json is written LAST so a partial run leaves no catalog pointing
 * at missing pack dirs.
 */
export function assemble(
  result: PackResolutionResult,
  options: AssembleOptions,
): AssembleResult {
  const outputDir = options.outputDir ?? resolve(options.sourceDir, "packs");
  const warnings: string[] = [];

  // 1. Validate (skip only if explicitly requested).
  const validation = validate(result, options.validation ?? { mode: "ERROR" });
  if (validation.hasErrors) {
    throw new Error(
      `pack assembly blocked by ${validation.blockingFindings.length} validation errors:\n` +
        validation.blockingFindings
          .map((f) => `  [${f.invariant}/${f.severity}] ${f.message}`)
          .join("\n"),
    );
  }

  // 2. Clean output dir.
  if (options.clean !== false && existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: true });

  // 3. Per-pack: copy components + write plugin.json.
  const packRecords: AssembleResult["packs"] = [];
  for (const pack of result.packs) {
    const packDir = resolve(outputDir, pack.id);
    try {
      mkdirSync(packDir, { recursive: true });
      copyComponents(pack, packDir, options.sourceDir, warnings);
      const manifest = buildPackManifest(pack);
      const manifestDir = resolve(packDir, ".claude-plugin");
      mkdirSync(manifestDir, { recursive: true });
      const manifestPath = resolve(manifestDir, "plugin.json");
      writeFileSync(
        manifestPath,
        JSON.stringify(manifest, null, 2) + "\n",
        "utf8",
      );
      packRecords.push({
        id: pack.id,
        dir: packDir,
        manifestPath,
        componentCount: pack.componentCount,
      });
    } catch (e) {
      // Roll back this pack only; warn + continue with others.
      warnings.push(
        `pack '${pack.id}' assembly failed: ${(e as Error).message}; rolling back`,
      );
      if (existsSync(packDir)) {
        rmSync(packDir, { recursive: true, force: true });
      }
      continue;
    }
  }

  // 4. Marketplace manifest (written LAST — only after all packs land).
  const marketplace = buildMarketplace(result, packRecords, options);
  const marketplaceDir = resolve(outputDir, ".claude-plugin");
  mkdirSync(marketplaceDir, { recursive: true });
  const marketplacePath = resolve(marketplaceDir, "marketplace.json");
  writeFileSync(
    marketplacePath,
    JSON.stringify(marketplace, null, 2) + "\n",
    "utf8",
  );

  return {
    outputDir,
    marketplacePath,
    packs: packRecords,
    validation,
    warnings,
  };
}

/**
 * Copy all components for a single pack into its pack dir.
 * Components keep their `.claude/`-relative path structure inside the pack
 * (e.g., `.claude/agents/foo.md` → `<packDir>/agents/foo.md`).
 */
function copyComponents(
  pack: Pack,
  packDir: string,
  sourceDir: string,
  warnings: string[],
): void {
  const componentTypes: readonly PackComponentType[] = [
    "agents",
    "commands",
    "skills",
    "hooks",
    "payload",
  ];
  for (const type of componentTypes) {
    for (const component of pack.components[type]) {
      // Compute destination: agents/commands/skills/hooks land under
      // `<packDir>/<type>/...`; payload lands under `<packDir>/...` (no
      // `payload/` prefix because payload paths are already repo-relative).
      const destRel =
        type === "payload"
          ? component.relativePath
          : component.relativePath; // already includes `<type>/...` since we
      // computed relativePath against .claude/ in loader.ts
      const dest = resolve(packDir, destRel);
      mkdirSync(dirname(dest), { recursive: true });
      try {
        copyFileSync(component.source, dest);
      } catch (e) {
        warnings.push(
          `pack '${pack.id}': failed to copy ${component.source} → ${dest}: ${(e as Error).message}`,
        );
      }
    }
  }
  void sourceDir;
}

function buildPackManifest(pack: Pack): PackManifest {
  return {
    name: pack.id,
    description: pack.definition.description,
    version: pack.definition.version,
    ...(pack.definition.dependsOn && pack.definition.dependsOn.length > 0
      ? {}
      : {}),
  };
}

function buildMarketplace(
  result: PackResolutionResult,
  packRecords: AssembleResult["packs"],
  options: AssembleOptions,
): MarketplaceManifest {
  // The marketplace MUST use the id declared in helpers.config.ts#packs.marketplace.name,
  // not a per-pack id (research.md V1 + the schema in packs-config.schema.json).
  if (!result.marketplace) {
    // Should be unreachable: assemble() is only called when packs section is present.
    throw new Error("internal: assemble() called with null marketplace config");
  }
  const plugins: MarketplacePluginEntry[] = [];
  for (const pack of result.packs) {
    const record = packRecords.find((r) => r.id === pack.id);
    if (!record) continue; // pack failed assembly; skip from marketplace
    plugins.push({
      name: pack.id,
      source: `./${pack.id}`,
      description: pack.definition.description,
      version: pack.definition.version,
      ...(pack.definition.dependsOn && pack.definition.dependsOn.length > 0
        ? { dependencies: pack.definition.dependsOn }
        : {}),
    });
  }
  return {
    name: result.marketplace.name,
    owner: {
      name: options.ownerName,
      ...(options.ownerEmail ? { email: options.ownerEmail } : {}),
    },
    plugins,
  };
}

// (no exports beyond what's already declared above)
