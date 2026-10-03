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

  function bindPhotoParallax() {
    document.querySelectorAll(".filmstrip--photos").forEach((strip) => {
      const frames = strip.querySelectorAll(".frame img");
      if (!frames.length || reduceMotion) return;

      const onScroll = () => {
        const max = strip.scrollWidth - strip.clientWidth;
        const progress = max > 0 ? strip.scrollLeft / max : 0;
        frames.forEach((img) => {
          img.style.setProperty("--parallax", String((progress - 0.5) * -1));
        });
      };

      strip.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    });
  }

  const ROW_HEIGHT = 220;

  function sizeFrameForImage(frame, img) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return;
    const ratio = w / h;
    frame.style.height = `${ROW_HEIGHT}px`;
    frame.style.width = `${ROW_HEIGHT * ratio}px`;
    frame.style.aspectRatio = `${w} / ${h}`;
  }

  function buildTripBand(trip) {
    const band = document.createElement("div");
    band.className = "trip-band";

    const rail = document.createElement("div");
    rail.className = "trip-band__rail";

    const place = document.createElement("p");
    place.className = "trip-band__place";
    place.textContent = trip.place;
    rail.appendChild(place);

    if (trip.date) {
      const date = document.createElement("p");
      date.className = "trip-band__date";
      date.textContent = trip.date;
      rail.appendChild(date);
    }

    const wrap = document.createElement("div");
    wrap.className = "trip-band__strip-wrap";

    const images = Array.isArray(trip.images) ? trip.images : [];
    const strip = document.createElement("div");
    strip.className = "filmstrip filmstrip--photos";

    images.forEach((filename) => {
      const frame = document.createElement("div");
      frame.className = "frame";

      const img = document.createElement("img");
      img.src = `photos/${trip.slug}/${filename}`;
      img.alt = trip.place || "";
      img.loading = "lazy";
      img.tabIndex = 0;
      img.setAttribute("role", "button");
      img.setAttribute("aria-label", `Expand ${trip.place || "photo"}`);
      img.addEventListener("load", () => sizeFrameForImage(frame, img));
      img.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openLightbox(img);
        }
      });

      frame.appendChild(img);
      strip.appendChild(frame);
    });

    wrap.appendChild(strip);
    band.appendChild(rail);
    band.appendChild(wrap);
    return band;
  }

  function renderTrips(trips) {
    const root = document.getElementById("trips");
    if (!root) return;
    root.replaceChildren();
    trips.forEach((trip) => root.appendChild(buildTripBand(trip)));
    bindPhotoParallax();
  }

  // Load trips from photos/trips.json (relative URL for /personal-site/ Pages)
  (async function loadTrips() {
    try {
      const res = await fetch("photos/trips.json");
      if (!res.ok) throw new Error("trips fetch failed");
      const data = await res.json();
      const trips = data && Array.isArray(data.trips) ? data.trips : [];
      if (!trips.length) {
        initEmptyMarquee();
        return;
      }
      renderTrips(trips);
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

  // Photo lightbox: expand from thumbnail rect → screen, shrink back on close
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  let lightboxSource = null;
  let lightboxBusy = false;

  function rectToStyle(rect) {
    return {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    };
  }

  function getExpandedRect(naturalW, naturalH) {
    const padX = window.innerWidth * 0.04;
    const padY = window.innerHeight * 0.03;
    const maxW = Math.max(1, window.innerWidth - padX * 2);
    const maxH = Math.max(1, window.innerHeight - padY * 2);
    const ratio = naturalW / naturalH || 1;
    let width = maxW;
    let height = width / ratio;
    if (height > maxH) {
      height = maxH;
      width = height * ratio;
    }
    return {
      top: (window.innerHeight - height) / 2,
      left: (window.innerWidth - width) / 2,
      width,
      height,
    };
  }

  function applyRect(el, rect, withTransition) {
    el.style.transition = withTransition
      ? "top 240ms ease-out, left 240ms ease-out, width 240ms ease-out, height 240ms ease-out"
      : "none";
    Object.assign(el.style, rectToStyle(rect));
  }

  function openLightbox(img) {
    if (!lightbox || !lightboxImg || !img || !img.src || lightboxBusy) return;
    lightboxBusy = true;
    lightboxSource = img;

    const from = img.getBoundingClientRect();
    const nw = img.naturalWidth || from.width;
    const nh = img.naturalHeight || from.height;

    lightboxImg.src = img.currentSrc || img.src;
    lightboxImg.alt = img.alt || "";
    img.style.opacity = "0";

    lightbox.hidden = false;
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    applyRect(lightboxImg, from, false);
    void lightboxImg.offsetWidth;

    lightbox.classList.add("is-open");

    const to = getExpandedRect(nw, nh);
    if (reduceMotion) {
      applyRect(lightboxImg, to, false);
      lightboxBusy = false;
      return;
    }

    requestAnimationFrame(() => {
      applyRect(lightboxImg, to, true);
      const done = () => {
        lightboxImg.removeEventListener("transitionend", onEnd);
        lightboxBusy = false;
      };
      const onEnd = (e) => {
        if (e.target !== lightboxImg) return;
        done();
      };
      lightboxImg.addEventListener("transitionend", onEnd);
      setTimeout(done, 300);
    });
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hidden || !lightboxSource) return;
    lightboxBusy = true;

    const finish = () => {
      lightbox.classList.remove("is-open");
      lightbox.hidden = true;
      lightbox.setAttribute("aria-hidden", "true");
      lightboxImg.removeAttribute("src");
      lightboxImg.alt = "";
      lightboxImg.style.transition = "none";
      lightboxImg.style.top = "";
      lightboxImg.style.left = "";
      lightboxImg.style.width = "";
      lightboxImg.style.height = "";
      document.body.style.overflow = "";
      if (lightboxSource) {
        lightboxSource.style.opacity = "";
        if (typeof lightboxSource.focus === "function") lightboxSource.focus();
      }
      lightboxSource = null;
      lightboxBusy = false;
    };

    if (reduceMotion || !lightboxSource) {
      finish();
      return;
    }

    const back = lightboxSource.getBoundingClientRect();
    lightbox.classList.remove("is-open"); // fade backdrop while image shrinks
    applyRect(lightboxImg, back, true);

    let done = false;
    const wrapUp = () => {
      if (done) return;
      done = true;
      lightboxImg.removeEventListener("transitionend", onEnd);
      finish();
    };
    const onEnd = (e) => {
      if (e.target !== lightboxImg) return;
      wrapUp();
    };
    lightboxImg.addEventListener("transitionend", onEnd);
    setTimeout(wrapUp, 300);
  }

  const tripsRoot = document.getElementById("trips");
  if (tripsRoot) {
    tripsRoot.addEventListener("click", (e) => {
      const img = e.target.closest(".filmstrip--photos .frame img");
      if (!img) return;
      openLightbox(img);
    });
  }

  if (lightbox) {
    lightbox.querySelectorAll("[data-lightbox-close]").forEach((el) => {
      el.addEventListener("click", closeLightbox);
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
  });
})();
