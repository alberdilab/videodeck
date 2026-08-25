import type {
  AppLog,
  AppSettings,
  AppSettingsInput,
  Camera,
  CameraInput,
  Recording,
  RecordingSchedule,
  RecordingScheduleInput,
  SnapshotSession,
  TestCameraConnectionResult
} from './types.js';

export interface VideoDeckApi {
  listCameras(): Promise<Camera[]>;
  addCamera(cameraInput: CameraInput): Promise<Camera>;
  updateCamera(cameraId: string, cameraInput: Partial<CameraInput>): Promise<Camera>;
  deleteCamera(cameraId: string): Promise<void>;
  testCameraConnection(cameraId: string): Promise<TestCameraConnectionResult>;
  getPreviewUrl(cameraId: string): Promise<string | null>;
  startRecording(cameraId: string): Promise<Recording>;
  stopRecording(cameraId: string): Promise<Recording>;
  recordClip(cameraId: string, durationSeconds: number): Promise<Recording>;
  captureSnapshot(cameraId: string): Promise<Recording>;
  startSnapshotSession(cameraId: string, intervalSeconds: number): Promise<SnapshotSession>;
  stopSnapshotSession(cameraId: string): Promise<void>;
  listSnapshotSessions(): Promise<SnapshotSession[]>;
  listRecordings(): Promise<Recording[]>;
  createSchedule(scheduleInput: RecordingScheduleInput): Promise<RecordingSchedule>;
  updateSchedule(
    scheduleId: string,
    scheduleInput: Partial<RecordingScheduleInput>
  ): Promise<RecordingSchedule>;
  deleteSchedule(scheduleId: string): Promise<void>;
  listSchedules(): Promise<RecordingSchedule[]>;
  getSettings(): Promise<AppSettings>;
  updateSettings(settingsInput: AppSettingsInput): Promise<AppSettings>;
  listLogs(): Promise<AppLog[]>;
  openRecordingLocation(recordingId: string): Promise<void>;
  selectRecordingsDirectory(): Promise<string | null>;
}

export type VideoDeckApiMethod = keyof VideoDeckApi;
