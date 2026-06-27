# Contract: `knowledge_profile_forget`

**MCP Tool**: `knowledge_profile_forget`  
**Module**: `packages/underboard/src/tools/knowledge/profile-forget.ts`

Destroys the local profile and all associated data (signals, sub-domains, sync metadata). Marks any outstanding export artifacts as revoked. After this operation, the project returns to "unprofiled" state.

## Input

```typescript
interface KnowledgeProfileForgetInput {
  /** Optional confirmation flag. MUST be true to proceed. */
  confirm: boolean;
}
```

## Output

```typescript
interface KnowledgeProfileForgetOutput {
  success: boolean;
  /** Number of rows deleted across all tables (profile + signals + sub-domains + sync + exports). */
  deleted_rows: number;
  /** Whether any exports were marked as revoked. */
  exports_revoked: boolean;
}
```

## Error States

- `CONFIRMATION_REQUIRED` — `confirm` was false. This is a destructive action and requires explicit confirmation.

## Test Vectors

1. Forget with confirmation → `{ success: true, exports_revoked: true }`
2. Forget without confirmation → error `CONFIRMATION_REQUIRED`
