import { randomUUID } from 'node:crypto';
import net from 'node:net';
import type { Camera, CameraInput, TestCameraConnectionResult } from '../../shared/types.js';
import { cameraInputSchema, cameraPatchSchema } from '../../shared/validation.js';
import type { AppDatabase } from '../storage/database.js';
import { nowIso } from '../utils/time.js';
import { redactCredentials } from '../utils/redact.js';

export class CameraService {
  constructor(private readonly database: AppDatabase) {}

  listCameras(): Camera[] {
    return this.database.listCameras();
  }

  addCamera(input: CameraInput): Camera {
    const parsed = cameraInputSchema.parse(input);
    const timestamp = nowIso();
    const camera: Camera = {
      id: randomUUID(),
      ...parsed,
      connectionStatus: 'unknown',
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.database.insertCamera(camera);
    this.database.addLog('info', 'camera', `Added camera "${camera.name}"`, {
      host: camera.host,
      rtspMainUrl: redactCredentials(camera.rtspMainUrl)
    });
    return camera;
  }

  updateCamera(cameraId: string, input: Partial<CameraInput>): Camera {
    const parsed = cameraPatchSchema.parse(input);
    const camera = this.database.updateCamera(cameraId, parsed);
    this.database.addLog('info', 'camera', `Updated camera "${camera.name}"`, { cameraId });
    return camera;
  }

  deleteCamera(cameraId: string): void {
    const camera = this.requireCamera(cameraId);
    this.database.deleteCamera(cameraId);
    this.database.addLog('info', 'camera', `Deleted camera "${camera.name}"`, { cameraId });
  }

  async testCameraConnection(cameraId: string): Promise<TestCameraConnectionResult> {
    const camera = this.requireCamera(cameraId);
    this.database.setCameraConnectionStatus(cameraId, 'testing');

    const endpoint = this.resolveTestEndpoint(camera);
    try {
      await this.testTcp(endpoint.host, endpoint.port, 3000);
      this.database.setCameraConnectionStatus(cameraId, 'online');
      this.database.addLog('info', 'camera', `Camera "${camera.name}" is reachable`, endpoint);
      return { ok: true, message: `Connected to ${endpoint.host}:${endpoint.port}` };
    } catch (error) {
      this.database.setCameraConnectionStatus(cameraId, 'offline');
      const message = error instanceof Error ? error.message : 'Connection test failed';
      this.database.addLog('warn', 'camera', `Camera "${camera.name}" is unreachable`, {
        ...endpoint,
        error: message
      });
      return { ok: false, message };
    }
  }

  requireCamera(cameraId: string): Camera {
    const camera = this.database.getCamera(cameraId);
    if (!camera) {
      throw new Error(`Camera not found: ${cameraId}`);
    }
    return camera;
  }

  private resolveTestEndpoint(camera: Camera): { host: string; port: number } {
    try {
      const url = new URL(camera.rtspMainUrl);
      return { host: url.hostname, port: Number(url.port || 554) };
    } catch {
      return { host: camera.host, port: camera.onvifPort };
    }
  }

  private testTcp(host: string, port: number, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const cleanup = (): void => {
        socket.removeAllListeners();
        socket.destroy();
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => {
        cleanup();
        resolve();
      });
      socket.once('timeout', () => {
        cleanup();
        reject(new Error(`Timed out connecting to ${host}:${port}`));
      });
      socket.once('error', (error) => {
        cleanup();
        reject(error);
      });
      socket.connect(port, host);
    });
  }
}
