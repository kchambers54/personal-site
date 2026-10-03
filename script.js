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
  function renderCarousel(trips) {
    const root = document.getElementById("trips");
    if (!root) return;

    const carousel = document.createElement("div");
    carousel.className = "trip-carousel";
    carousel.setAttribute("aria-roledescription", "carousel");
    carousel.setAttribute("aria-label", "Trips");

    const multiple = trips.length > 1;
    let controls = null;
    if (multiple) {
      controls = document.createElement("div");
      controls.className = "trip-carousel__controls";

      const prev = document.createElement("button");
      prev.type = "button";
      prev.className = "trip-carousel__arrow";
      prev.setAttribute("aria-label", "Previous trip");
      prev.textContent = "Previous";
      prev.addEventListener("click", () => {
        show(index - 1);
        arm();
      });

      const next = document.createElement("button");
      next.type = "button";
      next.className = "trip-carousel__arrow";
      next.setAttribute("aria-label", "Next trip");
      next.textContent = "Next";
      next.addEventListener("click", () => {
        show(index + 1);
        arm();
      });

      controls.appendChild(prev);
      controls.appendChild(next);
      carousel.appendChild(controls);
    }

    const stage = document.createElement("div");
    stage.className = "trip-carousel__stage";

    const slides = trips.map((trip, i) => {
      const cover = trip.images[0];
      const slide = document.createElement("a");
      slide.className = "trip-carousel__slide";
      slide.href = "trip.html?slug=" + encodeURIComponent(trip.slug);
      slide.setAttribute("aria-label", "View photos from " + (trip.place || "this trip"));

      const img = document.createElement("img");
      img.src = "photos/" + trip.slug + "/" + cover;
      img.alt = trip.place || "";
      img.loading = i === 0 ? "eager" : "lazy";
      slide.appendChild(img);

      const place = document.createElement("p");
      place.className = "trip-carousel__place";
      place.textContent = trip.place || "";
      slide.appendChild(place);

      if (typeof trip.date === "string" && trip.date.trim()) {
        const date = document.createElement("p");
        date.className = "trip-carousel__date";
        date.textContent = trip.date.trim();
        slide.appendChild(date);
      }

      stage.appendChild(slide);
      return slide;
    });

    carousel.appendChild(stage);
    root.replaceChildren(carousel);

    let index = 0;
    let timer = 0;
    let hovering = carousel.matches(":hover");
    let focused = carousel.contains(document.activeElement);

    function show(nextIndex) {
      const count = slides.length;
      if (!count) return;
      const i = ((nextIndex % count) + count) % count;
      if (i === index && slides[i].classList.contains("is-active")) return;

      const prev = slides[index];
      if (prev && prev !== slides[i]) {
        prev.classList.remove("is-active");
        prev.setAttribute("aria-hidden", "true");
        prev.tabIndex = -1;
        if (!motionReduced()) {
          prev.classList.add("is-leaving");
          window.setTimeout(() => prev.classList.remove("is-leaving"), 240);
        }
      }

      const slide = slides[i];
      slide.classList.remove("is-leaving");
      slide.classList.add("is-active");
      slide.setAttribute("aria-hidden", "false");
      slide.tabIndex = 0;
      index = i;
    }

    function arm() {
      window.clearInterval(timer);
      timer = 0;
      if (!multiple || motionReduced() || hovering || focused) return;
      timer = window.setInterval(() => show(index + 1), 7000);
    }

    function setHover(on) {
      hovering = on;
      arm();
    }

    carousel.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "touch") return;
      setHover(true);
    });
    carousel.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "touch") return;
      setHover(false);
    });
    carousel.addEventListener("focusin", () => {
      focused = true;
      arm();
    });
    carousel.addEventListener("focusout", (e) => {
      if (carousel.contains(e.relatedTarget)) return;
      focused = false;
      arm();
    });

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (typeof motion.addEventListener === "function") {
      motion.addEventListener("change", arm);
    }

    slides.forEach((slide, i) => {
      const on = i === 0;
      slide.classList.toggle("is-active", on);
      slide.setAttribute("aria-hidden", on ? "false" : "true");
      slide.tabIndex = on ? 0 : -1;
    });
    arm();
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
      renderCarousel(covers);
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
