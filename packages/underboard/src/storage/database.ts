import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { consola } from "consola";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const MIGRATION_PATTERN = /^\d{3}_.*\.sql$/;

function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      Id         INTEGER PRIMARY KEY,
      Name       TEXT NOT NULL UNIQUE,
      Applied_at TEXT NOT NULL
    )
  `);
}

function getAppliedMigrations(db: Database.Database): Set<string> {
  const rows = db.prepare("SELECT Name FROM _migrations").all() as { Name: string }[];
  return new Set(rows.map((r) => r.Name));
}

function runPendingMigrations(db: Database.Database): void {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    consola.warn("Migrations directory not found:", MIGRATIONS_DIR);
    return;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => MIGRATION_PATTERN.test(f))
    .sort();

  if (files.length === 0) {
    consola.debug("No migration files found");
    return;
  }

  const applied = getAppliedMigrations(db);
  const insertStmt = db.prepare(
    "INSERT INTO _migrations (Name, Applied_at) VALUES (?, ?)"
  );

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    consola.info("Running migration:", file);

    const runInTransaction = db.transaction(() => {
      db.exec(sql);
      insertStmt.run(file, new Date().toISOString());
    });

    runInTransaction();
    consola.success("Migration applied:", file);
  }
}

export function createDatabase(dbPath?: string): Database.Database {
  const resolvedPath =
    dbPath ?? path.join(os.homedir(), ".underboard", "data.db");

  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  consola.info("Opening database:", resolvedPath);
  const db = new Database(resolvedPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  ensureMigrationsTable(db);
  runPendingMigrations(db);

  return db;
}

export function closeDatabase(db: Database.Database): void {
  db.close();
}

