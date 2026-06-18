/**
 * BackendFactory (feature 008 T05).
 *
 * Config-driven selection: "honcho" → HonchoBackend, "local_lexical" → LocalLexicalBackend.
 * Version check on Honcho creation. Graceful degradation on startup.
 */

import type Database from "better-sqlite3";
import type { MemoryBackend } from "./interface.js";
import { HONCHO_PINNED_VERSION } from "./interface.js";
import { LocalLexicalBackend } from "./local-lexical.js";
import { HonchoBackend } from "./honcho.js";
import { HonchoClient } from "./honcho-client.js";

export interface BackendConfig {
  type: "honcho" | "local_lexical";
  honcho_endpoint?: string;
  honcho_token?: string;
  honcho_timeout_ms?: number;
}

export interface FactoryResult {
  backend: MemoryBackend;
  type: "honcho" | "local_lexical";
  warnings: string[];
}

/**
 * Create a MemoryBackend from config.
 * If "honcho" requested but unreachable, creates HonchoBackend in degraded mode
 * (will auto-recover when Honcho comes back).
 */
export function createBackend(
  db: Database.Database,
  config: BackendConfig,
): FactoryResult {
  const warnings: string[] = [];

  if (config.type === "honcho" && config.honcho_endpoint) {
    const client = new HonchoClient({
      endpoint: config.honcho_endpoint,
      token: config.honcho_token,
      timeoutMs: config.honcho_timeout_ms,
    });

    // Version check (non-blocking — warning only per FR-011)
    client.health().then((h) => {
      if (h.version && h.version !== HONCHO_PINNED_VERSION) {
        warnings.push(
          `Honcho version mismatch: running ${h.version}, pinned ${HONCHO_PINNED_VERSION}. Integration tested against ${HONCHO_PINNED_VERSION}.`,
        );
      }
    }).catch(() => {
      warnings.push(
        `Honcho unreachable at startup — backend will operate in degraded mode (lexical-only fallback) until Honcho recovers.`,
      );
    });

    return {
      backend: new HonchoBackend(db, client),
      type: "honcho",
      warnings,
    };
  }

  // Default / fallback: local lexical
  return {
    backend: new LocalLexicalBackend(db),
    type: "local_lexical",
    warnings,
  };
}

