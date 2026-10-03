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
  const COVER_HEIGHT = 160;
  const LOOP_MS = 48000;

  function coverSrc(trip) {
    return "photos/" + trip.slug + "/" + trip.images[0];
  }

  function mod(n, m) {
    if (!m) return 0;
    return ((n % m) + m) % m;
  }

  function timeMs(value) {
    if (value == null) return 0;
    if (typeof value === "number") return value;
    if (typeof value === "object" && typeof value.value === "number") return value.value;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
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
    img.alt = hidden ? "" : (typeof trip.place === "string" ? trip.place : "");
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
    link.style.height = COVER_HEIGHT + "px";
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

  function cssAnim(track) {
    if (!track || typeof track.getAnimations !== "function") return null;
    const list = track.getAnimations();
    return list.find((anim) => anim.animationName === "cover-row-loop") || null;
  }

  function renderCoverRow(trips) {
    const root = document.getElementById("trips");
    if (!root) return;

    const shown = trips.length > MAX_LOOP_COVERS
      ? trips.slice(trips.length - MAX_LOOP_COVERS)
      : trips.slice();

    const state = {
      token: 0,
      reduced: false,
      setWidth: 0,
      steps: [],
      index: 0,
      rows: [],
      seeker: null
    };

    const band = document.createElement("div");
    band.className = "trip-band";

    const rail = document.createElement("div");
    rail.className = "trip-band__rail";
    shown.forEach((trip) => {
      if (typeof trip.place === "string" && trip.place.trim()) {
        const place = document.createElement("p");
        place.className = "trip-band__place";
        place.textContent = trip.place.trim();
        rail.appendChild(place);
      }
      if (typeof trip.date === "string" && trip.date.trim()) {
        const date = document.createElement("p");
        date.className = "trip-band__date";
        date.textContent = trip.date.trim();
        rail.appendChild(date);
      }
    });
    const allTrips = document.createElement("a");
    allTrips.className = "trip-band__all";
    allTrips.href = "trips.html";
    allTrips.textContent = "All trips";
    rail.appendChild(allTrips);

    const wrap = document.createElement("div");
    wrap.className = "trip-band__strip-wrap";

    const stage = document.createElement("div");
    stage.className = "cover-rows";
    stage.setAttribute("role", "region");
    stage.setAttribute("aria-label", "Trips");

    const rowEntries = [0, 1, 2].map(() => {
      const row = document.createElement("div");
      row.className = "cover-row";
      const track = document.createElement("div");
      track.className = "cover-row__track";
      row.appendChild(track);
      stage.appendChild(row);
      return { row, track };
    });

    const controls = document.createElement("div");
    controls.className = "cover-rows__controls";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "cover-rows__arrow";
    prev.setAttribute("aria-label", "Previous");
    prev.textContent = "Previous";

    const next = document.createElement("button");
    next.type = "button";
    next.className = "cover-rows__arrow";
    next.setAttribute("aria-label", "Next");
    next.textContent = "Next";

    controls.appendChild(prev);
    controls.appendChild(next);
    stage.appendChild(controls);
    wrap.appendChild(stage);
    band.appendChild(rail);
    band.appendChild(wrap);
    root.replaceChildren(band);
    state.rows = rowEntries;

    function stopSeeker() {
      if (state.seeker) {
        state.seeker.stop();
        state.seeker = null;
      }
    }

    function seekCss(px) {
      if (!state.setWidth) return;
      rowEntries.forEach((entry) => {
        const anim = cssAnim(entry.track);
        if (!anim) return;
        const timing = anim.effect && anim.effect.getComputedTiming
          ? anim.effect.getComputedTiming()
          : null;
        const dur = timeMs(timing && timing.duration) || LOOP_MS;
        const reverse = entry.track.classList.contains("is-reverse");
        const dt = (px / state.setWidth) * dur * (reverse ? -1 : 1);
        anim.currentTime = mod(timeMs(anim.currentTime) + dt, dur);
      });
    }

    function skip(dir) {
      if (!state.steps.length || !state.setWidth) return;
      let step;
      if (dir > 0) {
        step = state.steps[state.index % state.steps.length];
        state.index = (state.index + 1) % state.steps.length;
      } else {
        state.index = (state.index - 1 + state.steps.length) % state.steps.length;
        step = state.steps[state.index];
      }
      const px = dir * step;
      if (state.reduced) {
        rowEntries.forEach((entry) => {
          entry.row.scrollLeft = mod(entry.row.scrollLeft + px, state.setWidth);
        });
        return;
      }
      if (state.seeker) {
        state.seeker.seek(px);
        return;
      }
      seekCss(px);
    }

    prev.addEventListener("click", () => skip(-1));
    next.addEventListener("click", () => skip(1));

    function startFallback(setWidth, phases) {
      const my = state.token;
      const dirs = [1, -1, 1];
      let elapsed = 0;
      let last = null;
      let nudge = 0;
      let stopped = false;

      function frame(ts) {
        if (stopped || my !== state.token) return;
        if (last == null) last = ts;
        const dt = ts - last;
        last = ts;
        const hold = stage.matches(":hover") || stage.contains(document.activeElement);
        if (!hold) elapsed += dt;
        const speed = setWidth / LOOP_MS;
        rowEntries.forEach((entry, i) => {
          const pos = mod(phases[i] + dirs[i] * speed * elapsed + nudge, setWidth);
          entry.track.style.transform = "translate3d(" + (-pos) + "px,0,0)";
        });
        requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);
      state.seeker = {
        stop() { stopped = true; },
        seek(px) { nudge += px; }
      };
    }

    async function whenAnims() {
      for (let i = 0; i < 12; i += 1) {
        const anims = rowEntries.map((entry) => cssAnim(entry.track));
        if (anims.every(Boolean)) return anims;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return null;
    }

    function prime(anims, setWidth, stride, half) {
      anims.forEach((anim, i) => {
        const timing = anim.effect && anim.effect.getComputedTiming
          ? anim.effect.getComputedTiming()
          : null;
        const dur = timeMs(timing && timing.duration) || LOOP_MS;
        let frac = 0;
        if (i === 1) frac = 1 - (stride / setWidth);
        if (i === 2) frac = half / setWidth;
        anim.currentTime = mod(frac, 1) * dur;
      });
    }

    let resizeTimer = 0;

    async function layout() {
      const my = ++state.token;
      stopSeeker();
      state.reduced = motionReduced();
      state.setWidth = 0;
      state.steps = [];
      state.index = 0;
      state.seeker = null;

      rowEntries.forEach((entry) => {
        entry.track.classList.remove("is-looping", "is-reverse");
        entry.track.style.transform = "";
        entry.track.replaceChildren();
        entry.row.removeAttribute("aria-hidden");
        entry.row.scrollLeft = 0;
      });

      const set = document.createElement("div");
      set.className = "cover-row__set";
      set.setAttribute("data-cover-set", "original");
      rowEntries[0].track.appendChild(set);

      for (const trip of shown) {
        const link = makeCoverLink(trip, false);
        set.appendChild(link);
        await prepareCoverLink(link);
        if (my !== state.token) return;
      }

      const viewport = rowEntries[0].row.clientWidth;
      let guard = 0;
      while (viewport > 0 && set.getBoundingClientRect().width <= viewport + 1 && guard < 24) {
        const before = set.getBoundingClientRect().width;
        for (const trip of shown) {
          const link = makeCoverLink(trip, true);
          set.appendChild(link);
          await prepareCoverLink(link);
          if (my !== state.token) return;
        }
        if (set.getBoundingClientRect().width <= before + 1) break;
        guard += 1;
      }

      if (my !== state.token) return;

      const gapValue = Number.parseFloat(getComputedStyle(set).columnGap);
      const gapPx = Number.isFinite(gapValue) ? gapValue : 12;
      const cycle = [...set.querySelectorAll("a")].slice(0, shown.length);
      if (!cycle.length) return;
      const steps = cycle.map((link) => link.getBoundingClientRect().width + gapPx);
      const setWidth = set.getBoundingClientRect().width;
      const half = cycle[0].getBoundingClientRect().width / 2;
      const stride = steps[0];
      state.steps = steps;
      state.setWidth = setWidth;

      const loopClone = set.cloneNode(true);
      loopClone.setAttribute("aria-hidden", "true");
      loopClone.setAttribute("data-cover-set", "clone");
      loopClone.querySelectorAll("a").forEach((link) => {
        link.tabIndex = -1;
        link.setAttribute("aria-hidden", "true");
      });
      rowEntries[0].track.appendChild(loopClone);

      [...set.querySelectorAll("a")].slice(shown.length).forEach((link) => {
        link.tabIndex = -1;
        link.setAttribute("aria-hidden", "true");
      });

      for (let i = 1; i < rowEntries.length; i += 1) {
        rowEntries[i].row.setAttribute("aria-hidden", "true");
        [...rowEntries[0].track.children].forEach((node) => {
          const copy = node.cloneNode(true);
          copy.querySelectorAll("a").forEach((link) => {
            link.tabIndex = -1;
            link.setAttribute("aria-hidden", "true");
          });
          rowEntries[i].track.appendChild(copy);
        });
      }

      if (my !== state.token || setWidth <= 0) return;

      if (state.reduced) {
        const offsets = [0, stride, half];
        rowEntries.forEach((entry, i) => {
          entry.row.scrollLeft = offsets[i] || 0;
        });
        return;
      }

      rowEntries[1].track.classList.add("is-reverse");
      rowEntries.forEach((entry) => entry.track.classList.add("is-looping"));

      const anims = await whenAnims();
      if (my !== state.token) return;
      if (!anims) {
        rowEntries.forEach((entry) => {
          entry.track.classList.remove("is-looping", "is-reverse");
        });
        startFallback(setWidth, [0, stride, half]);
        return;
      }
      prime(anims, setWidth, stride, half);
    }

    layout();

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
