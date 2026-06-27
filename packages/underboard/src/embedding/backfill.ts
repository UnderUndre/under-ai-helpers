import Database from "better-sqlite3";
import { embed, getEmbeddingStatus } from "./embedding-service.js";
import { getPendingEmbeddings, updateEmbedding } from "#storage/memory-store.js";
import consola from "consola";

export async function runBackfill(db: Database.Database, intervalMs: number = 5000): Promise<() => void> {
  let running = true;

  const tick = async () => {
    if (!running) return;
    if (getEmbeddingStatus() !== "active") {
      setTimeout(tick, intervalMs);
      return;
    }

    try {
      const pending = getPendingEmbeddings(db, 10);

      for (const entry of pending) {
        if (!running) break;

        const embedding = await embed(entry.content);
        if (embedding) {
          const buf = Buffer.from(new Uint8Array(embedding.buffer));
          updateEmbedding(db, entry.id, buf);
        }
      }
    } catch (err) {
      consola.error("Backfill error:", err);
    }

    if (running) {
      setTimeout(tick, intervalMs);
    }
  };

  tick();
  consola.info("Embedding backfill worker started");

  return () => {
    running = false;
    consola.info("Embedding backfill worker stopped");
  };
}

