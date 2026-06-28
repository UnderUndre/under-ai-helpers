# Contract: `knowledge_profile_set`

**MCP Tool**: `knowledge_profile_set`  
**Module**: `packages/underboard/src/tools/knowledge/profile-set.ts`

Sets or updates the user's self-declared knowledge level for the current project. Creates a profile entry if none exists (with assessment_mode = "self-declared").

## Input

```typescript
interface KnowledgeProfileSetInput {
  /** Level value. For discrete scales: string label matching the active scale.
   *  For continuous: number 0.0–1.0. */
  level: string | number;
  /** Optional: specific sub-domain this value applies to. If omitted, sets the global level. */
  domain?: string;
}
```

## Output

```typescript
interface KnowledgeProfileSetOutput {
  success: boolean;
  /** The profile ID (newly created or existing). */
  profile_id: number;
  /** Whether this was a new profile creation. */
  created: boolean;
}
```

## Error States

- `INVALID_LEVEL` — level value doesn't match the active scale's vocabulary or range.
- `INVALID_MODE` — cannot use this tool when assessment_mode is "inferred" (user must switch to self-declared or hybrid first).

## Test Vectors

1. Set beginner on fresh project → `{ success: true, created: true }`
2. Change from beginner to expert → `{ success: true, created: false }`
3. Invalid level value `"super-expert"` → error `INVALID_LEVEL`
