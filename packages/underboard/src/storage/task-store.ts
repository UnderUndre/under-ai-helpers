import Database from "better-sqlite3";

export interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  assignee: string | null;
  dependency_ids: string[] | null;
  notes: string | null;
  archived: number;
  created_at: string;
  updated_at: string;
}

function parseTaskRow(row: Record<string, unknown>): TaskRow {
  return {
    ...row,
    dependency_ids:
      row.dependency_ids == null
        ? null
        : JSON.parse(row.dependency_ids as string),
  } as TaskRow;
}

export function createTask(
  db: Database.Database,
  task: Omit<TaskRow, "created_at" | "updated_at" | "archived">,
): TaskRow {
  const now = new Date().toISOString();
  const depsJson =
    task.dependency_ids != null ? JSON.stringify(task.dependency_ids) : null;

  db.prepare(
    `INSERT INTO tasks (id, project_id, title, description, status, assignee, dependency_ids, notes, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    task.id,
    task.project_id,
    task.title,
    task.description ?? null,
    task.status,
    task.assignee ?? null,
    depsJson,
    task.notes ?? null,
    now,
    now,
  );

  return getTask(db, task.id)!;
}

export function getTask(
  db: Database.Database,
  id: string,
): TaskRow | undefined {
  const row = db
    .prepare("SELECT * FROM tasks WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? parseTaskRow(row) : undefined;
}

export function updateTask(
  db: Database.Database,
  id: string,
  updates: Partial<
    Pick<
      TaskRow,
      | "title"
      | "description"
      | "status"
      | "assignee"
      | "dependency_ids"
      | "notes"
      | "archived"
    >
  > & { if_match?: string },
): TaskRow | null {
  const { if_match, ...fields } = updates;

  if (if_match != null) {
    const current = db
      .prepare("SELECT updated_at FROM tasks WHERE id = ?")
      .get(id) as { updated_at: string } | undefined;
    if (!current || current.updated_at !== if_match) return null;
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    setClauses.push(`${key} = ?`);
    values.push(
      key === "dependency_ids" && value != null
        ? JSON.stringify(value)
        : value,
    );
  }

  if (setClauses.length === 0) {
    return getTask(db, id) ?? null;
  }

  setClauses.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);

  const result = db
    .prepare(`UPDATE tasks SET ${setClauses.join(", ")} WHERE id = ?`)
    .run(...values);

  if (result.changes === 0) return null;
  return getTask(db, id) ?? null;
}

export function listTasks(
  db: Database.Database,
  filters: {
    project_id?: string;
    status?: string | string[];
    assignee?: string;
    search?: string;
    archived?: boolean;
    limit?: number;
    offset?: number;
  },
): { tasks: TaskRow[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.project_id != null) {
    where.push("project_id = ?");
    params.push(filters.project_id);
  }

  if (filters.status != null) {
    const statuses = Array.isArray(filters.status)
      ? filters.status
      : [filters.status];
    const placeholders = statuses.map(() => "?").join(", ");
    where.push(`status IN (${placeholders})`);
    params.push(...statuses);
  }

  if (filters.assignee != null) {
    where.push("assignee = ?");
    params.push(filters.assignee);
  }

  if (filters.search != null) {
    where.push("title LIKE '%' || ? || '%'");
    params.push(filters.search);
  }

  if (filters.archived == null || !filters.archived) {
    where.push("archived = 0");
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const totalRow = db
    .prepare(`SELECT COUNT(*) as cnt FROM tasks ${whereClause}`)
    .get(...params) as { cnt: number };
  const total = totalRow.cnt;

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const rows = db
    .prepare(
      `SELECT * FROM tasks ${whereClause} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Record<string, unknown>[];

  return {
    tasks: rows.map(parseTaskRow),
    total,
  };
}

export function listAssignedTasks(
  db: Database.Database,
  agentName: string,
  projectId: string,
  options?: { status?: string | string[]; include_archived?: boolean },
): TaskRow[] {
  const where: string[] = ["assignee = ?", "project_id = ?"];
  const params: unknown[] = [agentName, projectId];

  if (options?.status != null) {
    const statuses = Array.isArray(options.status)
      ? options.status
      : [options.status];
    const placeholders = statuses.map(() => "?").join(", ");
    where.push(`status IN (${placeholders})`);
    params.push(...statuses);
  }

  if (!options?.include_archived) {
    where.push("archived = 0");
  }

  const rows = db
    .prepare(
      `SELECT * FROM tasks WHERE ${where.join(" AND ")} ORDER BY updated_at DESC`,
    )
    .all(...params) as Record<string, unknown>[];

  return rows.map(parseTaskRow);
}

export function listAssignedTasksCrossProject(
  db: Database.Database,
  agentName: string,
  options?: { status?: string | string[]; include_archived?: boolean },
): TaskRow[] {
  const where: string[] = ["assignee = ?"];
  const params: unknown[] = [agentName];

  if (options?.status != null) {
    const statuses = Array.isArray(options.status)
      ? options.status
      : [options.status];
    const placeholders = statuses.map(() => "?").join(", ");
    where.push(`status IN (${placeholders})`);
    params.push(...statuses);
  }

  if (!options?.include_archived) {
    where.push("archived = 0");
  }

  const rows = db
    .prepare(
      `SELECT * FROM tasks WHERE ${where.join(" AND ")} ORDER BY updated_at DESC`,
    )
    .all(...params) as Record<string, unknown>[];

  return rows.map(parseTaskRow);
}

export function deleteTask(db: Database.Database, id: string): boolean {
  const result = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getConfigValue(db: Database.Database, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM _config WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function computeStalled(db: Database.Database, tasks: TaskRow[]): Array<TaskRow & { stalled: boolean }> {
  const stalledMode = getConfigValue(db, "stalled_mode") ?? "off";
  if (stalledMode !== "visual_after_hours") {
    return tasks.map((t) => ({ ...t, stalled: false }));
  }

  const stalledAfterHours = Number(getConfigValue(db, "stalled_after_hours") ?? "24");
  const thresholdMs = stalledAfterHours * 60 * 60 * 1000;
  const now = Date.now();

  return tasks.map((t) => {
    const stalled = t.status === "in_progress" &&
      !t.archived &&
      (now - new Date(t.updated_at).getTime()) > thresholdMs;
    return { ...t, stalled };
  });
}

