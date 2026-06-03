export class MemoryFeed {
  constructor(container) {
    this.container = container;
    this.entries = [];
  }

  setEntries(entries) {
    this.entries = entries;
    this.render();
  }

  addEntry(entry) {
    this.entries.unshift(entry);
    if (this.entries.length > 50) this.entries.pop();
    this.render();
  }

  render() {
    this.container.innerHTML = "";

    for (const entry of this.entries) {
      const el = document.createElement("div");
      el.className = "memory-entry";

      const content = document.createElement("div");
      content.className = "memory-content";
      content.textContent = DOMPurify.sanitize(entry.content || "");

      const meta = document.createElement("div");
      meta.className = "memory-meta";
      const agent = entry.provenance?.[0]?.agent || "unknown";
      const time = this.formatTime(entry.created_at);
      meta.textContent = `${agent} · ${time}`;

      el.appendChild(content);
      el.appendChild(meta);
      this.container.appendChild(el);
    }

    if (this.entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "memory-entry";
      empty.textContent = "No memory entries yet";
      this.container.appendChild(empty);
    }
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
