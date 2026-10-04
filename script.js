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
  // One full strip used to take LOOP_MS. Pace is now 0.2 times that (80% slower).
  const LOOP_MS = 48000;
  const SPEED_SCALE = 0.2;
  const PLACEHOLDER_ASPECT = 1.5;
  // Page scroll speed (px/ms) adds this many base speeds, signed, up to SCROLL_BOOST_MAX.
  const SCROLL_BOOST = 6;
  const SCROLL_BOOST_MAX = 14;
  const HOVER_SPEED = 0.1;

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
      trip.images.forEach((image) => {
        frames.push({
          slug: trip.slug,
          file: image.file,
          width: image.width,
          aspect: image.aspect,
          place: trip.place
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

  function makeCoverLink(frame, hidden, knownAspects, coverH) {
    const link = document.createElement("a");
    link.className = "cover-row__link";
    link.draggable = false;
    link.href = "collection.html?slug=" + encodeURIComponent(frame.slug);
    link.dataset.frame = frameKey(frame);
    link.dataset.morph = frameKey(frame);
    if (frame.place) link.dataset.label = frame.place;
    const place = frame.place || "this collection";
    if (hidden) {
      link.tabIndex = -1;
      link.setAttribute("aria-hidden", "true");
    } else {
      link.setAttribute("aria-label", "View photos from " + place);
    }

    const img = document.createElement("img");
    img.dataset.src = Photos.src(frame.slug, frame.file);
    img.alt = hidden ? "" : place;
    img.draggable = false;
    img.decoding = "async";
    const width = (knownAspects.get(frameKey(frame)) || PLACEHOLDER_ASPECT) * coverH;
    const srcset = Photos.srcset(frame.slug, frame);
    if (srcset) {
      img.dataset.srcset = srcset;
      img.dataset.sizes = Math.ceil(width) + "px";
    }
    img.style.height = coverH + "px";
    img.style.width = width + "px";
    img.style.objectFit = "contain";
    link.style.width = width + "px";
    link.style.height = coverH + "px";
    link.appendChild(img);
    return link;
  }

  function renderCoverRow(trips) {
    const root = document.getElementById("trips");
    if (!root) return;

    const frames = flattenFrames(trips);
    if (!frames.length) return;

    const knownAspects = new Map();
    frames.forEach((frame) => {
      if (frame.aspect) knownAspects.set(frameKey(frame), frame.aspect);
    });
    let coverH = 160;

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
      hoverFactors: [1, 1, 1],
      hoverTargets: [1, 1, 1],
      scrollBoost: 0,
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

    // Rows sit below the hero, so hold off loading photos until they're close.
    let stageNear = !("IntersectionObserver" in window);
    if (!stageNear) {
      new IntersectionObserver((entries) => {
        stageNear = entries[entries.length - 1].isIntersecting;
        if (stageNear) {
          apply();
          reveal();
        }
      }, { rootMargin: "10% 0px" }).observe(stage);
    }

    function readCoverHeight() {
      const value = Number.parseFloat(getComputedStyle(stage).getPropertyValue("--cover-h"));
      return value > 0 ? value : 160;
    }

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

    function cycleDistance(entry) {
      const set = entry.track.querySelector("[data-cover-set='original']");
      const clone = entry.track.querySelector("[data-cover-set='clone']");
      if (!set) return 0;
      // Layout distance to the single cloned cycle, not the clipped on-screen box.
      if (clone && clone.offsetLeft > set.offsetLeft) {
        return clone.offsetLeft - set.offsetLeft;
      }
      return set.offsetWidth;
    }

    function applyMeasuredAspect(key, aspect) {
      if (!key || !(aspect > 0)) return;
      knownAspects.set(key, aspect);
      const width = aspect * coverH;
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
            img.style.height = coverH + "px";
            img.style.objectFit = "contain";
          }
          link.style.width = width + "px";
          link.style.height = coverH + "px";
          if (before.right <= rowRect.left + 0.5) shift += width - before.width;
        });
        const newW = cycleDistance(entry);
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
        applyMeasuredAspect(link.dataset.frame, img.naturalWidth / img.naturalHeight);
      });
    }

    function nearView(link, row) {
      const tile = link.getBoundingClientRect();
      const box = row.getBoundingClientRect();
      const margin = box.width || window.innerWidth || coverH * PLACEHOLDER_ASPECT;
      return tile.right >= box.left - margin && tile.left <= box.right + margin;
    }

    function reveal() {
      if (!stageNear) return;
      rowEntries.forEach((entry) => {
        entry.track.querySelectorAll("img").forEach((img) => {
          if (img.getAttribute("src") || !img.dataset.src) return;
          const link = img.closest("a");
          if (!link || !nearView(link, entry.row)) return;
          armImage(img);
          // Listeners don't survive cloneNode, so attach the fade here rather than at creation.
          Photos.fadeIn(img);
          if (img.dataset.srcset) {
            img.sizes = img.dataset.sizes;
            img.srcset = img.dataset.srcset;
            // A missing smaller copy falls back to the original.
            img.addEventListener("error", () => img.removeAttribute("srcset"), { once: true });
          }
          img.src = img.dataset.src;
        });
      });
    }

    let lastTick = performance.now();
    let lastScrollY = window.scrollY;
    let rafId = 0;
    let loopGen = 0;

    function ease(current, target, dt, ms) {
      return current + (target - current) * (1 - Math.exp(-dt / ms));
    }

    function frame(ts) {
      const now = typeof ts === "number" ? ts : performance.now();
      const dt = now - lastTick;
      lastTick = now;
      const scrollY = window.scrollY;
      const scrolled = scrollY - lastScrollY;
      lastScrollY = scrollY;
      const hidden = document.visibilityState === "hidden";
      // A suspended or hidden gap must not jump the rows forward.
      if (!hidden && dt > 0 && dt < 200 && !state.reduced && state.ready) {
        // Scrolling down pushes the rows along; scrolling up briefly reverses them.
        const boostTarget = Math.max(-SCROLL_BOOST_MAX,
          Math.min(SCROLL_BOOST_MAX, (scrolled / dt) * SCROLL_BOOST));
        state.scrollBoost = ease(state.scrollBoost, boostTarget, dt, 160);
        for (let i = 0; i < rowEntries.length; i += 1) {
          const w = state.rowWidths[i];
          if (!(w > 0)) continue;
          state.hoverFactors[i] = ease(state.hoverFactors[i], state.hoverTargets[i], dt, 220);
          const pace = state.hoverFactors[i] + state.scrollBoost;
          const delta = dt * (w / LOOP_MS) * SPEED_SCALE * state.speedFactors[i] * pace;
          state.travelPx[i] += delta;
          // The finger owns the dragged row. Cancel that row's auto step so the
          // others keep moving and this one resumes from the dragged offset.
          if (drag && drag.dragged && drag.index === i) {
            state.nudges[i] = mod(state.nudges[i] - state.dirs[i] * delta, w);
          }
        }
      }
      if (!stageNear) return;
      apply();
      reveal();
    }

    function resumeClock() {
      lastTick = performance.now();
      lastScrollY = window.scrollY;
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
      // Mouse hover eases the row nearly to a stop.
      entry.row.addEventListener("pointerenter", (e) => {
        if (e.pointerType === "mouse") state.hoverTargets[index] = HOVER_SPEED;
      });
      entry.row.addEventListener("pointerleave", () => {
        state.hoverTargets[index] = 1;
      });

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
      coverH = readCoverHeight();
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
            set.appendChild(makeCoverLink(frame, false, knownAspects, coverH));
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
          const firstW = first ? first.getBoundingClientRect().width : coverH * PLACEHOLDER_ASPECT;
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
        state.rowWidths = rowEntries.map((entry) => cycleDistance(entry));
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
      const trips = await Photos.load();
      const covers = trips.filter((trip) => trip.images.length);
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

    const pointerLabel = pointer.querySelector(".pointer__label");
    document.addEventListener("mouseover", (e) => {
      const link = e.target.closest("a");
      pointer.classList.toggle("is-accent", Boolean(link));
      const label = link && link.dataset.label;
      if (label && pointerLabel) pointerLabel.textContent = label;
      pointer.classList.toggle("has-label", Boolean(label && pointerLabel));
    });

    document.addEventListener("mouseleave", () => {
      pointer.classList.remove("is-visible");
      visible = false;
      cancelAnimationFrame(raf);
    });
  }

  // 5. Hero lights chase the cursor on a loose spring and spread out while moving.
  const hero = document.querySelector(".hero");
  const swirl = document.querySelector(".hero__swirl");
  if (!reduceMotion && finePointer && hero && swirl) {
    const wide = window.matchMedia("(min-width: 701px)");
    const STIFFNESS = 0.012;
    const DAMPING = 0.86;
    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;
    let tx = 0;
    let ty = 0;
    let spread = 1;
    let raf = 0;
    let last = 0;

    const tick = (now) => {
      const f = last ? Math.min((now - last) / 16.67, 3) : 1;
      last = now;
      vx = (vx + (tx - x) * STIFFNESS * f) * Math.pow(DAMPING, f);
      vy = (vy + (ty - y) * STIFFNESS * f) * Math.pow(DAMPING, f);
      x += vx * f;
      y += vy * f;
      const speed = Math.hypot(vx, vy);
      spread += (1 + Math.min(speed / 40, 0.7) - spread) * 0.08 * f;
      swirl.style.translate = x.toFixed(1) + "px " + y.toFixed(1) + "px";
      swirl.style.scale = spread.toFixed(3);
      const settled = Math.abs(tx - x) < 0.2 && Math.abs(ty - y) < 0.2 && speed < 0.02 && spread < 1.002;
      raf = settled ? 0 : requestAnimationFrame(tick);
    };

    const wake = () => {
      if (raf) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    };

    // Targets are offsets from the cluster's resting spot; leaving the hero sends it home.
    window.addEventListener("pointermove", (e) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      const box = hero.getBoundingClientRect();
      // Narrow windows spread the lights across the hero instead of clustering them.
      const inside = wide.matches && e.clientY >= box.top && e.clientY <= box.bottom;
      tx = inside ? e.clientX - box.left - swirl.offsetLeft : 0;
      ty = inside ? e.clientY - box.top - swirl.offsetTop : 0;
      wake();
    }, { passive: true });

    document.addEventListener("mouseleave", () => {
      tx = 0;
      ty = 0;
      wake();
    });
  }
})();
