import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings, AppSettingsInput } from '../../shared/types.js';
import { settingsInputSchema } from '../../shared/validation.js';
import type { AppDatabase } from '../storage/database.js';

export class SettingsService {
  constructor(
    private readonly database: AppDatabase,
    private readonly userDataPath: string
  ) {}

  getSettings(): AppSettings {
    const settings = this.database.getSettings(this.defaultSettings());
    fs.mkdirSync(settings.recordingsDirectory, { recursive: true });
    return settings;
  }

  updateSettings(input: AppSettingsInput): AppSettings {
    const parsed = settingsInputSchema.parse(input);
    const settings = { ...this.getSettings(), ...parsed };
    fs.mkdirSync(settings.recordingsDirectory, { recursive: true });
    return this.database.updateSettings(settings);
  }

  private defaultSettings(): AppSettings {
    return {
      recordingsDirectory: path.join(this.userDataPath, 'recordings'),
      defaultClipDurationSeconds: 30,
      filenameTemplate: '{timestamp}_{cameraName}_{triggerType}.{ext}',
      retentionDays: null,
      preferMkv: true
    };
  }
}
