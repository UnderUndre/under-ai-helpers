/**
 * Pack loader (feature 006).
 *
 * Wraps the existing `loadManifest` (c12-based) with pack-specific resolution:
 * expands pack-component globs into concrete `PackComponent[]`, validates
 * that referenced files exist, and builds the `CapabilityMatrix` from the
 * loaded config.
 *
 * Spec: specs/006-ecosystem-parity/contracts/packs-config.schema.json +
 * data-model.md §1.
 *
 * Usage:
 *   const result = await loadPacks(repoRoot);
 *   if (result.packs.length === 0) {
 *     // repo behaves as flat template (no pack partitioning).
 *   }
 */

import { resolve, relative, basename, extname } from "node:path";
import { readdirSync, statSync, existsSync } from "node:fs";
import type { PackDefinition } from "../../types/config.js";
import { loadManifest } from "../manifest.js";
import { matchGlob } from "../glob.js";
import {
  type Pack,
  type PackComponent,
  type PackComponentType,
  type PackResolutionResult,
  PACK_COMPONENT_TYPES,
  deriveCapabilityMatrix,
} from "./types.js";

/**
 * Load helpers.config.{ts,js,json} and resolve the `packs` section into
 * `Pack[]`. Returns an empty `packs` array when the repo doesn't use pack
 * partitioning (legacy flat-template mode).
 */
export async function loadPacks(
  sourceDir: string,
  overridePath?: string,
): Promise<PackResolutionResult> {
  const config = await loadManifest(sourceDir, overridePath);
  const warnings: string[] = [];

  if (!config.packs) {
    return {
      packs: [],
      capabilityMatrix: deriveCapabilityMatrix(config),
      marketplace: null,
      config,
      warnings,
    };
  }

  const marketplace = config.packs.marketplace;
  const packs: Pack[] = [];

  for (const [id, definition] of Object.entries(config.packs.packs)) {
    const resolved = resolvePack(id, definition, sourceDir, warnings);
    packs.push(resolved);
  }

  return {
    packs,
    capabilityMatrix: deriveCapabilityMatrix(config),
    marketplace,
    config,
    warnings,
  };
}

/**
 * Resolve a single `PackDefinition` into a `Pack` by expanding component
 * globs against the source tree.
 *
 * Globs are interpreted as documented in `contracts/packs-config.schema.json`:
 * agents/commands/skills/hooks are relative to `.claude/<type>/`; payload
 * is relative to repo root. Missing matches emit warnings (non-blocking),
 * matching the dev-mode validator behavior (T004 / hermes.md F7).
 */
function resolvePack(
  id: string,
  definition: PackDefinition,
  sourceDir: string,
  warnings: string[],
): Pack {
  const components: Record<PackComponentType, PackComponent[]> = {
    agents: [],
    commands: [],
    skills: [],
    hooks: [],
    payload: [],
  };

  for (const type of PACK_COMPONENT_TYPES) {
    const globs = definition[type];
    if (!globs || globs.length === 0) continue;
    const isPayload = type === "payload";
    const baseDir = isPayload
      ? sourceDir
      : resolve(sourceDir, ".claude", type);
    if (!existsSync(baseDir)) {
      warnings.push(
        `pack '${id}' ${type}: base dir ${baseDir} does not exist; skipping`,
      );
      continue;
    }
    for (const pattern of globs) {
      const matches = collectGlobMatches(baseDir, pattern);
      if (matches.length === 0) {
        warnings.push(
          `pack '${id}' ${type} glob '${pattern}' matched 0 files under ${baseDir}`,
        );
      }
      for (const abs of matches) {
        const rel = isPayload
          ? relative(sourceDir, abs)
          : relative(resolve(sourceDir, ".claude"), abs);
        components[type].push({
          type,
          source: abs,
          relativePath: rel,
          name: basenameWithoutExt(abs),
        });
      }
    }
  }

  const componentCount = PACK_COMPONENT_TYPES.reduce(
    (sum, t) => sum + components[t].length,
    0,
  );

  if (componentCount === 0) {
    warnings.push(
      `pack '${id}' resolved 0 components — likely a config typo or all globs miss`,
    );
  }

  return { id, definition, components, componentCount };
}

/**
 * Walk `baseDir` recursively and return all file paths matching `pattern`
 * (interpreted by `core/glob.ts#matchGlob`, which is repo-standard).
 *
 * Patterns are applied against the path relative to `baseDir` using forward
 * slashes (pathe-style normalization) so configs work cross-platform.
 */
function collectGlobMatches(baseDir: string, pattern: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // permission / missing — skip silently
    }
    for (const entry of entries) {
      const abs = resolve(dir, entry);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        // Skip node_modules and .git when scanning repo root (payload only).
        if (entry === "node_modules" || entry === ".git") continue;
        walk(abs);
      } else if (st.isFile()) {
        const rel = relative(baseDir, abs).split("\\").join("/");
        if (matchGlob(pattern, rel)) {
          out.push(abs);
        }
      }
    }
  };
  walk(baseDir);
  return out.sort();
}

function basenameWithoutExt(absPath: string): string {
  const b = basename(absPath);
  const ext = extname(b);
  return ext ? b.slice(0, -ext.length) : b;
}
