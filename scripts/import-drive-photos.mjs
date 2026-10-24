// Imports new photos from a Google Drive folder into photos/<slug>/.
// The GitHub Action .github/workflows/import-drive-photos.yml runs it every day. See photos/README.md.
//
// Drive layout (the top folder's ID is GDRIVE_FOLDER_ID):
//   Site Photos/
//     Big Island/          -> photos/big-island/   (one subfolder per trip; the name becomes the slug)
//       IMG_0001.HEIC      -> photos/big-island/IMG_0001.jpg   (HEIC/HEIF converted to JPG)
//       DSC_1234.jpg       -> photos/big-island/DSC_1234.jpg
//       imported/          <- files are moved here once they are live on main; ignored otherwise
//
// Usage:
//   node scripts/import-drive-photos.mjs            download new photos into photos/<slug>/
//   node scripts/import-drive-photos.mjs --list     only list what would be imported (changes nothing)
//   node scripts/import-drive-photos.mjs --finish   move already-imported files into each trip's imported/ folder
//
// Credentials: GDRIVE_SA_KEY (the service account's JSON key, as text) or GDRIVE_SA_KEY_FILE (a path to it),
// and GDRIVE_FOLDER_ID (the top folder). The service account needs Editor access on the top folder.
//
// Every imported Drive file ID is recorded in photos/.drive-imported.json, committed with the photos.
// A file in that list is never downloaded again, so if moving it to imported/ fails after the push,
// the next run just retries the move instead of importing a duplicate.
import { execFileSync } from "node:child_process";
import { appendFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"; // full scope: needed to move files
export const IMPORTED_FOLDER = "imported";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const JPEG_EXT = /\.jpe?g$/i;
const HEIC_EXT = /\.hei[cf]$/i;
const JPEG_MIME = new Set(["image/jpeg", "image/jpg", "image/pjpeg"]);
const HEIC_MIME = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
const VARIANT_DIR = /^w\d+$/;
const LEDGER_FILE = ".drive-imported.json";

const defaultPhotosDir = join(dirname(fileURLToPath(import.meta.url)), "..", "photos");

// "Big Island" -> "big-island", "Mt. Rainier!" -> "mt-rainier", "Zürich 2026" -> "zurich-2026".
export function slugFromFolderName(name) {
  return String(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Same rule as prepare-photos.mjs, so a trip created here looks the same.
export function placeFromSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Returns "jpeg", "heic" or null for a Drive file.
export function photoKind(file) {
  if (JPEG_EXT.test(file.name)) return "jpeg";
  if (HEIC_EXT.test(file.name)) return "heic";
  if (extname(file.name)) return null;
  if (JPEG_MIME.has(file.mimeType)) return "jpeg";
  if (HEIC_MIME.has(file.mimeType)) return "heic";
  return null;
}

// Keeps the base name but makes it safe in a URL/srcset: "IMG 0001 (1).HEIC" -> "IMG-0001-1.jpg".
export function targetFileName(file, kind) {
  const ext = extname(file.name);
  const rawBase = ext && photoKind({ name: file.name }) ? file.name.slice(0, -ext.length) : file.name;
  const base =
    rawBase
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "") || "photo";
  const outExt = kind === "heic" || !ext ? ".jpg" : ext.toLowerCase();
  return base + outExt;
}

// Adds -2, -3, ... before the extension until the name is not taken (case-insensitive).
export function uniqueName(name, taken) {
  const ext = extname(name);
  const base = name.slice(0, name.length - ext.length);
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) candidate = `${base}-${n}${ext}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

async function listChildren(drive, folderId) {
  const files = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, parents, imageMediaMetadata(time))",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return files;
}

// Fails early with a clear message if the service account can't see the top folder.
export async function checkTopFolder(drive, folderId, log = console.log) {
  let folder;
  try {
    const res = await drive.files.get({
      fileId: folderId,
      fields: "id, name, mimeType, capabilities(canAddChildren, canEdit, canRemoveChildren, canMoveChildrenWithinDrive)",
      supportsAllDrives: true,
    });
    folder = res.data;
  } catch (err) {
    throw new Error(`Can't open Drive folder ${folderId} (${err.message}). Share it with the service account as Editor.`);
  }
  if (folder.mimeType !== FOLDER_MIME) throw new Error(`Drive item ${folderId} ("${folder.name}") is not a folder.`);
  const caps = folder.capabilities || {};
  log(`Drive folder "${folder.name}": ${caps.canAddChildren && caps.canEdit ? "service account can edit" : "service account can NOT edit (give it Editor access)"}.`);
  return folder;
}

