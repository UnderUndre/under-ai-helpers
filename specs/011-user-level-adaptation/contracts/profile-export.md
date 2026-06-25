# Contract: `knowledge_profile_export`

**MCP Tool**: `knowledge_profile_export`  
**Module**: `packages/underboard/src/tools/knowledge/profile-export.ts`

Produces an anonymized, shareable export artifact containing only the level classification — never raw interaction history or identifying signals (FR-005). Tracks the export for later revocation (FR-013).

## Input

```typescript
interface KnowledgeProfileExportInput {
  /** Optional: export specific sub-domains instead of the global level. */
  domains?: string[];
}
```

## Output

```typescript
interface KnowledgeProfileExportOutput {
  success: boolean;
  /** The export artifact content (anonymized). User should copy/store this. */
  artifact: {
    /** Schema version for forward compatibility. */
    version: 1;
    /** Level value in display scale. */
    level: string | number;
    /** Display scale used. */
    display_scale: string;
    /** Sub-domain levels, if any. */
    sub_domains?: Record<string, string | number>;
    /** Export timestamp. */
    exported_at: string;
    /** Artifact hash (used for revocation). */
    hash: string;
    /** No raw signals, no project identity, no user identity. */
  };
  /** The artifact hash for revocation reference. */
  hash: string;
}
```

## Error States

- `NO_PROFILE` — no profile exists for this project.
- `EMPTY_DOMAINS` — all requested domains have no level data.

## Test Vectors

1. Export beginner level → `{ artifact: { level: "beginner", hash: "abc123" } }`
2. Export with sub-domains → `{ artifact: { level: "intermediate", sub_domains: { frontend: "expert" } } }`
