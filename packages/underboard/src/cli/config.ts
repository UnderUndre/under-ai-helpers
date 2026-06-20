import { loadConfig as c12Load } from "c12";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

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
}

const DEFAULT_CONFIG: UnderboardConfig = {
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
};

export async function loadConfig(overrides?: Partial<UnderboardConfig>): Promise<UnderboardConfig> {
  const configDir = path.join(os.homedir(), ".underboard");
  const configPath = path.join(configDir, "config.json");

  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }

  const { config } = await c12Load<UnderboardConfig>({
    configFile: configPath,
    defaults: DEFAULT_CONFIG,
    overrides: overrides as any,
    dotenv: true,
  });

  return config;
}

