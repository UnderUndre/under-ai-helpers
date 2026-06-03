import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import consola from "consola";

const PID_FILE = path.join(os.homedir(), ".underboard", "underboard.pid");

export async function stopService(): Promise<void> {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
    process.kill(pid, "SIGTERM");
    fs.unlinkSync(PID_FILE);
    consola.success(`Stopped underboard (PID ${pid})`);
  } catch {
    consola.error("No running underboard service found");
  }
}
