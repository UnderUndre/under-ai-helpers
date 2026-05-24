# GitHub API Surface — Fleet Sync

Exact endpoints used, parameters, and error handling. Stable contract between `core/fleet/github-api.ts` and the rest of the feature.

## Endpoints used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /user/repos?affiliation=owner&per_page=100&page={n}` | GET | Enumerate authenticated user's repos |
| `GET /orgs/{org}/repos?type=all&per_page=100&page={n}` | GET | Enumerate org repos |
| `GET /repos/{owner}/{repo}` | GET | Resolve repo details (archived/disabled, default branch) — only used if explicit `--repo` provided and not already discovered |
| `GET /repos/{owner}/{repo}/contents/helpers-lock.json?ref={defaultBranch}` | GET | Read lockfile content (Base64-encoded) |
| `GET /repos/{owner}/{repo}/commits?path=helpers-lock.json&sha={defaultBranch}&per_page=1` | GET | Most recent commit touching lockfile (`lastSyncAt`) |
| `GET /repos/UnderUndre/ai/releases/latest` | GET | Latest release of clai-helpers itself (resolved once per session) |
| `GET /repos/{owner}/{repo}/pulls?state=open&head={owner}:{branchName}` | GET | Find existing open PR for the bump branch (idempotency) |
| `POST /repos/{owner}/{repo}/pulls` | POST | Open new PR (mode `pr` only) |

No write endpoints used outside mode `pr`. Mode `push` writes via spawned `git push`. Mode `patch` writes only to local fs.

## Auth

Every request:

```
Accept: application/vnd.github+json
Authorization: Bearer <token>
User-Agent: clai-helpers/<cli-version>
```

Token resolved via existing `core/fetch.ts → resolveAuth()`. Required scopes:

| Scope | When needed |
|-------|-------------|
| `public_repo` | Public repos only |
| `repo` | Private repos (read + write — write is needed for PR mode + push mode) |

If a private repo is encountered with insufficient scope → that entry's `state` becomes `"unreadable"` with `unreadableReason: "insufficient token scope (need 'repo' for private)"`. Other entries continue.

## Pagination

Endpoints returning lists (`/user/repos`, `/orgs/{org}/repos`) use cursor pagination:
- Read `Link` header.
- Follow `rel="next"` until absent.
- Aggregate results in memory (fleets are small enough; no streaming needed for v1).

## Rate-limit handling

Per response:

```
X-RateLimit-Limit:     5000
X-RateLimit-Remaining: <n>
X-RateLimit-Reset:     <unix-timestamp>
```

Strategy:
- If `X-RateLimit-Remaining < 50` → log warning + slow down to ≤1 req/sec.
- If response is `403` with header `x-ratelimit-remaining: 0` → wait until `Reset` (or fail entry if wait > 60s) and retry once.
- If response is `403` with `Retry-After` header (secondary rate limit) → honor exactly, retry up to 3 times with cap.
- Beyond retry budget → throw `FleetError("github/rate-limited", ...)`.

## Error response handling

| HTTP | Treatment |
|------|-----------|
| `200` / `201` | Success, parse JSON |
| `304` | Not Modified (cache hit). Return empty body/previous data without parsing JSON. |
| `401` | `auth/missing` or `auth/insufficient-scope` (depends on whether token was sent) |
| `403` (with rate-limit headers) | Apply rate-limit retry strategy |
| `403` (no rate-limit headers) | `auth/insufficient-scope` |
| `404` | `github/repo-not-found` (e.g., explicit `--repo` arg names a non-existent repo) |
| `409` (PR open with conflict) | `git/push-rejected` or skip "PR conflict, repo has divergent default branch" |
| `422` (PR creation refused) | Surface validation errors — branch already exists, base ref invalid, etc. Map to `github/api-error` |
| `5xx` | Retry once with 2s backoff, then `github/network` |

## Lockfile parsing

Response from `GET /repos/{owner}/{repo}/contents/helpers-lock.json`:

```json
{
  "content": "<base64>",
  "encoding": "base64",
  "sha": "<blob-sha>",
  "size": 1234,
  "name": "helpers-lock.json",
  "path": "helpers-lock.json",
  ...
}
```

Decode `content`, parse JSON, validate against `helpers-lock.json` schema (existing, in `packages/cli/src/core/manifest.ts`):

```ts
{ ref: string; source: string; ... }
```

If parse fails → `state: "unreadable"`, `unreadableReason: "lockfile malformed at HEAD"`.

If file missing (404) → repo is filtered out of the fleet (it doesn't have clai-helpers installed at the root).

## PR creation request

`POST /repos/{owner}/{repo}/pulls`:

```json
{
  "title": "chore(deps): bump clai-helpers to v0.5.0",
  "head": "clai-helpers-bump/v0.5.0",
  "base": "main",
  "body": "Automated bump from clai-helpers fleet sync.\n\n- pinned: v0.3.0 → v0.5.0\n- regenerated derived files via the existing sync pipeline\n\nReview diff and merge when ready. No auto-merge by tooling.",
  "draft": false
}
```

Title and body are templated. Future enhancement: configurable templates.

## Concurrency model

- Listing: max 5 concurrent reads (configurable via `FleetConfig.discoveryConcurrency`).
- Sync: strictly 1 (sequential).
- Both share a single `fetch` shim with shared rate-limit awareness (a per-session counter in `github-api.ts`).

## Mockability

`globalThis.fetch` is replaceable for tests. Every API method in `core/fleet/github-api.ts` accepts an optional `fetch` parameter (defaults to global) for explicit injection in unit tests.
