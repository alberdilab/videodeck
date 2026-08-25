import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron';
import path from 'node:path';
import type { VideoDeckApiMethod } from '../shared/api.js';
import { VideoDeckBackend } from '../backend/appBackend.js';

let mainWindow: BrowserWindow | null = null;
let backend: VideoDeckBackend | null = null;

const apiMethods = new Set<VideoDeckApiMethod>([
  'listCameras',
  'addCamera',
  'updateCamera',
  'deleteCamera',
  'testCameraConnection',
  'getPreviewUrl',
  'startRecording',
  'stopRecording',
  'recordClip',
  'captureSnapshot',
  'startSnapshotSession',
  'stopSnapshotSession',
  'listSnapshotSessions',
  'listRecordings',
  'createSchedule',
  'updateSchedule',
  'deleteSchedule',
  'listSchedules',
  'getSettings',
  'updateSettings',
  'listLogs',
  'openRecordingLocation',
  'selectRecordingsDirectory'
]);

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1120,
    minHeight: 760,
    title: 'VideoDeck',
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function registerIpc(): void {
  ipcMain.handle('videodeck:invoke', async (_event, method: VideoDeckApiMethod, ...args: unknown[]) => {
    if (!apiMethods.has(method)) {
      throw new Error(`Unknown API method: ${String(method)}`);
    }
    if (!backend) {
      throw new Error('Backend has not started');
    }

    if (method === 'openRecordingLocation') {
      const recordingId = String(args[0]);
      const recording = backend.getRecording(recordingId);
      if (!recording) {
        throw new Error(`Recording not found: ${recordingId}`);
      }
      shell.showItemInFolder(recording.outputPath);
      return undefined;
    }

    if (method === 'selectRecordingsDirectory') {
      const options: OpenDialogOptions = {
        title: 'Choose recordings folder',
        properties: ['openDirectory', 'createDirectory']
      };
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options);
      return result.canceled ? null : result.filePaths[0];
    }

    const handler = backend[method] as unknown as (...handlerArgs: unknown[]) => Promise<unknown>;
    if (typeof handler !== 'function') {
      throw new Error(`API method is not callable: ${String(method)}`);
    }
    return handler.apply(backend, args);
  });
}

app.whenReady().then(async () => {
  backend = new VideoDeckBackend(app.getPath('userData'));
  await backend.start();
  registerIpc();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  backend?.shutdown();
  backend = null;
});
