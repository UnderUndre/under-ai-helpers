import { describe, it, expect } from "vitest";
import { detectSourceDrift, detectGeneratedDrift } from "../../src/core/drift.js";
import { canonicalHash, slotsHash, renderedHash } from "../../src/core/hash.js";
import { parseSlots } from "../../src/core/slots.js";
import { FileKind, FileClass, FileStatus } from "../../src/types/common.js";
import type { SourceEntry, GeneratedEntry } from "../../src/types/lock.js";

describe("detectSourceDrift", () => {
  const makeSourceEntry = (content: string, ext: string): SourceEntry => {
    const slots = parseSlots(content, ext);
    const slotBodies = slots.map((s) => s.body);
    return {
      path: "test.md",
      kind: FileKind.Source,
      class: FileClass.Core,
      status: FileStatus.Managed,
      sourceCanonicalHash: canonicalHash(content, slotBodies),
      localCanonicalHash: canonicalHash(content, slotBodies),
      slotsHash: slotsHash(slotBodies),
    };
  };

  it("reports no drift for clean file", () => {
    const content = "# Title\nBody";
    const entry = makeSourceEntry(content, ".md");
    const result = detectSourceDrift(entry, content, ".md");
    expect(result.isDrift).toBe(false);
    expect(result.isCustomized).toBe(false);
  });

  it("reports drift for outside-slot edit", () => {
    const original = "# Title\nBody";
    const entry = makeSourceEntry(original, ".md");
    const modified = "# Title\nModified Body";
    const result = detectSourceDrift(entry, modified, ".md");
    expect(result.isDrift).toBe(true);
  });

  it("reports customization (not drift) for slot-only edit", () => {
    const original = `# Title
<!-- HELPERS:CUSTOM START -->
Original slot
<!-- HELPERS:CUSTOM END -->
Footer`;
    const entry = makeSourceEntry(original, ".md");

    const modified = `# Title
<!-- HELPERS:CUSTOM START -->
Modified slot content
<!-- HELPERS:CUSTOM END -->
Footer`;

    const result = detectSourceDrift(entry, modified, ".md");
    expect(result.isDrift).toBe(false);
    expect(result.isCustomized).toBe(true);
  });

  it("never reports drift for config-init files", () => {
    const entry: SourceEntry = {
      path: "settings.json",
      kind: FileKind.Source,
      class: FileClass.Config,
      status: FileStatus.ConfigInit,
      sourceCanonicalHash: "sha256:aaa",
      localCanonicalHash: "sha256:aaa",
    };

    const result = detectSourceDrift(entry, '{"totally": "different"}', ".json");
    expect(result.isDrift).toBe(false);
  });
});

describe("detectGeneratedDrift", () => {
  it("reports no drift for matching hash", () => {
    const content = "<!-- header -->\n# Generated";
    const entry: GeneratedEntry = {
      path: "test.prompt.md",
      kind: FileKind.Generated,
      transformer: "identity",
      fromSource: "source.md",
      renderedHash: renderedHash(content),
      localRenderedHash: renderedHash(content),
      status: FileStatus.Managed,
    };

    expect(detectGeneratedDrift(entry, content)).toBe(false);
  });

  it("reports drift for modified generated file", () => {
    const original = "<!-- header -->\n# Generated";
    const entry: GeneratedEntry = {
      path: "test.prompt.md",
      kind: FileKind.Generated,
      transformer: "identity",
      fromSource: "source.md",
      renderedHash: renderedHash(original),
      localRenderedHash: renderedHash(original),
      status: FileStatus.Managed,
    };

    expect(detectGeneratedDrift(entry, "modified content")).toBe(true);
  });
});
