import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Database from "better-sqlite3";
import { memoryWrite } from "#tools/memory/write.js";
import { memoryRecall } from "#tools/memory/recall.js";
import { memoryListRecent } from "#tools/memory/list-recent.js";
import { memoryGet } from "#tools/memory/get.js";
import { memoryDelete } from "#tools/memory/delete.js";
import { taskCreate } from "#tools/tasks/create.js";
import { taskUpdate } from "#tools/tasks/update.js";
import { taskList } from "#tools/tasks/list.js";
import { taskListAssigned } from "#tools/tasks/list-assigned.js";
import { taskArchive } from "#tools/tasks/archive.js";
import { detectProject } from "#project/detector.js";
import { upsertProject } from "#storage/project-store.js";

export interface ToolContext {
  project_id: string;
  agent_name: string;
  cwd: string;
}

export function createMcpServer(db: Database.Database, vecAvailable: boolean = false) {
  const server = new McpServer({
    name: "underboard",
    version: "0.1.0",
  });

  const reg = (server as any).tool.bind(server) as (name: string, desc: string, schema: any, cb: any) => void;

  function extractContext(extra: any): ToolContext {
    const cwd = extra?.clientInfo?.cwd ?? extra?.headers?.["x-agent-cwd"] ?? process.cwd();
    const agentName = extra?.clientInfo?.name ?? extra?.headers?.["x-agent-name"] ?? "unknown";
    const project = detectProject(cwd);
    upsertProject(db, project);
    return {
      project_id: project.id,
      agent_name: agentName,
      cwd,
    };
  }

  reg("memory_write", "Write a memory entry with dedup on content hash", {
    content: { type: "string", description: "Memory content" },
    tags: { type: "array", items: { type: "string" }, description: "Optional tags" },
  }, async (params: any, extra: any) => {
    const ctx = extractContext(extra);
    const result = memoryWrite(db, params, ctx);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  reg("memory_recall", "Recall memories by semantic + lexical similarity", {
    query: { type: "string", description: "Natural language query" },
    top_k: { type: "number", description: "Number of results (default 5)" },
    threshold: { type: "number", description: "Minimum score threshold (default 0.3)" },
  }, async (params: any, extra: any) => {
    const ctx = extractContext(extra);
    const result = await memoryRecall(db, params, ctx, vecAvailable);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  reg("memory_list_recent", "List recent memory entries", {
    limit: { type: "number", description: "Max entries (default 20)" },
  }, async (params: any, extra: any) => {
    const ctx = extractContext(extra);
    const result = memoryListRecent(db, params ?? {}, ctx);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  reg("memory_get", "Get a full memory entry by ID", {
    id: { type: "string", description: "Memory entry ID" },
  }, async (params: any) => {
    const result = memoryGet(db, params);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  reg("memory_delete", "Delete a memory entry (scoped to current project)", {
    id: { type: "string", description: "Memory entry ID" },
  }, async (params: any, extra: any) => {
    const ctx = extractContext(extra);
    const result = memoryDelete(db, params, ctx);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  reg("task_create", "Create a new task on the board", {
    title: { type: "string", description: "Task title" },
    description: { type: "string", description: "Optional description" },
    status: { type: "string", description: "Status (backlog/in_progress/blocked/review/done)" },
    assignee: { type: "string", description: "Optional agent name" },
    dependencies: { type: "array", items: { type: "string" }, description: "Optional dependency task IDs" },
  }, async (params: any, extra: any) => {
    const ctx = extractContext(extra);
    const result = taskCreate(db, params, ctx);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  reg("task_update", "Update an existing task", {
    id: { type: "string", description: "Task ID" },
    title: { type: "string", description: "New title" },
    description: { type: "string", description: "New description" },
    status: { type: "string", description: "New status" },
    assignee: { type: "string", description: "New assignee" },
    notes: { type: "string", description: "New notes" },
    if_match: { type: "object", description: "CAS: { updated_at: string }" },
  }, async (params: any) => {
    const result = taskUpdate(db, params);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  reg("task_list", "List tasks with filters", {
    status: { type: "string", description: "Filter by status" },
    assignee: { type: "string", description: "Filter by assignee" },
    search: { type: "string", description: "Search in title" },
    archived: { type: "boolean", description: "Include archived" },
    limit: { type: "number", description: "Max results" },
    offset: { type: "number", description: "Pagination offset" },
  }, async (params: any, extra: any) => {
    const ctx = extractContext(extra);
    const result = taskList(db, params ?? {}, ctx);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  reg("task_list_assigned", "List tasks assigned to calling agent", {
    status: { type: "string", description: "Filter by status" },
    include_archived: { type: "boolean", description: "Include archived" },
  }, async (params: any, extra: any) => {
    const ctx = extractContext(extra);
    const result = taskListAssigned(db, params ?? {}, ctx);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  reg("task_archive", "Archive a task", {
    id: { type: "string", description: "Task ID" },
  }, async (params: any) => {
    const result = taskArchive(db, params);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  return server;
}

export function registerTool(server: McpServer, name: string, description: string, schema: any, handler: any) {
  (server as any).tool(name, description, schema, handler);
}
