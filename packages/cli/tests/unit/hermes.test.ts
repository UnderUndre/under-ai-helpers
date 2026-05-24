import { describe, it, expect, vi, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
  resolvePrompt,
  buildHermesArgs,
  findHermesBinary,
} from "../../src/cli/hermes.js";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  open: vi.fn(),
}));

describe("resolvePrompt", () => {
  beforeEach(() => {
    vi.mocked(readFile).mockReset();
  });

  it("returns arg prompt when provided", async () => {
    const result = await resolvePrompt({ prompt: "hello world" });
    expect(result).toEqual({ source: "arg", text: "hello world" });
  });

  it("prioritizes arg over from-file", async () => {
    const result = await resolvePrompt({
      prompt: "from arg",
      "from-file": "/some/file.txt",
    });
    expect(result).toEqual({ source: "arg", text: "from arg" });
  });

  it("returns null when stdin is TTY and no other source", async () => {
    const saved = process.stdin.isTTY;
    try {
      Object.defineProperty(process.stdin, "isTTY", {
        value: true,
        configurable: true,
        writable: true,
      });
      const result = await resolvePrompt({});
      expect(result).toBeNull();
    } finally {
      Object.defineProperty(process.stdin, "isTTY", {
        value: saved,
        configurable: true,
        writable: true,
      });
    }
  });

  it("throws on missing from-file", async () => {
    vi.mocked(readFile).mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    await expect(
      resolvePrompt({ "from-file": "/nonexistent/file.txt" }),
    ).rejects.toThrow("Cannot read --from-file");
  });

  it("reads from-file when arg is empty", async () => {
    vi.mocked(readFile).mockResolvedValue("file contents here");
    const result = await resolvePrompt({
      prompt: "",
      "from-file": "/some/file.txt",
    });
    expect(result).toEqual({ source: "file", text: "file contents here" });
  });
});

describe("buildHermesArgs", () => {
  it("passes all flags", () => {
    const result = buildHermesArgs({
      model: "gpt-4",
      provider: "openai",
      toolsets: "fs,git",
      verbose: true,
    });
    expect(result).toEqual([
      "--model",
      "gpt-4",
      "--provider",
      "openai",
      "--toolsets",
      "fs,git",
      "--verbose",
    ]);
  });

  it("returns defaults for model/provider", () => {
    const result = buildHermesArgs({
      model: "glm/glm-5.1",
      provider: "custom",
    });
    expect(result).toEqual(["--model", "glm/glm-5.1", "--provider", "custom"]);
  });

  it("skips undefined toolsets and false verbose", () => {
    const result = buildHermesArgs({
      model: "glm/glm-5.1",
      provider: "custom",
      verbose: false,
    });
    expect(result).toEqual(["--model", "glm/glm-5.1", "--provider", "custom"]);
  });

  it("handles only model", () => {
    const result = buildHermesArgs({ model: "claude-3" });
    expect(result).toEqual(["--model", "claude-3"]);
  });
});

describe("findHermesBinary", () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockReset();
  });

  it("returns null when all candidates fail", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("not found");
    });
    const result = findHermesBinary();
    expect(result).toBeNull();
  });

  it("returns candidate when found", () => {
    vi.mocked(execFileSync).mockImplementation((_which: string, args: string[]) => {
      const candidate = args[0];
      if (candidate === "hermes.exe" || candidate === "hermes") return "/usr/local/bin/hermes";
      throw new Error("not found");
    });
    const result = findHermesBinary();
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
  });
});
