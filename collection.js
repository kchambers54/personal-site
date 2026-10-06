(function () {
  const root = document.getElementById("trip");
  if (!root) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SWIPE_MIN = 50;

  const ICONS = {
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    prev: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>'
  };

  function iconButton(kind, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "viewer__btn viewer__" + kind;
    button.setAttribute("aria-label", label);
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[kind] + "</svg>";
    return button;
  }

  const viewer = document.createElement("div");
  viewer.className = "viewer";
  viewer.setAttribute("role", "dialog");
  viewer.setAttribute("aria-modal", "true");
  viewer.setAttribute("aria-label", "Photo viewer");
  viewer.tabIndex = -1;

  const viewerImg = document.createElement("img");
  viewerImg.className = "viewer__photo";
  viewerImg.alt = "";
  const closeBtn = iconButton("close", "Close");
  const prevBtn = iconButton("prev", "Previous photo");
  const nextBtn = iconButton("next", "Next photo");
  const counter = document.createElement("p");
  counter.className = "viewer__count";
  counter.setAttribute("aria-live", "polite");
  viewer.append(viewerImg, closeBtn, prevBtn, nextBtn, counter);
  document.body.appendChild(viewer);

  let items = [];
  let current = 0;
  let showToken = 0;
  let closeTimer = 0;

  function viewerSizes(image) {
    return Math.round(Math.min(window.innerWidth, window.innerHeight * (image.aspect || 1.5))) + "px";
  }

  function preload(item) {
    const set = Photos.srcset(item.slug, item.image);
    const probe = new Image();
    if (set) {
      probe.sizes = viewerSizes(item.image);
      probe.srcset = set;
    }
    probe.src = Photos.src(item.slug, item.image.file);
  }

  function show(index, dir) {
    current = (index + items.length) % items.length;
    const item = items[current];
    const token = ++showToken;
    const set = Photos.srcset(item.slug, item.image);

    viewerImg.onload = () => {
      if (token !== showToken || reduceMotion || !dir) return;
      viewerImg.animate(
        [{ opacity: 0, transform: "translateX(" + dir * 28 + "px)" }, { opacity: 1, transform: "none" }],
        { duration: 320, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
      );
    };
    viewerImg.onerror = () => {
      if (token !== showToken || !viewerImg.hasAttribute("srcset")) return;
      viewerImg.removeAttribute("srcset");
      viewerImg.src = Photos.src(item.slug, item.image.file);
    };
    viewerImg.removeAttribute("srcset");
    if (set) {
      viewerImg.sizes = viewerSizes(item.image);
      viewerImg.srcset = set;
    }
    viewerImg.src = Photos.src(item.slug, item.image.file);
    viewerImg.alt = item.alt;

    const several = items.length > 1;
    prevBtn.hidden = !several;
    nextBtn.hidden = !several;
    counter.hidden = !several;
    counter.textContent = (current + 1) + " / " + items.length;
    if (several) {
      preload(items[(current + 1) % items.length]);
      preload(items[(current - 1 + items.length) % items.length]);
    }
  }

  function openViewer(index) {
    window.clearTimeout(closeTimer);
    show(index, 0);
    viewer.classList.add("is-open");
    document.documentElement.classList.add("viewer-open");
    viewer.focus();
    document.addEventListener("keydown", onKey);
  }

  function closeViewer() {
    if (!viewer.classList.contains("is-open")) return;
    viewer.classList.remove("is-open");
    document.documentElement.classList.remove("viewer-open");
    document.removeEventListener("keydown", onKey);
    const back = items[current] && items[current].button;
    if (back) back.focus();
    const finish = () => {
      if (viewer.classList.contains("is-open")) return;
      viewerImg.removeAttribute("srcset");
      viewerImg.removeAttribute("src");
      viewerImg.alt = "";
    };
    if (reduceMotion) finish();
    else closeTimer = window.setTimeout(finish, 240);
  }

  function step(dir) {
    if (items.length > 1) show(current + dir, dir);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeViewer();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "Tab") {
      // Keep focus inside the viewer.
      const stops = [closeBtn, prevBtn, nextBtn].filter((b) => !b.hidden);
      const at = stops.indexOf(document.activeElement);
      e.preventDefault();
      const next = e.shiftKey ? at - 1 : at + 1;
      stops[(next + stops.length) % stops.length].focus();
    }
  }

  closeBtn.addEventListener("click", closeViewer);
  prevBtn.addEventListener("click", () => step(-1));
  nextBtn.addEventListener("click", () => step(1));

  // Swipe left/right on touch screens. A swipe must not also count as a backdrop tap.
  let swipe = null;
  let swiped = false;
  viewer.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || !e.isPrimary) return;
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  viewer.addEventListener("pointerup", (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy)) return;
    swiped = true;
    step(dx < 0 ? 1 : -1);
  });
  viewer.addEventListener("pointercancel", () => { swipe = null; });

  viewer.addEventListener("click", (e) => {
    if (swiped) {
      swiped = false;
      return;
    }
    if (e.target === viewer) closeViewer();
  });

  function linkHome(label, href) {
    const a = document.createElement("a");
    a.className = "trip-back";
    a.href = href;
    a.textContent = label;
    return a;
  }

  function showMissing() {
    document.title = "Collection not found — Keller Chambers";
    root.replaceChildren();
    const note = document.createElement("p");
    note.className = "trip-missing";
    note.textContent = "That collection isn't here.";
    root.appendChild(note);
    root.appendChild(linkHome("Back home", "index.html"));
  }

  function renderTrip(trip) {
    closeViewer();
    const place = trip.place || "Collection";
    document.title = place + " — Keller Chambers";
    root.replaceChildren();
    const back = linkHome("All collections", "collections.html");
    back.classList.add("pill-link");
    root.appendChild(back);

    const heading = document.createElement("h1");
    heading.className = "trip-place";
    heading.textContent = place;
    root.appendChild(heading);

    const meta = [trip.date, trip.images.length ? Photos.countLabel(trip.images.length) : ""].filter(Boolean);
    if (meta.length) {
      const date = document.createElement("p");
      date.className = "trip-date";
      date.textContent = meta.join(" · ");
      root.appendChild(date);
    }

    const grid = document.createElement("div");
    grid.className = "trip-grid";
    const images = trip.images;
    items = images.map((image, i) => {
      const ar = image.aspect || 1.5;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "trip-photo";
      button.dataset.morph = trip.slug + "/" + image.file;
      button.style.setProperty("--ar", ar);
      const img = document.createElement("img");
      img.alt = images.length > 1 ? place + ", photo " + (i + 1) : place;
      img.loading = i < 3 ? "eager" : "lazy";
      img.decoding = "async";
      // Browsers apply EXIF rotation, so trust the loaded size over the manifest.
      img.addEventListener("load", () => {
        if (img.naturalWidth && img.naturalHeight) {
          button.style.setProperty("--ar", img.naturalWidth / img.naturalHeight);
        }
      });
      Photos.fadeIn(img);
      Photos.setSources(img, trip.slug, image, "(max-width: 720px) 88vw, calc(" + ar + " * 21vw)");
      button.appendChild(img);
      button.addEventListener("click", () => openViewer(i));
      grid.appendChild(button);
      return { slug: trip.slug, image: image, alt: img.alt, button: button };
    });
    root.appendChild(grid);
  }

  const slug = new URLSearchParams(window.location.search).get("slug");
  if (!slug) {
    showMissing();
    return;
  }

  // Render from this tab's cached manifest before first paint (lets the photo morph land),
  // then refresh from the network and re-render only if the collection changed.
  const early = Photos.cached();
  const earlyTrip = early && early.find((item) => item.slug === slug);
  if (earlyTrip) renderTrip(earlyTrip);

  Photos.load()
    .then((trips) => {
      const trip = trips.find((item) => item.slug === slug);
      if (!trip) {
        showMissing();
        return;
      }
      if (!earlyTrip || JSON.stringify(trip) !== JSON.stringify(earlyTrip)) renderTrip(trip);
    })
    .catch(() => {
      if (!earlyTrip) showMissing();
    });
})();
