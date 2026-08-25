# VideoDeck (v0.1.0)

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22091744.svg)](https://doi.org/10.5281/zenodo.22091744)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

VideoDeck is an Electron desktop application for managing local ONVIF/RTSP IP cameras, live-view grid placeholders, manual recordings, fixed-duration clips, schedules, and recording metadata.

The first target camera is the Nivian NVS-IPC-IS4 Tuya/SmartLife-compatible indoor camera, but the app is structured around generic ONVIF/RTSP camera inputs.

<!-- BEGIN DOWNLOADS -->
## Download

Pre-built installers for **v0.1.0** are archived on Zenodo
([DOI 10.5281/zenodo.22091745](https://doi.org/10.5281/zenodo.22091745)). Pick the build for your
platform; the right-hand column lists alternative formats.

| Platform | Architecture | Installer | Other formats |
| --- | --- | --- | --- |
| macOS | Apple Silicon (arm64) | [`.dmg`](https://zenodo.org/records/22091745/files/videodeck_0.1.0_arm64_mac.dmg?download=1) | [`.zip`](https://zenodo.org/records/22091745/files/videodeck_0.1.0_arm64_mac.zip?download=1) |
| macOS | Intel (x64) | [`.dmg`](https://zenodo.org/records/22091745/files/videodeck_0.1.0_x64_mac.dmg?download=1) | [`.zip`](https://zenodo.org/records/22091745/files/videodeck_0.1.0_x64_mac.zip?download=1) |
| Windows | x64 | [`.exe`](https://zenodo.org/records/22091745/files/videodeck_0.1.0_x64_win.exe?download=1) | [`.zip`](https://zenodo.org/records/22091745/files/videodeck_0.1.0_x64_win.zip?download=1) |
| Linux | x64 (x86_64) | [`.AppImage`](https://zenodo.org/records/22091745/files/videodeck_0.1.0_x86_64_linux.AppImage?download=1) | [`.deb`](https://zenodo.org/records/22091745/files/videodeck_0.1.0_amd64_linux.deb?download=1) · [`.rpm`](https://zenodo.org/records/22091745/files/videodeck_0.1.0_x86_64_linux.rpm?download=1) · [`.tar.gz`](https://zenodo.org/records/22091745/files/videodeck_0.1.0_x64_linux.tar.gz?download=1) |
| Linux | arm64 (aarch64) | [`.AppImage`](https://zenodo.org/records/22091745/files/videodeck_0.1.0_arm64_linux.AppImage?download=1) | [`.deb`](https://zenodo.org/records/22091745/files/videodeck_0.1.0_arm64_linux.deb?download=1) · [`.rpm`](https://zenodo.org/records/22091745/files/videodeck_0.1.0_aarch64_linux.rpm?download=1) · [`.tar.gz`](https://zenodo.org/records/22091745/files/videodeck_0.1.0_arm64_linux.tar.gz?download=1) |

Verify downloads against [`SHA256SUMS-0.1.0.txt`](https://zenodo.org/records/22091745/files/SHA256SUMS-0.1.0.txt?download=1).
For other releases, browse the [all-versions Zenodo record](https://doi.org/10.5281/zenodo.22091744) or the
[GitHub releases page](https://github.com/alberdilab/videodeck/releases).
<!-- END DOWNLOADS -->

## Current MVP

- Electron main process for app lifecycle, IPC, folder picker, and backend startup.
- React + Vite renderer for the UI.
- Node.js local backend services for cameras, schedules, settings, logs, and FFmpeg recording process management.
- SQLite persistence through `better-sqlite3`.
- Camera CRUD with local credential storage isolated behind `CameraCredentialStore`.
- Live View grid sizes: 1, 4, 9, 16, 25, 36.
- Placeholder camera tiles with connection and recording status.
- Manual recording, stop recording, and fixed-duration clips.
- Snapshot mode: single JPEG captures and interval (timelapse) sessions per camera.
- Scheduled recording skeleton with `none`, `daily`, `weekly`, and `weekdays` recurrence, for
  video recordings or snapshots.
- Recording and snapshot metadata saved locally in one list, tagged by media type.
- Basic chronological logs with credential redaction.

## Requirements

- Node.js 22 or newer.
- npm.
- FFmpeg available on `PATH`.

Recording uses stream copy by default:

```bash
ffmpeg -rtsp_transport tcp -i "<RTSP_URL>" -c copy "<OUTPUT_FILE>"
```

MKV is preferred by default because it is more resilient for interrupted recordings. MP4 remuxing is planned as a later post-processing option.

Snapshots grab a single frame from the main stream:

```bash
ffmpeg -rtsp_transport tcp -i "<RTSP_URL>" -an -frames:v 1 -q:v 2 -f image2 "<OUTPUT_FILE>.jpg"
```

A capture takes a second or two because FFmpeg waits for a keyframe, and it is abandoned after 20
seconds. Most cameras serve only one or two RTSP clients, so recordings and snapshots take exclusive
turns on a camera through `CameraBusyRegistry`, and the live preview is suspended while either runs.
An interval session skips a capture rather than queueing it when a recording holds the camera.

## Setup

```bash
npm install
npm run dev
```

Build both renderer and Electron/backend TypeScript:

```bash
npm run build
```

Run type checks:

```bash
npm run typecheck
```

Package desktop artifacts for the host platform into `release/`:

```bash
npm run build:desktop
```

## Development Structure

```text
src/main          Electron main process
src/preload       Context-isolated renderer bridge
src/renderer      React UI
src/backend       Local Node.js backend services
src/shared        Shared API contracts, types, validation
```

Persistent app data is stored under Electron's `userData` directory:

- `videodeck.sqlite`
- `recordings/` (video files and snapshot JPEGs, named by the same filename template)

## Security Notes

Passwords are stored locally in plaintext SQLite for the MVP, but all camera credential access is isolated behind `CameraCredentialStore`. The implementation includes TODOs for:

- macOS Keychain
- Windows Credential Manager

Logs redact RTSP credentials and password fields.

## MVP Limitations

- ONVIF discovery is stubbed through `OnvifService`.
- ONVIF `GetStreamUri` is not implemented yet.
- Live streams are placeholders; media is not decoded in the renderer.
- Stream preview service is stubbed for future go2rtc, WebRTC, HLS, or another RTSP-to-browser bridge.
- Retention settings are stored but not enforced.
- FFmpeg must already be installed and available on `PATH`.
- Windows arm64 and ia32 builds are not produced; `better-sqlite3` has no prebuilt native binary for them.

## Roadmap

- Add ONVIF discovery and stream URI resolution.
- Add bundled FFmpeg discovery/configuration.
- Add go2rtc or WebRTC preview integration with substream preference for grid views.
- Add focused camera view using main stream.
- Add optional MP4 remuxing after completed MKV recordings.
- Add OS credential storage.
- Add retention enforcement.
- Add code signing and notarization for macOS and Windows builds.

## Releasing

Versions are prepared with `npm run release:build -- --version <x.y.z>`, published
by pushing a `v<x.y.z>` tag, and archived to Zenodo automatically for a citable
DOI. Full procedure: [docs/release-with-zenodo.md](docs/release-with-zenodo.md).

Changes are logged in [CHANGELOG.md](CHANGELOG.md) and per-release notes live in
[release-notes/](release-notes/).

## Citation

Citation metadata is in [CITATION.cff](CITATION.cff). Once the first Zenodo
archive exists, cite the concept DOI to reference the software in general, or a
version DOI to reference the exact release used.

## License

[MIT](LICENSE) © Antton Alberdi
