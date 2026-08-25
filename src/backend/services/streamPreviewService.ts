import { spawn, type ChildProcess } from 'node:child_process';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { Camera } from '../../shared/types.js';
import type { AppDatabase } from '../storage/database.js';
import { redactCredentials } from '../utils/redact.js';

export interface StreamPreviewService {
  getPreviewUrl(camera: Camera): Promise<string | null>;
}

/**
 * Lets the recording service release a camera's preview session while it records,
 * because most ONVIF cameras only accept one or two concurrent RTSP clients.
 */
export interface PreviewController {
  suspendPreview(cameraId: string): void;
  resumePreview(cameraId: string): void;
}

const FRAME_BOUNDARY = 'videodeckframe';
const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);
const IDLE_TIMEOUT_MS = 15_000;

interface ActivePreview {
  process: ChildProcess;
  clients: Set<ServerResponse>;
  frameBuffer: Buffer;
  idleTimer: NodeJS.Timeout | null;
}

export class MjpegStreamPreviewService implements StreamPreviewService, PreviewController {
  private readonly active = new Map<string, ActivePreview>();
  private readonly suspended = new Set<string>();
  private readonly server: http.Server;
  private readyPromise: Promise<string> | null = null;

  constructor(private readonly database: AppDatabase) {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  start(): Promise<string> {
    if (!this.readyPromise) {
      this.readyPromise = new Promise((resolve, reject) => {
        this.server.once('error', reject);
        this.server.listen(0, '127.0.0.1', () => {
          const address = this.server.address();
          if (!address || typeof address === 'string') {
            reject(new Error('Failed to determine stream preview server address'));
            return;
          }
          resolve(`http://127.0.0.1:${address.port}`);
        });
      });
    }
    return this.readyPromise;
  }

  async getPreviewUrl(camera: Camera): Promise<string | null> {
    if (!camera.enabled || this.suspended.has(camera.id)) {
      return null;
    }
    const sourceUrl = camera.rtspSubUrl || camera.rtspMainUrl;
    if (!sourceUrl) {
      return null;
    }
    const baseUrl = await this.start();
    return `${baseUrl}/preview/${camera.id}`;
  }

  suspendPreview(cameraId: string): void {
    this.suspended.add(cameraId);
    const preview = this.active.get(cameraId);
    if (preview) {
      this.stopPreview(cameraId, preview);
    }
  }

  resumePreview(cameraId: string): void {
    this.suspended.delete(cameraId);
  }

  shutdown(): void {
    for (const [cameraId, preview] of this.active) {
      this.stopPreview(cameraId, preview);
    }
    this.server.close();
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const match = /^\/preview\/([^/]+)$/.exec(url.pathname);
    if (!match) {
      res.writeHead(404).end();
      return;
    }

    const cameraId = match[1];
    const camera = this.database.getCamera(cameraId);
    const sourceUrl = camera ? camera.rtspSubUrl || camera.rtspMainUrl : null;
    if (!camera || !camera.enabled || !sourceUrl) {
      res.writeHead(404).end();
      return;
    }
    if (this.suspended.has(cameraId)) {
      res.writeHead(503).end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': `multipart/x-mixed-replace; boundary=${FRAME_BOUNDARY}`,
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      Pragma: 'no-cache'
    });

    const preview = this.ensurePreview(camera, sourceUrl);
    preview.clients.add(res);
    if (preview.idleTimer) {
      clearTimeout(preview.idleTimer);
      preview.idleTimer = null;
    }

    res.on('close', () => {
      preview.clients.delete(res);
      this.scheduleIdleShutdown(cameraId, preview);
    });
  }

  private ensurePreview(camera: Camera, sourceUrl: string): ActivePreview {
    const existing = this.active.get(camera.id);
    if (existing) {
      return existing;
    }

    const args = [
      '-rtsp_transport',
      'tcp',
      '-i',
      sourceUrl,
      '-an',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      '-q:v',
      '6',
      '-r',
      '8',
      '-vf',
      'scale=480:-2',
      'pipe:1'
    ];

    const child = spawn('ffmpeg', args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const preview: ActivePreview = {
      process: child,
      clients: new Set(),
      frameBuffer: Buffer.alloc(0),
      idleTimer: null
    };
    this.active.set(camera.id, preview);

    child.stdout?.on('data', (chunk: Buffer) => {
      this.handleFrameData(preview, chunk);
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = redactCredentials(chunk.toString('utf8'));
      if (/error|failed|invalid/i.test(text)) {
        this.database.addLog('warn', 'ffmpeg', `Preview stream issue for "${camera.name}"`, {
          cameraId: camera.id,
          message: text.trim().slice(0, 1000)
        });
      }
    });

    const onExit = (): void => {
      this.endClients(preview);
      this.active.delete(camera.id);
    };
    child.once('error', (error) => {
      this.database.addLog('warn', 'ffmpeg', `Preview stream failed to start for "${camera.name}"`, {
        cameraId: camera.id,
        error: error.message
      });
      onExit();
    });
    child.once('close', onExit);

    this.database.addLog('info', 'system', `Started live preview for "${camera.name}"`, {
      cameraId: camera.id,
      source: redactCredentials(sourceUrl)
    });

    return preview;
  }

  private handleFrameData(preview: ActivePreview, chunk: Buffer): void {
    preview.frameBuffer = Buffer.concat([preview.frameBuffer, chunk]);

    for (;;) {
      const start = preview.frameBuffer.indexOf(JPEG_SOI);
      if (start === -1) {
        preview.frameBuffer = Buffer.alloc(0);
        return;
      }
      const end = preview.frameBuffer.indexOf(JPEG_EOI, start + JPEG_SOI.length);
      if (end === -1) {
        if (start > 0) {
          preview.frameBuffer = preview.frameBuffer.subarray(start);
        }
        return;
      }

      const frameEnd = end + JPEG_EOI.length;
      const frame = preview.frameBuffer.subarray(start, frameEnd);
      preview.frameBuffer = preview.frameBuffer.subarray(frameEnd);
      this.broadcastFrame(preview, frame);
    }
  }

  private broadcastFrame(preview: ActivePreview, frame: Buffer): void {
    const head = Buffer.from(
      `--${FRAME_BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
    );
    const tail = Buffer.from('\r\n');
    for (const client of preview.clients) {
      client.write(head);
      client.write(frame);
      client.write(tail);
    }
  }

  private scheduleIdleShutdown(cameraId: string, preview: ActivePreview): void {
    if (preview.clients.size > 0 || preview.idleTimer) {
      return;
    }
    preview.idleTimer = setTimeout(() => {
      this.stopPreview(cameraId, preview);
    }, IDLE_TIMEOUT_MS);
  }

  private stopPreview(cameraId: string, preview: ActivePreview): void {
    if (preview.idleTimer) {
      clearTimeout(preview.idleTimer);
      preview.idleTimer = null;
    }
    this.endClients(preview);
    preview.process.kill('SIGINT');
    this.active.delete(cameraId);
  }

  private endClients(preview: ActivePreview): void {
    for (const client of preview.clients) {
      client.end();
    }
    preview.clients.clear();
  }
}
