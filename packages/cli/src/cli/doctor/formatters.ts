import consola from "consola";
import Table from "cli-table3";
import type { DoctorResult, HealthCheck } from "./types.js";

const STATUS_ICON: Record<HealthCheck["status"], string> = {
  pass: "✓",
  warn: "⚠",
  fail: "✗",
  unknown: "?",
};

function statusLogLevel(status: HealthCheck["status"]): typeof consola.success {
  switch (status) {
    case "pass":
      return consola.success;
    case "warn":
      return consola.warn;
    case "fail":
      return consola.error;
    case "unknown":
      return consola.info;
  }
}

export function renderTable(result: DoctorResult): void {
  const table = new Table({
    head: ["Status", "Check", "Category", "Detail"],
    colWidths: [8, 30, 12, 60],
    wordWrap: true,
  });

  for (const check of result.checks) {
    table.push([STATUS_ICON[check.status], check.name, check.category, check.detail.replace(/\n/g, " ")]);
  }

  consola.log(table.toString());

  const { summary } = result;
  const parts: string[] = [];
  if (summary.pass > 0) parts.push(`${summary.pass} pass`);
  if (summary.warn > 0) parts.push(`${summary.warn} warn`);
  if (summary.fail > 0) parts.push(`${summary.fail} fail`);
  if (summary.unknown > 0) parts.push(`${summary.unknown} unknown`);

  consola.log("");
  if (summary.fail > 0) {
    consola.error(`Doctor: ${parts.join(", ")}`);
  } else if (summary.warn > 0) {
    consola.warn(`Doctor: ${parts.join(", ")}`);
  } else {
    consola.success(`Doctor: ${parts.join(", ")}`);
  }
}

export function renderJson(result: DoctorResult): void {
  console.log(JSON.stringify(result, null, 2));
}

export function renderQuiet(result: DoctorResult): void {
  const failures = result.checks.filter((c) => c.status === "fail");
  if (failures.length === 0) return;

  for (const check of failures) {
    const log = statusLogLevel(check.status);
    log(`${check.name}: ${check.detail}`);
  }
}
