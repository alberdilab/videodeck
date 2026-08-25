import { RefreshCw } from 'lucide-react';
import { useVideoDeckStore } from '../state/useVideoDeckStore';

export function LogsView() {
  const { logs, refreshDynamic } = useVideoDeckStore();

  return (
    <section className="view-stack">
      <header className="view-header">
        <div>
          <h1>Logs</h1>
          <p>{logs.length} recent log entries</p>
        </div>
        <button className="primary-action" onClick={() => void refreshDynamic()}>
          <RefreshCw size={18} />
          Refresh
        </button>
      </header>
      <div className="log-list">
        {logs.map((log) => (
          <article className={`log-line ${log.level}`} key={log.id}>
            <time>{new Date(log.timestamp).toLocaleString()}</time>
            <span>{log.level}</span>
            <strong>{log.category}</strong>
            <p>{log.message}</p>
            {log.context && <code>{log.context}</code>}
          </article>
        ))}
        {logs.length === 0 && <div className="empty-table">No logs yet</div>}
      </div>
    </section>
  );
}
