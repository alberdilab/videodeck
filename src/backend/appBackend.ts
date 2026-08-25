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
} from '../shared/types.js';
import { AppDatabase } from './storage/database.js';
import { CameraBusyRegistry } from './services/cameraBusyRegistry.js';
import { CameraService } from './services/cameraService.js';
import { RecordingService } from './services/recordingService.js';
import { ScheduleService } from './services/scheduleService.js';
import { SettingsService } from './services/settingsService.js';
import { SnapshotService } from './services/snapshotService.js';
import { MjpegStreamPreviewService } from './services/streamPreviewService.js';
import { StubOnvifService } from './services/onvifService.js';

export class VideoDeckBackend {
  readonly database: AppDatabase;
  readonly cameraService: CameraService;
  readonly settingsService: SettingsService;
  readonly recordingService: RecordingService;
  readonly snapshotService: SnapshotService;
  readonly scheduleService: ScheduleService;
  readonly onvifService = new StubOnvifService();
  readonly streamPreviewService: MjpegStreamPreviewService;
  private readonly busyRegistry = new CameraBusyRegistry();

  constructor(userDataPath: string) {
    this.database = new AppDatabase(userDataPath);
    this.settingsService = new SettingsService(this.database, userDataPath);
    this.cameraService = new CameraService(this.database);
    this.streamPreviewService = new MjpegStreamPreviewService(this.database);
    this.recordingService = new RecordingService(
      this.database,
      this.cameraService,
      this.settingsService,
      this.streamPreviewService,
      this.busyRegistry
    );
    this.snapshotService = new SnapshotService(
      this.database,
      this.cameraService,
      this.settingsService,
      this.streamPreviewService,
      this.busyRegistry
    );
    this.scheduleService = new ScheduleService(
      this.database,
      this.cameraService,
      this.recordingService,
      this.snapshotService
    );
  }

  async start(): Promise<void> {
    this.settingsService.getSettings();
    this.scheduleService.start();
    await this.streamPreviewService.start();
    this.database.addLog('info', 'system', 'VideoDeck backend started');
  }

  shutdown(): void {
    this.scheduleService.stop();
    this.snapshotService.shutdown();
    this.recordingService.shutdown();
    this.streamPreviewService.shutdown();
    this.database.addLog('info', 'system', 'VideoDeck backend stopped');
    this.database.close();
  }

  listCameras(): Promise<Camera[]> {
    return Promise.resolve(this.cameraService.listCameras());
  }

  addCamera(input: CameraInput): Promise<Camera> {
    return Promise.resolve(this.cameraService.addCamera(input));
  }

  updateCamera(cameraId: string, input: Partial<CameraInput>): Promise<Camera> {
    return Promise.resolve(this.cameraService.updateCamera(cameraId, input));
  }

  deleteCamera(cameraId: string): Promise<void> {
    this.cameraService.deleteCamera(cameraId);
    return Promise.resolve();
  }

  testCameraConnection(cameraId: string): Promise<TestCameraConnectionResult> {
    return this.cameraService.testCameraConnection(cameraId);
  }

  startRecording(cameraId: string): Promise<Recording> {
    return this.recordingService.startRecording(cameraId, 'manual');
  }

  stopRecording(cameraId: string): Promise<Recording> {
    return this.recordingService.stopRecording(cameraId);
  }

  recordClip(cameraId: string, durationSeconds: number): Promise<Recording> {
    return this.recordingService.recordClip(cameraId, durationSeconds);
  }

  captureSnapshot(cameraId: string): Promise<Recording> {
    return this.snapshotService.captureSnapshot(cameraId, 'manual');
  }

  startSnapshotSession(cameraId: string, intervalSeconds: number): Promise<SnapshotSession> {
    return Promise.resolve(this.snapshotService.startSnapshotSession(cameraId, intervalSeconds));
  }

  stopSnapshotSession(cameraId: string): Promise<void> {
    this.snapshotService.stopSnapshotSession(cameraId);
    return Promise.resolve();
  }

  listSnapshotSessions(): Promise<SnapshotSession[]> {
    return Promise.resolve(this.snapshotService.listSnapshotSessions());
  }

  listRecordings(): Promise<Recording[]> {
    return Promise.resolve(this.recordingService.listRecordings());
  }

  createSchedule(input: RecordingScheduleInput): Promise<RecordingSchedule> {
    return Promise.resolve(this.scheduleService.createSchedule(input));
  }

  updateSchedule(
    scheduleId: string,
    input: Partial<RecordingScheduleInput>
  ): Promise<RecordingSchedule> {
    return Promise.resolve(this.scheduleService.updateSchedule(scheduleId, input));
  }

  deleteSchedule(scheduleId: string): Promise<void> {
    this.scheduleService.deleteSchedule(scheduleId);
    return Promise.resolve();
  }

  listSchedules(): Promise<RecordingSchedule[]> {
    return Promise.resolve(this.scheduleService.listSchedules());
  }

  getSettings(): Promise<AppSettings> {
    return Promise.resolve(this.settingsService.getSettings());
  }

  updateSettings(input: AppSettingsInput): Promise<AppSettings> {
    return Promise.resolve(this.settingsService.updateSettings(input));
  }

  listLogs(): Promise<AppLog[]> {
    return Promise.resolve(this.database.listLogs());
  }

  getRecording(recordingId: string): Recording | null {
    return this.database.getRecording(recordingId);
  }

  getPreviewUrl(cameraId: string): Promise<string | null> {
    const camera = this.cameraService.requireCamera(cameraId);
    return this.streamPreviewService.getPreviewUrl(camera);
  }
}
