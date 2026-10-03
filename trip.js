(function () {
  const root = document.getElementById("trip");
  if (!root) return;

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
      const img = document.createElement("img");
      img.src = "photos/" + trip.slug + "/" + filename;
      img.alt = images.length > 1 ? place + ", photo " + (i + 1) : place;
      img.loading = i === 0 ? "eager" : "lazy";
      grid.appendChild(img);
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
