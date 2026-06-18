import fs from "node:fs";
import consola from "consola";
import { createDatabase } from "#storage/database.js";

export async function exportData(outputPath: string): Promise<void> {
  const db = createDatabase();
  const data = {
    exported_at: new Date().toISOString(),
    version: "0.1.0",
    projects: db.prepare("SELECT * FROM projects").all(),
    tasks: db.prepare("SELECT * FROM tasks").all(),
    memory_entries: db.prepare("SELECT id, project_id, content, tags, provenance, content_hash, created_at FROM memory_entries").all(),
    activity_log: db.prepare("SELECT * FROM activity_log").all(),
  };
  db.close();

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  consola.success(`Exported to ${outputPath}`);
}

