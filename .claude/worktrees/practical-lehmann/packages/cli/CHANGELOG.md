# Changelog

All notable changes to `clai-helpers` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-09

Initial release.

### Added

- **CLI commands**: `init`, `sync`, `status`, `diff`, `eject`, `remove`, `add-target`, `remove-target`, `list-transformers`, `doctor`, `recover`.
- **7 built-in transformers**: `identity`, `claude-to-copilot-prompt`, `claude-to-copilot-instructions`, `claude-to-copilot-root-instructions`, `claude-to-gemini-command`, `claude-to-gemini-agent`, `claude-to-gemini-root`.
- **Protected Slots**: `<!-- HELPERS:CUSTOM START -->` / `<!-- HELPERS:CUSTOM END -->` markers for preserving project-specific content across syncs.
- **Lock file** (`helpers-lock.json`): tracks source metadata, active targets, file hashes, and trusted custom transformers. Commit to git.
- **Drift detection**: `status --strict` exits with code 2 when managed files have been manually edited. CI-safe, non-interactive by default.
- **Crash recovery**: Write-Ahead Journal ensures atomic operations. `recover --resume`, `--rollback`, or `--abandon` to handle interrupted runs.
- **Custom transformer support**: author `.ts`/`.js` transformer files matching the `TransformerFn` signature. Hash-pinned trust model prevents untrusted code execution.
- **Config layering**: `--source-config` flag overlays a local manifest on top of the source config via `defu` deep merge.
- **Global flags**: `--dry-run`, `--offline`, `--json`, `--verbose`, `--interactive`, `--yes`, `--no-color`.
- **Programmatic API**: exports `defineHelpersConfig`, transformer types (`TransformerFn`, `ParsedFile`, `RenderedFile`, `TransformContext`), config types (`HelpersConfig`, `TargetConfig`, `TransformerPipeline`), and enums (`FileKind`, `FileClass`, `FileStatus`, `ExitCode`).

[0.1.0]: https://github.com/underundre/helpers/releases/tag/v0.1.0
