/**
 * Tool Registry Types
 * Defines the shape of orch.config.yaml and runtime tool management.
 */

export interface ToolConfig {
  name: string;
  command: string;
  headlessFlags: string[];
  strengths: ToolStrength[];
  priority: number;
  provider: ToolProvider;
  enabled: boolean;
  healthCheckPrompt?: string;
}

export type ToolStrength =
  | "backend"
  | "frontend"
  | "database"
  | "review"
  | "spec"
  | "security"
  | "devops";

export type ToolProvider =
  | "anthropic"
  | "google"
  | "alibaba"
  | "github"
  | "local";

export type AgentTag =
  | "[SETUP]"
  | "[DB]"
  | "[BE]"
  | "[FE]"
  | "[OPS]"
  | "[E2E]"
  | "[SEC]";

export const AGENT_TAG_WHITELIST: AgentTag[] = [
  "[SETUP]",
  "[DB]",
  "[BE]",
  "[FE]",
  "[OPS]",
  "[E2E]",
  "[SEC]",
];

export interface PipelineConfig {
  specify: string; // tool name
  "review-spec": string;
  plan: string;
  "review-plan": string;
  contracts: string;
  tasks: string;
  "review-tasks": string;
}

export interface EnsembleConfig {
  "[BE]": string; // tool name
  "[FE]": string;
  "[DB]": string;
  "[OPS]": string;
  "[E2E]": string;
  "[SEC]": string;
}

export interface OrchConfig {
  version: number;
  defaults: {
    maxRetries: number;
    timeouts: {
      implementation: number; // seconds
      review: number;
    };
    buildCommand: string;
    validateCommand: string;
  };
  pipeline: PipelineConfig;
  ensemble: EnsembleConfig;
  tools: Record<string, ToolConfig>;
}

export interface ToolHealthResult {
  name: string;
  available: boolean;
  responseTimeMs: number;
  error?: string;
}
