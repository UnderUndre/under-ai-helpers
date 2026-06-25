# Contract: `knowledge_profile_signals`

**MCP Tool**: `knowledge_profile_signals`  
**Module**: `packages/underboard/src/tools/knowledge/profile-signals.ts`

Exposes the auditable signal set used for inference (FR-008). Only available in `inferred` and `hybrid` modes. Returns aggregated signal statistics plus a sample of recent raw signals.

## Input

```typescript
interface KnowledgeProfileSignalsInput {
  /** Maximum number of raw signals to return. Default 20, max 100. */
  limit?: number;
  /** Optional sub-domain to filter signals by. */
  domain?: string;
}
```

## Output

```typescript
interface KnowledgeProfileSignalsOutput {
  available: boolean;
  /** If unavailable (mode is self-declared or quiz): */
  reason?: string;
  /** Signal summary statistics. */
  summary: {
    total_signals: number;
    signal_types: Record<string, number>;
    oldest_signal_at: string | null;
    newest_signal_at: string | null;
    retention_policy: string;
  };
  /** Current inferred level derivation info. */
  derivation: {
    current_level: number;
    confidence: number;
    signal_count_since_last_evaluation: number;
    threshold_n: number;
  };
  /** Recent raw signals (up to `limit`). */
  recent_signals: Array<{
    id: number;
    signal_type: string;
    signal_value: number;
    captured_at: string;
    /** JSON metadata (agent name, snippet hash). */
    metadata: Record<string, unknown>;
  }>;
}
```

## Error States

- `SIGNALS_UNAVAILABLE` — mode is "self-declared" or "quiz-derived". No signal set exists.

## Test Vectors

1. Inferred mode with 15 signals → `{ available: true, summary: { total_signals: 15 } }`
2. Self-declared mode → `{ available: false, reason: "Mode is self-declared — no signal set" }`
