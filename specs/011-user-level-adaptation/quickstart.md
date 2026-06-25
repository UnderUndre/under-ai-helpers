# Quickstart: User-Level Knowledge Adaptation

## Prerequisites

- Node.js 20+ LTS
- underboard MCP server running (local, see `packages/underboard/README.md`)
- `npm install` in `packages/underboard/`

## Development Setup

```bash
# From repo root
cd packages/underboard

# Run tests
npm run test:unit                    # Unit tests only
npm run test:integration -- --grep "knowledge"  # Knowledge integration tests

# Type check
npx tsc --noEmit

# Start underboard with knowledge profile debugging
npm run dev -- --debug-knowledge
```

## Test Scenarios

> **Transport note**: the underboard MCP server speaks **JSON-RPC over stdio/SSE** via the MCP SDK, NOT a plain REST `POST /mcp` with `{tool, input}`. The `curl` snippets below are **illustrative pseudo-calls** showing the tool name and input shape; they are not runnable as-is. To exercise these tools for real, use an MCP client (e.g., `mcp-cli`, or the client wired into the underboard dev harness). The default port for the underboard server is **4280** (per feature 009, configurable) — not 3100. Replace the pseudo-calls with a real MCP client invocation when running the scenarios; the tool names and input shapes are the contract.

### US1 — Adaptive Explanation

```bash
# Set up a profile with known level (pseudo-call — use a real MCP client)
mcp call knowledge_profile_set '{"level":"beginner"}' --port 4280

# Query the profile
mcp call knowledge_profile_get '{}' --port 4280
# Expected: { "exists": true, "level": "beginner", "level_internal": 0.15, ... }

# Change level
mcp call knowledge_profile_set '{"level":"expert"}' --port 4280

# Verify change
mcp call knowledge_profile_get '{}' --port 4280
# Expected: { "exists": true, "level": "expert", "level_internal": 0.85, ... }
```

### US2 — Private Storage

```bash
# Create a profile (stored in ~/.underboard/data.db, never in git)
mcp call knowledge_profile_set '{"level":"intermediate"}' --port 4280

# Verify git exclusion
cd /path/to/project
git status                # No profile files appear
git add -A && git status  # Still clean — profile is in ~/.underboard/

# Export anonymized profile
mcp call knowledge_profile_export '{}' --port 4280
# Expected: { "artifact": { "level": "intermediate", "version": 1, ... } }

# Forget/remove profile
mcp call knowledge_profile_forget '{"confirm":true}' --port 4280
# Expected: { "success": true, "exports_revoked": true }
```

### US3 — Assessment Modes

```bash
# Switch to self-declared mode
mcp call knowledge_profile_config '{"assessment_mode":"self-declared"}' --port 4280

# Switch to inferred mode
mcp call knowledge_profile_config '{"assessment_mode":"inferred"}' --port 4280

# Record an observed signal (the capture path — agents call this after each interaction in inferred/hybrid)
mcp call knowledge_profile_record_signal '{"signal_type":"vocabulary_level","signal_value":0.7}' --port 4280

# View auditable signals (inferred/hybrid modes only)
mcp call knowledge_profile_signals '{}' --port 4280

# Switch to quiz mode and start calibration
mcp call knowledge_profile_quiz '{"action":"start"}' --port 4280

# Answer quiz question
mcp call knowledge_profile_quiz '{"action":"answer","question_id":"q1","answer":"option_b"}' --port 4280

# Switch display scale (no data loss)
mcp call knowledge_profile_config '{"display_scale":"5"}' --port 4280

# Verify continuous scale still projects correctly
mcp call knowledge_profile_config '{"display_scale":"continuous"}' --port 4280

# Hybrid mode: accept a proposed revision
mcp call knowledge_profile_config '{"assessment_mode":"hybrid"}' --port 4280
# ... accumulate signals until engine proposes ...
mcp call knowledge_profile_config '{"accept_proposed_revision":true}' --port 4280
```

### US4 — Per-Project Context

