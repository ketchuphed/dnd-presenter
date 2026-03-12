const mediaTreeElement = document.getElementById('mediaTree');
const websiteTilesElement = document.getElementById('websiteTiles');
const pickBtn = document.getElementById('pickBtn');
const mediaSettingsBtn = document.getElementById('mediaSettingsBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const contentElement = document.querySelector('.content');
const panelResizer = document.getElementById('panelResizer');
const thumbSizeInput = document.getElementById('thumbSize');
const lockControlsBtn = document.getElementById('lockControlsBtn');
const defaultImageBtn = document.getElementById('defaultImageBtn');
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
const siteTileNameInput = document.getElementById('siteTileNameInput');
const siteTileUrlInput = document.getElementById('siteTileUrlInput');
const addSiteBtn = document.getElementById('addSiteBtn');
const importSitesBtn = document.getElementById('importSitesBtn');
const openWebsiteOptionsBtn = document.getElementById('openWebsiteOptionsBtn');
const sourceSettingsModal = document.getElementById('sourceSettingsModal');
const closeSourceSettingsBtn = document.getElementById('closeSourceSettingsBtn');
const sourceListElement = document.getElementById('sourceList');
const defaultImageListElement = document.getElementById('defaultImageList');
const websiteListElement = document.getElementById('websiteList');

const THUMB_SIZE_STORAGE_KEY = 'dndPresenter.thumbSize';
const SOURCE_PATHS_STORAGE_KEY = 'dndPresenter.sourcePaths';
const DEFAULT_IMAGE_STORAGE_KEY = 'dndPresenter.defaultImagePath';
const EXPLORER_WIDTH_STORAGE_KEY = 'dndPresenter.explorerWidth';
const PRESENTER_LIGHT_BG_STORAGE_KEY = 'dndPresenter.presenterLightBg';
const SHARED_URL_STORAGE_KEY = 'dndPresenter.sharedUrl';
const SAVED_SITES_STORAGE_KEY = 'dndPresenter.savedSites';

let mediaItems = [];
let selectedPath = null;
let sourcePaths = [];
let defaultImagePath = null;
let presenterBlackedOut = false;
let presenterConnected = true;
let controlsLocked = false;
let presenterLightBackground = false;
let presenterMode = 'media';
let sharedPageUrl = '';
let savedSites = [];
let defaultImageMessage = '';
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
    preloadImage(mediaItems[index + offset]);
  }
}

function canUseControls() {
  return !controlsLocked;
}

function normalizeSharedUrl(rawUrl) {
  if (typeof rawUrl !== 'string') {
    return '';
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return '';
  }

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function deriveSiteNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch {
    return url;
  }
}

function normalizeSiteEntry(site = {}) {
  const normalizedUrl = normalizeSharedUrl(site.url || '');
  if (!normalizedUrl) {
    return null;
  }

  const safeName = String(site.name || '').trim().slice(0, 40) || deriveSiteNameFromUrl(normalizedUrl);

  return {
    id: typeof site.id === 'string' ? site.id : `${Date.now()}-${Math.random()}`,
    name: safeName,
    url: normalizedUrl
  };
}

function persistSavedSites() {
  localStorage.setItem(SAVED_SITES_STORAGE_KEY, JSON.stringify(savedSites));
}

function loadSavedSites() {
  try {
    const raw = localStorage.getItem(SAVED_SITES_STORAGE_KEY);
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) {
      savedSites = [];
      return;
    }

    savedSites = parsed
      .map((entry) => normalizeSiteEntry(entry))
      .filter(Boolean);
  } catch {
    savedSites = [];
  }
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
    // Ignore transient startup IPC timing issues.
  }
}

function setControlsLocked(locked) {
  controlsLocked = locked;
  updateLockButtonState();
}

