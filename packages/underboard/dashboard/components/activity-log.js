export class ActivityLog {
  constructor(container, panel) {
    this.container = container;
    this.panel = panel;
    this.entries = [];
    this.currentTaskId = null;
  }

  showForTask(taskId, apiClient) {
    this.currentTaskId = taskId;
    this.panel.classList.add("open");
    this.loadEntries(apiClient);
  }

  hide() {
    this.panel.classList.remove("open");
    this.currentTaskId = null;
  }

  async loadEntries(apiClient) {
    if (!this.currentTaskId) return;
    try {
      const data = await apiClient.request("GET", `/api/activity/${this.currentTaskId}`);
      this.entries = data.entries || [];
      this.render();
    } catch {
      this.entries = [];
      this.render();
    }
  }

  addEntry(entry) {
    if (entry.task_id === this.currentTaskId) {
      this.entries.unshift(entry);
      this.render();
    }
  }

  render() {
    this.container.innerHTML = "";

    if (this.entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "activity-entry";
      empty.textContent = "No activity logged for this task";
      this.container.appendChild(empty);
      return;
    }

    for (const entry of this.entries) {
      const el = document.createElement("div");
      el.className = "activity-entry";

      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.marginBottom = "2px";

      const agent = document.createElement("strong");
      agent.textContent = DOMPurify.sanitize(entry.agent_name);

      const time = document.createElement("span");
      time.style.color = "var(--text-secondary)";
      time.textContent = new Date(entry.timestamp).toLocaleTimeString();

      header.appendChild(agent);
      header.appendChild(time);

      const action = document.createElement("div");
      action.textContent = `${entry.action_type}: ${DOMPurify.sanitize(entry.detail || "")}`;

      el.appendChild(header);
      el.appendChild(action);
      this.container.appendChild(el);
    }
  }
}
