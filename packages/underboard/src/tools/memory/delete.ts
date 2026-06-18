import Database from "better-sqlite3";
import { deleteMemory } from "#storage/memory-store.js";
import { emitEvent } from "#tools/emit-event.js";

export interface MemoryDeleteInput {
  id: string;
}

export interface MemoryDeleteOutput {
  deleted: boolean;
  id: string;
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 100;

function checkRateLimit(agentName: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(agentName);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(agentName, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

export function memoryDelete(
  db: Database.Database,
  input: MemoryDeleteInput,
  context: { project_id: string; agent_name: string }
): MemoryDeleteOutput {
  if (!checkRateLimit(context.agent_name)) {
    throw new Error("RATE_LIMIT_EXCEEDED: max 100 deletes per minute");
  }

  const deleted = deleteMemory(db, input.id, context.project_id);

  if (deleted) {
    emitEvent(db, "memory_deleted", {
      id: input.id,
      project_id: context.project_id,
    });
  }

  return { deleted, id: input.id };
}

