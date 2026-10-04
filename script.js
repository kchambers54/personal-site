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

  // Each homepage row shows every photo from every collection.
  // The full list is shuffled once per row on load. Later resizes keep that order.
  const COVER_HEIGHT = 160;
  // One full strip used to take LOOP_MS. Pace is now 0.2 times that (80% slower).
  const LOOP_MS = 48000;
  const SPEED_SCALE = 0.2;
  const PLACEHOLDER_W = 240;

  function mod(n, m) {
    if (!m) return 0;
    return ((n % m) + m) % m;
  }

  function frameKey(frame) {
    return frame.slug + "/" + frame.file;
  }

  function flattenFrames(trips) {
    const frames = [];
    trips.forEach((trip) => {
      if (!trip || !trip.slug || !Array.isArray(trip.images)) return;
      trip.images.forEach((file) => {
        if (!file) return;
        frames.push({
          slug: trip.slug,
          file: file,
          place: typeof trip.place === "string" ? trip.place : ""
        });
      });
    });
    return frames;
  }

  function shuffleFrames(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function sameOrder(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i].slug !== b[i].slug || a[i].file !== b[i].file) return false;
    }
    return true;
  }

  function distinctOrders(frames) {
    const orders = [];
    let guard = 0;
    while (orders.length < 3 && guard < 40) {
      const next = shuffleFrames(frames);
      const clash = orders.some((order) => sameOrder(order, next));
      guard += 1;
      if (clash) continue;
      orders.push(next);
    }
    while (orders.length < 3) orders.push(frames.slice());
    if (frames.length > 1) {
      for (let i = 0; i < orders.length; i += 1) {
        for (let j = 0; j < i; j += 1) {
          if (!sameOrder(orders[i], orders[j])) continue;
          const swapped = orders[i].slice();
          const tmp = swapped[0];
          swapped[0] = swapped[1];
          swapped[1] = tmp;
          orders[i] = swapped;
        }
      }
    }
    return orders;
  }

  function makeCoverLink(frame, hidden, knownWidths) {
    const link = document.createElement("a");
    link.className = "cover-row__link";
    link.draggable = false;
    link.href = "collection.html?slug=" + encodeURIComponent(frame.slug);
    link.dataset.frame = frameKey(frame);
    const place = frame.place || "this collection";
    if (hidden) {
      link.tabIndex = -1;
      link.setAttribute("aria-hidden", "true");
    } else {
      link.setAttribute("aria-label", "View photos from " + place);
    }

    const img = document.createElement("img");
    img.dataset.src = "photos/" + frame.slug + "/" + frame.file;
    img.alt = hidden ? "" : place;
    img.draggable = false;
    img.decoding = "async";
    const width = knownWidths.get(frameKey(frame)) || PLACEHOLDER_W;
    img.style.height = COVER_HEIGHT + "px";
    img.style.width = width + "px";
    img.style.objectFit = "contain";
    link.style.width = width + "px";
    link.style.height = COVER_HEIGHT + "px";
    link.appendChild(img);
    return link;
  }

  function renderCoverRow(trips) {
    const root = document.getElementById("trips");
    if (!root) return;

    const frames = flattenFrames(trips);
    if (!frames.length) return;

    const knownWidths = new Map();

    const state = {
      token: 0,
      reduced: motionReduced(),
      rowWidths: [0, 0, 0],
      stripWidths: [0, 0, 0],
      phases: [0, 0, 0],
      dirs: [1, -1, 1],
      travelPx: [0, 0, 0],
      nudges: [0, 0, 0],
      orders: distinctOrders(frames),
      // Once per load, within ±5% of the new base. Not re-rolled on resize or drag.
      speedFactors: [0, 1, 2].map(() => 0.95 + Math.random() * 0.1),
      ready: false
    };

    const stage = document.createElement("div");
    stage.className = "cover-rows";
    stage.setAttribute("role", "region");
    stage.setAttribute("aria-label", "Collections");

    const rowEntries = [0, 1, 2].map(() => {
      const row = document.createElement("div");
      row.className = "cover-row";
      const track = document.createElement("div");
      track.className = "cover-row__track";
      row.appendChild(track);
      stage.appendChild(row);
      return { row, track };
    });

    root.replaceChildren(stage);

    function visualPos(i) {
      const w = state.rowWidths[i];
      if (!w) return 0;
      if (state.reduced) return mod(rowEntries[i].row.scrollLeft, w);
      return mod(state.phases[i] + state.dirs[i] * state.travelPx[i] + state.nudges[i], w);
    }

    function apply() {
      if (state.reduced) return;
      rowEntries.forEach((entry, i) => {
        if (!state.rowWidths[i]) return;
        entry.track.style.transform = "translate3d(" + (-visualPos(i)) + "px,0,0)";
      });
    }

    function applyMeasuredWidth(key, width) {
      if (!key || !(width > 0)) return;
      knownWidths.set(key, width);
      rowEntries.forEach((entry, i) => {
        const prevW = state.rowWidths[i];
        const pos = state.ready && prevW ? visualPos(i) : 0;
        const rowRect = entry.row.getBoundingClientRect();
        let shift = 0;
        entry.track.querySelectorAll("a").forEach((link) => {
          if (link.dataset.frame !== key) return;
          const before = link.getBoundingClientRect();
          if (Math.abs(before.width - width) < 0.5) return;
          const img = link.querySelector("img");
          if (img) {
            img.style.width = width + "px";
            img.style.height = COVER_HEIGHT + "px";
            img.style.objectFit = "contain";
          }
          link.style.width = width + "px";
          link.style.height = COVER_HEIGHT + "px";
          if (before.right <= rowRect.left + 0.5) shift += width - before.width;
        });
        const set = entry.track.querySelector("[data-cover-set='original']");
        if (!set) return;
        const newW = set.getBoundingClientRect().width;
        if (!(newW > 0)) return;
        state.rowWidths[i] = newW;
        if (!state.ready) return;
        const target = pos + shift;
        if (state.reduced) {
          entry.row.scrollLeft = mod(target, newW);
          return;
        }
        state.nudges[i] = mod(target - state.phases[i] - state.dirs[i] * state.travelPx[i], newW);
      });
      apply();
    }

    function armImage(img) {
      if (!img || img.dataset.armed === "1") return;
      img.dataset.armed = "1";
      img.addEventListener("load", () => {
        if (!img.naturalWidth || !img.naturalHeight) return;
        const link = img.closest("a");
        if (!link) return;
        const width = (COVER_HEIGHT * img.naturalWidth) / img.naturalHeight;
        applyMeasuredWidth(link.dataset.frame, width);
      });
    }

    function nearView(link, row) {
      const tile = link.getBoundingClientRect();
      const box = row.getBoundingClientRect();
      const margin = box.width || window.innerWidth || PLACEHOLDER_W;
      return tile.right >= box.left - margin && tile.left <= box.right + margin;
    }

    function reveal() {
      rowEntries.forEach((entry) => {
        entry.track.querySelectorAll("img").forEach((img) => {
          if (img.getAttribute("src") || !img.dataset.src) return;
          const link = img.closest("a");
          if (!link || !nearView(link, entry.row)) return;
          armImage(img);
          img.src = img.dataset.src;
        });
      });
    }

    let lastTick = performance.now();
    let rafId = 0;
    let loopGen = 0;

    function frame(ts) {
      const now = typeof ts === "number" ? ts : performance.now();
      const dt = now - lastTick;
      lastTick = now;
      const hidden = document.visibilityState === "hidden";
      // A suspended or hidden gap must not jump the rows forward.
      if (!hidden && dt > 0 && dt < 200 && !state.reduced && state.ready) {
        for (let i = 0; i < rowEntries.length; i += 1) {
          const w = state.rowWidths[i];
          if (!(w > 0)) continue;
          const delta = dt * (w / LOOP_MS) * SPEED_SCALE * state.speedFactors[i];
          state.travelPx[i] += delta;
          // The finger owns the dragged row. Cancel that row's auto step so the
          // others keep moving and this one resumes from the dragged offset.
          if (drag && drag.dragged && drag.index === i) {
            state.nudges[i] = mod(state.nudges[i] - state.dirs[i] * delta, w);
          }
        }
      }
      apply();
      reveal();
    }

    function resumeClock() {
      lastTick = performance.now();
      loopGen += 1;
      const gen = loopGen;
      if (rafId) cancelAnimationFrame(rafId);
      const step = (ts) => {
        if (gen !== loopGen) return;
        frame(ts);
        rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    }

    resumeClock();
    window.addEventListener("pageshow", resumeClock);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") resumeClock();
      else lastTick = performance.now();
    });
    document.addEventListener("freeze", () => { lastTick = performance.now(); });
    document.addEventListener("resume", resumeClock);

    // Touch drag changes only the row under the finger. A tap still follows the link.
    const DRAG_START = 10;
    let drag = null;
    let blockClick = false;

    function nudgeRow(index, dx) {
      const w = state.rowWidths[index];
      if (!w) return;
      if (state.reduced) {
        const entry = rowEntries[index];
        entry.row.scrollLeft = mod(entry.row.scrollLeft - dx, w);
        return;
      }
      state.nudges[index] = mod(state.nudges[index] - dx, w);
      apply();
    }

    rowEntries.forEach((entry, index) => {
      entry.row.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "touch" || !e.isPrimary) return;
        drag = { id: e.pointerId, x: e.clientX, lastX: e.clientX, dragged: false, index };
        if (entry.row.setPointerCapture) {
          try { entry.row.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }
      });

      entry.row.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id || drag.index !== index) return;
        const dx = e.clientX - drag.lastX;
        drag.lastX = e.clientX;
        if (!drag.dragged && Math.abs(e.clientX - drag.x) >= DRAG_START) drag.dragged = true;
        if (!drag.dragged) return;
        nudgeRow(index, dx);
        e.preventDefault();
      }, { passive: false });

      function endDrag(e) {
        if (!drag || e.pointerId !== drag.id || drag.index !== index) return;
        const dragged = drag.dragged;
        drag = null;
        if (!dragged) return;
        blockClick = true;
        window.setTimeout(() => { blockClick = false; }, 500);
      }

      entry.row.addEventListener("pointerup", endDrag);
      entry.row.addEventListener("pointercancel", endDrag);
      entry.row.addEventListener("scroll", () => reveal(), { passive: true });
    });
    stage.addEventListener("click", (e) => {
      if (!blockClick) return;
      blockClick = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    function hideLinks(node) {
      node.querySelectorAll("a").forEach((link) => {
        link.tabIndex = -1;
        link.setAttribute("aria-hidden", "true");
      });
    }

    let resizeTimer = 0;

    function layout() {
      const my = ++state.token;
      const viewport = rowEntries[0].row.clientWidth;
      const measurer = document.createElement("div");
      measurer.className = "cover-row__measure";
      stage.appendChild(measurer);

      try {
        const built = [];
        for (let i = 0; i < state.orders.length; i += 1) {
          if (my !== state.token) return;
          const order = state.orders[i];
          const set = document.createElement("div");
          set.className = "cover-row__set";
          set.setAttribute("data-cover-set", "original");
          measurer.appendChild(set);
          order.forEach((frame) => {
            set.appendChild(makeCoverLink(frame, false, knownWidths));
          });

          // One cycle is the permutation itself. The clone is the next copy,
          // so the last photo sits next to the first and they are not the same.
          const links = [...set.querySelectorAll("a")];
          if (i > 0) {
            hideLinks(set);
            set.setAttribute("aria-hidden", "true");
          }

          const gapValue = Number.parseFloat(getComputedStyle(set).columnGap);
          const gapPx = Number.isFinite(gapValue) ? gapValue : 12;
          const first = links[0];
          const firstW = first ? first.getBoundingClientRect().width : PLACEHOLDER_W;
          const setWidth = set.getBoundingClientRect().width;
          if (!(setWidth > 0) || !first) return;
          built.push({
            set: set,
            setWidth: setWidth,
            stride: firstW + gapPx,
            half: firstW / 2
          });
        }

        if (built.length !== 3 || my !== state.token) return;

        const carried = !state.ready
          ? null
          : (state.reduced
            ? rowEntries.map((entry) => entry.row.scrollLeft)
            : [0, 1, 2].map((i) => visualPos(i)));

        built.forEach((item, i) => {
          const loopClone = item.set.cloneNode(true);
          loopClone.setAttribute("aria-hidden", "true");
          loopClone.setAttribute("data-cover-set", "clone");
          hideLinks(loopClone);
          if (i === 0) rowEntries[i].row.removeAttribute("aria-hidden");
          else rowEntries[i].row.setAttribute("aria-hidden", "true");
          rowEntries[i].track.replaceChildren(item.set, loopClone);
        });

        state.phases = [0, built[0].stride, built[0].half];
        state.rowWidths = built.map((item) => item.setWidth);
        state.reduced = motionReduced();
        state.stripWidths = rowEntries.map((entry) => entry.row.clientWidth || viewport);
        if (carried && !state.reduced) {
          state.nudges = carried.map((pos, i) =>
            mod(pos - state.phases[i] - state.dirs[i] * state.travelPx[i], state.rowWidths[i])
          );
        } else if (!carried) {
          state.nudges = [0, 0, 0];
        }
        state.ready = true;

        if (state.reduced) {
          rowEntries.forEach((entry) => {
            entry.track.style.transform = "";
          });
          const base = carried || state.phases.slice();
          rowEntries.forEach((entry, i) => {
            entry.row.scrollLeft = mod(base[i] || 0, state.rowWidths[i]);
          });
        } else {
          apply();
        }
        reveal();
      } finally {
        if (measurer.parentNode) measurer.remove();
      }
    }

    layout();

    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const widths = rowEntries.map((entry) => entry.row.clientWidth);
        const unchanged = widths.every((width, i) => Math.abs(width - state.stripWidths[i]) < 1);
        if (state.ready && unchanged) return;
        layout();
      }, 150);
    });

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (typeof motion.addEventListener === "function") {
      motion.addEventListener("change", layout);
    }
  }

  // Load collections from photos/collections.json (relative URL for /personal-site/ Pages)
  (async function loadTrips() {
    try {
      const res = await fetch("photos/collections.json");
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
      const link = e.target.closest("a");
      pointer.classList.toggle("is-accent", Boolean(link));
    });

    document.addEventListener("mouseleave", () => {
      pointer.classList.remove("is-visible");
      visible = false;
      cancelAnimationFrame(raf);
    });
  }
})();
