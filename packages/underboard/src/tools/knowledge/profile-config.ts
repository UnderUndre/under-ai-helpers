import { z } from 'zod';
import Database from 'better-sqlite3';
import { configureProfile } from "../../knowledge/profile-service.js";

export const schema = z.object({
  display_scale: z.union([z.literal('3'), z.literal('5'), z.literal('continuous')]).optional(),
  sync_enabled: z.boolean().optional(),
  sync_transport: z.string().optional(),
  retention_days: z.number().optional(),
  inference_threshold_n: z.number().optional(),
  expand_domain: z.string().optional(),
  collapse_domain: z.string().optional(),
  accept_proposed_revision: z.boolean().optional(),
  reject_proposed_revision: z.boolean().optional(),
});

export async function handler(db: Database.Database, params: any, extra: any) {
  const projectId = extra?.project_id ?? params.project_id ?? 'unknown';
  const opts = params;
  const result = configureProfile(db, projectId, opts);
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
}
