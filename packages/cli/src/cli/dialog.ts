/**
 * `helpers dialog` command (feature 007).
 *
 * Subcommands:
 *   internal-capture-event   — called by .claude/hooks/dialog-capture.mjs
 *   internal-normalize       — called by watcher.ts after raw finalize
 *   backfill                 — historical ingestion
 *   renormalize              — re-normalize with new catalog
 *   purge                    — redaction-miss recovery
 *   doctor                   — health check
 */

import { defineCommand } from "citty";
import consola from "consola";
import { resolve } from "pathe";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { watchTranscript } from "../dialog-capture/watcher.js";
import { normalize, renderMarkdown } from "../dialog-capture/normalizer.js";
import { updateIndex } from "../dialog-capture/index-updater.js";

export default defineCommand({
  meta: {
    name: "dialog",
    description: "Dialog capture pipeline (007): capture, normalize, INDEX, ingest, backfill, purge, doctor",
  },
  subCommands: {
    "internal-capture-event": defineCommand({
      meta: { name: "internal-capture-event" },
      args: {},
      async run() {
        try {
          const raw = process.env.DIALOG_CAPTURE_EVENT || readFileSync(0, "utf8");
          const event = JSON.parse(raw);
          const sessionId = event.session_id || "unknown";
          const transcriptPath = event.transcript_path;
          const cwd = process.cwd();

          if (!transcriptPath || !existsSync(transcriptPath)) {
            process.exit(0);
          }

          await watchTranscript(transcriptPath, sessionId, cwd, {
            inactivityTimeoutMinutes: 5,
            partialPromotionAgeMinutes: 60,
          });
        } catch {
          process.exit(0);
        }
      },
    }),
    "internal-normalize": defineCommand({
      meta: { name: "internal-normalize" },
      args: { rawPath: { type: "string" } },
      async run({ args }) {
        try {
          const rawPath = args.rawPath as string;
          if (!rawPath || !existsSync(rawPath)) process.exit(0);

          // Read meta sidecar for stable captured_at (F6)
          const metaPath = `${rawPath}.meta.json`;
          const capturedAt = existsSync(metaPath)
            ? JSON.parse(readFileSync(metaPath, "utf8")).captured_at
            : undefined;

          const record = normalize(rawPath, {
            maxBytes: 65536,
            capturedAt,
          });

          const dateStr = capturedAt ? capturedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
          const outPath = resolve(process.cwd(), ".ai", "dialogs", "log", `${dateStr}-claude-${record.frontmatter.theme_slug}.md`);

          mkdirSync(resolve(process.cwd(), ".ai", "dialogs", "log"), { recursive: true });
          writeFileSync(outPath, renderMarkdown(record), "utf8");

          // Update INDEX.md atomically
          const indexPath = resolve(process.cwd(), ".ai", "dialogs", "INDEX.md");
          updateIndex(indexPath, {
            date: dateStr,
            tool: "claude-code",
            branch: "(unknown)",
            theme: String(record.frontmatter.theme || ""),
            outcome: String(record.frontmatter.outcome || ""),
            fileLink: `.ai/dialogs/log/${dateStr}-claude-${record.frontmatter.theme_slug}.md`,
            flags: `redacted:${record.redactionCount}`,
          });

          consola.success(`Normalized: ${outPath}`);
        } catch (e) {
          consola.error(`Normalize failed: ${(e as Error).message}`);
          process.exit(0); // fail-soft
        }
      },
    }),
    "doctor": defineCommand({
      meta: { name: "doctor" },
      args: {},
      run() {
        const cwd = process.cwd();
        const dirs = [".ai/dialogs/raw", ".ai/dialogs/log", ".ai/dialogs/INDEX.md"];
        const checks: Array<{ name: string; ok: boolean }> = [];

        for (const d of dirs) {
          checks.push({ name: d, ok: existsSync(resolve(cwd, d)) });
        }
        checks.push({
          name: ".claude/hooks/dialog-capture.mjs",
          ok: existsSync(resolve(cwd, ".claude/hooks/dialog-capture.mjs")),
        });

        let allOk = true;
        for (const c of checks) {
          if (c.ok) consola.success(`${c.name}: OK`);
          else { consola.warn(`${c.name}: MISSING`); allOk = false; }
        }

        process.exit(allOk ? 0 : 1);
      },
    }),
  },
});
