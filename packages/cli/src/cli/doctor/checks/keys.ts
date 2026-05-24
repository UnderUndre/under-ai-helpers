import type { HealthCheck } from "../types.js";

const KEY_ENV_VARS: Array<{ env: string; label: string; critical: boolean }> = [
  { env: "ANTHROPIC_API_KEY", label: "Anthropic", critical: false },
  { env: "OPENAI_API_KEY", label: "OpenAI", critical: false },
  { env: "OPENROUTER_API_KEY", label: "OpenRouter", critical: false },
  { env: "GH_TOKEN", label: "GitHub", critical: false },
];

const ZHIPU_ENV = "ZHIPU_API_KEY";
const GLM_ENV = "GLM_API_KEY";

export async function checkApiKeys(): Promise<HealthCheck> {
  const present: string[] = [];
  const missing: string[] = [];
  let hasAnyCriticalFail = false;

  for (const { env, label, critical } of KEY_ENV_VARS) {
    if (process.env[env]) {
      present.push(label);
    } else {
      missing.push(label);
      if (critical) hasAnyCriticalFail = true;
    }
  }

  const hasZhipu = !!process.env[ZHIPU_ENV];
  const hasGlm = !!process.env[GLM_ENV];

  let zhipuGlmStatus: "pass" | "warn" | "fail";
  let zhipuGlmDetail: string;

  if (hasZhipu && hasGlm) {
    zhipuGlmStatus = "pass";
    zhipuGlmDetail = "ZHIPU + GLM keys present";
  } else if (hasZhipu || hasGlm) {
    const which = hasZhipu ? "ZHIPU" : "GLM";
    const whichMissing = hasZhipu ? "GLM" : "ZHIPU";
    zhipuGlmStatus = "warn";
    zhipuGlmDetail = `Only ${which} key present (${whichMissing} missing)`;
    missing.push(`ZHIPU/GLM (${whichMissing})`);
  } else {
    zhipuGlmStatus = "fail";
    zhipuGlmDetail = "Neither ZHIPU nor GLM key present";
    missing.push("ZHIPU/GLM");
    hasAnyCriticalFail = true;
  }

  const parts: string[] = [];
  if (present.length > 0) {
    parts.push(`Present: ${present.join(", ")}`);
  }
  parts.push(zhipuGlmDetail);
  if (missing.length > 0 && (hasZhipu || hasGlm)) {
    parts.push(`Missing: ${missing.join(", ")}`);
  } else if (missing.length > 0) {
    parts.push(`Missing: ${missing.join(", ")}`);
  }

  return {
    name: "keys.api-keys",
    category: "keys",
    status: hasAnyCriticalFail ? "fail" : missing.length > 0 ? "warn" : "pass",
    detail: parts.join("; "),
    critical: hasAnyCriticalFail,
  };
}
