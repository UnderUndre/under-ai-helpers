import Database from "better-sqlite3";

export interface EventRow {
  id: number;
  type: string;
  payload: string;
  timestamp: string;
}

const insertStmt = (db: Database.Database) =>
  db.prepare("INSERT INTO events (type, payload, timestamp) VALUES (?, ?, ?)");

const pruneStmt = (db: Database.Database) =>
  db.prepare(
    "DELETE FROM events WHERE id < (SELECT MAX(id) - 10000 FROM events)"
  );

const selectAfterStmt = (db: Database.Database) =>
  db.prepare("SELECT * FROM events WHERE id > ? ORDER BY id ASC LIMIT ?");

const latestIdStmt = (db: Database.Database) =>
  db.prepare("SELECT MAX(id) AS id FROM events");

const byTypeStmt = (db: Database.Database) =>
  db.prepare("SELECT * FROM events WHERE type = ? ORDER BY id DESC LIMIT ?");

export function insertEvent(
  db: Database.Database,
  type: string,
  payload: Record<string, unknown>
): EventRow {
  const timestamp = new Date().toISOString();
  const info = insertStmt(db).run(type, JSON.stringify(payload), timestamp);
  pruneStmt(db).run();
  return {
    id: info.lastInsertRowid as number,
    type,
    payload: JSON.stringify(payload),
    timestamp,
  };
}

export function getEventsAfter(
  db: Database.Database,
  afterId: number,
  limit: number = 1000
): EventRow[] {
  return selectAfterStmt(db).all(afterId, limit) as EventRow[];
}

export function getLatestEventId(db: Database.Database): number | null {
  const row = latestIdStmt(db).get() as { id: number | null } | undefined;
  return row?.id ?? null;
}

export function getEventsByType(
  db: Database.Database,
  type: string,
  limit: number = 100
): EventRow[] {
  return byTypeStmt(db).all(type, limit) as EventRow[];
}

