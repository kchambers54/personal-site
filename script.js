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

  // 1. Name letter reveal
  const name = document.querySelector("[data-reveal]");
  if (name) {
    const text = name.textContent;
    name.textContent = "";
    name.setAttribute("aria-label", text);

    [...text].forEach((ch, i) => {
      const span = document.createElement("span");
      span.className = ch === " " ? "char char--space" : "char";
      span.textContent = ch === " " ? "\u00a0" : ch;
      span.style.animationDelay = reduceMotion ? "0ms" : `${i * 40}ms`;
      name.appendChild(span);
    });

    if (reduceMotion) {
      name.querySelectorAll(".char").forEach((el) => {
        el.style.transform = "none";
      });
    } else {
      requestAnimationFrame(() => name.classList.add("is-ready"));
    }
  }

  // 3. Empty filmstrip: duplicate set for seamless marquee
  document.querySelectorAll("[data-marquee]").forEach((strip) => {
    const track = strip.querySelector(".filmstrip__track");
    const set = strip.querySelector(".filmstrip__set");
    if (!track || !set) return;
    const clone = set.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    track.appendChild(clone);
  });

  // Real photo strips: tiny parallax against scroll (6%)
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
