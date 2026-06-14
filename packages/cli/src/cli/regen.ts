/**
 * `helpers regen` command handler.
 *
 * In-place pipeline execution: reads `helpers.config.ts` from cwd, discovers
 * source files from cwd, runs all transformer pipelines, and writes outputs
 * back into cwd. Unlike `init`, there is NO network fetch and NO lockfile —
 * cwd itself IS the source of truth.
 *
 * Intended for upstream template repos (like UnderUndre/ai) that maintain
 * generated outputs alongside sources and need to refresh them after editing
 * the `.claude/` tree. Downstream consumer repos should use `sync` instead.
 *
 * Safety:
 *   - Refuses to run if no `helpers.config.ts` is found in cwd.
 *   - Uses the same staging + journal infrastructure as init/sync — if the
 *     process is killed mid-write, `helpers recover` can resume or rollback.
 *   - Protected Slots (`<!-- HELPERS:CUSTOM -->`) in existing managed files
 *     are preserved during regeneration.
 */

import { defineCommand } from "citty";
import consola from "consola";
import { readdir, readFile, access } from "node:fs/promises";
import { join, relative } from "pathe";

import { ExitCode } from "../types/common.js";
import type { RenderedFile } from "../transformers/types.js";
import { loadManifest } from "../core/manifest.js";
import { preloadAllTransformers, getTransformer } from "../transformers/registry.js";
import { parseSourceFile } from "../core/parse.js";
import { matchGlob, resolveOutputPath } from "../core/glob.js";
import { parseSlots, mergeSlots } from "../core/slots.js";
import {
  createStagingDir,
  stageFile,
  commitStaged,
  cleanStaging,
} from "../core/staging.js";
import {
  createJournal,
  writeJournal,
  markOperationDone,
  deleteJournal,
} from "../core/journal.js";
import { guardMutatingCommand, releaseMutatingGuard } from "../cli.js";
import { loadPacks } from "../core/packs/loader.js";
import { assemble } from "../core/packs/assemble.js";

export default defineCommand({
  meta: {
    name: "regen",
    description:
      "Regenerate downstream targets in-place from the local helpers.config.ts (upstream-template repos only — no network fetch, no lockfile)",
  },
  args: {
    targets: {
      type: "string",
      description:
        "Comma-separated target names to regenerate. Defaults to ALL targets defined in helpers.config.ts",
    },
    "source-config": {
      type: "string",
      description: "Path override for helpers.config.ts (default: cwd)",
    },
    "trust-custom": {
      type: "boolean",
      default: false,
      description: "Pre-approve custom transformers",
    },
    "no-pack-validation": {
      type: "boolean",
      default: false,
      description:
        "Skip pack validator entirely (feature 006 dev-ergonomics per hermes.md F7). For incremental authoring; never use in CI/release.",
    },
    "pack-validation-mode": {
      type: "string",
      default: "ERROR",
      description:
        "Pack validator severity threshold: ERROR (CI/release gate, default) or WARNING (local dev surfaces issues without failing).",
    },
    "skip-packs": {
      type: "boolean",
      default: false,
      description:
        "Skip pack tree + marketplace.json assembly even if helpers.config.ts#packs is defined. Use when iterating on .claude/ content without touching pack layout.",
    },
  },
  async run({ args }) {
    const root = process.cwd();
    const dryRun = (args as Record<string, unknown>)["dry-run"] === true;
    let lockAcquired = false;

    try {
      if (!dryRun) {
        lockAcquired = await guardMutatingCommand(root, "regen");
      }

      // 1. Verify we're in an upstream-template repo (has helpers.config.ts).
      const manifestPath = args["source-config"] ?? join(root, "helpers.config.ts");
      try {
        await access(manifestPath);
      } catch {
        consola.error(
          "No helpers.config.ts found in cwd. `regen` is for upstream-template repos " +
            "that maintain generated outputs alongside sources. Downstream consumer " +
            "projects should use `sync` or `init` instead.",
        );
        process.exitCode = ExitCode.UsageError;
        return;
      }

      // 2. Load manifest from cwd directly (no giget fetch).
      const manifest = await loadManifest(root, args["source-config"]);
      const availableTargets = Object.keys(manifest.targets);
      consola.success(
        `Loaded manifest: ${manifest.sources.length} source patterns, ${availableTargets.length} targets (${availableTargets.join(", ")})`,
      );

      // 3. Resolve active targets (default: ALL targets).
      const requestedTargets = args.targets
        ? args.targets.split(",").map((t: string) => t.trim())
        : availableTargets;
      for (const t of requestedTargets) {
        if (!manifest.targets[t]) {
          consola.error(
            `Unknown target: "${t}". Available: ${availableTargets.join(", ")}`,
          );
          process.exitCode = ExitCode.UsageError;
          return;
        }
      }

      // 4. Preload transformers for the selected targets.
      await preloadAllTransformers(manifest, requestedTargets);

      // 5. Discover source files from cwd.
      const sourceFiles = await discoverSourceFiles(root, manifest.sources);
      consola.info(`Found ${sourceFiles.length} source files`);

      // 6. Parse source files.
      const parsedFiles = await Promise.all(
        sourceFiles.map(async (relPath) => {
          const content = await readFile(join(root, relPath), "utf8");
          return parseSourceFile(relPath, content);
        }),
      );

      // 7. Run transformer pipelines.
      const allRendered: RenderedFile[] = [];
      const ctx = {
        sourceCommit: "local",
        toolVersion: "0.1.0",
        targetName: "",
        config: manifest,
        allParsedFiles: parsedFiles,
      };

      for (const targetName of requestedTargets) {
        const target = manifest.targets[targetName]!;
        ctx.targetName = targetName;

        for (const pipeline of target.pipelines) {
          const transformer = getTransformer(pipeline.transformer);

          for (const parsed of parsedFiles) {
            if (!matchGlob(pipeline.match, parsed.sourcePath)) continue;

            const result = transformer(parsed, ctx);
            if (!result) continue;

            const files = Array.isArray(result) ? result : [result];
            for (const file of files) {
              file.targetPath = resolveOutputPath(pipeline.output, parsed.sourcePath, pipeline.match);
              allRendered.push(file);
            }
          }
        }
      }

      consola.info(
        `Generated ${allRendered.length} files across ${requestedTargets.length} targets`,
      );

      // 8. Dry run — preview only.
      if (dryRun) {
        consola.box("DRY RUN — no files written");
        for (const file of allRendered) {
          consola.log(
            `  ${file.targetPath} (from: ${file.fromSource}, via: ${file.transformer})`,
          );
        }
        return;
      }

      // 9. Stage and commit via journal (same atomicity as init/sync).
      const stagingDir = await createStagingDir(root);
      const operations = allRendered.map((file, idx) => ({
        id: idx,
        op: "write" as const,
        path: file.targetPath,
      }));

      const journal = createJournal(root, "regen", operations, "");
      await writeJournal(root, journal);

      for (let i = 0; i < allRendered.length; i++) {
        const file = allRendered[i]!;

        // Preserve Protected Slot content if the target already exists.
        try {
          await access(join(root, file.targetPath));
          if (file.transformer === "identity") {
            const existing = await readFile(join(root, file.targetPath), "utf8");
            const ext = file.targetPath.match(/\.[^.]+$/)?.[0] ?? ".md";
            const existingSlots = parseSlots(existing, ext);
            if (existingSlots.length > 0) {
              file.content = mergeSlots(file.content, existingSlots, ext);
            }
          }
        } catch {
          // Target doesn't exist yet — no slots to preserve
        }

        const stagedPath = await stageFile(stagingDir, file.content, file.targetPath);
        const journalOp = journal.operations.find((op) => op.id === i);
        if (journalOp) {
          journalOp.stagedPath = stagedPath;
          await writeJournal(root, journal);
        }

        await commitStaged(stagedPath, join(root, file.targetPath));
        await markOperationDone(root, journal, i);
      }

      await deleteJournal(root);
      await cleanStaging(root);

      // Feature 006: pack tree + marketplace.json assembly.
      // Runs after target pipeline commits so a pack-assembly failure
      // doesn't leave target outputs half-written. Pack assembly uses its
      // own staging (separate outputDir, full overwrite via rmSync).
      let packSummary: string | null = null;
      if (!args["skip-packs"]) {
        packSummary = await tryAssemblePacks(root, args);
      } else {
        consola.info("Skipping pack assembly (--skip-packs).");
      }

      const tail = packSummary ? ` ${packSummary}` : "";
      consola.success(
        `Regenerated ${allRendered.length} files across ${requestedTargets.length} target(s). No lockfile written (upstream-in-place).${tail}`,
      );
    } finally {
      await releaseMutatingGuard(root, lockAcquired);
    }
  },
});

