/**
 * Integration test for status --strict drift detection (SC-006).
 * Tests drift scenarios across source and generated files.
 */

import { describe, it, expect } from "vitest";
import { detectSourceDrift, detectGeneratedDrift } from "../../src/core/drift.js";
import { canonicalHash, slotsHash, renderedHash } from "../../src/core/hash.js";
import { parseSlots } from "../../src/core/slots.js";
import { FileKind, FileClass, FileStatus } from "../../src/types/common.js";
import type { SourceEntry, GeneratedEntry } from "../../src/types/lock.js";

function makeSourceEntry(content: string, ext: string, fileClass = FileClass.Core): SourceEntry {
  const slots = parseSlots(content, ext);
  const slotBodies = slots.map((s) => s.body);
  return {
    path: `test${ext}`,
    kind: FileKind.Source,
    class: fileClass,
    status: fileClass === FileClass.Config ? FileStatus.ConfigInit : FileStatus.Managed,
    sourceCanonicalHash: canonicalHash(content, slotBodies),
    localCanonicalHash: canonicalHash(content, slotBodies),
    slotsHash: slotsHash(slotBodies),
  };
}

function makeGeneratedEntry(content: string): GeneratedEntry {
  return {
    path: "test.prompt.md",
    kind: FileKind.Generated,
    transformer: "test-transformer",
    fromSource: "source.md",
    renderedHash: renderedHash(content),
    localRenderedHash: renderedHash(content),
    status: FileStatus.Managed,
  };
}

describe("status --strict drift scenarios", () => {
  // ── Source files: outside-slot edits → drift ──

  it("source: body text change → drift", () => {
    const original = "# Title\nOriginal body";
    const entry = makeSourceEntry(original, ".md");
    const result = detectSourceDrift(entry, "# Title\nModified body", ".md");
    expect(result.isDrift).toBe(true);
  });

  it("source: heading change → drift", () => {
    const original = "# Title\nBody";
    const entry = makeSourceEntry(original, ".md");
    const result = detectSourceDrift(entry, "# New Title\nBody", ".md");
    expect(result.isDrift).toBe(true);
  });

  it("source: added section → drift", () => {
    const original = "# Title\nBody";
    const entry = makeSourceEntry(original, ".md");
    const result = detectSourceDrift(entry, "# Title\nBody\n\n## New Section\nExtra", ".md");
    expect(result.isDrift).toBe(true);
  });

  it("source: deleted content → drift", () => {
    const original = "# Title\nLine 1\nLine 2\nLine 3";
    const entry = makeSourceEntry(original, ".md");
    const result = detectSourceDrift(entry, "# Title\nLine 1", ".md");
    expect(result.isDrift).toBe(true);
  });

  it("source: whitespace-only change → drift (strict)", () => {
    const original = "# Title\nBody";
    const entry = makeSourceEntry(original, ".md");
    const result = detectSourceDrift(entry, "# Title\n  Body", ".md");
    expect(result.isDrift).toBe(true);
  });

  it("source: YAML file outside-slot edit → drift", () => {
    const original = "key: value\nother: data";
    const entry = makeSourceEntry(original, ".yaml");
    const result = detectSourceDrift(entry, "key: changed\nother: data", ".yaml");
    expect(result.isDrift).toBe(true);
  });

  it("source: TypeScript file outside-slot edit → drift", () => {
    const original = "const x = 1;\nconst y = 2;";
    const entry = makeSourceEntry(original, ".ts");
    const result = detectSourceDrift(entry, "const x = 999;\nconst y = 2;", ".ts");
    expect(result.isDrift).toBe(true);
  });

  // ── Generated files: any local edit → drift ──

  it("generated: content change → drift", () => {
    const original = "<!-- header -->\n# Generated";
    const entry = makeGeneratedEntry(original);
    expect(detectGeneratedDrift(entry, "<!-- header -->\n# Modified")).toBe(true);
  });

  it("generated: header stripped → drift", () => {
    const original = "<!-- header -->\n# Content";
    const entry = makeGeneratedEntry(original);
    expect(detectGeneratedDrift(entry, "# Content")).toBe(true);
  });

  it("generated: appended content → drift", () => {
    const original = "# Content";
    const entry = makeGeneratedEntry(original);
    expect(detectGeneratedDrift(entry, "# Content\n\nExtra stuff")).toBe(true);
  });

  // ── Source files: slot-only edits → no drift (customized) ──

  it("source: slot body modified → no drift, customized", () => {
    const original = "# Title\n<!-- HELPERS:CUSTOM START -->\nDefault\n<!-- HELPERS:CUSTOM END -->\nFooter";
    const entry = makeSourceEntry(original, ".md");
    const modified = "# Title\n<!-- HELPERS:CUSTOM START -->\nCustom content\n<!-- HELPERS:CUSTOM END -->\nFooter";
    const result = detectSourceDrift(entry, modified, ".md");
    expect(result.isDrift).toBe(false);
    expect(result.isCustomized).toBe(true);
  });

  it("source: slot body expanded → no drift, customized", () => {
    const original = "# T\n<!-- HELPERS:CUSTOM START -->\nA\n<!-- HELPERS:CUSTOM END -->\nF";
    const entry = makeSourceEntry(original, ".md");
    const modified = "# T\n<!-- HELPERS:CUSTOM START -->\nA\nB\nC\n<!-- HELPERS:CUSTOM END -->\nF";
    const result = detectSourceDrift(entry, modified, ".md");
    expect(result.isDrift).toBe(false);
    expect(result.isCustomized).toBe(true);
  });

  it("source: slot body cleared → no drift, customized", () => {
    const original = "# T\n<!-- HELPERS:CUSTOM START -->\nContent\n<!-- HELPERS:CUSTOM END -->\nF";
    const entry = makeSourceEntry(original, ".md");
    const modified = "# T\n<!-- HELPERS:CUSTOM START -->\n\n<!-- HELPERS:CUSTOM END -->\nF";
    const result = detectSourceDrift(entry, modified, ".md");
    expect(result.isDrift).toBe(false);
    expect(result.isCustomized).toBe(true);
  });

  // ── Config-init files: any edit → no drift ──

  it("config-init: total rewrite → no drift", () => {
    const entry = makeSourceEntry("{}", ".json", FileClass.Config);
    const result = detectSourceDrift(entry, '{"totally": "different"}', ".json");
    expect(result.isDrift).toBe(false);
  });

  it("config-init: content deleted → no drift", () => {
    const entry = makeSourceEntry("key: value", ".yaml", FileClass.Config);
    const result = detectSourceDrift(entry, "", ".yaml");
    expect(result.isDrift).toBe(false);
  });

  // ── Clean files → no drift ──

  it("source: identical content → no drift", () => {
    const content = "# Title\nBody";
    const entry = makeSourceEntry(content, ".md");
    const result = detectSourceDrift(entry, content, ".md");
    expect(result.isDrift).toBe(false);
    expect(result.isCustomized).toBe(false);
  });

  it("generated: identical content → no drift", () => {
    const content = "# Generated content";
    const entry = makeGeneratedEntry(content);
    expect(detectGeneratedDrift(entry, content)).toBe(false);
  });

  it("source: CRLF vs LF → no drift (normalized)", () => {
    const lf = "# Title\nBody\nEnd";
    const entry = makeSourceEntry(lf, ".md");
    const crlf = "# Title\r\nBody\r\nEnd";
    const result = detectSourceDrift(entry, crlf, ".md");
    expect(result.isDrift).toBe(false);
  });
});
