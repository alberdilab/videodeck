import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Recording, RecordingTriggerType, SnapshotSession } from '../../shared/types.js';
import {
  SNAPSHOT_MAX_INTERVAL_SECONDS,
  SNAPSHOT_MIN_INTERVAL_SECONDS
} from '../../shared/types.js';
import type { AppDatabase } from '../storage/database.js';
import { buildRecordingPath } from '../utils/filename.js';
import { redactCredentials } from '../utils/redact.js';
import { nowIso } from '../utils/time.js';
import type { CameraBusyRegistry } from './cameraBusyRegistry.js';
import type { CameraService } from './cameraService.js';
import type { SettingsService } from './settingsService.js';
import type { PreviewController } from './streamPreviewService.js';

/** FFmpeg has to wait for a keyframe, so a snapshot is slower than it looks. */
const CAPTURE_TIMEOUT_MS = 20_000;

interface ActiveSession extends SnapshotSession {
  timer: NodeJS.Timeout;
}

export class SnapshotService {
  private readonly sessions = new Map<string, ActiveSession>();

  constructor(
    private readonly database: AppDatabase,
    private readonly cameraService: CameraService,
    private readonly settingsService: SettingsService,
    private readonly previewController: PreviewController,
    private readonly busyRegistry: CameraBusyRegistry
  ) {}

  /** Captures a single JPEG from the camera's main stream and records it like any other media. */
  async captureSnapshot(
    cameraId: string,
    triggerType: RecordingTriggerType = 'manual'
  ): Promise<Recording> {
    const camera = this.cameraService.requireCamera(cameraId);
    if (!camera.enabled) {
      throw new Error('Camera is disabled');
    }
    if (!camera.rtspMainUrl) {
      throw new Error('Camera is missing an RTSP main stream URL');
    }

    const settings = this.settingsService.getSettings();
    const startedAt = nowIso();
    const outputPath = buildRecordingPath(settings, camera, triggerType, startedAt, 'image');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    this.busyRegistry.acquire(cameraId, 'snapshot');
    // The preview holds its own RTSP session, which the camera cannot serve while capturing.
    this.previewController.suspendPreview(cameraId);

    const recording = this.database.insertRecording({
      id: randomUUID(),
      cameraId: camera.id,
      cameraName: camera.name,
      mediaType: 'image',
      outputPath,
      startedAt,
      endedAt: null,
      durationSeconds: null,
      triggerType,
      status: 'recording',
      ffmpegPid: null,
      errorMessage: null
    });

    try {
      await this.runFfmpegCapture(camera.rtspMainUrl, outputPath, camera.name, cameraId);
      const finished = this.database.updateRecording(recording.id, {
        endedAt: nowIso(),
        durationSeconds: 0,
        status: 'completed',
        ffmpegPid: null,
        errorMessage: null
      });
      this.database.addLog('info', 'recording', `Captured snapshot from "${camera.name}"`, {
        cameraId,
        outputPath,
        triggerType
      });
      return finished;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = this.database.updateRecording(recording.id, {
        endedAt: nowIso(),
        durationSeconds: 0,
        status: 'failed',
        ffmpegPid: null,
        errorMessage: message
      });
      this.database.addLog('error', 'recording', `Snapshot failed for "${camera.name}"`, {
        cameraId,
        outputPath,
        errorMessage: message
      });
      return failed;
    } finally {
      this.busyRegistry.release(cameraId, 'snapshot');
      this.previewController.resumePreview(cameraId);
    }
  }

  listSnapshotSessions(): SnapshotSession[] {
    return [...this.sessions.values()].map(({ timer: _timer, ...session }) => session);
  }

  getActiveCameraIds(): Set<string> {
    return new Set(this.sessions.keys());
  }

