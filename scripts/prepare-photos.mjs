// Prepares photos listed in photos/collections.json:
// records each image's width/height, then makes smaller copies in <slug>/w<width>/ with macOS sips.
// Run after adding photos: node scripts/prepare-photos.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Keep in sync with VARIANT_WIDTHS in photos.js.
const VARIANT_WIDTHS = [480, 960, 1600];
const JPEG_QUALITY = "78";

const photosDir = join(dirname(fileURLToPath(import.meta.url)), "..", "photos");
const manifestPath = join(photosDir, "collections.json");

// Reads pixel size from a JPEG's start-of-frame marker.
function jpegSize(path) {
  const buf = readFileSync(path);
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += marker === 0xff ? 1 : 2;
      continue;
    }
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("No JPEG size found in " + path);
}

function makeVariant(source, width, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  execFileSync("sips", [
    "--resampleWidth", String(width),
    "-s", "formatOptions", JPEG_QUALITY,
    source, "--out", dest
  ], { stdio: "ignore" });
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
let sized = 0;
let made = 0;

for (const trip of manifest.trips || []) {
  trip.images = (trip.images || []).map((entry) => {
    let image = typeof entry === "string" ? { file: entry } : entry;
    const source = join(photosDir, trip.slug, image.file);
    if (!image.width || !image.height) {
      try {
        image = { ...image, ...jpegSize(source) };
        sized += 1;
      } catch (err) {
        console.warn(err.message);
        return image;
      }
    }
    for (const width of VARIANT_WIDTHS) {
      if (width >= image.width) continue;
      const dest = join(photosDir, trip.slug, "w" + width, image.file);
      if (existsSync(dest)) continue;
      makeVariant(source, width, dest);
      made += 1;
    }
    return image;
  });
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Recorded ${sized} size(s), made ${made} smaller cop${made === 1 ? "y" : "ies"}.`);
