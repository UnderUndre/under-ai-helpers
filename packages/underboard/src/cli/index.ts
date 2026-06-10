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
  .option("--port <port>", "HTTP port", "4280")
  .action(async (opts) => {
    const { startServer } = await import("#server/http-server.js");
    await startServer({ port: Number(opts.port) });
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
