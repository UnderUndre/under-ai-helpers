# Contract: `knowledge_profile_get`

**MCP Tool**: `knowledge_profile_get`  
**Module**: `packages/underboard/src/tools/knowledge/profile-get.ts`

Reads the active knowledge profile for the current project (identified by `project_id` from tool context). Returns the level in the profile's active display scale, assessment mode, sub-domain expansions (if any), and the level source.

## Input

```typescript
interface KnowledgeProfileGetInput {
  /** Optional: specific sub-domain to query. If omitted, returns global level. */
  domain?: string;
}
```

## Output

```typescript
interface KnowledgeProfileGetOutput {
  /** Whether a profile exists for this project. */
  exists: boolean;
  /** The level value in the profile's active display scale.
   *  3-step scale: "beginner" | "intermediate" | "expert"
   *  5-step scale: "novice" | "beginner" | "intermediate" | "advanced" | "expert"
   *  continuous: 0.0–1.0
   */
  level: string | number | null;
  /** Internal continuous value 0.0–1.0 (always available regardless of display scale). */
  level_internal: number | null;
  /** Active assessment mode. */
  assessment_mode: "self-declared" | "inferred" | "hybrid" | "quiz";
  /** Source of the current level value. */
  level_source: "self-declared" | "inferred" | "quiz-derived" | null;
  /** Active display scale. */
  display_scale: "3" | "5" | "continuous";
  /** If `domain` was specified, whether a per-domain override exists. */
  is_domain_override: boolean;
  /** All sub-domain expansions, if any. Null if no expansions exist. */
  sub_domains: Array<{
    domain: string;
    level: string | number;
    level_source: string;
  }> | null;
  /** When profile does not exist or level is unknown — neutral fallback indicator. */
  has_known_level: boolean;
  /** Timestamp of last profile update. */
  updated_at: string | null;
}
```

## Error States

- `PROFILE_NOT_FOUND` (exists=false, has_known_level=false) — first use for this project. Agent MUST offer to calibrate.
- `PROFILE_CORRUPT` — database row exists but level_internal is out of range or required fields missing. Agent MUST degrade to neutral default and signal error.

## Agent Behavior (Consumer)

- If `exists=false`: agent MUST use neutral explanation depth and offer to calibrate at the first natural opportunity (end of first response).
- If `has_known_level=true`: agent MUST adapt explanation to the returned level.
- If `is_domain_override=true` and the conversation touches the specified domain: agent MUST use the sub-domain level instead of the global level.

## Test Vectors

1. Self-declared beginner on 3-step scale → `{ level: "beginner", level_internal: 0.15, assessment_mode: "self-declared" }`
2. Expert on 5-step scale → `{ level: "expert", level_internal: 0.92, display_scale: "5" }`
3. Inferred continuous → `{ level: 0.65, level_internal: 0.65, assessment_mode: "inferred" }`
4. No profile → `{ exists: false, level: null, has_known_level: false }`
5. Sub-domain override for "frontend" → `{ level: "expert", is_domain_override: true }`