// Trip folders under the top folder, with the photos sitting directly in each (not in imported/).
export async function listTrips(drive, folderId, log = console.log) {
  const children = await listChildren(drive, folderId);
  const trips = [];
  for (const folder of children.filter((f) => f.mimeType === FOLDER_MIME)) {
    if (folder.name.trim().toLowerCase() === IMPORTED_FOLDER) continue;
    const slug = slugFromFolderName(folder.name);
    if (!slug || VARIANT_DIR.test(slug)) {
      log(`Skipping Drive folder "${folder.name}": it doesn't make a usable trip name.`);
      continue;
    }
    const items = await listChildren(drive, folder.id);
    const importedFolder = items.find((f) => f.mimeType === FOLDER_MIME && f.name.trim().toLowerCase() === IMPORTED_FOLDER);
    const photos = [];
    for (const item of items) {
      if (item.mimeType === FOLDER_MIME) continue;
      const kind = photoKind(item);
      if (kind) photos.push({ ...item, kind });
      else log(`Skipping "${folder.name}/${item.name}": only JPG and HEIC photos are imported.`);
    }
    photos.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    trips.push({ folder, slug, photos, importedFolder });
  }
  trips.sort((a, b) => a.slug.localeCompare(b.slug));
  return trips;
}

export function readLedger(photosDir) {
  const path = join(photosDir, LEDGER_FILE);
  if (!existsSync(path)) return { files: {} };
  const ledger = JSON.parse(readFileSync(path, "utf8"));
  return { ...ledger, files: ledger.files || {} };
}

function writeLedger(photosDir, ledger) {
  const sorted = Object.fromEntries(Object.entries(ledger.files).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(join(photosDir, LEDGER_FILE), JSON.stringify({ ...ledger, files: sorted }, null, 2) + "\n");
}

async function download(drive, fileId, dest) {
  const res = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "stream" });
  await pipeline(res.data, createWriteStream(dest));
}

// HEIC -> JPG with libheif's heif-convert (apt package libheif-examples; sharp's prebuilt binaries can't
// read HEIC). It applies the photo's rotation and keeps its EXIF data.
export function heifConvert(source, dest) {
  const outDir = dirname(dest);
  execFileSync("heif-convert", ["-q", "92", source, dest], { stdio: ["ignore", "ignore", "pipe"] });
  if (existsSync(dest)) return;
  // A file holding several images is written as name-1.jpg, name-2.jpg, ...; keep the first (primary) one.
  const stem = dest.slice(0, -extname(dest).length);
  const first = readdirSync(outDir)
    .map((f) => join(outDir, f))
    .filter((f) => f.startsWith(stem + "-") && JPEG_EXT.test(f))
    .sort()[0];
  if (!first) throw new Error("heif-convert produced no JPG");
  renameSync(first, dest);
}

