import { z } from 'zod';
import { SNAPSHOT_MAX_INTERVAL_SECONDS, SNAPSHOT_MIN_INTERVAL_SECONDS } from './types.js';

export const cameraInputSchema = z.object({
  name: z.string().trim().min(1),
  host: z.string().trim().min(1),
  onvifPort: z.coerce.number().int().positive().max(65535),
  cameraModel: z.string().nullable(),
  rtspMainUrl: z.string().trim().min(1),
  rtspSubUrl: z.string().trim(),
  username: z.string().trim(),
  password: z.string(),
  enabled: z.boolean()
});

export const cameraPatchSchema = cameraInputSchema.partial();

export const snapshotIntervalSchema = z.coerce
  .number()
  .int()
  .min(SNAPSHOT_MIN_INTERVAL_SECONDS)
  .max(SNAPSHOT_MAX_INTERVAL_SECONDS);

export const scheduleInputSchema = z.object({
  cameraId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  mediaType: z.enum(['video', 'image']).default('video'),
  snapshotIntervalSeconds: snapshotIntervalSchema.nullable().default(null),
  startTime: z.string().trim().min(1),
  endTime: z.string().trim().min(1),
  recurrence: z.enum(['none', 'daily', 'weekly', 'weekdays']),
  enabled: z.boolean()
});

export const schedulePatchSchema = scheduleInputSchema.partial();

export const settingsInputSchema = z.object({
  recordingsDirectory: z.string().trim().min(1).optional(),
  defaultClipDurationSeconds: z.coerce.number().int().positive().max(24 * 60 * 60).optional(),
  filenameTemplate: z.string().trim().min(1).optional(),
  retentionDays: z.coerce.number().int().positive().nullable().optional(),
  preferMkv: z.boolean().optional()
});
