# personal-site

Keller Chambers' site for photos and coding projects, served by GitHub Pages at
https://kchambers54.github.io/personal-site/ from the `main` branch.

## What's here

- `index.html` is the home page.
- `photos/` is for photo work. To add photos, put full-size JPGs in `photos/<trip-slug>/` on `main`
  and a GitHub Action prepares them. Or drop them in a trip folder in the "Site Photos" Google Drive
  folder and a daily Action publishes them. See [photos/README.md](photos/README.md).
- `projects/` is for writeups of coding projects.
- `scripts/prepare-photos.mjs` is the photo prep script the Action runs
  (`npm install && node scripts/prepare-photos.mjs` to run it locally).
- `scripts/import-drive-photos.mjs` pulls new photos from Google Drive for the daily import Action
  (needs the `GDRIVE_SA_KEY` and `GDRIVE_FOLDER_ID` repo secrets).
