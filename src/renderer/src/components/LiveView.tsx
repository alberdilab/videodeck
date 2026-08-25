import { Camera as CameraIcon, CircleStop, Dot, Images, Radio, Square, Timer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Camera, Recording, SnapshotSession } from '../../../shared/types.js';
import { type GridSize, useVideoDeckStore } from '../state/useVideoDeckStore';

const gridSizes: GridSize[] = [1, 4, 9, 16, 25, 36];
const clipOptions = [
  { label: '30 sec', short: '30"', value: 30 },
  { label: '1 min', short: "1'", value: 60 },
  { label: '5 min', short: "5'", value: 300 }
];
const intervalOptions = [
  { label: '10 sec', short: '10"', value: 10 },
  { label: '1 min', short: "1'", value: 60 },
  { label: '5 min', short: "5'", value: 300 }
];

const MIN_TILE_WIDTH = 160;
const GRID_GAP = 10;

export function LiveView() {
  const {
    cameras,
    recordings,
    snapshotSessions,
    gridSize,
    setGridSize,
    startRecording,
    stopRecording,
    recordClip,
    captureSnapshot,
    startSnapshotSession,
    stopSnapshotSession
  } = useVideoDeckStore();

  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(0);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setGridWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visibleCameras = cameras.filter((camera) => camera.enabled).slice(0, gridSize);
  const placeholders = Math.max(0, gridSize - visibleCameras.length);
  const preferredCols = Math.sqrt(gridSize);
  const maxCols =
    gridWidth > 0
      ? Math.max(1, Math.floor((gridWidth + GRID_GAP) / (MIN_TILE_WIDTH + GRID_GAP)))
      : preferredCols;
  const effectiveCols = Math.max(1, Math.min(preferredCols, maxCols));

  return (
    <section className="view-stack">
      <header className="view-header">
        <div>
          <h1>Live View</h1>
          <p>{visibleCameras.length} enabled cameras shown</p>
        </div>
        <div className="segmented">
          {gridSizes.map((size) => (
            <button
              key={size}
              className={gridSize === size ? 'selected' : ''}
              onClick={() => setGridSize(size)}
            >
              {size}
            </button>
          ))}
        </div>
      </header>

      <div
        ref={gridRef}
        className="camera-grid"
        style={{ gridTemplateColumns: `repeat(${effectiveCols}, minmax(0, 1fr))` }}
      >
        {visibleCameras.map((camera) => (
          <CameraTile
            key={camera.id}
            camera={camera}
            recording={recordings.find(
              (item) =>
                item.cameraId === camera.id &&
                item.mediaType === 'video' &&
                item.status === 'recording'
            )}
            snapshotSession={snapshotSessions.find((item) => item.cameraId === camera.id)}
            onStart={() => void startRecording(camera.id)}
            onStop={() => void stopRecording(camera.id)}
            onClip={(duration) => void recordClip(camera.id, duration)}
            onSnapshot={() => captureSnapshot(camera.id)}
            onStartInterval={(intervalSeconds) => startSnapshotSession(camera.id, intervalSeconds)}
            onStopInterval={() => stopSnapshotSession(camera.id)}
          />
        ))}
        {Array.from({ length: placeholders }, (_, index) => (
          <div className="camera-tile placeholder" key={`placeholder-${index}`}>
            <Square size={24} />
            <span>Empty slot</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

function Elapsed({ since }: { since: string }) {
  const startedAt = Date.parse(since);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (Number.isNaN(startedAt)) {
    return null;
  }
  return <>{formatElapsed((now - startedAt) / 1000)}</>;
}

function CameraTile({
  camera,
  recording,
  snapshotSession,
  onStart,
  onStop,
  onClip,
  onSnapshot,
  onStartInterval,
  onStopInterval
}: {
  camera: Camera;
  recording?: Recording;
  snapshotSession?: SnapshotSession;
  onStart: () => void;
  onStop: () => void;
  onClip: (durationSeconds: number) => void;
  onSnapshot: () => Promise<void>;
  onStartInterval: (intervalSeconds: number) => Promise<void>;
  onStopInterval: () => Promise<void>;
}) {
  const isRecording = Boolean(recording);
  const isSnapshotSession = Boolean(snapshotSession);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const busy = isRecording || isSnapshotSession || capturing;

  const runCapture = (action: () => Promise<void>): void => {
    setCapturing(true);
    setCaptureError(null);
    action()
      .catch((error: unknown) => {
        setCaptureError(error instanceof Error ? error.message : 'Capture failed');
      })
      .finally(() => setCapturing(false));
  };

  useEffect(() => {
    let cancelled = false;
    setPreviewUrl(null);
    setPreviewFailed(false);

    // The preview holds its own RTSP session, which the camera cannot serve while
    // recording or capturing, so the backend suspends it and the tile shows a
    // capture surface instead. Reconnecting when `busy` clears also gives the
    // MJPEG stream a fresh URL, since suspending drops the previous connection.
    if (busy) {
      return;
    }

    window.videoDeck
      .getPreviewUrl(camera.id)
      .then((url) => {
        if (!cancelled) {
          setPreviewUrl(url ? `${url}?t=${Date.now()}` : null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [camera.id, camera.enabled, busy]);

  return (
    <article className={tileClassName(isRecording, isSnapshotSession)}>
      {isRecording ? (
        <div className="preview-surface recording-surface">
          <span className="rec-badge">
            <span className="rec-dot" />
            REC
          </span>
          <span className="rec-elapsed">{recording ? <Elapsed since={recording.startedAt} /> : null}</span>
          <span>Live preview paused while recording</span>
        </div>
      ) : snapshotSession ? (
        <div className="preview-surface snapshot-surface">
          <span className="rec-badge snap-badge">
            <span className="rec-dot" />
            SNAP
          </span>
          <span className="rec-elapsed">
            <Elapsed since={snapshotSession.startedAt} />
          </span>
          <span>
            {snapshotSession.captureCount} captured, every{' '}
            {formatInterval(snapshotSession.intervalSeconds)}
          </span>
        </div>
      ) : capturing ? (
        <div className="preview-surface snapshot-surface">
          <span className="rec-badge snap-badge">
            <span className="rec-dot" />
            SNAP
          </span>
          <span>Capturing a frame…</span>
        </div>
      ) : previewUrl && !previewFailed ? (
        <img
          className="preview-stream"
          src={previewUrl}
          alt={`Live preview for ${camera.name}`}
          onError={() => setPreviewFailed(true)}
        />
      ) : (
        <div className="preview-surface">
          <Radio size={32} />
          <span>{previewFailed ? 'Preview unavailable' : 'Preview placeholder'}</span>
        </div>
      )}
      <div className="tile-meta">
        <div>
          <h2>{camera.name}</h2>
          <span className={`status ${camera.connectionStatus}`}>
            <Dot size={22} />
            {camera.connectionStatus}
          </span>
        </div>
        {isSnapshotSession ? (
          <span className="recording-pill snap active">SNAP</span>
        ) : (
          <span className={isRecording ? 'recording-pill active' : 'recording-pill'}>REC</span>
        )}
      </div>
      <div className="tile-actions">
        <button
          className="icon-button danger"
          disabled={isSnapshotSession || capturing}
          onClick={isRecording ? onStop : onStart}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording ? <CircleStop size={16} /> : <Radio size={16} />}
          <span className="btn-label-action">{isRecording ? 'Stop' : 'Record'}</span>
        </button>
        {clipOptions.map((option) => (
          <button
            className="icon-button"
            key={option.value}
            disabled={busy}
            onClick={() => onClip(option.value)}
          >
            <span className="clip-btn-icon">
              <Timer size={16} />
            </span>
            <span className="btn-label-full">{option.label}</span>
            <span className="btn-label-short">{option.short}</span>
          </button>
        ))}
      </div>
      <div className="tile-actions snapshot-actions">
        <button
          className={isSnapshotSession ? 'icon-button danger' : 'icon-button'}
          disabled={isRecording || capturing}
          onClick={() => runCapture(isSnapshotSession ? onStopInterval : onSnapshot)}
          aria-label={isSnapshotSession ? 'Stop snapshot session' : 'Capture snapshot'}
        >
          {isSnapshotSession ? <CircleStop size={16} /> : <CameraIcon size={16} />}
          <span className="btn-label-action">{isSnapshotSession ? 'Stop' : 'Photo'}</span>
        </button>
        {intervalOptions.map((option) => (
          <button
            className="icon-button"
            key={option.value}
            disabled={busy}
            title={`Capture a snapshot every ${option.label}`}
            onClick={() => runCapture(() => onStartInterval(option.value))}
          >
            <span className="clip-btn-icon">
              <Images size={16} />
            </span>
            <span className="btn-label-full">{option.label}</span>
            <span className="btn-label-short">{option.short}</span>
          </button>
        ))}
      </div>
      {captureError && <p className="tile-error">{captureError}</p>}
    </article>
  );
}

function tileClassName(isRecording: boolean, isSnapshotSession: boolean): string {
  if (isRecording) {
    return 'camera-tile recording';
  }
  return isSnapshotSession ? 'camera-tile snapshotting' : 'camera-tile';
}

function formatInterval(seconds: number): string {
  if (seconds % 3600 === 0) {
    return `${seconds / 3600} h`;
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60} min`;
  }
  return `${seconds} sec`;
}
