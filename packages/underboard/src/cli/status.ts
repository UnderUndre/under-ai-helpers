import consola from "consola";

export async function showStatus(): Promise<void> {
  try {
    const { loadConfig } = await import("./config.js");
    const config = await loadConfig();
    const res = await fetch(`http://127.0.0.1:${config.port}/health`, {
      headers: { Authorization: `Bearer ${await getToken()}` },
    });
    const health = await res.json();
    consola.info("Underboard Status:");
    consola.info(`  Uptime: ${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m`);
    consola.info(`  Tasks: ${health.total_tasks}`);
    consola.info(`  Memory entries: ${health.total_memory_entries}`);
    consola.info(`  Embedding model: ${health.embedding_model_status}`);
    consola.info(`  DB size: ${(health.db_size_bytes / 1024 / 1024).toFixed(1)}MB`);
    consola.info(`  Clients: ${health.clients?.length ?? 0}`);
  } catch {
    consola.error("Underboard service is not running");
  }
}

async function getToken(): Promise<string> {
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const os = await import("node:os");
  const tokenPath = path.join(os.homedir(), ".underboard", "token");
  return (await fs.readFile(tokenPath, "utf-8")).trim();
}

