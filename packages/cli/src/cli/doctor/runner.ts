import type { HealthCheck, DoctorResult } from "./types.js";

export type CheckRunner = () => Promise<HealthCheck>;

const runners: CheckRunner[] = [];

export function registerCheck(runner: CheckRunner): void {
  runners.push(runner);
}

export function clearChecks(): void {
  runners.length = 0;
}

export async function runAllChecks(): Promise<DoctorResult> {
  const checks = await Promise.all(runners.map((r) => r()));
  const summary = { pass: 0, warn: 0, fail: 0, unknown: 0 };
  let hasCriticalFail = false;

  for (const check of checks) {
    summary[check.status]++;
    if (check.critical && check.status === "fail") {
      hasCriticalFail = true;
    }
  }

  return { checks, summary, exitCode: hasCriticalFail ? 1 : 0 };
}