function applyControlLockState() {
  const disable = controlsLocked;
  pickBtn.disabled = disable;
  mediaSettingsBtn.disabled = disable;
  prevBtn.disabled = disable;
  nextBtn.disabled = disable;
  thumbSizeInput.disabled = disable;
  defaultImageBtn.disabled = disable;
  fullscreenBtn.disabled = disable;
  lightBgBtn.disabled = disable;
  blackoutBtn.disabled = disable;
  expandAllBtn.disabled = disable;
  collapseAllBtn.disabled = disable;
  siteTileNameInput.disabled = disable;
  siteTileUrlInput.disabled = disable;
  addSiteBtn.disabled = disable;
  importSitesBtn.disabled = disable;
  openWebsiteOptionsBtn.disabled = disable;
  closeSourceSettingsBtn.disabled = disable;
  panelResizer.style.pointerEvents = disable ? 'none' : 'auto';
  mediaTreeElement.classList.toggle('controls-locked', disable);
  renderWebsiteTiles();
  renderSourceSettingsList();
  renderDefaultImageSettingsList();
  renderWebsiteSettingsList();
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
    setExplorerWidth(event.clientX - contentBounds.left);
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
    // Ignore transient startup IPC timing issues.
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
    videoThumb.playsInline = true;
    videoThumb.preload = 'metadata';
    videoThumb.addEventListener('loadedmetadata', () => {
      videoThumb.pause();
      const targetTime = Math.min(5, Math.max(0, (videoThumb.duration || 0) - 0.1));
      videoThumb.currentTime = targetTime > 0 ? targetTime : 0;
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

function renderFolderNode(node, depth) {
  const section = document.createElement('section');
  section.className = 'folder-section';

  let contentTarget = section;
  if (depth > 0) {
    const details = document.createElement('details');
    details.className = 'folder-node';

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

function updateActiveSelection() {
  const mediaButtons = mediaTreeElement.querySelectorAll('.media-list-item');
  for (const mediaButton of mediaButtons) {
    mediaButton.classList.toggle('active', mediaButton.dataset.path === selectedPath);
  }
}

function getCurrentPreviewVideo() {
  return previewElement.querySelector('video');
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

  videoElement.addEventListener('play', () => sendControl({ action: 'play' }));
  videoElement.addEventListener('pause', () => sendControl({ action: 'pause' }));
  videoElement.addEventListener('seeked', () => sendControl({ action: 'seek', currentTime: videoElement.currentTime }));
  videoElement.addEventListener('ratechange', () => sendControl({ action: 'rate', playbackRate: videoElement.playbackRate }));
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

function renderWebPreview(url) {
  previewElement.className = '';
  previewElement.textContent = '';

  const iframe = document.createElement('iframe');
  iframe.className = 'preview-webpage';
  iframe.src = url;
  iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
  iframe.setAttribute('allowfullscreen', 'true');
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  previewElement.appendChild(iframe);

  updateActiveFileName({ name: url });
}

function renderList() {
  mediaTreeElement.innerHTML = '';

  if (mediaItems.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'No media added yet.';
    mediaTreeElement.appendChild(empty);

    if (presenterMode === 'webpage' && sharedPageUrl) {
      renderWebPreview(sharedPageUrl);
      return;
    }

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
    if (presenterMode === 'webpage' && sharedPageUrl) {
      renderWebPreview(sharedPageUrl);
    } else {
      clearPreview();
    }
  }

  updateActiveSelection();
}

function renderDefaultImageSettingsList() {
  defaultImageListElement.innerHTML = '';

  if (defaultImageMessage) {
    const message = document.createElement('p');
    message.className = 'hint';
    message.textContent = defaultImageMessage;
    defaultImageListElement.appendChild(message);
  }

  if (!defaultImagePath) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No default image set. Blackout shows a blank screen.';
    defaultImageListElement.appendChild(empty);
    return;
  }

  const row = document.createElement('div');
  row.className = 'source-item';

  const text = document.createElement('code');
  text.className = 'source-path';
  text.textContent = defaultImagePath;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'button button-small';
  removeBtn.textContent = 'Remove';
  removeBtn.disabled = controlsLocked;
  removeBtn.addEventListener('click', () => {
    defaultImagePath = null;
    defaultImageMessage = '';
    localStorage.removeItem(DEFAULT_IMAGE_STORAGE_KEY);
    renderDefaultImageSettingsList();
  });

  row.appendChild(text);
  row.appendChild(removeBtn);
  defaultImageListElement.appendChild(row);
}

function updatePresenterStatus() {
  if (presenterMode === 'webpage') {
    presenterStatusElement.textContent = 'Presenter: Shared Web Page';
    presenterStatusElement.classList.remove('blacked-out');
    return;
  }

  if (presenterBlackedOut || presenterMode === 'blackout') {
    presenterStatusElement.textContent = 'Presenter: Blacked Out';
    presenterStatusElement.classList.add('blacked-out');
    return;
  }

  presenterStatusElement.textContent = 'Presenter: Live Media';
  presenterStatusElement.classList.remove('blacked-out');
}

async function applyStartupPresenterState() {
  presenterBlackedOut = true;
  presenterMode = 'blackout';
  updatePresenterStatus();

  if (defaultImagePath) {
    const result = await window.presenterApi.showMedia(defaultImagePath);
    if (result?.ok) {
      return;
    }
  }

  await window.presenterApi.blackout();
}

function mergeSourcePaths(existingPaths, incomingPaths) {
  const merged = new Set(existingPaths);
  for (const entry of incomingPaths) {
    if (entry) {
      merged.add(entry);
    }
  }
  return Array.from(merged);
}

function saveSourcePaths() {
  if (sourcePaths.length === 0) {
    localStorage.removeItem(SOURCE_PATHS_STORAGE_KEY);
    return;
  }

  localStorage.setItem(SOURCE_PATHS_STORAGE_KEY, JSON.stringify(sourcePaths));
}

async function reloadMediaFromSources() {
  if (sourcePaths.length === 0) {
    mediaItems = [];
    selectedPath = null;
    renderList();
    return;
  }

  const loadedItems = await window.presenterApi.loadMediaSources(sourcePaths);
  mediaItems = Array.isArray(loadedItems) ? loadedItems : [];

  if (!mediaItems.some((entry) => entry.path === selectedPath)) {
    selectedPath = null;
  }

  renderList();
}

function renderSourceSettingsList() {
  sourceListElement.innerHTML = '';

  if (sourcePaths.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No sources loaded.';
    sourceListElement.appendChild(empty);
    return;
  }

  for (const sourcePath of sourcePaths) {
    const row = document.createElement('div');
    row.className = 'source-item';

    const text = document.createElement('code');
    text.className = 'source-path';
    text.textContent = sourcePath;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'button button-small';
    removeBtn.textContent = 'Remove';
    removeBtn.disabled = controlsLocked;
    removeBtn.addEventListener('click', async () => {
      sourcePaths = sourcePaths.filter((entry) => entry !== sourcePath);
      saveSourcePaths();
      await reloadMediaFromSources();
      renderSourceSettingsList();
    });

    row.appendChild(text);
    row.appendChild(removeBtn);
    sourceListElement.appendChild(row);
  }
}

function showSourceSettingsModal() {
  renderSourceSettingsList();
  renderDefaultImageSettingsList();
  renderWebsiteSettingsList();
  sourceSettingsModal.classList.remove('hidden');
}

function hideSourceSettingsModal() {
  sourceSettingsModal.classList.add('hidden');
}

function renderWebsiteSettingsList() {
  websiteListElement.innerHTML = '';

  if (savedSites.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No websites saved.';
    websiteListElement.appendChild(empty);
    return;
  }

  for (const site of savedSites) {
    const row = document.createElement('div');
    row.className = 'source-item';

    const text = document.createElement('code');
    text.className = 'source-path';
    text.textContent = `${site.name} - ${site.url}`;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'button button-small';
    removeBtn.textContent = 'Remove';
    removeBtn.disabled = controlsLocked;
    removeBtn.addEventListener('click', () => {
      savedSites = savedSites.filter((entry) => entry.id !== site.id);
      persistSavedSites();
      renderWebsiteTiles();
      renderWebsiteSettingsList();
    });

    row.appendChild(text);
    row.appendChild(removeBtn);
    websiteListElement.appendChild(row);
  }
}

function renderWebsiteTiles() {
  websiteTilesElement.innerHTML = '';

  if (savedSites.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No websites added yet.';
    websiteTilesElement.appendChild(empty);
    return;
  }

  for (const site of savedSites) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `website-tile${presenterMode === 'webpage' && sharedPageUrl === site.url ? ' active' : ''}`;
    tile.disabled = controlsLocked;

    const name = document.createElement('span');
    name.className = 'website-name';
    name.textContent = site.name;

    const url = document.createElement('span');
    url.className = 'website-url';
    url.textContent = site.url;

    tile.appendChild(name);
    tile.appendChild(url);
    tile.addEventListener('click', async () => {
      siteTileNameInput.value = site.name;
      siteTileUrlInput.value = site.url;
      await shareWebPageUrl(site.url);
    });

    websiteTilesElement.appendChild(tile);
  }
}

async function shareWebPageUrl(rawUrl, options = {}) {
  const normalized = normalizeSharedUrl(rawUrl);
  if (!normalized) {
    presenterStatusElement.textContent = 'Presenter: Invalid URL';
    presenterStatusElement.classList.add('blacked-out');
    siteTileUrlInput.focus();
    return false;
  }

  const result = await window.presenterApi.showWebPage({
    url: normalized,
    topLevel: Boolean(options.topLevel)
  });
  if (!result?.ok) {
    presenterStatusElement.textContent = 'Presenter: URL not shareable';
    presenterStatusElement.classList.add('blacked-out');
    return false;
  }

  sharedPageUrl = result.url || normalized;
  localStorage.setItem(SHARED_URL_STORAGE_KEY, sharedPageUrl);
  siteTileUrlInput.value = sharedPageUrl;
  presenterMode = 'webpage';
  presenterBlackedOut = false;
  updatePresenterStatus();
  renderWebPreview(sharedPageUrl);
  renderWebsiteTiles();
  return true;
}

async function showItem(item) {
  selectedPath = item.path;
  updateActiveSelection();
  renderPreview(item);
  await window.presenterApi.showMedia(item.path);
  presenterBlackedOut = false;
  presenterMode = 'media';
  updatePresenterStatus();
  preloadAroundSelection(item.path);
  renderWebsiteTiles();
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

pickBtn.addEventListener('click', async () => {
  if (!canUseControls()) {
    return;
  }

  const picked = await window.presenterApi.pickMedia();
  if (!picked || !Array.isArray(picked.sources) || picked.sources.length === 0) {
    return;
  }

  sourcePaths = mergeSourcePaths(sourcePaths, picked.sources);
  saveSourcePaths();
  imagePreloadCache.clear();
  await reloadMediaFromSources();
  renderSourceSettingsList();
  renderDefaultImageSettingsList();
});

mediaSettingsBtn.addEventListener('click', () => {
  if (!canUseControls()) {
    return;
  }

  showSourceSettingsModal();
});

openWebsiteOptionsBtn.addEventListener('click', () => {
  if (!canUseControls()) {
    return;
  }

  showSourceSettingsModal();
});

closeSourceSettingsBtn.addEventListener('click', () => {
  hideSourceSettingsModal();
});

sourceSettingsModal.addEventListener('click', (event) => {
  if (event.target === sourceSettingsModal) {
    hideSourceSettingsModal();
  }
});

defaultImageBtn.addEventListener('click', () => {
  if (!canUseControls()) {
    return;
  }

  window.presenterApi.pickDefaultImage().then((pickedPath) => {
    if (!pickedPath) {
      return;
    }

    defaultImagePath = pickedPath;
    defaultImageMessage = '';
    localStorage.setItem(DEFAULT_IMAGE_STORAGE_KEY, defaultImagePath);
    renderDefaultImageSettingsList();
  }).catch(() => {
    defaultImageMessage = 'Unable to choose default image.';
    renderDefaultImageSettingsList();
  });
});

blackoutBtn.addEventListener('click', async () => {
  if (!canUseControls()) {
    return;
  }

  if (defaultImagePath) {
    await window.presenterApi.showMedia(defaultImagePath);
    presenterBlackedOut = true;
    presenterMode = 'blackout';
    updatePresenterStatus();
    return;
  }

  await window.presenterApi.blackout();
  presenterBlackedOut = true;
  presenterMode = 'blackout';
  updatePresenterStatus();
});

addSiteBtn.addEventListener('click', () => {
  if (!canUseControls()) {
    return;
  }

  const normalizedUrl = normalizeSharedUrl(siteTileUrlInput.value);
  if (!normalizedUrl) {
    siteTileUrlInput.focus();
    return;
  }

  const customName = siteTileNameInput.value.trim();
  const newSite = normalizeSiteEntry({ name: customName, url: normalizedUrl });
  if (!newSite) {
    return;
  }

  const existingIndex = savedSites.findIndex((site) => site.url === newSite.url);
  if (existingIndex >= 0) {
    savedSites[existingIndex] = {
      ...savedSites[existingIndex],
      name: newSite.name
    };
  } else {
    savedSites.push(newSite);
  }

  persistSavedSites();
  renderWebsiteTiles();
  renderWebsiteSettingsList();
});

importSitesBtn.addEventListener('click', async () => {
  if (!canUseControls()) {
    return;
  }

  const result = await window.presenterApi.importWebsitesFile();
  if (!result?.ok || !Array.isArray(result.sites) || result.sites.length === 0) {
    return;
  }

  for (const importedSite of result.sites) {
    const normalized = normalizeSiteEntry(importedSite);
    if (!normalized) {
      continue;
    }

    const existingIndex = savedSites.findIndex((site) => site.url === normalized.url);
    if (existingIndex >= 0) {
      savedSites[existingIndex] = {
        ...savedSites[existingIndex],
        name: normalized.name
      };
    } else {
      savedSites.push(normalized);
    }
  }

  persistSavedSites();
  renderWebsiteTiles();
  renderWebsiteSettingsList();
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
    if (canUseControls()) {
      blackoutBtn.click();
    }
    return;
  }

  if (code === 'KeyL' || key.toLowerCase() === 'l') {
    event.preventDefault();
    lockControlsBtn.click();
    return;
  }

  if (code === 'KeyF' || key.toLowerCase() === 'f') {
    event.preventDefault();
    if (canUseControls()) {
      fullscreenBtn.click();
    }
    return;
  }

  if (code === 'KeyU' || key.toLowerCase() === 'u') {
    event.preventDefault();
    if (canUseControls() && siteTileUrlInput.value.trim()) {
      await shareWebPageUrl(siteTileUrlInput.value.trim());
    }
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

    sourcePaths = parsedSourcePaths;
    await reloadMediaFromSources();
  } catch {
    localStorage.removeItem(SOURCE_PATHS_STORAGE_KEY);
  }
}

const savedThumbSize = localStorage.getItem(THUMB_SIZE_STORAGE_KEY);
if (savedThumbSize) {
  thumbSizeInput.value = savedThumbSize;
}

presenterLightBackground = localStorage.getItem(PRESENTER_LIGHT_BG_STORAGE_KEY) === 'true';
updateLightBgButtonState();
applyPresenterBackgroundMode();

sharedPageUrl = localStorage.getItem(SHARED_URL_STORAGE_KEY) || '';
if (sharedPageUrl) {
  siteTileUrlInput.value = sharedPageUrl;
}

loadSavedSites();
renderWebsiteTiles();

defaultImagePath = localStorage.getItem(DEFAULT_IMAGE_STORAGE_KEY);
renderDefaultImageSettingsList();
applyStartupPresenterState();
updateLockButtonState();
applyControlLockState();
updatePresenterReconnectState();
refreshPresenterConnectionState();
initializeExplorerResizer();
renderSourceSettingsList();
renderWebsiteSettingsList();

setInterval(() => {
  refreshPresenterConnectionState();
}, 1500);

mediaTreeElement.style.setProperty('--thumb-size', `${thumbSizeInput.value}px`);
loadSavedSources();
renderList();
