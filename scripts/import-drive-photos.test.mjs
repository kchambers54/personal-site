// Tests for import-drive-photos.mjs against an in-memory fake of the Drive API (no credentials needed).
// Run: node --test scripts/import-drive-photos.test.mjs   (the HEIC test needs heif-enc and heif-convert from libheif-examples)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { finishImports, importFromDrive, mostCommonYear, slugFromFolderName, targetFileName, uniqueName } from "./import-drive-photos.mjs";

const FOLDER = "application/vnd.google-apps.folder";
const repoPhotos = join(dirname(fileURLToPath(import.meta.url)), "..", "photos");
const hasHeif = (() => {
  try {
    execFileSync("sh", ["-c", "command -v heif-enc && command -v heif-convert"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

// Minimal stand-in for drive.files: list (by parent), get (metadata or alt=media), create, update.
function fakeDrive(items) {
  const byId = new Map(items.map((item) => [item.id, { ...item }]));
  let next = 1;
  const calls = { create: [], update: [] };
  const files = {
    async list({ q, pageToken }) {
      const parent = /'([^']+)' in parents/.exec(q)[1];
      const all = [...byId.values()].filter((f) => f.parents.includes(parent) && !f.trashed);
      // Page in twos to exercise nextPageToken.
      const start = pageToken ? Number(pageToken) : 0;
      const page = all.slice(start, start + 2).map(({ body, ...meta }) => meta);
      return { data: { files: page, nextPageToken: start + 2 < all.length ? String(start + 2) : undefined } };
    },
    async get({ fileId, alt }) {
      const f = byId.get(fileId);
      if (!f) throw new Error(`File not found: ${fileId}.`);
      if (alt === "media") return { data: Readable.from([f.body]) };
      const { body, ...meta } = f;
      return { data: { ...meta, capabilities: { canAddChildren: true, canEdit: true } } };
    },
    async create({ requestBody }) {
      const id = `new${next++}`;
      byId.set(id, { id, ...requestBody });
      calls.create.push(requestBody);
      return { data: { id, name: requestBody.name } };
    },
    async update({ fileId, addParents, removeParents }) {
      const f = byId.get(fileId);
      f.parents = f.parents.filter((p) => p !== removeParents).concat(addParents);
      calls.update.push({ fileId, addParents, removeParents });
      return { data: { id: fileId, parents: f.parents } };
    },
  };
  return { drive: { files }, byId, calls };
}

async function jpeg({ width = 800, height = 600, date } = {}) {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 40, g: 120, b: 200 } } });
  if (date) img = img.withExif({ IFD0: { DateTime: date }, IFD2: { DateTimeOriginal: date } });
  return img.jpeg().toBuffer();
}

function scratchPhotos() {
  const dir = mkdtempSync(join(tmpdir(), "photos-test-"));
  cpSync(join(repoPhotos, "collections.json"), join(dir, "collections.json"));
  // Pretend seattle/01.jpg is on disk so a Drive "01.jpg" must not overwrite it.
  execFileSync("mkdir", ["-p", join(dir, "seattle")]);
  cpSync(join(repoPhotos, "seattle", "01.jpg"), join(dir, "seattle", "01.jpg"));
  return dir;
}

const quiet = { log: () => {}, warn: () => {} };

test("slugs, file names and suffixes", () => {
  assert.equal(slugFromFolderName("Big Island"), "big-island");
  assert.equal(slugFromFolderName("Mt. Rainier"), "mt-rainier");
  assert.equal(slugFromFolderName("  WA Cascades "), "wa-cascades");
  assert.equal(slugFromFolderName("Alaska 2026"), "alaska-2026");
  assert.equal(slugFromFolderName("Zürich & Bern!"), "zurich-bern");
  assert.equal(targetFileName({ name: "IMG_0001.HEIC" }, "heic"), "IMG_0001.jpg");
  assert.equal(targetFileName({ name: "DSC 1 (2).JPG" }, "jpeg"), "DSC-1-2.jpg");
  assert.equal(targetFileName({ name: "photo", mimeType: "image/jpeg" }, "jpeg"), "photo.jpg");
  const taken = new Set(["01.jpg", "01-2.jpg"]);
  assert.equal(uniqueName("01.JPG", taken), "01-3.JPG");
  assert.equal(mostCommonYear([2025, 2026, 2026, null]), 2026);
  assert.equal(mostCommonYear([2026, 2025]), 2025);
  assert.equal(mostCommonYear([null]), null);
});

