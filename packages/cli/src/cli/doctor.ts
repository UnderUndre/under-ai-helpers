import { defineCommand } from "citty";
import { registerCheck, runAllChecks, clearChecks } from "./doctor/runner.js";
import { checkNodeVersion, checkNpmVersion, checkGitVersion, checkOSInfo } from "./doctor/checks/system.js";
import { checkGhCli, checkHermesBinary } from "./doctor/checks/tools.js";
import { checkMcpServers } from "./doctor/checks/mcp.js";
import { checkApiKeys } from "./doctor/checks/keys.js";
import { checkStructure } from "./doctor/checks/structure.js";
import { checkDrift } from "./doctor/checks/drift.js";
import { renderTable, renderJson, renderQuiet } from "./doctor/formatters.js";

export default defineCommand({
  meta: {
    name: "doctor",
    description: "Comprehensive health check: system, tools, MCP, API keys, structure, drift",
  },
  args: {
    json: {
      type: "boolean",
      default: false,
      description: "Machine-readable JSON output",
    },
    quiet: {
      type: "boolean",
      default: false,
      description: "Failures only",
    },
  },
  async run({ args }) {
    clearChecks();

    registerCheck(checkNodeVersion);
    registerCheck(checkNpmVersion);
    registerCheck(checkGitVersion);
    registerCheck(checkOSInfo);
    registerCheck(checkGhCli);
    registerCheck(checkHermesBinary);
    registerCheck(checkMcpServers);
    registerCheck(checkApiKeys);
    registerCheck(checkStructure);
    registerCheck(checkDrift);

    const result = await runAllChecks();

    if (args.json) {
      renderJson(result);
    } else if (args.quiet) {
      renderQuiet(result);
    } else {
      renderTable(result);
    }

    process.exitCode = result.exitCode;
  },
});
