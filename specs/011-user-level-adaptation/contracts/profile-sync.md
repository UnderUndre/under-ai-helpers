# Contract: `knowledge_profile_sync`

**MCP Tool**: `knowledge_profile_sync`  
**Module**: `packages/underboard/src/tools/knowledge/profile-sync.ts`

Triggers a sync operation for the current project's profile using the configured transport. Default transport is an AES-256-GCM encrypted JSON file (per FR-023: PBKDF2 ≥600k iterations with distinct salts for verification hash and encryption key; passphrase requested per-operation, never cached, derived key zeroed after use). On conflict, surfaces both versions for user resolution.

**Atomicity guarantees**:
- `push` writes the encrypted file atomically (temp file + `fs.rename`); an interrupted push never leaves a partial encrypted file on disk.
- `pull` validates the GCM authentication tag and the decrypted JSON structure **before** touching local profile state. The local profile is never mutated on a failed or decrypt-failed pull.

## Input

```typescript
interface KnowledgeProfileSyncInput {
  action: "push" | "pull" | "status" | "resolve";
  /** For "resolve": which version to keep. */
  resolution?: "local" | "remote" | "keep-both";
  /** Transport-specific options. */
  options?: {
    /** File path for encrypted-file transport. Overrides stored config. */
    file_path?: string;
  };
}
```

## Output (action: "push")

```typescript
interface KnowledgeProfileSyncPushOutput {
  success: boolean;
  exported: boolean;
  /** Path to the sync file (encrypted-file transport). */
  file_path?: string;
  /** Timestamp of the exported data. */
  snapshot_at: string;
}
```

## Output (action: "pull")

```typescript
interface KnowledgeProfileSyncPullOutput {
  success: boolean;
  imported: boolean;
  /** Whether the imported data conflicted with local state. */
  conflict: boolean;
  /** If conflict: the remote version for user comparison. */
  remote_version?: {
    level_internal: number;
    display_scale: string;
    updated_at: string;
  };
  /** If conflict: the local version. */
  local_version?: {
    level_internal: number;
    display_scale: string;
    updated_at: string;
  };
}
```

## Output (action: "status")

```typescript
interface KnowledgeProfileSyncStatusOutput {
  sync_enabled: boolean;
  transport: string | null;
  last_sync_at: string | null;
  conflict_count: number;
  has_pending_conflict: boolean;
}
```

## Output (action: "resolve")

```typescript
interface KnowledgeProfileSyncResolveOutput {
  success: boolean;
  resolution: string;
  /** The winning level after resolution. */
  resulting_level: number;
}
```

## Error States

- `SYNC_NOT_CONFIGURED` — sync is not enabled for this profile.
- `TRANSPORT_UNAVAILABLE` — transport I/O error: sync file not found, permission denied, disk full, or USB/cloud-drive path unreachable. No data corruption implied.
- `WRONG_PASSPHRASE` — decryption failed at the passphrase stage (GCM tag invalid on the first derived key). Distinct from a corrupt file so the user can retry with the correct passphrase without assuming corruption.
- `CORRUPT_SYNC_FILE` — the file exists and decrypts with a valid passphrase but is not valid JSON, or is structurally incomplete (truncated, schema-mismatch). Recovery: the user must re-push from the machine that last wrote a good file; local state is untouched.
- `CONFLICT_REQUIRES_RESOLUTION` — pull detected a content conflict; user must call `resolve` first. Local state is untouched.

## Test Vectors

1. Push to encrypted file → `{ success: true, file_path: "~/.underboard/sync/011-user-level-adaptation.enc" }`
2. Pull with no conflict → `{ success: true, conflict: false }`
3. Pull with conflict → `{ conflict: true, remote_version: { level_internal: 0.8 }, local_version: { level_internal: 0.3 } }`
4. Resolve keep-local → `{ resolution: "local", resulting_level: 0.3 }`
5. Pull a truncated/rewritten sync file with correct passphrase → error `CORRUPT_SYNC_FILE` (local profile unchanged)
6. Pull with wrong passphrase → error `WRONG_PASSPHRASE` (distinct from CORRUPT_SYNC_FILE)
7. Pull when sync file missing → error `TRANSPORT_UNAVAILABLE`
