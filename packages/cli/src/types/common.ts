/**
 * Distinguishes source files (from .claude/) from generated outputs (Copilot/Gemini).
 */
export enum FileKind {
  Source = "source",
  Generated = "generated",
}

/**
 * Determines lifecycle behavior during init and sync.
 * - core: Synced on every `sync`. Subject to Protected Slots.
 * - config: Written only on `init`. User owns after first write.
 * - binary: Byte-copied via identity transformer. No slots.
 */
export enum FileClass {
  Core = "core",
  Config = "config",
  Binary = "binary",
}

/**
 * Tracks a file's current management state in the lock file.
 */
export enum FileStatus {
  Managed = "managed",
  ConfigInit = "config-init",
  Orphaned = "orphaned",
  Ejected = "ejected",
}

/**
 * CLI exit codes per contracts/cli.md.
 */
export enum ExitCode {
  Success = 0,
  UsageError = 1,
  DriftDetected = 2,
  StaleJournal = 3,
  UntrustedTransformer = 4,
  LockSchemaMismatch = 5,
  InternalError = 10,
}
