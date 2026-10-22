# Photos

One folder per trip, e.g. `photos/alaska-2026/`. The list of trips and photos the site shows is
`collections.json`.

## Adding photos

Put full-size JPGs in `photos/<trip-slug>/` on `main`, any way you like:

- on github.com: open the trip folder, **Add file > Upload files**, commit to `main`
  (for a new trip, open `photos/` and drag in a whole folder named after the trip, e.g. `north-cascades`)
- from the GitHub mobile app or any phone upload that commits to `main`
- or `git add` / `git push` as usual

That's it. The **Prepare photos** GitHub Action (`.github/workflows/prepare-photos.yml`) then:

1. adds any new JPGs to `collections.json` (a new folder becomes a new trip, named from the folder,
   so `north-cascades` shows as "North Cascades")
2. shrinks new photos wider than 2400px to 2400px wide (and applies their camera rotation)
3. records each photo's width and height
4. makes the smaller copies in `<trip>/w480/`, `w960/` and `w1600/` that pages pick between by screen size

It commits the result to `main` as `github-actions[bot]` and asks GitHub Pages to rebuild, so the
site updates a minute or two later. Pull before your next local change. You can also run it by hand
from the **Actions** tab (**Prepare photos > Run workflow**).

Photos already in `collections.json` with a width and height are never rewritten, and existing copies
are kept, so running it again changes nothing.

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
handled. Export HEIC/PNG photos as JPG first. If you change the copy widths, update
`VARIANT_WIDTHS` in both `scripts/prepare-photos.mjs` and `photos.js`.
