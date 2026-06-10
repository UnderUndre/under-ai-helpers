import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import consola from "consola";

export type EmbeddingStatus = "loading" | "ready" | "failed";

let status: EmbeddingStatus = "loading";
let session: any = null;

const MODEL_DIR = path.join(os.homedir(), ".underboard", "models");
const MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2.onnx";
const MODEL_PATH = path.join(MODEL_DIR, MODEL_NAME);

export function getEmbeddingStatus(): EmbeddingStatus {
  return status;
}

export async function initializeEmbedding(): Promise<void> {
  try {
    const modelExists = await fs.access(MODEL_PATH).then(() => true).catch(() => false);
    if (!modelExists) {
      consola.warn(`Embedding model not found at ${MODEL_PATH}. Run 'underboard model fetch' to download.`);
      status = "failed";
      return;
    }

    const ort = await import("onnxruntime-node");
    session = await ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ["cpu"],
      graphOptimizationLevel: "all",
    });
    status = "ready";
    consola.success("Embedding model loaded");
  } catch (err) {
    consola.error("Failed to load embedding model:", err);
    status = "failed";
  }
}

export async function embed(text: string): Promise<Float32Array | null> {
  if (status !== "ready" || !session) return null;

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
        result[i] = result[i]! / norm;
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
