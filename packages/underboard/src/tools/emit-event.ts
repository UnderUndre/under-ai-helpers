import Database from "better-sqlite3";
import { insertEvent } from "#storage/event-store.ts";
import { getEventBus } from "#events/event-bus.ts";

export function emitEvent(db: Database.Database, type: string, payload: Record<string, unknown>): void {
  const bus = getEventBus();
  if (bus) {
    bus.emitAndPersist(type, payload);
  } else {
    insertEvent(db, type, payload);
  }
}
