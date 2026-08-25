import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Recording, RecordingTriggerType } from '../../shared/types.js';
import type { AppDatabase } from '../storage/database.js';
import { buildRecordingPath } from '../utils/filename.js';
import { redactCredentials } from '../utils/redact.js';
import { nowIso, secondsBetween } from '../utils/time.js';
import type { CameraBusyRegistry } from './cameraBusyRegistry.js';
import type { CameraService } from './cameraService.js';
import type { SettingsService } from './settingsService.js';
import type { PreviewController } from './streamPreviewService.js';

interface ActiveRecording {
  recordingId: string;
  process: ChildProcess;
  stopRequested: boolean;
  clipTimeout: NodeJS.Timeout | null;
  stderrTail: string[];
}

export class RecordingService {
  private readonly activeByCameraId = new Map<string, ActiveRecording>();

  constructor(
    private readonly database: AppDatabase,
    private readonly cameraService: CameraService,
    private readonly settingsService: SettingsService,
    private readonly previewController: PreviewController,
    private readonly busyRegistry: CameraBusyRegistry
  ) {}

  listRecordings(): Recording[] {
    return this.database.listRecordings();
  }

  async startRecording(
    cameraId: string,
    triggerType: RecordingTriggerType = 'manual'
  ): Promise<Recording> {
    if (this.activeByCameraId.has(cameraId)) {
      throw new Error('Camera is already recording');
    }

    const camera = this.cameraService.requireCamera(cameraId);
    if (!camera.enabled) {
      throw new Error('Camera is disabled');
    }
    if (!camera.rtspMainUrl) {
      throw new Error('Camera is missing an RTSP main stream URL');
    }

    const settings = this.settingsService.getSettings();
    fs.mkdirSync(settings.recordingsDirectory, { recursive: true });
    const startedAt = nowIso();
    const outputPath = buildRecordingPath(settings, camera, triggerType, startedAt, 'video');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // Claim the camera so an in-flight snapshot cannot open a second RTSP session.
    this.busyRegistry.acquire(cameraId, 'recording');
    // Free the camera's preview RTSP session before opening the recording one.
    this.previewController.suspendPreview(cameraId);

    const args = [
      '-rtsp_transport',
      'tcp',
      '-i',
      camera.rtspMainUrl,
      '-c',
      'copy',
      '-y',
      outputPath
    ];

    const child = spawn('ffmpeg', args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let recording: Recording;
    try {
      recording = this.database.insertRecording({
        id: randomUUID(),
        cameraId: camera.id,
        cameraName: camera.name,
        mediaType: 'video',
        outputPath,
        startedAt,
        endedAt: null,
        durationSeconds: null,
        triggerType,
        status: 'recording',
        ffmpegPid: child.pid ?? null,
        errorMessage: null
      });
    } catch (error) {
      // Nothing tracks the process yet, so release the camera here or it stays claimed forever.
      child.kill('SIGKILL');
      this.busyRegistry.release(cameraId, 'recording');
      this.previewController.resumePreview(cameraId);
      throw error;
    }

    const active: ActiveRecording = {
      recordingId: recording.id,
      process: child,
      stopRequested: false,
      clipTimeout: null,
      stderrTail: []
    };
    this.activeByCameraId.set(cameraId, active);

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = redactCredentials(chunk.toString('utf8'));
      active.stderrTail.push(text.trim());
      active.stderrTail = active.stderrTail.slice(-8);
      if (/error|failed|invalid/i.test(text)) {
        this.database.addLog('warn', 'ffmpeg', `FFmpeg reported an issue for "${camera.name}"`, {
          cameraId,
          message: text.slice(0, 1000)
        });
      }
    });

    child.once('error', (error) => {
      this.finishRecording(cameraId, recording.id, 'failed', error.message);
    });

    child.once('close', (code, signal) => {
      const status = active.stopRequested || code === 0 ? 'completed' : 'failed';
      const message =
        status === 'failed'
          ? `FFmpeg exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`
          : null;
      this.finishRecording(cameraId, recording.id, status, message);
    });

    this.database.addLog('info', 'recording', `Started recording "${camera.name}"`, {
      cameraId,
      outputPath,
      triggerType,
      ffmpegPid: child.pid
    });
    return recording;
  }

  async stopRecording(cameraId: string): Promise<Recording> {
    const active = this.activeByCameraId.get(cameraId);
    if (!active) {
      throw new Error('Camera is not recording');
    }

    active.stopRequested = true;
    if (active.clipTimeout) {
      clearTimeout(active.clipTimeout);
      active.clipTimeout = null;
    }

    active.process.kill('SIGINT');
    const recording = this.database.getRecording(active.recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${active.recordingId}`);
    }
    return recording;
  }

  async recordClip(cameraId: string, durationSeconds: number): Promise<Recording> {
    if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
      throw new Error('Clip duration must be a positive whole number of seconds');
    }

    const recording = await this.startRecording(cameraId, 'manual');
    const active = this.activeByCameraId.get(cameraId);
    if (!active) {
      return recording;
    }

    active.clipTimeout = setTimeout(() => {
      this.stopRecording(cameraId).catch((error) => {
        this.database.addLog('error', 'recording', 'Failed to stop fixed-duration clip', {
          cameraId,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }, durationSeconds * 1000);
    return recording;
  }

  getActiveCameraIds(): Set<string> {
    return new Set(this.activeByCameraId.keys());
  }

  shutdown(): void {
    for (const [cameraId, active] of this.activeByCameraId) {
      active.stopRequested = true;
      if (active.clipTimeout) {
        clearTimeout(active.clipTimeout);
      }
      active.process.kill('SIGINT');
      this.finishRecording(cameraId, active.recordingId, 'interrupted', 'Application stopped');
    }
  }

  private finishRecording(
    cameraId: string,
    recordingId: string,
    status: 'completed' | 'failed' | 'interrupted',
    errorMessage: string | null
  ): Recording | null {
    // Only clear the slot if it still belongs to this recording: FFmpeg emits both
    // `error` and `close`, and a late event must not untrack a newer recording.
    const active = this.activeByCameraId.get(cameraId);
    const isCurrent = active?.recordingId === recordingId;
    if (active && isCurrent) {
      if (active.clipTimeout) {
        clearTimeout(active.clipTimeout);
      }
      this.activeByCameraId.delete(cameraId);
      this.busyRegistry.release(cameraId, 'recording');
      this.previewController.resumePreview(cameraId);
    }

    const current = this.database.getRecording(recordingId);
    if (!current || current.status !== 'recording') {
      return current;
    }

    const endedAt = nowIso();
    const finalError = errorMessage ?? (isCurrent ? active?.stderrTail.at(-1) : null) ?? null;
    const updated = this.database.updateRecording(recordingId, {
      endedAt,
      durationSeconds: secondsBetween(current.startedAt, endedAt),
      status,
      ffmpegPid: null,
      errorMessage: status === 'failed' || status === 'interrupted' ? finalError : null
    });

    this.database.addLog(status === 'completed' ? 'info' : 'error', 'recording', `Recording ${status}`, {
      recordingId,
      cameraId,
      outputPath: current.outputPath,
      errorMessage: updated.errorMessage
    });
    return updated;
  }
}
