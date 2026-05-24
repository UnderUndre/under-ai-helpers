/**
 * Run Engine Types
 * Defines pipeline execution, ensemble orchestration, and merge interfaces.
 */

import type { AgentTag } from "./tool-registry.js";

// --- Run ---

export type RunStatus =
  | "pending"
  | "pipeline"
  | "contracts"
  | "ensemble"
  | "merging"
  | "validating"
  | "completed"
  | "failed";

export interface Run {
  id: string;
  description: string;
  status: RunStatus;
  configSnapshot: string; // JSON
  projectDir: string;
  resultBranch?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

// --- Stage ---

export type StageType =
  | "specify"
  | "review-spec"
  | "plan"
  | "review-plan"
  | "contracts"
  | "tasks"
  | "review-tasks"
  | "implement"
  | "validate";

export type StageStatus =
  | "pending"
  | "running"
  | "approved"
  | "rejected"
  | "failed";

export interface Stage {
  id: string;
  runId: string;
  type: StageType;
  toolName: string;
  status: StageStatus;
  prompt: string;
  outputPath?: string;
  attempt: number;
  processId?: number;
  durationMs?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

// --- Task (parsed from tasks.md) ---

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "blocked";

export interface ParsedTask {
  id: string; // T001, T002, etc.
  agentTag: AgentTag;
  storyLabel?: string; // [US1], [US2]
  description: string;
  filePaths: string[]; // extracted from description
}

export interface RuntimeTask extends ParsedTask {
  runId: string;
  toolName: string;
  status: TaskStatus;
  worktreePath?: string;
  processId?: number;
  lane: number;
  blockedBy: string[]; // task IDs
  durationMs?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

// --- Dependency Graph ---

export interface DependencyEdge {
  from: string[]; // task IDs (multiple = fan-in with +)
  to: string[]; // task IDs (multiple = fan-out with ,)
}

export interface DependencyGraph {
  edges: DependencyEdge[];
  /** Tasks with no incoming edges — can start immediately */
  roots: string[];
  /** Longest path through the graph */
  criticalPath: string[];
}

export interface ParallelLane {
  number: number;
  agentFlow: string; // e.g. "[DB] → [BE]"
  taskIds: string[];
  blockedBy: string; // e.g. "T001" or "T004 + T005"
}

// --- Pipeline Execution ---

export interface PipelineResult {
  stages: Stage[];
  artifacts: {
    specPath?: string;
    planPath?: string;
    tasksPath?: string;
    contractPaths: string[];
  };
  totalDurationMs: number;
}

// --- Ensemble Execution ---

export interface EnsembleResult {
  tasks: RuntimeTask[];
  lanes: ParallelLane[];
  mergeResult: MergeResult;
  totalDurationMs: number;
}

export interface MergeResult {
  success: boolean;
  branch: string;
  conflicts: MergeConflict[];
  validationPassed: boolean;
  validationOutput?: string;
}

export interface MergeConflict {
  filePath: string;
  worktreeA: string;
  worktreeB: string;
  resolved: boolean;
  resolvedBy?: string; // tool name or "operator"
}

// --- Review ---

export interface ReviewResult {
  decision: "APPROVE" | "REJECT";
  feedback: string;
  toolName: string;
  durationMs: number;
}
