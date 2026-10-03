(function () {
  const root = document.getElementById("trip");
  if (!root) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const viewer = document.createElement("div");
  viewer.className = "viewer";
  viewer.setAttribute("role", "dialog");
  viewer.setAttribute("aria-modal", "true");
  viewer.setAttribute("aria-label", "Photo");
  viewer.tabIndex = -1;

  const viewerImg = document.createElement("img");
  viewerImg.className = "viewer__photo";
  viewerImg.alt = "";
  viewer.appendChild(viewerImg);
  document.body.appendChild(viewer);

  let opener = null;
  let closeTimer = 0;

  function openViewer(src, alt, from) {
    opener = from || null;
    window.clearTimeout(closeTimer);
    viewerImg.src = src;
    viewerImg.alt = alt || "";
    viewer.classList.add("is-open");
    viewer.focus();
    document.addEventListener("keydown", onKey);
  }

  function closeViewer() {
    if (!viewer.classList.contains("is-open")) return;
    viewer.classList.remove("is-open");
    document.removeEventListener("keydown", onKey);
    const finish = () => {
      if (viewer.classList.contains("is-open")) return;
      viewerImg.removeAttribute("src");
      viewerImg.alt = "";
      if (opener && typeof opener.focus === "function") opener.focus();
      opener = null;
    };
    if (reduceMotion) finish();
    else closeTimer = window.setTimeout(finish, 240);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeViewer();
    }
  }

  viewer.addEventListener("click", (e) => {
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
    document.title = "Trip not found — Keller Chambers";
    root.replaceChildren();
    const note = document.createElement("p");
    note.className = "trip-missing";
    note.textContent = "That trip isn't here.";
    root.appendChild(note);
    root.appendChild(linkHome("Back home", "index.html"));
  }

  function renderTrip(trip) {
    const place = trip.place || "Trip";
    document.title = place + " — Keller Chambers";
    root.replaceChildren();
    root.appendChild(linkHome("All photos", "index.html#photos"));

    const heading = document.createElement("h1");
    heading.className = "trip-place";
    heading.textContent = place;
    root.appendChild(heading);

    if (typeof trip.date === "string" && trip.date.trim()) {
      const date = document.createElement("p");
      date.className = "trip-date";
      date.textContent = trip.date.trim();
      root.appendChild(date);
    }

    const grid = document.createElement("div");
    grid.className = "trip-grid";
    const images = Array.isArray(trip.images) ? trip.images : [];
    images.forEach((filename, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "trip-photo";
      const img = document.createElement("img");
      img.src = "photos/" + trip.slug + "/" + filename;
      img.alt = images.length > 1 ? place + ", photo " + (i + 1) : place;
      img.loading = i === 0 ? "eager" : "lazy";
      button.appendChild(img);
      button.addEventListener("click", () => {
        openViewer(img.currentSrc || img.src, img.alt, button);
      });
      grid.appendChild(button);
    });
    root.appendChild(grid);
  }

  const slug = new URLSearchParams(window.location.search).get("slug");
  if (!slug) {
    showMissing();
    return;
  }

  fetch("photos/trips.json")
    .then((res) => {
      if (!res.ok) throw new Error("trips fetch failed");
      return res.json();
    })
    .then((data) => {
      const trips = data && Array.isArray(data.trips) ? data.trips : [];
      const trip = trips.find((item) => item && item.slug === slug);
      if (!trip) {
        showMissing();
        return;
      }
      renderTrip(trip);
    })
    .catch(() => {
      showMissing();
    });
})();
