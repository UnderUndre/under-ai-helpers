/**
 * Redaction engine (feature 007 US2, FR-004).
 *
 * Pure function: (text, catalog, filesTouched) → { redactedText, log }.
 * Actions: redact (replace), hash (sha256 prefix), allow (suppress match).
 * Allowlist precedence: allow ALWAYS wins over rule match.
 * Idempotent: redact(redact(x)) === redact(x).
 *
 * Per hermes F11: consumer-extensible allowlist via .claude/settings.json.
 */

import { createHash } from "node:crypto";

export interface RedactionRule {
  id: string;
  pattern: RegExp;
  action: "redact" | "hash" | "allow";
  description?: string;
  replacement?: string;
}

export interface AllowlistEntry {
  pathGlob?: string;
  patternContext?: string;
  ruleIds: string[];
}

export interface RedactionCatalog {
  version: string;
  rules: RedactionRule[];
  allowlist: AllowlistEntry[];
}

export interface RedactionLogEntry {
  ruleId: string;
  location: string;
  action: "redacted" | "hashed" | "allowed";
  matchLength: number;
}

export interface RedactionResult {
  redactedText: string;
  log: RedactionLogEntry[];
  catalogVersion: string;
}

export interface RedactionInput {
  body: string;
  filesTouched: string[];
  catalog: RedactionCatalog;
}

/**
 * Apply redaction rules to a text body. Pure function.
 */
export function redact(input: RedactionInput): RedactionResult {
  const { body, catalog } = input;
  const log: RedactionLogEntry[] = [];
  let result = body;
  const lines = result.split("\n");

  for (const rule of catalog.rules) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || "";
      const matches = [...line.matchAll(rule.pattern)];
      if (matches.length === 0) continue;

      // Check allowlist first — allow ALWAYS wins
      if (isAllowlisted(rule.id, line, input.filesTouched, catalog.allowlist)) {
        for (const m of matches) {
          log.push({
            ruleId: rule.id,
            location: `line ~${i + 1}`,
            action: "allowed",
            matchLength: m[0].length,
          });
        }
        continue;
      }

      // Apply rule
      const action = rule.action;
      let replacement: string;

      if (action === "redact") {
        replacement = rule.replacement || `[REDACTED:${rule.id}]`;
        lines[i] = line.replace(rule.pattern, replacement);
      } else if (action === "hash") {
        // Hash each match individually to preserve cross-reference
        lines[i] = line.replace(rule.pattern, (match) => {
          const hash = createHash("sha256").update(match).digest("hex").slice(0, 8);
          return `[HASHED:${rule.id}:${hash}]`;
        });
      } else {
        continue; // "allow" action is handled by allowlist check above
      }

      for (const m of matches) {
        log.push({
          ruleId: rule.id,
          location: `line ~${i + 1}`,
          action: action === "redact" ? "redacted" : "hashed",
          matchLength: m[0].length,
        });
      }
    }
  }

  return {
    redactedText: lines.join("\n"),
    log,
    catalogVersion: catalog.version,
  };
}

function isAllowlisted(
  ruleId: string,
  lineContent: string,
  filesTouched: string[],
  allowlist: AllowlistEntry[],
): boolean {
  for (const entry of allowlist) {
    if (!entry.ruleIds.includes(ruleId)) continue;

    // Path glob match
    if (entry.pathGlob) {
      for (const f of filesTouched) {
        if (matchGlobSimple(entry.pathGlob, f)) return true;
      }
    }

    // Pattern context match (suffix or substring)
    if (entry.patternContext) {
      const ctx = entry.patternContext;
      if (ctx.endsWith("$") && lineContent.includes(ctx.slice(0, -1))) return true;
      if (lineContent.includes(ctx)) return true;
    }

    // Entry with no condition = allow unconditionally
    if (!entry.pathGlob && !entry.patternContext) return true;
  }
  return false;
}

function matchGlobSimple(pattern: string, path: string): boolean {
  // Simple glob: ** → .*, * → [^/]*
  const regex = pattern
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${regex}$`, "i").test(path);
}

// ── Default catalog (baseline patterns) ────────────────────────────────────

export const DEFAULT_CATALOG: RedactionCatalog = {
  version: "2026.06.1",
  rules: [
    // Cloud secrets
    { id: "aws-access-key-id", pattern: /\b(AKIA|ASIA|AGPA|AROA|AIDA|ANPA|ANVA|ABIA|ACCA)[A-Z0-9]{16}\b/g, action: "redact", description: "AWS access key ID" },
    { id: "gcp-service-account-key", pattern: /"type":\s*"service_account"/g, action: "redact", description: "GCP service account key block" },
    { id: "azure-connection-string", pattern: /DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]+/g, action: "redact", description: "Azure storage connection string" },

    // Auth tokens
    { id: "jwt-token", pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, action: "redact", description: "JWT token (3 base64 segments)" },
    { id: "ssh-private-key-block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g, action: "redact", description: "PEM-encoded private key block" },

    // PII
    { id: "email-address", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, action: "hash", description: "Email address (hashed for cross-reference)" },
    { id: "phone-number", pattern: /\+?\d{1,3}?[ .-]?\(?\d{1,4}?\)?[ .-]?\d{3,4}[ .-]?\d{4}\b/g, action: "redact", description: "Phone number" },
  ],
  allowlist: [
    // AWS docs canonical example
    { patternContext: "EXAMPLE", ruleIds: ["aws-access-key-id"] },
    // RFC 2606 example domains
    { patternContext: "@example.com", ruleIds: ["email-address"] },
    { patternContext: "@example.org", ruleIds: ["email-address"] },
    // Test fixture directories
    { pathGlob: "tests/**", ruleIds: ["aws-access-key-id", "jwt-token"] },
  ],
};
