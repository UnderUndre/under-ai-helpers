# Contract: Normalized Record + Redaction Catalog

**Artifact**: `packages/cli/src/dialog-capture/normalizer.ts` + `redaction/engine.ts` + `presets/redaction/catalog_*.yml`
**Spec refs**: FR-003, FR-004, FR-012, FR-021; SC-002, SC-006
**Research refs**: V2 (defensive parsing), V5 (FP baseline)

## Normalized record file schema

**Path**: `.ai/dialogs/log/<YYYY-MM-DD>-claude-<theme-slug>.md`
**Format**: GitHub-flavored markdown, plain text, UTF-8.
**Size budget**: ≤ `dialog-normalized-max-bytes` (default 32 KB); larger transcripts truncate body and emit raw pointer.

### File structure

```markdown
---
session_uuid: <cc-session-uuid>
date: <YYYY-MM-DD>
captured_at: <ISO-8601 timestamp>
tool: claude-code
branch: <git-branch-or-"detached">
theme: <human-readable theme>
theme_slug: <kebab-case-slug>
models: ["claude-...", "claude-..."]
token_usage: { input: N, output: N, cache_read: N }
files_touched: ["src/foo.ts", "README.md", ...]
decisions_derived: ["<one-line decision 1>", "<one-line decision 2>", ...]
redaction_catalog_version: <catalog-version-string>
redaction_count: N
schema_warnings: N
truncated: true|false
content_hash: <sha256-of-body>
---

# <YYYY-MM-DD> Claude Code — <theme>

## Summary

<one-paragraph brief outcome derived from last assistant message>

## Message Stream

### user · <HH:MM:SS>

<redacted user message text>

### assistant · <HH:MM:SS> · model=<model-id>

<redacted assistant message text>

#### tool_use: Bash

\`\`\`
<redacted tool input as JSON>
\`\`\`

#### tool_result

<redacted tool output>

### user · <HH:MM:SS>

<...>

[... body continues until `dialog-normalized-max-bytes` reached ...]

> **Truncated** at 32768 bytes. Full transcript (N messages, M bytes):
> `.ai/dialogs/raw/<YYYY-MM-DD>-<session-id>-claude.jsonl`

## Redaction Log

- `aws-access-key-id` · line ~42 (user message) · `[REDACTED:aws-access-key-id]`
- `jwt-token` · line ~87 (tool_result) · `[REDACTED:jwt-token]`
- `phone-number` · line ~134 (user message) · `[REDACTED:phone-number]`

*Catalog version: 2026.06.1 · 3 redactions · 0 schema warnings*
```

### Field semantics

**YAML frontmatter** (always present, always parseable):

| Field | Type | Derivation |
|-------|------|-----------|
| `session_uuid` | string | From CC transcript filename (UUID) |
| `date` | date | First message timestamp, local date |
| `captured_at` | timestamp | Persisted finalize-trigger time (set once when the watcher finalizes the raw transcript, written to `raw/<file>.meta.json`); the normalizer reads this stable input. **NOT** the normalizer's wall-clock run time — that would break byte-identical re-normalization (FR-022/SC-012). Post-external-review F6: original definition "when the normalizer ran" violated determinism. |
| `tool` | enum | Always `claude-code` for CC captures; `gemini`/`copilot`/etc. for advisory log entries |
| `branch` | string | `git rev-parse --abbrev-ref HEAD` at capture; `detached` if HEAD is detached; `unknown` if not a git repo |
| `theme` | string | Derived from first user message (first 60 chars, trimmed); human-readable |
| `theme_slug` | string | Kebab-case of theme, ≤30 chars, used in filename |
| `models` | array<string> | Unique list of `message.model` values across assistant messages |
| `token_usage` | object | Sum of `message.usage` across all assistant messages (per-role aggregation) |
| `files_touched` | array<string> | Unique file paths from `tool_use` blocks where `name ∈ {Read, Edit, Write, Glob, Grep}` and `input.file_path` / `input.path` is present |
| `decisions_derived` | array<string> | Heuristic: assistant messages ending with "decided", "let's go with", "we'll use", "the approach is" → first sentence extracted (best-effort; may be empty) |
| `outcome` (rendered as `## Summary` body) | string | Brief outcome derived via fallback chain: (1) last assistant message's first `text` block, trimmed to first sentence; (2) if no text block, last `tool_use` block's `name` + input summary (e.g., `Edited src/foo.ts`); (3) if neither (session ended mid-tool-call with no assistant text), the literal `(no summary — session ended mid-tool-call)`. (data-model.md entity 3 cross-ref) |
| `redaction_catalog_version` | string | From the catalog applied (FR-021) |
| `redaction_count` | integer | Total redactions applied (length of redaction log) |
| `schema_warnings` | integer | Count of unrecognized CC JSONL fields (V2 defensive parsing) |
| `truncated` | boolean | True if body was cut at `dialog-normalized-max-bytes` |
| `content_hash` | string | sha256 of the body section (used for dedup, FR-008) |

**Body section** (`## Message Stream`):

