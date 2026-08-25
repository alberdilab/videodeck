import md5 from 'md5';
import { Pencil, Plus, Trash2, Wifi } from 'lucide-react';
import { FormEvent, useState } from 'react';
import type { Camera, CameraInput } from '../../../shared/types.js';
import { useVideoDeckStore } from '../state/useVideoDeckStore';

const CAMERA_MODELS: Record<
  string,
  {
    label: string;
    defaultUsername: string;
    rtspMain: (host: string, token: string) => string;
    rtspSub: (host: string, token: string) => string;
  }
> = {
  'Nivian NVS-IPC-IS4': {
    label: 'Nivian NVS-IPC-IS4',
    defaultUsername: 'admin',
    rtspMain: (host, token) => `rtsp://${host}:5543/${token}/live/channel0`,
    rtspSub: (host, token) => `rtsp://${host}:5543/${token}/live/channel1`
  }
};

function computeRtspUrls(
  model: string | null,
  host: string,
  username: string,
  password: string
): { rtspMainUrl: string; rtspSubUrl: string } | null {
  if (!model || !CAMERA_MODELS[model] || !host || !password) return null;
  const token = md5(username + password);
  return {
    rtspMainUrl: CAMERA_MODELS[model].rtspMain(host, token),
    rtspSubUrl: CAMERA_MODELS[model].rtspSub(host, token)
  };
}

const emptyCameraInput: CameraInput = {
  name: '',
  host: '',
  onvifPort: 8899,
  cameraModel: 'Nivian NVS-IPC-IS4',
  rtspMainUrl: '',
  rtspSubUrl: '',
  username: 'admin',
  password: '',
  enabled: true
};

export function CamerasView() {
  const { cameras, addCamera, updateCamera, deleteCamera, testCameraConnection } = useVideoDeckStore();
  const [editing, setEditing] = useState<Camera | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <section className="view-stack">
      <header className="view-header">
        <div>
          <h1>Cameras</h1>
          <p>{cameras.length} configured cameras</p>
        </div>
        <button className="primary-action" onClick={() => setCreating(true)}>
          <Plus size={18} />
          Add camera
        </button>
      </header>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Host</th>
              <th>Model</th>
              <th>Status</th>
              <th>Enabled</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {cameras.map((camera) => (
              <tr key={camera.id}>
                <td>
                  <strong>{camera.name}</strong>
                  <span className="subtle">{camera.rtspMainUrl.replace(/\/\/.*@/, '//****@')}</span>
                </td>
                <td>{camera.host}</td>
                <td>{camera.cameraModel ?? '—'}</td>
                <td>
                  <span className={`status ${camera.connectionStatus}`}>{camera.connectionStatus}</span>
                </td>
                <td>{camera.enabled ? 'Yes' : 'No'}</td>
                <td>
                  <div className="row-actions">
                    <button onClick={() => void testCameraConnection(camera.id)} title="Test connection">
                      <Wifi size={16} />
                    </button>
                    <button onClick={() => setEditing(camera)} title="Edit camera">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => void deleteCamera(camera.id)} title="Delete camera">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {cameras.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-table">
                  No cameras configured
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <CameraModal
          title="Add Camera"
          initialValue={emptyCameraInput}
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            await addCamera(input);
            setCreating(false);
          }}
        />
      )}
      {editing && (
        <CameraModal
          title="Edit Camera"
          initialValue={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            await updateCamera(editing.id, input);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function CameraModal({
  title,
  initialValue,
  onClose,
  onSubmit
}: {
  title: string;
  initialValue: CameraInput;
  onClose: () => void;
  onSubmit: (input: CameraInput) => Promise<void>;
}) {
  const [value, setValue] = useState<CameraInput>(initialValue);

  const isPreset = value.cameraModel !== null && value.cameraModel !== '';
  const computed = computeRtspUrls(value.cameraModel, value.host, value.username, value.password);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const submitted: CameraInput = isPreset && computed
      ? { ...value, rtspMainUrl: computed.rtspMainUrl, rtspSubUrl: computed.rtspSubUrl }
      : value;
    void onSubmit(submitted);
  };

  const handleModelChange = (model: string) => {
    const preset = model ? CAMERA_MODELS[model] : null;
    setValue({
      ...value,
      cameraModel: model || null,
      username: preset ? preset.defaultUsername : value.username,
      rtspMainUrl: '',
      rtspSubUrl: ''
    });
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
            <span>Camera model</span>
            <select
              value={value.cameraModel ?? ''}
              onChange={(event) => handleModelChange(event.target.value)}
            >
              {Object.keys(CAMERA_MODELS).map((model) => (
                <option key={model} value={model}>
                  {CAMERA_MODELS[model].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Name</span>
            <input
              value={value.name}
              onChange={(event) => setValue({ ...value, name: event.target.value })}
              required
            />
          </label>
          <label>
            <span>IP address</span>
            <input
              value={value.host}
              onChange={(event) => setValue({ ...value, host: event.target.value })}
              required
            />
          </label>
          <label>
            <span>Username</span>
            <input
              value={value.username}
              onChange={(event) => setValue({ ...value, username: event.target.value })}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={value.password}
              onChange={(event) => setValue({ ...value, password: event.target.value })}
              required={isPreset}
            />
          </label>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={value.enabled}
              onChange={(event) => setValue({ ...value, enabled: event.target.checked })}
            />
            <span>Enabled</span>
          </label>

          {isPreset ? null : (
            <>
              <label className="wide">
                <span>RTSP main URL</span>
                <input
                  value={value.rtspMainUrl}
                  onChange={(event) => setValue({ ...value, rtspMainUrl: event.target.value })}
                  required
                />
              </label>
              <label className="wide">
                <span>RTSP sub URL</span>
                <input
                  value={value.rtspSubUrl}
                  onChange={(event) => setValue({ ...value, rtspSubUrl: event.target.value })}
                />
              </label>
            </>
          )}
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
