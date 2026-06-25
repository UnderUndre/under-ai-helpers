# Research: User-Level Knowledge Adaptation

**Phase 0 output** — resolves all NEEDS CLARIFICATION from Technical Context.

## Resolved Items

### Language & Runtime

- **Decision**: TypeScript 5.x / Node.js 20+ LTS
- **Rationale**: The underboard MCP server is already in TypeScript with `tsconfig.json` targeting Node 20. No language change needed. The feature is a pure extension of underboard.
- **Alternatives considered**: Python (would require a separate server process); Go (would require a new binary). Both rejected — the underboard MCP server is the established integration point, and a second knowledge process adds deployment complexity without benefit.

### Dependencies

- **Decision**: Use only existing underboard dependencies (better-sqlite3, `@modelcontextprotocol/sdk`, consola) plus Node.js built-in `crypto` module for encryption
- **Rationale**: No new npm packages needed. SQLite handles storage, MCP SDK handles tool registration, `crypto.createCipheriv`/`createDecipheriv` with AES-256-GCM handles the encrypted sync file. Adding an external encryption library (e.g., libsodium) would increase the audit surface for a single-user tool where the "attacker" is the user's own cloud drive provider.
- **Alternatives considered**: `libsodium.js` for authenticated encryption; `age` encryption (would require spawning a subprocess). Rejected: crypto is already in the runtime, and AES-256-GCM with a password-derived key via PBKDF2 meets the threat model (sync file at rest in a cloud drive).

### Storage Design

- **Decision**: New migration `004_knowledge_profiles.sql` adding 5 tables to the existing underboard SQLite database
- **Rationale**: The existing migration infrastructure (sequential SQL files + `_migrations` table) is proven. A separate database file would complicate backup/restore and the sync transport already provides a portable export.
- **Tables**: `knowledge_profiles`, `knowledge_sub_domains`, `knowledge_signals`, `knowledge_sync_metadata`, `knowledge_exports`
- **Alternatives considered**: JSON file per project (fragile, no querying); Honcho backend dependency (violates offline constraint). The SQLite approach reuses underboard's existing connection lifecycle.

### Level Internal Representation

- **Decision**: Store as a `REAL` (0.0 – 1.0 continuous) internally. Project to display scales on read.
- **Rationale**: A continuous value can losslessly project onto any discrete scale (3-step thresholds: ≤0.33 beginner, ≤0.66 intermediate, >0.66 expert; 5-step thresholds: ≤0.2 novice, ≤0.4 beginner, ≤0.6 intermediate, ≤0.8 advanced, >0.8 expert). Continuous is the natural representation for an inferred confidence. The scale selector merely changes the projection thresholds, never the stored value.
- **Alternative considered**: Store as enum string. Rejected: switching scales would require data migration or lose precision.

### Signal Threshold Default

- **Decision**: Default N = 10 signals before re-evaluation in inferred/hybrid modes
- **Rationale**: The spec requires a configurable threshold (FR-009). 10 interactions provides enough signal mass for meaningful inference without being so high that the level feels stale. User can configure per-profile.
- **Alternative considered**: 5 (too few — single outlier interaction warps inference); 25 (too many — user thinks adaptation is broken). 10 is the established heuristic from learner-modeling literature.

### Sync Transport (Default)

- **Decision**: AES-256-GCM encrypted JSON file, carried manually by the user (USB / cloud drive of their choice)
- **Rationale**: Zero vendor dependency. The file contains only profiles (no raw signals). The user chooses where to store/copy it. PBKDF2 derives the key from a user-supplied passphrase.
- **Alternatives considered**: Private GitHub gist (vendor lock-in); SyncThing (requires external tool); iCloud/Dropbox API (vendor lock-in, OAuth complexity). The encrypted file is the minimum bar that serves every user. Additional transports can be added as selectable options later.

### Agent-Side Adaptation Architecture

- **Decision**: Codify as a `.claude/skills/knowledge-adaptation/` skill that agents load. The skill teaches agents to:
  1. Call `profile_get` MCP tool at session start (or when switching projects)
  2. Read the level + mode + sub-domain context
  3. Adjust explanation depth, vocabulary, assumed prior knowledge accordingly
  4. Respect mode-specific behavior (e.g., in self-declared mode, never override silently)
  5. Offer calibration on first session when no profile exists
- **Rationale**: Skills are the established mechanism for teaching agents domain-specific behavior. The alternative (teaching every command/agent individually) would require N edits across the codebase.
- **Alternatives considered**: Agent-level instruction in `.claude/agents/` files (too many agents to update); command-level hints in MCP tool descriptions (fragile, no structured guidance).

### Project Identity / Stable Key

- **Decision**: Git remote URL as primary, repo-root path-hash as fallback — matches underboard's existing `stable_key` from spec 005
- **Rationale**: Reuses the existing project detection. The remote URL is machine-independent, enabling the sync transport (FR-011) to map the same project across machines. Path-hash-only projects are flagged as non-syncable.
- **Alternative considered**: User-assigned project name (extra input burden, name collisions). The automatic detection from spec 005 is already proven.

