import { create } from 'zustand';
import type {
  AppLog,
  AppSettings,
  AppSettingsInput,
  Camera,
  CameraInput,
  Recording,
  RecordingSchedule,
  RecordingScheduleInput,
  SnapshotSession
} from '../../../shared/types.js';

export type AppView = 'live' | 'cameras' | 'recordings' | 'schedules' | 'settings' | 'logs';
export type GridSize = 1 | 4 | 9 | 16 | 25 | 36;

interface VideoDeckState {
  activeView: AppView;
  gridSize: GridSize;
  cameras: Camera[];
  recordings: Recording[];
  schedules: RecordingSchedule[];
  snapshotSessions: SnapshotSession[];
  logs: AppLog[];
  settings: AppSettings | null;
  loading: boolean;
  error: string | null;
  setActiveView: (view: AppView) => void;
  setGridSize: (gridSize: GridSize) => void;
  refreshAll: () => Promise<void>;
  refreshDynamic: () => Promise<void>;
  addCamera: (input: CameraInput) => Promise<void>;
  updateCamera: (cameraId: string, input: Partial<CameraInput>) => Promise<void>;
  deleteCamera: (cameraId: string) => Promise<void>;
  testCameraConnection: (cameraId: string) => Promise<void>;
  startRecording: (cameraId: string) => Promise<void>;
  stopRecording: (cameraId: string) => Promise<void>;
  recordClip: (cameraId: string, durationSeconds: number) => Promise<void>;
  captureSnapshot: (cameraId: string) => Promise<void>;
  startSnapshotSession: (cameraId: string, intervalSeconds: number) => Promise<void>;
  stopSnapshotSession: (cameraId: string) => Promise<void>;
  createSchedule: (input: RecordingScheduleInput) => Promise<void>;
  updateSchedule: (scheduleId: string, input: Partial<RecordingScheduleInput>) => Promise<void>;
  deleteSchedule: (scheduleId: string) => Promise<void>;
  updateSettings: (input: AppSettingsInput) => Promise<void>;
  selectRecordingsDirectory: () => Promise<void>;
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unexpected error';

export const useVideoDeckStore = create<VideoDeckState>((set, get) => ({
  activeView: 'live',
  gridSize: 4,
  cameras: [],
  recordings: [],
  schedules: [],
  snapshotSessions: [],
  logs: [],
  settings: null,
  loading: false,
  error: null,
  setActiveView: (activeView) => set({ activeView }),
  setGridSize: (gridSize) => set({ gridSize }),
  refreshAll: async () => {
    set({ loading: true, error: null });
    try {
      const [cameras, recordings, schedules, snapshotSessions, settings, logs] = await Promise.all([
        window.videoDeck.listCameras(),
        window.videoDeck.listRecordings(),
        window.videoDeck.listSchedules(),
        window.videoDeck.listSnapshotSessions(),
        window.videoDeck.getSettings(),
        window.videoDeck.listLogs()
      ]);
      set({ cameras, recordings, schedules, snapshotSessions, settings, logs, loading: false });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },
  refreshDynamic: async () => {
    try {
      const [cameras, recordings, schedules, snapshotSessions, logs] = await Promise.all([
        window.videoDeck.listCameras(),
        window.videoDeck.listRecordings(),
        window.videoDeck.listSchedules(),
        window.videoDeck.listSnapshotSessions(),
        window.videoDeck.listLogs()
      ]);
      set({ cameras, recordings, schedules, snapshotSessions, logs });
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },
  addCamera: async (input) => {
    await window.videoDeck.addCamera(input);
    await get().refreshDynamic();
  },
  updateCamera: async (cameraId, input) => {
    await window.videoDeck.updateCamera(cameraId, input);
    await get().refreshDynamic();
  },
  deleteCamera: async (cameraId) => {
    await window.videoDeck.deleteCamera(cameraId);
    await get().refreshDynamic();
  },
  testCameraConnection: async (cameraId) => {
    await window.videoDeck.testCameraConnection(cameraId);
    await get().refreshDynamic();
  },
  startRecording: async (cameraId) => {
    await window.videoDeck.startRecording(cameraId);
    await get().refreshDynamic();
  },
  stopRecording: async (cameraId) => {
    await window.videoDeck.stopRecording(cameraId);
    await get().refreshDynamic();
  },
  recordClip: async (cameraId, durationSeconds) => {
    await window.videoDeck.recordClip(cameraId, durationSeconds);
    await get().refreshDynamic();
  },
  // These reject when the camera is busy, and the calling tile shows the reason inline,
  // so refresh in `finally` to keep session state current either way.
  captureSnapshot: async (cameraId) => {
    try {
      await window.videoDeck.captureSnapshot(cameraId);
    } finally {
      await get().refreshDynamic();
    }
  },
  startSnapshotSession: async (cameraId, intervalSeconds) => {
    try {
      await window.videoDeck.startSnapshotSession(cameraId, intervalSeconds);
    } finally {
      await get().refreshDynamic();
    }
  },
  stopSnapshotSession: async (cameraId) => {
    try {
      await window.videoDeck.stopSnapshotSession(cameraId);
    } finally {
      await get().refreshDynamic();
    }
  },
  createSchedule: async (input) => {
    await window.videoDeck.createSchedule(input);
    await get().refreshDynamic();
  },
  updateSchedule: async (scheduleId, input) => {
    await window.videoDeck.updateSchedule(scheduleId, input);
    await get().refreshDynamic();
  },
  deleteSchedule: async (scheduleId) => {
    await window.videoDeck.deleteSchedule(scheduleId);
    await get().refreshDynamic();
  },
  updateSettings: async (input) => {
    const settings = await window.videoDeck.updateSettings(input);
    set({ settings });
    await get().refreshDynamic();
  },
  selectRecordingsDirectory: async () => {
    const recordingsDirectory = await window.videoDeck.selectRecordingsDirectory();
    if (recordingsDirectory) {
      await get().updateSettings({ recordingsDirectory });
    }
  }
}));
