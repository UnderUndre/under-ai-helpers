import { execFileSync } from "node:child_process";
import type { HealthCheck } from "../types.js";

function extractVersion(output: string): string {
  const match = output.match(/(\d+\.\d+\.\d+)/);
  return match?.[1] ?? "unknown";
}

export async function checkGhCli(): Promise<HealthCheck> {
  try {
    const versionOutput = execFileSync("gh", ["--version"], { encoding: "utf8" }).trim();
    const version = extractVersion(versionOutput);

    let authStatus = "unknown";
    try {
      execFileSync("gh", ["auth", "status"], { encoding: "utf8", stdio: "pipe" });
      authStatus = "authenticated";
    } catch (e: unknown) {
      const err = e as { stderr?: string };
      if (err.stderr && err.stderr.includes("Logged in")) {
        authStatus = "authenticated";
      } else {
        authStatus = "not authenticated";
      }
    }

    const authOk = authStatus === "authenticated";
    return {
      name: "tools.gh-cli",
      category: "tools",
      status: authOk ? "pass" : "warn",
      detail: `gh v${version} (${authStatus})`,
      critical: false,
    };
  } catch {
    return {
      name: "tools.gh-cli",
      category: "tools",
      status: "warn",
      detail: "gh CLI not found on PATH",
      critical: false,
    };
  }
}

export async function checkHermesBinary(): Promise<HealthCheck> {
  const binary = process.platform === "win32" ? "hermes.exe" : "hermes";
  try {
    const output = execFileSync(binary, ["--version"], { encoding: "utf8" }).trim();
    const version = extractVersion(output);
    return {
      name: "tools.hermes",
      category: "tools",
      status: "pass",
      detail: `hermes v${version}`,
      critical: false,
    };
  } catch {
    return {
      name: "tools.hermes",
      category: "tools",
      status: "warn",
      detail: "hermes binary not found on PATH",
      critical: false,
    };
  }
}
