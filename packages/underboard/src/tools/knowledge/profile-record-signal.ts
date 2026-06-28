import { z } from 'zod';
import Database from 'better-sqlite3';
import { recordSignal } from '../../knowledge/profile-service.js';

export const schema = z.object({
  signal_type: z.string(),
  signal_value: z.number(),
  domain: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export async function handler(db: Database.Database, params: any, extra: any) {
  const projectId = extra?.project_id ?? params.project_id;
  if (!projectId) throw new Error('MISSING_PROJECT');
  const res = recordSignal(db, projectId, params);
  return { content: [{ type: 'text' as const, text: JSON.stringify(res) }] };
}
