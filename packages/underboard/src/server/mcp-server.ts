import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Database from "better-sqlite3";
import { createBackend } from "../memory-backend/backend-factory.js";
import type { UnderboardConfig } from "../cli/config.js";
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

export function createMcpServer(db: Database.Database, config: UnderboardConfig) {
  const { backend } = createBackend(db, {
    type: "honcho",
    honcho_endpoint: config.honcho.endpoint,
    honcho_token: config.honcho.token,
    honcho_timeout_ms: config.honcho.timeout_ms,
  });

  const server = new McpServer({
    name: "underboard",
    version: "0.1.0",
  });

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

  server.tool("memory_write", "Write a memory entry with dedup on content hash", {
    content: z.string().describe("Memory content"),
    tags: z.array(z.string()).optional().describe("Optional tags"),
  }, async (params: any, extra: any) => {
    const ctx = extractContext(extra);
    const result = await backend.write(params, ctx);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("memory_recall", "Recall memories by semantic + lexical similarity", {
    query: z.string().describe("Natural language query"),
    top_k: z.number().optional().describe("Number of results (default 5)"),
    threshold: z.number().optional().describe("Minimum score threshold (default 0.3)"),
  }, async (params: any, extra: any) => {
    const ctx = extractContext(extra);
    const result = await backend.recall(params, ctx);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("memory_list_recent", "List recent memory entries", {
    limit: z.number().optional().describe("Max entries (default 20)"),
  }, async (params: any, extra: any) => {
    const ctx = extractContext(extra);
    const result = await backend.listRecent(params ?? {}, ctx);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("memory_get", "Get a full memory entry by ID", {
    id: z.string().describe("Memory entry ID"),
  }, async (params: any) => {
    const result = await backend.get(params.id);
    if (!result) {
      throw new Error("ENTRY_NOT_FOUND: memory entry not found");
    }
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("memory_delete", "Delete a memory entry (scoped to current project)", {
    id: z.string().describe("Memory entry ID"),
  }, async (params: any, extra: any) => {
    const ctx = extractContext(extra);
    const result = await backend.delete(params.id, ctx);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("task_create", "Create a new task on the board", {
    title: z.string().describe("Task title"),
    description: z.string().optional().describe("Optional description"),
    status: z.string().describe("Status (backlog/in_progress/blocked/review/done)"),
    assignee: z.string().optional().describe("Optional agent name"),
    dependencies: z.array(z.string()).optional().describe("Optional dependency task IDs"),
  }, async (params: any, extra: any) => {
    const ctx = extractContext(extra);
    const result = taskCreate(db, params, ctx);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("task_update", "Update an existing task", {
    id: z.string().describe("Task ID"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description"),
    status: z.string().optional().describe("New status"),
    assignee: z.string().optional().describe("New assignee"),
    notes: z.string().optional().describe("New notes"),
    if_match: z.object({ updated_at: z.string() }).optional().describe("CAS: { updated_at: string }"),
  }, async (params: any) => {
    const result = taskUpdate(db, params);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("task_list", "List tasks with filters", {
    status: z.string().optional().describe("Filter by status"),
    assignee: z.string().optional().describe("Filter by assignee"),
    search: z.string().optional().describe("Search in title"),
    archived: z.boolean().optional().describe("Include archived"),
    limit: z.number().optional().describe("Max results"),
    offset: z.number().optional().describe("Pagination offset"),
  }, async (params: any, extra: any) => {
    const ctx = extractContext(extra);
    const result = taskList(db, params ?? {}, ctx);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("task_list_assigned", "List tasks assigned to calling agent", {
    status: z.string().optional().describe("Filter by status"),
    include_archived: z.boolean().optional().describe("Include archived"),
  }, async (params: any, extra: any) => {
    const ctx = extractContext(extra);
    const result = taskListAssigned(db, params ?? {}, ctx);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("task_archive", "Archive a task", {
    id: z.string().describe("Task ID"),
  }, async (params: any) => {
    const result = taskArchive(db, params);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  return server;
}
