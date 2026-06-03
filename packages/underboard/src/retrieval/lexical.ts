import Database from "better-sqlite3";

export interface LexicalResult {
  rowid: number;
  content: string;
  score: number;
}

export function lexicalSearch(
  db: Database.Database,
  query: string,
  projectId: string,
  limit: number = 50
): LexicalResult[] {
  const ftsQuery = query
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(" OR ");

  if (!ftsQuery) return [];

  const stmt = db.prepare(`
    SELECT f.rowid, f.content, bm25(memory_fts) AS rank
    FROM memory_fts f
    JOIN memory_entries e ON e.rowid = f.rowid
    WHERE memory_fts MATCH ? AND e.project_id = ?
    ORDER BY rank
    LIMIT ?
  `);

  const rows = stmt.all(ftsQuery, projectId, limit) as Array<{ rowid: number; content: string; rank: number }>;

  if (rows.length === 0) return [];

  const maxRank = Math.max(...rows.map((r) => Math.abs(r.rank)));
  if (maxRank === 0) return rows.map((r) => ({ rowid: r.rowid, content: r.content, score: 0 }));

  return rows.map((r) => ({
    rowid: r.rowid,
    content: r.content,
    score: Math.min(1, Math.abs(r.rank) / maxRank),
  }));
}
