# AGENTS.md

Guidance for AI coding agents working in this repo. Read this before changing anything under
`photos/`, `scripts/` or `.github/workflows/`. Details for humans are in [photos/README.md](photos/README.md).

## What this is

A static personal site (photos + coding projects) served by GitHub Pages from the `main` branch at
https://kchambers54.github.io/personal-site/. There is no build step for the site itself: the HTML/CSS/JS
files in the repo root are served as-is. Pages deploys are requested by the workflows (see below).

## Repo layout

- `index.html`, `script.js`, `styles.css`: home page (a row of trip cover photos).
- `collections.html` + `collections.js`: the "All collections" page; one card per trip.
- `collection.html` + `collection.js`: a single trip page (`collection.html?slug=<slug>`), with photo viewer.
- `photos.js`: shared loader (`window.Photos`) that fetches `photos/collections.json`, builds `srcset`s and
  handles page-to-page photo morph transitions.
- `photos/collections.json`: **the manifest that drives the site.** `{ "trips": [ { slug, place, date?, images: [ { file, width, height } ] } ] }`.
- `photos/<trip-slug>/`: full-size photos (max 2400px wide) plus generated `w480/`, `w960/`, `w1600/` copies.
- `photos/.drive-imported.json`: ledger of Drive file ids already imported (`{ "files": { "<driveId>": "<slug>/<file>" } }`).
- `scripts/prepare-photos.mjs`: photo prep (sharp). `scripts/import-drive-photos.mjs`: Drive importer. `scripts/import-drive-photos.test.mjs`: its tests.
- `.github/workflows/prepare-photos.yml`, `.github/workflows/import-drive-photos.yml`: the two Actions.
- `projects/`: writeups of coding projects (currently just a README).

## How the site renders

- Every page loads `photos/collections.json` through `Photos.load()` (`photos.js`); nothing is hardcoded per trip.
- **Array order of `trips` is display order**: first trip = first on the home cover row and first card on
  "All collections". A trip's cover is its first image. Order of `images` is the order shown on the trip page.
- Trips with no images are skipped on the home cover row; a trip page is just `slug` + `images`.
- `place` is the display name, `date` is an optional string like `"2026"`.
- Pages pick image sizes via `srcset` from `w480/w960/w1600` (only widths smaller than the photo's recorded
  `width`) plus the original. If you change widths, update `VARIANT_WIDTHS` in **both** `photos.js` and
  `scripts/prepare-photos.mjs`.
- Entries in `images` may be a bare filename string or `{file, width, height}`; the prepare script upgrades them.

## Photo pipeline: `prepare-photos.yml`

- **Trigger:** push to `main` touching `photos/**` (excluding `photos/*/w<N>/**`, `photos/collections.json`,
  `photos/README.md`), or changes to `scripts/prepare-photos.mjs`, `package.json`, `package-lock.json`, or the workflow
  itself; also manual `workflow_dispatch`. Concurrency group `prepare-photos` (runs queue, never race).
- **What `scripts/prepare-photos.mjs` does** (idempotent):
  1. Scans `photos/<slug>/*.jpg|jpeg` (top level of each trip folder only). Any file not in `collections.json` is added.
     - A **new folder = a new trip**: `place` is derived from the slug (`north-cascades` -> "North Cascades") and the trip is
       **inserted at the TOP** of `trips` (`unshift`).
     - New photos for an **existing trip are appended at the END** of that trip's `images` (sorted by natural filename order).
  2. Any original wider than **2400px** (after EXIF rotation) is shrunk in place to 2400px wide (JPEG q85, rotation applied);
     its smaller copies are first regenerated from the full-size file.
  3. Records `width`/`height` for each photo.
  4. Generates `w480/`, `w960/`, `w1600/` copies (q78) for any that are missing and smaller than the photo.
- It only handles JPEGs. Photos already in the manifest and <=2400px are never rewritten.
- **Manual edits to `collections.json` are fine and preserved**: reordering trips or images, editing `place`/`date`.
  The script never re-sorts existing trips; it only unshifts new trips and appends new images.
- The workflow commits `photos/` changes to `main` as `github-actions[bot]` (retries push up to 3x with rebase) and then
  requests a Pages build with `gh api -X POST repos/<repo>/pages/builds`. That request is needed because pushes made
  with `GITHUB_TOKEN` don't start Pages builds or other workflows.