  /** Starts an interval capture that keeps shooting until `stopSnapshotSession` is called. */
  startSnapshotSession(
    cameraId: string,
    intervalSeconds: number,
    triggerType: RecordingTriggerType = 'manual'
  ): SnapshotSession {
    if (
      !Number.isInteger(intervalSeconds) ||
      intervalSeconds < SNAPSHOT_MIN_INTERVAL_SECONDS ||
      intervalSeconds > SNAPSHOT_MAX_INTERVAL_SECONDS
    ) {
      throw new Error(
        `Snapshot interval must be a whole number between ${SNAPSHOT_MIN_INTERVAL_SECONDS} and ${SNAPSHOT_MAX_INTERVAL_SECONDS} seconds`
      );
    }
    if (this.sessions.has(cameraId)) {
      throw new Error('Camera already has a snapshot session');
    }

    const camera = this.cameraService.requireCamera(cameraId);
    if (!camera.enabled) {
      throw new Error('Camera is disabled');
    }

    const session: ActiveSession = {
      cameraId,
      intervalSeconds,
      triggerType,
      startedAt: nowIso(),
      lastCaptureAt: null,
      captureCount: 0,
      timer: setInterval(() => this.runSessionCapture(cameraId), intervalSeconds * 1000)
    };
    this.sessions.set(cameraId, session);

    this.database.addLog('info', 'recording', `Started snapshot session for "${camera.name}"`, {
      cameraId,
      intervalSeconds,
      triggerType
    });

    // Shoot the first frame immediately so the session produces something right away.
    this.runSessionCapture(cameraId);
    return this.toSession(session);
  }

  stopSnapshotSession(cameraId: string): void {
    const session = this.sessions.get(cameraId);
    if (!session) {
      throw new Error('Camera has no snapshot session');
    }
    clearInterval(session.timer);
    this.sessions.delete(cameraId);
    this.database.addLog('info', 'recording', 'Stopped snapshot session', {
      cameraId,
      captureCount: session.captureCount
    });
  }

  shutdown(): void {
    for (const session of this.sessions.values()) {
      clearInterval(session.timer);
    }
    this.sessions.clear();
  }

  private runSessionCapture(cameraId: string): void {
    const session = this.sessions.get(cameraId);
    if (!session) {
      return;
    }
    // A recording owns the camera's only RTSP session while it runs, so skip this tick
    // instead of tearing the session down; the next one may find the camera free again.
    if (this.busyRegistry.isBusy(cameraId)) {
      this.database.addLog('debug', 'recording', 'Skipped snapshot: camera is busy', {
        cameraId,
        busyWith: this.busyRegistry.get(cameraId)
      });
      return;
    }

    this.captureSnapshot(cameraId, session.triggerType)
      .then((recording) => {
        const current = this.sessions.get(cameraId);
        // A failed capture still resolves, but it should not count as a frame.
        if (!current || current.startedAt !== session.startedAt || recording.status !== 'completed') {
          return;
        }
        current.lastCaptureAt = recording.endedAt ?? recording.startedAt;
        current.captureCount += 1;
      })
      .catch((error) => {
        this.database.addLog('error', 'recording', 'Snapshot session capture failed', {
          cameraId,
          error: error instanceof Error ? error.message : String(error)
        });
      });
  }

  private runFfmpegCapture(
    sourceUrl: string,
    outputPath: string,
    cameraName: string,
    cameraId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-rtsp_transport',
        'tcp',
        '-i',
        sourceUrl,
        '-an',
        '-frames:v',
        '1',
        '-q:v',
        '2',
        '-f',
        'image2',
        '-y',
        outputPath
      ];

      const child = spawn('ffmpeg', args, {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe']
      });

      let stderrTail = '';
      let settled = false;
      const finish = (error: Error | null): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        finish(new Error('Snapshot timed out waiting for a frame'));
      }, CAPTURE_TIMEOUT_MS);

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = redactCredentials(chunk.toString('utf8'));
        stderrTail = text.trim().slice(-500);
        if (/error|failed|invalid/i.test(text)) {
          this.database.addLog('warn', 'ffmpeg', `FFmpeg reported an issue for "${cameraName}"`, {
            cameraId,
            message: text.slice(0, 1000)
          });
        }
      });

      child.once('error', (error) => finish(error));
      child.once('close', (code) => {
        if (code === 0) {
          finish(null);
          return;
        }
        finish(new Error(stderrTail || `FFmpeg exited with code ${code ?? 'null'}`));
      });
    });
  }

  private toSession(session: ActiveSession): SnapshotSession {
    const { timer: _timer, ...rest } = session;
    return rest;
  }
}
