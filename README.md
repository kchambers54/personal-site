# personal-site

Keller Chambers' site for photos and coding projects, served by GitHub Pages at
https://kchambers54.github.io/personal-site/ from the `main` branch.

## What's here

- `index.html` is the home page.
- `photos/` is for photo work. To add photos, put full-size JPGs in `photos/<trip-slug>/` on `main`
  and a GitHub Action prepares them. See [photos/README.md](photos/README.md).
- `projects/` is for writeups of coding projects.
- `scripts/prepare-photos.mjs` is the photo prep script the Action runs
  (`npm install && node scripts/prepare-photos.mjs` to run it locally).
