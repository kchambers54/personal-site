// Shared loader for photos/collections.json.
// Image entries may be "01.jpg" or { "file": "01.jpg", "width": 3000, "height": 2000 }.
window.Photos = (function () {
  // Smaller copies made by scripts/prepare-photos.mjs. Keep the two lists in sync.
  const VARIANT_WIDTHS = [480, 960, 1600];
  const CACHE_KEY = "photos:manifest";
  const MORPH_KEY = "photos:morph";

  function normalizeImage(entry) {
    if (typeof entry === "string") return entry ? { file: entry, width: 0, aspect: 0 } : null;
    if (!entry || typeof entry.file !== "string" || !entry.file) return null;
    const known = entry.width > 0 && entry.height > 0;
    return { file: entry.file, width: known ? entry.width : 0, aspect: known ? entry.width / entry.height : 0 };
  }

  function normalizeTrip(trip) {
    if (!trip || !trip.slug) return null;
    const images = Array.isArray(trip.images) ? trip.images : [];
    return {
      slug: trip.slug,
      place: typeof trip.place === "string" ? trip.place.trim() : "",
      date: typeof trip.date === "string" ? trip.date.trim() : "",
      images: images.map(normalizeImage).filter(Boolean)
    };
  }

  function parse(data) {
    const trips = data && Array.isArray(data.trips) ? data.trips : [];
    return trips.map(normalizeTrip).filter(Boolean);
  }

  function load() {
    return fetch("photos/collections.json")
      .then((res) => {
        if (!res.ok) throw new Error("trips fetch failed");
        return res.text();
      })
      .then((raw) => {
        try { sessionStorage.setItem(CACHE_KEY, raw); } catch (err) { /* storage off */ }
        return parse(JSON.parse(raw));
      });
  }

  // The manifest from earlier in this tab, so a page can render before its first paint.
  function cached() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      return raw ? parse(JSON.parse(raw)) : null;
    } catch (err) {
      return null;
    }
  }

  function src(slug, file) {
    return "photos/" + slug + "/" + file;
  }

  function srcset(slug, image) {
    if (!image.width) return "";
    const list = VARIANT_WIDTHS
      .filter((w) => w < image.width)
      .map((w) => "photos/" + slug + "/w" + w + "/" + image.file + " " + w + "w");
    list.push(src(slug, image.file) + " " + image.width + "w");
    return list.join(", ");
  }

  // Points an img at the smallest copy that fills `sizes`. Falls back to the original
  // if a copy is missing (prepare-photos.mjs not run yet).
  function setSources(img, slug, image, sizes) {
    const set = srcset(slug, image);
    if (set) {
      img.sizes = sizes;
      img.srcset = set;
      img.addEventListener("error", () => {
        if (!img.hasAttribute("srcset")) return;
        img.removeAttribute("srcset");
        img.src = src(slug, image.file);
      }, { once: true });
    }
    img.src = src(slug, image.file);
  }

  // Fades an image in once it loads, including when it comes from cache.
  function fadeIn(img) {
    img.classList.add("fade-img");
    const done = () => img.classList.add("is-loaded");
    img.addEventListener("load", done, { once: true });
    if (img.complete && img.naturalWidth) done();
  }

  function countLabel(n) {
    return n + (n === 1 ? " photo" : " photos");
  }

  // —— Photo morph between pages ——
  // Elements with data-morph="slug/file" are the same photo on different pages. The one
  // clicked gets a shared view-transition-name so it grows into its match on the next page.
  let clicked = null;

  function inView(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  }

  function findMorph(key) {
    if (clicked && clicked.isConnected && clicked.dataset.morph === key && inView(clicked)) return clicked;
    const matches = [...document.querySelectorAll("[data-morph]")]
      .filter((el) => el.dataset.morph === key && inView(el));
    if (!matches.length) return null;
    // Rows repeat photos; take the copy nearest the middle of the screen.
    const mid = innerWidth / 2;
    const dist = (el) => Math.abs(el.getBoundingClientRect().left + el.offsetWidth / 2 - mid);
    return matches.sort((a, b) => dist(a) - dist(b))[0];
  }

  function clearMorphNames() {
    document.querySelectorAll("[data-morph]").forEach((el) => {
      el.style.viewTransitionName = "";
    });
  }

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = e.target.closest && e.target.closest("a[href]");
    if (!link) return;
    const el = link.matches("[data-morph]") ? link : link.querySelector("[data-morph]");
    clicked = el || null;
    try {
      if (el) sessionStorage.setItem(MORPH_KEY, el.dataset.morph);
      else sessionStorage.removeItem(MORPH_KEY);
    } catch (err) { /* storage off */ }
  });

  function morphKey() {
    try { return sessionStorage.getItem(MORPH_KEY); } catch (err) { return null; }
  }

  window.addEventListener("pageswap", (e) => {
    if (!e.viewTransition) return;
    clearMorphNames();
    const key = morphKey();
    const el = key && findMorph(key);
    if (el) el.style.viewTransitionName = "photo-morph";
  });

  window.addEventListener("pagereveal", (e) => {
    clearMorphNames();
    if (!e.viewTransition) return;
    const key = morphKey();
    const el = key && findMorph(key);
    if (!el) return;
    el.style.viewTransitionName = "photo-morph";
    // The page's own entrance animation would fight the morph, so skip it this time.
    document.documentElement.classList.add("is-morphing");
    e.viewTransition.finished.finally(() => {
      el.style.viewTransitionName = "";
    });
  });

  return {
    load: load,
    cached: cached,
    src: src,
    srcset: srcset,
    setSources: setSources,
    fadeIn: fadeIn,
    countLabel: countLabel
  };
})();
