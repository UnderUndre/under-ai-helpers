export class ApiClient {
  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
    this.token = new URLSearchParams(window.location.search).get("token") || "";
  }

  async request(method, path, body = null) {
    const headers = { "Content-Type": "application/json" };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(`${this.baseUrl}${path}`, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async getHealth() {
    return this.request("GET", "/health");
  }

  async createTask(task) {
    return this.request("POST", "/api/tasks", task);
  }

  async updateTask(id, updates) {
    return this.request("PATCH", `/api/tasks/${id}`, updates);
  }

  async deleteTask(id) {
    return this.request("DELETE", `/api/tasks/${id}`);
  }

  async listTasks(filters = {}) {
    const params = new URLSearchParams();
    if (filters.project_id) params.set("project_id", filters.project_id);
    if (filters.status) params.set("status", filters.status);
    if (filters.assignee) params.set("assignee", filters.assignee);
    if (filters.search) params.set("search", filters.search);
    if (filters.archived) params.set("archived", "true");
    if (filters.limit) params.set("limit", filters.limit);
    const qs = params.toString();
    return this.request("GET", `/api/tasks${qs ? "?" + qs : ""}`);
  }
}
