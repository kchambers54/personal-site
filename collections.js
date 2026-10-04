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

  function render(trips) {
    document.title = "All collections — Keller Chambers";
    root.replaceChildren();
    root.appendChild(backLink());
    root.appendChild(heading());

    const listable = trips.filter((trip) => trip && trip.slug);
    if (!listable.length) {
      root.appendChild(emptyLine());
      return;
    }

    const list = document.createElement("div");
    list.className = "trips-list";
    listable.forEach((trip, index) => {
      const link = document.createElement("a");
      link.className = "trips-list__item";
      link.href = "collection.html?slug=" + encodeURIComponent(trip.slug);

      const images = Array.isArray(trip.images) ? trip.images : [];
      if (images[0]) {
        const img = document.createElement("img");
        img.src = "photos/" + trip.slug + "/" + images[0];
        img.alt = "";
        img.decoding = "async";
        if (index > 0) img.loading = "lazy";
        link.appendChild(img);
      }

      const text = document.createElement("div");
      if (typeof trip.place === "string" && trip.place.trim()) {
        const place = document.createElement("p");
        place.className = "trips-list__place";
        place.textContent = trip.place.trim();
        text.appendChild(place);
      }
      if (typeof trip.date === "string" && trip.date.trim()) {
        const date = document.createElement("p");
        date.className = "trips-list__date";
        date.textContent = trip.date.trim();
        text.appendChild(date);
      }
      link.appendChild(text);
      list.appendChild(link);
    });
    root.appendChild(list);
  }

  fetch("photos/collections.json")
    .then((res) => {
      if (!res.ok) throw new Error("trips fetch failed");
      return res.json();
    })
    .then((data) => {
      const trips = data && Array.isArray(data.trips) ? data.trips : [];
      render(trips);
    })
    .catch(() => {
      document.title = "All collections — Keller Chambers";
      root.replaceChildren();
      root.appendChild(backLink());
      root.appendChild(heading());
      root.appendChild(emptyLine());
    });
})();
