# Photos

Put photo sets here, one folder per set, and list them in `collections.json`.

After adding photos, run `node scripts/prepare-photos.mjs` (macOS, uses `sips`). It records each
image's width and height and makes smaller copies in `<set>/w480/`, `w960/` and `w1600/`, which
pages pick between by screen size. Entries can be listed as plain filenames (`"01.jpg"`); the
script fills in the rest.