/**
 * Recursively discover files matching source glob patterns under `baseDir`.
 * Same logic as init.ts — duplicated to keep regen self-contained without
 * tempting a premature extraction.
 */
async function discoverSourceFiles(
  baseDir: string,
  patterns: string[],
): Promise<string[]> {
  const allFiles: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip common output/VCS dirs we never want to treat as sources.
        if (shouldSkipDir(entry.name)) continue;
        await walk(fullPath);
      } else {
        const relPath = relative(baseDir, fullPath);
        if (patterns.some((p) => matchGlob(p, relPath))) {
          allFiles.push(relPath);
        }
      }
    }
  }

  await walk(baseDir);
  return allFiles.sort();
}

/**
 * Skip paths that can't possibly be sources and would just slow the walk.
 * Kept minimal — the real filter is the glob match against `manifest.sources`.
 */
function shouldSkipDir(name: string): boolean {
  return (
    name === "node_modules" ||
    name === ".git" ||
    name === "dist" ||
    name === "build" ||
    name === ".helpers"
  );
}

/**
 * Feature 006: load packs from helpers.config.ts and assemble the pack tree
 * + marketplace.json. Returns a one-line summary string for the success
 * message, or null if no packs section is defined.
 *
 * Validation mode comes from the --pack-validation-mode arg (default ERROR).
 * --no-pack-validation skips validation entirely (dev flag per hermes.md F7).
 * On validation errors, throws (caller surfaces as failure).
 */
async function tryAssemblePacks(
  root: string,
  args: Record<string, unknown>,
): Promise<string | null> {
  const result = await loadPacks(root, args["source-config"] as string | undefined);
  if (result.packs.length === 0) {
    return null; // no packs section in config — legacy flat-template mode
  }

  for (const w of result.warnings) {
    consola.warn(`[packs] ${w}`);
  }

  const mode = (args["pack-validation-mode"] as "ERROR" | "WARNING") ?? "ERROR";
  const skip = (args["no-pack-validation"] as boolean) === true;
  const ownerName = (result.marketplace?.name ?? "UnderUndre").replace(/^@/, "");

  const assembleResult = assemble(result, {
    sourceDir: root,
    ownerName,
    validation: { mode, skip },
    clean: true,
  });

  for (const w of assembleResult.warnings) {
    consola.warn(`[packs] ${w}`);
  }

  return `Assembled ${assembleResult.packs.length} pack(s) → ${assembleResult.outputDir} (+ ${assembleResult.marketplacePath}).`;
}
