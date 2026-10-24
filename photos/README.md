# Photos

One folder per trip, e.g. `photos/alaska-2026/`. The list of trips and photos the site shows is
`collections.json`.

## Adding photos

Put full-size JPGs in `photos/<trip-slug>/` on `main`, any way you like:

- on github.com: open the trip folder, **Add file > Upload files**, commit to `main`
  (for a new trip, open `photos/` and drag in a whole folder named after the trip, e.g. `north-cascades`)
- from the GitHub mobile app or any phone upload that commits to `main`
- or `git add` / `git push` as usual
- or drop them in Google Drive (see [From Google Drive](#from-google-drive) below)

That's it. The **Prepare photos** GitHub Action (`.github/workflows/prepare-photos.yml`) then:

1. adds any new JPGs to `collections.json` (a new folder becomes a new trip, named from the folder,
   so `north-cascades` shows as "North Cascades")
2. shrinks any photo wider than 2400px to 2400px wide (applying its camera rotation), remaking its copies
3. records each photo's width and height
4. makes the smaller copies in `<trip>/w480/`, `w960/` and `w1600/` that pages pick between by screen size

It commits the result to `main` as `github-actions[bot]` and asks GitHub Pages to rebuild, so the
site updates a minute or two later. Pull before your next local change. You can also run it by hand
from the **Actions** tab (**Prepare photos > Run workflow**).

Photos 2400px wide or less that are already in `collections.json` are never rewritten, and existing copies
are kept, so running it again changes nothing.

## From Google Drive

The **Import photos from Google Drive** GitHub Action (`.github/workflows/import-drive-photos.yml`)
checks a Drive folder every morning at about 9 AM Pacific and publishes new photos to the site on its
own, with no review step. Lay the folder out like this:

```
Site Photos/              <- the top folder (its ID is the GDRIVE_FOLDER_ID secret)
  Big Island/             <- one folder per trip; becomes photos/big-island/
    IMG_0001.HEIC
    DSC_1234.jpg
    imported/             <- made by the Action; photos are moved here once they're on the site
  Alaska 2026/            <- matches the existing alaska-2026 trip, so photos are added to it
```

- The trip folder name becomes the slug: lowercased, with spaces and other odd characters turned
  into hyphens. "Big Island" becomes `big-island`. Name the folder to match an existing trip
  (`Seattle`, `Mt Rainier`, `Alaska 2026`, `WA Cascades`) to add to it; any other name starts a new trip.
- JPG and HEIC/HEIF photos are imported. HEIC (iPhone) photos are converted to JPG. Other files
  (videos, PNGs) are left where they are.
- File names are kept, with spaces and odd characters turned into hyphens. If a trip already has a
  photo with that name, `-2` (or `-3`, ...) is added.
- A new trip gets its `place` from the folder name and, when the photos have a camera date, its `date`
  set to the year most of them were taken.
- After the photos are pushed to `main`, the Action moves them into the trip's `imported/` folder in
  Drive. If a run fails, nothing is moved and the next day's run tries again. `photos/.drive-imported.json`
  lists the Drive files already imported, so a photo is never imported twice.
- To run it right away: **Actions > Import photos from Google Drive > Run workflow**.

It runs the same steps as Prepare photos (above) itself, commits as `github-actions[bot]` and asks
GitHub Pages to rebuild.

### Setting it up

1. In Google Cloud, enable the Google Drive API, create a service account and download a JSON key for it.
2. Share the "Site Photos" folder with the service account's email address as **Editor** (needed to
   create the `imported/` folders and move files).
3. In the repo, **Settings > Secrets and variables > Actions**, add:
   - `GDRIVE_SA_KEY`: the whole JSON key file
   - `GDRIVE_FOLDER_ID`: the folder's ID, the last part of its URL
     (`https://drive.google.com/drive/folders/<ID>`)

The script uses the `https://www.googleapis.com/auth/drive` scope. To check the setup without changing
anything, run it locally with `--list`:

```
GDRIVE_SA_KEY_FILE=path/to/key.json GDRIVE_FOLDER_ID=... node scripts/import-drive-photos.mjs --list
```

GitHub switches off scheduled workflows after 60 days with no activity in a public repo. The workflow
re-enables itself through the GitHub API on each scheduled run so that doesn't happen. If it ever does
get switched off, turn it back on in the Actions tab.

## Editing a trip

Edit `collections.json` directly to change how a trip is shown:

- `place`: the name shown for the trip (filled in from the folder name at first)
- `date`: optional, e.g. `"2026"`
- the order of `images`: photos show in this order; new ones are added at the end

To remove a photo, delete it from `images` and delete the file and its `w*/` copies.

## Running it locally

```
npm install
node scripts/prepare-photos.mjs
```

Works on macOS, Windows and Linux (uses [sharp](https://sharp.pixelplumbing.com/)). Only JPGs are
handled. Export HEIC/PNG photos as JPG first (the Drive import converts HEIC for you).
`npm test` runs the Drive import's tests against a fake Drive. If you change the copy widths, update
`VARIANT_WIDTHS` in both `scripts/prepare-photos.mjs` and `photos.js`.
