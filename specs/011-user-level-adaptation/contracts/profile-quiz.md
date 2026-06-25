# Contract: `knowledge_profile_quiz`

**MCP Tool**: `knowledge_profile_quiz`  
**Module**: `packages/underboard/src/tools/knowledge/profile-quiz.ts`

Manages the calibration quiz lifecycle. Trigger a quiz, submit an answer, or complete the quiz. The quiz engine generates leveled questions based on current uncertainty.

## Input

```typescript
interface KnowledgeProfileQuizInput {
  action: "start" | "answer" | "status";
  /** Required for "answer": the question being answered (question_id from the last start/answer response). */
  question_id?: string;
  /** Required for "answer": the user's selected answer. */
  answer?: string;
}
```

## Output (action: "start")

```typescript
interface KnowledgeProfileQuizStartOutput {
  started: boolean;
  question: {
    id: string;
    /** The concept being tested. */
    concept: string;
    /** The question text. */
    text: string;
    /** Multiple choice options. */
    options: string[];
  };
  /** Current progress. */
  progress: {
    answered: number;
    total_estimated: number;
  };
}
```

## Output (action: "answer")

```typescript
interface KnowledgeProfileQuizAnswerOutput {
  correct: boolean;
  /** Updated confidence after this answer. */
  confidence_delta: number;
  /** Next question (or null if quiz complete). */
  next_question?: {
    id: string;
    concept: string;
    text: string;
    options: string[];
    progress: {
      answered: number;
      total_estimated: number;
    };
  };
  /** If quiz is complete: the derived level. */
  derived_level?: {
    level_internal: number;
    level_display: string | number;
    confidence: number;
  };
}
```

## Output (action: "status")

```typescript
interface KnowledgeProfileQuizStatusOutput {
  has_active_quiz: boolean;
  progress: {
    answered: number;
    total_estimated: number;
  } | null;
  derived_level: {
    level_internal: number;
    confidence: number;
  } | null;
}
```

## Error States

- `NO_ACTIVE_QUIZ` — answer submitted but no quiz was started.
- `INVALID_QUESTION` — question_id doesn't match the current question.
- `QUIZ_ALREADY_COMPLETE` — quiz was already completed; start a new one.

## Test Vectors

1. Start quiz → `{ started: true, question: { concept: "git rebase", text: "..." } }`
2. Answer correctly → `{ correct: true, confidence_delta: 0.1 }`
3. Complete quiz → `{ derived_level: { level_internal: 0.75 } }`
