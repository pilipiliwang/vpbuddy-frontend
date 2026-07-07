# VPBuddy Desktop

VPBuddy Desktop is an Electron shell for the existing frontend. It loads the UI from local packaged files and calls the backend only through HTTP API endpoints.

The backend, Hermes, ASR, knowledge base, and AI services are not bundled into the desktop app.

## API Base URL

Default API base:

```text
http://47.100.182.3:28765
```

Runtime override:

```powershell
$env:VPBUDDY_API_BASE_URL="https://your-vpbuddy-api.example.com"
npm run desktop
```

Users can also change the API base in the app under Settings -> Backend API. The value is saved in local storage and used after reload.

## Development

```bash
npm install
npm run desktop
```

## Build Windows Installers

```bash
npm run desktop:build:win
```

Artifacts:

```text
release/VPBuddy-Setup-<version>-x64.exe
release/VPBuddy-Portable-<version>-x64.exe
```

## Build macOS Packages

macOS packages must be built on macOS:

```bash
npm run desktop:build:mac
```

Artifacts:

```text
release/VPBuddy-<version>-mac-x64.dmg
release/VPBuddy-<version>-mac-arm64.dmg
release/VPBuddy-<version>-mac-x64.zip
release/VPBuddy-<version>-mac-arm64.zip
```

The GitHub Actions workflow `.github/workflows/desktop-build.yml` builds both Windows and macOS packages and uploads them as workflow artifacts.
