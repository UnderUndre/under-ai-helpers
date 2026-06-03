import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { insertEvent } from "#storage/event-store.ts";

export function activityLogStart(
  db: Database.Database,
  input: { task_id: string },
  context: { agent_name: string }
): { logging: boolean; task_id: string } {
  const task = db.prepare("SELECT id FROM tasks WHERE id = ?").get(input.task_id);
  if (!task) {
    throw new Error("TASK_NOT_FOUND: task not found");
  }
  return { logging: true, task_id: input.task_id };
}

export function activityLogEmit(
  db: Database.Database,
  input: { task_id: string; action_type: string; detail: string },
  context: { agent_name: string }
): { logged: boolean; id: string } {
  const task = db.prepare("SELECT id FROM tasks WHERE id = ?").get(input.task_id);
  if (!task) {
    throw new Error("TASK_NOT_FOUND: task not found");
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    "INSERT INTO activity_log (id, task_id, agent_name, action_type, detail, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, input.task_id, context.agent_name, input.action_type, input.detail ?? null, now);

  insertEvent(db, "activity_logged", {
    task_id: input.task_id,
    agent_name: context.agent_name,
    action_type: input.action_type,
  });

  return { logged: true, id };
}

export function activityLogGet(
  db: Database.Database,
  input: { task_id: string; limit?: number; offset?: number }
): { entries: Array<{
  id: string;
  task_id: string;
  agent_name: string;
  action_type: string;
  detail: string | null;
  timestamp: string;
}> } {
  const limit = Math.min(input.limit ?? 50, 200);
  const offset = input.offset ?? 0;

  const rows = db.prepare(
    "SELECT * FROM activity_log WHERE task_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?"
  ).all(input.task_id, limit, offset) as Array<{
    id: string;
    task_id: string;
    agent_name: string;
    action_type: string;
    detail: string | null;
    timestamp: string;
  }>;

  return { entries: rows };
}
