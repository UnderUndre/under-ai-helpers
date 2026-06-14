/**
 * Normalizer (feature 007 US2, FR-003).
 *
 * Defensive JSONL parser → tracked plain-text markdown with:
 *   - Stable YAML frontmatter (deterministic — F6 fix: captured_at from sidecar)
 *   - Redacted message stream (body, truncated at normalized-max-bytes)
 *   - Raw pointer when truncated
 *   - Redaction log appendix
 *
 * Pure function: same (rawBytes, catalog, finalizeTimestamp) → byte-identical output.
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import { redact, DEFAULT_CATALOG, type RedactionCatalog } from "./redaction/engine.js";

export interface NormalizedRecord {
  frontmatter: Record<string, unknown>;
  body: string;
  truncated: boolean;
  rawPointer: string | null;
  redactionCount: number;
  contentHash: string;
  schemaWarnings: number;
}

export interface NormalizeOptions {
  maxBytes: number;       // Truncation threshold (default 65536)
  catalog?: RedactionCatalog;
  capturedAt?: string;    // From sidecar meta.json (F6: stable input)
}

/**
 * Parse a CC JSONL transcript into a NormalizedRecord.
 * Deterministic: same inputs → same outputs.
 */
export function normalize(
  rawTranscriptPath: string,
  options: NormalizeOptions,
): NormalizedRecord {
  const raw = readFileSync(rawTranscriptPath, "utf8");
  const catalog = options.catalog || DEFAULT_CATALOG;

  // Parse JSONL defensively (V2: count schema_warnings, never crash)
  let schemaWarnings = 0;
  const messages: ParsedMessage[] = [];
  const models = new Set<string>();
  const filesTouched = new Set<string>();
  let tokenInput = 0;
  let tokenOutput = 0;

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      messages.push(entry);

      // Extract model + token usage
      if (entry.message?.model) models.add(entry.message.model);
      if (entry.message?.usage) {
        tokenInput += entry.message.usage.input_tokens || 0;
        tokenOutput += entry.message.usage.output_tokens || 0;
      }

      // Extract files touched from tool_use blocks
      if (Array.isArray(entry.message?.content)) {
        for (const block of entry.message.content) {
          if (block.type === "tool_use" && block.input) {
            const fp = block.input.file_path || block.input.path;
            if (fp) filesTouched.add(fp);
          }
        }
      }
    } catch {
      schemaWarnings++;
    }
  }

  // Derive theme from first user message
  const firstUserMsg = messages.find((m) => m.type === "user");
  const theme = deriveTheme(firstUserMsg);
  const themeSlug = slugify(theme);

  // Derive outcome from last assistant message
  const lastAssistantMsg = [...messages].reverse().find((m) => m.type === "assistant");
  const outcome = deriveOutcome(lastAssistantMsg);

  // Build body (message stream) with redaction
  const bodyParts: string[] = [];
  for (const msg of messages) {
    const rendered = renderMessage(msg);
    if (rendered) bodyParts.push(rendered);
  }
  const fullBody = bodyParts.join("\n\n");

  // Redact
  const redactionResult = redact({
    body: fullBody,
    filesTouched: [...filesTouched],
    catalog,
  });

  // Truncate body (F4: default 64 KiB)
  const maxBytes = options.maxBytes;
  let truncatedBody = redactionResult.redactedText;
  let truncated = false;
  if (Buffer.byteLength(truncatedBody, "utf8") > maxBytes) {
    truncatedBody = Buffer.from(truncatedBody, "utf8").slice(0, maxBytes).toString("utf8");
    truncated = true;
  }

  // Content hash (body only, per F6 idempotency key)
  const contentHash = createHash("sha256").update(truncatedBody).digest("hex");

  // Frontmatter (sorted alphabetically — deterministic)
  const rawBasename = basename(rawTranscriptPath);
  const date = options.capturedAt
    ? options.capturedAt.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const frontmatter: Record<string, unknown> = {
    captured_at: options.capturedAt || new Date().toISOString(),
    content_hash: contentHash,
    date,
    files_touched: [...filesTouched].sort(),
    models: [...models].sort(),
    redaction_catalog_version: catalog.version,
    redaction_count: redactionResult.log.length,
    schema_warnings: schemaWarnings,
    session_uuid: rawBasename.replace(/-claude\.jsonl$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, ""),
    theme,
    theme_slug: themeSlug,
    token_usage: { input: tokenInput, output: tokenOutput },
    tool: "claude-code",
    truncated,
    ...(outcome ? { outcome } : {}),
  };

  const rawPointer = truncated
    ? `.ai/dialogs/raw/${rawBasename}`
    : null;

  return {
    frontmatter,
    body: truncatedBody,
    truncated,
    rawPointer,
    redactionCount: redactionResult.log.length,
    contentHash,
    schemaWarnings,
  };
}

