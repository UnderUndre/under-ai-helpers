import { describe, it, expect, vi, beforeEach } from "vitest";
import { FleetError } from "../../../src/core/fleet/types.js";

// ── Mocks ───────────────────────────────────────────────────────────
//
// We mock c12's loadConfig and node:fs to control config loading
// without touching the real filesystem.

const mockLoadConfig = vi.fn();

vi.mock("c12", () => ({
  loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
}));

const mockExistsSync = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();

vi.mock("node:fs", () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
}));

// Mock process.env for consistent path resolution
const originalAppData = process.env.APPDATA;
const originalXdg = process.env.XDG_CONFIG_HOME;

beforeEach(() => {
  vi.clearAllMocks();
  // Force a consistent config dir
  process.env.APPDATA = "/test/appdata";
  delete process.env.XDG_CONFIG_HOME;
});

// Restore env after all tests
import { afterAll } from "vitest";
afterAll(() => {
  process.env.APPDATA = originalAppData;
  if (originalXdg) process.env.XDG_CONFIG_HOME = originalXdg;
});

// Import after mocks are set up
const { loadFleetConfig, addOrg, removeOrg } = await import(
  "../../../src/core/fleet/config.js"
);

// ── Default config shape ────────────────────────────────────────────

const DEFAULT_CONFIG = {
  scope: { includeOwnRepos: true, orgs: [], filter: undefined },
  defaultSyncMode: "pr",
  patchOutputDir: "./.fleet-patches",
  discoveryConcurrency: 5,
};

// ── Tests ───────────────────────────────────────────────────────────

