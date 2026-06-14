import fs from "node:fs";
import consola from "consola";
import { createDatabase } from "#storage/database.ts";
import { upsertProject } from "#storage/project-store.ts";
import type { ProjectInfo } from "#project/detector.ts";

export async function importData(inputPath: string): Promise<void> {
  const raw = fs.readFileSync(inputPath, "utf-8");
  const data = JSON.parse(raw);
  const db = createDatabase();

  const insertProject = db.prepare(
    "INSERT OR IGNORE INTO projects (id, stable_key, display_name, root_path, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)"
  );

  let imported = 0;

  for (const project of data.projects ?? []) {
    insertProject.run(project.id, project.stable_key, project.display_name, project.root_path, project.first_seen, project.last_seen);
    imported++;
  }

  const insertTask = db.prepare(
    "INSERT OR IGNORE INTO tasks (id, project_id, title, description, status, assignee, dependency_ids, notes, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );

  for (const task of data.tasks ?? []) {
    insertTask.run(task.id, task.project_id, task.title, task.description, task.status, task.assignee, task.dependency_ids, task.notes, task.archived, task.created_at, task.updated_at);
    imported++;
  }

  const insertMemory = db.prepare(
    "INSERT OR IGNORE INTO memory_entries (id, project_id, content, tags, provenance, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );

  for (const mem of data.memory_entries ?? []) {
    insertMemory.run(mem.id, mem.project_id, mem.content, mem.tags, mem.provenance, mem.content_hash, mem.created_at);
    imported++;
  }

  db.close();
  consola.success(`Imported ${imported} records from ${inputPath}`);
}
