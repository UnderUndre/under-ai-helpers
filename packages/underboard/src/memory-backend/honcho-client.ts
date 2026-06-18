/**
 * HonchoClient — low-level REST client for Honcho v3 (feature 008 T03).
 *
 * Pinned to v3.0.9 (008/FR-011). REST over localhost.
 * Workspace/peer/conclusion CRUD + health probe.
 *
 * Per 008 mapping:
 *   project → workspace (deterministic name)
 *   agent → peer within workspace
 *   note → Conclusion attributed to agent's peer
 */

import { createHash } from "node:crypto";

const DEFAULT_TIMEOUT_MS = 5000;
const HONCHO_BASE_PATH = "/v3";

export interface HonchoConfig {
  endpoint: string;         // e.g., "http://127.0.0.1:7e76f2a0"
  token?: string;           // Bearer token (optional for local dev)
  timeoutMs?: number;
}

export interface HonchoWorkspace {
  id: string;
  name: string;
}

export interface HonchoPeer {
  id: string;
  name: string;
  workspace_id: string;
}

export interface HonchoConclusion {
  id: string;
  content: string;
  peer_id: string;
  workspace_id: string;
  created_at: string;
  metadata?: Record<string, unknown>;
  score?: number;
}

export class HonchoClient {
  private basePath: string;
  private timeoutMs: number;
  private headers: Record<string, string>;

  constructor(config: HonchoConfig) {
    this.basePath = `${config.endpoint}${HONCHO_BASE_PATH}`;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.headers = {
      "Content-Type": "application/json",
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    };
  }

  // ── Health ──────────────────────────────────────────────────────────────

  async health(): Promise<{ status: string; version?: string }> {
    const res = await this.fetchWithTimeout(`${this.basePath.replace("/v3", "")}/health`);
    return res.json();
  }

  // ── Workspaces (project → workspace) ─────────────────────────────────────

  async ensureWorkspace(name: string): Promise<HonchoWorkspace> {
    // Check if workspace exists by name
    const existing = await this.listWorkspaces();
    const found = existing.find((w) => w.name === name);
    if (found) return found;
    // Create new
    const res = await this.fetchWithTimeout(`${this.basePath}/workspaces`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    return res.json();
  }

  async listWorkspaces(): Promise<HonchoWorkspace[]> {
    const res = await this.fetchWithTimeout(`${this.basePath}/workspaces`);
    const data = await res.json();
    return Array.isArray(data) ? data : (data.items ?? []);
  }

  // ── Peers (agent → peer) ─────────────────────────────────────────────────

  async ensurePeer(workspaceId: string, name: string): Promise<HonchoPeer> {
    const existing = await this.listPeers(workspaceId);
    const found = existing.find((p) => p.name === name);
    if (found) return found;
    const res = await this.fetchWithTimeout(
      `${this.basePath}/workspaces/${workspaceId}/peers`,
      { method: "POST", body: JSON.stringify({ name }) },
    );
    return res.json();
  }

  async listPeers(workspaceId: string): Promise<HonchoPeer[]> {
    const res = await this.fetchWithTimeout(
      `${this.basePath}/workspaces/${workspaceId}/peers`,
    );
    const data = await res.json();
    return Array.isArray(data) ? data : (data.items ?? []);
  }

  // ── Conclusions (note → Conclusion) ──────────────────────────────────────

  async createConclusion(
    workspaceId: string,
    peerId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<HonchoConclusion> {
    const res = await this.fetchWithTimeout(
      `${this.basePath}/workspaces/${workspaceId}/conclusions`,
      {
        method: "POST",
        body: JSON.stringify({
          peer_id: peerId,
          content,
          ...(metadata ? { metadata } : {}),
        }),
      },
    );
    return res.json();
  }

  async queryConclusions(
    workspaceId: string,
    query: string,
    limit: number = 10,
  ): Promise<Array<HonchoConclusion & { score?: number }>> {
    const res = await this.fetchWithTimeout(
      `${this.basePath}/workspaces/${workspaceId}/conclusions/query`,
      {
        method: "POST",
        body: JSON.stringify({ query, limit }),
      },
    );
    const data = await res.json();
    return Array.isArray(data) ? data : (data.items ?? data.results ?? []);
  }

  async getConclusion(workspaceId: string, conclusionId: string): Promise<HonchoConclusion | null> {
    try {
      const res = await this.fetchWithTimeout(
        `${this.basePath}/workspaces/${workspaceId}/conclusions/${conclusionId}`,
      );
      return res.json();
    } catch {
      return null;
    }
  }

  async deleteConclusion(workspaceId: string, conclusionId: string): Promise<boolean> {
    try {
      const res = await this.fetchWithTimeout(
        `${this.basePath}/workspaces/${workspaceId}/conclusions/${conclusionId}`,
        { method: "DELETE" },
      );
      return res.status === 204 || res.ok;
    } catch {
      return false;
    }
  }

  // ── Sessions (reserved for 007 dialog ingestion) ─────────────────────────

  async createSession(workspaceId: string, title: string, metadata?: Record<string, unknown>): Promise<{ id: string }> {
    const res = await this.fetchWithTimeout(
      `${this.basePath}/workspaces/${workspaceId}/sessions`,
      {
        method: "POST",
        body: JSON.stringify({ title, ...(metadata ? { metadata } : {}) }),
      },
    );
    return res.json();
  }

  async addSessionMessage(workspaceId: string, sessionId: string, senderId: string, content: string, metadata?: Record<string, unknown>): Promise<{ id: string }> {
    const res = await this.fetchWithTimeout(
      `${this.basePath}/workspaces/${workspaceId}/sessions/${sessionId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ sender_id: senderId, content, ...(metadata ? { metadata } : {}) }),
      },
    );
    return res.json();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Deterministic workspace name from project stable key (008 mapping). */
  static workspaceNameForProject(projectId: string): string {
    return `underboard-${createHash("sha256").update(projectId).digest("hex").slice(0, 12)}`;
  }

  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        headers: { ...this.headers, ...(init?.headers || {}) },
        signal: controller.signal,
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`Honcho ${init?.method || "GET"} ${url}: ${res.status}`);
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
}