## Daily Google Drive import: `import-drive-photos.yml`

- **Schedule:** `cron: "0 16 * * *"` (16:00 UTC = 9 AM Pacific daylight time, 8 AM in winter) plus manual `workflow_dispatch`.
- **Auth/config (repo secrets, never commit them):** `GDRIVE_SA_KEY` (JSON key of a Google Cloud service account with Editor
  access to the Drive folder) and `GDRIVE_FOLDER_ID` (id of the Drive folder named "Site Photos"). Scope is full `drive`
  because files get moved.
- **Drive layout:** each subfolder of "Site Photos" is a trip. The folder name becomes the slug (lowercased, non-alphanumerics -> `-`,
  e.g. "Big Island" -> `big-island`). Matching an existing slug adds to that trip; any other name creates a new trip.
  Only JPG and HEIC/HEIF files directly in the trip folder are imported; other files and the `imported/` subfolder are ignored.
- **Import steps** (`node scripts/import-drive-photos.mjs`):
  - Skips any Drive file id already in `photos/.drive-imported.json`.
  - HEIC/HEIF -> JPG with `heif-convert` (apt `libheif-examples` + `libheif-plugin-libde265`, installed in the workflow on `ubuntu-24.04`).
  - Filenames are sanitized (spaces/odd chars -> `-`); collisions get `-2`, `-3`, ...
  - For a **new trip**, `place` comes from the folder name and `date` is the **most common EXIF year** among the new photos
    (falls back to Drive's photo metadata; omitted if unknown). New trip is inserted at the top of `trips`.
  - A failed file is left in Drive and retried next run.
- **Then the workflow:** runs `prepare-photos.mjs` itself (sizes, w* copies, manifest images) -> commits to **`main` directly** (by design; no PR)
  -> requests a Pages build via the API -> only after a successful push runs `import-drive-photos.mjs --finish`, which moves the
  files into an `imported/` subfolder of the trip folder in Drive. If the move fails, the ledger prevents re-import and the next run retries the move.
- **Why it does everything itself:** pushes made with `GITHUB_TOKEN` don't trigger other workflows (so `prepare-photos.yml`
  won't fire) or Pages builds.
- **Concurrency:** shares the `prepare-photos` group with `prepare-photos.yml`, so they never write to `main` at once.
- **Keepalive:** a separate `keepalive` job (scheduled runs only, `actions: write`) re-enables the workflow through the API each day
  so GitHub's 60-day-inactivity auto-disable never kicks in.
- **Trigger manually:** `gh workflow run import-drive-photos.yml --ref main` (then `gh run list --workflow import-drive-photos.yml`).
- **Gotcha:** files uploaded to Drive moments before a run may not be listed by the API yet. Just rerun it or wait for the next daily run.
- Dry run locally (changes nothing): `node scripts/import-drive-photos.mjs --list` with the two env vars set
  (`GDRIVE_SA_KEY` or `GDRIVE_SA_KEY_FILE`, and `GDRIVE_FOLDER_ID`). Don't do this unless the user has provided credentials.

## Conventions and guardrails

- **Code changes go through pull requests**, not direct pushes to `main`. The intended exception is the automated photo commits
  from the two Actions above (`github-actions[bot]`).
- Pull before working locally: the bots commit to `main` (new photos, `collections.json`, `.drive-imported.json`).
- Keep originals **<=2400px wide**, and don't commit huge photos/binaries. Repo history was rewritten on 2026-10-22 to remove big
  photos; don't reintroduce them. The pipeline shrinks oversized JPEGs, but they would still sit in git history.
- **Never commit secrets**: no service account keys, tokens or the Drive folder id. Use repo secrets.
- Don't hand-edit `w480/`, `w960/`, `w1600/` copies or `.drive-imported.json`; they're generated.
- To remove a photo: delete it from `images` in `collections.json` and delete the file and its `w*/` copies.
- Run **`npm install` (or `npm ci`) then `npm test`** before opening a PR. Tests (`node --test`) cover the Drive importer against a fake Drive
  (the HEIC test is skipped if `heif-convert` isn't installed). There is no test for the site's front end or `prepare-photos.mjs`;
  to try the latter locally, run `npm run prepare-photos` on a scratch copy of `photos/`.
- Workflow or script changes can't be fully verified locally; say so in the PR and suggest a manual `workflow_dispatch` after merge.
