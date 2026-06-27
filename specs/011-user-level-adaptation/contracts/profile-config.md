# Contract: `knowledge_profile_config`

**MCP Tool**: `knowledge_profile_config`  
**Module**: `packages/underboard/src/tools/knowledge/profile-config.ts`

Configures the assessment mode, display scale, retention policy, sub-domain expansion, and inference threshold for the current project's profile. Creates a profile entry if none exists (with neutral defaults).

## Input

```typescript
interface KnowledgeProfileConfigInput {
  /** New assessment mode. Omit to keep current. */
  assessment_mode?: "self-declared" | "inferred" | "hybrid" | "quiz";
  /** New display scale. Omit to keep current. */
  display_scale?: "3" | "5" | "continuous";
  /** Enable or disable sync for this profile. Omit to keep current. */
  sync_enabled?: boolean;
  /** Selected transport when sync is enabled. Omit to keep current. */
  sync_transport?: "encrypted-file" | "private-gist" | "cloud-secret" | "provider";
  /** Signal retention in days. null=forever, 0=off (aggregate only), 30, 90. Omit to keep current. */
  retention_days?: number | null;
  /** N signals before re-evaluation (inferred/hybrid modes). Omit to keep default (10). */
  inference_threshold_n?: number;
  /** Expand a sub-domain (creates a per-domain entry inheriting the current global level).
   *  Case-folded against the canonical vocabulary (FR-020). Call again with a different level to set a specific sub-domain level. */
  expand_domain?: "frontend" | "backend" | "database" | "devops" | "security" | "docs";
  /** Remove a sub-domain expansion (reverts to global inheritance). Case-folded against the canonical vocabulary. */
  collapse_domain?: "frontend" | "backend" | "database" | "devops" | "security" | "docs";
  /** Accept a pending hybrid-mode proposal (FR-019). Promotes proposed_level_internal to level_internal and clears the proposal. */
  accept_proposed_revision?: boolean;
  /** Reject a pending hybrid-mode proposal (FR-019). Clears the proposal without changing level_internal. */
  reject_proposed_revision?: boolean;
}
```

## Output

```typescript
interface KnowledgeProfileConfigOutput {
  success: boolean;
  profile_id: number;
  /** The effective config after applying changes. */
  effective: {
    assessment_mode: string;
    display_scale: string;
    sync_enabled: boolean;
    sync_transport: string | null;
    retention_days: number | null;
    inference_threshold_n: number;
    sub_domains: string[];
  };
  /** Current pending proposal, if any (hybrid mode). */
  pending_proposal?: {
    proposed_level_internal: number;
    proposed_level_source: string;
    proposed_at: string;
    /** Whether the proposal is stale (older than the staleness window). */
    is_stale: boolean;
  };
}
```

## Error States

- `INVALID_RETENTION` — retention_days not in allowed set (null, 0, 30, 90).
- `INVALID_THRESHOLD` — inference_threshold_n < 1.
- `INVALID_SYNC_TRANSPORT` — sync_transport not supported by this build or provided while `sync_enabled=false`.
- `DOMAIN_ALREADY_EXPANDED` — expand_domain already exists (use profile-set with domain to change its level).
- `DOMAIN_NOT_FOUND` — collapse_domain does not exist.
- `UNKNOWN_DOMAIN` — expand/collapse domain not in the canonical vocabulary (FR-020).
- `MODE_SWITCH_WITHOUT_DATA` — switching to "inferred" or "hybrid" is always allowed (signals accumulate from that point).
- `NO_PENDING_PROPOSAL` — accept_proposed_revision/reject_proposed_revision set but no proposal is active.
- `PROPOSAL_IS_STALE` — accept_proposed_revision set on a stale proposal; the engine re-evaluates instead (FR-019). Call again after re-evaluation produces a fresh proposal.
- `AMBIGUOUS_PROPOSAL_ACTION` — both accept_proposed_revision and reject_proposed_revision set.

## Test Vectors

1. Switch to inferred mode → `{ effective: { assessment_mode: "inferred" } }`
2. Enable sync with encrypted file → `{ effective: { sync_enabled: true, sync_transport: "encrypted-file" } }`
3. Expand domain "devops" → `{ effective: { sub_domains: ["devops"] } }`
4. Collapse domain "frontend" → `{ effective: { sub_domains: [] } }`
5. Set retention to 90 days → `{ effective: { retention_days: 90 } }`
6. Accept a fresh hybrid proposal → `{ success: true, pending_proposal: undefined }`
7. Reject a hybrid proposal → `{ success: true, pending_proposal: undefined }`
8. Expand unknown domain "qa" → error `UNKNOWN_DOMAIN`
