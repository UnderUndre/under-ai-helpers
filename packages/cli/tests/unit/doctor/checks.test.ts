import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import consola from "consola";
import { checkNodeVersion } from "../../../src/cli/doctor/checks/system.js";
import { checkApiKeys } from "../../../src/cli/doctor/checks/keys.js";
import { checkStructure } from "../../../src/cli/doctor/checks/structure.js";
import { checkDrift } from "../../../src/cli/doctor/checks/drift.js";
import { registerCheck, runAllChecks, clearChecks } from "../../../src/cli/doctor/runner.js";
import { renderTable, renderJson, renderQuiet } from "../../../src/cli/doctor/formatters.js";
import type { DoctorResult, HealthCheck } from "../../../src/cli/doctor/types.js";

const makeCheck = (overrides: Partial<HealthCheck> = {}): HealthCheck => ({
  name: "test.check",
  category: "system",
  status: "pass",
  detail: "ok",
  critical: false,
  ...overrides,
});

const makeResult = (checks: HealthCheck[] = []): DoctorResult => {
  const summary = { pass: 0, warn: 0, fail: 0, unknown: 0 };
  for (const c of checks) summary[c.status]++;
  return { checks, summary, exitCode: checks.some((c) => c.critical && c.status === "fail") ? 1 : 0 };
};

describe("system checks", () => {
  it("checkNodeVersion passes for node >= 20", async () => {
    const result = await checkNodeVersion();
    const major = parseInt(process.version.replace("v", "").split(".")[0] ?? "0", 10);
    expect(result.status).toBe(major >= 20 ? "pass" : "fail");
    expect(result.name).toBe("system.node-version");
    expect(result.critical).toBe(true);
  });
});

describe("API key checks", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("passes when both ZHIPU and GLM keys present", async () => {
    process.env.ZHIPU_API_KEY = "test-zhipu";
    process.env.GLM_API_KEY = "test-glm";
    process.env.ANTHROPIC_API_KEY = "test-ant";
    process.env.OPENAI_API_KEY = "test-oai";
    process.env.OPENROUTER_API_KEY = "test-or";
    process.env.GH_TOKEN = "test-gh";
    const result = await checkApiKeys();
    expect(result.status).toBe("pass");
  });

  it("warns when only ZHIPU key present", async () => {
    delete process.env.GLM_API_KEY;
    process.env.ZHIPU_API_KEY = "test-zhipu";
    const result = await checkApiKeys();
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("GLM");
  });

  it("warns when only GLM key present", async () => {
    delete process.env.ZHIPU_API_KEY;
    process.env.GLM_API_KEY = "test-glm";
    const result = await checkApiKeys();
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("ZHIPU");
  });

  it("fails when neither ZHIPU nor GLM key present", async () => {
    delete process.env.ZHIPU_API_KEY;
    delete process.env.GLM_API_KEY;
    const result = await checkApiKeys();
    expect(result.status).toBe("fail");
    expect(result.critical).toBe(true);
  });

  it("never exposes key values in output", async () => {
    process.env.ZHIPU_API_KEY = "super-secret-key-value-12345";
    process.env.GLM_API_KEY = "another-secret-key-67890";
    process.env.ANTHROPIC_API_KEY = "sk-ant-secret";
    const result = await checkApiKeys();
    expect(result.detail).not.toContain("super-secret-key-value");
    expect(result.detail).not.toContain("sk-ant-secret");
    expect(result.detail).not.toContain("another-secret-key");
  });
});

describe("drift check", () => {
  it("returns pass or fail based on status --strict exit code", async () => {
    const result = await checkDrift();
    expect(["pass", "fail"]).toContain(result.status);
    expect(result.critical).toBe(true);
    expect(result.category).toBe("drift");
  });
});

describe("structure checks", () => {
  it("returns a valid HealthCheck", async () => {
    const result = await checkStructure();
    expect(result.name).toBe("structure.claude-dir");
    expect(result.category).toBe("structure");
    expect(["pass", "warn", "fail"]).toContain(result.status);
  });
});

