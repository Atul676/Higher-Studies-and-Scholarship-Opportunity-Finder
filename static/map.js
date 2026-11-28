// Destination map: choose "from" and "to", draw a curved flight route, zoom and pan.
// Works on the /map page and inside the profile form.
(function () {
  const W = 960, H = 500;
  const NAME_FIX = { "United States": "United States of America" };   // CSV name -> map name
  const toMapName = (n) => NAME_FIX[n] || n;
  const toDataName = (n) => Object.keys(NAME_FIX).find((k) => NAME_FIX[k] === n) || n;
  const $ = (id) => document.getElementById(id);

  const svgEl = $("worldMap");
  if (!svgEl) return;
  const svg = d3.select(svgEl);
  const fromSel = $("fromCountry"), toSel = $("toCountry");
  const info = $("routeInfo"), tip = $("mapTip");
  const cfg = window.MAP_DATA || { counts: {}, searchUrl: "/search", flags: {} };
  let k = 1, planeTimer = null;

  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json").then((world) => {
    $("mapLoading").remove();
    const countries = topojson.feature(world, world.objects.countries).features
      .filter((f) => f.properties.name !== "Antarctica");
    const projection = d3.geoNaturalEarth1().fitSize([W, H], { type: "FeatureCollection", features: countries });
    const path = d3.geoPath(projection);

    svg.append("defs").append("marker")
      .attr("id", "arrowHead").attr("viewBox", "0 0 10 10").attr("refX", 6).attr("refY", 5)
      .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
      .append("path").attr("d", "M 0 0 L 10 5 L 0 10 z").attr("fill", "#e5365b");
    svg.append("rect").attr("width", W).attr("height", H).attr("class", "ocean");

    const view = svg.append("g");                       // everything inside here zooms
    const land = view.append("g").selectAll("path").data(countries).join("path")
      .attr("class", "country").attr("d", path)
      .on("mousemove", (e, d) => {
        tip.hidden = false; const nm = toDataName(d.properties.name), fl = (cfg.flags || {})[nm];
        tip.innerHTML = (fl ? `<img class="flag" src="${fl}" alt="" height="16">` : "") + nm;
        const box = svgEl.parentNode.getBoundingClientRect();
        tip.style.left = e.clientX - box.left + 12 + "px";
        tip.style.top = e.clientY - box.top + 12 + "px";
      })
      .on("mouseleave", () => (tip.hidden = true))
      .on("click", (e, d) => {                          // 1st click = from, 2nd = to
        const name = toDataName(d.properties.name);
        if (!fromSel.value || toSel.value) { fromSel.value = name; toSel.value = ""; }
        else { toSel.value = name; }
        update();
      });
    const routeLayer = view.append("g");

    // ----- zoom and pan -----
    const zoom = d3.zoom().scaleExtent([1, 10]).translateExtent([[0, 0], [W, H]])
      .filter((e) => (e.type === "wheel" ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.button))
      .on("zoom", (e) => {
        k = e.transform.k;
        view.attr("transform", e.transform);
        svgEl.style.setProperty("--k", k);              // keeps lines the same thickness
        routeLayer.selectAll(".pin").attr("r", 5 / k);
      });
    svg.call(zoom).on("dblclick.zoom", null);

    const smooth = (ms) => svg.transition().duration(ms);
    const bind = (id, fn) => { const b = $(id); if (b) b.addEventListener("click", fn); };
    bind("zoomIn", () => smooth(250).call(zoom.scaleBy, 1.7));
    bind("zoomOut", () => smooth(250).call(zoom.scaleBy, 1 / 1.7));
    bind("zoomReset", () => smooth(500).call(zoom.transform, d3.zoomIdentity));
    bind("zoomFit", () => fitRoute());

    // ----- fill the two dropdowns -----
    const names = countries.map((f) => toDataName(f.properties.name)).sort((a, b) => a.localeCompare(b));
    [fromSel, toSel].forEach((sel) => {
      names.forEach((n) => sel.add(new Option(n, n)));
      const want = sel.dataset.value;
      if (want && names.includes(want)) sel.value = want;
    });

    // ----- helpers -----
    const find = (dataName) => countries.find((f) => f.properties.name === toMapName(dataName));

    // largest piece of a country, so the USA is not pulled towards Alaska or France towards Guiana
    function mainPart(feature) {
      if (feature.geometry.type !== "MultiPolygon") return feature;
      let best = null, bestArea = -1;
      feature.geometry.coordinates.forEach((coords) => {
        const part = { type: "Polygon", coordinates: coords };
        const a = d3.geoArea(part);
        if (a > bestArea) { bestArea = a; best = part; }
      });
      return best;
    }
    const centre = (f) => projection(d3.geoCentroid(mainPart(f)));

    let routePoints = [];
    function fitRoute() {
      if (!routePoints.length) return;
      const xs = routePoints.map((p) => p[0]), ys = routePoints.map((p) => p[1]);
      const x0 = Math.min(...xs) - 50, x1 = Math.max(...xs) + 50;
      const y0 = Math.min(...ys) - 50, y1 = Math.max(...ys) + 50;
      const s = Math.max(1, Math.min(8, 0.95 / Math.max((x1 - x0) / W, (y1 - y0) / H)));
      const t = d3.zoomIdentity.translate(W / 2 - s * (x0 + x1) / 2, H / 2 - s * (y0 + y1) / 2).scale(s);
      smooth(750).call(zoom.transform, t);
    }

    function stopPlane() { if (planeTimer) { cancelAnimationFrame(planeTimer); planeTimer = null; } }

    // ----- draw -----
    function update() {
      stopPlane();
      routeLayer.selectAll("*").remove();
      routePoints = [];
      const from = fromSel.value, to = toSel.value;
      land.classed("is-origin", (d) => d.properties.name === toMapName(from))
          .classed("is-dest", (d) => d.properties.name === toMapName(to));
      renderInfo(from, to);

      const a = from && find(from), b = to && find(to);
      if (!a || !b || from === to) return;

      const [x1, y1] = centre(a), [x2, y2] = centre(b);
      const dx = x2 - x1, dy = y2 - y1, dist = Math.hypot(dx, dy) || 1;
      const lift = Math.min(170, dist * 0.35);
      const sign = dx >= 0 ? 1 : -1;
      const cx = (x1 + x2) / 2 + (dy / dist) * lift * sign;
      const cy = (y1 + y2) / 2 - (Math.abs(dx) / dist) * lift - lift * 0.15;
      const dAttr = `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
      routePoints = [[x1, y1], [x2, y2], [cx, cy]];
      [a, b].forEach((f) => { const bb = path.bounds(mainPart(f)); routePoints.push(bb[0], bb[1]); });

      routeLayer.append("path").attr("d", dAttr).attr("class", "route-shadow");
      const line = routeLayer.append("path").attr("d", dAttr).attr("class", "route-line")
        .attr("marker-end", "url(#arrowHead)");
      const len = line.node().getTotalLength();
      line.attr("stroke-dasharray", len).attr("stroke-dashoffset", len)
        .transition().duration(1300).ease(d3.easeCubicInOut).attr("stroke-dashoffset", 0)
        .on("end", () => line.attr("stroke-dasharray", null).attr("stroke-dashoffset", null).classed("dashed", true));

      [[x1, y1, "pin-origin"], [x2, y2, "pin-dest"]].forEach(([x, y, cls]) => {
        routeLayer.append("circle").attr("cx", x).attr("cy", y).attr("r", 5 / k).attr("class", "pin " + cls);
        routeLayer.append("circle").attr("cx", x).attr("cy", y).attr("r", 5 / k).attr("class", "pin pulse " + cls);
      });

      const plane = routeLayer.append("path").attr("class", "plane")
        .attr("d", "M0,-9 L3,-2 L11,2 L11,4 L3,2 L2,8 L5,10 L5,11 L0,10 L-5,11 L-5,10 L-2,8 L-3,2 L-11,4 L-11,2 L-3,-2 Z");
      const node = line.node(), start = performance.now(), flight = 3200;
      (function fly(now) {
        const t = ((now - start) % flight) / flight;
        const p = node.getPointAtLength(t * len);
        const q = node.getPointAtLength(Math.min(len, t * len + 1));
        const angle = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI + 90;
        plane.attr("transform", `translate(${p.x},${p.y}) rotate(${angle}) scale(${0.9 / k})`);
        planeTimer = requestAnimationFrame(fly);
      })(start);

      fitRoute();
    }

    function renderInfo(from, to) {
      if (!from && !to) { info.hidden = true; return; }
      info.hidden = false;
      if (from && to && from === to) {
        info.innerHTML = '<span class="text-muted">Choose two different countries to see a route.</span>';
        return;
      }
      const fi = (n) => ((cfg.flags || {})[n] ? `<img class="flag-round" src="${cfg.flags[n]}" alt="">` : "");
      let html = `<div class="route-flags">${fi(from)}${from && to ? '<i class="bi bi-airplane"></i>' : ""}${fi(to)}</div>`;
      html += from && to ? `<h2 class="h4 mb-1">${from} to ${to}</h2>` : `<h2 class="h4 mb-1">${from || to}</h2>`;
      const fa = from && find(from), fb = to && find(to);
      if (fa && fb) {
        const km = Math.round(d3.geoDistance(d3.geoCentroid(mainPart(fa)), d3.geoCentroid(mainPart(fb))) * 6371 / 10) * 10;
        html += `<div class="route-meta"><span class="chip"><i class="bi bi-airplane"></i>About ${km.toLocaleString("en-IN")} km</span></div>`;
      }
      if (to) {
        const n = cfg.counts[to] || 0;
        html += n > 0
          ? `<p class="mb-2 text-muted">${n} listing${n === 1 ? "" : "s"} in ${to}.</p>
             <a class="btn btn-brand" href="${cfg.searchUrl}?country=${encodeURIComponent(to)}">See opportunities in ${to}</a>`
          : `<p class="mb-0 text-muted">There are no listings for ${to} in the dataset yet.</p>`;
      } else {
        html += '<p class="mb-0 text-muted">Now choose the country you want to study in.</p>';
      }
      info.innerHTML = html;
    }

    fromSel.addEventListener("change", update);
    toSel.addEventListener("change", update);
    bind("swapBtn", () => { const t = fromSel.value; fromSel.value = toSel.value; toSel.value = t; update(); });
    update();
  }).catch(() => {
    const m = $("mapLoading");
    if (m) m.textContent = "Could not load the map. Check your internet connection and refresh the page.";
  });
})();
