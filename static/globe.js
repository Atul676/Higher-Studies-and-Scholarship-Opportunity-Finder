// Home page globe: spins, shows flight routes from the home country to every destination that has listings.
// Drag to rotate, hover a gold country for its flag and listing count, click to open its listings.
(function () {
  const wrap = document.getElementById("globeWrap");
  if (!wrap || !window.d3 || !window.topojson) return;
  const canvas = document.getElementById("globe"), tip = document.getElementById("globeTip");
  const ctx = canvas.getContext("2d");
  const cfg = window.GLOBE_DATA;
  const NAME_FIX = { "United States": "United States of America" };
  const toMap = (n) => NAME_FIX[n] || n;
  const toData = (n) => Object.keys(NAME_FIX).find((k) => NAME_FIX[k] === n) || n;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const C = { ocean0: "#1b3a8f", ocean1: "#0d1a45", land: "#3d548f", dest: "#f7b733", destHot: "#ffd56b", line: "rgba(255,255,255,.85)", border: "rgba(13,26,69,.7)" };

  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json").then((world) => {
    const countries = topojson.feature(world, world.objects.countries).features.filter((f) => f.properties.name !== "Antarctica");
    const borders = topojson.mesh(world, world.objects.countries, (a, b) => a !== b);
    const mainPart = (f) => {
      if (f.geometry.type !== "MultiPolygon") return f;
      let best = null, area = -1;
      f.geometry.coordinates.forEach((c) => { const p = { type: "Polygon", coordinates: c }, a = d3.geoArea(p); if (a > area) { area = a; best = p; } });
      return best;
    };
    const home = countries.find((f) => f.properties.name === toMap(cfg.origin));
    const dests = countries
      .filter((f) => (cfg.counts[toData(f.properties.name)] || 0) > 0 && f !== home)
      .map((f) => ({ f, name: toData(f.properties.name), n: cfg.counts[toData(f.properties.name)], c: d3.geoCentroid(mainPart(f)) }));
    if (!home || !dests.length) return;
    const origin = d3.geoCentroid(mainPart(home));
    wrap.classList.remove("is-empty");

    const projection = d3.geoOrthographic().clipAngle(90).precision(0.4);
    const path = d3.geoPath(projection, ctx);
    const sphere = { type: "Sphere" }, grid = d3.geoGraticule10();
    let rot = [-origin[0] + 10, -22], size = 0, hover = null, dragging = false, visible = true, last = performance.now(), raf = 0;

    function resize() {
      size = wrap.clientWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.height = Math.round(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      projection.translate([size / 2, size / 2]).scale(size / 2 - 2);
      draw(performance.now());
    }

    function draw(t) {
      projection.rotate(rot);
      ctx.clearRect(0, 0, size, size);
      const g = ctx.createRadialGradient(size * 0.38, size * 0.34, size * 0.05, size / 2, size / 2, size / 2);
      g.addColorStop(0, C.ocean0); g.addColorStop(1, C.ocean1);
      ctx.beginPath(); path(sphere); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); path(grid); ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.beginPath(); path({ type: "FeatureCollection", features: countries }); ctx.fillStyle = C.land; ctx.fill();
      dests.forEach((d) => { ctx.beginPath(); path(d.f); ctx.fillStyle = d === hover ? C.destHot : C.dest; ctx.fill(); });
      ctx.beginPath(); path(borders); ctx.strokeStyle = C.border; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.beginPath(); path(home); ctx.fillStyle = "#ffffff"; ctx.fill();

      // routes: dashed great-circle lines with a dot travelling along each
      ctx.lineWidth = 1.6; ctx.strokeStyle = C.line; ctx.setLineDash([5, 6]); ctx.lineDashOffset = -t * 0.02;
      dests.forEach((d) => { ctx.beginPath(); path({ type: "LineString", coordinates: [origin, d.c] }); ctx.stroke(); });
      ctx.setLineDash([]);
      const centre = [-rot[0], -rot[1]];
      dests.forEach((d, i) => {
        const p = d3.geoInterpolate(origin, d.c)(((t / 5200) + i * 0.17) % 1);
        if (d3.geoDistance(p, centre) > Math.PI / 2) return;
        const [x, y] = projection(p);
        ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 6.283); ctx.fillStyle = "#fff"; ctx.shadowColor = "#fff"; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
      });
      if (d3.geoDistance(origin, centre) < Math.PI / 2) {
        const [x, y] = projection(origin), pulse = ((t / 1600) % 1);
        ctx.beginPath(); ctx.arc(x, y, 4 + pulse * 14, 0, 6.283); ctx.strokeStyle = `rgba(255,255,255,${0.8 - pulse * 0.8})`; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 6.283); ctx.fillStyle = "#e5365b"; ctx.fill();
      }
    }

    function frame(now) {
      const dt = Math.min(64, now - last); last = now;
      if (!dragging && !hover) rot[0] += dt * 0.006;       // about 6 degrees per second
      draw(now);
      raf = visible ? requestAnimationFrame(frame) : 0;
    }
    const start = () => { if (!reduce && !raf && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    new IntersectionObserver((e) => { visible = e[0].isIntersecting; if (visible) start(); }).observe(wrap);

    // pointer: drag to rotate, hover to inspect, click to open
    let sx = 0, sy = 0, moved = 0;
    const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    function pick(e) {
      const [x, y] = local(e), ll = projection.invert([x, y]);
      if (!ll || d3.geoDistance(ll, [-rot[0], -rot[1]]) > Math.PI / 2) return null;
      return dests.find((d) => d3.geoContains(d.f, ll)) || null;
    }
    canvas.addEventListener("pointerdown", (e) => { dragging = true; moved = 0; sx = e.clientX; sy = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      if (dragging) {
        const dx = e.clientX - sx, dy = e.clientY - sy; sx = e.clientX; sy = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
        rot[0] += dx * 0.35; rot[1] = Math.max(-60, Math.min(60, rot[1] - dy * 0.35));
        if (reduce) draw(performance.now());
        return;
      }
      const d = pick(e);
      if (d !== hover) { hover = d; canvas.style.cursor = d ? "pointer" : ""; if (reduce) draw(performance.now()); }
      if (d) {
        const [x, y] = local(e), flag = cfg.flags[d.name];
        tip.hidden = false;
        tip.innerHTML = `${flag ? `<img class="flag" src="${flag}" alt="" height="16">` : ""}${d.name}<small>${d.n} listing${d.n === 1 ? "" : "s"}</small>`;
        tip.style.left = x + "px"; tip.style.top = y + "px";
      } else tip.hidden = true;
    });
    canvas.addEventListener("pointerup", (e) => {
      dragging = false;
      if (moved < 6) { const d = pick(e); if (d) location.href = `${cfg.searchUrl}?country=${encodeURIComponent(d.name)}`; }
    });
    canvas.addEventListener("pointerleave", () => { hover = null; tip.hidden = true; });

    new ResizeObserver(resize).observe(wrap);
    resize(); start();
  }).catch(() => { /* offline: the globe stays hidden, the rest of the page works */ });
})();
