# User Config Schema — `~/.config/clai-helpers/fleet.json`

The file users edit (or that `fleet add-org` mutates) to control fleet behaviour. Loaded by `c12` so `.ts`, `.js`, `.json`, `.yaml`, `.yml` are all accepted; canonical doc here uses JSON.

## Path resolution

| OS | Path |
|----|------|
| Linux | `$XDG_CONFIG_HOME/clai-helpers/fleet.json` (default `~/.config/clai-helpers/fleet.json`) |
| macOS | `~/.config/clai-helpers/fleet.json` (we explicitly use XDG-style on macOS, not `~/Library/...`, for parity with the existing `helpers.config.ts` location convention) |
| Windows | `%APPDATA%/clai-helpers/fleet.json` (typically `C:\Users\<user>\AppData\Roaming\clai-helpers\fleet.json`) |

If file absent → defaults apply (no error).

## Schema

```json
{
  "$schema": "https://underundre.github.io/ai/schemas/fleet-config.json",
  "scope": {
    "includeOwnRepos": true,
    "orgs": ["myorg", "another-org"],
    "filter": "*-prod"
  },
  "defaultSyncMode": "pr",
  "patchOutputDir": "./.fleet-patches",
  "discoveryConcurrency": 5
}
```

### Field reference

| Field | Type | Default | Constraint |
|-------|------|---------|------------|
| `scope.includeOwnRepos` | boolean | `true` | — |
| `scope.orgs` | string[] | `[]` | each item matches GitHub org naming |
| `scope.filter` | string \| null | `null` | glob; supports `*` and `?` |
| `defaultSyncMode` | "pr" \| "push" \| "patch" | `"pr"` | enum |
| `patchOutputDir` | string | `"./.fleet-patches"` | path; created on first patch write |
| `discoveryConcurrency` | integer | `5` | range `[1, 20]` |

### Validation behaviour

- Unknown keys: ignored with a one-line warning to stderr (`fleet: unknown config key 'X'`); doesn't fail load.
- Invalid value (wrong type, out of range): exit code `2` with `FleetError("config/malformed", ...)`. Message names the offending field.
- Invalid org name: exit code `2` with `FleetError("config/invalid-scope", ...)`.

## TypeScript-mode example

`~/.config/clai-helpers/fleet.config.ts`:

```ts
import type { FleetConfig } from "clai-helpers/types";

export default {
  scope: {
    includeOwnRepos: true,
    orgs: ["my-employer-org"],
  },
  defaultSyncMode: "push",
  discoveryConcurrency: 8,
} satisfies Partial<FleetConfig>;
```

`Partial<FleetConfig>` is enough — defaults fill the rest. We export the type from a public path so consumers get autocomplete without importing internals.

## Mutation by CLI

`fleet add-org <org>` and `fleet remove-org <org>` mutate ONLY `scope.orgs`. They:

1. Load existing config (or generate defaults).
2. Apply the mutation.
3. Write back as JSON (always JSON for CLI-mutated state — we don't try to round-trip TS/YAML).
4. Emit a one-line confirmation.

If the user has a `.ts` config: the CLI's mutation refuses (exits `2` with "config is in TypeScript form; edit manually or convert to JSON for automated mutation"). Avoids destroying the user's typed defaults silently.

## Migration / versioning

Schema is unversioned in v1. Future incompatible changes will introduce a `version: 1` field and `c12`-side migration. For v1, schema is "the doc above". Forward-compatible additive changes (new optional fields with defaults) won't trigger a version bump.