test("imports new photos, skips imported/ and other files, then moves them", async () => {
  const photosDir = scratchPhotos();
  try {
    const { drive, byId, calls } = fakeDrive([
      { id: "top", name: "Site Photos", mimeType: FOLDER, parents: ["root"] },
      { id: "sea", name: "Seattle", mimeType: FOLDER, parents: ["top"] },
      { id: "sea-imp", name: "imported", mimeType: FOLDER, parents: ["sea"] },
      { id: "old", name: "already.jpg", mimeType: "image/jpeg", parents: ["sea-imp"], body: await jpeg() },
      { id: "s1", name: "01.jpg", mimeType: "image/jpeg", parents: ["sea"], body: await jpeg() },
      { id: "s2", name: "Space Needle.jpeg", mimeType: "image/jpeg", parents: ["sea"], body: await jpeg() },
      { id: "vid", name: "clip.mov", mimeType: "video/quicktime", parents: ["sea"], body: "x" },
      { id: "big", name: "Big Island", mimeType: FOLDER, parents: ["top"] },
      { id: "b1", name: "a.jpg", mimeType: "image/jpeg", parents: ["big"], body: await jpeg({ date: "2024:03:01 10:00:00" }) },
      { id: "b2", name: "b.jpg", mimeType: "image/jpeg", parents: ["big"], body: await jpeg({ date: "2024:03:02 10:00:00" }) },
      { id: "b3", name: "c.jpg", mimeType: "image/jpeg", parents: ["big"], body: await jpeg(), imageMediaMetadata: { time: "2023:12:31 23:00:00" } },
      { id: "topimp", name: "Imported", mimeType: FOLDER, parents: ["top"] },
      { id: "t1", name: "stray.jpg", mimeType: "image/jpeg", parents: ["topimp"], body: await jpeg() },
    ]);

    const listed = await importFromDrive({ drive, folderId: "top", photosDir, listOnly: true, ...quiet });
    assert.equal(listed.wouldImport, 5);
    assert.equal(readdirSync(photosDir).sort().join(","), "collections.json,seattle"); // list mode writes nothing

    const first = await importFromDrive({ drive, folderId: "top", photosDir, ...quiet });
    assert.equal(first.imported, 5);
    assert.deepEqual(readdirSync(join(photosDir, "seattle")).sort(), ["01-2.jpg", "01.jpg", "Space-Needle.jpeg"]);
    assert.deepEqual(readdirSync(join(photosDir, "big-island")).sort(), ["a.jpg", "b.jpg", "c.jpg"]);
    assert.ok(!existsSync(join(photosDir, "imported")));
    const manifest = JSON.parse(readFileSync(join(photosDir, "collections.json"), "utf8"));
    const big = manifest.trips.find((t) => t.slug === "big-island");
    assert.deepEqual(big, { slug: "big-island", place: "Big Island", date: "2024", images: [] });
    assert.equal(manifest.trips.filter((t) => t.slug === "seattle").length, 1); // existing trip not duplicated
    const ledger = JSON.parse(readFileSync(join(photosDir, ".drive-imported.json"), "utf8"));
    assert.equal(ledger.files.s1, "seattle/01-2.jpg");

    // Push "failed": nothing moved yet, and a second run downloads nothing again.
    const again = await importFromDrive({ drive, folderId: "top", photosDir, ...quiet });
    assert.equal(again.imported, 0);
    assert.equal(again.pending, 5);

    const { moved } = await finishImports({ drive, folderId: "top", photosDir, ...quiet });
    assert.equal(moved, 5);
    assert.equal(calls.create.length, 1); // Big Island got an imported/ folder; Seattle reused its own
    assert.ok(byId.get("s1").parents.includes("sea-imp"));
    assert.ok(byId.get("b1").parents.includes("new1"));
    assert.deepEqual(byId.get("vid").parents, ["sea"]); // non-photos stay put

    const after = await importFromDrive({ drive, folderId: "top", photosDir, ...quiet });
    assert.deepEqual([after.imported, after.pending], [0, 0]);
    assert.equal((await finishImports({ drive, folderId: "top", photosDir, ...quiet })).moved, 0);
  } finally {
    rmSync(photosDir, { recursive: true, force: true });
  }
});

test("a failed download is left in Drive for the next run", async () => {
  const photosDir = scratchPhotos();
  try {
    const { drive } = fakeDrive([
      { id: "top", name: "Site Photos", mimeType: FOLDER, parents: ["root"] },
      { id: "ak", name: "Alaska 2026", mimeType: FOLDER, parents: ["top"] },
      { id: "bad", name: "bad.heic", mimeType: "image/heic", parents: ["ak"], body: "not a heic" },
    ]);
    const res = await importFromDrive({ drive, folderId: "top", photosDir, convertHeic: () => { throw new Error("boom"); }, ...quiet });
    assert.deepEqual([res.imported, res.failed, res.pending], [0, 1, 0]);
    assert.ok(!existsSync(join(photosDir, ".drive-imported.json")));
    assert.ok(!existsSync(join(photosDir, "alaska-2026", "bad.jpg")));
  } finally {
    rmSync(photosDir, { recursive: true, force: true });
  }
});

test("HEIC is converted to JPG with its EXIF date", { skip: !hasHeif && "heif-enc/heif-convert not installed" }, async () => {
  const photosDir = scratchPhotos();
  const work = mkdtempSync(join(tmpdir(), "heic-"));
  try {
    const src = join(work, "in.jpg");
    writeFileSync(src, await jpeg({ width: 640, height: 480, date: "2026:07:04 12:00:00" }));
    execFileSync("heif-enc", ["-q", "60", src, "-o", join(work, "in.heic")], { stdio: "ignore" });
    const { drive } = fakeDrive([
      { id: "top", name: "Site Photos", mimeType: FOLDER, parents: ["root"] },
      { id: "nc", name: "North Cascades", mimeType: FOLDER, parents: ["top"] },
      { id: "h1", name: "IMG_4242.HEIC", mimeType: "image/heif", parents: ["nc"], body: readFileSync(join(work, "in.heic")) },
    ]);
    const res = await importFromDrive({ drive, folderId: "top", photosDir, ...quiet });
    assert.equal(res.imported, 1);
    const out = join(photosDir, "north-cascades", "IMG_4242.jpg");
    const meta = await sharp(out).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ["jpeg", 640, 480]);
    const trip = JSON.parse(readFileSync(join(photosDir, "collections.json"), "utf8")).trips.find((t) => t.slug === "north-cascades");
    assert.equal(trip.date, "2026");
  } finally {
    rmSync(photosDir, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
});
