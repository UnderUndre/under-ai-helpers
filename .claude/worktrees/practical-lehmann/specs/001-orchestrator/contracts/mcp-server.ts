/**
 * MCP Server Tool Definitions
 * Defines the tools exposed by the orch-mcp server for Claude Code integration.
 */

// --- Tool: orch.run ---

export interface OrchRunInput {
  /** Natural language task description */
  description: string;
  /** Project directory (defaults to cwd) */
  projectDir?: string;
  /** Dry run — show plan without executing */
  dryRun?: boolean;
  /** Override specific tool assignments */
  toolOverrides?: Record<string, string>;
}

export interface OrchRunOutput {
  runId: string;
  status: string;
  message: string;
  /** Path to result branch (if completed) */
  resultBranch?: string;
}

// --- Tool: orch.status ---

export interface OrchStatusInput {
  /** Run ID to check (latest if omitted) */
  runId?: string;
}

export interface OrchStatusOutput {
  runId: string;
  status: string;
  currentPhase: string;
  progress: {
    completed: number;
    failed: number;
    blocked: number;
    pending: number;
    total: number;
  };
  activeLanes: Array<{
    lane: number;
    agentTag: string;
    toolName: string;
    taskId: string;
    status: string;
  }>;
  elapsed: string; // human-readable duration
}

// --- Tool: orch.dispatch_task ---

export interface OrchDispatchTaskInput {
  /** Run ID */
  runId: string;
  /** Task ID from tasks.md (e.g., T003) */
  taskId: string;
  /** Override tool assignment */
  toolName?: string;
}

export interface OrchDispatchTaskOutput {
  taskId: string;
  toolName: string;
  status: string;
  worktreePath: string;
}

// --- Tool: orch.merge ---

export interface OrchMergeInput {
  /** Run ID */
  runId: string;
  /** Force merge even with pending tasks */
  force?: boolean;
}

export interface OrchMergeOutput {
  success: boolean;
  branch: string;
  conflicts: number;
  validationPassed: boolean;
  message: string;
}

// --- Tool: orch.tools_list ---

export interface OrchToolsListInput {
  /** Include health check results */
  healthCheck?: boolean;
}

export interface OrchToolsListOutput {
  tools: Array<{
    name: string;
    command: string;
    strengths: string[];
    priority: number;
    provider: string;
    enabled: boolean;
    healthy?: boolean;
    responseTimeMs?: number;
  }>;
}

// --- Tool: orch.cleanup ---

export interface OrchCleanupInput {
  /** Force remove all worktrees including active ones */
  force?: boolean;
  /** Max age in hours for orphan detection (default: 24) */
  maxAgeHours?: number;
}

export interface OrchCleanupOutput {
  removed: number;
  freedMb: number;
  remaining: number;
}
