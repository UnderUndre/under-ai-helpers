import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import consola from "consola";
import Database from "better-sqlite3";
import { createMcpServer } from "./mcp-server.ts";
import { getOrCreateToken, validateBearerToken } from "./auth.ts";
import { createEventBus, type SseClient } from "#events/event-bus.ts";
import { getLatestEventId } from "#storage/event-store.ts";
import { listTasks } from "#storage/task-store.ts";
import { listRecentMemory } from "#storage/memory-store.ts";
import { getEmbeddingStatus } from "#embedding/embedding-service.ts";
import { initializeEmbedding } from "#embedding/embedding-service.ts";
import { createDatabase, closeDatabase } from "#storage/database.ts";

let db: Database.Database;
let server: http.Server;
let eventBus: ReturnType<typeof createEventBus>;
let token: string;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = path.resolve(__dirname, "../../dashboard");

function corsHeaders(port: number): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": `http://localhost:${port}`,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Agent-CWD, X-Agent-Name",
  };
}

function validateHost(req: http.IncomingMessage, port: number): boolean {
  const host = req.headers.host;
  if (!host) return false;
  const hostWithoutPort = host.split(":")[0];
  return hostWithoutPort === "localhost" || hostWithoutPort === "127.0.0.1";
}

function validateOrigin(req: http.IncomingMessage, port: number): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`;
}

function authMiddleware(req: http.IncomingMessage): boolean {
  const auth = req.headers.authorization;
  return validateBearerToken(auth, token);
}

export async function startServer(options: { port: number; dbPath?: string }) {
  token = await getOrCreateToken();
  db = createDatabase(options.dbPath);
  eventBus = createEventBus(db);

  const mcpServer = createMcpServer(db, false);

  server = http.createServer(async (req, res) => {
    const port = options.port;

    if (!validateHost(req, port)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid Host header" }));
      return;
    }

    if (!validateOrigin(req, port)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid Origin header" }));
      return;
    }

    const cors = corsHeaders(port);

    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    // Dashboard static files (no auth required for HTML/CSS/JS)
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const indexPath = path.join(DASHBOARD_DIR, "index.html");
      try {
        const content = fs.readFileSync(indexPath);
        res.writeHead(200, { "Content-Type": "text/html", ...cors });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end("Dashboard not found");
      }
      return;
    }

    if (url.pathname === "/styles.css") {
      try {
        const content = fs.readFileSync(path.join(DASHBOARD_DIR, "styles.css"));
        res.writeHead(200, { "Content-Type": "text/css", ...cors });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end();
      }
      return;
    }

    if (url.pathname.startsWith("/lib/") || url.pathname.startsWith("/components/")) {
      const filePath = path.join(DASHBOARD_DIR, url.pathname);
      try {
        const content = fs.readFileSync(filePath);
        const ext = path.extname(filePath);
        const ct = ext === ".js" ? "application/javascript" : "text/plain";
        res.writeHead(200, { "Content-Type": ct, ...cors });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end();
      }
      return;
    }

    // Auth required for all other endpoints
    // Allow token as query param for dashboard SSE
    const queryToken = url.searchParams.get("token");
    if (!authMiddleware(req) && queryToken !== token) {
      res.writeHead(401, { "Content-Type": "application/json", ...cors });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    // Health endpoint
    if (url.pathname === "/health" && req.method === "GET") {
      const stats = db.prepare("SELECT COUNT(*) as cnt FROM tasks").get() as { cnt: number };
      const memStats = db.prepare("SELECT COUNT(*) as cnt FROM memory_entries").get() as { cnt: number };
      const stat = fs.statSync(db.name);
      res.writeHead(200, { "Content-Type": "application/json", ...cors });
      res.end(JSON.stringify({
        uptime: process.uptime(),
        total_tasks: stats.cnt,
        total_memory_entries: memStats.cnt,
        embedding_model_status: getEmbeddingStatus(),
        db_path: db.name,
        db_size_bytes: stat.size,
        clients: eventBus.getClients().map((c: SseClient) => ({ id: c.id, lastEventId: c.lastEventId })),
      }));
      return;
    }

    // SSE events stream for dashboard
    if (url.pathname === "/events" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...cors,
      });

      const lastEventId = Number(req.headers["last-event-id"] ?? 0);
      const clientId = `dashboard-${Date.now()}`;
      const client: SseClient = { id: clientId, res, lastEventId, queueSize: 0 };
      eventBus.addClient(client);

      req.on("close", () => {
        eventBus.removeClient(clientId);
      });
      return;
    }

    // MCP SSE endpoint
    if (url.pathname === "/mcp/sse" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...cors,
      });

      const transport = new (await import("@modelcontextprotocol/sdk/server/sse.js")).SSEServerTransport("/mcp/messages", res);
      await mcpServer.connect(transport);
      return;
    }

    // MCP messages endpoint
    if (url.pathname === "/mcp/messages" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json", ...cors });
        res.end("{}");
      });
      return;
    }

    // REST API: Operator task create
    if (url.pathname === "/api/tasks" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const data = JSON.parse(body);
          const { taskCreate } = await import("#tools/tasks/create.ts");
          const cwd = req.headers["x-agent-cwd"] as string ?? process.cwd();
          const { detectProject } = await import("#project/detector.ts");
          const { upsertProject } = await import("#storage/project-store.ts");
          const project = detectProject(cwd);
          upsertProject(db, project);
          const result = taskCreate(db, data, { project_id: project.id });
          res.writeHead(201, { "Content-Type": "application/json", ...cors });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.writeHead(400, { "Content-Type": "application/json", ...cors });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // REST API: Operator task update
    if (url.pathname.match(/^\/api\/tasks\/[^/]+$/) && req.method === "PATCH") {
      const id = url.pathname.split("/").pop()!;
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const data = JSON.parse(body);
          data.id = id;
          const { taskUpdate } = await import("#tools/tasks/update.ts");
          const result = taskUpdate(db, data);
          res.writeHead(200, { "Content-Type": "application/json", ...cors });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          const status = err.message.includes("NOT_FOUND") ? 404 : err.message.includes("CONCURRENCY") ? 409 : 400;
          res.writeHead(status, { "Content-Type": "application/json", ...cors });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // REST API: Operator task delete
    if (url.pathname.match(/^\/api\/tasks\/[^/]+$/) && req.method === "DELETE") {
      const id = url.pathname.split("/").pop()!;
      const { deleteTask } = await import("#storage/task-store.ts");
      const deleted = deleteTask(db, id);
      res.writeHead(deleted ? 200 : 404, { "Content-Type": "application/json", ...cors });
      res.end(JSON.stringify({ deleted, id }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json", ...cors });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(options.port, "127.0.0.1", () => {
    consola.success(`Underboard listening on http://127.0.0.1:${options.port}`);
    consola.info(`Dashboard: http://127.0.0.1:${options.port}/?token=${token}`);
  });

  initializeEmbedding().catch(() => {});
}

export function stopServer() {
  if (server) {
    server.close();
    closeDatabase(db);
    consola.info("Underboard stopped");
  }
}
