# Data Model: User-Level Knowledge Adaptation

## Entity Overview

Adapted from spec.md Key Entities section. All storage is in the underboard SQLite database (`~/.underboard/data.db`) via migration `004_knowledge_profiles.sql`.

## Entity: KnowledgeProfile

The per-project record of the user's knowledge level. One row per project (identified by `stable_key`).

| Field | Type | Description |
|-------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `project_id` | TEXT UNIQUE NOT NULL | Project stable_key (git remote URL or repo-root path-hash) |
| `assessment_mode` | TEXT NOT NULL | Enumerated: `self-declared`, `inferred`, `hybrid`, `quiz` |
| `level_internal` | REAL NOT NULL | Continuous value 0.0–1.0 (lossless internal representation) |
| `level_source` | TEXT NOT NULL | Source of current level: `self-declared`, `inferred`, `quiz-derived` |
| `display_scale` | TEXT NOT NULL DEFAULT '3' | Active display scale: `3` (3-step), `5` (5-step), `continuous` |
| `retention_days` | INTEGER DEFAULT 30 | Signal retention policy: NULL=forever, 0=off, 30, 90. DEFAULT 30 enforces the most privacy-protective non-zero option at the DB layer (FR-015) |
| `inference_threshold_n` | INTEGER NOT NULL DEFAULT 10 | N signals before re-evaluation (FR-009) |
| `sync_enabled` | INTEGER NOT NULL DEFAULT 0 | Boolean — opt-in sync |
| `sync_transport` | TEXT | Transport type: `encrypted-file`, NULL if sync disabled |
| `sync_encryption_salt` | TEXT NOT NULL IF sync_enabled | Base64 random salt (≥16 bytes) used for AES-256-GCM key derivation. Passphrase correctness is verified solely via the GCM authentication tag — no separate verification hash is stored (FR-023) |
| `sync_pbkdf2_iterations` | INTEGER NOT NULL IF sync_enabled | Iteration count for PBKDF2 (≥600000 per FR-023). Stored so old profiles can be migrated if the floor rises |
| `proposed_level_internal` | REAL | Pending hybrid-mode revision target (NULL when no proposal active). Set by inference engine; promoted to `level_internal` only on user accept (FR-019) |
| `proposed_level_source` | TEXT | Source of the pending proposal: `inferred`. NULL when no proposal active |
| `proposed_at` | TEXT | ISO-8601 timestamp of when the proposal was generated. Used for staleness (FR-019): a proposal older than the staleness window MUST be re-evaluated, not honored |
| `last_inference_at` | TEXT | ISO-8601 timestamp of the last evaluation run. Used to compute the lazy evaluation tick boundary (FR-009): the next `profile_record_signal` tick compares signals captured since this timestamp against `inference_threshold_n` |
| `signals_since_last_eval` | INTEGER NOT NULL DEFAULT 0 | Counter of newly accumulated signals since `last_inference_at`. Incremented on each `profile_record_signal`; reset to 0 when an evaluation run fires (inferred refresh or hybrid proposal). Drives the lazy tick decision without scanning the signal set on every write |
| `created_at` | TEXT NOT NULL | ISO-8601 timestamp |
| `updated_at` | TEXT NOT NULL | ISO-8601 timestamp |

**Constraints**:
- `assessment_mode` CHECK IN (`self-declared`, `inferred`, `hybrid`, `quiz`)
- `level_source` CHECK IN (`self-declared`, `inferred`, `quiz-derived`)
- `display_scale` CHECK IN (`3`, `5`, `continuous`)
- `level_internal` CHECK (0.0 <= level_internal <= 1.0)
- `project_id` UNIQUE (one profile per project)
- `proposed_level_internal` CHECK (proposed_level_internal IS NULL OR (0.0 <= proposed_level_internal <= 1.0))
- Sync fields (`sync_encryption_salt`, `sync_pbkdf2_iterations`) are all-required-or-all-absent based on `sync_enabled`
- Per FR-023: the derived AES key MUST be zeroed from process memory immediately after encryption/decryption; the passphrase MUST NOT be cached in the long-lived MCP server process

**Relationships**:
- Has zero or more `KnowledgeSubDomain` rows (expanded per-sub-domain levels)
- Has zero or more `KnowledgeSignal` rows (raw interaction cues, only in inferred/hybrid modes)
- Has zero or one `KnowledgeSyncMetadata` row (sync state tracking)
- Has zero or more `KnowledgeExport` rows (revocation tracking)

## Entity: KnowledgeSubDomain

Optional per-project expansion that splits the global level into domain-specific levels. Un-expanded domains inherit the parent profile's `level_internal`.

