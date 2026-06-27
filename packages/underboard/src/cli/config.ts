import { loadConfig as c12Load } from "c12";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import * as dotenv from "dotenv";

export interface HonchoConfig {
  endpoint: string; // base URL, e.g. "http://127.0.0.1:8000"
  token?: string;
  timeout_ms: number;
}

export interface EmbeddingConfig {
  model_name: string; // metadata only, e.g. "paraphrase-multilingual-MiniLM-L12-v2.onnx"
  model_path?: string; // filesystem path to ONNX model; if unset, embeddings are disabled
}

export interface LlmConfig {
  endpoint?: string; // base URL, e.g. "https://api.openai.com/v1"
  api_key?: string;
  model?: string;
}

export interface UnderboardConfig {
  port: number;
  db_path: string;
  archive_mode: string;
  archive_after_days: number;
  stalled_mode: string;
  stalled_after_hours: number;
  retrieval: {
    lexical_weight: number;
    semantic_weight: number;
    default_top_k: number;
    default_threshold: number;
    max_results: number;
  };
  honcho: HonchoConfig;
  embedding: EmbeddingConfig;
  llm: LlmConfig;
}

export const DEFAULT_CONFIG: UnderboardConfig = {
  port: 4280,
  db_path: path.join(os.homedir(), ".underboard", "data.db"),
  archive_mode: "manual",
  archive_after_days: 30,
  stalled_mode: "off",
  stalled_after_hours: 24,
  retrieval: {
    lexical_weight: 0.4,
    semantic_weight: 0.6,
    default_top_k: 5,
    default_threshold: 0.3,
    max_results: 50,
  },
  honcho: {
    endpoint: "http://127.0.0.1:8000",
    token: undefined,
    timeout_ms: 5000,
  },
  embedding: {
    model_name: "paraphrase-multilingual-MiniLM-L12-v2.onnx",
    model_path: undefined,
  },
  llm: {
    endpoint: undefined,
    api_key: undefined,
    model: undefined,
  },
};

export function expandHome(filepath: string): string {
  if (filepath.startsWith("~")) {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

export function redactConfig(config: UnderboardConfig): UnderboardConfig {
  const redacted = JSON.parse(JSON.stringify(config));
  if (redacted.honcho && redacted.honcho.token) {
    redacted.honcho.token = "***";
  }
  if (redacted.llm && redacted.llm.api_key) {
    redacted.llm.api_key = "***";
  }
  return redacted;
}

function mergeConfigs(base: any, source: any): any {
  if (!source) return base;
  const result = { ...base };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = mergeConfigs(result[key] || {}, source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

export async function loadConfig(overrides?: Partial<UnderboardConfig>): Promise<UnderboardConfig> {
  const configDir = path.join(os.homedir(), ".underboard");
  const configPath = path.join(configDir, "config.json");

  // FR-008: Load ~/.underboard/.env first via dotenv.config()
  const homeDotenvPath = path.join(configDir, ".env");
  if (fs.existsSync(homeDotenvPath)) {
    dotenv.config({ path: homeDotenvPath });
  }

  // Create config.json with 0600 permissions if not exists (FR-007, FR-011)
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), { mode: 0o600 });
  } else {
    // Migration: If keys honcho, embedding, or llm are missing, merge and rewrite
    try {
      const existing = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (!existing.honcho || !existing.embedding || !existing.llm) {
        const migrated = mergeConfigs(DEFAULT_CONFIG, existing);
        fs.writeFileSync(configPath, JSON.stringify(migrated, null, 2), { mode: 0o600 });
      }
    } catch {}
  }

  // Load from c12 (cascades configPath and cwd .env via dotenv: true)
  const { config: loadedConfig } = await c12Load<UnderboardConfig>({
    configFile: configPath,
    defaults: DEFAULT_CONFIG,
    dotenv: true,
  });

  // Resolve base config
  let config = mergeConfigs(DEFAULT_CONFIG, loadedConfig);

  // Apply environment variables overrides
  const envOverrides: any = {};
  if (process.env.PORT) {
    const port = Number(process.env.PORT);
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error(`Invalid PORT env var: "${process.env.PORT}" matches non-numeric or <= 0`);
    }
    envOverrides.port = port;
  }
  if (process.env.UNDERBOARD_DB_PATH) {
    envOverrides.db_path = expandHome(process.env.UNDERBOARD_DB_PATH);
  }

  // Honcho env overrides
  if (process.env.HONCHO_ENDPOINT || process.env.HONCHO_TOKEN || process.env.HONCHO_TIMEOUT_MS) {
    envOverrides.honcho = {};
    if (process.env.HONCHO_ENDPOINT) envOverrides.honcho.endpoint = process.env.HONCHO_ENDPOINT;
    if (process.env.HONCHO_TOKEN) envOverrides.honcho.token = process.env.HONCHO_TOKEN;
    if (process.env.HONCHO_TIMEOUT_MS) {
      const timeout = Number(process.env.HONCHO_TIMEOUT_MS);
      if (!Number.isFinite(timeout) || timeout < 0) {
        throw new Error(`Invalid HONCHO_TIMEOUT_MS env var: "${process.env.HONCHO_TIMEOUT_MS}" matches non-numeric or < 0`);
      }
      envOverrides.honcho.timeout_ms = timeout;
    }
  }

  // Embedding env overrides
  if (process.env.EMBEDDING_MODEL_NAME || process.env.EMBEDDING_MODEL_PATH) {
    envOverrides.embedding = {};
    if (process.env.EMBEDDING_MODEL_NAME) envOverrides.embedding.model_name = process.env.EMBEDDING_MODEL_NAME;
    if (process.env.EMBEDDING_MODEL_PATH) envOverrides.embedding.model_path = expandHome(process.env.EMBEDDING_MODEL_PATH);
  }

  // LLM env overrides
  if (process.env.LLM_ENDPOINT || process.env.LLM_API_KEY || process.env.LLM_MODEL) {
    envOverrides.llm = {};
    if (process.env.LLM_ENDPOINT) {
      let endpoint = process.env.LLM_ENDPOINT;
      if (endpoint.endsWith("/chat/completions")) {
        endpoint = endpoint.replace(/\/chat\/completions$/, "");
      }
      envOverrides.llm.endpoint = endpoint;
    }
    if (process.env.LLM_API_KEY) envOverrides.llm.api_key = process.env.LLM_API_KEY;
    if (process.env.LLM_MODEL) envOverrides.llm.model = process.env.LLM_MODEL;
  }

  config = mergeConfigs(config, envOverrides);

  // Apply CLI overrides (passed to loadConfig)
  if (overrides) {
    const cliOverrides = { ...overrides };
    if (cliOverrides.db_path) {
      cliOverrides.db_path = expandHome(cliOverrides.db_path);
    }
    if (cliOverrides.embedding && cliOverrides.embedding.model_path) {
      cliOverrides.embedding.model_path = expandHome(cliOverrides.embedding.model_path);
    }
    config = mergeConfigs(config, cliOverrides);
  }

  return config;
}
