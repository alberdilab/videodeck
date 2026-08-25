import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AppLog,
  AppSettings,
  Camera,
  CameraConnectionStatus,
  CameraInput,
  LogCategory,
  LogLevel,
  MediaType,
  Recording,
  RecordingSchedule,
  RecordingScheduleInput,
  RecordingStatus,
  RecordingTriggerType
} from '../../shared/types.js';
import { nowIso } from '../utils/time.js';
import { redactObject } from '../utils/redact.js';

type CameraRow = Omit<Camera, 'enabled' | 'password'> & { enabled: 0 | 1; cameraModel: string | null };
type CredentialRow = { camera_id: string; password: string };
// `mediaType` is nullable in rows written before the snapshot migration.
type RecordingRow = Omit<Recording, 'ffmpegPid' | 'mediaType'> & {
  ffmpegPid: number | null;
  mediaType: MediaType | null;
};
type ScheduleRow = Omit<RecordingSchedule, 'enabled' | 'mediaType'> & {
  enabled: 0 | 1;
  mediaType: MediaType | null;
};
type SettingsRow = { key: keyof AppSettings; value: string };
type LogRow = AppLog;

export interface CameraCredentialStore {
  getPassword(cameraId: string): string;
  setPassword(cameraId: string, password: string): void;
  deletePassword(cameraId: string): void;
}

export class SqliteCameraCredentialStore implements CameraCredentialStore {
  constructor(private readonly db: Database.Database) {}

  getPassword(cameraId: string): string {
    const row = this.db
      .prepare('SELECT password FROM camera_credentials WHERE camera_id = ?')
      .get(cameraId) as CredentialRow | undefined;
    return row?.password ?? '';
  }

  setPassword(cameraId: string, password: string): void {
    // TODO: Replace plaintext SQLite storage with OS credential storage.
    // macOS: Keychain. Windows: Credential Manager.
    this.db
      .prepare(
        `INSERT INTO camera_credentials (camera_id, password)
         VALUES (?, ?)
         ON CONFLICT(camera_id) DO UPDATE SET password = excluded.password`
      )
      .run(cameraId, password);
  }

  deletePassword(cameraId: string): void {
    this.db.prepare('DELETE FROM camera_credentials WHERE camera_id = ?').run(cameraId);
  }
}

export class AppDatabase {
  readonly db: Database.Database;
  readonly credentialStore: CameraCredentialStore;

  constructor(private readonly userDataPath: string) {
    fs.mkdirSync(userDataPath, { recursive: true });
    this.db = new Database(path.join(userDataPath, 'videodeck.sqlite'));
    this.db.pragma('journal_mode = WAL');
    this.migrate();
    this.credentialStore = new SqliteCameraCredentialStore(this.db);
  }

  close(): void {
    this.db.close();
  }

  listCameras(): Camera[] {
    const rows = this.db.prepare('SELECT * FROM cameras ORDER BY createdAt DESC').all() as CameraRow[];
    return rows.map((row) => this.mapCamera(row));
  }

  getCamera(cameraId: string): Camera | null {
    const row = this.db.prepare('SELECT * FROM cameras WHERE id = ?').get(cameraId) as
      | CameraRow
      | undefined;
    return row ? this.mapCamera(row) : null;
  }

