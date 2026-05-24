/**
 * Unit test for the sync upstream-self-sync guard.
 *
 * The guard lives inline in src/cli/sync.ts — `access(.../helpers.config.ts)`
 * + `--allow-self-sync` override. This test verifies the decision logic in
 * isolation by simulating the two file-presence cases and the flag.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";

async function hasHelpersConfig(root: string): Promise<boolean> {
  try {
    await access(join(root, "helpers.config.ts"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-implementation of the guard predicate to keep this test decoupled from
 * the citty command wrapper. The condition we test is: "refuse sync when
 * helpers.config.ts is present AND --allow-self-sync is not passed".
 */
function shouldRefuseSync(args: { "allow-self-sync"?: boolean }, upstreamHit: boolean): boolean {
  if (args["allow-self-sync"]) return false;
  return upstreamHit;
}

describe("sync upstream-self-sync guard", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "clai-sync-guard-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("refuses when helpers.config.ts is present and no override flag", async () => {
    await writeFile(join(dir, "helpers.config.ts"), "export default {};", "utf8");

    const upstream = await hasHelpersConfig(dir);
    expect(upstream).toBe(true);
    expect(shouldRefuseSync({}, upstream)).toBe(true);
  });

  it("allows sync in a consumer repo (no helpers.config.ts)", async () => {
    const upstream = await hasHelpersConfig(dir);
    expect(upstream).toBe(false);
    expect(shouldRefuseSync({}, upstream)).toBe(false);
  });

  it("permits sync with --allow-self-sync even in upstream layout", async () => {
    await writeFile(join(dir, "helpers.config.ts"), "export default {};", "utf8");

    const upstream = await hasHelpersConfig(dir);
    expect(upstream).toBe(true);
    expect(shouldRefuseSync({ "allow-self-sync": true }, upstream)).toBe(false);
  });

  it("override flag is a no-op in a consumer repo (already permitted)", async () => {
    const upstream = await hasHelpersConfig(dir);
    expect(shouldRefuseSync({ "allow-self-sync": true }, upstream)).toBe(false);
    expect(shouldRefuseSync({}, upstream)).toBe(false);
  });
});