- One subsection per CC message, in transcript order.
- Heading format: `### <role> · <HH:MM:SS>` (+ ` · model=<id>` for assistant messages).
- Multi-block messages render each block (text, tool_use, tool_result, thinking) as nested content.
- `thinking` blocks render as a `<details><summary>thinking</summary>...</details>` HTML block (kept collapsed in markdown viewers).
- All block content passes through the redaction engine before emission.

**Redaction log** (always present, even if empty):

- One bullet per redaction applied: `<rule_id> · location · replacement`.
- Location format: `line ~N (role)` — best-effort, not a byte offset.
- Append the catalog version + counts footer.

### Determinism (FR-003) + idempotency key (F6 fix)

The normalizer MUST be a pure function of `(raw_transcript_bytes, redaction_catalog, config, finalize_trigger_timestamp)`. Same inputs → byte-identical output. Verified by:

1. Sorted iteration over messages (transcript order is canonical).
2. `captured_at` is read from `raw/<file>.meta.json` (persisted finalize-trigger time, written once by the watcher), NOT from `Date.now()` at normalizer run time. Re-normalizing the same raw file always produces the same `captured_at`. (Post-external-review F6: original definition "when the normalizer ran" violated determinism.)
3. YAML frontmatter sorted alphabetically by key.
4. No trailing whitespace; LF line endings; UTF-8 no BOM.

**Idempotency key** (F6 — explicit definition):

- The rewrite-decision key for `dialog-renormalize` (FR-022) and recovery (FR-013) is `content_hash` of the **body** (sha256 of the `## Message Stream` section + `## Redaction Log` section, excluding frontmatter).
- Frontmatter volatile fields (`redaction_count`, `redaction_catalog_version`, `truncated`, `flags`) track the current state but do NOT trigger git diff on their own — `dialog-renormalize` only rewrites a file when `content_hash` of the body changes.
- This makes "only changed records appear in git diff" (SC-012) actually true.

### Cross-tool readability (FR-012, SC-006)

A non-CC reader can extract:

- All frontmatter fields via standard YAML parsing.
- The message stream via standard markdown parsing (`###` headers + nested content).
- The redaction log via the bullet list pattern.

No CC-specific JSON, no proprietary block markers. A Gemini CLI / Codex / Copilot session can read a normalized record with zero knowledge of CC's JSONL format.

---

## Redaction catalog format

**Path**: `presets/redaction/catalog_cloud.yml` + `catalog_pii.yml` (+ consumer-supplied custom catalogs).
**Format**: YAML, parsed by `js-yaml`.

### `catalog_cloud.yml` (default — cloud provider secrets)

```yaml
version: 2026.06.1

rules:
  - id: aws-access-key-id
    description: AWS access key ID (20-char alphanumeric starting with AKIA/ASIA/AGPA/AROA/AIDA/ANPA/ANVA/ABIA/ACCA)
    pattern: '\b(AKIA|ASIA|AGPA|AROA|AIDA|ANPA|ANVA|ABIA|ACCA)[A-Z0-9]{16}\b'
    action: redact
    replacement: '[REDACTED:aws-access-key-id]'

  - id: aws-secret-access-key
    description: AWS secret access key (40-char base64) — high-FP; allowlist recommended for test fixtures
    pattern: '\b[A-Za-z0-9/+=]{40}\b'
    action: hash
    # action: hash → replacement auto-generated as '[HASHED:aws-secret-access-key:<sha256-prefix>]'
    #   (avoids storing the secret in the redaction log)

  - id: gcp-service-account-key
    description: GCP service account private key block
    pattern: '"type":\s*"service_account"'
    action: redact
    replacement: '[REDACTED:gcp-service-account-key]'

  - id: azure-connection-string
    description: Azure storage connection string
    pattern: 'DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]+'
    action: redact

allowlist:
  - path: tests/**                     # glob matched against files_touched
    rule_ids: [aws-access-key-id]      # suppress matches in test fixtures
    reason: AWS docs canonical example AKIAIOSFODNN7EXAMPLE
  - pattern_context: 'EXAMPLE$'        # match if redacted token ends with EXAMPLE
    rule_ids: [aws-access-key-id, aws-secret-access-key]
    reason: AWS docs canonical examples
```

### `catalog_pii.yml` (default — PII + auth tokens)

```yaml
version: 2026.06.1

rules:
  - id: jwt-token
    description: JWT (three base64 segments separated by dots)
    pattern: '\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b'
    action: redact

  - id: ssh-private-key-block
    description: PEM-encoded private key block
    pattern: '-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----'
    action: redact

  - id: credit-card-number
    description: Credit card number (13–19 digits, optional dashes/spaces, Luhn-valid)
    pattern: '\b(?:\d[ -]*?){13,19}\b'
    action: redact
    # Luhn check applied post-match; non-Luhn-valid matches left alone

  - id: phone-number
    description: E.164 or common phone format
    pattern: '\+?\d{1,3}?[ .-]?\(?\d{1,4}?\)?[ .-]?\d{3,4}[ .-]?\d{4}\b'
    action: redact

  - id: email-address
    description: Email address
    pattern: '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    action: hash    # hash to preserve cross-reference without storing PII

allowlist:
  - pattern_context: '@example\.(com|org|net)$'
    rule_ids: [email-address]
    reason: RFC 2606 example domains
  - path: '**/README.md'
    rule_ids: [email-address]
    reason: docs contact emails are public
```

