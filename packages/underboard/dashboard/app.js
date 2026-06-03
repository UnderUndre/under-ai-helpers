import { SseClient } from "./lib/sse-client.js";
import { ApiClient } from "./lib/api.js";
import { Board } from "./components/board.js";
import { MemoryFeed } from "./components/memory-feed.js";

const api = new ApiClient();
const board = new Board(document.getElementById("kanban-board"));
const memoryFeed = new MemoryFeed(document.getElementById("memory-feed"));

let selectedTask = null;

board.onTaskClick = (task) => {
  selectedTask = task;
  openTaskModal(task);
};

async function init() {
  try {
    const health = await api.getHealth();
    updateHealthIndicator(health);
  } catch {
    document.getElementById("health-indicator").classList.add("error");
  }

  const sse = new SseClient("/events", {
    onEvent: handleSseEvent,
    onSnapshot: handleSnapshot,
    onError: (err) => console.error("SSE error:", err),
  });
  sse.connect();

  setInterval(() => {
    board.render();
    memoryFeed.render();
  }, 60000);

  setupFilters();
}

function handleSseEvent(event) {
  switch (event.type) {
    case "task_created":
    case "task_updated":
    case "task_archived":
      board.updateTask(event.payload);
      break;
    case "memory_added":
      memoryFeed.addEntry({
        content: event.payload.content_snippet,
        provenance: [{ agent: "agent", ts: new Date().toISOString() }],
        created_at: new Date().toISOString(),
      });
      break;
  }
}

function handleSnapshot(data) {
  if (data.tasks) board.setTasks(data.tasks);
  if (data.memory_recent) memoryFeed.setEntries(data.memory_recent);
}

function updateHealthIndicator(health) {
  const indicator = document.getElementById("health-indicator");
  const uptime = document.getElementById("uptime-info");
  const modelStatus = document.getElementById("model-status");

  if (health.uptime != null) {
    const h = Math.floor(health.uptime / 3600);
    const m = Math.floor((health.uptime % 3600) / 60);
    uptime.textContent = `Uptime: ${h}h ${m}m`;
  }
  modelStatus.textContent = `Model: ${health.embedding_model_status || "unknown"}`;
}

function setupFilters() {
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      const statuses = new Set();
      document.querySelectorAll(".toggle-btn.active").forEach((b) => statuses.add(b.dataset.status));
      board.applyFilters({ statuses });
    });
  });

  document.getElementById("filter-assignee").addEventListener("input", (e) => {
    board.applyFilters({ assignee: e.target.value });
  });

  document.getElementById("filter-search").addEventListener("input", (e) => {
    board.applyFilters({ search: e.target.value });
  });
}

function openTaskModal(task) {
  const modal = document.getElementById("task-modal");
  const title = document.getElementById("modal-task-title");
  const body = document.getElementById("modal-body");

  title.textContent = DOMPurify.sanitize(task.title);
  body.innerHTML = `
    <div class="modal-field"><strong>Status:</strong> ${DOMPurify.sanitize(task.status)}</div>
    <div class="modal-field"><strong>Assignee:</strong> ${DOMPurify.sanitize(task.assignee || "Unassigned")}</div>
    ${task.description ? `<div class="modal-field"><strong>Description:</strong> ${DOMPurify.sanitize(task.description)}</div>` : ""}
    ${task.notes ? `<div class="modal-field"><strong>Notes:</strong> ${DOMPurify.sanitize(task.notes)}</div>` : ""}
    <div class="modal-field"><strong>Created:</strong> ${new Date(task.created_at).toLocaleString()}</div>
    <div class="modal-field"><strong>Updated:</strong> ${new Date(task.updated_at).toLocaleString()}</div>
    <div class="modal-actions">
      <button class="btn-archive" data-id="${task.id}">Archive</button>
      <button class="btn-delete" data-id="${task.id}">Delete</button>
    </div>
  `;

  modal.classList.add("open");

  modal.querySelector(".btn-archive")?.addEventListener("click", async () => {
    await api.updateTask(task.id, { archived: true });
    modal.classList.remove("open");
  });

  modal.querySelector(".btn-delete")?.addEventListener("click", async () => {
    if (confirm("Delete this task permanently?")) {
      await api.deleteTask(task.id);
      modal.classList.remove("open");
    }
  });
}

document.getElementById("close-modal").addEventListener("click", () => {
  document.getElementById("task-modal").classList.remove("open");
});

document.getElementById("close-activity").addEventListener("click", () => {
  document.getElementById("activity-panel").classList.remove("open");
});

init().catch(console.error);
