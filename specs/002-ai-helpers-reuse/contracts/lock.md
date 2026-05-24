# Lock File Contract: helpers-lock.json

**Version**: 1.0.0 | **Source of truth for FR-016, FR-017, FR-018, FR-018b**

## Location

`helpers-lock.json` at the **target project root**. Committed to git.

## Full Schema

```json
{
  "schema": 1,
  "toolVersion": "1.0.0",
  "source": {
    "url": "https://github.com/underundre/helpers",
    "ref": "v1.0.0",
    "commit": "abc123def456789..."
  },
  "installedAt": "2026-04-09T12:00:00Z",
  "targets": ["claude", "copilot", "gemini"],
  "trustedTransformers": [
    {
      "path": "transformers/my-custom.ts",
      "hash": "sha256:abc...",
      "trustedAt": "2026-04-09T12:00:00Z"
    }
  ],
  "files": [
    {
      "path": ".claude/commands/commit.md",
      "kind": "source",
      "class": "core",
      "sourceCanonicalHash": "sha256:aaa...",
      "localCanonicalHash": "sha256:aaa...",
      "slotsHash": "sha256:bbb...",
      "status": "managed"
    },
    {
      "path": ".claude/settings.json",
      "kind": "source",
      "class": "config",
      "sourceCanonicalHash": "sha256:ccc...",
      "localCanonicalHash": "sha256:ccc...",
      "status": "config-init"
    },
    {
      "path": ".github/prompts/commit.prompt.md",
      "kind": "generated",
      "transformer": "claude-to-copilot-prompt",
      "fromSource": ".claude/commands/commit.md",
      "renderedHash": "sha256:ddd...",
      "localRenderedHash": "sha256:ddd...",
      "status": "managed"
    }
  ]
}
```

## Field Definitions

### Root

| Field | Type | Required | Description |
|---|---|---|---|
| `schema` | `1` (literal) | Yes | Lock schema version |
| `toolVersion` | string | Yes | `underundre-helpers` version that last wrote this file |
| `source` | object | Yes | Source repository metadata |
| `installedAt` | ISO 8601 string | Yes | Timestamp of last init/sync |
| `targets` | string[] | Yes | Active target names |
| `trustedTransformers` | object[] | Yes (may be empty) | Custom transformer trust records |
| `files` | object[] | Yes | Tracked file entries |

### source

| Field | Type | Description |
|---|---|---|
| `url` | string | Source repo URL (e.g., `https://github.com/underundre/helpers`) |
| `ref` | string | Requested ref (tag, branch, or SHA) |
| `commit` | string | **Always** resolved to full 40-char SHA |

### files[] — Source entries (`kind: "source"`)

| Field | Type | Description |
|---|---|---|
| `path` | string | Forward-slash normalized path relative to project root |
| `kind` | `"source"` | Identifies this as a source (not generated) file |
| `class` | `"core" \| "config" \| "binary"` | Lifecycle class |
| `sourceCanonicalHash` | string | sha256 of source content with slots stripped to placeholder |
| `localCanonicalHash` | string | sha256 of local content with slots stripped to placeholder |
| `slotsHash` | string? | sha256 of concatenated slot bodies. Present only if ≥1 slot exists. |
| `status` | FileStatus | Current state |

### files[] — Generated entries (`kind: "generated"`)

| Field | Type | Description |
|---|---|---|
| `path` | string | Forward-slash normalized path |
| `kind` | `"generated"` | Identifies this as a transformer output |
| `transformer` | string | Name of the transformer that produced this |
| `fromSource` | string | Path of the source file this was generated from |
| `renderedHash` | string | Expected sha256 of generated content (including header) |
| `localRenderedHash` | string | Actual sha256 of file on disk |
| `status` | FileStatus | Current state |

## Hash Computation

### Canonical Hash (source files)

1. Read file content as UTF-8
2. Normalize line endings to LF
3. For each Protected Slot block: replace body (between markers, exclusive) with `\n<<HELPERS:SLOT>>\n`
4. Compute `sha256` of resulting bytes
5. Output: `sha256:<hex>`

### Slots Hash (source files with slots)

1. Extract all slot bodies in document order
2. Join with `\x00` separator
3. Compute `sha256`
4. Output: `sha256:<hex>`

### Rendered Hash (generated files)

1. Read file as raw bytes
2. Compute `sha256` (includes header, no stripping)
3. Output: `sha256:<hex>`

## Drift Detection

| File kind | Drift condition | Reported by |
|---|---|---|
| Source (core) | `localCanonicalHash ≠ sourceCanonicalHash` | `status --strict` → exit 2 |
| Source (config) | Never drift | `status` shows `config-init`, `--strict` ignores |
| Generated | `localRenderedHash ≠ renderedHash` | `status --strict` → exit 2 |
| Orphaned | Source removed from upstream | `status` shows warning |
| Ejected | Not checked | Invisible to `status` |

## Invariants

1. Every `GeneratedEntry.fromSource` MUST reference an existing `SourceEntry.path` (or orphaned source).
2. All `path` values use `/` separators, never `\`.
3. `source.commit` is always a full 40-char SHA, even if `ref` was a branch name.
4. `trustedTransformers[].hash` must match the current file on disk; mismatch revokes trust.
5. `files` array MUST NOT contain duplicate `path` values.
6. Lock file is written atomically (via journal system) and is always the **last** file written in a run.
