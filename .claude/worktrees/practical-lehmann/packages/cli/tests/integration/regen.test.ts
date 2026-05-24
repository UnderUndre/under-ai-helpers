/**
 * Integration test for `helpers regen` — in-place regeneration without fetch.
 *
 * Strategy: copy the fixture source-repo into a tmp dir, create the CLI
 * input args, invoke the command handler directly, then assert on the
 * files that landed in that tmp dir (including downstream targets).
 *
 * No network, no giget — regen runs against cwd directly, which is exactly
 * what we test.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, access, cp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import regenCmd from "../../src/cli/regen.js";

const FIXTURE_DIR = join(import.meta.dirname, "../fixtures/source-repo");

describe("regen command", () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "clai-regen-"));
    // Copy fixture .claude/ into tmp dir
    await cp(join(FIXTURE_DIR, ".claude"), join(tempDir, ".claude"), { recursive: true });
    // Move CLAUDE.md to repo root — this matches real upstream layouts where
    // CLAUDE.md sits at project root and `.claude/` holds commands/agents.
    const claudeMd = await readFile(join(tempDir, ".claude/CLAUDE.md"), "utf8");
    await writeFile(join(tempDir, "CLAUDE.md"), claudeMd, "utf8");
    await rm(join(tempDir, ".claude/CLAUDE.md"));
    // Write the manifest directly into `helpers.config.ts` as a plain
    // object literal. We deliberately do NOT write a sibling
    // `helpers.config.json` — c12's default resolution order prefers the
    // `.ts` file (loaded via jiti), so two config files in the same dir
    // led to an earlier CI failure where the `.ts` stub (empty
    // `export {}`) shadowed the real `.json` manifest on Linux jiti but
    // not on Windows. Single source of truth eliminates the footgun.
    //
    // Plain object + no import of `defineHelpersConfig` from
    // `clai-helpers`: the tmp dir has no node_modules linking to the CLI
    // package, so an import would fail. `defineHelpersConfig` is a pure
    // identity helper — safe to skip here.
    const manifestSource = `export default ${JSON.stringify(
      {
        version: 1,
        sources: [
          ".claude/commands/**/*.md",
          ".claude/agents/**/*.md",
          "CLAUDE.md",
        ],
        targets: {
          claude: {
            pipelines: [
              { transformer: "identity", match: ".claude/**/*", output: "{{relativePath}}" },
              { transformer: "identity", match: "CLAUDE.md", output: "CLAUDE.md", class: "core" },
            ],
          },
          copilot: {
            pipelines: [
              { transformer: "claude-to-copilot-prompt", match: ".claude/commands/**/*.md", output: ".github/prompts/{{name}}.prompt.md" },
              { transformer: "claude-to-copilot-instructions", match: ".claude/agents/**/*.md", output: ".github/instructions/{{name}}.instructions.md" },
              { transformer: "claude-to-copilot-root-instructions", match: "CLAUDE.md", output: ".github/copilot-instructions.md" },
            ],
          },
          gemini: {
            pipelines: [
              { transformer: "claude-to-gemini-command", match: ".claude/commands/**/*.md", output: ".gemini/commands/{{name}}.toml" },
              { transformer: "claude-to-gemini-agent", match: ".claude/agents/**/*.md", output: ".gemini/agents/{{name}}.md" },
              { transformer: "claude-to-gemini-root", match: "CLAUDE.md", output: "GEMINI.md" },
            ],
          },
        },
      },
      null,
      2,
    )};\n`;
    await writeFile(join(tempDir, "helpers.config.ts"), manifestSource, "utf8");
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  async function exists(relPath: string): Promise<boolean> {
    try {
      await access(join(tempDir, relPath));
      return true;
    } catch {
      return false;
    }
  }

  async function read(relPath: string): Promise<string> {
    return await readFile(join(tempDir, relPath), "utf8");
  }

  it("refuses to run when helpers.config.ts is absent", async () => {
    // Remove the manifest so the guard triggers
    await rm(join(tempDir, "helpers.config.ts"));
    process.chdir(tempDir);

    const cmd = regenCmd as unknown as {
      run: (ctx: { args: Record<string, unknown> }) => Promise<void>;
    };

    await cmd.run({ args: {} });
    // Exit code set by the command
    expect(process.exitCode).not.toBe(0);
    // And no outputs were produced (.github/, .gemini/, GEMINI.md shouldn't exist)
    expect(await exists(".github/prompts/commit.prompt.md")).toBe(false);
    expect(await exists("GEMINI.md")).toBe(false);

    // Reset exit code for other tests
    process.exitCode = 0;
  });

  it("generates outputs in-place when manifest is present (all targets)", async () => {
    process.chdir(tempDir);

    const cmd = regenCmd as unknown as {
      run: (ctx: { args: Record<string, unknown> }) => Promise<void>;
    };

    await cmd.run({ args: {} });

    // Claude target — identity copies .claude/ as-is
    expect(await exists(".claude/commands/commit.md")).toBe(true);
    expect(await exists(".claude/agents/debugger.md")).toBe(true);
    expect(await exists("CLAUDE.md")).toBe(true);

    // Copilot target
    expect(await exists(".github/prompts/commit.prompt.md")).toBe(true);
    expect(await exists(".github/instructions/debugger.instructions.md")).toBe(true);
    expect(await exists(".github/copilot-instructions.md")).toBe(true);

    // Gemini target
    expect(await exists(".gemini/commands/commit.toml")).toBe(true);
    expect(await exists(".gemini/agents/debugger.md")).toBe(true);
    expect(await exists("GEMINI.md")).toBe(true);

    // No lockfile — `regen` is lockfile-free by design
    expect(await exists("helpers-lock.json")).toBe(false);
  });

  it("respects --targets to regenerate a subset", async () => {
    process.chdir(tempDir);

    const cmd = regenCmd as unknown as {
      run: (ctx: { args: Record<string, unknown> }) => Promise<void>;
    };

    await cmd.run({ args: { targets: "copilot" } });

    // Copilot is produced
    expect(await exists(".github/prompts/commit.prompt.md")).toBe(true);
    // Gemini is NOT produced (we only asked for copilot)
    expect(await exists(".gemini/commands/commit.toml")).toBe(false);
    expect(await exists("GEMINI.md")).toBe(false);
  });

  it("rejects unknown target names", async () => {
    process.chdir(tempDir);

    const cmd = regenCmd as unknown as {
      run: (ctx: { args: Record<string, unknown> }) => Promise<void>;
    };

    await cmd.run({ args: { targets: "copilot,cursor" } });

    expect(process.exitCode).not.toBe(0);
    // Nothing should have been written because validation failed up front
    expect(await exists(".github/prompts/commit.prompt.md")).toBe(false);

    process.exitCode = 0;
  });

  it("preserves Protected Slot content in existing managed files", async () => {
    process.chdir(tempDir);

    const cmd = regenCmd as unknown as {
      run: (ctx: { args: Record<string, unknown> }) => Promise<void>;
    };

    // First pass: generate outputs (CLAUDE.md among them)
    await cmd.run({ args: { targets: "claude" } });
    expect(await exists("CLAUDE.md")).toBe(true);

    // User adds a Protected Slot to the generated file
    const originalClaude = await read("CLAUDE.md");
    const withSlot = originalClaude.replace(
      /(<!-- HELPERS:CUSTOM START -->)([\s\S]*?)(<!-- HELPERS:CUSTOM END -->)/,
      "$1\nLOCAL_OVERRIDE_MARKER\n$3",
    );
    await writeFile(join(tempDir, "CLAUDE.md"), withSlot, "utf8");

    // Second pass: regen should preserve the slot body
    await cmd.run({ args: { targets: "claude" } });
    const afterRegen = await read("CLAUDE.md");
    expect(afterRegen).toContain("LOCAL_OVERRIDE_MARKER");
  });

  it("does not produce helpers-lock.json", async () => {
    process.chdir(tempDir);

    const cmd = regenCmd as unknown as {
      run: (ctx: { args: Record<string, unknown> }) => Promise<void>;
    };

    await cmd.run({ args: {} });
    expect(await exists("helpers-lock.json")).toBe(false);
  });
});
