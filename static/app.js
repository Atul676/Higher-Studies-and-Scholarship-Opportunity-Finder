// StudyFinder discovery interactions: header, filters, search, reveals, and listing covers.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Header gets a deeper shadow once the page scrolls.
  const header = $("#siteHeader");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // Filters apply as soon as a dropdown or checkbox changes (the Apply button still works without JS).
  $$("form[data-autosubmit]").forEach((form) => {
    form.addEventListener("change", (e) => {
      if (e.target.matches("select, input[type=checkbox]")) form.requestSubmit();
    });
  });

  // Press "/" to jump to the search box.
  const search = $("[data-search-focus]");
  if (search) {
    document.addEventListener("keydown", (e) => {
      const typing = /^(input|textarea|select)$/i.test(document.activeElement.tagName);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); search.focus(); }
    });
  }

  // Flash messages close themselves after 6 seconds.
  $$("#flash .alert").forEach((el) => {
    setTimeout(() => window.bootstrap && bootstrap.Alert.getOrCreateInstance(el).close(), 6000);
  });

  // ---------- v3 ----------
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Header slides away when scrolling down and returns when scrolling up.
  if (header) {
    let lastY = window.scrollY;
    window.addEventListener("scroll", () => {
      const y = window.scrollY, open = $("#menu.show");
      header.classList.toggle("is-hidden", y > lastY && y > 220 && !open);
      lastY = y;
    }, { passive: true });
  }

  // Elements fade and rise into view once, staggered by --d.
  const reveal = $$("[data-reveal]");
  if (reveal.length && "IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      el.classList.add("in"); io.unobserve(el);
      setTimeout(() => el.removeAttribute("data-reveal"), 1100);   // hand transforms back to hover styles
    }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    reveal.forEach((el) => io.observe(el));
  } else reveal.forEach((el) => el.removeAttribute("data-reveal"));

  // Numbers count up when they appear.
  const counters = $$("[data-count]");
  if (counters.length && "IntersectionObserver" in window && !reduceMotion) {
    const co = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      co.unobserve(e.target);
      const end = +e.target.dataset.count, t0 = performance.now(), dur = 900;
      (function tick(now) {
        const p = Math.min(1, (now - t0) / dur);
        e.target.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    }));
    counters.forEach((el) => { el.textContent = "0"; co.observe(el); });
  }

  // University photos. Order: own photo or official photo URL (set by the server)
  // -> Wikipedia lead photo -> live preview of the official website -> flag and initials (always underneath).
  const wikiCache = (() => { try { return JSON.parse(localStorage.getItem("sf-wiki") || "{}"); } catch (e) { return {}; } })();
  const saveCache = () => { try { localStorage.setItem("sf-wiki", JSON.stringify(wikiCache)); } catch (e) { /* storage full or blocked */ } };
  async function wikiPhoto(title) {
    if (!title) return null;
    if (title in wikiCache) return wikiCache[title];
    try {
      const r = await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title.replace(/ /g, "_")));
      const j = r.ok ? await r.json() : null;
      let src = j && j.thumbnail && j.thumbnail.source;
      if (src) src = src.replace(/\/(\d+)px-/, "/800px-");
      wikiCache[title] = src ? { src, page: j.content_urls.desktop.page } : null;
    } catch (e) { return null; }
    saveCache();
    return wikiCache[title];
  }
  const preview = (site) => site ? "https://s0.wp.com/mshots/v1/" + encodeURIComponent(site) + "?w=800&h=500" : null;

  function loadCover(box) {
    const img = $(".cover-photo", box), credit = $(".cover-credit", box);
    if (!img) return;
    const sources = [];
    const show = (label) => {
      img.classList.add("is-loaded");
      img.classList.toggle("is-logo", img.naturalWidth < 500 || img.naturalWidth / img.naturalHeight > 2.6);
      box.classList.add("has-photo");
      if (label && credit) { credit.textContent = label; credit.hidden = false; }
    };
    const next = async () => {
      img.classList.remove("is-loaded"); box.classList.remove("has-photo");
      const s = sources.shift();
      if (!s) return;
      const found = await s();
      if (!found) return next();
      img.onload = () => (img.naturalWidth > 40 ? show(found.label) : next());
      img.onerror = next;
      img.src = found.src;
    };
    if (img.getAttribute("src")) {                         // own or official photo from the server
      sources.push(async () => wikiPhoto(box.dataset.wiki).then((w) => w && { src: w.src, label: "Photo: Wikipedia" }));
      sources.push(async () => ({ src: preview(box.dataset.site), label: "Official website" }));
      img.onerror = next;
      if (img.complete && !img.naturalWidth) next();
      else if (img.complete) show("");
      else img.onload = () => show("");
    } else {
      sources.push(async () => wikiPhoto(box.dataset.wiki).then((w) => w && { src: w.src, label: "Photo: Wikipedia" }));
      sources.push(async () => box.dataset.site ? { src: preview(box.dataset.site), label: "Official website" } : null);
      next();
    }
  }
  const covers = $$("[data-cover]");
  if ("IntersectionObserver" in window) {
    const lo = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { lo.unobserve(e.target); loadCover(e.target); }
    }), { rootMargin: "200px" });
    covers.forEach((c) => lo.observe(c));
  } else covers.forEach(loadCover);
})();