```bash
# Project A: set expert
mcp call knowledge_profile_set '{"level":"expert"}' --port 4280

# Expand sub-domain for Project A (canonical vocab: frontend/backend/database/devops/security/docs)
mcp call knowledge_profile_config '{"expand_domain":"frontend"}' --port 4280

# Set a different sub-domain level
mcp call knowledge_profile_set '{"level":"beginner","domain":"frontend"}' --port 4280

# Query with domain override
mcp call knowledge_profile_get '{"domain":"frontend"}' --port 4280
# Expected: { "level": "beginner", "is_domain_override": true }

# Collapse sub-domain (reverts to global)
mcp call knowledge_profile_config '{"collapse_domain":"frontend"}' --port 4280

# Verify reversion to global
mcp call knowledge_profile_get '{"domain":"frontend"}' --port 4280
# Expected: { "level": "expert", "is_domain_override": false }
```

### US5 — Sync

```bash
# Configure the project's assessment mode first
mcp call knowledge_profile_config '{"assessment_mode":"self-declared"}' --port 4280

# Enable sync for the profile (sync_enabled is a profile field; set it via profile-config's sync options)
mcp call knowledge_profile_config '{"sync_enabled":true,"sync_transport":"encrypted-file"}' --port 4280

# Push the encrypted sync file (passphrase requested per-operation, never cached)
mcp call knowledge_profile_sync '{"action":"push","options":{"file_path":"/tmp/knowledge-sync.enc"}}' --port 4280

# On second machine, pull the profile
mcp call knowledge_profile_sync '{"action":"pull","options":{"file_path":"/tmp/knowledge-sync.enc"}}' --port 4280

# Check sync status
mcp call knowledge_profile_sync '{"action":"status"}' --port 4280
# Expected: { "sync_enabled": true, "last_sync_at": "...", "conflict_count": 0 }
```

## Unit Tests

```bash
# Run specific knowledge module tests
cd packages/underboard
npx vitest run tests/knowledge/         # All unit tests
npx vitest run tests/knowledge/profile-service.test.ts
npx vitest run tests/knowledge/inference-engine.test.ts
npx vitest run tests/knowledge/quiz-engine.test.ts
npx vitest run tests/knowledge/sync-service.test.ts
npx vitest run tests/knowledge/signal-retention.test.ts

# Integration test
npx vitest run tests/integration/knowledge-profile.test.ts

# Coverage
npx vitest run --coverage tests/knowledge/
```

## Evaluation Probe (SC-001/SC-002)

Run the evaluation probe set to verify adaptive explanation quality:

```bash
cd packages/underboard
npx tsx tests/knowledge/eval-probes.ts --probes probes.json --judge llm
```

Expected: ≥80% of probes correctly matched to target level (SC-001), ≥75% paired beginner/expert renderings distinguishable (SC-002).

## Git Privacy Verification (SC-003)

```bash
# After profile is created and used:
cd /path/to/project
git status --short          # Must be empty — no profile files leaked
git ls-files --exclude-standard --others  # Must not contain profile data
```

## Scenario: Fresh Project (No Profile)

1. Start a new session in a project without a profile
2. Ask a question (e.g., "explain how this CI pipeline works")
3. Assistant responds at neutral depth + offers: "I don't know your experience level yet. Would you like to set it?"
4. User: "I'm a beginner"
5. Subsequent explanations use beginner-level language

## Scenario: Per-Project Levels

1. Set Project A to "expert", Project B to "beginner"
2. Ask the same question in each (e.g., "explain database migrations")
3. Project A response uses precise technical terminology
4. Project B response uses plain-language analogies
5. Switch projects mid-session — adaptation follows the active project

## Scenario: Inferred Mode Audit

1. Switch to inferred mode on a project with ≥10 interactions
2. Ask "what level do you think I am?" (triggers `profile_signals` on demand)
3. Assistant responds with current inferred level and signal summary
4. User sees the evidence and can confirm or override via hybrid mode

## Scenario: Sync Conflict

1. On Machine A: set level "expert", push sync file
2. On Machine B: set level "beginner", pull sync file (conflict detected)
3. Machine B displays both versions and asks user to choose
4. User resolves: keep local ("beginner")
5. Sync status shows resolved conflict

## Performance Expectations

- `knowledge_profile_get`: < 20ms (SQLite lookup, single row)
- `knowledge_profile_set`: < 30ms (single row update)
- `knowledge_profile_config`: < 30ms (config update)
- `knowledge_profile_sync push`: < 200ms (encrypt + write file)
- `knowledge_profile_forget`: < 100ms (CASCADE delete)
- Inference re-evaluation: lazy write-path tick (triggered when new-signal-since-last-eval ≥ N) + read-path staleness check; never a setInterval, never in the request path
