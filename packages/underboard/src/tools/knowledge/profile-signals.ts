import { z } from 'zod';
import Database from 'better-sqlite3';
import { getSignalsSummary } from '../../knowledge/profile-service.js';

export const schema = z.object({
  limit: z.number().optional(),
  domain: z.string().optional(),
});

export async function handler(db: Database.Database, params: any, extra: any) {
  const projectId = extra?.project_id ?? params.project_id;
  if (!projectId) throw new Error('MISSING_PROJECT');
  const res = getSignalsSummary(db, projectId, params?.limit ?? 20, params?.domain);
  return { content: [{ type: 'text' as const, text: JSON.stringify(res) }] };
}
