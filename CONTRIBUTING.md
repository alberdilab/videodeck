# Contributing

Thank you for improving VideoDeck. This repository is intended to stay
cloneable, buildable, and auditable, so source code and documentation belong in
GitHub while large generated artifacts stay out of Git history.

## Development setup

```bash
git clone https://github.com/alberdilab/videodeck.git
cd videodeck
npm install
npm run dev
```

FFmpeg must be available on `PATH` for recording and snapshot features to work.

Before opening a pull request, run:

```bash
npm run lint
npm run build:renderer
npm run build:main
```

`npm run build:desktop` creates packaged desktop artifacts in `release/`. Those
files are local release outputs and must not be committed.

`better-sqlite3` is a native module compiled against the Electron ABI by the
`postinstall` hook. After changing the Electron version, run
`npm run rebuild:native`.

## Large files and local data

Do not commit generated installers, build caches, recordings, snapshots, local
SQLite databases, or files that contain camera credentials, local filesystem
paths, or site data. The repository ignores `dist/`, `release/`, `recordings/`,
and `videodeck.sqlite` by default.

## Pull requests

Keep changes focused and include a short description of the workflow or bug
being changed. For camera connection, FFmpeg process, scheduling, or database
schema changes, add a manual reproduction note so reviewers can verify the
behavior.

## Changelog and release notes

Every user-facing change is logged before it is released, in **two** places:

1. `CHANGELOG.md`, under the `## [Unreleased]` section at the top. Its
   `Target:` line names the version those entries are headed for.
2. `release-notes/<target>.md`, the file named by that `Target:` line.

Add the same bullet to both. `release-notes/<target>.md` is the source of
truth: `npm run release:build -- --version <target>` copies it into the
CHANGELOG as the new version section and uses it as the GitHub release body.
The `## [Unreleased]` section itself is **replaced** by a fresh stub for the
next patch version, so anything written only there is lost at release time.

Keep entries user-facing and concise, in the style of the existing sections.
Do not edit released version sections; they are a historical record. Do not
bump the version in `package.json` by hand — `release:build` does that, then
rewrites both files and opens the next `Unreleased` section for you.

Full release procedure, including Zenodo archiving:
[docs/release-with-zenodo.md](docs/release-with-zenodo.md).
