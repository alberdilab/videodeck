import { FolderOpen, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { MediaType, Recording } from '../../../shared/types.js';
import { useVideoDeckStore } from '../state/useVideoDeckStore';

type MediaFilter = 'all' | MediaType;

const filterOptions: Array<{ value: MediaFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'video', label: 'Videos' },
  { value: 'image', label: 'Photos' }
];

export function RecordingsView() {
  const { recordings, refreshDynamic } = useVideoDeckStore();
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');

  const visible = recordings.filter(
    (recording) => mediaFilter === 'all' || recording.mediaType === mediaFilter
  );
  const snapshotCount = recordings.filter((recording) => recording.mediaType === 'image').length;

  return (
    <section className="view-stack">
      <header className="view-header">
        <div>
          <h1>Recordings</h1>
          <p>
            {recordings.length - snapshotCount} recordings and {snapshotCount} snapshots
          </p>
        </div>
        <div className="header-actions">
          <div className="segmented">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                className={mediaFilter === option.value ? 'selected' : ''}
                onClick={() => setMediaFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button className="primary-action" onClick={() => void refreshDynamic()}>
            <RefreshCw size={18} />
            Refresh
          </button>
        </div>
      </header>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Camera</th>
              <th>Type</th>
              <th>Started</th>
              <th>Duration</th>
              <th>Trigger</th>
              <th>Status</th>
              <th>File</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((recording) => (
              <tr key={recording.id}>
                <td>{recording.cameraName}</td>
                <td>
                  <span className={`media-pill ${recording.mediaType}`}>
                    {recording.mediaType === 'image' ? 'Photo' : 'Video'}
                  </span>
                </td>
                <td>{formatDate(recording.startedAt)}</td>
                <td>{formatDuration(recording)}</td>
                <td>{recording.triggerType}</td>
                <td>
                  <span className={`status ${recording.status}`}>
                    {formatStatus(recording)}
                  </span>
                </td>
                <td>
                  <div className="file-cell">
                    <span>{recording.outputPath}</span>
                    <button
                      title="Open file location"
                      onClick={() => void window.videoDeck.openRecordingLocation(recording.id)}
                    >
                      <FolderOpen size={16} />
                    </button>
                  </div>
                  {recording.errorMessage && <span className="error-line">{recording.errorMessage}</span>}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-table">
                  {mediaFilter === 'image' ? 'No snapshots yet' : 'No recordings yet'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatDuration(recording: Recording): string {
  if (recording.mediaType === 'image') {
    return '—';
  }
  return recording.durationSeconds == null ? 'In progress' : `${recording.durationSeconds} sec`;
}

function formatStatus(recording: Recording): string {
  // A snapshot borrows the `recording` status while FFmpeg grabs the frame.
  if (recording.mediaType === 'image' && recording.status === 'recording') {
    return 'capturing';
  }
  return recording.status;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(new Date(value));
}
