import { Folder, Save } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import type { AppSettings } from '../../../shared/types.js';
import { useVideoDeckStore } from '../state/useVideoDeckStore';

export function SettingsView() {
  const { settings, updateSettings, selectRecordingsDirectory } = useVideoDeckStore();
  const [value, setValue] = useState<AppSettings | null>(settings);

  useEffect(() => {
    setValue(settings);
  }, [settings]);

  if (!value) {
    return null;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void updateSettings(value);
  };

  return (
    <section className="view-stack">
      <header className="view-header">
        <div>
          <h1>Settings</h1>
          <p>Storage and recording defaults</p>
        </div>
      </header>
      <form className="settings-form" onSubmit={submit}>
        <label className="wide">
          <span>Recordings folder</span>
          <div className="inline-field">
            <input
              value={value.recordingsDirectory}
              onChange={(event) => setValue({ ...value, recordingsDirectory: event.target.value })}
            />
            <button type="button" onClick={() => void selectRecordingsDirectory()}>
              <Folder size={16} />
            </button>
          </div>
        </label>
        <label>
          <span>Default clip duration</span>
          <input
            type="number"
            min={1}
            value={value.defaultClipDurationSeconds}
            onChange={(event) =>
              setValue({ ...value, defaultClipDurationSeconds: Number(event.target.value) })
            }
          />
        </label>
        <label>
          <span>Retention days</span>
          <input
            type="number"
            min={1}
            value={value.retentionDays ?? ''}
            placeholder="Not enforced"
            onChange={(event) =>
              setValue({
                ...value,
                retentionDays: event.target.value ? Number(event.target.value) : null
              })
            }
          />
        </label>
        <label className="wide">
          <span>Filename template</span>
          <input
            value={value.filenameTemplate}
            onChange={(event) => setValue({ ...value, filenameTemplate: event.target.value })}
          />
        </label>
        <label className="toggle-line">
          <input
            type="checkbox"
            checked={value.preferMkv}
            onChange={(event) => setValue({ ...value, preferMkv: event.target.checked })}
          />
          <span>Prefer MKV</span>
        </label>
        <footer>
          <button className="primary-action" type="submit">
            <Save size={18} />
            Save settings
          </button>
        </footer>
      </form>
    </section>
  );
}