/**
 * Render a NormalizedRecord to the final markdown file content.
 * Deterministic: frontmatter sorted + LF + no trailing whitespace.
 */
export function renderMarkdown(record: NormalizedRecord): string {
  const fm = toYamlFrontmatter(record.frontmatter);
  const parts: string[] = [fm, ""];

  parts.push(`# ${record.frontmatter.date} Claude Code — ${record.frontmatter.theme}`);
  parts.push("");

  if (record.frontmatter.outcome) {
    parts.push("## Summary");
    parts.push("");
    parts.push(String(record.frontmatter.outcome));
    parts.push("");
  }

  parts.push("## Message Stream");
  parts.push("");
  parts.push(record.body);

  if (record.truncated && record.rawPointer) {
    parts.push("");
    parts.push(`> **Truncated**. Full transcript: \`${record.rawPointer}\``);
  }

  parts.push("");
  parts.push("## Redaction Log");
  parts.push("");
  if (record.redactionCount === 0) {
    parts.push("*No redactions applied.*");
  } else {
    parts.push(`*Catalog version: ${record.frontmatter.redaction_catalog_version} · ${record.redactionCount} redactions · ${record.schemaWarnings} schema warnings*`);
  }

  return parts.join("\n") + "\n";
}

// ── Helpers ────────────────────────────────────────────────────────────────

interface ParsedMessage {
  type: string;
  uuid?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: unknown;
    model?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
}

function deriveTheme(firstUserMsg?: ParsedMessage): string {
  if (!firstUserMsg?.message?.content) return "untitled-session";
  const content = firstUserMsg.message.content;
  let text = "";
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "text" && typeof block.text === "string") {
        text = block.text;
        break;
      }
    }
  }
  return text.slice(0, 60).trim() || "untitled-session";
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "untitled";
}

function deriveOutcome(lastAssistantMsg?: ParsedMessage): string | null {
  if (!lastAssistantMsg?.message?.content) return null;
  const content = lastAssistantMsg.message.content;
  let text = "";
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "text" && typeof block.text === "string") {
        text = block.text;
        break;
      }
    }
  }
  // Fallback chain per M10:
  // 1. First sentence of last assistant text
  if (text.trim()) {
    const firstSentence = text.split(/[.!?]\s/)[0] || text;
    return firstSentence.slice(0, 200).trim();
  }
  // 2. Last tool_use name + input summary
  if (Array.isArray(content)) {
    const lastToolUse = [...content].reverse().find((b) => b.type === "tool_use");
    if (lastToolUse) {
      const fp = lastToolUse.input?.file_path || lastToolUse.input?.path || "";
      return `${lastToolUse.name}: ${fp}`;
    }
  }
  // 3. Fallback literal
  return "(no summary — session ended mid-tool-call)";
}

function renderMessage(msg: ParsedMessage): string {
  if (!msg.message?.content) return "";
  const role = msg.message.role || msg.type;
  const time = msg.timestamp ? msg.timestamp.slice(11, 19) : "??:??:??";

  const parts: string[] = [`### ${role} · ${time}`];

  if (msg.message.model) {
    parts[0] += ` · model=${msg.message.model}`;
  }

  const content = msg.message.content;
  if (typeof content === "string") {
    parts.push(content);
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "text" && typeof block.text === "string") {
        parts.push(block.text);
      } else if (block.type === "tool_use") {
        parts.push(`#### tool_use: ${block.name}`);
        parts.push("```");
        parts.push(JSON.stringify(block.input, null, 2));
        parts.push("```");
      } else if (block.type === "tool_result") {
        parts.push("#### tool_result");
        parts.push(typeof block.content === "string" ? block.content : JSON.stringify(block.content));
      } else if (block.type === "thinking") {
        parts.push("<details><summary>thinking</summary>");
        parts.push(typeof block.text === "string" ? block.text : "");
        parts.push("</details>");
      } else {
        parts.push(`<details><summary>unknown-block:${block.type}</summary><pre>${JSON.stringify(block, null, 2)}</pre></details>`);
      }
    }
  }

  return parts.join("\n");
}

function toYamlFrontmatter(fm: Record<string, unknown>): string {
  const keys = Object.keys(fm).sort();
  const lines: string[] = ["---"];
  for (const key of keys) {
    const val = fm[key];
    if (val === null || val === undefined) continue;
    if (Array.isArray(val)) {
      lines.push(`${key}: [${val.map((v) => JSON.stringify(v)).join(", ")}]`);
    } else if (typeof val === "object") {
      lines.push(`${key}: ${JSON.stringify(val)}`);
    } else {
      lines.push(`${key}: ${typeof val === "string" ? JSON.stringify(val) : val}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}
