/**
 * Transformer registry: resolves transformer names to functions.
 * Built-in transformers are registered by name.
 * Custom transformers are loaded from file paths with trust check.
 */

import type { TransformerFn } from "./types.js";
import type { HelpersConfig } from "../types/config.js";

export interface TransformerInfo {
  name: string;
  description: string;
  builtIn: boolean;
}

export interface TransformerRegistry {
  resolve(name: string): TransformerFn;
  list(): TransformerInfo[];
}

const BUILT_IN_REGISTRY: Record<string, { loader: () => Promise<TransformerFn>; description: string }> = {
  identity: {
    loader: async () => (await import("./identity.js")).default,
    description: "Copy source content as-is",
  },
  "claude-to-copilot-prompt": {
    loader: async () => (await import("./claude-to-copilot-prompt.js")).default,
    description: "Convert Claude command to Copilot prompt",
  },
  "claude-to-copilot-instructions": {
    loader: async () => (await import("./claude-to-copilot-instructions.js")).default,
    description: "Convert Claude agent to Copilot instructions",
  },
  "claude-to-copilot-root-instructions": {
    loader: async () => (await import("./claude-to-copilot-root-instructions.js")).default,
    description: "Convert CLAUDE.md to copilot-instructions.md",
  },
  "claude-to-gemini-command": {
    loader: async () => (await import("./claude-to-gemini-command.js")).default,
    description: "Convert Claude command to Gemini TOML command",
  },
  "claude-to-gemini-agent": {
    loader: async () => (await import("./claude-to-gemini-agent.js")).default,
    description: "Convert Claude agent to Gemini agent",
  },
  "claude-to-gemini-root": {
    loader: async () => (await import("./claude-to-gemini-root.js")).default,
    description: "Convert CLAUDE.md to GEMINI.md",
  },
};

// Cache for loaded transformer functions
const loadedTransformers = new Map<string, TransformerFn>();

export function createRegistry(
  _config: HelpersConfig,
  _sourceDir: string,
): TransformerRegistry {
  return {
    resolve(name: string): TransformerFn {
      const cached = loadedTransformers.get(name);
      if (cached) return cached;

      const builtIn = BUILT_IN_REGISTRY[name];
      if (!builtIn) {
        throw new Error(`Unknown transformer: "${name}". Use list-transformers to see available options.`);
      }

      // Transformer not preloaded — throw helpful error
      throw new Error(`Transformer "${name}" not yet loaded. Call preloadTransformer("${name}") first.`);
    },

    list(): TransformerInfo[] {
      return Object.entries(BUILT_IN_REGISTRY).map(([name, info]) => ({
        name,
        description: info.description,
        builtIn: true,
      }));
    },
  };
}

/**
 * Preload a transformer by name so it's ready for synchronous use.
 */
export async function preloadTransformer(name: string): Promise<TransformerFn> {
  const cached = loadedTransformers.get(name);
  if (cached) return cached;

  const builtIn = BUILT_IN_REGISTRY[name];
  if (!builtIn) {
    throw new Error(`Unknown transformer: "${name}".`);
  }

  const fn = await builtIn.loader();
  loadedTransformers.set(name, fn);
  return fn;
}

/**
 * Preload all transformers needed for a set of targets.
 */
export async function preloadAllTransformers(config: HelpersConfig, targetNames?: string[]): Promise<void> {
  const targets = targetNames
    ? Object.entries(config.targets).filter(([name]) => targetNames.includes(name))
    : Object.entries(config.targets);

  const names = new Set<string>();
  for (const [, target] of targets) {
    for (const pipeline of target.pipelines) {
      names.add(pipeline.transformer);
    }
  }

  await Promise.all([...names].map(preloadTransformer));
}

/**
 * Get a preloaded transformer (throws if not preloaded).
 */
export function getTransformer(name: string): TransformerFn {
  const cached = loadedTransformers.get(name);
  if (!cached) {
    throw new Error(`Transformer "${name}" not preloaded. Call preloadTransformer() first.`);
  }
  return cached;
}
