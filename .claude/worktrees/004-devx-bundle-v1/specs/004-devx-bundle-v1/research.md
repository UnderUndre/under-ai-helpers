# Research: Developer Experience Bundle v1

**Feature**: 004-devx-bundle-v1 | **Date**: 2026-05-24

## R1: Hermes CLI invocation patterns

**Decision**: Use `child_process.spawn` with `hermes` binary. Arguments built from flags. Background mode uses `detached: true, stdio: 'ignore'` with log file redirect.

**Rationale**: `spawn` over `exec` for streaming support and background mode. No shell wrapping needed — hermes takes direct arguments.

**Alternatives considered**:
- `execa` npm package → rejected (no new deps rule)
- Shell wrapper script → rejected (cross-platform fragility)

## R2: MCP server health check mechanism

**Decision**: Attempt basic `initialize` JSON-RPC call via stdio with 3-second timeout. Mark "unknown" if binary not found or timeout.

**Rationale**: MCP servers use stdio transport. A basic `{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}` verifies the server responds.

**Alternatives considered**:
- Skip MCP checks entirely → rejected (valuable diagnostic)
- Full MCP client integration → rejected (over-engineering)

## R3: AI-Engineering-Coach rule format translation

**Decision**: Each rule translated to condensed table format matching existing guardrails table in CLAUDE.md. Valera tone applied where appropriate.

**Rationale**: Table format is scannable. 45 rules × ~200 chars ≈ 9KB total. Token-efficient.

**Alternatives considered**:
- Verbatim copy → rejected (format mismatch, detection logic irrelevant)
- Full rewrite per rule → rejected (unnecessary effort)

## R4: Two-phase review CI strategy

**Decision**: GitHub Actions path filters. `specs/**` PRs get reduced CI (markdown lint + link check + analyze regen). Implementation PRs get full CI.

**Rationale**: Path-based filtering is standard. No additional tooling needed.

**Alternatives considered**:
- Separate workflow files → rejected (duplication)
- Branch name-based filtering → rejected (less precise)
