import { z } from 'zod';
import Database from 'better-sqlite3';
import { handleQuiz } from '../../knowledge/quiz-engine.js';

export const schema = z.object({
  action: z.enum(['start','answer','status']),
  question_id: z.string().optional(),
  answer: z.number().optional(),
});

export async function handler(db: Database.Database, params: any, extra: any) {
  const projectId = extra?.project_id ?? params.project_id;
  if (!projectId) throw new Error('MISSING_PROJECT');
  const res = handleQuiz(db, projectId, params as any);
  return { content: [{ type: 'text' as const, text: JSON.stringify(res) }] };
}
