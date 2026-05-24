import { defineCommand } from "citty";
import consola from "consola";
import { spawn, execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "pathe";

import { CLIError } from "../cli.js";

const DEFAULT_MODEL = process.env.HERMES_DEFAULT_MODEL ?? "glm/glm-5.1";
const DEFAULT_PROVIDER = "custom";

async function resolvePrompt(
  args: Record<string, unknown>,
): Promise<{ source: string; text: string } | null> {
  if (typeof args.prompt === "string" && args.prompt.trim()) {
    return { source: "arg", text: args.prompt };
  }

  if (typeof args["from-file"] === "string") {
    const path = args["from-file"];
    try {
      const text = await readFile(path, "utf8");
      if (!text.trim()) {
        throw new CLIError(`File is empty: ${path}`, 1);
      }
      return { source: "file", text };
    } catch (err) {
      throw new CLIError(
        `Cannot read --from-file: ${path} — ${err instanceof Error ? err.message : String(err)}`,
        1,
      );
    }
  }

  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const text = Buffer.concat(chunks).toString("utf8").trim();
    if (text) {
      return { source: "stdin", text };
    }
  }

  return null;
}

function buildHermesArgs(args: Record<string, unknown>): string[] {
  const result: string[] = [];

  if (typeof args.model === "string") result.push("--model", args.model);
  if (typeof args.provider === "string")
    result.push("--provider", args.provider);
  if (typeof args.toolsets === "string")
    result.push("--toolsets", args.toolsets);
  if (args.verbose === true) result.push("--verbose");

  return result;
}

function findHermesBinary(): string | null {
  const isWin = process.platform === "win32";
  const candidates = isWin
    ? ["hermes.exe", "hermes.cmd", "hermes"]
    : ["hermes"];

  for (const cmd of candidates) {
    try {
      const whichCmd = isWin ? "where" : "which";
      execFileSync(whichCmd, [cmd], { stdio: "pipe" });
      return cmd;
    } catch {
      continue;
    }
  }
  return null;
}

async function spawnBackground(
  hermesBin: string,
  hermesArgs: string[],
  promptText: string,
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = resolve(`.hermes-output-${timestamp}.log`);

  // Open log file with sync API so we can pass the raw FD to child stdio.
  // Detached child inherits the FD; we do NOT close it in parent — kernel
  // ref-counts the open file description, so child keeps writing after
  // we lose our reference.
  const { openSync } = await import("node:fs");
  const logFd = openSync(logPath, "a");

  const child = spawn(hermesBin, ["-z", ...hermesArgs], {
    stdio: ["pipe", logFd, logFd],
    detached: true,
  });

  // Handle spawn-time errors (ENOENT, permission denied) explicitly.
  // Without this, an 'error' event becomes an unhandled exception.
  let spawnError: Error | null = null;
  child.on("error", (err) => {
    spawnError = err;
  });

  if (child.stdin) {
    child.stdin.write(promptText);
    child.stdin.end();
  }

  const pid = child.pid;
  // stdout is the machine-readable interface for piping (jq/awk) — keep console.log.
  console.log(`PID: ${pid}`);
  console.log(`Log: ${logPath}`);

  const earlyExit = await new Promise<number | null>((res) => {
    child.on("exit", (code) => res(code));
    setTimeout(() => res(null), 2000);
  });

  if (spawnError) {
    consola.error(
      `Failed to spawn hermes: ${(spawnError as Error).message}`,
    );
    process.exitCode = 1;
    return;
  }

  if (earlyExit !== null) {
    consola.error(
      `Hermes exited early with code ${earlyExit}. Check ${logPath}`,
    );
    process.exitCode = earlyExit;
    return;
  }

  child.unref();
  // Do NOT close logFd here — child still holds a reference via inherited stdio.
}

export { resolvePrompt, buildHermesArgs, findHermesBinary };

export default defineCommand({
  meta: {
    name: "hermes",
    description:
      "Wrap hermes binary with prompt forwarding, background mode, and flag passthrough",
  },
  args: {
    prompt: {
      type: "positional",
      description: "Prompt text (or use --from-file / stdin)",
      required: false,
    },
    "from-file": {
      type: "string",
      description: "Read prompt from file",
    },
    background: {
      type: "boolean",
      default: false,
      description: "Spawn hermes detached, redirect output to log file",
    },
    model: {
      type: "string",
      default: DEFAULT_MODEL,
      description:
        "Model override (default: glm/glm-5.1, env: HERMES_DEFAULT_MODEL)",
    },
    provider: {
      type: "string",
      default: DEFAULT_PROVIDER,
      description: "Provider override (default: custom)",
    },
    toolsets: {
      type: "string",
      description: "Comma-separated toolsets to pass to hermes",
    },
    verbose: {
      type: "boolean",
      default: false,
      description: "Pass --verbose to hermes",
    },
  },
  async run({ args }) {
    const hermesBin = findHermesBinary();
    if (!hermesBin) {
      consola.error(
        "Hermes binary not found on PATH. Install it first:\n  https://github.com/UnderUndre/hermes\nExiting with code 127.",
      );
      process.exitCode = 127;
      return;
    }

    const prompt = await resolvePrompt(args as Record<string, unknown>);
    if (!prompt && !args.background) {
      consola.error(
        "No prompt provided. Pass a positional argument, --from-file, or pipe stdin.",
      );
      process.exitCode = 1;
      return;
    }

    const hermesArgs = buildHermesArgs(args as Record<string, unknown>);

    if (args.background) {
      if (!prompt) {
        consola.error(
          "Background mode requires a prompt (arg, --from-file, or stdin).",
        );
        process.exitCode = 1;
        return;
      }
      await spawnBackground(hermesBin, hermesArgs, prompt.text);
      return;
    }

    const child = spawn(hermesBin, ["-z", ...hermesArgs], {
      stdio: ["pipe", "inherit", "inherit"],
    });

    child.on("error", (err) => {
      consola.error(`Failed to spawn hermes: ${err.message}`);
      process.exitCode = 1;
    });

    if (child.stdin) {
      child.stdin.write(prompt!.text);
      child.stdin.end();
    }

    const exitCode = await new Promise<number>((res) => {
      child.on("exit", (code) => res(code ?? 1));
    });
    process.exitCode = exitCode;
  },
});