describe("fleet config", () => {
  // ── 1. Defaults applied when config file absent ──────────────────

  it("returns defaults when config file absent", async () => {
    mockLoadConfig.mockResolvedValue({ config: {} });

    const config = await loadFleetConfig();

    expect(config.defaultSyncMode).toBe("pr");
    expect(config.scope.includeOwnRepos).toBe(true);
    expect(config.scope.orgs).toEqual([]);
    expect(config.discoveryConcurrency).toBe(5);
    expect(config.patchOutputDir).toBe("./.fleet-patches");
  });

  // ── 2. Malformed JSON → config/malformed ────────────────────────

  it("throws config/malformed on invalid values", async () => {
    mockLoadConfig.mockResolvedValue({
      config: { defaultSyncMode: "invalid-mode" },
    });

    try {
      await loadFleetConfig();
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FleetError);
      expect((e as FleetError).code).toBe("config/malformed");
      expect((e as FleetError).message).toContain("defaultSyncMode");
    }
  });

  // ── 3. Unknown keys logged as warning ────────────────────────────

  it("warns on unknown config keys", async () => {
    mockLoadConfig.mockResolvedValue({
      config: { unknownKey: "value", anotherUnknown: 42 },
    });

    // Should NOT throw — just warn
    const config = await loadFleetConfig();
    expect(config.defaultSyncMode).toBe("pr");
  });

  // ── 4. addOrg adds org, sorts, deduplicates ──────────────────────

  it("addOrg adds org and sorts", async () => {
    mockLoadConfig.mockResolvedValue({
      config: { ...DEFAULT_CONFIG, scope: { ...DEFAULT_CONFIG.scope, orgs: ["beta-org"] } },
    });
    mockExistsSync.mockReturnValue(false);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    await addOrg("alpha-org");

    expect(mockWriteFile).toHaveBeenCalledOnce();
    const written = JSON.parse((mockWriteFile.mock.calls[0] as unknown[])[1] as string);
    expect(written.scope.orgs).toEqual(["alpha-org", "beta-org"]);
  });

  // ── 5. removeOrg removes org ─────────────────────────────────────

  it("removeOrg removes org", async () => {
    mockLoadConfig.mockResolvedValue({
      config: { ...DEFAULT_CONFIG, scope: { ...DEFAULT_CONFIG.scope, orgs: ["alpha-org", "beta-org"] } },
    });
    mockExistsSync.mockReturnValue(false);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    await removeOrg("alpha-org");

    expect(mockWriteFile).toHaveBeenCalledOnce();
    const written = JSON.parse((mockWriteFile.mock.calls[0] as unknown[])[1] as string);
    expect(written.scope.orgs).toEqual(["beta-org"]);
  });

  // ── 6. addOrg idempotent (already present) ───────────────────────

  it("addOrg is idempotent when org already present", async () => {
    mockLoadConfig.mockResolvedValue({
      config: { ...DEFAULT_CONFIG, scope: { ...DEFAULT_CONFIG.scope, orgs: ["my-org"] } },
    });
    mockExistsSync.mockReturnValue(false);

    await addOrg("my-org");

    // Should NOT write
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  // ── 7. removeOrg idempotent (not present) ────────────────────────

  it("removeOrg is idempotent when org not present", async () => {
    mockLoadConfig.mockResolvedValue({
      config: DEFAULT_CONFIG,
    });
    mockExistsSync.mockReturnValue(false);

    await removeOrg("nonexistent-org");

    // Should NOT write
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  // ── 8. TS-config mutation refused ────────────────────────────────

  it("addOrg refuses mutation of TS config", async () => {
    mockExistsSync.mockReturnValue(true); // TS file exists

    try {
      await addOrg("my-org");
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FleetError);
      expect((e as FleetError).code).toBe("config/malformed");
      expect((e as FleetError).message).toContain("TypeScript");
    }
  });

  it("removeOrg refuses mutation of TS config", async () => {
    mockExistsSync.mockReturnValue(true);

    try {
      await removeOrg("my-org");
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FleetError);
      expect((e as FleetError).code).toBe("config/malformed");
      expect((e as FleetError).message).toContain("TypeScript");
    }
  });

  // ── 9. Org-name validation rejects malformed names ───────────────

  it("rejects malformed org names", async () => {
    mockExistsSync.mockReturnValue(false);

    const badNames = ["-starts-dash", "ends-dash-", "has spaces", "", "a".repeat(40) + "-"];

    for (const name of badNames) {
      try {
        await addOrg(name);
        expect.unreachable(`Should have thrown for "${name}"`);
      } catch (e) {
        expect(e).toBeInstanceOf(FleetError);
        expect((e as FleetError).code).toBe("config/invalid-scope");
      }
    }
  });

  // ── 10. discoveryConcurrency out of range → error ────────────────

  it("rejects discoveryConcurrency out of range", async () => {
    for (const val of [0, -1, 21, 100]) {
      mockLoadConfig.mockResolvedValue({
        config: { ...DEFAULT_CONFIG, discoveryConcurrency: val },
      });

      try {
        await loadFleetConfig();
        expect.unreachable(`Should have thrown for ${val}`);
      } catch (e) {
        expect(e).toBeInstanceOf(FleetError);
        expect((e as FleetError).code).toBe("config/malformed");
        expect((e as FleetError).message).toContain("discoveryConcurrency");
      }
    }
  });

  // ── 11. Invalid defaultSyncMode → error ──────────────────────────

  it("rejects invalid defaultSyncMode", async () => {
    mockLoadConfig.mockResolvedValue({
      config: { ...DEFAULT_CONFIG, defaultSyncMode: "ftp" },
    });

    try {
      await loadFleetConfig();
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FleetError);
      expect((e as FleetError).code).toBe("config/malformed");
      expect((e as FleetError).message).toContain("defaultSyncMode");
    }
  });

  // ── Additional: valid config loads correctly ─────────────────────

  it("loads valid config with all fields", async () => {
    mockLoadConfig.mockResolvedValue({
      config: {
        scope: { includeOwnRepos: false, orgs: ["my-org"], filter: "*-prod" },
        defaultSyncMode: "push",
        patchOutputDir: "./custom-patches",
        discoveryConcurrency: 10,
      },
    });

    const config = await loadFleetConfig();

    expect(config.scope.includeOwnRepos).toBe(false);
    expect(config.scope.orgs).toEqual(["my-org"]);
    expect(config.scope.filter).toBe("*-prod");
    expect(config.defaultSyncMode).toBe("push");
    expect(config.patchOutputDir).toBe("./custom-patches");
    expect(config.discoveryConcurrency).toBe(10);
  });

  // ── Additional: invalid org in scope.orgs ────────────────────────

  it("rejects invalid org names in scope.orgs", async () => {
    mockLoadConfig.mockResolvedValue({
      config: {
        ...DEFAULT_CONFIG,
        scope: { ...DEFAULT_CONFIG.scope, orgs: ["-invalid"] },
      },
    });

    try {
      await loadFleetConfig();
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FleetError);
      expect((e as FleetError).code).toBe("config/invalid-scope");
    }
  });
});