describe("runner", () => {
  beforeEach(() => {
    clearChecks();
  });

  it("runs registered checks and aggregates results", async () => {
    registerCheck(async () => makeCheck({ name: "a", status: "pass" }));
    registerCheck(async () => makeCheck({ name: "b", status: "warn" }));
    const result = await runAllChecks();
    expect(result.checks).toHaveLength(2);
    expect(result.summary.pass).toBe(1);
    expect(result.summary.warn).toBe(1);
    expect(result.exitCode).toBe(0);
  });

  it("sets exitCode 1 on critical fail", async () => {
    registerCheck(async () => makeCheck({ name: "a", status: "fail", critical: true }));
    const result = await runAllChecks();
    expect(result.exitCode).toBe(1);
  });

  it("exitCode 0 on non-critical fail", async () => {
    registerCheck(async () => makeCheck({ name: "a", status: "fail", critical: false }));
    const result = await runAllChecks();
    expect(result.exitCode).toBe(0);
  });

  it("clearChecks resets runners", async () => {
    registerCheck(async () => makeCheck());
    clearChecks();
    const result = await runAllChecks();
    expect(result.checks).toHaveLength(0);
  });
});

describe("formatters", () => {
  const passResult = makeResult([makeCheck({ name: "test.ok", status: "pass", detail: "all good" })]);
  const failResult = makeResult([
    makeCheck({ name: "test.bad", status: "fail", detail: "broken", critical: true }),
    makeCheck({ name: "test.ok", status: "pass", detail: "fine" }),
  ]);

  it("renderJson outputs valid JSON", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    renderJson(passResult);
    const output = spy.mock.calls[0][0] as string;
    spy.mockRestore();
    const parsed = JSON.parse(output);
    expect(parsed.checks).toHaveLength(1);
    expect(parsed.summary.pass).toBe(1);
  });

  it("renderQuiet shows only failures", () => {
    const errorSpy = vi.spyOn(consola, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(consola, "warn").mockImplementation(() => {});

    renderQuiet(failResult);

    const allOutput = errorSpy.mock.calls.map((c) => String(c[0])).join(" ");

    errorSpy.mockRestore();
    warnSpy.mockRestore();

    expect(allOutput).toContain("test.bad");
    expect(allOutput).not.toContain("test.ok");
  });

  it("renderQuiet shows nothing when no failures", () => {
    const errorSpy = vi.spyOn(consola, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(consola, "warn").mockImplementation(() => {});
    const successSpy = vi.spyOn(consola, "success").mockImplementation(() => {});

    renderQuiet(passResult);

    const callCount = errorSpy.mock.calls.length + warnSpy.mock.calls.length + successSpy.mock.calls.length;

    errorSpy.mockRestore();
    warnSpy.mockRestore();
    successSpy.mockRestore();

    expect(callCount).toBe(0);
  });

  it("renderTable outputs without throwing", () => {
    expect(() => renderTable(passResult)).not.toThrow();
    expect(() => renderTable(failResult)).not.toThrow();
  });
});

describe("full pipeline", () => {
  beforeEach(() => {
    clearChecks();
  });

  it("register + runAll produces valid DoctorResult", async () => {
    registerCheck(async () => makeCheck({ name: "sys.a", status: "pass" }));
    registerCheck(async () => makeCheck({ name: "sys.b", status: "warn" }));
    registerCheck(async () => makeCheck({ name: "sys.c", status: "fail", critical: true }));

    const result = await runAllChecks();

    expect(result.checks).toHaveLength(3);
    expect(result.summary).toEqual({ pass: 1, warn: 1, fail: 1, unknown: 0 });
    expect(result.exitCode).toBe(1);
  });

  it("exitCode 0 when all pass", async () => {
    registerCheck(async () => makeCheck({ name: "a", status: "pass" }));
    registerCheck(async () => makeCheck({ name: "b", status: "pass" }));

    const result = await runAllChecks();
    expect(result.exitCode).toBe(0);
    expect(result.summary.pass).toBe(2);
  });
});
