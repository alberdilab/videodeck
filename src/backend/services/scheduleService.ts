import { randomUUID } from 'node:crypto';
import type { MediaType, RecordingSchedule, RecordingScheduleInput } from '../../shared/types.js';
import { scheduleInputSchema, schedulePatchSchema } from '../../shared/validation.js';
import type { AppDatabase } from '../storage/database.js';
import { nowIso } from '../utils/time.js';
import type { CameraService } from './cameraService.js';
import type { RecordingService } from './recordingService.js';
import type { SnapshotService } from './snapshotService.js';

interface ScheduleWindow {
  startsAt: Date;
  endsAt: Date;
}

export class ScheduleService {
  private timer: NodeJS.Timeout | null = null;
  private readonly stopTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly database: AppDatabase,
    private readonly cameraService: CameraService,
    private readonly recordingService: RecordingService,
    private readonly snapshotService: SnapshotService
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      this.checkDueSchedules().catch((error) => {
        this.database.addLog('error', 'schedule', 'Schedule check failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }, 30_000);
    void this.checkDueSchedules();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const timer of this.stopTimers.values()) {
      clearTimeout(timer);
    }
    this.stopTimers.clear();
  }

  listSchedules(): RecordingSchedule[] {
    return this.database.listSchedules();
  }

  createSchedule(input: RecordingScheduleInput): RecordingSchedule {
    const parsed = scheduleInputSchema.parse(input);
    this.cameraService.requireCamera(parsed.cameraId);
    const timestamp = nowIso();
    const schedule: RecordingSchedule = {
      id: randomUUID(),
      ...parsed,
      lastStartedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.database.insertSchedule(schedule);
    this.database.addLog('info', 'schedule', `Created schedule "${schedule.name}"`, {
      scheduleId: schedule.id,
      cameraId: schedule.cameraId
    });
    return schedule;
  }

  updateSchedule(scheduleId: string, input: Partial<RecordingScheduleInput>): RecordingSchedule {
    const parsed = schedulePatchSchema.parse(input);
    if (parsed.cameraId) {
      this.cameraService.requireCamera(parsed.cameraId);
    }
    const schedule = this.database.updateSchedule(scheduleId, parsed);
    this.database.addLog('info', 'schedule', `Updated schedule "${schedule.name}"`, { scheduleId });
    return schedule;
  }

  deleteSchedule(scheduleId: string): void {
    const schedule = this.database.getSchedule(scheduleId);
    this.database.deleteSchedule(scheduleId);
    this.database.addLog('info', 'schedule', `Deleted schedule "${schedule?.name ?? scheduleId}"`, {
      scheduleId
    });
  }

  async checkDueSchedules(now = new Date()): Promise<void> {
    const busyCameraIds = new Set([
      ...this.recordingService.getActiveCameraIds(),
      ...this.snapshotService.getActiveCameraIds()
    ]);
    for (const schedule of this.database.listSchedules()) {
      if (!schedule.enabled || busyCameraIds.has(schedule.cameraId)) {
        continue;
      }

      const window = this.getCurrentWindow(schedule, now);
      if (!window || now < window.startsAt || now >= window.endsAt) {
        continue;
      }

      if (schedule.lastStartedAt && Date.parse(schedule.lastStartedAt) >= window.startsAt.getTime()) {
        continue;
      }

      try {
        await this.startScheduledCapture(schedule, window.endsAt);
        this.database.markScheduleStarted(schedule.id, now.toISOString());
        this.database.addLog('info', 'schedule', `Started scheduled ${describeCapture(schedule)} "${schedule.name}"`, {
          scheduleId: schedule.id,
          cameraId: schedule.cameraId,
          mediaType: schedule.mediaType,
          endsAt: window.endsAt.toISOString()
        });
      } catch (error) {
        this.database.addLog('error', 'schedule', `Failed to start schedule "${schedule.name}"`, {
          scheduleId: schedule.id,
          cameraId: schedule.cameraId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Video schedules record for the whole window. Image schedules either shoot once at the
   * start of the window, or run an interval session that stops when the window closes.
   */
  private async startScheduledCapture(schedule: RecordingSchedule, endsAt: Date): Promise<void> {
    if (schedule.mediaType !== 'image') {
      await this.recordingService.startRecording(schedule.cameraId, 'scheduled');
      this.scheduleStop(schedule.cameraId, endsAt, 'video');
      return;
    }

    if (schedule.snapshotIntervalSeconds == null) {
      await this.snapshotService.captureSnapshot(schedule.cameraId, 'scheduled');
      return;
    }

    this.snapshotService.startSnapshotSession(
      schedule.cameraId,
      schedule.snapshotIntervalSeconds,
      'scheduled'
    );
    this.scheduleStop(schedule.cameraId, endsAt, 'image');
  }

  private scheduleStop(cameraId: string, endsAt: Date, mediaType: MediaType): void {
    const existing = this.stopTimers.get(cameraId);
    if (existing) {
      clearTimeout(existing);
    }
    const delayMs = Math.max(1000, endsAt.getTime() - Date.now());
    const timer = setTimeout(() => {
      this.stopTimers.delete(cameraId);
      try {
        if (mediaType === 'image') {
          this.snapshotService.stopSnapshotSession(cameraId);
          return;
        }
        void this.recordingService.stopRecording(cameraId).catch((error) => {
          this.logStopFailure(cameraId, mediaType, error);
        });
      } catch (error) {
        this.logStopFailure(cameraId, mediaType, error);
      }
    }, delayMs);
    this.stopTimers.set(cameraId, timer);
  }

  private logStopFailure(cameraId: string, mediaType: MediaType, error: unknown): void {
    this.database.addLog(
      'error',
      'schedule',
      `Failed to stop scheduled ${mediaType === 'image' ? 'snapshot session' : 'recording'}`,
      {
        cameraId,
        error: error instanceof Error ? error.message : String(error)
      }
    );
  }

  private getCurrentWindow(schedule: RecordingSchedule, now: Date): ScheduleWindow | null {
    const baseStart = parseScheduleDate(schedule.startTime);
    const baseEnd = parseScheduleDate(schedule.endTime);
    if (!baseStart || !baseEnd) {
      return null;
    }

    if (schedule.recurrence === 'none') {
      return normalizeWindow(baseStart, baseEnd);
    }

    if (schedule.recurrence === 'weekly' && baseStart.getDay() !== now.getDay()) {
      return null;
    }

    if (schedule.recurrence === 'weekdays' && [0, 6].includes(now.getDay())) {
      return null;
    }

    const startsAt = applyTime(now, baseStart);
    const endsAt = applyTime(now, baseEnd);
    return normalizeWindow(startsAt, endsAt);
  }
}

function describeCapture(schedule: RecordingSchedule): string {
  if (schedule.mediaType !== 'image') {
    return 'recording';
  }
  return schedule.snapshotIntervalSeconds == null ? 'snapshot' : 'snapshot session';
}

function parseScheduleDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function applyTime(day: Date, timeSource: Date): Date {
  const date = new Date(day);
  date.setHours(timeSource.getHours(), timeSource.getMinutes(), timeSource.getSeconds(), 0);
  return date;
}

function normalizeWindow(startsAt: Date, endsAt: Date): ScheduleWindow {
  const normalizedEnd = new Date(endsAt);
  if (normalizedEnd <= startsAt) {
    normalizedEnd.setDate(normalizedEnd.getDate() + 1);
  }
  return { startsAt, endsAt: normalizedEnd };
}
