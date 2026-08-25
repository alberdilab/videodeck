export type RecordingTriggerType = 'manual' | 'scheduled' | 'api';

export type RecordingStatus = 'recording' | 'completed' | 'failed' | 'interrupted';

/** `video` is an FFmpeg recording, `image` is a single JPEG snapshot. */
export type MediaType = 'video' | 'image';

export const SNAPSHOT_MIN_INTERVAL_SECONDS = 5;
export const SNAPSHOT_MAX_INTERVAL_SECONDS = 24 * 60 * 60;

export type CameraConnectionStatus = 'unknown' | 'online' | 'offline' | 'testing';

export type RecordingRecurrence = 'none' | 'daily' | 'weekly' | 'weekdays';

export interface Camera {
  id: string;
  name: string;
  host: string;
  onvifPort: number;
  cameraModel: string | null;
  rtspMainUrl: string;
  rtspSubUrl: string;
  username: string;
  password: string;
  enabled: boolean;
  connectionStatus: CameraConnectionStatus;
  createdAt: string;
  updatedAt: string;
}

export type CameraInput = Omit<Camera, 'id' | 'connectionStatus' | 'createdAt' | 'updatedAt'>;

export interface Recording {
  id: string;
  cameraId: string;
  cameraName: string;
  mediaType: MediaType;
  outputPath: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  triggerType: RecordingTriggerType;
  status: RecordingStatus;
  ffmpegPid: number | null;
  errorMessage: string | null;
}

export interface RecordingSchedule {
  id: string;
  cameraId: string;
  name: string;
  mediaType: MediaType;
  /** Seconds between snapshots for `image` schedules; `null` captures a single frame. */
  snapshotIntervalSeconds: number | null;
  startTime: string;
  endTime: string;
  recurrence: RecordingRecurrence;
  enabled: boolean;
  lastStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A running interval capture: one snapshot every `intervalSeconds` until stopped. */
export interface SnapshotSession {
  cameraId: string;
  intervalSeconds: number;
  triggerType: RecordingTriggerType;
  startedAt: string;
  lastCaptureAt: string | null;
  captureCount: number;
}

export type RecordingScheduleInput = Omit<
  RecordingSchedule,
  'id' | 'lastStartedAt' | 'createdAt' | 'updatedAt'
>;

export interface AppSettings {
  recordingsDirectory: string;
  defaultClipDurationSeconds: number;
  filenameTemplate: string;
  retentionDays: number | null;
  preferMkv: boolean;
}

export type AppSettingsInput = Partial<AppSettings>;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory = 'camera' | 'recording' | 'schedule' | 'system' | 'ffmpeg';

export interface AppLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  context: string | null;
}

export interface CameraTileState {
  cameraId: string;
  connectionStatus: CameraConnectionStatus;
  recordingStatus: RecordingStatus | 'idle';
}

export interface TestCameraConnectionResult {
  ok: boolean;
  message: string;
}
