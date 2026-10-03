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

  function renderCoverRow(trips) {
    const root = document.getElementById("trips");
    if (!root) return;

    const shown = trips.length > MAX_LOOP_COVERS
      ? trips.slice(trips.length - MAX_LOOP_COVERS)
      : trips.slice();

    const state = {
      token: 0,
      reduced: motionReduced(),
      setWidth: 0,
      stripWidth: 0,
      steps: [],
      index: 0,
      phases: [0, 0, 0],
      dirs: [1, -1, 1],
      travel: 0,
      nudge: 0,
      ready: false
    };

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

    const allTrips = document.createElement("a");
    allTrips.className = "cover-rows__all";
    allTrips.href = "trips.html";
    allTrips.textContent = "All trips";

    controls.appendChild(prev);
    controls.appendChild(next);
    controls.appendChild(allTrips);
    stage.appendChild(controls);
    root.replaceChildren(stage);

    function held() {
      return stage.matches(":hover") || stage.contains(document.activeElement);
    }

    function visualPos(i) {
      const w = state.setWidth;
      if (!w) return 0;
      return mod(state.phases[i] + state.dirs[i] * state.travel + state.nudge, w);
    }

    function apply() {
      if (state.reduced || !state.setWidth) return;
      rowEntries.forEach((entry, i) => {
        entry.track.style.transform = "translate3d(" + (-visualPos(i)) + "px,0,0)";
      });
    }

    let lastTick = performance.now();
    function frame(ts) {
      const now = typeof ts === "number" ? ts : performance.now();
      const dt = now - lastTick;
      lastTick = now;
      if (dt > 0 && !state.reduced && state.ready && state.setWidth > 0 && !held()) {
        state.travel += dt * (state.setWidth / LOOP_MS);
      }
      apply();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

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
      state.nudge = mod(state.nudge + px, state.setWidth);
      if (state.reduced) {
        rowEntries.forEach((entry) => {
          entry.row.scrollLeft = mod(entry.row.scrollLeft + px, state.setWidth);
        });
        return;
      }
      apply();
    }

    prev.addEventListener("click", () => skip(-1));
    next.addEventListener("click", () => skip(1));

    function hideLinks(node) {
      node.querySelectorAll("a").forEach((link) => {
        link.tabIndex = -1;
        link.setAttribute("aria-hidden", "true");
      });
    }

    let resizeTimer = 0;

    async function layout() {
      const my = ++state.token;
      const wasReduced = state.reduced;
      const wasReady = state.ready;
      const carried = !wasReady
        ? null
        : (wasReduced
          ? rowEntries.map((entry) => entry.row.scrollLeft)
          : [0, 1, 2].map((i) => visualPos(i)));

      const viewport = rowEntries[0].row.clientWidth;
      const measurer = document.createElement("div");
      measurer.className = "cover-row__measure";
      const set = document.createElement("div");
      set.className = "cover-row__set";
      set.setAttribute("data-cover-set", "original");
      measurer.appendChild(set);
      stage.appendChild(measurer);

      try {
        for (const trip of shown) {
          const link = makeCoverLink(trip, false);
          set.appendChild(link);
          await prepareCoverLink(link);
          if (my !== state.token) return;
        }

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
        if (setWidth <= 0) return;

        [...set.querySelectorAll("a")].slice(shown.length).forEach((link) => {
          link.tabIndex = -1;
          link.setAttribute("aria-hidden", "true");
        });

        const loopClone = set.cloneNode(true);
        loopClone.setAttribute("aria-hidden", "true");
        loopClone.setAttribute("data-cover-set", "clone");
        hideLinks(loopClone);

        if (my !== state.token) return;

        rowEntries[0].row.removeAttribute("aria-hidden");
        rowEntries[0].track.replaceChildren(set, loopClone);

        for (let i = 1; i < rowEntries.length; i += 1) {
          const copySet = set.cloneNode(true);
          const copyLoop = loopClone.cloneNode(true);
          hideLinks(copySet);
          hideLinks(copyLoop);
          copySet.setAttribute("aria-hidden", "true");
          rowEntries[i].row.setAttribute("aria-hidden", "true");
          rowEntries[i].track.replaceChildren(copySet, copyLoop);
        }

        state.steps = steps;
        state.setWidth = setWidth;
        state.phases = [0, stride, half];
        state.reduced = motionReduced();
        state.stripWidth = rowEntries[0].row.clientWidth || viewport;
        state.ready = true;

        if (state.reduced) {
          rowEntries.forEach((entry) => {
            entry.track.style.transform = "";
          });
          const base = carried || [0, stride, half];
          rowEntries.forEach((entry, i) => {
            entry.row.scrollLeft = mod(base[i] || 0, setWidth);
          });
        } else {
          apply();
        }
      } finally {
        if (measurer.parentNode) measurer.remove();
      }
    }

    layout();

    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const width = rowEntries[0].row.clientWidth;
        if (state.stripWidth && Math.abs(width - state.stripWidth) < 1) return;
        layout();
      }, 150);
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
