import Database from "better-sqlite3";
import type { ProjectInfo } from "#project/detector.js";

export interface ProjectRow {
  id: string;
  stable_key: string;
  display_name: string;
  root_path: string;
  first_seen: string;
  last_seen: string;
}

const stmtUpsert = (db: Database.Database) =>
  db.prepare(`
    INSERT INTO projects (id, stable_key, display_name, root_path, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      last_seen = excluded.last_seen,
      display_name = excluded.display_name,
      root_path = excluded.root_path
  `);

const stmtGetById = (db: Database.Database) =>
  db.prepare("SELECT * FROM projects WHERE id = ?");

const stmtGetByStableKey = (db: Database.Database) =>
  db.prepare("SELECT * FROM projects WHERE stable_key = ?");

const stmtGetAll = (db: Database.Database) =>
  db.prepare("SELECT * FROM projects ORDER BY last_seen DESC");

export function upsertProject(db: Database.Database, info: ProjectInfo): void {
  const now = new Date().toISOString();
  stmtUpsert(db).run(
    info.id,
    info.stableKey,
    info.displayName,
    info.rootPath,
    now,
    now,
  );
}

export function getProject(
  db: Database.Database,
  id: string,
): ProjectRow | undefined {
  return stmtGetById(db).get(id) as ProjectRow | undefined;
}

export function getProjectByStableKey(
  db: Database.Database,
  stableKey: string,
): ProjectRow | undefined {
  return stmtGetByStableKey(db).get(stableKey) as ProjectRow | undefined;
}

export function getAllProjects(db: Database.Database): ProjectRow[] {
  return stmtGetAll(db).all() as ProjectRow[];
}
