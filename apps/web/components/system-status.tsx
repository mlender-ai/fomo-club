import type { LogView, SystemStatusView } from "@fomo/shared";

import { formatDate } from "../lib/format";

interface SystemStatusProps {
  system: SystemStatusView;
  logs: LogView[];
}

export function SystemStatus({ system, logs }: SystemStatusProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Runtime health</p>
          <h2>System state</h2>
        </div>
      </div>
      <div className="status-grid">
        <div className="status-tile">
          <span className={`pill ${system.workerHealthy ? "positive" : "negative"}`}>{system.botStatus}</span>
          <p>Worker {system.workerHealthy ? "healthy" : "stale"}</p>
        </div>
        <div className="status-tile">
          <strong>{formatDate(system.lastHeartbeatAt)}</strong>
          <p>Last heartbeat</p>
        </div>
        <div className="status-tile">
          <strong>{formatDate(system.lastErrorAt)}</strong>
          <p>Last error</p>
        </div>
      </div>
      <div className="stack compact">
        {logs.slice(0, 5).map((log) => (
          <article className="log-row" key={log.id}>
            <span className={`pill ${log.level === "ERROR" ? "negative" : log.level === "WARN" ? "warning" : "muted"}`}>
              {log.level}
            </span>
            <div>
              <strong>{log.source}</strong>
              <p>{log.message}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