// Year the photo was taken, from its EXIF data, or from Drive's photo metadata. Null when unknown.
async function photoYear(path, driveFile) {
  try {
    const { default: sharp } = await import("sharp");
    const { default: exifReader } = await import("exif-reader");
    const { exif } = await sharp(path).metadata();
    if (exif) {
      const tags = exifReader(exif);
      const date = tags?.Photo?.DateTimeOriginal || tags?.Photo?.DateTimeDigitized || tags?.Image?.DateTime;
      const year = date instanceof Date && !Number.isNaN(date.getTime()) ? date.getUTCFullYear() : null;
      if (year >= 1900 && year <= 2100) return year;
    }
  } catch {
    // Fall through to Drive's metadata.
  }
  const match = /^(\d{4}):/.exec(driveFile?.imageMediaMetadata?.time || "");
  const year = match ? Number(match[1]) : null;
  return year >= 1900 && year <= 2100 ? year : null;
}

// The year most of the photos were taken (the earlier one on a tie), or null.
export function mostCommonYear(years) {
  const counts = new Map();
  for (const year of years) if (year) counts.set(year, (counts.get(year) || 0) + 1);
  let best = null;
  for (const [year, count] of counts) {
    if (best === null || count > counts.get(best) || (count === counts.get(best) && year < best)) best = year;
  }
  return best;
}

