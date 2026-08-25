import { CalendarPlus, Pencil, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import type {
  MediaType,
  RecordingSchedule,
  RecordingScheduleInput,
  RecordingRecurrence
} from '../../../shared/types.js';
import { SNAPSHOT_MIN_INTERVAL_SECONDS } from '../../../shared/types.js';
import { useVideoDeckStore } from '../state/useVideoDeckStore';

const recurrenceOptions: RecordingRecurrence[] = ['none', 'daily', 'weekly', 'weekdays'];
const DEFAULT_SNAPSHOT_INTERVAL_SECONDS = 60;

export function SchedulesView() {
  const { cameras, schedules, createSchedule, updateSchedule, deleteSchedule } = useVideoDeckStore();
  const [editing, setEditing] = useState<RecordingSchedule | null>(null);
  const [creating, setCreating] = useState(false);
  const defaultInput: RecordingScheduleInput = {
    cameraId: cameras[0]?.id ?? '',
    name: '',
    mediaType: 'video',
    snapshotIntervalSeconds: null,
    startTime: toDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000)),
    endTime: toDateTimeLocal(new Date(Date.now() + 90 * 60 * 1000)),
    recurrence: 'none',
    enabled: true
  };

  return (
    <section className="view-stack">
      <header className="view-header">
        <div>
          <h1>Schedules</h1>
          <p>{schedules.length} recording schedules</p>
        </div>
        <button className="primary-action" onClick={() => setCreating(true)} disabled={!cameras.length}>
          <CalendarPlus size={18} />
          Add schedule
        </button>
      </header>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Camera</th>
              <th>Captures</th>
              <th>Start</th>
              <th>End</th>
              <th>Repeat</th>
              <th>Enabled</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((schedule) => (
              <tr key={schedule.id}>
                <td>{schedule.name}</td>
                <td>{cameras.find((camera) => camera.id === schedule.cameraId)?.name ?? schedule.cameraId}</td>
                <td>
                  <span className={`media-pill ${schedule.mediaType}`}>
                    {schedule.mediaType === 'image' ? 'Photo' : 'Video'}
                  </span>
                  {schedule.mediaType === 'image' && (
                    <span className="table-hint">{describeSnapshotCadence(schedule)}</span>
                  )}
                </td>
                <td>{formatScheduleDate(schedule.startTime)}</td>
                <td>{formatScheduleDate(schedule.endTime)}</td>
                <td>{schedule.recurrence}</td>
                <td>{schedule.enabled ? 'Yes' : 'No'}</td>
                <td>
                  <div className="row-actions">
                    <button onClick={() => setEditing(schedule)} title="Edit schedule">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => void deleteSchedule(schedule.id)} title="Delete schedule">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {schedules.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-table">
                  No schedules configured
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <ScheduleModal
          title="Add Schedule"
          cameras={cameras}
          initialValue={defaultInput}
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            await createSchedule(input);
            setCreating(false);
          }}
        />
      )}
      {editing && (
        <ScheduleModal
          title="Edit Schedule"
          cameras={cameras}
          initialValue={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            await updateSchedule(editing.id, input);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function ScheduleModal({
  title,
  cameras,
  initialValue,
  onClose,
  onSubmit
}: {
  title: string;
  cameras: Array<{ id: string; name: string }>;
  initialValue: RecordingScheduleInput;
  onClose: () => void;
  onSubmit: (input: RecordingScheduleInput) => Promise<void>;
}) {
  const [value, setValue] = useState<RecordingScheduleInput>({
    ...initialValue,
    startTime: toDateTimeLocal(new Date(initialValue.startTime)),
    endTime: toDateTimeLocal(new Date(initialValue.endTime))
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit(value);
  };

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="form-grid">
          <label>
            <span>Name</span>
            <input
              value={value.name}
              onChange={(event) => setValue({ ...value, name: event.target.value })}
              required
            />
          </label>
          <label>
            <span>Camera</span>
            <select
              value={value.cameraId}
              onChange={(event) => setValue({ ...value, cameraId: event.target.value })}
              required
            >
              {cameras.map((camera) => (
                <option key={camera.id} value={camera.id}>
                  {camera.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Captures</span>
            <select
              value={value.mediaType}
              onChange={(event) => {
                const mediaType = event.target.value as MediaType;
                setValue({
                  ...value,
                  mediaType,
                  // A video schedule has no interval, and a photo schedule keeps whatever
                  // cadence it had, defaulting to a repeating one rather than a single frame.
                  snapshotIntervalSeconds:
                    mediaType === 'image'
                      ? value.snapshotIntervalSeconds ?? DEFAULT_SNAPSHOT_INTERVAL_SECONDS
                      : null
                });
              }}
            >
              <option value="video">Video recording</option>
              <option value="image">Photo snapshots</option>
            </select>
          </label>
          {value.mediaType === 'image' && (
            <div className="field-block">
              <label>
                <span>Snapshot interval (seconds)</span>
                <input
                  type="number"
                  min={SNAPSHOT_MIN_INTERVAL_SECONDS}
                  step={1}
                  value={value.snapshotIntervalSeconds ?? ''}
                  disabled={value.snapshotIntervalSeconds == null}
                  placeholder="Single shot"
                  required={value.snapshotIntervalSeconds != null}
                  onChange={(event) =>
                    setValue({ ...value, snapshotIntervalSeconds: Number(event.target.value) })
                  }
                />
              </label>
              <label className="toggle-line">
                <input
                  type="checkbox"
                  checked={value.snapshotIntervalSeconds == null}
                  onChange={(event) =>
                    setValue({
                      ...value,
                      snapshotIntervalSeconds: event.target.checked
                        ? null
                        : DEFAULT_SNAPSHOT_INTERVAL_SECONDS
                    })
                  }
                />
                <span>Single snapshot at the start time</span>
              </label>
            </div>
          )}
          <label>
            <span>Start time</span>
            <input
              type="datetime-local"
              value={value.startTime}
              onChange={(event) => setValue({ ...value, startTime: event.target.value })}
              required
            />
          </label>
          <label>
            <span>End time</span>
            <input
              type="datetime-local"
              value={value.endTime}
              onChange={(event) => setValue({ ...value, endTime: event.target.value })}
              required
            />
          </label>
          <label>
            <span>Repeat</span>
            <select
              value={value.recurrence}
              onChange={(event) =>
                setValue({ ...value, recurrence: event.target.value as RecordingRecurrence })
              }
            >
              {recurrenceOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={value.enabled}
              onChange={(event) => setValue({ ...value, enabled: event.target.checked })}
            />
            <span>Enabled</span>
          </label>
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-action" type="submit">
            Save
          </button>
        </footer>
      </form>
    </div>
  );
}

function describeSnapshotCadence(schedule: RecordingSchedule): string {
  return schedule.snapshotIntervalSeconds == null
    ? 'single shot'
    : `every ${schedule.snapshotIntervalSeconds} sec`;
}

function toDateTimeLocal(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function formatScheduleDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
