(function () {
  const root = document.getElementById("all-collections");
  if (!root) return;

  function backLink() {
    const a = document.createElement("a");
    a.className = "trip-back";
    a.href = "index.html#photos";
    a.textContent = "Photos";
    return a;
  }

  function heading() {
    const h = document.createElement("h1");
    h.className = "trip-place";
    h.textContent = "All collections";
    return h;
  }

  function emptyLine() {
    const note = document.createElement("p");
    note.className = "trips-empty";
    note.textContent = "No collections yet";
    return note;
  }

  function card(trip, index) {
    const link = document.createElement("a");
    link.className = "collection-card";
    link.href = "collection.html?slug=" + encodeURIComponent(trip.slug);
    link.style.setProperty("--i", index);

    const media = document.createElement("div");
    media.className = "collection-card__media";
    const cover = trip.images[0];
    if (cover) {
      media.dataset.morph = trip.slug + "/" + cover.file;
      const img = document.createElement("img");
      img.alt = "";
      img.loading = index < 3 ? "eager" : "lazy";
      img.decoding = "async";
      Photos.fadeIn(img);
      // The 4:3 frame crops wide photos, so they need extra width to stay sharp.
      const fill = Math.max(1, (cover.aspect || 1.5) * 0.75).toFixed(2);
      Photos.setSources(img, trip.slug, cover,
        "(max-width: 720px) min(calc(88vw * " + fill + "), 800px), min(calc(28vw * " + fill + "), 800px)");
      media.appendChild(img);
    }
    link.appendChild(media);

    const text = document.createElement("div");
    text.className = "collection-card__text";
    const place = document.createElement("h2");
    place.className = "collection-card__place";
    place.textContent = trip.place || trip.slug;
    text.appendChild(place);

    const meta = [trip.date, trip.images.length ? Photos.countLabel(trip.images.length) : ""].filter(Boolean);
    if (meta.length) {
      const line = document.createElement("p");
      line.className = "collection-card__meta";
      line.textContent = meta.join(" · ");
      text.appendChild(line);
    }
    link.appendChild(text);
    return link;
  }

  function render(trips) {
    document.title = "All collections — Keller Chambers";
    root.replaceChildren();
    root.appendChild(backLink());
    root.appendChild(heading());

    if (!trips.length) {
      root.appendChild(emptyLine());
      return;
    }

    const total = trips.reduce((sum, trip) => sum + trip.images.length, 0);
    const summary = document.createElement("p");
    summary.className = "trip-date";
    summary.textContent = trips.length + (trips.length === 1 ? " collection" : " collections") +
      " · " + Photos.countLabel(total);
    root.appendChild(summary);

    const grid = document.createElement("div");
    grid.className = "collections-grid";
    trips.forEach((trip, index) => grid.appendChild(card(trip, index)));
    root.appendChild(grid);
  }

  // Render from this tab's cached manifest before first paint, then refresh if it changed.
  const early = Photos.cached();
  if (early) render(early);

  Photos.load()
    .then((trips) => {
      if (!early || JSON.stringify(trips) !== JSON.stringify(early)) render(trips);
    })
    .catch(() => {
      if (!early) render([]);
    });
})();
