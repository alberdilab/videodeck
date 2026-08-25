import path from 'node:path';
import type { AppSettings, Camera, MediaType, RecordingTriggerType } from '../../shared/types.js';

function sanitizeSegment(value: string): string {
  return value
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

export function buildRecordingPath(
  settings: AppSettings,
  camera: Camera,
  triggerType: RecordingTriggerType,
  startedAt: string,
  mediaType: MediaType = 'video'
): string {
  const ext = mediaType === 'image' ? 'jpg' : settings.preferMkv ? 'mkv' : 'mp4';
  const timestamp = startedAt.replace(/[:.]/g, '-');
  const filename = settings.filenameTemplate
    .replaceAll('{cameraName}', sanitizeSegment(camera.name))
    .replaceAll('{cameraId}', sanitizeSegment(camera.id))
    .replaceAll('{timestamp}', timestamp)
    .replaceAll('{triggerType}', triggerType)
    .replaceAll('{ext}', ext);

  const filenameWithExt = path.extname(filename) ? filename : `${filename}.${ext}`;
  return path.join(settings.recordingsDirectory, filenameWithExt);
}
