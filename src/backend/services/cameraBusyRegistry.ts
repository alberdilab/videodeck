export type CameraBusyKind = 'recording' | 'snapshot';

/**
 * Most ONVIF cameras accept only one or two concurrent RTSP clients, so a recording
 * and a snapshot must never open a session against the same camera at the same time.
 * Both services claim the camera here before spawning FFmpeg.
 */
export class CameraBusyRegistry {
  private readonly busy = new Map<string, CameraBusyKind>();

  /** Claims the camera, or throws if another capture already holds it. */
  acquire(cameraId: string, kind: CameraBusyKind): void {
    const current = this.busy.get(cameraId);
    if (current) {
      throw new Error(
        current === 'recording' ? 'Camera is already recording' : 'Camera is capturing a snapshot'
      );
    }
    this.busy.set(cameraId, kind);
  }

  /** Releases the camera only if `kind` still owns it, so late events cannot free a newer claim. */
  release(cameraId: string, kind: CameraBusyKind): void {
    if (this.busy.get(cameraId) === kind) {
      this.busy.delete(cameraId);
    }
  }

  get(cameraId: string): CameraBusyKind | null {
    return this.busy.get(cameraId) ?? null;
  }

  isBusy(cameraId: string): boolean {
    return this.busy.has(cameraId);
  }
}
