import { z } from 'zod';
import Database from 'better-sqlite3';
import { getProfile } from "../../knowledge/profile-service.js";

export const schema = z.object({
  domain: z.string().optional(),
});

export async function handler(db: Database.Database, params: any, extra: any) {
  const ctx = params; // not using ctx for now
  const projectId = extra?.project_id ?? ctx.project_id ?? 'unknown';
  const domain = params.domain;
  const profile = getProfile(db, projectId, domain);
  return { content: [{ type: 'text' as const, text: JSON.stringify(profile) }] };
}