### Catalog semantics

| Action | Behavior | Replacement format |
|--------|----------|-------------------|
| `redact` | Replace match with `replacement` (or default `[REDACTED:<rule_id>]`) | `[REDACTED:<rule_id>]` |
| `hash` | Replace match with sha256-prefix (preserves cross-reference without storing secret) | `[HASHED:<rule_id>:<sha256[0:8]>]` |
| `allow` | Suppress the match (allowlist entry — not used as a rule action) | (original retained) |

**Allowlist precedence**: allowlist ALWAYS wins over a rule match. If a match falls in an allowlist context (path glob OR pattern_context), it is left in place AND logged to the redaction log with `action: allowed` for audit.

### Redaction log entries

Each entry:

```yaml
- rule_id: aws-access-key-id
  location: line ~42 (user message)
  action: redacted   # | hashed | allowed
  replacement: '[REDACTED:aws-access-key-id]'
  match_length: 20
```

Match content is NEVER stored in the log. Only length + replacement are recorded.

**Side-channel acknowledgment (gemini.md F5)**: although the secret content is gone, the redaction log confirms the **existence and type** of secrets that appeared in the original transcript (e.g., `aws-access-key-id · line ~42` reveals an AWS key was present). This is an acceptable trade-off for auditability (the user needs to know what was caught, especially for FP tuning and recovery) but creates a "scent" for any actor who gains repo access. Mitigations: (a) `dialog-purge --rule-id` can also strip the redaction-log entry for a specific session if the user wants post-hoc silence; (b) the redaction log is in the **tracked** normalized file, so its disclosure surface = the repo's disclosure surface (no new attack vector beyond what `git log` already exposes); (c) consumers with elevated threat models can set `redaction-log-detail: minimal` (config flag — emits only `redaction_count: N` without per-rule breakdown).

### External scanner hook (FR-004 clarification — optional)

If `external-scanner` is set in config, the normalizer invokes the configured command after the built-in catalog runs:

```bash
# Example: trufflehog integration
$ trufflehog filesystem --no-update --json <normalized-tmp-file>
```

Contract:

- **Input**: temp file path (the post-builtin-catalog normalized body) on argv.
- **Output**: JSONL on stdout, one finding per line: `{"rule_id": "<scanner-name>:<id>", "location": "<line>", "severity": "...", "match_length": N}`. Scanner MUST NOT echo the match content.
- **Exit codes**: 0 = clean (no findings), 1 = findings emitted, ≥2 = scanner error (treated as catalog-warnings, capture continues).

The normalizer applies scanner findings as additional `redact` actions. Scanner rule_ids are namespaced `<scanner>:<id>` to avoid collision with built-in rules.

---

## Redaction engine API (`packages/cli/src/dialog-capture/redaction/engine.ts`)

```ts
export type RedactionInput = {
  body: string;                          // text to redact (message stream section)
  filesTouched: string[];                // for allowlist path matching
  catalog: RedactionCatalog;             // parsed from YAML
  externalScanner?: string;              // optional hook command
};

export type RedactionOutput = {
  redactedBody: string;
  log: RedactionLogEntry[];
  catalogVersion: string;
};

export function redact(input: RedactionInput): RedactionOutput;
```

**Properties**:

- Pure function (no I/O; catalog is pre-loaded; external-scanner subprocess invocation is the only side-effect, and the engine treats its output as deterministic input).
- Idempotent: `redact(redact(x)) === redact(x)`.
- Catalog version from `input.catalog.version` is stamped into output.

---

## Schema warnings (V2 defensive parsing)

When the normalizer encounters a CC JSONL line with unknown fields or unknown `content[].type` values, it:

1. Counts the warning (logged in frontmatter as `schema_warnings: N`).
2. Renders the unknown block as `<details><summary>unknown-block:<type></summary><pre><raw-json></pre></details>`.
3. Continues parsing.

**Hard failure** (only): malformed JSON line (not parseable at all). The normalizer logs the line number + skips it; the normalized record includes a `parse_errors` count in frontmatter. Capture does NOT abort on parse errors.

## Test fixtures (Principle II corollary — anti-drift)

`packages/cli/tests/fixtures/golden/redaction/` contains:

| Fixture | Purpose |
|---------|---------|
| `seeds/aws-access-key.jsonl` | Planted AWS access key in user message |
| `seeds/jwt-in-tool-result.jsonl` | JWT in tool_result block |
| `seeds/ssh-private-block.jsonl` | PEM private key in pasted user input |
| `seeds/pii-corpus.jsonl` | Phone, email, credit card mixed |
| `legit/test-fixtures.jsonl` | Real test fixture code with AWS-key-shaped constants (FP baseline) |
| `legit/mock-tokens.jsonl` | JWT-shaped test tokens with `EXAMPLE` suffix |

Golden expected output: `<fixture>.expected.md` — diffed in CI. Catalog updates that change output require an explicit golden regeneration (tracked in PR review).
