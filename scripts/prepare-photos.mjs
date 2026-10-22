// Prepares the photos in photos/<slug>/ for the site. Works on macOS, Windows and Linux (CI).
//   1. Adds any full-size JPEGs found in photos/<slug>/ to photos/collections.json
//      (a new folder becomes a new trip, with `place` made from the folder name).
//   2. For new photos (no width/height in the manifest yet) wider than MAX_ORIGINAL_WIDTH,
//      shrinks the original in place, applying its EXIF rotation.
//   3. Records each photo's width and height.
//   4. Makes smaller copies in photos/<slug>/w<width>/ for the site to pick from by screen size.
// Safe to run again: photos already recorded and copies that already exist are left alone.
// Run: npm install && node scripts/prepare-photos.mjs   (GitHub Actions runs it on push too.)
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Keep in sync with VARIANT_WIDTHS in photos.js.
const VARIANT_WIDTHS = [480, 960, 1600];
const VARIANT_QUALITY = 78;
const MAX_ORIGINAL_WIDTH = 2400;
const ORIGINAL_QUALITY = 85;
const IMAGE_EXT = /\.(jpe?g)$/i;
const VARIANT_DIR = /^w\d+$/;

const photosDir = join(dirname(fileURLToPath(import.meta.url)), "..", "photos");
const manifestPath = join(photosDir, "collections.json");

// Avoid stale reads of files we just rewrote.
sharp.cache(false);

function imageFile(entry) {
  return typeof entry === "string" ? entry : entry && entry.file;
}

function placeFromSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function listFullSizeImages(slug) {
  return readdirSync(join(photosDir, slug), { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXT.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

// Adds JPEGs found on disk but missing from the manifest. Returns how many were added.
function syncManifestImages(manifest) {
  const trips = Array.isArray(manifest.trips) ? manifest.trips : [];
  const bySlug = new Map(trips.filter((trip) => trip && trip.slug).map((trip) => [trip.slug, trip]));
  let added = 0;

  const slugs = readdirSync(photosDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !VARIANT_DIR.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  for (const slug of slugs) {
    const files = listFullSizeImages(slug);
    let trip = bySlug.get(slug);
    if (!trip) {
      if (!files.length) continue;
      trip = { slug, place: placeFromSlug(slug), images: [] };
      trips.push(trip);
      bySlug.set(slug, trip);
    }
    const listed = new Set((trip.images || []).map(imageFile).filter(Boolean));
    const extras = files.filter((file) => !listed.has(file));
    if (!extras.length) continue;
    trip.images = [...(trip.images || []), ...extras.map((file) => ({ file }))];
    added += extras.length;
  }

  manifest.trips = trips;
  return added;
}

// Width/height as displayed, i.e. after EXIF rotation.
async function displaySize(path) {
  const meta = await sharp(path).metadata();
  const turned = meta.orientation >= 5;
  return turned ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height };
}

// Shrinks a new original to MAX_ORIGINAL_WIDTH in place. Returns true if it was rewritten.
async function shrinkOriginal(path) {
  const { width } = await displaySize(path);
  if (width <= MAX_ORIGINAL_WIDTH) return false;
  const tmp = path + ".tmp";
  try {
    await sharp(path)
      .rotate()
      .resize({ width: MAX_ORIGINAL_WIDTH })
      .jpeg({ quality: ORIGINAL_QUALITY })
      .toFile(tmp);
    renameSync(tmp, path);
  } finally {
    rmSync(tmp, { force: true });
  }
  return true;
}

async function makeVariant(source, width, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  await sharp(source)
    .rotate()
    .resize({ width })
    .jpeg({ quality: VARIANT_QUALITY })
    .toFile(dest);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const added = syncManifestImages(manifest);
let shrunk = 0;
let sized = 0;
let made = 0;
let failed = 0;

for (const trip of manifest.trips || []) {
  const images = [];
  for (const entry of trip.images || []) {
    let image = typeof entry === "string" ? { file: entry } : entry;
    const source = join(photosDir, trip.slug, image.file);
    try {
      if (!image.width || !image.height) {
        if (await shrinkOriginal(source)) shrunk += 1;
        image = { ...image, ...(await displaySize(source)) };
        sized += 1;
      }
      for (const width of VARIANT_WIDTHS) {
        if (width >= image.width) continue;
        const dest = join(photosDir, trip.slug, "w" + width, image.file);
        if (existsSync(dest)) continue;
        await makeVariant(source, width, dest);
        made += 1;
      }
    } catch (err) {
      // Same as before: report and carry on with the other photos.
      const message = `${trip.slug}/${image.file}: ${err.message}`;
      console.warn(process.env.GITHUB_ACTIONS ? `::warning::${message}` : message);
      failed += 1;
    }
    images.push(image);
  }
  trip.images = images;
}

const before = readFileSync(manifestPath, "utf8");
const after = JSON.stringify(manifest, null, 2) + "\n";
if (after !== before) writeFileSync(manifestPath, after);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
console.log(
  `Added ${plural(added, "file", "files")}, shrank ${plural(shrunk, "original", "originals")}, ` +
  `recorded ${sized} size(s), made ${plural(made, "smaller copy", "smaller copies")}.`
);
if (failed) console.warn(`${plural(failed, "photo was", "photos were")} skipped (see above).`);
