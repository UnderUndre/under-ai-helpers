# Quickstart: Memory Backend — Honcho Integration

**Feature**: 008-memory-backend-honcho | **Date**: 2026-06-13

## Prerequisites

- Node.js 20+ LTS
- Docker Desktop (running)
- Honcho v3.0.9 stack running (`infra-honcho-1`, `infra-postgres-1`, `infra-tei-embed-1`, `infra-redis-1`)
- Honcho API key (bearer token)

## Verify Honcho Is Running

```powershell
# From inside the honcho container (Windows curl.exe has IPv6 issues with localhost)
docker exec infra-honcho-1 python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/health').read().decode())"
```

Expected: JSON with status info.

## Configure Underboard

### Environment Variable

Set the Honcho API key (obtain from your Honcho instance configuration):

```powershell
$env:HONCHO_API_KEY = "your-honcho-bearer-token"
```

### Config File

Create or edit `~/.underboard/config.json` (or use c12-supported paths):

```json
{
  "memory_backend": "honcho",
  "honcho_endpoint": "http://127.0.0.1:8083",
  "honcho_token_env": "HONCHO_API_KEY",
  "honcho_pinned_version": "3.0.9",
  "sync_interval_ms": 10000,
  "deep_recall_enabled": false
}
```

**Key fields**:
- `memory_backend`: `"honcho"` (default) or `"local_lexical"` (offline-only).
- `honcho_endpoint`: MUST use `127.0.0.1`, NOT `localhost` (IPv6 workaround).
- `honcho_token_env`: Name of the environment variable holding the API key. The key itself is never stored in config files.

### Lexical-Only Mode (No Honcho)

```json
{
  "memory_backend": "local_lexical"
}
```

No Honcho dependency. FTS5/BM25 recall only.

## Build & Run

```powershell
cd packages/underboard
npm install
npm run build
npm start
# Or: node dist/cli/index.js start --port 8090
```

## Verify

```powershell
# Health check (requires underboard token)
$token = Get-Content "$env:USERPROFILE\.underboard\token"
Invoke-RestMethod "http://127.0.0.1:8090/health" -Headers @{ Authorization = "Bearer $token" }
```

Expected response includes:
```json
{
  "embedding_model_status": "deprecated",
  "memory_backend": "honcho",
  "honcho_reachable": true,
  "honcho_version": "3.0.9",
  "sync_queue_depth": 0,
  "degraded": false
}
```

## Test Write + Recall

From any MCP client (Claude Code, etc.) connected to underboard:

1. Write a memory: `memory_write({ content: "Auth uses JWT with 1h TTL" })`
2. Recall with a paraphrase: `memory_recall({ query: "how does token expiry work?" })`
3. Verify the note appears in top results with `backend_status: "semantic"`.

## Test Degradation

```powershell
docker stop infra-honcho-1
# Write a memory → should succeed with sync_status: "pending"
# Recall → should return lexical results with backend_status: "lexical_only"
docker start infra-honcho-1
# Wait ~10s for reconciler
# Recall again → should return semantic results
```

## Migration from 005 (Clean Install)

If upgrading from spec 005 underboard:

1. Migration 002 applies automatically on next startup.
2. Existing `memory_entries` rows have `embedding_status = "pending"` — these are ignored.
3. Existing rows get `sync_status = "synced"` (default). If Honcho backend is active, run `underboard memory resync` to push existing entries to Honcho.
4. The `embedding` and `embedding_status` columns remain in the DB but are no longer read.

## Development

```powershell
cd packages/underboard
npm run dev          # tsc --watch
npm test             # vitest run
npm run test:unit    # unit only
npm run test:integration  # integration (requires Honcho stack)
npm run validate     # tsc --noEmit
```
