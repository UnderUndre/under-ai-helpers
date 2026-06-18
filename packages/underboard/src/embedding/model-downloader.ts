import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createWriteStream } from "node:fs";
import consola from "consola";

const MODEL_DIR = path.join(os.homedir(), ".underboard", "models");
const MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2.onnx";
const MODEL_PATH = path.join(MODEL_DIR, MODEL_NAME);
const MODEL_URL = "https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2/resolve/main/model.onnx";

export async function fetchModel(onProgress?: (percent: number) => void): Promise<void> {
  await fs.mkdir(MODEL_DIR, { recursive: true });

  const exists = await fs.access(MODEL_PATH).then(() => true).catch(() => false);
  if (exists) {
    consola.info("Model already exists at", MODEL_PATH);
    return;
  }

  consola.start("Downloading embedding model...");

  const response = await fetch(MODEL_URL);
  if (!response.ok) {
    throw new Error(`Failed to download model: ${response.status} ${response.statusText}`);
  }

  const totalBytes = Number(response.headers.get("content-length") ?? 0);
  let downloadedBytes = 0;

  const tmpPath = MODEL_PATH + ".tmp";
  const fileStream = createWriteStream(tmpPath);

  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(value);
    downloadedBytes += value.length;
    if (totalBytes > 0 && onProgress) {
      onProgress(Math.round((downloadedBytes / totalBytes) * 100));
    }
    if (totalBytes > 0 && downloadedBytes % (1024 * 1024) < value.length) {
      consola.info(`Downloaded ${Math.round(downloadedBytes / (1024 * 1024))}MB / ${Math.round(totalBytes / (1024 * 1024))}MB`);
    }
  }

  fileStream.end();
  await new Promise<void>((resolve) => fileStream.on("finish", resolve));

  await fs.rename(tmpPath, MODEL_PATH);
  consola.success("Model downloaded to", MODEL_PATH);
}

export function getModelPath(): string {
  return MODEL_PATH;
}

export function getModelDir(): string {
  return MODEL_DIR;
}

