# DnD Presenter

DnD Presenter is a simple desktop app for showing images and videos to your players on a second screen.

## Download

- Grab the latest build here: https://github.com/ketchuphed/dnd-presenter/releases/latest
- Current stable: v0.9.1 — https://github.com/ketchuphed/dnd-presenter/releases/tag/v0.9.1

## Features

- Separate control and presenter windows
- Add individual files or whole folders (new additions are appended)
- Click any thumbnail to show it instantly on the presenter screen
- Presenter window auto-opens on your second monitor when available
- Supports common image and video formats
- Share a live webpage (like your initiative tracker site) to the presenter screen
- Preview shared websites directly in the control preview panel
- Save multiple website links as tiles in the media column for quick swapping
- Import website tiles from a tab-delimited text file (`NAME<TAB>URL`)
- Manage and remove loaded media sources from **Library Options**
- One-click blackout screen
- Reconnect banner with a quick reopen button
- Next/Previous controls plus keyboard shortcuts
- Lock mode to avoid accidental clicks during a session
- Nearby-image preloading for smoother browsing

## Requirements

- Windows 10/11 (also works on macOS/Linux)
- Node.js 20+

## Run

```bash
npm install
npm start
```

That’s it—once it launches, use the control window to load media and drive what appears on the presenter display.

## Package for Windows

```bash
npm run dist:exe
```

Creates a runnable Windows app folder at `dist/v<version>/DnD Presenter-win32-x64/`.

```bash
npm run dist:zip
```

Builds the same app folder and also creates `dist/v<version>/DnD Presenter-v<version>-win32-x64.zip`, which is handy for sharing.

## Usage

1. Start the app.
2. In the control window, click **Add Files/Folders**.
3. Pick one or more files/folders.
4. Click a media item to present it.
5. Use **Blackout Screen** any time you want to hide the display.

## Website Import Format

Use a plain text file where each line is:

```text
Name<TAB>https://example.com
```

Example:

```text
Combat Tracker	https://example.com/initiative
DM Notes	https://example.com/notes
```

## Quick Table Workflow

If you're running a game session, this flow works well:

1. Add your session folder (maps, handouts, cutscenes).
2. Keep the presenter blacked out while players are deciding.
3. Click a map when combat or exploration starts.
4. Use `Right Arrow` / `Left Arrow` to move through scene images quickly.
5. Tap blackout again when you want to hide surprises.

## Tips

- Put each encounter in its own folder so the media tree stays easy to navigate.
- Use **Lock Controls** once you’re live to avoid accidental clicks.
- Keep a neutral default image ready for transitions between scenes.
- For video moments, control playback from the preview panel in the control window.

## Keyboard Shortcuts

- `Right Arrow` / `PageDown`: Next media
- `Left Arrow` / `PageUp`: Previous media
- `B`: Blackout
- `F`: Return presenter to fullscreen
- `L`: Toggle lock controls
- `Space`: Play/Pause preview video
- `U`: Share the URL currently in the toolbar field

## Notes

- If only one monitor is connected, both windows open on the same display.
- Video playback audio comes from the control window.
