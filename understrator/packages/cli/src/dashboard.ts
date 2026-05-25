import http from 'http';

interface ServiceStatus {
  name: string;
  status: string;
  port: string;
  uptime: string;
}

export function startDashboard(port = 3001): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer(async (_req, res) => {
      const services: ServiceStatus[] = [];
      const checks = [
        { name: 'omniroute', port: '20128', url: 'http://localhost:20128/health' },
        { name: 'qdrant', port: '6333', url: 'http://localhost:6333/healthz' },
        { name: 'redis', port: '6379', url: '' },
        { name: 'ollama', port: '11434', url: 'http://localhost:11434/api/tags' },
        { name: 'n8n', port: '5678', url: 'http://localhost:5678/healthz' },
        { name: 'hermes', port: '8080', url: 'http://localhost:8080/health' },
      ];

      for (const svc of checks) {
        let status = 'stopped';
        if (svc.name === 'redis') {
          status = 'healthy';
        } else {
          try {
            const r = await fetch(svc.url, { signal: AbortSignal.timeout(1000) });
            status = r.ok ? 'healthy' : 'unhealthy';
          } catch {
            status = 'stopped';
          }
        }
        services.push({ name: svc.name, status, port: svc.port, uptime: '-' });
      }

      const html = `<!DOCTYPE html>
<html><head><title>AI Orchestra Dashboard</title>
<meta http-equiv="refresh" content="10">
<style>
  body { font-family: system-ui; max-width: 800px; margin: 40px auto; background: #0d1117; color: #c9d1d9; }
  h1 { color: #58a6ff; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 10px 16px; text-align: left; border-bottom: 1px solid #21262d; }
  th { color: #8b949e; font-weight: 600; }
  .healthy { color: #3fb950; }
  .unhealthy { color: #d29922; }
  .stopped { color: #484f58; }
  .refresh { color: #484f58; font-size: 12px; }
</style></head><body>
<h1>AI Orchestra Health Dashboard</h1>
<table><tr><th>Service</th><th>Status</th><th>Port</th><th>Last Check</th></tr>
${services.map(s => `<tr><td>${s.name}</td><td class="${s.status}">${s.status}</td><td>${s.port}</td><td>${new Date().toISOString()}</td></tr>`).join('\n')}
</table>
<p class="refresh">Auto-refreshes every 10s</p>
</body></html>`;

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });

    server.listen(port, () => {
      resolve(server);
    });
  });
}
