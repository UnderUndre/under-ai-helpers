import { describe, it, expect } from "vitest";
import { canonicalHash, slotsHash, renderedHash } from "../../src/core/hash.js";

describe("canonicalHash", () => {
  it("hashes a plain file", () => {
    const hash = canonicalHash("hello world\n");
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("normalizes CRLF to LF", () => {
    const lf = canonicalHash("line1\nline2\n");
    const crlf = canonicalHash("line1\r\nline2\r\n");
    expect(lf).toBe(crlf);
  });

  it("replaces slot bodies with placeholder", () => {
    const content = "before\n<!-- HELPERS:CUSTOM START -->\nslot body here\n<!-- HELPERS:CUSTOM END -->\nafter";
    const withSlots = canonicalHash(content, ["slot body here"]);
    const withoutSlots = canonicalHash("before\n<!-- HELPERS:CUSTOM START -->\ndifferent body\n<!-- HELPERS:CUSTOM END -->\nafter", ["different body"]);
    // Both should produce same canonical hash since slot bodies are replaced
    expect(withSlots).toBe(withoutSlots);
  });

  it("produces consistent output for same input", () => {
    const a = canonicalHash("test content");
    const b = canonicalHash("test content");
    expect(a).toBe(b);
  });

  it("handles file with header correctly", () => {
    const withHeader = "<!-- AUTO-GENERATED -->\ncontent";
    const hash = canonicalHash(withHeader);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

describe("slotsHash", () => {
  it("returns undefined for empty slots", () => {
    expect(slotsHash([])).toBeUndefined();
  });

  it("hashes single slot body", () => {
    const hash = slotsHash(["my custom content"]);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("joins multiple slots with null separator", () => {
    const single = slotsHash(["a\x00b"]);
    const multi = slotsHash(["a", "b"]);
    expect(single).toBe(multi);
  });
});

describe("renderedHash", () => {
  it("hashes raw content including header", () => {
    const content = "<!-- AUTO-GENERATED -->\n# Title\nBody";
    const hash = renderedHash(content);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
