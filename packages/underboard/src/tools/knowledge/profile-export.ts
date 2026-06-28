import { z } from 'zod';
import Database from 'better-sqlite3';
import { exportProfile } from '../../knowledge/profile-service.js';

export const schema = z.object({
  domains: z.array(z.string()).optional(),
});

export async function handler(db: Database.Database, params: any, extra: any) {
  const projectId = extra?.project_id ?? params.project_id ?? 'unknown';
  const domains = params.domains;
  const result = exportProfile(db, projectId, domains);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
}
