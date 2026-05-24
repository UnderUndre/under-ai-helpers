import { describe, it, expect } from "vitest";
import { parseSlots, validateSlotPairing, mergeSlots } from "../../src/core/slots.js";

describe("parseSlots", () => {
  it("parses balanced markdown slots", () => {
    const content = `# Title
<!-- HELPERS:CUSTOM START -->
My custom content
<!-- HELPERS:CUSTOM END -->
# Footer`;

    const slots = parseSlots(content, ".md");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.body).toBe("My custom content");
    expect(slots[0]!.startLine).toBe(1);
    expect(slots[0]!.endLine).toBe(3);
  });

  it("parses multiple slots", () => {
    const content = `# Title
<!-- HELPERS:CUSTOM START -->
Slot 1
<!-- HELPERS:CUSTOM END -->
Middle
<!-- HELPERS:CUSTOM START -->
Slot 2
<!-- HELPERS:CUSTOM END -->`;

    const slots = parseSlots(content, ".md");
    expect(slots).toHaveLength(2);
    expect(slots[0]!.body).toBe("Slot 1");
    expect(slots[1]!.body).toBe("Slot 2");
  });

  it("returns empty for JSON files (FR-013 rejection)", () => {
    const content = `{
  "key": "<!-- HELPERS:CUSTOM START -->"
}`;
    const slots = parseSlots(content, ".json");
    expect(slots).toHaveLength(0);
  });

  it("detects hash-comment markers for YAML", () => {
    const content = `key: value
# HELPERS:CUSTOM START
custom: stuff
# HELPERS:CUSTOM END
other: value`;

    const slots = parseSlots(content, ".yaml");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.body).toBe("custom: stuff");
  });

  it("detects JS-style markers for TypeScript", () => {
    const content = `const x = 1;
// HELPERS:CUSTOM START
const custom = "my value";
// HELPERS:CUSTOM END
const y = 2;`;

    const slots = parseSlots(content, ".ts");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.body).toBe('const custom = "my value";');
  });

  it("handles multiline slot bodies", () => {
    const content = `# Title
<!-- HELPERS:CUSTOM START -->
Line 1
Line 2
Line 3
<!-- HELPERS:CUSTOM END -->`;

    const slots = parseSlots(content, ".md");
    expect(slots[0]!.body).toBe("Line 1\nLine 2\nLine 3");
  });
});

describe("validateSlotPairing", () => {
  it("returns null for valid pairing", () => {
    const content = `<!-- HELPERS:CUSTOM START -->
content
<!-- HELPERS:CUSTOM END -->`;
    expect(validateSlotPairing(content, ".md")).toBeNull();
  });

  it("returns error for unmatched START", () => {
    const content = `<!-- HELPERS:CUSTOM START -->
content`;
    const err = validateSlotPairing(content, ".md");
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain("START");
  });

  it("returns error for unmatched END", () => {
    const content = `content
<!-- HELPERS:CUSTOM END -->`;
    const err = validateSlotPairing(content, ".md");
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain("END");
  });

  it("returns null for JSON (no slots possible)", () => {
    expect(validateSlotPairing("{}", ".json")).toBeNull();
  });

  it("returns error for nested markers", () => {
    const content = `<!-- HELPERS:CUSTOM START -->
<!-- HELPERS:CUSTOM START -->
<!-- HELPERS:CUSTOM END -->
<!-- HELPERS:CUSTOM END -->`;
    const err = validateSlotPairing(content, ".md");
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain("Nested");
  });
});

describe("mergeSlots", () => {
  it("preserves existing slot content during merge", () => {
    const existing = `# Title
<!-- HELPERS:CUSTOM START -->
My precious content
<!-- HELPERS:CUSTOM END -->
# Footer`;

    const newContent = `# Title
<!-- HELPERS:CUSTOM START -->
Default content from upstream
<!-- HELPERS:CUSTOM END -->
# Footer`;

    const existingSlots = parseSlots(existing, ".md");
    const merged = mergeSlots(newContent, existingSlots, ".md");

    expect(merged).toContain("My precious content");
    expect(merged).not.toContain("Default content from upstream");
  });

  it("returns new content as-is when no existing slots", () => {
    const newContent = `# Title
<!-- HELPERS:CUSTOM START -->
New content
<!-- HELPERS:CUSTOM END -->`;

    const merged = mergeSlots(newContent, [], ".md");
    expect(merged).toBe(newContent);
  });
});
