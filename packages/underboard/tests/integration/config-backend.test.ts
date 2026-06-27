import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import { loadConfig, expandHome, redactConfig, DEFAULT_CONFIG } from "../../src/cli/config.js";
import { createBackend } from "../../src/memory-backend/backend-factory.js";
import { createTestDb, closeTestDb } from "../fixtures/test-db.js";
import { initializeEmbedding, getEmbeddingStatus } from "../../src/embedding/embedding-service.js";

describe("Configuration and Backend Integration", () => {
  const tempConfigDir = path.join(os.tmpdir(), "underboard-test-config");
  const origEnv = { ...process.env };

  beforeEach(() => {
    // Clean environment
    delete process.env.PORT;
    delete process.env.UNDERBOARD_DB_PATH;
    delete process.env.HONCHO_ENDPOINT;
    delete process.env.HONCHO_TOKEN;
    delete process.env.HONCHO_TIMEOUT_MS;
    delete process.env.EMBEDDING_MODEL_NAME;
    delete process.env.EMBEDDING_MODEL_PATH;
    delete process.env.LLM_ENDPOINT;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;

    if (fs.existsSync(tempConfigDir)) {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempConfigDir, { recursive: true });
  });

  afterEach(() => {
    // Restore env
    process.env = { ...origEnv };
    if (fs.existsSync(tempConfigDir)) {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
    }
  });

  describe("expandHome", () => {
    it("expands tilde to homedir", () => {
      const home = os.homedir();
      expect(expandHome("~/data.db")).toBe(path.join(home, "data.db"));
      expect(expandHome("/absolute/path")).toBe("/absolute/path");
    });
  });

  describe("redactConfig", () => {
    it("masks honcho token and llm api key", () => {
      const config = {
        ...DEFAULT_CONFIG,
        honcho: { endpoint: "http://localhost:8000", token: "secret-token", timeout_ms: 100 },
        llm: { endpoint: "http://localhost:9000", api_key: "my-key", model: "gpt" },
      };
      const redacted = redactConfig(config);
      expect(redacted.honcho.token).toBe("***");
      expect(redacted.llm.api_key).toBe("***");
      expect(redacted.honcho.endpoint).toBe("http://localhost:8000");
    });
  });

  describe("loadConfig Precedence", () => {
    it("merges default config and environment options", async () => {
      process.env.PORT = "9999";
      process.env.HONCHO_TOKEN = "env-token";

      const config = await loadConfig({
        db_path: "/override/path.db",
      });

      expect(config.port).toBe(9999);
      expect(config.honcho.token).toBe("env-token");
      expect(config.db_path).toBe("/override/path.db");
    });

    it("prefers overrides over env, and env over defaults", async () => {
      process.env.PORT = "9999";
      const config = await loadConfig({ port: 8888 });
      expect(config.port).toBe(8888);
    });

    it("strips trailing /chat/completions suffix from LLM endpoint", async () => {
      process.env.LLM_ENDPOINT = "http://localhost:11434/v1/chat/completions";
      const config = await loadConfig();
      expect(config.llm.endpoint).toBe("http://localhost:11434/v1");
    });
  });

  describe("createBackend Factory", () => {
    it("returns degraded HonchoBackend or LocalLexicalBackend on request", () => {
      const db = createTestDb();
      const factoryResult = createBackend(db, {
        type: "honcho",
        honcho_endpoint: "http://localhost:9999",
        honcho_timeout_ms: 10,
      });

      expect(factoryResult.type).toBe("honcho");
      expect(factoryResult.backend).toBeDefined();
      closeTestDb(db);
    });
  });

  describe("Embedding Service Configuration", () => {
    it("sets status to disabled when model_path is not provided", async () => {
      await initializeEmbedding({ model_name: "test" });
      expect(getEmbeddingStatus()).toBe("disabled");
    });

    it("sets status to failed when model_path is provided but missing on disk", async () => {
      await initializeEmbedding({ model_name: "test", model_path: "/nonexistent/model.onnx" });
      expect(getEmbeddingStatus()).toBe("failed");
    });
  });
});
