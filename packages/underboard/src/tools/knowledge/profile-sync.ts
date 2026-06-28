import { z } from 'zod';
import Database from 'better-sqlite3';
import { pushProfile, pullProfile, getSyncStatus, resolveConflict } from '../../knowledge/sync-service.js';

export const schema = z.object({
  action: z.enum(['push', 'pull', 'status', 'resolve']),
  resolution: z.enum(['local', 'remote', 'keep-both']).optional(),
  options: z.object({
    file_path: z.string().optional(),
  }).optional(),
  passphrase: z.string().optional(),
});

export async function handler(db: Database.Database, params: any, extra: any) {
  const projectId = extra?.project_id ?? params.project_id ?? 'unknown';
  const action = params.action;
  
  if (action === 'status') {
    const result = getSyncStatus(db, projectId);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  }
  
  if (action === 'push') {
    const result = await pushProfile(db, projectId, params.passphrase, params.options);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  }
  
  if (action === 'pull') {
    const result = await pullProfile(db, projectId, params.passphrase, params.options);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  }
  
  if (action === 'resolve') {
    if (!params.resolution) throw new Error('RESOLUTION_REQUIRED');
    const result = resolveConflict(db, projectId, params.resolution);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  }
  
  throw new Error('INVALID_ACTION');
}
