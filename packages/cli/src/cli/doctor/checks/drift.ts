import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "pathe";
import type { HealthCheck } from "../types.js";

export async function checkDrift(): Promise<HealthCheck> {
  const root = process.cwd();

  try {
    const binPath = join(
      dirname(dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))),
      "bin",
      "helpers.mjs",
    );

    execFileSync(process.execPath, [binPath, "status", "--strict"], {
      cwd: root,
      encoding: "utf8",
      timeout: 15000,
      stdio: "pipe",
    });

    return {
      name: "drift.status",
      category: "drift",
      status: "pass",
      detail: "No drift detected",
      critical: true,
    };
  } catch (e: unknown) {
    const err = e as { status?: number; stderr?: string; stdout?: string };
    const output = (err.stderr ?? err.stdout ?? "").trim().slice(0, 200);
    return {
      name: "drift.status",
      category: "drift",
      status: "fail",
      detail: `Drift detected${output ? `: ${output}` : ""}`,
      critical: true,
    };
  }
}
