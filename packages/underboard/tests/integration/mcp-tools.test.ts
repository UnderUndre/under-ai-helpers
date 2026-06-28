import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, closeTestDb } from "../fixtures/test-db.ts";
import type Database from "better-sqlite3";
import { memoryWrite } from "#tools/memory/write.ts";
import { memoryRecall } from "#tools/memory/recall.ts";
import { memoryListRecent } from "#tools/memory/list-recent.ts";
import { memoryGet } from "#tools/memory/get.ts";
import { memoryDelete } from "#tools/memory/delete.ts";
import { taskCreate } from "#tools/tasks/create.ts";
import { taskUpdate } from "#tools/tasks/update.ts";
import { taskList } from "#tools/tasks/list.ts";
import { taskListAssigned } from "#tools/tasks/list-assigned.ts";
import { taskArchive } from "#tools/tasks/archive.ts";

import { upsertProject } from "#storage/project-store.ts";

describe("MCP Tool Contracts", () => {
  let db: Database.Database;
  const ctx = { project_id: "test-project", agent_name: "test-agent" };

  beforeEach(() => {
    db = createTestDb();
    upsertProject(db, {
      id: "test-project",
      stableKey: "test-project",
      displayName: "Test Project",
      rootPath: "/tmp",
    });
    upsertProject(db, {
      id: "other-project",
      stableKey: "other-project",
      displayName: "Other Project",
      rootPath: "/tmp/other",
    });
  });

  afterEach(() => {
    closeTestDb(db);
  });

  describe("memory_write", () => {
    it("creates a new memory entry", () => {
      const result = memoryWrite(db, { content: "Test fact" }, ctx);
      expect(result.created).toBe(true);
      expect(result.id).toBeTruthy();
      expect(result.provenance).toHaveLength(1);
    });

    it("deduplicates on content hash", () => {
      const r1 = memoryWrite(db, { content: "Same fact" }, ctx);
      const r2 = memoryWrite(db, { content: "Same fact" }, ctx);
      expect(r1.created).toBe(true);
      expect(r2.created).toBe(false);
      expect(r1.id).toBe(r2.id);
    });

    it("rejects content over 1MB", () => {
      expect(() => memoryWrite(db, { content: "x".repeat(1024 * 1024 + 1) }, ctx)).toThrow("CONTENT_TOO_LARGE");
    });
  });

  describe("memory_recall", () => {
    it("returns results matching query", async () => {
      memoryWrite(db, { content: "Auth uses JWT with 1h TTL" }, ctx);
      memoryWrite(db, { content: "Database is PostgreSQL" }, ctx);

      const result = await memoryRecall(db, { query: "JWT auth" }, ctx);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].content).toContain("JWT");
    });

    it("returns empty for no match", async () => {
      const result = await memoryRecall(db, { query: "nonexistent topic xyz" }, ctx);
      expect(result.results).toEqual([]);
    });
  });

  describe("memory_list_recent", () => {
    it("returns recent entries truncated", () => {
      memoryWrite(db, { content: "x".repeat(600) }, ctx);
      const result = memoryListRecent(db, {}, ctx);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].truncated).toBe(true);
      expect(result.entries[0].full_length).toBe(600);
    });
  });

  describe("memory_get", () => {
    it("returns full entry by ID", () => {
      const written = memoryWrite(db, { content: "Full content here" }, ctx);
      const result = memoryGet(db, { id: written.id });
      expect(result.content).toBe("Full content here");
    });

    it("throws on not found", () => {
      expect(() => memoryGet(db, { id: "nonexistent" })).toThrow("ENTRY_NOT_FOUND");
    });
  });

  describe("memory_delete", () => {
    it("deletes within project scope", () => {
      const written = memoryWrite(db, { content: "To delete" }, ctx);
      const result = memoryDelete(db, { id: written.id }, ctx);
      expect(result.deleted).toBe(true);
    });

    it("returns false for cross-project entry", () => {
      const written = memoryWrite(db, { content: "Other project" }, { project_id: "other-project", agent_name: "test" });
      const result = memoryDelete(db, { id: written.id }, ctx);
      expect(result.deleted).toBe(false);
    });
  });

  describe("task_create", () => {
    it("creates task with defaults", () => {
      const result = taskCreate(db, { title: "My task" }, ctx);
      expect(result.title).toBe("My task");
      expect(result.status).toBe("backlog");
      expect(result.archived).toBe(false);
    });

    it("validates status", () => {
      expect(() => taskCreate(db, { title: "Test", status: "invalid" }, ctx)).toThrow("INVALID_STATUS");
    });

    it("validates title", () => {
      expect(() => taskCreate(db, { title: "" }, ctx)).toThrow();
    });
  });

  describe("task_update", () => {
    it("updates fields and bumps updated_at", async () => {
      const created = taskCreate(db, { title: "Original" }, ctx);
      await new Promise((resolve) => setTimeout(resolve, 2));
      const updated = taskUpdate(db, { id: created.id, title: "Updated" });
      expect(updated.title).toBe("Updated");
      expect(updated.updated_at).not.toBe(created.updated_at);
    });

    it("rejects invalid status", () => {
      const created = taskCreate(db, { title: "Test" }, ctx);
      expect(() => taskUpdate(db, { id: created.id, status: "bad" })).toThrow("INVALID_STATUS");
    });

    it("CAS conflict when if_match wrong", () => {
      const created = taskCreate(db, { title: "Test" }, ctx);
      expect(() => taskUpdate(db, { id: created.id, title: "New", if_match: { updated_at: "wrong" } })).toThrow("CONCURRENCY_CONFLICT");
    });
  });

  describe("task_list", () => {
    it("filters by status", () => {
      taskCreate(db, { title: "A", status: "backlog" }, ctx);
      taskCreate(db, { title: "B", status: "in_progress" }, ctx);
      const result = taskList(db, { status: "in_progress" }, ctx);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].title).toBe("B");
    });

    it("searches by title", () => {
      taskCreate(db, { title: "Fix auth bug" }, ctx);
      taskCreate(db, { title: "Update README" }, ctx);
      const result = taskList(db, { search: "auth" }, ctx);
      expect(result.tasks).toHaveLength(1);
    });
  });

  describe("task_list_assigned", () => {
    it("filters by agent name and project", () => {
      taskCreate(db, { title: "Task A", assignee: "claude" }, ctx);
      taskCreate(db, { title: "Task B", assignee: "gemini" }, ctx);
      const result = taskListAssigned(db, {}, { project_id: ctx.project_id, agent_name: "claude" });
      expect(result.tasks).toHaveLength(1);
    });
  });

  describe("task_archive", () => {
    it("archives a task", () => {
      const created = taskCreate(db, { title: "To archive" }, ctx);
      const archived = taskArchive(db, { id: created.id });
      expect(archived.archived).toBe(true);
    });
  });
});
