export class SseClient {
  constructor(url, options = {}) {
    this.url = url;
    this.onEvent = options.onEvent || (() => {});
    this.onSnapshot = options.onSnapshot || (() => {});
    this.onError = options.onError || (() => {});
    this.lastEventId = 0;
    this.es = null;
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 30000;
    this.destroyed = false;
  }

  connect() {
    if (this.destroyed) return;
    const url = new URL(this.url, window.location.origin);
    if (this.lastEventId > 0) {
      url.searchParams.set("lastEventId", this.lastEventId);
    }
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) {
      url.searchParams.set("token", token);
    }

    this.es = new EventSource(url.toString());

    this.es.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.es.addEventListener("snapshot", (e) => {
      try {
        const data = JSON.parse(e.data);
        this.lastEventId = data.last_event_id || this.lastEventId;
        this.onSnapshot(data);
      } catch (err) {
        this.onError(err);
      }
    });

    this.es.addEventListener("snapshot_required", (e) => {
      this.onSnapshot({ reason: "reconnect_required" });
    });

    this.es.onmessage = (e) => {
      if (e.lastEventId) {
        this.lastEventId = parseInt(e.lastEventId, 10);
      }
      try {
        const payload = JSON.parse(e.data);
        this.onEvent({ type: e.type || "unknown", payload, id: this.lastEventId });
      } catch (err) {
        this.onError(err);
      }
    };

    this.es.onerror = () => {
      this.es.close();
      if (!this.destroyed) {
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
        this.reconnectAttempts++;
        setTimeout(() => this.connect(), delay);
      }
    };
  }

  destroy() {
    this.destroyed = true;
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }
}
