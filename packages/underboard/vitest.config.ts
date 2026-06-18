import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "#storage": path.resolve(__dirname, "./src/storage"),
      "#tools": path.resolve(__dirname, "./src/tools"),
      "#embedding": path.resolve(__dirname, "./src/embedding"),
      "#retrieval": path.resolve(__dirname, "./src/retrieval"),
      "#project": path.resolve(__dirname, "./src/project"),
      "#events": path.resolve(__dirname, "./src/events"),
      "#server": path.resolve(__dirname, "./src/server"),
      "#cli": path.resolve(__dirname, "./src/cli"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/types/**/*.ts"],
    },
    testTimeout: 30_000,
  },
});
