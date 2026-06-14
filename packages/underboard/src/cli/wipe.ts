import consola from "consola";
import { createDatabase } from "#storage/database.js";

export async function wipeMemory(): Promise<void> {
  const db = createDatabase();
  const result = db.prepare("DELETE FROM memory_entries").run();
  db.prepare("DELETE FROM memory_fts").run();
  consola.success(`Wiped ${result.changes} memory entries`);
  db.close();
}
