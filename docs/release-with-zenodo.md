# Release with Zenodo

Use this checklist when publishing a VideoDeck release that should include
built desktop artifacts, checksums, and a citable archive.

## 0. One-time setup

Set these on the GitHub repository before the first release:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `ZENODO_TOKEN` | Zenodo personal access token with `deposit:write` and `deposit:actions` scopes. |
| Variable | `ZENODO_CONCEPT_RECID` | Left unset for the first release. See step 4. |
| Variable | `ZENODO_BASE` | Optional. Set to `https://sandbox.zenodo.org` to rehearse against the sandbox. |

Without `ZENODO_TOKEN` the Release workflow still builds and publishes the
GitHub release; it just skips the Zenodo steps.

## 1. Prepare the release locally

1. Create or update `release-notes/<version>.md`.
2. Run the release preparation script:

```bash
npm run release:build -- --version <x.y.z>
```

This bumps `package.json`, refreshes `buildDate`, the package description, the
README title, and `CITATION.cff`, folds `release-notes/<version>.md` into
`CHANGELOG.md`, opens a fresh `## [Unreleased]` section for the next patch
version, then lints and packages.

Because `better-sqlite3` is compiled per platform, a local run only packages for
the host operating system: macOS hosts produce macOS x64/arm64 artifacts,
Windows hosts produce Windows x64, and Linux hosts produce Linux x64. Checksums
for whatever was produced land in `release/SHA256SUMS-<version>.txt`. Use
`--skip-build` when you only want the version and changelog bookkeeping and will
let CI produce the artifacts.

3. Commit the resulting changes.

## 2. Publish the GitHub release

Push a tag named `v<x.y.z>`:

```bash
git tag v<x.y.z>
git push origin v<x.y.z>
```

The `Release` GitHub Actions workflow verifies that `package.json` matches the
tag, then builds and publishes these assets:

| System | Architectures | Artifacts |
| --- | --- | --- |
| macOS | x64, arm64 | DMG, ZIP |
| Windows | x64 | NSIS installer, ZIP |
| Linux | x64, arm64 | AppImage, DEB, RPM, tar.gz |

Every architecture is built on a native runner because `better-sqlite3` cannot
be cross-compiled reliably. Windows arm64 and ia32 are deliberately not built
for the same reason; add them once prebuilt native binaries are available.

The workflow also uploads `SHA256SUMS-<version>.txt` covering the full combined
release asset set.

## 3. Archive on Zenodo

This happens automatically at the end of the `Release` workflow: the built
installers and the checksum file are uploaded to Zenodo, metadata is taken from
`.zenodo.json`, and the deposition is published.

Only binaries are archived. The source code is distributed through GitHub and
the Zenodo description points at the repository, so a release archive stays a
record of the exact artifacts users downloaded. To archive the source as well,
add a `git archive` step to the staging steps of both workflows.

If that step fails, or you want to archive an existing release afterwards, run
the `Archive to Zenodo` workflow manually with the version number. It downloads
the published release assets instead of rebuilding them.

Re-runs are safe: if Zenodo already holds a record for this version, the script
reports it and uploads nothing.

## 4. After the first release

The first run creates a fresh Zenodo record and prints its concept recid:

```
IMPORTANT: store this concept recid as the repo variable ZENODO_CONCEPT_RECID
```

Set that repository variable. Every later release then chains as a new *version*
of the same record, so the project keeps one stable concept DOI that always
resolves to the latest release, plus a per-version DOI for each release.

Then finish the citation metadata:

1. Add the concept DOI to `CITATION.cff` as `doi:` and list both the concept DOI
   and the per-version DOI under `identifiers:`.
2. Add the concept DOI badge to the top of `README.md`.
3. Keep the GitHub release notes and the Zenodo description aligned so users can
   identify the correct artifact for their operating system and CPU.

The README download table between the `<!-- BEGIN DOWNLOADS -->` and
`<!-- END DOWNLOADS -->` markers is regenerated automatically after each Zenodo
archive, from the file list of the published record. To refresh it by hand:

```bash
node scripts/update-readme-downloads.js --recid <zenodo record id> --dry-run
```