| Field | Type | Description |
|-------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `profile_id` | INTEGER NOT NULL FK | References `KnowledgeProfile.id` ON DELETE CASCADE |
| `domain_name` | TEXT NOT NULL | Canonical domain identifier, case-folded and validated against the canonical vocabulary (FR-020): `frontend`, `backend`, `database`, `devops`, `security`, `docs`. Unknown values rejected at the application layer |
| `level_internal` | REAL NOT NULL | Continuous value 0.0–1.0 for this domain |
| `level_source` | TEXT NOT NULL | `self-declared`, `inferred`, `quiz-derived` |
| `created_at` | TEXT NOT NULL | ISO-8601 timestamp |
| `updated_at` | TEXT NOT NULL | ISO-8601 timestamp |

**Constraints**:
- UNIQUE(`profile_id`, `domain_name`)
- `level_internal` CHECK (0.0 <= level_internal <= 1.0)

## Entity: KnowledgeSignal

Raw interaction cues used by the inference engine in inferred and hybrid modes. Subject to the profile's retention policy.

| Field | Type | Description |
|-------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `profile_id` | INTEGER NOT NULL FK | References `KnowledgeProfile.id` ON DELETE CASCADE |
| `signal_type` | TEXT NOT NULL | Signal category (e.g., `vocabulary_level`, `question_depth`, `concept_familiarity`, `correction_frequency`, `code_complexity`) |
| `signal_value` | REAL NOT NULL | Normalized value 0.0–1.0 |
| `signal_metadata` | TEXT | JSON blob: agent name, conversation snippet hash, confidence |
| `captured_at` | TEXT NOT NULL | ISO-8601 timestamp |
| `expires_at` | TEXT | NULL if retention is "forever", otherwise `captured_at + retention_days` |

**Constraints**:
- INDEX ON `profile_id, expires_at` (for retention pruning)
- INDEX ON `profile_id, captured_at` (for inference ordering)

## Entity: KnowledgeSyncMetadata

Tracks the sync state for a profile that has opted into sync.

| Field | Type | Description |
|-------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `profile_id` | INTEGER UNIQUE NOT NULL FK | References `KnowledgeProfile.id` ON DELETE CASCADE |
| `last_sync_at` | TEXT | ISO-8601 timestamp of last successful sync |
| `last_export_hash` | TEXT | SHA-256 hash of the last exported sync file |
| `conflict_count` | INTEGER NOT NULL DEFAULT 0 | Total sync conflicts encountered |
| `last_conflict_at` | TEXT | ISO-8601 timestamp of last conflict |
| `transport_config` | TEXT | JSON: transport-specific configuration (e.g., `{"file_path": "/path/to/sync/file"}`) |

## Entity: KnowledgeExport

Tracks export artifacts for revocation support (FR-005, FR-013).

| Field | Type | Description |
|-------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `profile_id` | INTEGER NOT NULL FK | References `KnowledgeProfile.id` ON DELETE CASCADE |
| `export_hash` | TEXT NOT NULL | SHA-256 hash of the exported artifact content |
| `level_internal` | REAL NOT NULL | Level value at time of export (continuous) |
| `display_scale` | TEXT NOT NULL | Scale used in export |
| `exported_at` | TEXT NOT NULL | ISO-8601 timestamp |
| `revoked_at` | TEXT | ISO-8601 timestamp of revocation (NULL if not revoked) |

**Constraints**:
- If `revoked_at` is set, the export is considered revoked. The local profile tracks this so that re-exporting won't silently re-share the same snapshot.

## State Transitions

### Assessment Mode Transitions

```
self-declared ←→ inferred ←→ hybrid ←→ quiz
     ↑              ↑          ↑
     └──────────────┴──────────┘  (any mode to any other mode)
```

- Switching modes preserves all data. No signal set is destroyed.
- Signal set grows only in inferred/hybrid modes.
- Quiz mode: on trigger, generates a quiz; on completion, sets level_source = `quiz-derived`.

### Level Source Transitions

```
self-declared → (user sets level directly)
inferred       → (engine updates level_internal on N signals; FR-009 cadence)
quiz-derived   → (quiz completion sets level_internal)
hybrid         → (engine PROPOSES: writes proposed_level_internal + proposed_at
                  → user ACCEPT: proposed_level_internal promoted to level_internal, proposal cleared
                  → user REJECT: proposal cleared, level_internal unchanged
                  → STALE: proposed_at older than window → re-evaluate, do not honor)
```

### Profile Lifecycle

```
Created → Active → (optional) Synced → Exported → (optional) Revoked
                → Deleted (forget/remove)
```

- Created: first profile write (any mode).
- Active: profile exists and is consulted by agents.
- Deleted: forget/remove destroys all associated rows (CASCADE).
