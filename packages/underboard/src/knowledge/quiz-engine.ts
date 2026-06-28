import Database from "better-sqlite3";

type QuizQuestion = {
  id: string;
  text: string;
  choices: string[];
  answerIndex: number;
};

type QuizSession = {
  projectId: string;
  current: number; // index into questions
  correct: number;
  startedAt: string;
};

const QUESTIONS: QuizQuestion[] = [
  {
    id: "q1",
    text: "What does SQL stand for?",
    choices: ["Structured Query Language", "Simple Query List", "Server Query Language", "Sequence Query Logic"],
    answerIndex: 0,
  },
  {
    id: "q2",
    text: "Which HTTP status code indicates 'Not Found'?",
    choices: ["200", "301", "404", "500"],
    answerIndex: 2,
  },
  {
    id: "q3",
    text: "In Git, which command creates a new branch?",
    choices: ["git branch <name>", "git new <name>", "git create <name>", "git checkout main"],
    answerIndex: 0,
  },
  {
    id: "q4",
    text: "Which HTTP method is idempotent?",
    choices: ["POST", "PUT", "CONNECT", "PATCH"],
    answerIndex: 1,
  },
  {
    id: "q5",
    text: "What is a primary key in a relational database?",
    choices: ["A unique identifier for records", "A backup key", "An index for performance only", "A foreign reference"],
    answerIndex: 0,
  },
];

const sessions = new Map<string, QuizSession>();

export function handleQuiz(db: Database.Database, projectId: string, payload: { action: string; question_id?: string; answer?: number }) {
  const action = payload.action;
  if (action === 'start') {
    const now = new Date().toISOString();
    sessions.set(projectId, { projectId, current: 0, correct: 0, startedAt: now });
    const q = QUESTIONS[0]!;
    return { question: { id: q.id, text: q.text, choices: q.choices }, progress: { current: 1, total: QUESTIONS.length } };
  }

  const session = sessions.get(projectId);
  if (!session) throw new Error('NO_QUIZ_SESSION');

  if (action === 'answer') {
    if (!payload.question_id) throw new Error('MISSING_QUESTION_ID');
    const currentQuestion = QUESTIONS[session.current]!;
    if (currentQuestion.id !== payload.question_id) throw new Error('QUESTION_MISMATCH');
    const selected = payload.answer;
    if (typeof selected !== 'number') throw new Error('INVALID_ANSWER');
    if (selected === currentQuestion.answerIndex) session.correct += 1;
    session.current += 1;

    if (session.current < QUESTIONS.length) {
      const next = QUESTIONS[session.current]!;
      return { question: { id: next.id, text: next.text, choices: next.choices }, progress: { current: session.current + 1, total: QUESTIONS.length } };
    } else {
      // finished
      const score = session.correct / QUESTIONS.length;
      // persist into profile
      const now = new Date().toISOString();
      let profileRow = db.prepare('SELECT * FROM knowledge_profiles WHERE project_id = ?').get(projectId) as any;
      if (!profileRow) {
        db.prepare(`INSERT INTO knowledge_profiles (project_id, assessment_mode, level_internal, level_source, display_scale, retention_days, inference_threshold_n, sync_enabled, created_at, updated_at)
          VALUES (?, 'quiz', ?, 'quiz-derived', '3', 30, 10, 0, ?, ?)
        `).run(projectId, score, now, now);
      } else {
        db.prepare('UPDATE knowledge_profiles SET level_internal = ?, level_source = ?, assessment_mode = ?, updated_at = ? WHERE id = ?').run(score, 'quiz-derived', 'quiz', now, profileRow.id);
      }

      sessions.delete(projectId);
      return { finished: true, score };
    }
  }

  if (action === 'status') {
    return { session: session ? { current: session.current, correct: session.correct, startedAt: session.startedAt } : null };
  }

  throw new Error('UNKNOWN_ACTION');
}
