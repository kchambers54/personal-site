(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const photos = document.getElementById("photos");
  const topbar = document.getElementById("topbar");
  const pointer = document.getElementById("pointer");

  // Sticky top bar becomes solid when photos reaches it
  if (photos && topbar) {
    const syncTopbar = () => {
      topbar.classList.toggle("is-solid", photos.getBoundingClientRect().top <= 56);
    };
    syncTopbar();
    window.addEventListener("scroll", syncTopbar, { passive: true });
    window.addEventListener("resize", syncTopbar, { passive: true });
  }

  // 1. Name letter reveal (letters for rise; words so wraps break only between words)
  const name = document.querySelector("[data-reveal]");
  if (name) {
    const text = name.textContent;
    name.textContent = "";
    name.setAttribute("aria-label", text);

    let charIndex = 0;
    text.split(" ").forEach((word, wordIndex) => {
      if (wordIndex > 0) {
        // Regular space: break opportunity between nowrap word groups
        name.appendChild(document.createTextNode(" "));
        charIndex += 1;
      }

      const wordSpan = document.createElement("span");
      wordSpan.className = "word";

      [...word].forEach((ch) => {
        const span = document.createElement("span");
        span.className = "char";
        span.textContent = ch;
        span.style.animationDelay = reduceMotion ? "0ms" : `${charIndex * 40}ms`;
        wordSpan.appendChild(span);
        charIndex += 1;
      });

      name.appendChild(wordSpan);
    });

    if (reduceMotion) {
      name.querySelectorAll(".char").forEach((el) => {
        el.style.transform = "none";
      });
    } else {
      requestAnimationFrame(() => name.classList.add("is-ready"));
    }
  }

  function initEmptyMarquee() {
    document.querySelectorAll("[data-marquee]").forEach((strip) => {
      const track = strip.querySelector(".filmstrip__track");
      const set = strip.querySelector(".filmstrip__set");
      if (!track || !set) return;
      if (track.querySelectorAll(".filmstrip__set").length > 1) return;
      const clone = set.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      track.appendChild(clone);
    });
  }

  function motionReduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // Homepage shows one cover per trip (images[0] only). Other frames live on trip.html.
  // Loop at most the latest 12 trips: the last 12 entries in trips.json order.
  const MAX_LOOP_COVERS = 12;
  const COVER_HEIGHT = 220;

  function coverSrc(trip) {
    return "photos/" + trip.slug + "/" + trip.images[0];
  }

  function makeCoverLink(trip, hidden) {
    const link = document.createElement("a");
    link.className = "cover-row__link";
    link.href = "trip.html?slug=" + encodeURIComponent(trip.slug);
    const place = trip.place || "this trip";
    if (hidden) {
      link.tabIndex = -1;
      link.setAttribute("aria-hidden", "true");
    } else {
      link.setAttribute("aria-label", "View photos from " + place);
    }

    const img = document.createElement("img");
    img.src = coverSrc(trip);
    img.alt = hidden ? "" : (trip.place || "");
    img.draggable = false;
    img.decoding = "async";
    link.appendChild(img);
    return link;
  }

  function sizeCoverLink(link) {
    const img = link.querySelector("img");
    if (!img || !img.naturalWidth || !img.naturalHeight) return false;
    const width = (COVER_HEIGHT * img.naturalWidth) / img.naturalHeight;
    img.style.height = COVER_HEIGHT + "px";
    img.style.width = width + "px";
    img.style.objectFit = "contain";
    link.style.width = width + "px";
    return true;
  }

  async function prepareCoverLink(link) {
    const img = link.querySelector("img");
    if (img && img.decode) {
      try {
        await img.decode();
      } catch (err) {
        // Broken frame: leave it unsized rather than inventing a crop.
      }
    }
    sizeCoverLink(link);
    return link;
  }

  function renderCoverRow(trips) {
    const root = document.getElementById("trips");
    if (!root) return;

    const shown = trips.length > MAX_LOOP_COVERS
      ? trips.slice(trips.length - MAX_LOOP_COVERS)
      : trips.slice();

    const row = document.createElement("div");
    row.className = "cover-row";
    row.setAttribute("role", "region");
    row.setAttribute("aria-label", "Trips");

    const track = document.createElement("div");
    track.className = "cover-row__track";
    row.appendChild(track);
    root.replaceChildren(row);

    let token = 0;

    async function layout() {
      const my = ++token;
      const reduced = motionReduced();
      track.classList.remove("is-looping");
      track.replaceChildren();

      const set = document.createElement("div");
      set.className = "cover-row__set";
      set.setAttribute("data-cover-set", "original");

      for (const trip of shown) {
        const link = makeCoverLink(trip, false);
        set.appendChild(link);
        await prepareCoverLink(link);
        if (my !== token) return;
      }

      track.appendChild(set);

      // Reduced motion: one real cover per trip, scrolled by hand. No clones, no loop.
      if (reduced || !shown.length) return;

      let guard = 0;
      const viewport = row.clientWidth;
      while (viewport > 0 && set.offsetWidth <= viewport && guard < 24) {
        const before = set.offsetWidth;
        for (const trip of shown) {
          const link = makeCoverLink(trip, true);
          set.appendChild(link);
          await prepareCoverLink(link);
          if (my !== token) return;
        }
        if (set.offsetWidth <= before) break;
        guard += 1;
      }

      if (my !== token || set.offsetWidth <= 0) return;

      // Second identical set so translateX(-50%) is exactly one set width.
      const clone = set.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.setAttribute("data-cover-set", "clone");
      clone.querySelectorAll("a").forEach((link) => {
        link.tabIndex = -1;
        link.setAttribute("aria-hidden", "true");
      });
      track.appendChild(clone);
      if (my !== token) return;
      track.classList.add("is-looping");
    }

    layout();

    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(layout, 150);
    });

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (typeof motion.addEventListener === "function") {
      motion.addEventListener("change", layout);
    }
  }

  // Load trips from photos/trips.json (relative URL for /personal-site/ Pages)
  (async function loadTrips() {
    try {
      const res = await fetch("photos/trips.json");
      if (!res.ok) throw new Error("trips fetch failed");
      const data = await res.json();
      const trips = data && Array.isArray(data.trips) ? data.trips : [];
      const covers = trips.filter(
        (trip) => trip && trip.slug && Array.isArray(trip.images) && trip.images[0]
      );
      if (!covers.length) {
        initEmptyMarquee();
        return;
      }
      renderCoverRow(covers);
    } catch (err) {
      initEmptyMarquee();
    }
  })();

  // 4. Pointer follower (lerp), accent over links, hidden on touch
  if (!reduceMotion && finePointer && pointer) {
    let targetX = -100;
    let targetY = -100;
    let currentX = -100;
    let currentY = -100;
    let visible = false;
    let raf = 0;

    const lerp = (a, b, t) => a + (b - a) * t;

    const tick = () => {
      currentX = lerp(currentX, targetX, 0.22);
      currentY = lerp(currentY, targetY, 0.22);
      pointer.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerType && e.pointerType !== "mouse") return;
        targetX = e.clientX;
        targetY = e.clientY;
        if (!visible) {
          visible = true;
          currentX = targetX;
          currentY = targetY;
          pointer.classList.add("is-visible");
          raf = requestAnimationFrame(tick);
        }
      },
      { passive: true }
    );

    document.addEventListener("mouseover", (e) => {
      const link = e.target.closest("a, .projects__line");
      pointer.classList.toggle("is-accent", Boolean(link));
    });

    document.addEventListener("mouseleave", () => {
      pointer.classList.remove("is-visible");
      visible = false;
      cancelAnimationFrame(raf);
    });
  }
})();
