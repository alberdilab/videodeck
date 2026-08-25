# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]
Target: 0.1.1

- Log all new changes here for the upcoming 0.1.1 release.

## [0.1.0] - 2026-08-25

- First packaged release of VideoDeck.
- Camera CRUD for ONVIF/RTSP cameras with credentials isolated behind `CameraCredentialStore`.
- Live View grid with 1, 4, 9, 16, 25, and 36 tile layouts and per-camera connection and recording status.
- Manual recordings, fixed-duration clips, single snapshots, and interval (timelapse) snapshot sessions through FFmpeg.
- Scheduled recording and snapshot jobs with `none`, `daily`, `weekly`, and `weekdays` recurrence.
- Local SQLite persistence of cameras, schedules, settings, media metadata, and credential-redacted logs.