// Downloads every photo not yet imported. Returns { imported, pending, wouldImport }.
// `pending` counts photos already on the site that still sit in their Drive trip folder.
export async function importFromDrive({ drive, folderId, photosDir = defaultPhotosDir, listOnly = false, convertHeic = heifConvert, log = console.log, warn = console.warn }) {
  await checkTopFolder(drive, folderId, log);
  const trips = await listTrips(drive, folderId, log);
  const ledger = readLedger(photosDir);
  const manifestPath = join(photosDir, "collections.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.trips = Array.isArray(manifest.trips) ? manifest.trips : [];
  const known = new Set(manifest.trips.map((t) => t && t.slug).filter(Boolean));

  let imported = 0;
  let pending = 0;
  let wouldImport = 0;
  let failed = 0;
  let manifestChanged = false;
  const tmp = listOnly ? null : mkdtempSync(join(tmpdir(), "drive-photos-"));

  try {
    for (const trip of trips) {
      const fresh = trip.photos.filter((p) => !ledger.files[p.id]);
      pending += trip.photos.length - fresh.length;
      const isNew = !known.has(trip.slug);
      log(`${trip.folder.name} -> photos/${trip.slug}/ (${isNew ? "new trip" : "existing trip"}): ${fresh.length} new photo(s)`);
      if (listOnly) {
        for (const photo of fresh) log(`  ${photo.name}${photo.kind === "heic" ? " (HEIC, will be converted to JPG)" : ""}`);
        wouldImport += fresh.length;
        continue;
      }
      if (!fresh.length) continue;

      const tripDir = join(photosDir, trip.slug);
      const taken = new Set();
      if (existsSync(tripDir)) for (const f of readdirSync(tripDir)) taken.add(f.toLowerCase());
      for (const t of manifest.trips.filter((t) => t && t.slug === trip.slug)) {
        for (const image of t.images || []) {
          const file = typeof image === "string" ? image : image && image.file;
          if (file) taken.add(file.toLowerCase());
        }
      }

      const years = [];
      for (const photo of fresh) {
        const name = uniqueName(targetFileName(photo, photo.kind), taken);
        const dest = join(tripDir, name);
        const work = mkdtempSync(join(tmp, "f-"));
        try {
          const raw = join(work, photo.kind === "heic" ? "photo.heic" : "photo.jpg");
          await download(drive, photo.id, raw);
          let ready = raw;
          if (photo.kind === "heic") {
            ready = join(work, "converted.jpg");
            convertHeic(raw, ready);
          }
          mkdirSync(tripDir, { recursive: true });
          renameSync(ready, dest);
          ledger.files[photo.id] = `${trip.slug}/${name}`;
          imported += 1;
          log(`  ${photo.name} -> photos/${trip.slug}/${name}`);
          if (isNew) years.push(await photoYear(dest, photo));
        } catch (err) {
          taken.delete(name.toLowerCase());
          failed += 1;
          const message = `${trip.folder.name}/${photo.name}: ${err.message} (left in Drive; will retry next run)`;
          warn(process.env.GITHUB_ACTIONS ? `::warning::${message}` : message);
        } finally {
          rmSync(work, { recursive: true, force: true });
        }
      }

      // A new trip: add it now so it can get a year; prepare-photos.mjs fills in its images.
      if (isNew && years.length) {
        const entry = { slug: trip.slug, place: placeFromSlug(trip.slug) };
        const year = mostCommonYear(years);
        if (year) entry.date = String(year);
        entry.images = [];
        manifest.trips.unshift(entry); // newest trips go first on the collections page
        known.add(trip.slug);
        manifestChanged = true;
      }
    }
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }

  if (!listOnly && imported) {
    writeLedger(photosDir, ledger);
    if (manifestChanged) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  }
  if (listOnly) log(`Would import ${wouldImport} photo(s); ${pending} already imported and waiting to be moved to ${IMPORTED_FOLDER}/.`);
  else log(`Imported ${imported} photo(s)${failed ? `, ${failed} failed` : ""}; ${pending} older one(s) waiting to be moved to ${IMPORTED_FOLDER}/.`);
  return { imported, pending: pending + imported, wouldImport, failed };
}

// Moves every photo recorded in the ledger that still sits in its trip folder into that folder's
// imported/ subfolder (created if missing). Run only after the photos are pushed to main.
export async function finishImports({ drive, folderId, photosDir = defaultPhotosDir, log = console.log }) {
  const trips = await listTrips(drive, folderId, () => {});
  const ledger = readLedger(photosDir);
  let moved = 0;
  for (const trip of trips) {
    const done = trip.photos.filter((p) => ledger.files[p.id]);
    if (!done.length) continue;
    let target = trip.importedFolder;
    if (!target) {
      const res = await drive.files.create({
        requestBody: { name: IMPORTED_FOLDER, mimeType: FOLDER_MIME, parents: [trip.folder.id] },
        fields: "id, name",
        supportsAllDrives: true,
      });
      target = res.data;
    }
    for (const photo of done) {
      await drive.files.update({
        fileId: photo.id,
        addParents: target.id,
        removeParents: trip.folder.id,
        fields: "id, parents",
        supportsAllDrives: true,
      });
      moved += 1;
      log(`Moved ${trip.folder.name}/${photo.name} to ${trip.folder.name}/${IMPORTED_FOLDER}/`);
    }
  }
  log(`Moved ${moved} file(s) to ${IMPORTED_FOLDER}/ folders.`);
  return { moved };
}

export async function driveClient() {
  const { auth, drive } = await import("@googleapis/drive");
  let keyText = process.env.GDRIVE_SA_KEY;
  if (!keyText && process.env.GDRIVE_SA_KEY_FILE) keyText = readFileSync(process.env.GDRIVE_SA_KEY_FILE, "utf8");
  if (!keyText) throw new Error("Set GDRIVE_SA_KEY (the service account JSON key) or GDRIVE_SA_KEY_FILE.");
  let credentials;
  try {
    credentials = JSON.parse(keyText);
  } catch {
    throw new Error("GDRIVE_SA_KEY is not valid JSON. Paste the whole key file as the secret.");
  }
  const client = new auth.GoogleAuth({ credentials, scopes: [DRIVE_SCOPE] });
  return drive({ version: "v3", auth: client });
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const folderId = (process.env.GDRIVE_FOLDER_ID || "").trim();
  if (!folderId) throw new Error("Set GDRIVE_FOLDER_ID to the ID of the top Drive folder.");
  const drive = await driveClient();
  if (args.includes("--finish")) {
    await finishImports({ drive, folderId });
    return;
  }
  const result = await importFromDrive({ drive, folderId, listOnly: args.includes("--list") });
  setOutput("imported", result.imported);
  setOutput("pending", result.pending);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(process.env.GITHUB_ACTIONS ? `::error::${err.message}` : err.message);
    process.exit(1);
  });
}
