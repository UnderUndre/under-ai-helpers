import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, closeTestDb } from "../fixtures/test-db.ts";
import type Database from "better-sqlite3";

describe("Export/Import", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  it("roundtrips data through export and import", async () => {
    const { memoryWrite } = await import("#tools/memory/write.ts");
    const { taskCreate } = await import("#tools/tasks/create.ts");
    const { upsertProject } = await import("#storage/project-store.ts");
    const ctx = { project_id: "export-test", agent_name: "test" };

    upsertProject(db, {
      id: "export-test",
      stableKey: "export-test",
      displayName: "Export Test",
      rootPath: "/tmp/export",
    });

    memoryWrite(db, { content: "Exported fact" }, ctx);
    taskCreate(db, { title: "Exported task" }, ctx);

    const projects = db.prepare("SELECT * FROM projects").all();
    const tasks = db.prepare("SELECT * FROM tasks").all();
    const memory = db.prepare("SELECT id, project_id, content, tags, provenance, content_hash, created_at FROM memory_entries").all();

    expect(projects.length).toBeGreaterThan(1);
    expect(tasks).toHaveLength(1);
    expect(memory).toHaveLength(1);

    const db2 = createTestDb();
    const insertProject = db2.prepare("INSERT OR IGNORE INTO projects (id, stable_key, display_name, root_path, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)");
    for (const p of projects as any[]) {
      insertProject.run(p.id, p.stable_key, p.display_name, p.root_path, p.first_seen, p.last_seen);
    }

    const insertTask = db2.prepare("INSERT OR IGNORE INTO tasks (id, project_id, title, description, status, assignee, dependency_ids, notes, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const t of tasks) {
      insertTask.run(t.id, t.project_id, t.title, t.description, t.status, t.assignee, t.dependency_ids, t.notes, t.archived, t.created_at, t.updated_at);
    }

    const imported = db2.prepare("SELECT * FROM tasks").all();
    expect(imported).toHaveLength(1);
    expect(imported[0].title).toBe("Exported task");

    closeTestDb(db2);
  });
});
