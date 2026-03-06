const root = document.getElementById('presenterRoot');
const placeholder = document.getElementById('presenterPlaceholder');
const presenterBody = document.body;
const FADE_DURATION_MS = 440;
let activeVideoElement = null;
let activeMediaPath = null;
let transitionVersion = 0;

if (root) {
  root.style.setProperty('--presenter-fade-ms', `${FADE_DURATION_MS}ms`);
}

function applyBackgroundMode(payload) {
  const mode = payload?.mode === 'light' ? 'light' : 'dark';
  const useLight = mode === 'light';

  presenterBody.classList.toggle('presenter-light', useLight);
  if (root) {
    root.classList.toggle('presenter-light', useLight);
  }
}

function showPlaceholder(text) {
  const message = document.createElement('div');
  message.className = 'presenter-placeholder presenter-layer';
  message.textContent = text;
  transitionTo(message);
}

function showBlackout() {
  const blackout = document.createElement('div');
  blackout.className = 'presenter-blackout presenter-layer';
  transitionTo(blackout);
}

function transitionTo(nextLayer, options = {}) {
  const { waitForReady } = options;
  const version = ++transitionVersion;
  const currentLayer = root.querySelector('.presenter-layer:not(.is-exiting)');

  const staleEnteringLayers = root.querySelectorAll('.presenter-layer.is-entering');
  for (const layer of staleEnteringLayers) {
    layer.remove();
  }

  if (nextLayer) {
    nextLayer.classList.add('is-entering');
    root.appendChild(nextLayer);

    const beginCrossfade = () => {
      if (version !== transitionVersion || !nextLayer.isConnected) {
        return;
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (version !== transitionVersion || !nextLayer.isConnected) {
            return;
          }

          nextLayer.classList.remove('is-entering');

          if (currentLayer && currentLayer.isConnected) {
            currentLayer.classList.add('is-exiting');
            setTimeout(() => {
              if (currentLayer.parentNode) {
                currentLayer.remove();
              }
            }, FADE_DURATION_MS + 40);
          }
        });
      });
    };

    if (typeof waitForReady === 'function') {
      waitForReady(beginCrossfade);
    } else {
      beginCrossfade();
    }
  }
}

function renderMedia(payload) {
  if (!payload || !payload.url || !payload.type) {
    showPlaceholder('Unable to display media.');
    activeVideoElement = null;
    activeMediaPath = null;
    return;
  }

  if (payload.type === 'video') {
    const video = document.createElement('video');
    video.className = 'presenter-media presenter-layer';
    video.src = payload.url;
    video.autoplay = true;
    video.loop = true;
    video.controls = false;
    video.muted = true;
    video.playsInline = true;
    transitionTo(video, {
      waitForReady: (done) => {
        if (video.readyState >= 2) {
          done();
          return;
        }

        video.addEventListener('loadeddata', done, { once: true });
        video.addEventListener('error', done, { once: true });
      }
    });

    activeVideoElement = video;
    activeMediaPath = payload.path || null;
    video.play().catch(() => {});
    return;
  }

  const image = document.createElement('img');
  image.className = 'presenter-media presenter-layer';
  image.src = payload.url;
  image.alt = 'Presented media';
  transitionTo(image, {
    waitForReady: (done) => {
      const finishWhenDecoded = () => {
        if (typeof image.decode === 'function') {
          image.decode().then(done).catch(done);
          return;
        }

        done();
      };

      if (image.complete) {
        finishWhenDecoded();
        return;
      }

      image.addEventListener('load', finishWhenDecoded, { once: true });
      image.addEventListener('error', done, { once: true });
    }
  });
  activeVideoElement = null;
  activeMediaPath = payload.path || null;
}

function applyVideoControl(payload) {
  if (!payload || !activeVideoElement) {
    return;
  }

  if (payload.path && activeMediaPath && payload.path !== activeMediaPath) {
    return;
  }

  if (payload.action === 'play') {
    activeVideoElement.play().catch(() => {});
    return;
  }

  if (payload.action === 'pause') {
    activeVideoElement.pause();
    return;
  }

  if (payload.action === 'seek' && Number.isFinite(payload.currentTime)) {
    activeVideoElement.currentTime = payload.currentTime;
    return;
  }

  if (payload.action === 'rate' && Number.isFinite(payload.playbackRate) && payload.playbackRate > 0) {
    activeVideoElement.playbackRate = payload.playbackRate;
    return;
  }
}

window.presenterApi.onPresenterMedia((payload) => {
  renderMedia(payload);
});

window.presenterApi.onPresenterBlackout(() => {
  showBlackout();
  activeVideoElement = null;
  activeMediaPath = null;
});

window.presenterApi.onPresenterVideoControl((payload) => {
  applyVideoControl(payload);
});

window.presenterApi.onPresenterBackground((payload) => {
  applyBackgroundMode(payload);
});

if (placeholder) {
  placeholder.classList.add('presenter-layer');
  placeholder.textContent = '';
}
