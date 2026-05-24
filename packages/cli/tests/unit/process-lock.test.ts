import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "pathe";
import { tmpdir } from "node:os";
import {
  acquireProcessLock,
  releaseProcessLock,
  isStaleProcessLock,
} from "../../src/core/process-lock.js";

describe("process-lock", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "helpers-plock-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("acquire/release round-trip", async () => {
    await acquireProcessLock(tempDir);

    // Lock file should contain our PID
    const content = await readFile(join(tempDir, ".helpers/lock.pid"), "utf8");
    expect(parseInt(content.trim(), 10)).toBe(process.pid);

    await releaseProcessLock(tempDir);

    // Should not throw on re-acquire after release
    await acquireProcessLock(tempDir);
    await releaseProcessLock(tempDir);
  });

  it("aborts on double-acquire (same live PID)", async () => {
    await acquireProcessLock(tempDir);

    // Second acquire should throw because our PID is still alive
    await expect(acquireProcessLock(tempDir)).rejects.toThrow("Another helpers process");

    await releaseProcessLock(tempDir);
  });

  it("auto-cleans stale PID", async () => {
    // Write a PID that doesn't exist
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(tempDir, ".helpers"), { recursive: true });
    await writeFile(join(tempDir, ".helpers/lock.pid"), "999999999", "utf8");

    // Should succeed because PID 999999999 is not alive
    await acquireProcessLock(tempDir);
    await releaseProcessLock(tempDir);
  });

  it("isStaleProcessLock detects dead PID", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(tempDir, ".helpers"), { recursive: true });
    await writeFile(join(tempDir, ".helpers/lock.pid"), "999999999", "utf8");

    expect(await isStaleProcessLock(tempDir)).toBe(true);
  });

  it("isStaleProcessLock returns false without lock file", async () => {
    expect(await isStaleProcessLock(tempDir)).toBe(false);
  });
});
