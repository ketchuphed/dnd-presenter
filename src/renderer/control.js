const mediaTreeElement = document.getElementById('mediaTree');
const pickBtn = document.getElementById('pickBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const contentElement = document.querySelector('.content');
const panelResizer = document.getElementById('panelResizer');
const thumbSizeInput = document.getElementById('thumbSize');
const lockControlsBtn = document.getElementById('lockControlsBtn');
const defaultImageBtn = document.getElementById('defaultImageBtn');
const clearDefaultBtn = document.getElementById('clearDefaultBtn');
const defaultImageStatus = document.getElementById('defaultImageStatus');
const presenterStatusElement = document.getElementById('presenterStatus');
const presenterReconnectElement = document.getElementById('presenterReconnect');
const reopenPresenterBtn = document.getElementById('reopenPresenterBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const lightBgBtn = document.getElementById('lightBgBtn');
const blackoutBtn = document.getElementById('blackoutBtn');
const previewElement = document.getElementById('preview');
const activeFileNameElement = document.getElementById('activeFileName');
const expandAllBtn = document.getElementById('expandAllBtn');
const collapseAllBtn = document.getElementById('collapseAllBtn');
const THUMB_SIZE_STORAGE_KEY = 'dndPresenter.thumbSize';
const SOURCE_PATHS_STORAGE_KEY = 'dndPresenter.sourcePaths';
const DEFAULT_IMAGE_STORAGE_KEY = 'dndPresenter.defaultImagePath';
const EXPLORER_WIDTH_STORAGE_KEY = 'dndPresenter.explorerWidth';
const PRESENTER_LIGHT_BG_STORAGE_KEY = 'dndPresenter.presenterLightBg';

let mediaItems = [];
let selectedPath = null;
let sourcePaths = [];
let defaultImagePath = null;
let presenterBlackedOut = false;
let presenterConnected = true;
let controlsLocked = false;
let presenterLightBackground = false;
const imagePreloadCache = new Map();

function toMediaUrl(mediaPath) {
  return `file:///${mediaPath.replace(/\\/g, '/')}`;
}

function getItemFileName(item) {
  if (item?.name) {
    return item.name;
  }

  if (item?.path) {
    const segments = item.path.split(/[\\/]/);
    return segments[segments.length - 1] || '';
  }

  return '';
}

function updateActiveFileName(item) {
  const fileName = getItemFileName(item);
  activeFileNameElement.textContent = fileName ? `Active file: ${fileName}` : 'Active file: none.';
}

function createFolderNode(name = '') {
  return {
    name,
    folders: new Map(),
    files: []
  };
}

function getMediaIndex(mediaPath) {
  return mediaItems.findIndex((entry) => entry.path === mediaPath);
}

function preloadImage(mediaItem) {
  if (!mediaItem || mediaItem.type !== 'image' || imagePreloadCache.has(mediaItem.path)) {
    return;
  }

  const image = new Image();
  image.src = toMediaUrl(mediaItem.path);
  imagePreloadCache.set(mediaItem.path, image);
}

function preloadAroundSelection(mediaPath) {
  const index = getMediaIndex(mediaPath);
  if (index < 0) {
    return;
  }

  for (let offset = -2; offset <= 2; offset += 1) {
    const targetItem = mediaItems[index + offset];
    preloadImage(targetItem);
  }
}

function canUseControls() {
  return !controlsLocked;
}

function updateLockButtonState() {
  lockControlsBtn.textContent = `Lock Controls: ${controlsLocked ? 'On' : 'Off'}`;
  lockControlsBtn.classList.toggle('button-locked', controlsLocked);
}

function updateLightBgButtonState() {
  lightBgBtn.textContent = `Light BG: ${presenterLightBackground ? 'On' : 'Off'}`;
  lightBgBtn.classList.toggle('button-active', presenterLightBackground);
}

async function applyPresenterBackgroundMode() {
  try {
    await window.presenterApi.setPresenterBackground({ light: presenterLightBackground });
  } catch {
    // Keep UI state and retry on next interaction if presenter is not ready yet.
  }
}

function setControlsLocked(locked) {
  controlsLocked = locked;
  updateLockButtonState();
}

function applyControlLockState() {
  const disable = controlsLocked;
  pickBtn.disabled = disable;
  prevBtn.disabled = disable;
  nextBtn.disabled = disable;
  thumbSizeInput.disabled = disable;
  defaultImageBtn.disabled = disable;
  clearDefaultBtn.disabled = disable;
  fullscreenBtn.disabled = disable;
  lightBgBtn.disabled = disable;
  blackoutBtn.disabled = disable;
  expandAllBtn.disabled = disable;
  collapseAllBtn.disabled = disable;
  panelResizer.style.pointerEvents = disable ? 'none' : 'auto';
  mediaTreeElement.classList.toggle('controls-locked', disable);
}

function setAllFoldersExpanded(expanded) {
  const folderNodes = mediaTreeElement.querySelectorAll('details.folder-node');
  for (const folder of folderNodes) {
    folder.open = expanded;
  }
}

function clampExplorerWidth(width) {
  const minWidth = 260;
  const maxWidth = Math.max(minWidth, window.innerWidth - 360);
  return Math.min(maxWidth, Math.max(minWidth, width));
}

function setExplorerWidth(width, persist = true) {
  const clampedWidth = clampExplorerWidth(width);
  contentElement.style.setProperty('--explorer-width', `${clampedWidth}px`);

  if (persist) {
    localStorage.setItem(EXPLORER_WIDTH_STORAGE_KEY, String(Math.round(clampedWidth)));
  }
}

function initializeExplorerResizer() {
  let dragging = false;

  panelResizer.addEventListener('pointerdown', (event) => {
    if (!canUseControls()) {
      return;
    }

    dragging = true;
    panelResizer.classList.add('dragging');
    panelResizer.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  panelResizer.addEventListener('pointermove', (event) => {
    if (!dragging) {
      return;
    }

    const contentBounds = contentElement.getBoundingClientRect();
    const targetWidth = event.clientX - contentBounds.left;
    setExplorerWidth(targetWidth);
  });

  const stopDragging = () => {
    dragging = false;
    panelResizer.classList.remove('dragging');
  };

  panelResizer.addEventListener('pointerup', stopDragging);
  panelResizer.addEventListener('pointercancel', stopDragging);

  const storedWidth = Number(localStorage.getItem(EXPLORER_WIDTH_STORAGE_KEY));
  if (Number.isFinite(storedWidth) && storedWidth > 0) {
    setExplorerWidth(storedWidth, false);
  } else {
    setExplorerWidth(380, false);
  }

  window.addEventListener('resize', () => {
    const currentWidth = Number.parseFloat(getComputedStyle(contentElement).getPropertyValue('--explorer-width')) || 380;
    setExplorerWidth(currentWidth, false);
  });
}

function updatePresenterReconnectState() {
  presenterReconnectElement.classList.toggle('hidden', presenterConnected);
}

async function refreshPresenterConnectionState() {
  try {
    const state = await window.presenterApi.getPresenterState();
    presenterConnected = Boolean(state?.connected);
    updatePresenterReconnectState();
  } catch {
    // Keep last known state on transient IPC/startup timing failures.
  }
}

function buildMediaTree(items) {
  const root = createFolderNode();

  for (const item of items) {
    const normalizedPath = (item.displayPath || item.name).replace(/\\/g, '/');
    const segments = normalizedPath.split('/').filter(Boolean);
    const fileName = segments.pop();

    let cursor = root;
    for (const folderName of segments) {
      if (!cursor.folders.has(folderName)) {
        cursor.folders.set(folderName, createFolderNode(folderName));
      }
      cursor = cursor.folders.get(folderName);
    }

    if (fileName) {
      cursor.files.push(item);
    }
  }

  return root;
}

function createMediaTile(item) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `media-list-item${item.path === selectedPath ? ' active' : ''}`;
  button.title = item.displayPath || item.name;
  button.dataset.path = item.path;

  if (item.type === 'video') {
    const videoThumb = document.createElement('video');
    videoThumb.className = 'thumb-media';
    videoThumb.src = toMediaUrl(item.path);
    videoThumb.muted = true;
    videoThumb.loop = false;
    videoThumb.playsInline = true;
    videoThumb.autoplay = false;
    videoThumb.preload = 'metadata';
    videoThumb.addEventListener('loadedmetadata', () => {
      videoThumb.pause();

      const targetTime = Math.min(5, Math.max(0, (videoThumb.duration || 0) - 0.1));
      if (targetTime > 0) {
        videoThumb.currentTime = targetTime;
      } else {
        videoThumb.currentTime = 0;
      }
    });
    videoThumb.addEventListener('seeked', () => {
      videoThumb.pause();
    });
    button.appendChild(videoThumb);
  } else {
    const imageThumb = document.createElement('img');
    imageThumb.className = 'thumb-media';
    imageThumb.src = toMediaUrl(item.path);
    imageThumb.alt = item.name;
    button.appendChild(imageThumb);
  }

  const fileNameOverlay = document.createElement('div');
  fileNameOverlay.className = 'thumb-name';
  fileNameOverlay.textContent = getItemFileName(item);
  button.appendChild(fileNameOverlay);

  button.addEventListener('click', async () => {
    if (!canUseControls()) {
      return;
    }

    await showItem(item);
  });

  return button;
}

function updateActiveSelection() {
  const mediaButtons = mediaTreeElement.querySelectorAll('.media-list-item');
  for (const mediaButton of mediaButtons) {
    mediaButton.classList.toggle('active', mediaButton.dataset.path === selectedPath);
  }
}

function getCurrentPreviewVideo() {
  return previewElement.querySelector('video');
}

async function showItem(item) {
  selectedPath = item.path;
  updateActiveSelection();
  renderPreview(item);
  await window.presenterApi.showMedia(item.path);
  presenterBlackedOut = false;
  updatePresenterStatus();
  preloadAroundSelection(item.path);
}

async function navigateSelection(direction) {
  if (!canUseControls() || mediaItems.length === 0) {
    return;
  }

  const currentIndex = getMediaIndex(selectedPath);
  const startIndex = currentIndex >= 0 ? currentIndex : (direction > 0 ? -1 : mediaItems.length);
  const nextIndex = Math.min(mediaItems.length - 1, Math.max(0, startIndex + direction));

  if (nextIndex === currentIndex || !mediaItems[nextIndex]) {
    return;
  }

  await showItem(mediaItems[nextIndex]);
}

function updateDefaultImageStatus(message) {
  if (message) {
    defaultImageStatus.textContent = message;
    return;
  }

  if (defaultImagePath) {
    defaultImageStatus.textContent = `Default image: ${defaultImagePath}`;
    return;
  }

  defaultImageStatus.textContent = 'Default image: none (Blackout Screen will show blank).';
}

function updatePresenterStatus() {
  if (presenterBlackedOut) {
    presenterStatusElement.textContent = 'Presenter: Blacked Out';
    presenterStatusElement.classList.add('blacked-out');
    return;
  }

  presenterStatusElement.textContent = 'Presenter: Live Media';
  presenterStatusElement.classList.remove('blacked-out');
}

async function applyStartupPresenterState() {
  presenterBlackedOut = true;
  updatePresenterStatus();

  if (defaultImagePath) {
    const result = await window.presenterApi.showMedia(defaultImagePath);
    if (result?.ok) {
      return;
    }
  }

  await window.presenterApi.blackout();
}

function renderFolderNode(node, depth) {
  const section = document.createElement('section');
  section.className = 'folder-section';

  let contentTarget = section;
  if (depth > 0) {
    const details = document.createElement('details');
    details.className = 'folder-node';
    details.open = false;

    const summary = document.createElement('summary');
    summary.className = 'folder-label';
    summary.textContent = node.name;

    details.appendChild(summary);
    section.appendChild(details);
    contentTarget = details;
  }

  const childFolders = Array.from(node.folders.values()).sort((a, b) => a.name.localeCompare(b.name));
  for (const child of childFolders) {
    contentTarget.appendChild(renderFolderNode(child, depth + 1));
  }

  if (node.files.length > 0) {
    const thumbGrid = document.createElement('div');
    thumbGrid.className = 'media-list';
    const sortedFiles = [...node.files].sort((a, b) => (a.displayPath || a.name).localeCompare(b.displayPath || b.name));
    for (const item of sortedFiles) {
      thumbGrid.appendChild(createMediaTile(item));
    }
    contentTarget.appendChild(thumbGrid);
  }

  return section;
}

function clearPreview() {
  previewElement.className = 'preview-empty';
  previewElement.textContent = 'No media selected yet.';
  updateActiveFileName(null);
}

function bindPreviewVideoSync(videoElement, mediaPath) {
  const sendControl = (payload) => {
    window.presenterApi.sendVideoControl({
      path: mediaPath,
      ...payload
    });
  };

  videoElement.addEventListener('play', () => {
    sendControl({ action: 'play' });
  });

  videoElement.addEventListener('pause', () => {
    sendControl({ action: 'pause' });
  });

  videoElement.addEventListener('seeked', () => {
    sendControl({ action: 'seek', currentTime: videoElement.currentTime });
  });

  videoElement.addEventListener('ratechange', () => {
    sendControl({ action: 'rate', playbackRate: videoElement.playbackRate });
  });
}

function renderPreview(item) {
  previewElement.className = '';
  previewElement.textContent = '';
  updateActiveFileName(item);

  if (item.type === 'video') {
    const video = document.createElement('video');
    video.className = 'preview-media';
    video.src = toMediaUrl(item.path);
    video.controls = true;
    video.autoplay = true;
    video.loop = true;
    video.defaultMuted = false;
    video.muted = false;
    video.volume = 1;
    bindPreviewVideoSync(video, item.path);
    previewElement.appendChild(video);
    return;
  }

  const image = document.createElement('img');
  image.className = 'preview-media';
  image.src = toMediaUrl(item.path);
  image.alt = item.name;
  previewElement.appendChild(image);
}

function renderList() {
  mediaTreeElement.innerHTML = '';

  if (mediaItems.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'No media added yet.';
    mediaTreeElement.appendChild(empty);
    clearPreview();
    return;
  }

  const tree = buildMediaTree(mediaItems);
  mediaTreeElement.appendChild(renderFolderNode(tree, 0));

  const selectedItem = mediaItems.find((entry) => entry.path === selectedPath);
  if (selectedItem) {
    renderPreview(selectedItem);
  } else {
    selectedPath = null;
    clearPreview();
  }

  updateActiveSelection();
}

pickBtn.addEventListener('click', async () => {
  if (!canUseControls()) {
    return;
  }

  const picked = await window.presenterApi.pickMedia();
  if (!picked || !Array.isArray(picked.items) || picked.items.length === 0) {
    return;
  }

  sourcePaths = Array.isArray(picked.sources) ? picked.sources : [];
  localStorage.setItem(SOURCE_PATHS_STORAGE_KEY, JSON.stringify(sourcePaths));
  mediaItems = picked.items;
  selectedPath = null;
  imagePreloadCache.clear();

  renderList();
});

defaultImageBtn.addEventListener('click', () => {
  if (!canUseControls()) {
    return;
  }

  const selectedItem = mediaItems.find((entry) => entry.path === selectedPath);
  if (!selectedItem || selectedItem.type !== 'image') {
    updateDefaultImageStatus('Default image: select an image first.');
    return;
  }

  defaultImagePath = selectedItem.path;
  localStorage.setItem(DEFAULT_IMAGE_STORAGE_KEY, defaultImagePath);
  updateDefaultImageStatus();
});

clearDefaultBtn.addEventListener('click', () => {
  if (!canUseControls()) {
    return;
  }

  defaultImagePath = null;
  localStorage.removeItem(DEFAULT_IMAGE_STORAGE_KEY);
  updateDefaultImageStatus();
});

blackoutBtn.addEventListener('click', async () => {
  if (!canUseControls()) {
    return;
  }

  if (defaultImagePath) {
    await window.presenterApi.showMedia(defaultImagePath);
    presenterBlackedOut = true;
    updatePresenterStatus();
    return;
  }

  await window.presenterApi.blackout();
  presenterBlackedOut = true;
  updatePresenterStatus();
});

fullscreenBtn.addEventListener('click', async () => {
  if (!canUseControls()) {
    return;
  }

  await window.presenterApi.enterFullscreen();
});

lightBgBtn.addEventListener('click', async () => {
  if (!canUseControls()) {
    return;
  }

  presenterLightBackground = !presenterLightBackground;
  localStorage.setItem(PRESENTER_LIGHT_BG_STORAGE_KEY, String(presenterLightBackground));
  updateLightBgButtonState();
  await applyPresenterBackgroundMode();
});

expandAllBtn.addEventListener('click', () => {
  if (!canUseControls()) {
    return;
  }

  setAllFoldersExpanded(true);
});

collapseAllBtn.addEventListener('click', () => {
  if (!canUseControls()) {
    return;
  }

  setAllFoldersExpanded(false);
});

prevBtn.addEventListener('click', async () => {
  await navigateSelection(-1);
});

nextBtn.addEventListener('click', async () => {
  await navigateSelection(1);
});

lockControlsBtn.addEventListener('click', () => {
  setControlsLocked(!controlsLocked);
  applyControlLockState();
});

reopenPresenterBtn.addEventListener('click', async () => {
  await window.presenterApi.reopenPresenter();
  presenterConnected = true;
  updatePresenterReconnectState();
  await refreshPresenterConnectionState();
});

thumbSizeInput.addEventListener('input', () => {
  if (!canUseControls()) {
    return;
  }

  mediaTreeElement.style.setProperty('--thumb-size', `${thumbSizeInput.value}px`);
  localStorage.setItem(THUMB_SIZE_STORAGE_KEY, thumbSizeInput.value);
});

window.presenterApi.onPresenterState((payload) => {
  presenterConnected = Boolean(payload?.connected);
  updatePresenterReconnectState();
});

window.addEventListener('keydown', async (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }

  const target = event.target;
  const targetTag = target?.tagName?.toLowerCase();
  const isTextInput =
    (targetTag === 'input' && target?.type !== 'range') ||
    targetTag === 'textarea' ||
    target?.isContentEditable;

  if (isTextInput) {
    return;
  }

  const key = event.key;
  const code = event.code;

  if (key === 'ArrowRight' || code === 'ArrowRight' || key === 'PageDown' || code === 'PageDown') {
    event.preventDefault();
    await navigateSelection(1);
    return;
  }

  if (key === 'ArrowLeft' || code === 'ArrowLeft' || key === 'PageUp' || code === 'PageUp') {
    event.preventDefault();
    await navigateSelection(-1);
    return;
  }

  if (code === 'KeyB' || key.toLowerCase() === 'b') {
    event.preventDefault();
    if (!canUseControls()) {
      return;
    }

    blackoutBtn.click();
    return;
  }

  if (code === 'KeyL' || key.toLowerCase() === 'l') {
    event.preventDefault();
    lockControlsBtn.click();
    return;
  }

  if (code === 'KeyF' || key.toLowerCase() === 'f') {
    event.preventDefault();
    if (!canUseControls()) {
      return;
    }

    fullscreenBtn.click();
    return;
  }

  if (code === 'Space' || key === ' ') {
    const video = getCurrentPreviewVideo();
    if (!video) {
      return;
    }

    event.preventDefault();
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }
}, true);

const savedThumbSize = localStorage.getItem(THUMB_SIZE_STORAGE_KEY);
if (savedThumbSize) {
  thumbSizeInput.value = savedThumbSize;
}

presenterLightBackground = localStorage.getItem(PRESENTER_LIGHT_BG_STORAGE_KEY) === 'true';
updateLightBgButtonState();
applyPresenterBackgroundMode();

defaultImagePath = localStorage.getItem(DEFAULT_IMAGE_STORAGE_KEY);
updateDefaultImageStatus();
applyStartupPresenterState();
updateLockButtonState();
applyControlLockState();
updatePresenterReconnectState();
refreshPresenterConnectionState();
initializeExplorerResizer();
setInterval(() => {
  refreshPresenterConnectionState();
}, 1500);

mediaTreeElement.style.setProperty('--thumb-size', `${thumbSizeInput.value}px`);

async function loadSavedSources() {
  const rawSourcePaths = localStorage.getItem(SOURCE_PATHS_STORAGE_KEY);
  if (!rawSourcePaths) {
    return;
  }

  try {
    const parsedSourcePaths = JSON.parse(rawSourcePaths);
    if (!Array.isArray(parsedSourcePaths) || parsedSourcePaths.length === 0) {
      return;
    }

    const loadedItems = await window.presenterApi.loadMediaSources(parsedSourcePaths);
    if (!Array.isArray(loadedItems) || loadedItems.length === 0) {
      sourcePaths = [];
      localStorage.removeItem(SOURCE_PATHS_STORAGE_KEY);
      return;
    }

    sourcePaths = parsedSourcePaths;
    mediaItems = loadedItems;
    selectedPath = null;
    renderList();
  } catch {
    localStorage.removeItem(SOURCE_PATHS_STORAGE_KEY);
  }
}

loadSavedSources();

renderList();
