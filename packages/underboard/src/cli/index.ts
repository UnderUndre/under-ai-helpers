#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json");

const program = new Command();

program
  .name("underboard")
  .description("Local-first MCP task board + shared memory for AI agents")
  .version(pkg.version);

program
  .command("start")
  .description("Start the Underboard service")
  .option("--port <port>", "HTTP port")
  .option("--stdio", "Run MCP server over STDIO")
  .option("--db-path <path>", "Database file path")
  .option("--honcho-endpoint <url>", "Honcho endpoint")
  .option("--honcho-token <token>", "Honcho token")
  .option("--honcho-timeout <ms>", "Honcho timeout in ms")
  .option("--embedding-model-name <name>", "Embedding model name")
  .option("--embedding-model-path <path>", "Embedding model path")
  .option("--llm-endpoint <url>", "LLM endpoint")
  .option("--llm-api-key <key>", "LLM API key")
  .option("--llm-model <model>", "LLM model name")
  .action(async (opts) => {
    const { startServer } = await import("#server/http-server.js");
    const { loadConfig, redactConfig } = await import("./config.js");

    const overrides: any = {};
    if (opts.port !== undefined) {
      const val = Number(opts.port);
      if (!Number.isFinite(val) || val <= 0) {
        console.error(`Invalid port specified: "${opts.port}"`);
        process.exit(1);
      }
      overrides.port = val;
    }
    if (opts.dbPath !== undefined) overrides.db_path = opts.dbPath;

    // honcho
    if (opts.honchoEndpoint !== undefined || opts.honchoToken !== undefined || opts.honchoTimeout !== undefined) {
      overrides.honcho = {};
      if (opts.honchoEndpoint !== undefined) overrides.honcho.endpoint = opts.honchoEndpoint;
      if (opts.honchoToken !== undefined) overrides.honcho.token = opts.honchoToken;
      if (opts.honchoTimeout !== undefined) {
        const val = Number(opts.honchoTimeout);
        if (!Number.isFinite(val) || val < 0) {
          console.error(`Invalid honcho timeout specified: "${opts.honchoTimeout}"`);
          process.exit(1);
        }
        overrides.honcho.timeout_ms = val;
      }
    }

    // embedding
    if (opts.embeddingModelName !== undefined || opts.embeddingModelPath !== undefined) {
      overrides.embedding = {};
      if (opts.embeddingModelName !== undefined) overrides.embedding.model_name = opts.embeddingModelName;
      if (opts.embeddingModelPath !== undefined) overrides.embedding.model_path = opts.embeddingModelPath;
    }

    // llm
    if (opts.llmEndpoint !== undefined || opts.llmApiKey !== undefined || opts.llmModel !== undefined) {
      overrides.llm = {};
      if (opts.llmEndpoint !== undefined) {
        let endpoint = opts.llmEndpoint;
        if (endpoint.endsWith("/chat/completions")) {
          endpoint = endpoint.replace(/\/chat\/completions$/, "");
        }
        overrides.llm.endpoint = endpoint;
      }
      if (opts.llmApiKey !== undefined) overrides.llm.api_key = opts.llmApiKey;
      if (opts.llmModel !== undefined) overrides.llm.model = opts.llmModel;
    }

    const config = await loadConfig(overrides);

    // Echo configuration to stderr (redacted)
    console.error("Starting Underboard with configuration:");
    console.error(JSON.stringify(redactConfig(config), null, 2));

    await startServer(config, { stdio: opts.stdio });
  });

program
  .command("stop")
  .description("Stop the running Underboard service")
  .action(async () => {
    const { stopService } = await import("#cli/stop.js");
    await stopService();
  });

program
  .command("status")
  .description("Check service health")
  .action(async () => {
    const { showStatus } = await import("#cli/status.js");
    await showStatus();
  });

program
  .command("model")
  .description("Manage embedding models")
  .command("fetch")
  .description("Download embedding model for offline use")
  .action(async () => {
    const { fetchModel } = await import("#embedding/model-downloader.js");
    await fetchModel();
  });

program
  .command("memory")
  .description("Memory management")
  .command("wipe")
  .description("Permanently delete all memory entries")
  .requiredOption("--confirm", "Confirm destructive operation")
  .action(async (opts) => {
    if (!opts.confirm) {
      console.error("Use --confirm to confirm memory wipe");
      process.exit(1);
    }
    const { wipeMemory } = await import("#cli/wipe.js");
    await wipeMemory();
  });

program
  .command("export")
  .description("Export all data to JSON archive")
  .argument("[path]", "Output file path", "underboard-export.json")
  .action(async (path) => {
    const { exportData } = await import("#cli/export.js");
    await exportData(path);
  });

program
  .command("import")
  .description("Import data from JSON archive")
  .argument("<path>", "Input file path")
  .action(async (path) => {
    const { importData } = await import("#cli/import.js");
    await importData(path);
  });

program
  .command("tasks")
  .description("Task management")
  .command("delete")
  .description("Permanently delete a task (operator-only)")
  .argument("<id>", "Task ID")
  .action(async (id) => {
    const { deleteTask } = await import("#cli/task-delete.js");
    await deleteTask(id);
  });

program.parse();

