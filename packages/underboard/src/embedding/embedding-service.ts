import { promises as fs } from "node:fs";
import consola from "consola";

export type EmbeddingStatus = "loading" | "active" | "disabled" | "failed";

let status: EmbeddingStatus = "loading";
let session: any = null;

export function getEmbeddingStatus(): EmbeddingStatus {
  return status;
}

export async function initializeEmbedding(config: { model_path?: string; model_name: string }): Promise<void> {
  if (!config.model_path) {
    consola.warn("Embedding model path not configured. Semantic features disabled.");
    status = "disabled";
    return;
  }

  try {
    const modelExists = await fs.access(config.model_path).then(() => true).catch(() => false);
    if (!modelExists) {
      consola.error(`Embedding model not found at ${config.model_path}. Semantic features disabled.`);
      status = "failed";
      return;
    }

    const ort = await import("onnxruntime-node");
    session = await ort.InferenceSession.create(config.model_path, {
      executionProviders: ["cpu"],
      graphOptimizationLevel: "all",
    });
    status = "active";
    consola.success(`Embedding model "${config.model_name}" loaded`);
  } catch (err) {
    consola.error(`Failed to load embedding model from ${config.model_path}:`, err);
    status = "failed";
  }
}

export async function embed(text: string): Promise<Float32Array | null> {
  if (status !== "active" || !session) return null;

  try {
    const ort = await import("onnxruntime-node");
    const tokenizer = tokenize(text);
    const inputIds = new ort.Tensor("int64", BigInt64Array.from(tokenizer.ids.map(BigInt)), [1, tokenizer.ids.length]);
    const attentionMask = new ort.Tensor("int64", BigInt64Array.from(tokenizer.attentionMask.map(BigInt)), [1, tokenizer.attentionMask.length]);
    const tokenTypeIds = new ort.Tensor("int64", BigInt64Array.from(new Array(tokenizer.ids.length).fill(0n)), [1, tokenizer.ids.length]);

    const output = await session.run({
      input_ids: inputIds,
      attention_mask: attentionMask,
      token_type_ids: tokenTypeIds,
    });

    const lastHiddenState = output["last_hidden_state"];
    if (!lastHiddenState) return null;

    const data = lastHiddenState.data as Float32Array;
    const seqLen = tokenizer.ids.length;
    const hiddenSize = data.length / seqLen;
    const result = new Float32Array(hiddenSize);

    for (let i = 0; i < hiddenSize; i++) {
      let sum = 0;
      for (let j = 0; j < seqLen; j++) {
        sum += data[j * hiddenSize + i]!;
      }
      result[i] = sum / seqLen;
    }

    let norm = 0;
    for (let i = 0; i < result.length; i++) {
      norm += result[i]! * result[i]!;
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < result.length; i++) {
        result[i]! /= norm;
      }
    }

    return result;
  } catch (err) {
    consola.error("Embedding computation failed:", err);
    return null;
  }
}

function tokenize(text: string): { ids: number[]; attentionMask: number[] } {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const ids = words.map((w) => {
    let hash = 0;
    for (let i = 0; i < w.length; i++) {
      hash = ((hash << 5) - hash + w.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 30000;
  });
  if (ids.length === 0) ids.push(0);
  if (ids.length > 512) ids.length = 512;
  const attentionMask = ids.map(() => 1);
  return { ids, attentionMask };
}
