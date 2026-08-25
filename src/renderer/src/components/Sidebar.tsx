import {
  CalendarClock,
  Camera,
  Files,
  Grid3X3,
  ListTree,
  Settings,
  TerminalSquare
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { type AppView, useVideoDeckStore } from '../state/useVideoDeckStore';

const navItems: Array<{ view: AppView; label: string; Icon: LucideIcon }> = [
  { view: 'live', label: 'Live View', Icon: Grid3X3 },
  { view: 'cameras', label: 'Cameras', Icon: Camera },
  { view: 'recordings', label: 'Recordings', Icon: Files },
  { view: 'schedules', label: 'Schedules', Icon: CalendarClock },
  { view: 'settings', label: 'Settings', Icon: Settings },
  { view: 'logs', label: 'Logs', Icon: TerminalSquare }
];

export function Sidebar() {
  const { activeView, setActiveView } = useVideoDeckStore();

  return (
    <aside className="sidebar">
      <div className="brand">
        <ListTree size={24} />
        <div>
          <strong>VideoDeck</strong>
          <span>RTSP Recorder</span>
        </div>
      </div>
      <nav>
        {navItems.map(({ view, label, Icon }) => (
          <button
            key={view}
            className={activeView === view ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveView(view)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
