import { z } from 'zod';
import Database from 'better-sqlite3';
import { setProfile } from "../../knowledge/profile-service.js";

export const schema = z.object({
  level: z.union([z.string(), z.number()]),
  domain: z.string().optional(),
});

export async function handler(db: Database.Database, params: any, extra: any) {
  const projectId = extra?.project_id ?? params.project_id ?? 'unknown';
  const level = params.level;
  const domain = params.domain;
  const result = setProfile(db, projectId, level, domain);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
}
