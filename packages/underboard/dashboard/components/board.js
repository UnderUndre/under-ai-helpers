export class Board {
  constructor(container) {
    this.container = container;
    this.tasks = [];
    this.filters = {
      statuses: new Set(["backlog", "in_progress", "blocked", "review", "done"]),
      project: "",
      assignee: "",
      search: "",
    };
    this.onTaskClick = () => {};
    this.onCreateTask = () => {};
  }

  setTasks(tasks) {
    this.tasks = tasks;
    this.render();
  }

  updateTask(updatedTask) {
    const idx = this.tasks.findIndex((t) => t.id === updatedTask.id);
    if (idx >= 0) {
      this.tasks[idx] = updatedTask;
    } else {
      this.tasks.push(updatedTask);
    }
    this.render();
  }

  applyFilters(filters) {
    Object.assign(this.filters, filters);
    this.render();
  }

  getFilteredTasks() {
    return this.tasks.filter((t) => {
      if (!this.filters.statuses.has(t.status)) return false;
      if (this.filters.project && t.project_id !== this.filters.project) return false;
      if (this.filters.assignee && t.assignee !== this.filters.assignee) return false;
      if (this.filters.search && !t.title.toLowerCase().includes(this.filters.search.toLowerCase())) return false;
      return true;
    });
  }

  renderNewTaskButton() {
    const existing = this.container.querySelector(".new-task-btn");
    if (existing) return existing;

    const btn = document.createElement("button");
    btn.className = "new-task-btn";
    btn.textContent = "+ New Task";
    btn.setAttribute("aria-label", "Create new task");
    btn.addEventListener("click", () => this.openNewTaskModal());
    return btn;
  }

  openNewTaskModal() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay open";

    const modal = document.createElement("div");
    modal.className = "modal-content";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Create new task");

    const form = document.createElement("form");
    form.className = "task-form";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = {
        title: form.querySelector("#task-title").value.trim(),
        description: form.querySelector("#task-desc").value.trim(),
        assignee: form.querySelector("#task-assignee").value.trim(),
        status: form.querySelector("#task-status").value,
      };
      if (!data.title) {
        form.querySelector("#task-title").focus();
        return;
      }
      this.onCreateTask(data);
      overlay.remove();
    });

    form.innerHTML = `
      <h3>New Task</h3>
      <label for="task-title">Title <span class="required">*</span></label>
      <input id="task-title" type="text" required placeholder="Task title" />
      <label for="task-desc">Description</label>
      <textarea id="task-desc" rows="3" placeholder="Description (optional)"></textarea>
      <label for="task-assignee">Assignee</label>
      <input id="task-assignee" type="text" placeholder="Assignee (optional)" />
      <label for="task-status">Status</label>
      <select id="task-status">
        <option value="backlog">Backlog</option>
        <option value="in_progress">In Progress</option>
        <option value="blocked">Blocked</option>
        <option value="review">Review</option>
        <option value="done">Done</option>
      </select>
      <div class="form-actions">
        <button type="submit" class="btn-primary">Create</button>
        <button type="button" class="btn-secondary cancel-btn">Cancel</button>
      </div>
    `;

    form.querySelector(".cancel-btn").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    modal.appendChild(form);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    form.querySelector("#task-title").focus();
  }

  render() {
    const filtered = this.getFilteredTasks();
    const columns = ["backlog", "in_progress", "blocked", "review", "done"];

    for (const status of columns) {
      const col = this.container.querySelector(`[data-status="${status}"]`);
      if (!col) continue;
      const cards = col.querySelector(".column-cards");
      const count = col.querySelector(".column-count");
      const colTasks = filtered.filter((t) => t.status === status && !t.archived);

      if (status === "backlog") {
        const header = col.querySelector(".column-header") || col;
        const existingBtn = header.querySelector(".new-task-btn");
        if (!existingBtn) {
          header.appendChild(this.renderNewTaskButton());
        }
      }

      count.textContent = colTasks.length;
      cards.innerHTML = "";

      for (const task of colTasks) {
        const card = document.createElement("div");
        card.className = "task-card" + (task.stalled ? " stalled" : "");
        card.setAttribute("role", "listitem");
        card.setAttribute("tabindex", "0");
        card.dataset.taskId = task.id;

        const title = document.createElement("div");
        title.className = "card-title";
        title.textContent = DOMPurify.sanitize(task.title);

        const meta = document.createElement("div");
        meta.className = "card-meta";

        const assignee = document.createElement("span");
        assignee.className = "card-assignee";
        assignee.textContent = task.assignee || "";

        const time = document.createElement("span");
        time.textContent = this.formatTime(task.updated_at);

        meta.appendChild(assignee);
        if (task.stalled) {
          const badge = document.createElement("span");
          badge.className = "stalled-badge";
          badge.textContent = "STALLED";
          meta.appendChild(badge);
        }
        meta.appendChild(time);

        card.appendChild(title);
        card.appendChild(meta);

        card.addEventListener("click", () => this.onTaskClick(task));
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter") this.onTaskClick(task);
        });

        cards.appendChild(card);
      }
    }

    this.setupKeyboardNav();
  }

  setupKeyboardNav() {
    const cards = this.container.querySelectorAll(".task-card");
    cards.forEach((card, i) => {
      card.addEventListener("keydown", (e) => {
        const next = e.key === "ArrowDown" ? cards[i + 1] : e.key === "ArrowUp" ? cards[i - 1] : null;
        if (next) {
          e.preventDefault();
          next.focus();
        }
      });
    });
  }

  formatTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  }
}
