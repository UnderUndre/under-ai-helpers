import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import Database from "better-sqlite3";
import { insertEvent, getEventsAfter, type EventRow } from "#storage/event-store.js";

export interface SseClient {
  id: string;
  res: ServerResponse;
  lastEventId: number;
  queueSize: number;
}

const MAX_CLIENT_BUFFER = 1024 * 1024; // 1MB

class EventBus extends EventEmitter {
  private clients: Map<string, SseClient> = new Map();

  constructor(private db: Database.Database) {
    super();
  }

  emitAndPersist(type: string, payload: Record<string, unknown>): void {
    const event = insertEvent(this.db, type, payload);
    this.emit("event", event);
    this.broadcastToClients(event);
  }

  addClient(client: SseClient): void {
    this.clients.set(client.id, client);
    this.replayMissed(client);
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  getClients(): SseClient[] {
    return Array.from(this.clients.values());
  }

  private broadcastToClients(event: EventRow): void {
    const data = `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;

    for (const [id, client] of this.clients) {
      try {
        client.queueSize += Buffer.byteLength(data);
        if (client.queueSize > MAX_CLIENT_BUFFER) {
          client.res.write(`id: ${event.id}\nevent: snapshot_required\ndata: {"reason":"buffer_overflow"}\n\n`);
          client.res.end();
          this.clients.delete(id);
          continue;
        }
        client.res.write(data);
        client.lastEventId = event.id;
      } catch {
        this.clients.delete(id);
      }
    }
  }

  private replayMissed(client: SseClient): void {
    if (client.lastEventId === 0) return;

    const missed = getEventsAfter(this.db, client.lastEventId, 1000);
    if (missed.length >= 1000) {
      client.res.write(`event: snapshot_required\ndata: {"reason":"gap_too_large","last_event_id":${client.lastEventId}}\n\n`);
      return;
    }

    for (const event of missed) {
      const data = `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
      client.res.write(data);
      client.lastEventId = event.id;
    }
  }
}

let busInstance: EventBus | null = null;

export function createEventBus(db: Database.Database): EventBus {
  busInstance = new EventBus(db);
  return busInstance;
}

export function getEventBus(): EventBus | null {
  return busInstance;
}

