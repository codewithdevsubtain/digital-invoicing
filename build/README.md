# Build Assets

Place application icons here before packaging:

- `icon.ico` — Windows installer / app icon (required for `electron-builder` NSIS target)
- `icon.png` — macOS/Linux fallback and dev window icon (optional)

Recommended icon sizes:
- 256x256 px minimum for `icon.png`
- 256x256 px up to 1024x1024 px, containing all required Windows icon sizes for `icon.ico`

The app will fall back to the default Electron icon if these files are missing during development.