  insertCamera(camera: Camera): Camera {
    const insert = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO cameras (
            id, name, host, onvifPort, cameraModel, rtspMainUrl, rtspSubUrl, username, enabled,
            connectionStatus, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          camera.id,
          camera.name,
          camera.host,
          camera.onvifPort,
          camera.cameraModel,
          camera.rtspMainUrl,
          camera.rtspSubUrl,
          camera.username,
          camera.enabled ? 1 : 0,
          camera.connectionStatus,
          camera.createdAt,
          camera.updatedAt
        );
      this.credentialStore.setPassword(camera.id, camera.password);
    });
    insert();
    return camera;
  }

  updateCamera(cameraId: string, input: Partial<CameraInput>): Camera {
    const current = this.getCamera(cameraId);
    if (!current) {
      throw new Error(`Camera not found: ${cameraId}`);
    }

    const updated: Camera = {
      ...current,
      ...input,
      updatedAt: nowIso()
    };

    const update = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE cameras
           SET name = ?, host = ?, onvifPort = ?, cameraModel = ?, rtspMainUrl = ?, rtspSubUrl = ?,
               username = ?, enabled = ?, connectionStatus = ?, updatedAt = ?
           WHERE id = ?`
        )
        .run(
          updated.name,
          updated.host,
          updated.onvifPort,
          updated.cameraModel,
          updated.rtspMainUrl,
          updated.rtspSubUrl,
          updated.username,
          updated.enabled ? 1 : 0,
          updated.connectionStatus,
          updated.updatedAt,
          cameraId
        );

      if (typeof input.password === 'string') {
        this.credentialStore.setPassword(cameraId, input.password);
      }
    });
    update();

    return updated;
  }

  setCameraConnectionStatus(cameraId: string, status: CameraConnectionStatus): void {
    this.db
      .prepare('UPDATE cameras SET connectionStatus = ?, updatedAt = ? WHERE id = ?')
      .run(status, nowIso(), cameraId);
  }

  deleteCamera(cameraId: string): void {
    const remove = this.db.transaction(() => {
      this.db.prepare('DELETE FROM schedules WHERE cameraId = ?').run(cameraId);
      this.db.prepare('DELETE FROM cameras WHERE id = ?').run(cameraId);
      this.credentialStore.deletePassword(cameraId);
    });
    remove();
  }

  listRecordings(): Recording[] {
    const rows = this.db
      .prepare('SELECT * FROM recordings ORDER BY startedAt DESC')
      .all() as RecordingRow[];
    return rows.map((row) => mapRecording(row));
  }

  getRecording(recordingId: string): Recording | null {
    const row = this.db.prepare('SELECT * FROM recordings WHERE id = ?').get(recordingId) as
      | RecordingRow
      | undefined;
    return row ? mapRecording(row) : null;
  }

  insertRecording(recording: Recording): Recording {
    this.db
      .prepare(
        `INSERT INTO recordings (
          id, cameraId, cameraName, mediaType, outputPath, startedAt, endedAt, durationSeconds,
          triggerType, status, ffmpegPid, errorMessage
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        recording.id,
        recording.cameraId,
        recording.cameraName,
        recording.mediaType,
        recording.outputPath,
        recording.startedAt,
        recording.endedAt,
        recording.durationSeconds,
        recording.triggerType,
        recording.status,
        recording.ffmpegPid,
        recording.errorMessage
      );
    return recording;
  }

  updateRecording(
    recordingId: string,
    patch: Partial<Pick<Recording, 'endedAt' | 'durationSeconds' | 'status' | 'ffmpegPid' | 'errorMessage'>>
  ): Recording {
    const current = this.getRecording(recordingId);
    if (!current) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    const updated = { ...current, ...patch };
    this.db
      .prepare(
        `UPDATE recordings
         SET endedAt = ?, durationSeconds = ?, status = ?, ffmpegPid = ?, errorMessage = ?
         WHERE id = ?`
      )
      .run(
        updated.endedAt,
        updated.durationSeconds,
        updated.status,
        updated.ffmpegPid,
        updated.errorMessage,
        recordingId
      );
    return updated;
  }

  listSchedules(): RecordingSchedule[] {
    const rows = this.db.prepare('SELECT * FROM schedules ORDER BY startTime ASC').all() as ScheduleRow[];
    return rows.map((row) => mapSchedule(row));
  }

  getSchedule(scheduleId: string): RecordingSchedule | null {
    const row = this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(scheduleId) as
      | ScheduleRow
      | undefined;
    return row ? mapSchedule(row) : null;
  }

  insertSchedule(schedule: RecordingSchedule): RecordingSchedule {
    this.db
      .prepare(
        `INSERT INTO schedules (
          id, cameraId, name, mediaType, snapshotIntervalSeconds, startTime, endTime, recurrence,
          enabled, lastStartedAt, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        schedule.id,
        schedule.cameraId,
        schedule.name,
        schedule.mediaType,
        schedule.snapshotIntervalSeconds,
        schedule.startTime,
        schedule.endTime,
        schedule.recurrence,
        schedule.enabled ? 1 : 0,
        schedule.lastStartedAt,
        schedule.createdAt,
        schedule.updatedAt
      );
    return schedule;
  }

  updateSchedule(scheduleId: string, input: Partial<RecordingScheduleInput>): RecordingSchedule {
    const current = this.getSchedule(scheduleId);
    if (!current) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const updated = { ...current, ...input, updatedAt: nowIso() };
    this.db
      .prepare(
        `UPDATE schedules
         SET cameraId = ?, name = ?, mediaType = ?, snapshotIntervalSeconds = ?, startTime = ?,
             endTime = ?, recurrence = ?, enabled = ?, updatedAt = ?
         WHERE id = ?`
      )
      .run(
        updated.cameraId,
        updated.name,
        updated.mediaType,
        updated.snapshotIntervalSeconds,
        updated.startTime,
        updated.endTime,
        updated.recurrence,
        updated.enabled ? 1 : 0,
        updated.updatedAt,
        scheduleId
      );
    return updated;
  }

  markScheduleStarted(scheduleId: string, startedAt: string): void {
    this.db
      .prepare('UPDATE schedules SET lastStartedAt = ?, updatedAt = ? WHERE id = ?')
      .run(startedAt, nowIso(), scheduleId);
  }

  deleteSchedule(scheduleId: string): void {
    this.db.prepare('DELETE FROM schedules WHERE id = ?').run(scheduleId);
  }

  getSettings(defaultSettings: AppSettings): AppSettings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as SettingsRow[];
    const values = new Map(rows.map((row) => [row.key, row.value]));
    return {
      recordingsDirectory: values.get('recordingsDirectory') ?? defaultSettings.recordingsDirectory,
      defaultClipDurationSeconds: Number(
        values.get('defaultClipDurationSeconds') ?? defaultSettings.defaultClipDurationSeconds
      ),
      filenameTemplate: values.get('filenameTemplate') ?? defaultSettings.filenameTemplate,
      retentionDays: values.has('retentionDays')
        ? JSON.parse(values.get('retentionDays') ?? 'null')
        : defaultSettings.retentionDays,
      preferMkv: values.has('preferMkv')
        ? JSON.parse(values.get('preferMkv') ?? 'true')
        : defaultSettings.preferMkv
    };
  }

  updateSettings(settings: AppSettings): AppSettings {
    const update = this.db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        this.db
          .prepare(
            `INSERT INTO settings (key, value)
             VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`
          )
          .run(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    });
    update();
    return settings;
  }

  addLog(level: LogLevel, category: LogCategory, message: string, context?: unknown): AppLog {
    const log: AppLog = {
      id: randomUUID(),
      timestamp: nowIso(),
      level,
      category,
      message,
      context: context === undefined ? null : JSON.stringify(redactObject(context))
    };
    this.db
      .prepare(
        'INSERT INTO logs (id, timestamp, level, category, message, context) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(log.id, log.timestamp, log.level, log.category, log.message, log.context);
    return log;
  }

  listLogs(): AppLog[] {
    return this.db.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 500').all() as LogRow[];
  }

  private mapCamera(row: CameraRow): Camera {
    return {
      ...row,
      enabled: Boolean(row.enabled),
      password: this.credentialStore.getPassword(row.id)
    };
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cameras (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        onvifPort INTEGER NOT NULL,
        cameraModel TEXT,
        rtspMainUrl TEXT NOT NULL,
        rtspSubUrl TEXT NOT NULL,
        username TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        connectionStatus TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS camera_credentials (
        camera_id TEXT PRIMARY KEY REFERENCES cameras(id) ON DELETE CASCADE,
        password TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recordings (
        id TEXT PRIMARY KEY,
        cameraId TEXT NOT NULL,
        cameraName TEXT NOT NULL,
        mediaType TEXT,
        outputPath TEXT NOT NULL,
        startedAt TEXT NOT NULL,
        endedAt TEXT,
        durationSeconds INTEGER,
        triggerType TEXT NOT NULL,
        status TEXT NOT NULL,
        ffmpegPid INTEGER,
        errorMessage TEXT
      );

      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        cameraId TEXT NOT NULL,
        name TEXT NOT NULL,
        mediaType TEXT,
        snapshotIntervalSeconds INTEGER,
        startTime TEXT NOT NULL,
        endTime TEXT NOT NULL,
        recurrence TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        lastStartedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        context TEXT
      );
    `);

    // Additive migrations for existing databases
    const cameraColumns = this.db.pragma('table_info(cameras)') as { name: string }[];
    if (!cameraColumns.some((col) => col.name === 'cameraModel')) {
      this.db.exec('ALTER TABLE cameras ADD COLUMN cameraModel TEXT');
    }

    const recordingColumns = this.db.pragma('table_info(recordings)') as { name: string }[];
    if (!recordingColumns.some((col) => col.name === 'mediaType')) {
      this.db.exec('ALTER TABLE recordings ADD COLUMN mediaType TEXT');
    }
    this.db.exec("UPDATE recordings SET mediaType = 'video' WHERE mediaType IS NULL");

    const scheduleColumns = this.db.pragma('table_info(schedules)') as { name: string }[];
    if (!scheduleColumns.some((col) => col.name === 'mediaType')) {
      this.db.exec('ALTER TABLE schedules ADD COLUMN mediaType TEXT');
    }
    if (!scheduleColumns.some((col) => col.name === 'snapshotIntervalSeconds')) {
      this.db.exec('ALTER TABLE schedules ADD COLUMN snapshotIntervalSeconds INTEGER');
    }
    this.db.exec("UPDATE schedules SET mediaType = 'video' WHERE mediaType IS NULL");
  }
}

function mapRecording(row: RecordingRow): Recording {
  return { ...row, mediaType: row.mediaType ?? 'video' };
}

function mapSchedule(row: ScheduleRow): RecordingSchedule {
  return {
    ...row,
    mediaType: row.mediaType ?? 'video',
    snapshotIntervalSeconds: row.snapshotIntervalSeconds ?? null,
    enabled: Boolean(row.enabled)
  };
}
