import { z } from 'zod';
import Database from 'better-sqlite3';
import { forgetProfile } from '../../knowledge/profile-service.js';

export const schema = z.object({
  confirm: z.boolean(),
});

export async function handler(db: Database.Database, params: any, extra: any) {
  const projectId = extra?.project_id ?? params.project_id ?? 'unknown';
  const confirm = !!params.confirm;
  const result = forgetProfile(db, projectId, confirm);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
}
