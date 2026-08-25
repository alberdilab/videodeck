import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { CamerasView } from './components/CamerasView';
import { LiveView } from './components/LiveView';
import { LogsView } from './components/LogsView';
import { RecordingsView } from './components/RecordingsView';
import { SchedulesView } from './components/SchedulesView';
import { SettingsView } from './components/SettingsView';
import { useVideoDeckStore } from './state/useVideoDeckStore';

export function App() {
  const { activeView, error, loading, refreshAll, refreshDynamic } = useVideoDeckStore();

  useEffect(() => {
    void refreshAll();
    const interval = window.setInterval(() => {
      void refreshDynamic();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [refreshAll, refreshDynamic]);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        {error && <div className="alert">{error}</div>}
        {loading && <div className="loading-bar" />}
        {activeView === 'live' && <LiveView />}
        {activeView === 'cameras' && <CamerasView />}
        {activeView === 'recordings' && <RecordingsView />}
        {activeView === 'schedules' && <SchedulesView />}
        {activeView === 'settings' && <SettingsView />}
        {activeView === 'logs' && <LogsView />}
      </main>
    </div>
  );
}
