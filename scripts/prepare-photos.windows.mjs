// Windows copy of prepare-photos.mjs.
// Adds any full-size JPEGs under photos/<slug>/ to collections.json, records
// width/height, then makes smaller copies in <slug>/w<width>/ using Windows
// PowerShell and System.Drawing (no sips).
// Run after adding photos: node scripts/prepare-photos.windows.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Keep in sync with VARIANT_WIDTHS in photos.js.
const VARIANT_WIDTHS = [480, 960, 1600];
const JPEG_QUALITY = "78";

const photosDir = join(dirname(fileURLToPath(import.meta.url)), "..", "photos");
const manifestPath = join(photosDir, "collections.json");

const resizePs = [
  "Add-Type -AssemblyName System.Drawing",
  "$src = [System.Drawing.Image]::FromFile($env:PREP_SRC)",
  "$newW = [int]$env:PREP_WIDTH",
  "$newH = [int][Math]::Round($src.Height * ($newW / $src.Width))",
  "$bmp = New-Object System.Drawing.Bitmap $newW, $newH",
  "$g = [System.Drawing.Graphics]::FromImage($bmp)",
  "$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic",
  "$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality",
  "$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality",
  "$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality",
  "$g.DrawImage($src, 0, 0, $newW, $newH)",
  "$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }",
  "$ep = New-Object System.Drawing.Imaging.EncoderParameters 1",
  "$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]$env:PREP_QUALITY)",
  "$bmp.Save($env:PREP_DEST, $codec, $ep)",
  "$g.Dispose()",
  "$bmp.Dispose()",
  "$src.Dispose()"
].join("; ");

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

const IMAGE_EXT = /\.(jpe?g)$/i;

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

function syncManifestImages(manifest) {
  const trips = Array.isArray(manifest.trips) ? manifest.trips : [];
  const bySlug = new Map(trips.filter((trip) => trip && trip.slug).map((trip) => [trip.slug, trip]));
  let added = 0;

  const slugs = readdirSync(photosDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !/^w\d+$/.test(entry.name))
    .map((entry) => entry.name);

  for (const slug of slugs) {
    const files = listFullSizeImages(slug);
    let trip = bySlug.get(slug);
    if (!trip) {
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

function makeVariant(source, width, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  execFileSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    resizePs
  ], {
    stdio: "ignore",
    env: {
      ...process.env,
      PREP_SRC: source,
      PREP_DEST: dest,
      PREP_WIDTH: String(width),
      PREP_QUALITY: JPEG_QUALITY
    }
  });
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const added = syncManifestImages(manifest);
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
console.log(`Added ${added} file${added === 1 ? "" : "s"}, recorded ${sized} size(s), made ${made} smaller cop${made === 1 ? "y" : "ies"}.`);
