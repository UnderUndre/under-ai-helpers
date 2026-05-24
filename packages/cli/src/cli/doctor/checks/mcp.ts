import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "pathe";
import type { HealthCheck } from "../types.js";

const MCP_TIMEOUT_MS = 3000;

interface McpServerDef {
  name: string;
  command: string;
  args: string[];
}

const DEFAULT_SERVERS: McpServerDef[] = [
  { name: "context7", command: "npx", args: ["-y", "@upstreamapi/context7"] },
  { name: "filesystem", command: "npx", args: ["-y", "@anthropic/mcp-filesystem"] },
  { name: "github", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
  { name: "sequential-thinking", command: "npx", args: ["-y", "@anthropic/mcp-sequential-thinking"] },
];

interface McpConfig {
  mcpServers?: Record<string, { command: string; args?: string[] }>;
}

async function loadServerDefs(root: string): Promise<McpServerDef[]> {
  try {
    const raw = await readFile(join(root, "mcp.json"), "utf8");
    const config: McpConfig = JSON.parse(raw);
    if (config.mcpServers && typeof config.mcpServers === "object") {
      return Object.entries(config.mcpServers).map(([name, def]) => ({
        name,
        command: def.command,
        args: def.args ?? [],
      }));
    }
  } catch {
    // mcp.json not found or invalid — use defaults
  }
  return DEFAULT_SERVERS;
}

function probeServer(def: McpServerDef): Promise<HealthCheck> {
  return new Promise<HealthCheck>((resolve) => {
    let settled = false;
    const finish = (check: HealthCheck) => {
      if (settled) return;
      settled = true;
      resolve(check);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish({
        name: `mcp.${def.name}`,
        category: "mcp",
        status: "fail",
        detail: `${def.name}: timed out after ${MCP_TIMEOUT_MS}ms`,
        critical: false,
      });
    }, MCP_TIMEOUT_MS);

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(def.command, [...def.args, "--stdio"], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch {
      clearTimeout(timer);
      finish({
        name: `mcp.${def.name}`,
        category: "mcp",
        status: "unknown",
        detail: `${def.name}: failed to spawn (${def.command})`,
        critical: false,
      });
      return;
    }

    child.on("error", (err) => {
      clearTimeout(timer);
      finish({
        name: `mcp.${def.name}`,
        category: "mcp",
        status: "unknown",
        detail: `${def.name}: ${err.message}`,
        critical: false,
      });
    });

    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (!settled && stdout.includes('"result"')) {
        clearTimeout(timer);
        try {
          child.kill();
        } catch {
          // already exited
        }
        finish({
          name: `mcp.${def.name}`,
          category: "mcp",
          status: "pass",
          detail: `${def.name}: reachable`,
          critical: false,
        });
      }
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      if (stdout.includes('"result"')) {
        finish({
          name: `mcp.${def.name}`,
          category: "mcp",
          status: "pass",
          detail: `${def.name}: reachable`,
          critical: false,
        });
      } else {
        finish({
          name: `mcp.${def.name}`,
          category: "mcp",
          status: code === 0 ? "unknown" : "fail",
          detail: `${def.name}: exited with code ${code}${stderr ? ` (${stderr.trim().slice(0, 80)})` : ""}`,
          critical: false,
        });
      }
    });

    const initRequest = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "clai-helpers-doctor", version: "0.1.0" },
      },
    });

    try {
      child.stdin?.write(initRequest + "\n");
    } catch {
      clearTimeout(timer);
      finish({
        name: `mcp.${def.name}`,
        category: "mcp",
        status: "fail",
        detail: `${def.name}: failed to write to stdin`,
        critical: false,
      });
    }
  });
}

export async function checkMcpServers(): Promise<HealthCheck> {
  const root = process.cwd();
  const defs = await loadServerDefs(root);

  if (defs.length === 0) {
    return {
      name: "mcp.servers",
      category: "mcp",
      status: "unknown",
      detail: "No MCP servers configured",
      critical: false,
    };
  }

  const results = await Promise.all(defs.map(probeServer));

  const passCount = results.filter((r) => r.status === "pass").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const unknownCount = results.filter((r) => r.status === "unknown").length;

  const lines = results.map((r) => `  ${r.status.padEnd(7)} ${r.detail}`).join("\n");

  return {
    name: "mcp.servers",
    category: "mcp",
    status: failCount > 0 ? "fail" : unknownCount > 0 ? "unknown" : "pass",
    detail: `${passCount}/${defs.length} reachable\n${lines}`,
    critical: false,
  };
}
