# Contract: `knowledge_profile_record_signal`

**MCP Tool**: `knowledge_profile_record_signal`
**Module**: `packages/underboard/src/tools/knowledge/profile-record-signal.ts`

Appends an observed interaction signal to the current project's signal set (FR-021). This is the **capture path** that populates `knowledge_signals`; without it, inferred and hybrid modes would operate on an eternally empty table and never produce a level. Called by agents (instructed by the `knowledge-adaptation` skill) after each interaction in inferred/hybrid modes. Applies the profile's retention policy (FR-015) at write time and may trigger a lazy re-evaluation tick if the new-signal-since-last-eval count crosses the threshold N.

## Input

```typescript
interface KnowledgeProfileRecordSignalInput {
  /** Signal category. */
  signal_type: "vocabulary_level" | "question_depth" | "concept_familiarity" | "correction_frequency" | "code_complexity";
  /** Normalized value 0.0–1.0 (0 = novice cue, 1 = expert cue). */
  signal_value: number;
  /** Optional sub-domain this signal pertains to (case-folded against canonical vocab). */
  domain?: "frontend" | "backend" | "database" | "devops" | "security" | "docs";
  /** Optional metadata. Agent name is recommended for auditability. Conversation snippets MUST be hashed, never stored raw. */
  metadata?: {
    agent_name?: string;
    snippet_hash?: string;
    confidence?: number;
    [k: string]: unknown;
  };
}
```

## Output

```typescript
interface KnowledgeProfileRecordSignalOutput {
  success: boolean;
  signal_id: number;
  /** Whether this write crossed the N-signal threshold and triggered a re-evaluation tick. */
  triggered_evaluation: boolean;
  /** If triggered_evaluation: the resulting level after re-evaluation. Null if evaluation was deferred. */
  new_level_internal?: number;
  /** In hybrid mode: whether the re-evaluation produced a pending proposal awaiting user confirmation. */
  proposal_pending?: boolean;
  /** Number of signals currently retained (post retention-pruning) for this profile. */
  retained_signal_count: number;
}
```

## Error States

- `MODE_DOES_NOT_CAPTURE_SIGNALS` — assessment_mode is "self-declared" or "quiz". Signal capture only happens in inferred/hybrid modes.
- `INVALID_SIGNAL_VALUE` — signal_value outside [0.0, 1.0].
- `INVALID_SIGNAL_TYPE` — signal_type not in the enumerated set.
- `UNKNOWN_DOMAIN` — domain provided but not in the canonical vocabulary (FR-020).
- `INVALID_METADATA` — metadata contains a raw conversation snippet (string longer than a hash) instead of a hash. Snippets MUST be hashed before storage.

## Test Vectors

1. Inferred mode, record vocabulary signal → `{ success: true, triggered_evaluation: false, retained_signal_count: 11 }`
2. Inferred mode, N-th signal crosses threshold → `{ success: true, triggered_evaluation: true, new_level_internal: 0.62 }`
3. Hybrid mode, N-th signal crosses threshold → `{ success: true, triggered_evaluation: true, proposal_pending: true }`
4. Self-declared mode → error `MODE_DOES_NOT_CAPTURE_SIGNALS`
5. Raw snippet in metadata → error `INVALID_METADATA`
