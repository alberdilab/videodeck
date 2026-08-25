import { contextBridge, ipcRenderer } from 'electron';
import type { VideoDeckApi, VideoDeckApiMethod } from '../shared/api.js';

const invoke = <T>(method: VideoDeckApiMethod, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke('videodeck:invoke', method, ...args) as Promise<T>;

const api: VideoDeckApi = {
  listCameras: () => invoke('listCameras'),
  addCamera: (cameraInput) => invoke('addCamera', cameraInput),
  updateCamera: (cameraId, cameraInput) => invoke('updateCamera', cameraId, cameraInput),
  deleteCamera: (cameraId) => invoke('deleteCamera', cameraId),
  testCameraConnection: (cameraId) => invoke('testCameraConnection', cameraId),
  getPreviewUrl: (cameraId) => invoke('getPreviewUrl', cameraId),
  startRecording: (cameraId) => invoke('startRecording', cameraId),
  stopRecording: (cameraId) => invoke('stopRecording', cameraId),
  recordClip: (cameraId, durationSeconds) => invoke('recordClip', cameraId, durationSeconds),
  captureSnapshot: (cameraId) => invoke('captureSnapshot', cameraId),
  startSnapshotSession: (cameraId, intervalSeconds) =>
    invoke('startSnapshotSession', cameraId, intervalSeconds),
  stopSnapshotSession: (cameraId) => invoke('stopSnapshotSession', cameraId),
  listSnapshotSessions: () => invoke('listSnapshotSessions'),
  listRecordings: () => invoke('listRecordings'),
  createSchedule: (scheduleInput) => invoke('createSchedule', scheduleInput),
  updateSchedule: (scheduleId, scheduleInput) => invoke('updateSchedule', scheduleId, scheduleInput),
  deleteSchedule: (scheduleId) => invoke('deleteSchedule', scheduleId),
  listSchedules: () => invoke('listSchedules'),
  getSettings: () => invoke('getSettings'),
  updateSettings: (settingsInput) => invoke('updateSettings', settingsInput),
  listLogs: () => invoke('listLogs'),
  openRecordingLocation: (recordingId) => invoke('openRecordingLocation', recordingId),
  selectRecordingsDirectory: () => invoke('selectRecordingsDirectory')
};

contextBridge.exposeInMainWorld('videoDeck', api);
