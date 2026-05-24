import { execFileSync } from "node:child_process";
import os from "node:os";
import type { HealthCheck } from "../types.js";

function extractVersion(output: string): string {
  const match = output.match(/(\d+\.\d+\.\d+)/);
  return match?.[1] ?? "unknown";
}

export async function checkNodeVersion(): Promise<HealthCheck> {
  const version = process.version.replace("v", "");
  const major = parseInt(version.split(".")[0] ?? "0", 10);
  const pass = major >= 20;
  return {
    name: "system.node-version",
    category: "system",
    status: pass ? "pass" : "fail",
    detail: `Node.js v${version}${pass ? "" : " (requires >=20.x)"}`,
    critical: true,
  };
}

export async function checkNpmVersion(): Promise<HealthCheck> {
  try {
    const output = execFileSync("npm", ["--version"], { encoding: "utf8" }).trim();
    return {
      name: "system.npm-version",
      category: "system",
      status: "pass",
      detail: `npm v${extractVersion(output)}`,
      critical: false,
    };
  } catch {
    return {
      name: "system.npm-version",
      category: "system",
      status: "warn",
      detail: "npm not found",
      critical: false,
    };
  }
}

export async function checkGitVersion(): Promise<HealthCheck> {
  try {
    const output = execFileSync("git", ["--version"], { encoding: "utf8" }).trim();
    return {
      name: "system.git-version",
      category: "system",
      status: "pass",
      detail: output,
      critical: false,
    };
  } catch {
    return {
      name: "system.git-version",
      category: "system",
      status: "warn",
      detail: "git not found",
      critical: false,
    };
  }
}

export async function checkOSInfo(): Promise<HealthCheck> {
  return {
    name: "system.os",
    category: "system",
    status: "pass",
    detail: `${process.platform} ${process.arch} ${os.release()}`,
    critical: false,
  };
}
