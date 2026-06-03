import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { writeMemory, computeContentHash } from "#storage/memory-store.ts";
import { insertEvent } from "#storage/event-store.ts";

export interface MemoryWriteInput {
  content: string;
  tags?: string[];
}

export interface MemoryWriteOutput {
  id: string;
  created: boolean;
  provenance: Array<{ agent: string; ts: string }>;
}

const MAX_CONTENT_SIZE = 1024 * 1024;
const WARN_CONTENT_SIZE = 64 * 1024;

export function memoryWrite(
  db: Database.Database,
  input: MemoryWriteInput,
  context: { project_id: string; agent_name: string }
): MemoryWriteOutput {
  if (input.content.length > MAX_CONTENT_SIZE) {
    throw new Error("CONTENT_TOO_LARGE: content exceeds 1MB limit");
  }

  if (input.content.length > WARN_CONTENT_SIZE) {
    console.warn(`Memory content is ${Math.round(input.content.length / 1024)}KB — consider splitting`);
  }

  const id = randomUUID();
  const result = writeMemory(db, {
    id,
    project_id: context.project_id,
    content: input.content,
    tags: input.tags ?? null,
    agent_name: context.agent_name,
  });

  insertEvent(db, "memory_added", {
    id: result.id,
    project_id: context.project_id,
    content_snippet: input.content.slice(0, 200),
  });

  return {
    id: result.id,
    created: result.created,
    provenance: result.provenance,
  };
}