### Signal Capture Path (FR-021, review F2)

- **Decision**: A dedicated MCP tool `knowledge_profile_record_signal` that agents call after each interaction in inferred/hybrid modes. The `knowledge-adaptation` skill teaches agents to call it. The tool appends a structured signal (type, normalized value, optional domain, hashed metadata), applies the retention policy at write time, and triggers a lazy re-evaluation tick when the new-signal-since-last-eval count crosses threshold N.
- **Rationale**: Without an explicit writer, the `knowledge_signals` table stays empty and inferred/hybrid modes never produce a level — the feature's US3 acceptance scenarios 2 & 3 would be untestable. A dedicated tool is the simplest, most testable capture path. The skill is the natural place to instruct agents to call it.
- **Alternatives considered**: (a) Reuse the 007 dialog-capture hook to extract signals from the transcript — proven infra, but couples this feature to 007's normalization and extraction logic; (b) a UserPromptSubmit/Stop hook that extracts signals directly — avoids a new tool, but puts extraction logic in a hook where it is harder to test. The dedicated-tool approach is the most self-contained.

### Sync Encryption Parameters (FR-023, review F3)

- **Decision**: PBKDF2 with ≥600,000 iterations (OWASP 2023 guidance for PBKDF2-HMAC-SHA256), a per-profile random salt (≥16 bytes) for the encryption-key derivation, and a DISTINCT second salt for the passphrase-verification hash (so a leaked verification hash cannot be used to speed up an offline attack on the encryption key). The passphrase is requested per push/pull operation, never cached in the long-lived MCP server process; the derived AES-256-GCM key is zeroed from memory immediately after use. The iteration count is stored per-profile so old profiles can be migrated if the floor rises.
- **Rationale**: The threat model (sync file at rest on a user-controlled cloud drive / USB) means an attacker who obtains the file can brute-force the passphrase offline. Default PBKDF2 iteration counts (e.g., 100k) are brute-forceable on modern GPUs; 600k raises the cost into the impractical range for a passphrase of reasonable entropy. Two distinct salts prevent a single salt compromise from weakening both the verification hash and the encryption key. Per-operation passphrase entry and key zeroing limit the window of memory exposure in the long-lived MCP server process.
- **Alternatives considered**: (a) Argon2id — preferred over PBKDF2 in modern guidance, but Node.js `crypto` does not ship it built-in; adding `argon2` npm package would increase audit surface (rejected per the Dependencies decision above); (b) a single shared salt — simpler, but weakens defense-in-depth.

### Inference Tick Trigger (review F8)

- **Decision**: Lazy write-path tick. Re-evaluation triggers when `knowledge_profile_record_signal` is called AND the count of new signals since the last evaluation crosses threshold N. Additionally, `knowledge_profile_get` runs a cheap staleness check and re-evaluates if new-signal-since-last-eval ≥ N. There is no `setInterval` timer in the MCP server process, no per-interaction re-evaluation, and no reliance on a session-end signal the server does not have.
- **Rationale**: A `setInterval` in a long-lived MCP server process creates background-process lifecycle and battery concerns; per-interaction re-evaluation is wasteful; session-end is not observable by the server. The lazy write-path tick ensures re-evaluation happens exactly when new evidence accrues, and the read-path staleness check covers the case where signals arrive via a path the tick missed.
- **Alternatives considered**: (a) setInterval every T minutes — rejected per above; (b) re-evaluate only on `profile_config` writes — misses inference when the user is read-only.

## Design Decisions Record

| # | Decision | Rationale |
|---|----------|-----------|
| D001 | Extend underboard MCP server (no new package) | Reuses SQLite, MCP SDK, project detection, CLI, event bus |
| D002 | Store level as continuous REAL 0.0–1.0 | Lossless projection onto any display scale |
| D003 | New `src/knowledge/` service layer separate from tools | Tools are thin — services hold business logic |
| D004 | Default N=10 signals before re-evaluation | Startup heuristic from learner-modeling literature |
| D005 | AES-256-GCM encrypted file as default sync transport | Vendor-neutral, always available |
| D006 | Agent adaptation codified as `.claude/skills/knowledge-adaptation/` + registered via CLAUDE.md one-liner + agent frontmatter (FR-022) | Skills = established teaching mechanism; registration guarantees the skill is actually loaded (review F1) |
| D007 | Signal retention default = 30 days (most privacy-protective non-zero) | Balances inference quality with privacy (per FR-018) |
| D008 | Signal capture via dedicated `knowledge_profile_record_signal` MCP tool (FR-021) | Without an explicit writer, the signal set stays empty and inferred/hybrid never produce a level (review F2) |
| D009 | Sync: PBKDF2 ≥600k iterations, distinct salts for verification vs encryption, per-operation passphrase, key zeroed | Raises offline-brute-force cost into impractical range; limits memory exposure in the long-lived MCP process (FR-023, review F3) |
| D010 | Inference re-evaluation on a lazy write-path tick + read-path staleness check | Re-evaluates exactly when new evidence accrues; no setInterval, no session-end dependency (review F8) |
