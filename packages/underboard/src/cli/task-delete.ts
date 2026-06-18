import consola from "consola";
import { loadConfig } from "./config.js";

export async function deleteTask(id: string): Promise<void> {
  const config = await loadConfig();
  const token = await getToken();
  const res = await fetch(`http://127.0.0.1:${config.port}/api/tasks/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await res.json();
  if (result.deleted) {
    consola.success(`Deleted task ${id}`);
  } else {
    consola.error(`Task ${id} not found`);
  }
}

async function getToken(): Promise<string> {
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const os = await import("node:os");
  const tokenPath = path.join(os.homedir(), ".underboard", "token");
  return (await fs.readFile(tokenPath, "utf-8")).trim();
}

