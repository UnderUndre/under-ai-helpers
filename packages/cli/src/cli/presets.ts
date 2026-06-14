/**
 * `helpers presets apply` command handler (feature 006 US3/US6).
 *
 * Merges shipped `presets/permissions.json` (allow/deny lists) and
 * `presets/statusline.mjs` into consumer `.claude/settings.json`.
 *
 * Per data-model.md §4 "Precedence rule" (hermes F2):
 *   guard hooks > deny preset > consumer allow
 * Overlap handling: emit WARNING (not block); never mutate consumer's allow.
 *
 * Idempotent: re-running on already-applied state = no-op.
 */

import { defineCommand } from "citty";
import consola from "consola";
import { resolve } from "pathe";
import { readFileSync, existsSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { guardMutatingCommand, releaseMutatingGuard } from "../cli.js";

export default defineCommand({
  meta: {
    name: "presets",
    description: "Apply permission + statusline presets to consumer .claude/settings.json",
  },
  args: {
    only: {
      type: "string",
      description: "Apply only: 'permissions' or 'statusline'. Default: both.",
    },
    "dry-run": {
      type: "boolean",
      default: false,
      description: "Print unified diff without writing.",
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const only = args.only as string | undefined;
    const dryRun = (args as Record<string, unknown>)["dry-run"] === true;
    let lockAcquired = false;

    try {
      if (!dryRun) {
        lockAcquired = await guardMutatingCommand(cwd, "presets");
      }

      const settingsPath = resolve(cwd, ".claude", "settings.json");
      const presetsDir = resolve(cwd, "presets");
      const changes: string[] = [];

      // Load existing settings (or empty)
      let settings: Record<string, unknown> = {};
      if (existsSync(settingsPath)) {
        settings = JSON.parse(readFileSync(settingsPath, "utf8"));
      }

      // ── Permissions preset ────────────────────────────────────────────────
      if (!only || only === "permissions") {
        const permPath = resolve(presetsDir, "permissions.json");
        if (existsSync(permPath)) {
          const preset = JSON.parse(readFileSync(permPath, "utf8"));
          settings = mergePermissions(settings, preset, changes);
        } else {
          consola.warn(`No presets/permissions.json found at ${permPath}`);
        }
      }

      // ── Statusline preset ─────────────────────────────────────────────────
      if (!only || only === "statusline") {
        const slPath = resolve(presetsDir, "statusline.mjs");
        if (existsSync(slPath)) {
          if (!settings.statusLine || args.only === "statusline") {
            settings.statusLine = {
              type: "command",
              command: 'node "$CLAUDE_PROJECT_DIR/.claude/statusline.mjs"',
            };
            // Copy the script
            const destScript = resolve(cwd, ".claude", "statusline.mjs");
            if (!dryRun) {
              mkdirSync(resolve(cwd, ".claude"), { recursive: true });
              copyFileSync(slPath, destScript);
            }
            changes.push("statusline: set + script copied to .claude/statusline.mjs");
          } else {
            changes.push("statusline: existing consumer statusline wins (skip)");
          }
        } else {
          consola.warn(`No presets/statusline.mjs found at ${slPath}`);
        }
      }

      // ── Write / dry-run ───────────────────────────────────────────────────
      if (dryRun) {
        consola.info("Dry-run — changes that would be applied:");
        for (const c of changes) consola.info(`  ${c}`);
        consola.info(`Settings preview:\n${JSON.stringify(settings, null, 2)}`);
      } else {
        mkdirSync(resolve(cwd, ".claude"), { recursive: true });
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
        consola.success(`Applied presets to ${settingsPath}`);
        for (const c of changes) consola.info(`  ${c}`);
      }
    } finally {
      await releaseMutatingGuard(cwd, lockAcquired);
    }
  },
});

/**
 * Merge allow/deny arrays. Consumer entries always preserved. Dedup.
 * Per hermes F2: emit WARNING on overlap between consumer allow and preset deny
 * (precedence: deny > allow at runtime via guard hooks).
 */
function mergePermissions(
  settings: Record<string, unknown>,
  preset: { allow?: string[]; deny?: string[] },
  changes: string[],
): Record<string, unknown> {
  const perms = (settings.permissions || {}) as { allow?: string[]; deny?: string[] };
  const consumerAllow = new Set(perms.allow || []);
  const consumerDeny = new Set(perms.deny || []);

  // Merge deny: add preset entries not already present
  const mergedDeny = new Set([...consumerDeny, ...(preset.deny || [])]);

  // Merge allow: add preset entries not already present
  const mergedAllow = new Set([...consumerAllow, ...(preset.allow || [])]);

  // Overlap check: consumer allow vs merged deny → WARNING (not block)
  const overlaps: string[] = [];
  for (const entry of mergedAllow) {
    if (mergedDeny.has(entry)) {
      overlaps.push(entry);
    }
  }
  if (overlaps.length > 0) {
    consola.warn(
      `${overlaps.length} consumer allow-rule(s) overlap with deny preset: ${overlaps.slice(0, 3).join(", ")}${overlaps.length > 3 ? ", …" : ""}. Precedence: deny > allow (data-model.md §4).`,
    );
  }

  if (mergedAllow.size !== consumerAllow.size) {
    changes.push(`permissions.allow: added ${mergedAllow.size - consumerAllow.size} entries (consumer entries preserved)`);
  }
  if (mergedDeny.size !== consumerDeny.size) {
    changes.push(`permissions.deny: added ${mergedDeny.size - consumerDeny.size} entries (consumer entries preserved)`);
  }

  settings.permissions = {
    allow: [...mergedAllow].sort(),
    deny: [...mergedDeny].sort(),
  };
  return settings;
}
