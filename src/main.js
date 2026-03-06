const { app, BrowserWindow, dialog, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let controlWindow;
let presenterWindow;
let presenterBackgroundMode = 'dark';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v']);

function isSupportedMedia(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
}

function isVideo(filePath) {
  return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function walkDirectory(rootPath, currentPath, collector) {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      walkDirectory(rootPath, fullPath, collector);
      continue;
    }

    if (entry.isFile() && isSupportedMedia(fullPath)) {
      collector.push({
        path: fullPath,
        displayPath: path.join(path.basename(rootPath), path.relative(rootPath, fullPath))
      });
    }
  }
}

function uniqueSorted(items) {
  const uniqueByPath = new Map();
  for (const item of items) {
    uniqueByPath.set(item.path, item);
  }

  return Array.from(uniqueByPath.values()).sort((a, b) => a.displayPath.localeCompare(b.displayPath));
}

function notifyControlPresenterState() {
  if (!controlWindow || controlWindow.isDestroyed()) {
    return;
  }

  controlWindow.webContents.send('presenter:state', {
    connected: Boolean(presenterWindow && !presenterWindow.isDestroyed())
  });
}

function getPresenterBackgroundColor() {
  return presenterBackgroundMode === 'light' ? '#f5f5f5' : '#000000';
}

function sendPresenterBackgroundMode() {
  if (!presenterWindow || presenterWindow.isDestroyed()) {
    return;
  }

  presenterWindow.webContents.send('presenter:background-mode', {
    mode: presenterBackgroundMode
  });
}

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    title: 'DnD Presenter - Control',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  controlWindow.loadFile(path.join(__dirname, 'renderer', 'control.html'));
  controlWindow.webContents.on('did-finish-load', () => {
    notifyControlPresenterState();
  });

  controlWindow.on('closed', () => {
    controlWindow = null;
    if (presenterWindow && !presenterWindow.isDestroyed()) {
      presenterWindow.close();
    }
  });
}

function createPresenterWindow() {
  const displays = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  const secondaryDisplay = displays.find((display) => display.id !== primaryId) || screen.getPrimaryDisplay();
  const { x, y, width, height } = secondaryDisplay.bounds;

  presenterWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    title: 'DnD Presenter - Display',
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: getPresenterBackgroundColor(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const currentPresenterWindow = presenterWindow;

  currentPresenterWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && !currentPresenterWindow.isDestroyed() && currentPresenterWindow.isFullScreen()) {
      currentPresenterWindow.setFullScreen(false);
      event.preventDefault();
    }
  });

  currentPresenterWindow.loadFile(path.join(__dirname, 'renderer', 'presenter.html'));
  currentPresenterWindow.webContents.on('did-finish-load', () => {
    notifyControlPresenterState();
    sendPresenterBackgroundMode();
  });

  currentPresenterWindow.on('closed', () => {
    if (presenterWindow === currentPresenterWindow) {
      presenterWindow = null;
    }
    notifyControlPresenterState();
  });

  notifyControlPresenterState();
}

function collectMediaFromSources(sourcePaths) {
  const mediaFiles = [];

  for (const selectedPath of sourcePaths) {
    if (!selectedPath || !fs.existsSync(selectedPath)) {
      continue;
    }

    const stat = fs.statSync(selectedPath);
    if (stat.isDirectory()) {
      walkDirectory(selectedPath, selectedPath, mediaFiles);
      continue;
    }

    if (stat.isFile() && isSupportedMedia(selectedPath)) {
      mediaFiles.push({
        path: selectedPath,
        displayPath: path.join(path.basename(path.dirname(selectedPath)), path.basename(selectedPath))
      });
    }
  }

  return uniqueSorted(mediaFiles).map((mediaFile) => ({
    name: path.basename(mediaFile.path),
    path: mediaFile.path,
    displayPath: mediaFile.displayPath,
    type: isVideo(mediaFile.path) ? 'video' : 'image'
  }));
}

ipcMain.handle('media:pick', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(controlWindow, {
    title: 'Choose image and video files',
    properties: ['openFile', 'openDirectory', 'multiSelections'],
    filters: [
      { name: 'Media', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (canceled || filePaths.length === 0) {
    return { sources: [], items: [] };
  }

  return {
    sources: filePaths,
    items: collectMediaFromSources(filePaths)
  };
});

ipcMain.handle('media:load-sources', async (_event, sourcePaths = []) => {
  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) {
    return [];
  }

  return collectMediaFromSources(sourcePaths);
});

ipcMain.handle('default-image:pick', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(controlWindow, {
    title: 'Choose default image',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'] }
    ]
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  return filePaths[0];
});

ipcMain.handle('presenter:show', async (_event, selectedPath) => {
  if (!presenterWindow || presenterWindow.isDestroyed()) {
    createPresenterWindow();
  }

  if (!selectedPath || !isSupportedMedia(selectedPath)) {
    return { ok: false, message: 'Unsupported media file.' };
  }

  presenterWindow.webContents.send('presenter:media', {
    path: selectedPath,
    url: pathToFileURL(selectedPath).toString(),
    type: isVideo(selectedPath) ? 'video' : 'image'
  });

  if (!presenterWindow.isVisible()) {
    presenterWindow.show();
  }
  presenterWindow.focus();
  return { ok: true };
});

ipcMain.handle('presenter:blackout', async () => {
  if (presenterWindow && !presenterWindow.isDestroyed()) {
    presenterWindow.webContents.send('presenter:blackout');
  }

  return { ok: true };
});

ipcMain.handle('presenter:enter-fullscreen', async () => {
  if (!presenterWindow || presenterWindow.isDestroyed()) {
    createPresenterWindow();
  }

  presenterWindow.setFullScreen(true);
  if (!presenterWindow.isVisible()) {
    presenterWindow.show();
  }
  presenterWindow.focus();
  return { ok: true };
});

ipcMain.handle('presenter:reopen', async () => {
  if (presenterWindow && !presenterWindow.isDestroyed()) {
    presenterWindow.close();
  }

  createPresenterWindow();
  return { ok: true };
});

ipcMain.handle('presenter:get-state', async () => {
  return {
    connected: Boolean(presenterWindow && !presenterWindow.isDestroyed())
  };
});

ipcMain.handle('presenter:set-background', async (_event, payload = {}) => {
  presenterBackgroundMode = payload?.light ? 'light' : 'dark';

  if (presenterWindow && !presenterWindow.isDestroyed()) {
    presenterWindow.setBackgroundColor(getPresenterBackgroundColor());
    sendPresenterBackgroundMode();
  }

  return {
    ok: true,
    mode: presenterBackgroundMode
  };
});

ipcMain.on('presenter:video-control', (_event, payload) => {
  if (!presenterWindow || presenterWindow.isDestroyed()) {
    return;
  }

  presenterWindow.webContents.send('presenter:video-control', payload);
});

app.whenReady().then(() => {
  createControlWindow();
  createPresenterWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow();
      createPresenterWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
