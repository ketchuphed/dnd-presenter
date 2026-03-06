# DnD Presenter

A lightweight desktop presenter app for quickly showing images and videos to an audience.

## Features

- Control window with a media explorer list
- Add individual files or entire folders
- Click any media item to instantly show it in a fullscreen presenter window
- Presenter window automatically opens on the second monitor (if available)
- Supports common image and video formats
- Blackout button for a quick blank screen
- Presenter reconnect banner with one-click reopen
- Next/Previous navigation buttons and keyboard shortcuts
- Optional lock mode to prevent accidental control changes during a show
- Preloading of nearby images for smoother navigation

## Requirements

- Windows 10/11 (also works on macOS/Linux)
- Node.js 20+

## Run

```bash
npm install
npm start
```

## Package for Windows

```bash
npm run dist:exe
```

Builds a runnable Windows app folder at `dist/v<version>/DnD Presenter-win32-x64/`.

```bash
npm run dist:zip
```

Builds the same app folder and also creates `dist/v<version>/DnD Presenter-v<version>-win32-x64.zip` for easy sharing.

## App Icon

- Vector source icon is at `assets/app-icon.svg`.
- For Windows executable branding, export this SVG to `.ico` (recommended sizes: 256, 128, 64, 48, 32, 16) and pass it to packager with `--icon`.

## Usage

1. Launch the app.
2. In the control window, click **Add Files/Folders**.
3. Choose one or more files and/or folders.
4. Click an item in the media list to display it on the presenter screen.
5. Use **Blackout Screen** when needed.

## Keyboard Shortcuts

- `Right Arrow` / `PageDown`: Next media
- `Left Arrow` / `PageUp`: Previous media
- `B`: Blackout
- `F`: Return presenter to fullscreen
- `L`: Toggle lock controls
- `Space`: Play/Pause preview video

## Notes

- If only one monitor is connected, both windows open on the same display.
- Video playback includes audio in the presenter window.
