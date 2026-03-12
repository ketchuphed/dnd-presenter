const { app, BrowserWindow, dialog, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let controlWindow;
let presenterWindow;
let presenterBackgroundMode = 'dark';
let presenterPageMode = 'app';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v']);

function isSupportedMedia(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
}

function isVideo(filePath) {
  return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function normalizeSharedUrl(rawUrl) {
  if (typeof rawUrl !== 'string') {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
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

async function ensurePresenterRendererPage() {
  if (!presenterWindow || presenterWindow.isDestroyed()) {
    createPresenterWindow();
    return;
  }

  if (presenterPageMode === 'app') {
    return;
  }

  await new Promise((resolve) => {
    presenterWindow.webContents.once('did-finish-load', () => {
      presenterPageMode = 'app';
      sendPresenterBackgroundMode();
      resolve();
    });

    presenterWindow.loadFile(path.join(__dirname, 'renderer', 'presenter.html'));
  });
}

function configureVideoEmbedHeaders() {
  const filter = {
    urls: ['*://*.youtube.com/*', '*://youtu.be/*', '*://*.vimeo.com/*']
  };

  const session = controlWindow?.webContents?.session || presenterWindow?.webContents?.session;
  if (!session) {
    return;
  }

  session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const nextHeaders = { ...details.requestHeaders };
    const url = String(details.url || '').toLowerCase();

    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      nextHeaders.Referer = 'https://www.youtube.com/';
    } else if (url.includes('vimeo.com')) {
      nextHeaders.Referer = 'https://vimeo.com/';
    }

    callback({ requestHeaders: nextHeaders });
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
    if (presenterPageMode !== 'external') {
      presenterPageMode = 'app';
    }
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

ipcMain.handle('websites:import-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(controlWindow, {
    title: 'Import websites from text file',
    properties: ['openFile'],
    filters: [
      { name: 'Text Files', extensions: ['txt', 'tsv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (canceled || filePaths.length === 0) {
    return { ok: false, canceled: true, sites: [] };
  }

  try {
    const content = fs.readFileSync(filePaths[0], 'utf8');
    const lines = content.split(/\r?\n/);
    const sites = [];
    let invalidCount = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const tabIndex = line.indexOf('\t');
      if (tabIndex <= 0) {
        invalidCount += 1;
        continue;
      }

      const name = line.slice(0, tabIndex).trim();
      const urlRaw = line.slice(tabIndex + 1).trim();
      const url = normalizeSharedUrl(urlRaw);
      if (!name || !url) {
        invalidCount += 1;
        continue;
      }

      sites.push({ name, url });
    }

    return {
      ok: true,
      path: filePaths[0],
      sites,
      invalidCount
    };
  } catch {
    return { ok: false, canceled: false, sites: [], message: 'Unable to read the selected file.' };
  }
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

  await ensurePresenterRendererPage();

  if (!selectedPath || !isSupportedMedia(selectedPath)) {
    return { ok: false, message: 'Unsupported media file.' };
  }

  presenterWindow.webContents.send('presenter:media', {
    path: selectedPath,
    url: pathToFileURL(selectedPath).toString(),
    type: isVideo(selectedPath) ? 'video' : 'image'
  });

  if (!presenterWindow.isVisible()) {
    if (typeof presenterWindow.showInactive === 'function') {
      presenterWindow.showInactive();
    } else {
      presenterWindow.show();
    }
  }

  return { ok: true };
});

ipcMain.handle('presenter:blackout', async () => {
  if (presenterWindow && !presenterWindow.isDestroyed()) {
    await ensurePresenterRendererPage();
    presenterWindow.webContents.send('presenter:blackout');
  }

  return { ok: true };
});

ipcMain.handle('presenter:show-webpage', async (_event, payload) => {
  if (!presenterWindow || presenterWindow.isDestroyed()) {
    createPresenterWindow();
  }

  const rawUrl = typeof payload === 'string' ? payload : payload?.url;
  const topLevel = Boolean(payload?.topLevel);
  const normalizedUrl = normalizeSharedUrl(rawUrl);
  if (!normalizedUrl) {
    return { ok: false, message: 'Please provide a valid http/https URL.' };
  }

  if (topLevel) {
    presenterPageMode = 'external';
    await presenterWindow.loadURL(normalizedUrl);
    return { ok: true, url: normalizedUrl, topLevel: true };
  }

  await ensurePresenterRendererPage();

  presenterWindow.webContents.send('presenter:webpage', {
    url: normalizedUrl
  });

  return { ok: true, url: normalizedUrl };
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

  if (presenterPageMode !== 'app') {
    return;
  }

  presenterWindow.webContents.send('presenter:video-control', payload);
});

app.whenReady().then(() => {
  createControlWindow();
  createPresenterWindow();
  configureVideoEmbedHeaders();

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
