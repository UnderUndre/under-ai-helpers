export interface HealthCheck {
  name: string;
  category: "system" | "tools" | "mcp" | "keys" | "structure" | "drift";
  status: "pass" | "warn" | "fail" | "unknown";
  detail: string;
  critical: boolean;
}

export interface DoctorResult {
  checks: HealthCheck[];
  summary: { pass: number; warn: number; fail: number; unknown: number };
  exitCode: 0 | 1;
}
