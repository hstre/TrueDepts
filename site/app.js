/* Zinslast-Jahrgänge – Frontend ohne Build-Schritt und ohne externe Bibliotheken.
 * Liest die von pipeline/build.py erzeugten JSON-Dateien aus data/.
 */
(function () {
  "use strict";

  // ------------------------------------------------------------------ Hilfen
  const nf1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf3 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const nf0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
  const CUR_SYMBOL = { EUR: "€", USD: "US-$", GBP: "£", JPY: "¥" };

  function money(v, cur) {
    if (v === null || v === undefined || Number.isNaN(v)) return "–";
    const s = CUR_SYMBOL[cur || "EUR"] || cur;
    if (Math.abs(v) >= 1000) return nf1.format(v / 1000) + " Mrd. " + s;
    return nf1.format(v) + " Mio. " + s;
  }
  function moneyShort(v) {
    if (v === 0) return "0";
    if (Math.abs(v) >= 1000) return nf1.format(v / 1000) + " Mrd.";
    if (Math.abs(v) >= 100) return nf0.format(v) + " Mio.";
    return nf1.format(v) + " Mio.";
  }
  function pct(v, digits) {
    if (v === null || v === undefined) return "–";
    return (digits === 3 ? nf3 : nf2).format(v) + " %";
  }
  function dateDe(iso) {
    if (!iso) return "–";
    const [y, m, d] = iso.split("-");
    return d + "." + m + "." + y;
  }

  /** Element erzeugen. Kinder: Strings werden als Text eingefügt (nie als HTML). */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") el.className = v;
        else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const svgNS = "http://www.w3.org/2000/svg";
  function s(tag, attrs, ...children) {
    const el = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined) el.setAttribute(k, v);
    for (const c of children.flat()) if (c) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  }

  const STATUS = {
    calc: { ico: "●", label: "aus einzelnen Emissionen berechnet" },
    mixed: { ico: "●", label: "berechnet, teils Projektion" },
    model: { ico: "◆", label: "modelliert" },
    proj: { ico: "◌", label: "Projektion" },
    official: { ico: "▲", label: "amtliche Statistik" },
    intl: { ico: "○", label: "internationale Datenbank" },
    none: { ico: "–", label: "keine ausreichenden Daten" },
  };
  function chip(status, text) {
    const st = STATUS[status] || STATUS.none;
    return h("span", { class: "chip " + status, title: st.label }, h("span", { class: "ico", "aria-hidden": "true" }, st.ico), text || st.label);
  }

  async function getJSON(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(url + ": " + r.status);
    return r.json();
  }
  const cache = {};
  function load(url) {
    if (!cache[url]) cache[url] = getJSON(url);
    return cache[url];
  }

  // ------------------------------------------------------------------ Diagramme
  function niceTicks(min, max, count) {
    if (min === max) { max = min + 1; }
    const span = max - min;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const err = step0 / mag;
    const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
    return ticks;
  }

  let tipEl = null;
  function showTip(container, x, y, content) {
    if (!tipEl || tipEl.parentNode !== container) {
      tipEl = h("div", { class: "tooltip", role: "status" });
      container.append(tipEl);
    }
    tipEl.replaceChildren(h("div", { class: "t-head" }, content.head),
      ...content.rows.map(r => h("div", { class: "t-row" },
        r.color ? h("span", { class: "k", style: "background:" + r.color }) : null,
        h("strong", null, r.value), h("span", { class: "lab" }, r.label))),
      content.note ? h("div", { class: "lab muted", style: "margin-top:.25rem" }, content.note) : null);
    tipEl.style.display = "block";
    const cw = container.clientWidth;
    const tw = tipEl.offsetWidth;
    let left = x + 12;
    if (left + tw > cw) left = Math.max(0, x - tw - 12);
    tipEl.style.left = left + "px";
    tipEl.style.top = Math.max(0, y - 10) + "px";
  }
  function hideTip() { if (tipEl) tipEl.style.display = "none"; }

  /**
   * Säulendiagramm mit gestapelten Serien (positiv nach oben, negativ nach unten),
   * optionaler Spanne (Whisker), optionalen Punkten (gleiche Einheit, eine Achse) und
   * schraffierten Lücken-Bändern.
   */
  function barChart(container, opts) {
    const n = opts.cats.length;
    const draw = () => {
      const W = Math.max(300, container.clientWidth || 800);
      const H = opts.height || (W < 500 ? 220 : 280);
      const m = { l: 58, r: 8, t: 10, b: 26 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      let lo = 0, hi = 0;
      for (let i = 0; i < n; i++) {
        let p = 0, q = 0;
        for (const st of opts.stacks) { const v = st.values[i] || 0; if (v >= 0) p += v; else q += v; }
        hi = Math.max(hi, p); lo = Math.min(lo, q);
        if (opts.whisker && opts.whisker.hi[i] !== null) { hi = Math.max(hi, opts.whisker.hi[i]); lo = Math.min(lo, opts.whisker.lo[i]); }
        if (opts.dots && opts.dots.values[i] !== null && opts.dots.values[i] !== undefined) { hi = Math.max(hi, opts.dots.values[i]); lo = Math.min(lo, opts.dots.values[i]); }
      }
      const ticks = niceTicks(lo, hi, W < 500 ? 4 : 5);
      const y0 = ticks[0], y1 = ticks[ticks.length - 1];
      const Y = v => m.t + ih - (v - y0) / (y1 - y0) * ih;
      const band = iw / n;
      const bw = Math.max(1, Math.min(28, band - Math.max(1, Math.min(4, band * 0.25))));
      const X = i => m.l + band * i + (band - bw) / 2;
      const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.ariaLabel || "" });
      const defs = s("defs", null,
        s("pattern", { id: "hatch-proj", patternUnits: "userSpaceOnUse", width: 5, height: 5, patternTransform: "rotate(45)" },
          s("rect", { width: 5, height: 5, fill: "var(--series-2)", "fill-opacity": 0.35 }),
          s("line", { x1: 0, y1: 0, x2: 0, y2: 5, stroke: "var(--series-2)", "stroke-width": 2.5 })),
        s("pattern", { id: "hatch-model", patternUnits: "userSpaceOnUse", width: 5, height: 5, patternTransform: "rotate(135)" },
          s("rect", { width: 5, height: 5, fill: "var(--series-1)", "fill-opacity": 0.18 }),
          s("line", { x1: 0, y1: 0, x2: 0, y2: 5, stroke: "var(--series-1)", "stroke-width": 1.6 })),
        s("pattern", { id: "hatch-gap", patternUnits: "userSpaceOnUse", width: 6, height: 6, patternTransform: "rotate(135)" },
          s("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "var(--gap-hatch)", "stroke-width": 1.5 })));
      svg.append(defs);
      // Lückenbänder
      if (opts.gaps) {
        let i = 0;
        while (i < n) {
          if (opts.gaps[i]) {
            let j = i; while (j + 1 < n && opts.gaps[j + 1]) j++;
            svg.append(s("rect", { x: m.l + band * i, y: m.t, width: band * (j - i + 1), height: ih, fill: "url(#hatch-gap)", opacity: 0.8 }));
            if (opts.gapLabel && (j - i + 1) * band > opts.gapLabel.length * 6.5 + 16) {
              svg.append(s("text", { x: m.l + band * (i + j + 1) / 2, y: m.t + ih / 2, "text-anchor": "middle" }, opts.gapLabel));
            }
            i = j + 1;
          } else i++;
        }
      }
      // Raster
      const g = s("g", { class: "grid" });
      for (const t of ticks) {
        g.append(s("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }));
        svg.append(s("text", { x: m.l - 6, y: Y(t) + 4, "text-anchor": "end" }, opts.yFormat ? opts.yFormat(t) : moneyShort(t)));
      }
      svg.insertBefore(g, svg.firstChild.nextSibling);
      // Säulen
      for (let i = 0; i < n; i++) {
        let pos = 0, neg = 0;
        for (const st of opts.stacks) {
          const v = st.values[i];
          if (!v) continue;
          let yA, yB;
          if (v >= 0) { yA = Y(pos + v); yB = Y(pos); pos += v; } else { yA = Y(neg); yB = Y(neg + v); neg += v; }
          const hgt = Math.max(0.5, yB - yA - (opts.stacks.length > 1 ? 1 : 0));
          svg.append(s("rect", {
            x: X(i), y: yA, width: bw, height: hgt, rx: bw > 8 ? 2 : 0,
            fill: st.pattern === "model" ? "url(#hatch-model)" : st.pattern ? "url(#hatch-proj)" : st.color,
            stroke: st.pattern === "model" ? "var(--series-1)" : st.pattern ? "var(--series-2)" : null, "stroke-width": st.pattern ? 1 : null,
          }));
        }
        if (opts.whisker && opts.whisker.hi[i] !== null && opts.whisker.hi[i] !== opts.whisker.lo[i]) {
          const cx = X(i) + bw / 2;
          const a = Y(opts.whisker.hi[i]), b = Y(opts.whisker.lo[i]);
          const cap = Math.min(8, bw);
          svg.append(s("path", { d: `M${cx},${a}V${b}M${cx - cap / 2},${a}H${cx + cap / 2}M${cx - cap / 2},${b}H${cx + cap / 2}`, stroke: "var(--text)", "stroke-width": 1.5, fill: "none" }));
        }
      }
      // Punkte (gleiche Einheit wie Säulen)
      if (opts.dots) {
        const pts = [];
        for (let i = 0; i < n; i++) {
          const v = opts.dots.values[i];
          if (v === null || v === undefined) { if (pts.length) { svg.append(s("polyline", { points: pts.join(" "), fill: "none", stroke: opts.dots.color, "stroke-width": 1.5, "stroke-opacity": 0.6 })); pts.length = 0; } continue; }
          pts.push(`${X(i) + bw / 2},${Y(v)}`);
        }
        if (pts.length) svg.append(s("polyline", { points: pts.join(" "), fill: "none", stroke: opts.dots.color, "stroke-width": 1.5, "stroke-opacity": 0.6 }));
        for (let i = 0; i < n; i++) {
          const v = opts.dots.values[i];
          if (v === null || v === undefined) continue;
          svg.append(s("circle", { cx: X(i) + bw / 2, cy: Y(v), r: band < 8 ? 2.5 : 3.5, fill: opts.dots.color, stroke: "var(--surface)", "stroke-width": 1.5 }));
        }
      }
      // Nulllinie und x-Achse
      svg.append(s("line", { class: "zero", x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0) }));
      const every = opts.xEvery || Math.ceil(n / Math.max(2, Math.floor(iw / 42)));
      for (let i = 0; i < n; i++) {
        const lab = String(opts.cats[i]);
        const yr = parseInt(lab, 10);
        const show = (Number.isFinite(yr) ? yr % every === 0 : i % every === 0) || n <= 12;
        if (show) svg.append(s("text", { x: X(i) + bw / 2, y: H - 8, "text-anchor": "middle" }, lab));
      }
      if (opts.selected !== undefined && opts.selected >= 0) {
        svg.append(s("rect", { class: "sel", x: m.l + band * opts.selected + 0.5, y: m.t, width: Math.max(2, band - 1), height: ih, rx: 2 }));
      }
      // Trefferflächen (größer als die Marke: volle Spaltenhöhe)
      for (let i = 0; i < n; i++) {
        const hit = s("rect", { class: "hit", x: m.l + band * i, y: m.t, width: band, height: ih, tabindex: opts.focusable === false ? null : 0 });
        const show = (ev) => {
          const box = container.getBoundingClientRect();
          const px = ev && ev.clientX !== undefined ? ev.clientX - box.left : (X(i) / W) * container.clientWidth;
          const py = ev && ev.clientY !== undefined ? ev.clientY - box.top : 20;
          showTip(container, px, py, opts.tooltip(i));
        };
        hit.addEventListener("pointermove", show);
        hit.addEventListener("focus", () => show(null));
        hit.addEventListener("pointerleave", hideTip);
        hit.addEventListener("blur", hideTip);
        if (opts.onClick) {
          hit.addEventListener("click", () => opts.onClick(i));
          hit.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opts.onClick(i); } });
        }
        svg.append(hit);
      }
      container.replaceChildren(svg);
      tipEl = null;
    };
    draw();
    let t;
    const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(draw, 120); });
    ro.observe(container);
    return () => ro.disconnect();
  }

  function tableView(summaryText, headers, rows) {
    return h("details", { class: "table-view" }, h("summary", null, summaryText),
      h("div", { class: "table-scroll" }, h("table", null,
        h("thead", null, h("tr", null, headers.map(x => h("th", { class: x.r ? "r" : null }, x.t)))),
        h("tbody", null, rows.map(r => h("tr", null, r.map((c, j) => h("td", { class: headers[j].r ? "r" : null }, c))))))));
  }

  // ------------------------------------------------------------------ Zustand & Routing
  const app = document.getElementById("app");
  let cleanups = [];
  const state = { country: "DE", year: null };

  function setNav(key) {
    document.querySelectorAll("nav.main a").forEach(a => a.toggleAttribute("aria-current", a.dataset.nav === key));
    document.querySelectorAll("nav.main a[aria-current]").forEach(a => a.setAttribute("aria-current", "page"));
  }

  async function route() {
    cleanups.forEach(f => f()); cleanups = [];
    hideTip();
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    try {
      if (parts[0] === "quellen") { setNav("quellen"); await viewSources(); }
      else if (parts[0] === "methode") { setNav("methode"); await viewMethod(); }
      else if (parts[0] === "pruefung") { setNav("pruefung"); await viewVerification(); }
      else if (parts[0] === "regierungen") { setNav("regierungen"); await viewGovernments(); }
      else {
        setNav("jahr");
        const countries = await load("data/countries.json");
        const code = (parts[0] || state.country).toUpperCase();
        state.country = countries.countries.some(c => c.code === code) ? code : "DE";
        const y = parseInt(parts[1], 10);
        const defYear = countries.last_year - 1;
        state.year = Number.isFinite(y) && y >= countries.first_year && y <= countries.last_year ? y : (state.year || defYear);
        await viewYear(countries);
      }
    } catch (err) {
      app.replaceChildren(h("div", { class: "card" }, h("h2", null, "Daten konnten nicht geladen werden"),
        h("p", null, String(err)), h("p", { class: "muted" }, "Die Seite muss über einen Webserver geöffnet werden (z. B. python -m http.server im Ordner site/).")));
    }
  }
  window.addEventListener("hashchange", route);

  // ------------------------------------------------------------------ Jahresansicht
  function controls(countries) {
    const cSel = h("select", { id: "country", onchange: e => { location.hash = `#/${e.target.value}/${state.year}`; } },
      countries.countries.map(c => h("option", { value: c.code, selected: c.code === state.country ? true : null },
        c.name + (c.vintage_data ? "" : " – nur Vergleichsdaten"))));
    const years = [];
    for (let y = countries.last_year; y >= countries.first_year; y--) years.push(y);
    const ySel = h("select", { id: "year", onchange: e => { location.hash = `#/${state.country}/${e.target.value}`; } },
      years.map(y => h("option", { value: y, selected: y === state.year ? true : null }, String(y))));
    const prev = h("button", { class: "btn", type: "button", "aria-label": "Vorjahr", disabled: state.year <= countries.first_year ? true : null,
      onclick: () => { location.hash = `#/${state.country}/${state.year - 1}`; } }, "‹");
    const next = h("button", { class: "btn", type: "button", "aria-label": "Folgejahr", disabled: state.year >= countries.last_year ? true : null,
      onclick: () => { location.hash = `#/${state.country}/${state.year + 1}`; } }, "›");
    return h("div", { class: "controls" },
      h("label", { for: "country" }, "Land", cSel),
      h("label", { for: "year" }, "Jahr", h("span", { class: "year-step" }, prev, ySel, next)));
  }

  async function viewYear(countries) {
    const country = countries.countries.find(c => c.code === state.country);
    const intl = await load("data/intl.json");
    const nodes = [h("h1", null, `Kreditjahrgang ${state.year} · ${country.name}`), controls(countries)];
    if (country.vintage_data) {
      const [summary, yearData, sources] = await Promise.all([
        load("data/de/summary.json"), load(`data/de/years/${state.year}.json`), load("data/sources.json")]);
      nodes.push(...renderDE(summary, yearData, intl.DE, sources));
    } else {
      nodes.push(...renderIntlOnly(country, intl[country.code], countries));
    }
    app.replaceChildren(...nodes);
    document.title = `${state.year} · ${country.name} · Zinslast-Jahrgänge`;
  }

  function overviewCard(summary, intlDE) {
    const years = summary.years;
    const cats = years.map(y => y.year);
    const cost = years.map(y => y.totals ? y.totals.cost : 0);
    const modelOf = y => (!y.totals && y.aggregate && y.aggregate.model && y.aggregate.model.role === "estimate") ? y.aggregate.model : null;
    const model = years.map(y => (modelOf(y) ? modelOf(y).mid : 0));
    const wLo = years.map(y => (modelOf(y) ? modelOf(y).low : null));
    const wHi = years.map(y => (modelOf(y) ? modelOf(y).high : null));
    const paid = years.map(y => y.paid && y.paid.cash !== undefined ? y.paid.cash : (intlDE.wb_interest[y.year] ?? null));
    const gaps = years.map(y => !y.totals && !modelOf(y));
    const sel = cats.indexOf(state.year);
    const box = h("div", { class: "chart" });
    const card = h("section", { class: "card chart-card", "aria-labelledby": "ov-h" },
      h("h2", { id: "ov-h" }, "Überblick: eingegangene Zinslast je Jahrgang"),
      h("div", { class: "note compare" },
        h("strong", null, "Säulen und Punkte messen Verschiedenes und sind in der Höhe nicht direkt vergleichbar. "),
        h("br"), "Säule: Summe aller Zinskosten, die die in diesem Jahr erfassten Kredite über ihre ", h("em", null, "gesamte Laufzeit"), " auslösen – verteilt auf viele künftige Jahre, nur für die erfassten Emissionen.",
        h("br"), "Punkt: Zinsen, die in ", h("em", null, "genau diesem einen Jahr"), " auf ", h("em", null, "alle"), " alten und neuen Schulden gezahlt wurden."),
      h("p", { class: "chart-sub" }, "Deutschland, Bund. Beträge vor 1999 von D-Mark in Euro umgerechnet (1,95583), nicht inflationsbereinigt. Jahr anklicken zum Wechseln."),
      h("div", { class: "legend" },
        h("span", null, h("span", { class: "key", style: "background:var(--series-1)" }), "Säule: Zinslast über die gesamte Laufzeit – erfasste Emissionen, berechnet (ab 1999)"),
        h("span", null, h("span", { class: "key", style: "background-image:repeating-linear-gradient(135deg,var(--series-1) 0 2px,transparent 2px 5px);border:1px solid var(--series-1)" }), "Säule: dasselbe, modelliert aus Bundesbank-Aggregaten, Linie = Spanne (1960–1998)"),
        h("span", null, h("span", { class: "key dot", style: "background:var(--paid)" }), "Punkt: in einem einzelnen Jahr gezahlte Zinsen auf alle Schulden (bis 1994 Weltbank, ab 1995 amtlich)"),
        h("span", null, h("span", { class: "key hatch" }), "keine Einzelemissionsdaten")),
      box);
    queueMicrotask(() => cleanups.push(barChart(box, {
      cats, stacks: [{ key: "cost", color: "var(--series-1)", values: cost }, { key: "model", pattern: "model", values: model }],
      whisker: { lo: wLo, hi: wHi }, dots: { values: paid, color: "var(--paid)" },
      gaps, gapLabel: "keine ausreichenden Daten", selected: sel, height: 200, focusable: false,
      xEvery: 10, ariaLabel: "Überblick der Jahrgangskosten und gezahlten Zinsen 1945 bis heute",
      tooltip: i => {
        const y = years[i];
        const rows = [];
        const md = modelOf(y);
        rows.push(y.totals ? { color: "var(--series-1)", value: money(y.totals.cost), label: "Zinslast der erfassten Emissionen, gesamte Laufzeit" + (y.totals.partial ? " (Jahr läuft)" : "") }
          : md ? { color: "var(--series-1)", value: `${money(md.low)} – ${money(md.high)}`, label: "Zinslast, gesamte Laufzeit – modelliert (Größenordnung)" }
          : { value: "keine ausreichenden Daten", label: "Jahrgangskosten" });
        if (paid[i] !== null) rows.push({ color: "var(--paid)", value: money(paid[i]), label: y.paid && y.paid.cash !== undefined ? "in diesem Jahr gezahlt, alle Schulden (amtlich)" : "in diesem Jahr gezahlt, alle Schulden (Weltbank)" });
        return { head: String(y.year), rows, note: md ? "Modell: Brutto-Absatz × Emissionsrendite × angenommene Laufzeit" : null };
      },
      onClick: i => { location.hash = `#/DE/${cats[i]}`; },
    })));
    return card;
  }

  function contextCard(v, summary) {
    const ctx = v.context || {};
    const govs = v.governments.length ? v.governments.map(g => `${g.head} (${g.parties}, ab ${dateDe(g.from)})`).join("; ") : "–";
    return h("section", { class: "card", "aria-label": "Rahmen des Jahres" }, h("dl", { class: "context" },
      h("div", null, h("dt", null, "Gebietsstand"), h("dd", null, ctx.territory || "–")),
      h("div", null, h("dt", null, "Währung"), h("dd", null, ctx.currency || "–")),
      h("div", null, h("dt", null, "Staatsdefinition"), h("dd", null, ctx.state || "–")),
      h("div", null, h("dt", null, "Bundesregierung(en) im Jahr"), h("dd", null, govs))),
      h("details", { class: "table-view" }, h("summary", null, "Abgrenzung der Daten (Bund, nicht Gesamtstaat)"), h("p", { class: "muted" }, summary.scope)));
  }

  function tile(label, statusChip, value, subs) {
    return h("div", { class: "tile" }, h("div", { class: "label" }, label), statusChip, value, ...subs.filter(Boolean));
  }

  /** Hinweis, welcher Anteil der amtlichen Bruttokreditaufnahme durch die erfassten Emissionen abgedeckt ist. */
  function coverageLine(v) {
    const t = v.totals;
    if (!t) return null;
    if (v.coverage !== null && v.coverage !== undefined && v.split) {
      return h("div", { class: "coverage" }, "Teilsumme: Die erfassten Emissionen decken ", h("strong", null, nf0.format(v.coverage * 100) + " %"),
        ` der amtlichen Bruttokreditaufnahme ab (${money(t.allotted)} von ${money(v.split.gross)}). `,
        "Nicht enthalten: Verkäufe aus dem Eigenbestand, nicht auktionierte Instrumente, Geldmarktkredite.");
    }
    return h("div", { class: "coverage" }, "Teilsumme: nur die erfassten Emissionen. Der Abdeckungsgrad gegenüber der amtlichen Bruttokreditaufnahme steht erst nach Jahresabschluss fest.");
  }

  function renderDE(summary, v, intlDE, sources) {
    const out = [overviewCard(summary, intlDE), contextCard(v, summary)];
    const t = v.totals;
    const partial = v.year === summary.last_year;
    const tiles = [];
    // 1. Neu aufgenommen
    if (t) {
      tiles.push(tile(h("span", null, h("b", null, "1 · Neu aufgenommen"), " – erfasste Emissionen: zugeteilte Kredite und Anleihen (Nennwert)"), chip("calc"),
        h("div", { class: "value" }, money(t.allotted)),
        [h("div", { class: "sub" }, "Emissionserlös ", h("strong", null, money(t.proceeds)), ` aus ${v.issues.filter(i => i.cost !== undefined).length} Emissionen`),
          t.retained ? h("div", { class: "sub" }, "Zusätzlich ", h("strong", null, money(t.retained)), " in den Eigenbestand genommen (nicht verkauft; ", chip("none", "Verkaufserlös unbekannt"), ")") : null,
          partial ? h("div", { class: "sub" }, `Laufendes Jahr: Emissionen bis ${dateDe(v.data_through)}.`) : null]));
    } else if (v.aggregate && v.aggregate.gross) {
      const ag = v.aggregate;
      tiles.push(tile(h("span", null, h("b", null, "1 · Neu aufgenommen"), " – Anleihen des Bundes, Brutto-Absatz (Nennwert)"), chip("official", "amtlich: Bundesbank"),
        h("div", { class: "value" }, money(ag.gross)),
        [ag.gross_dm ? h("div", { class: "sub" }, "= ", h("strong", null, nf1.format(ag.gross_dm / 1000) + " Mrd. DM"), " (umgerechnet 1,95583 DM/€)") : null,
          ag.gross_le4 !== null ? h("div", { class: "sub" }, "Laufzeit bis 4 Jahre ", h("strong", null, money(ag.gross_le4)), " · über 4 Jahre ", h("strong", null, money(ag.gross_gt4))) : null,
          h("div", { class: "sub" }, "Nur Anleihen (Inhaberschuldverschreibungen); Kredite, Schuldscheindarlehen und Geldmarkttitel fehlen. Keine Einzelemissionen ", chip("none", "Kurs, Kupon, Fälligkeit je Emission unbekannt"))]));
    } else {
      tiles.push(tile(h("span", null, h("b", null, "1 · Neu aufgenommen")), chip("none"), h("div", { class: "value nodata" }, "Keine Einzelemissionsdaten"),
        [v.split ? h("div", { class: "sub" }, "Amtliche Bruttokreditaufnahme: ", h("strong", null, money(v.split.gross)), " ", chip("official")) : null]));
    }
    // 2. Anschlussfinanzierung / Netto
    if (v.split) {
      const sp = v.split;
      const refShare = sp.gross ? Math.min(1, sp.refinancing / sp.gross) : 0;
      tiles.push(tile(h("span", null, h("b", null, "2 · Anschlussfinanzierung / zusätzliche Nettoverschuldung")), chip("model", "modelliert: Saldenrechnung"),
        h("div", { class: "value" }, money(sp.net), h("span", { class: "sub", style: "font-size:.85rem;font-weight:400" }, " netto")),
        [h("div", { class: "split-bar", role: "img", "aria-label": `Anteil Anschlussfinanzierung ${nf0.format(refShare * 100)} Prozent` },
          h("span", { style: `width:${refShare * 100}%;background:var(--series-1-soft)` }), h("span", { style: `width:${(1 - refShare) * 100}%;background:var(--series-1)` })),
          h("div", { class: "sub" }, "Tilgungen (Anschlussfinanzierung) ", h("strong", null, money(sp.refinancing)), " · Brutto ", h("strong", null, money(sp.gross)), " ", chip("official", sp.source === "bundesbank" ? "amtlich: Bundesbank" : null)),
          sp.cost_net !== undefined ? h("div", { class: "sub" }, "Zinslast rechnerisch auf zusätzliche Verschuldung: ", h("strong", null, money(sp.cost_net)), ` (${nf0.format(sp.share_net * 100)} % proportional)`) : null,
          sp.cost_net_model ? h("div", { class: "sub" }, "Zinslast rechnerisch auf zusätzliche Verschuldung (modelliert): ", h("strong", null, `${money(sp.cost_net_model[0])} – ${money(sp.cost_net_model[2])}`)) : null,
          sp.source === "bundesbank" ? h("div", { class: "sub" }, "Nur Anleihen des Bundes; netto = Veränderung des Umlaufs laut Bundesbank, Tilgung = Brutto − netto. Umstellungen der Statistik (z. B. 1957, 1990) können Sprünge verursachen.") : null,
          !sp.complete_year ? h("div", { class: "sub" }, `Amtliche Werte bis ${dateDe(sp.as_of)}.`) : null]));
    } else {
      tiles.push(tile(h("span", null, h("b", null, "2 · Anschlussfinanzierung / zusätzliche Nettoverschuldung")), chip("none"), h("div", { class: "value nodata" }, "Keine amtlichen Brutto-/Tilgungsdaten"), []));
    }
    // 3. Kosten bis Fälligkeit
    if (t) {
      const band = t.cost_low !== t.cost_high;
      tiles.push(tile(h("span", null, h("b", null, "3 · Finanzierungskosten der erfassten Emissionen"), " – bis Fälligkeit"), chip(band ? "mixed" : "calc"),
        h("div", { class: "value" }, money(t.cost)),
        [coverageLine(v), band ? h("div", { class: "sub" }, "davon fest ", h("strong", null, money(t.cost_fixed)), "; gesamt ", h("strong", null, money(t.cost_low) + " bis " + money(t.cost_high)), " ", chip("proj", "Projektion 0–4 % Inflation")) : null,
          h("div", { class: "sub" }, "Ø Rendite ", h("strong", null, pct(t.avg_yield)), " · Ø Laufzeit ", h("strong", null, nf1.format(t.avg_term) + " J.")),
          t.cost < 0 ? h("div", { class: "sub" }, "Negativ: Anleihen wurden über dem Rückzahlungsbetrag verkauft (negative Renditen).") : null]));
    } else if (v.aggregate && v.aggregate.model) {
      const m = v.aggregate.model, terms = summary.model_terms;
      tiles.push(tile(h("span", null, h("b", null, "3 · Finanzierungskosten der erfassten Anleihen"), " – Größenordnung bis Fälligkeit"), chip("model", "modelliert, grobe Spanne"),
        h("div", { class: "value" }, `${money(m.low)} – ${money(m.high)}`),
        [h("div", { class: "sub" }, "Mittelwert ", h("strong", null, money(m.mid)), " · Ø Emissionsrendite ", h("strong", null, pct(v.aggregate.em_yield))),
          h("div", { class: "sub" }, `Modell: Brutto-Absatz × Emissionsrendite des Monats × Laufzeit (bis 4 J.: ${nf1.format(terms.short[0])}/${nf1.format(terms.short[1])}/${nf1.format(terms.short[2])} J.; über 4 J.: ${nf0.format(terms.long[0])}/${nf0.format(terms.long[1])}/${nf0.format(terms.long[2])} J.), Ausgabe zu pari.`),
          m.volume_fallback_yield ? h("div", { class: "sub" }, `Für ${money(m.volume_fallback_yield)} ohne veröffentlichte Emissionsrendite wurde die Umlaufsrendite des Monats verwendet.`) : null,
          summary.model_backtest && summary.model_backtest.normal_years ? h("div", { class: "sub" }, `Rückrechnung ${summary.model_backtest.normal_years[0]}–${summary.model_backtest.normal_years[1]}: exakter Wert in ${summary.model_backtest.normal_in_band} von ${summary.model_backtest.normal_n} Jahren in der Spanne, Mittelwert meist zu hoch. `, h("a", { href: "#/pruefung" }, "Details")) : null]));
    } else {
      tiles.push(tile(h("span", null, h("b", null, "3 · Finanzierungskosten bis Fälligkeit")), chip("none"), h("div", { class: "value nodata" }, "Keine ausreichenden Daten"),
        [h("div", { class: "sub" }, v.aggregate && v.aggregate.gross ? "Für diese Jahre veröffentlicht die Bundesbank keine Emissionsrendite; ohne Zinssatz lässt sich keine Zinslast abschätzen." : "Aus Schuldenstand oder Zinssumme lässt sich ein Jahrgang nicht rekonstruieren.")]));
    }
    // 5. Tatsächlich gezahlt
    const p = v.paid;
    if (p.status === "official") {
      tiles.push(tile(h("span", null, h("b", null, "5 · Im Jahr tatsächlich gezahlte Zinsen"), " – auf alte und neue Schulden (Vergleichszahl)"), chip("official"),
        h("div", { class: "value" }, money(p.cash)),
        [p.total !== p.cash ? h("div", { class: "sub" }, "inkl. periodengerechter Verteilung von Agio/Disagio: ", h("strong", null, money(p.total))) : null,
          !p.complete_year ? h("div", { class: "sub" }, `Stand ${dateDe(p.as_of)} (Jahr unvollständig).`) : null,
          p.wb !== undefined ? h("div", { class: "sub" }, "Weltbank, Zentralstaat: ", h("strong", null, money(p.wb)), " ", chip("intl")) : null]));
    } else if (p.status === "intl") {
      tiles.push(tile(h("span", null, h("b", null, "5 · Im Jahr tatsächlich gezahlte Zinsen")), chip("intl"),
        h("div", { class: "value" }, money(p.wb)), [h("div", { class: "sub" }, "Weltbank, Zinsausgaben Zentralstaat (abweichende Abgrenzung; historische DM-Werte in Euro umgerechnet laut Weltbank).")]));
    } else {
      tiles.push(tile(h("span", null, h("b", null, "5 · Im Jahr tatsächlich gezahlte Zinsen")), chip("none"), h("div", { class: "value nodata" }, "Keine ausreichenden Daten"), []));
    }
    out.push(h("div", { class: "tiles" }, tiles));

    out.push(mainChartCard(v, summary));
    if (t) {
      out.push(refinancingCard(v));
      out.push(breakdownCard(v, sources));
      out.push(issuesCard(v, sources));
    }
    out.push(gapsCard(v, summary));
    return out;
  }

  function mainChartCard(v, summary) {
    const card = h("section", { class: "card chart-card", "aria-labelledby": "main-h" },
      h("h2", { id: "main-h" }, "Welche Zinslast wurde in diesem Jahr für die Zukunft eingegangen?"));
    const t = v.totals;
    if (!t && v.aggregate && v.aggregate.model) {
      const m = v.aggregate.model;
      card.append(h("p", null, chip("model"), ` Grobe Größenordnung für ${v.year}: `, h("strong", null, `${money(m.low)} bis ${money(m.high)}`), ` (Mittelwert ${money(m.mid)}).`),
        h("p", { class: "muted" }, "Eine Aufteilung nach Zahlungsjahren ist nicht möglich, weil Kupon, Ausgabekurs und Fälligkeit der einzelnen Anleihen in den verwendeten Quellen fehlen. ",
          "Die Spanne entsteht aus Annahmen über die Laufzeit; sie ist keine Berechnung aus Einzelemissionen und nicht mit den Werten ab 1999 gleichwertig."));
      return card;
    }
    if (!t) {
      card.append(h("p", null, chip("none"), " Für ", String(v.year), " liegen keine Einzelemissionen vor. Die Zinslast dieses Jahrgangs wird deshalb nicht berechnet und nicht geschätzt."),
        h("p", { class: "muted" }, v.year < 1949 ? "In diesem Jahr gab es noch keinen Bund als Schuldner." :
          v.aggregate && v.aggregate.gross ? "Die Bundesbank weist für dieses Jahr zwar das begebene Volumen aus, aber keine Emissionsrendite (erst ab 1960)." :
          "Die Emissionshistorie der Finanzagentur beginnt 1999. Für frühere Jahre müssten Emissionsdaten der Bundesschuldenverwaltung bzw. Bundesbank erschlossen werden."));
      return card;
    }
    const years = Object.keys(v.flows).map(Number).sort((a, b) => a - b);
    const first = years[0], last = years[years.length - 1];
    const cats = []; for (let y = first; y <= last; y++) cats.push(y);
    const get = (y, k) => (v.flows[y] ? v.flows[y][k] : 0);
    const fixed = cats.map(y => get(y, 0));
    const projMid = cats.map(y => get(y, 2));
    const hasProj = projMid.some(x => Math.abs(x) > 0.05);
    const whiskerLo = cats.map((y, i) => (Math.abs(get(y, 1)) + Math.abs(get(y, 3)) > 0.05 ? Math.max(0, fixed[i]) + get(y, 1) : null));
    const whiskerHi = cats.map((y, i) => (Math.abs(get(y, 1)) + Math.abs(get(y, 3)) > 0.05 ? Math.max(0, fixed[i]) + get(y, 3) : null));
    const band = t.cost_low !== t.cost_high;
    card.append(h("p", { class: "chart-sub" },
      `Die ${v.year} erfassten Emissionen kosten bis zur letzten Fälligkeit ${last} insgesamt `, h("strong", null, money(t.cost)),
      band ? ` (Spanne ${money(t.cost_low)} bis ${money(t.cost_high)}, davon fest ${money(t.cost_fixed)})` : "",
      ". Dargestellt ist die Zinslast je Zahlungsjahr – ohne Tilgung, ohne spätere Anschlussfinanzierung.",
      v.coverage !== null && v.coverage !== undefined ? ` Das ist eine Teilsumme: Die erfassten Emissionen decken ${nf0.format(v.coverage * 100)} % der amtlichen Bruttokreditaufnahme ab.` : " Das ist eine Teilsumme der Kreditaufnahme dieses Jahres."));
    card.append(h("div", { class: "legend" },
      h("span", null, h("span", { class: "key", style: "background:var(--series-1)" }), "feststehend (Kupons, Disagio/Agio, erhaltene Stückzinsen) ", chip("calc")),
      hasProj ? h("span", null, h("span", { class: "key proj" }), "abhängig von Inflation – mittleres Szenario 2 %; Linie = Spanne 0 % bis 4 % ", chip("proj")) : null));
    const box = h("div", { class: "chart" });
    card.append(box);
    queueMicrotask(() => cleanups.push(barChart(box, {
      cats, stacks: [{ key: "fixed", color: "var(--series-1)", values: fixed }].concat(hasProj ? [{ key: "proj", pattern: true, values: projMid }] : []),
      whisker: hasProj ? { lo: whiskerLo, hi: whiskerHi } : null,
      ariaLabel: `Zinslast des Jahrgangs ${v.year} nach Zahlungsjahr`,
      tooltip: i => {
        const y = cats[i];
        const rows = [{ color: "var(--series-1)", value: money(fixed[i]), label: "feststehend" }];
        if (hasProj && whiskerLo[i] !== null) rows.push({ color: "var(--series-2)", value: money(projMid[i]), label: `Projektion (2 %), Spanne ${money(get(y, 1))} – ${money(get(y, 3))}` });
        return { head: `Zahlungsjahr ${y}`, rows, note: fixed[i] < 0 ? "Negativ: erhaltene Stückzinsen oder Agio (Verkauf über pari)." : null };
      },
    })));
    card.append(h("p", { class: "muted", style: "font-size:.85rem;margin-top:.5rem" },
      "Disagio/Agio erscheint im Fälligkeitsjahr, weil erst dann der volle Nennwert zurückgezahlt wird; vom Käufer gezahlte Stückzinsen mindern die Kosten im Emissionsjahr. ",
      summary.ilb_last_official ? `Inflationsindexierte Zahlungen bis ${dateDe(summary.ilb_last_official)} mit amtlichen Index-Verhältniszahlen, danach Projektion.` : ""));
    card.append(tableView("Als Tabelle anzeigen", [{ t: "Zahlungsjahr" }, { t: "feststehend", r: 1 }, { t: "Projektion 0 %", r: 1 }, { t: "Projektion 2 %", r: 1 }, { t: "Projektion 4 %", r: 1 }, { t: "Summe (2 %)", r: 1 }],
      cats.map(y => [String(y), money(get(y, 0)), money(get(y, 1)), money(get(y, 2)), money(get(y, 3)), money(get(y, 0) + get(y, 2))])));
    return card;
  }

  function refinancingCard(v) {
    const years = Object.keys(v.maturities).map(Number).sort((a, b) => a - b);
    const first = years[0], last = years[years.length - 1];
    const cats = []; for (let y = first; y <= last; y++) cats.push(y);
    const vals = cats.map(y => v.maturities[y] || 0);
    const total = vals.reduce((a, b) => a + b, 0);
    const box = h("div", { class: "chart" });
    const card = h("section", { class: "card chart-card", "aria-labelledby": "refi-h" },
      h("h2", { id: "refi-h" }, "Getrennt davon: Risiko der Anschlussfinanzierung"),
      h("p", { class: "chart-sub" }, "Bei Fälligkeit muss der Rückzahlungsbetrag neu finanziert werden, sofern er nicht aus Überschüssen getilgt wird. Die Kosten dieser Anschlussfinanzierung stehen heute nicht fest und sind ",
        h("strong", null, "nicht"), " in der Zinslast oben enthalten. ",
        `Jeder Prozentpunkt Zins auf die Anschlussfinanzierung kostet ${money(total * 0.01)} pro Jahr, solange die Anschlusskredite laufen.`),
      h("div", { class: "legend" }, h("span", null, h("span", { class: "key", style: "background:var(--series-1-soft);border:1px solid var(--series-1)" }), "fälliger Rückzahlungsbetrag (inflationsindexiert: mittleres Szenario)")),
      box,
      tableView("Als Tabelle anzeigen", [{ t: "Jahr" }, { t: "fällig", r: 1 }, { t: "je 1 %-Pkt. Anschlusszins p. a.", r: 1 }],
        cats.filter((y, i) => vals[i]).map(y => [String(y), money(v.maturities[y]), money(v.maturities[y] * 0.01)])));
    queueMicrotask(() => cleanups.push(barChart(box, {
      cats, stacks: [{ key: "mat", color: "var(--series-1-soft)", values: vals }], height: 180,
      ariaLabel: "Fällige Beträge des Jahrgangs nach Jahr",
      tooltip: i => ({ head: `Fällig ${cats[i]}`, rows: [{ color: "var(--series-1)", value: money(vals[i]), label: "Rückzahlung" }, { value: money(vals[i] * 0.01), label: "je 1 %-Pkt. Anschlusszins p. a." }] }),
    })));
    return card;
  }

  function breakdownCard(v, sources) {
    const labels = sources.instrument_labels;
    const inst = Object.entries(v.by_instrument).sort((a, b) => b[1].allotted - a[1].allotted);
    const govRows = v.governments.filter(g => g.n);
    return h("section", { class: "card", "aria-labelledby": "bd-h" },
      h("h2", { id: "bd-h" }, "Aufschlüsselung"),
      h("div", { class: "two-col" },
        h("div", null, h("h3", null, "Nach Wertpapierart"), h("div", { class: "table-scroll" }, h("table", null,
          h("thead", null, h("tr", null, h("th", null, "Art"), h("th", { class: "r" }, "Anzahl"), h("th", { class: "r" }, "zugeteilt"), h("th", { class: "r" }, "Kosten bis Fälligkeit"))),
          h("tbody", null, inst.map(([k, x]) => h("tr", null, h("td", null, labels[k] || k), h("td", { class: "r" }, String(x.n)), h("td", { class: "r" }, money(x.allotted)),
            h("td", { class: "r" }, money(x.cost), x.cost_low !== x.cost_high ? h("div", { class: "muted" }, `${money(x.cost_low)} – ${money(x.cost_high)}`) : null))))))),
        h("div", null, h("h3", null, "Nach Bundesregierung (Emissionstag)"), h("div", { class: "table-scroll" }, h("table", null,
          h("thead", null, h("tr", null, h("th", null, "Regierung"), h("th", { class: "r" }, "zugeteilt"), h("th", { class: "r" }, "Kosten bis Fälligkeit"))),
          h("tbody", null, govRows.map(g => h("tr", null, h("td", null, g.head, h("div", { class: "muted" }, g.parties)), h("td", { class: "r" }, money(g.allotted)),
            h("td", { class: "r" }, money(g.cost), g.cost_low !== g.cost_high ? h("div", { class: "muted" }, `${money(g.cost_low)} – ${money(g.cost_high)}`) : null)))))),
          h("p", { class: "muted", style: "font-size:.8rem" }, "Vereinfachte Zuordnung nach Emissionstag; Kreditermächtigungen erteilt der Bundestag im Haushaltsgesetz. ", h("a", { href: "#/regierungen" }, "Alle Regierungen")))));
  }

  function issuesCard(v, sources) {
    const labels = sources.instrument_labels, methods = sources.method_labels;
    const kinds = Array.from(new Set(v.issues.map(i => i.instrument)));
    const sel = h("select", { id: "instFilter" }, h("option", { value: "" }, "alle Wertpapierarten"), kinds.map(k => h("option", { value: k }, labels[k] || k)));
    const tbody = h("tbody");
    const LIMIT = 25;
    let showAll = false;
    const more = h("button", { class: "btn", type: "button", style: "margin-top:.5rem" });
    more.addEventListener("click", () => { showAll = !showAll; fill(); });
    const fill = () => {
      const f = sel.value;
      const rows = [];
      const list = v.issues.filter(i => !f || i.instrument === f);
      more.textContent = showAll ? "Weniger anzeigen" : `Alle ${list.length} Emissionen anzeigen`;
      more.hidden = list.length <= LIMIT;
      for (const i of (showAll ? list : list.slice(0, LIMIT))) {
        const name = `${i.instrument}${i.coupon ? " " + nf2.format(i.coupon * 100) + " %" : ""} ${dateDe(i.maturity)}`;
        const st = i.status === "proj" ? chip("proj", "berechnet + Projektion") : chip(i.status, i.status === "calc" ? "berechnet" : null);
        const tr = h("tr", { class: "issue", tabindex: 0, "aria-expanded": "false" },
          h("td", { class: "num" }, dateDe(i.date)),
          h("td", null, name, h("div", { class: "muted" }, i.isin + " · " + (methods[i.method] || i.method))),
          h("td", { class: "r" }, i.cost !== undefined ? money(i.allotted) : "–", i.retained ? h("div", { class: "muted" }, "+" + money(i.retained) + " EB") : null),
          h("td", { class: "r hide-sm" }, i.price !== null ? String(i.price).replace(".", ",") : "–"),
          h("td", { class: "r hide-sm" }, i.yield_pub !== null ? pct(i.yield_pub, i.kind === "zero" ? 3 : 2) : "–"),
          h("td", { class: "r" }, i.cost !== undefined ? money(i.cost) : "–", i.cost !== undefined && i.cost_low !== i.cost_high ? h("div", { class: "muted" }, `${money(i.cost_low)} – ${money(i.cost_high)}`) : null),
          h("td", null, st));
        let detail = null;
        const toggle = () => {
          if (detail) { detail.remove(); detail = null; tr.setAttribute("aria-expanded", "false"); return; }
          detail = h("tr", { class: "detail" }, h("td", { colspan: 7 }, issueDetail(i, labels, methods)));
          tr.after(detail); tr.setAttribute("aria-expanded", "true");
        };
        tr.addEventListener("click", toggle);
        tr.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
        rows.push(tr);
      }
      tbody.replaceChildren(...rows);
    };
    sel.addEventListener("change", () => { showAll = false; fill(); });
    fill();
    return h("section", { class: "card", "aria-labelledby": "is-h" },
      h("h2", { id: "is-h" }, `Einzelemissionen ${v.year} (${v.issues.length})`),
      h("p", { class: "muted" }, "Zeile antippen für Zahlungsstrom, Annahmen und Quellzeile. EB = Marktpflegequote/Eigenbestand, nicht an Investoren verkauft."),
      h("div", { class: "controls" }, h("label", { for: "instFilter" }, "Filter", sel)),
      h("div", { class: "table-scroll" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "Auktion"), h("th", null, "Wertpapier"), h("th", { class: "r" }, "zugeteilt"), h("th", { class: "r hide-sm" }, "Kurs"),
          h("th", { class: "r hide-sm" }, "Rendite"), h("th", { class: "r" }, "Kosten bis Fälligkeit"), h("th", null, "Status"))), tbody)), more);
  }

  function issueDetail(i, labels, methods) {
    const kv = (k, val) => [h("dt", null, k), h("dd", null, val)];
    const parts = [h("dl", { class: "kv" },
      kv("Wertpapier", `${labels[i.instrument] || i.instrument}, ISIN ${i.isin}`),
      kv("Verfahren", `${methods[i.method] || i.method}${i.new ? " (Neuemission)" : " (Aufstockung)"}`),
      kv("Auktion / Valuta", `${dateDe(i.date)} / ${dateDe(i.settle)} (${i.settle_rule === "T+2" ? "Annahme T+2 Geschäftstage" : i.settle_rule})`),
      kv("Emissionsvolumen", `${money(i.issue_volume)}, davon zugeteilt ${money(i.allotted)}, Eigenbestand ${money(i.retained)}`),
      i.kind !== "zero" ? kv("Zinslaufbeginn", `${dateDe(i.interest_start)} (${i.interest_start_source || "–"})`) : null,
      i.first_coupon_basis ? kv("Erster Kupon", `${i.first_coupon} – ${i.first_coupon_basis}`) : null,
      kv("Kurs / Rendite", `${i.price ?? "–"} % / veröffentlicht ${i.yield_pub ?? "–"} %, nachgerechnet ${i.yield_calc ?? "–"} %`),
      i.proceeds !== undefined ? kv("Emissionserlös", `${money(i.proceeds)} (Kurswert ${money(i.clean_proceeds)} + Stückzinsen ${money(i.accrued)})`) : null,
      i.cost !== undefined ? kv("Kosten bis Fälligkeit", `${money(i.cost)}${i.cost_low !== i.cost_high ? ` (Spanne ${money(i.cost_low)} – ${money(i.cost_high)}, fest ${money(i.cost_fixed)})` : ""}`) : null,
      kv("Regierung / BMF", `${i.gov || "–"} / ${i.fm || "–"}`),
      kv("Quelle", `Emissionshistorie der Finanzagentur, Tabellenzeile ${i.row}`))];
    if (i.note) parts.push(h("p", { class: "note" }, i.note));
    if (i.cash) {
      parts.push(h("h3", { style: "margin-top:.5rem" }, "Zahlungsstrom aus Sicht des Bundes"),
        h("div", { class: "flowlist num" }, i.cash.map(([d, k, val]) => h("div", null, `${dateDe(d)} · ${k}: `, h("strong", null, money(val))))));
      const comp = i.components || {};
      const names = { coupon: "Kupons", accrued: "erhaltene Stückzinsen", discount: "Disagio (+) / Agio (−)", indexation: "Inflationsausgleich Kapital (2 %)" };
      parts.push(h("p", { class: "muted" }, "Kostenkomponenten: ", Object.entries(comp).map(([k, val]) => `${names[k] || k} ${money(val)}`).join(" · ")));
    }
    return h("div", null, parts);
  }

  function gapsCard(v, summary) {
    const items = [];
    if (v.totals) {
      if (v.totals.retained) items.push(`Eigenbestand/Marktpflegequote: ${money(v.totals.retained)} Nennwert wurden bei Emission nicht verkauft. Spätere Verkäufe im Sekundärmarkt und deren Kurse sind in den Emissionsdaten nicht enthalten – keine ausreichenden Daten.`);
      if (v.coverage !== null && v.coverage !== undefined) items.push(`Abdeckung: Die zugeteilten Emissionen entsprechen ${nf0.format(v.coverage * 100)} % der amtlichen Bruttokreditaufnahme. Der Rest entfällt u. a. auf Verkäufe aus dem Eigenbestand, nicht auktionierte Instrumente (z. B. Bundesschatzbriefe und Finanzierungsschätze bis 2012, Schuldscheindarlehen, Daueremissionen) und Geldmarktkredite.`);
      items.push("Zins- und Währungsswaps des Bundes sind nicht berücksichtigt.");
      if (v.issues.some(i => i.kind === "fixed_fx")) items.push("US-Dollar-Anleihen: modelliert zum Euro-Gegenwert der Emissionshistorie.");
    } else if (v.aggregate && v.aggregate.model) {
      items.push("Keine Einzelemissionen: Zinslast nur als modellierte Spanne aus Bundesbank-Aggregaten (Brutto-Absatz, Emissionsrendite) mit Laufzeitannahmen; keine Aufteilung nach Zahlungsjahren.");
      items.push("Erfasst sind nur Anleihen des Bundes. Kredite, Schuldscheindarlehen, Ausgleichsforderungen und Geldmarkttitel fehlen.");
      items.push("Beträge von D-Mark in Euro umgerechnet (1,95583 DM/€), nicht inflationsbereinigt.");
    } else {
      items.push("Für dieses Jahr liegen in den geprüften Quellen keine Einzelemissionen und keine Emissionsrenditen vor; Jahrgangskosten werden weder berechnet noch geschätzt.");
    }
    if (!v.split) items.push("Amtliche Bruttokreditaufnahme und Tilgungen: Schuldenbericht ab 1995, Anleihen des Bundes laut Bundesbank ab 1948.");
    if (v.paid.status === "intl") items.push("Gezahlte Zinsen stammen aus der Weltbank-Datenbank (Zentralstaat) und sind nicht direkt mit den Bundeszahlen ab 1995 vergleichbar.");
    return h("section", { class: "card", "aria-labelledby": "gap-h" },
      h("h2", { id: "gap-h" }, "Datenlücken und Annahmen für " + v.year),
      h("ul", { class: "gaps" }, items.map(x => h("li", null, x))),
      h("p", { class: "muted" }, "Alle Quellen mit Abrufdatum: ", h("a", { href: "#/quellen" }, "Quellenansicht"), " · Rechenweg mit Beispiel: ", h("a", { href: "#/methode" }, "Methode")));
  }

  function renderIntlOnly(country, series, countries) {
    const years = [];
    for (let y = countries.first_year; y <= countries.last_year; y++) years.push(y);
    const wb = series.wb_interest, imf = series.imf_debt;
    const val = wb[state.year];
    const out = [];
    out.push(h("section", { class: "card" }, h("p", null, chip("none"), ` Für ${country.name} sind noch keine Einzelemissionen importiert. `,
      "Kreditjahrgänge, Aufteilung in Anschlussfinanzierung und Nettoverschuldung sowie Finanzierungskosten bis Fälligkeit werden deshalb nicht angezeigt – auch nicht geschätzt."),
      h("p", { class: "muted" }, `Beträge in ${country.currency}. Gebietsstand und Staatsdefinition gemäß Weltbank bzw. IWF; historische Werte in Landeswährung nach heutiger Denomination.`)));
    const nd = (n, lbl) => tile(h("span", null, h("b", null, n), " " + lbl), chip("none"), h("div", { class: "value nodata" }, "Keine ausreichenden Daten"), []);
    out.push(h("div", { class: "tiles" },
      nd("1 ·", "Neu aufgenommen"), nd("2 ·", "Anschlussfinanzierung / Nettoverschuldung"), nd("3 ·", "Finanzierungskosten bis Fälligkeit"),
      val !== undefined
        ? tile(h("span", null, h("b", null, "5 · Im Jahr gezahlte Zinsen"), " (Zentralstaat)"), chip("intl"), h("div", { class: "value" }, money(val, country.currency)),
          [imf[state.year] !== undefined ? h("div", { class: "sub" }, "Schuldenstand Gesamtstaat (IWF): ", h("strong", null, nf1.format(imf[state.year]) + " % des BIP"), " – nur Kontext") : null])
        : nd("5 ·", "Im Jahr gezahlte Zinsen")));
    const box = h("div", { class: "chart" });
    out.push(h("section", { class: "card chart-card" }, h("h2", null, "Gezahlte Zinsen im Zeitverlauf (Vergleichszahl)"),
      h("p", { class: "chart-sub" }, "Weltbank, Zinsausgaben des Zentralstaats in " + country.currency + ". Schraffiert: keine Daten. Diese Reihe erlaubt keine Rekonstruktion von Kreditjahrgängen."),
      box));
    queueMicrotask(() => cleanups.push(barChart(box, {
      cats: years, stacks: [{ color: "var(--series-1)", values: years.map(y => wb[y] || 0) }], gaps: years.map(y => wb[y] === undefined),
      selected: years.indexOf(state.year), height: 220, xEvery: 10, focusable: false, gapLabel: "keine Daten",
      yFormat: t => moneyShort(t),
      tooltip: i => ({ head: String(years[i]), rows: [wb[years[i]] !== undefined ? { color: "var(--series-1)", value: money(wb[years[i]], country.currency), label: "gezahlte Zinsen (Weltbank)" } : { value: "keine Daten", label: "" }] }),
      onClick: i => { location.hash = `#/${country.code}/${years[i]}`; },
    })));
    out.push(h("section", { class: "card" }, h("h2", null, "Geprüfte amtliche Quellen für einen späteren Import"),
      country.candidates.length ? h("ul", null, country.candidates.map(c => h("li", null, h("a", { href: c.url, rel: "noopener" }, c.title), " – ", c.note))) : h("p", null, "Noch keine Quelle erfasst.")));
    return out;
  }

  // ------------------------------------------------------------------ Regierungen
  async function viewGovernments() {
    const g = await load("data/de/governments.json");
    const running = x => (x.last === g.last_year ? " (laufend)" : "");
    const rows = g.governments.slice().reverse().map(x => h("tr", null,
      h("td", null, x.head, h("div", { class: "muted" }, x.parties)),
      h("td", { class: "num" }, "ab " + dateDe(x.from)),
      x.n ? h("td", { class: "r" }, money(x.cost),
        x.cost_low !== x.cost_high ? h("div", { class: "muted" }, `${money(x.cost_low)} – ${money(x.cost_high)}`) : null,
        h("div", { class: "muted" }, `${x.first}–${x.last}${running(x)} · zugeteilt ${money(x.allotted)}`)) : h("td", { class: "r" }, chip("none", "keine Einzelemissionen")),
      x.model_mid !== undefined ? h("td", { class: "r" }, `${money(x.model_low)} – ${money(x.model_high)}`,
        h("div", { class: "muted" }, `Mitte ${money(x.model_mid)} · ${x.model_first}–${x.model_last}`)) : h("td", { class: "r" }, x.n ? "–" : chip("none"))));
    app.replaceChildren(h("h1", null, "Eingegangene Zinslast je Bundesregierung"),
      h("p", null, "Summe der Finanzierungskosten bis Fälligkeit der Kredite, die in der Amtszeit einer Bundesregierung aufgenommen wurden (Deutschland, Bund). ",
        "Enthalten sind nur die Kosten der ursprünglichen Kredite, nicht deren spätere Anschlussfinanzierung."),
      h("p", { class: "note" }, g.note),
      h("section", { class: "card" }, h("div", { class: "table-scroll" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "Regierung"), h("th", null, "Beginn"),
          h("th", { class: "r" }, "erfasste Emissionen, aus Einzeldaten berechnet (ab 1999)"), h("th", { class: "r" }, "modelliert, Größenordnung (1960–1998)"))),
        h("tbody", null, rows)))),
      h("p", { class: "muted" }, "Die beiden Spalten sind nicht gleichwertig: Die berechneten Werte stammen aus jeder einzelnen Emission; die modellierten Spannen aus monatlichen Bundesbank-Aggregaten mit Laufzeitannahmen, nur für Anleihen, zugeordnet nach dem Monat der Begebung. ",
        "Beträge vor 1999 von D-Mark in Euro umgerechnet, nicht inflationsbereinigt – Summen verschiedener Jahrzehnte sind deshalb nur eingeschränkt vergleichbar. ",
        "1949–1959: keine ausreichenden Daten (keine Emissionsrendite). Kosten negativer Renditen (2015–2021) sind negativ."));
  }

  // ------------------------------------------------------------------ Quellen
  async function viewSources() {
    const [src, de] = await Promise.all([load("data/sources.json"), load("data/de/summary.json")]);
    const kv = (k, val) => [h("dt", null, k), h("dd", null, val)];
    const list = h("ol", { class: "source-list" }, src.sources.map(x => h("li", null,
      h("strong", null, x.title), " ", chip(x.kind === "amtlich" ? "official" : "intl", x.kind === "amtlich" ? "amtlich" : "international"),
      h("div", { class: "muted" }, x.publisher),
      h("p", null, x.used_for),
      h("dl", { class: "kv" },
        kv("Seite", h("a", { href: x.landing, rel: "noopener" }, x.landing)),
        kv("Datei", h("a", { href: x.download, rel: "noopener" }, x.download)),
        x.retrieval ? kv("Abgerufen", x.retrieval.retrieved.replace("T", " ").replace("+00:00", " UTC")) : null,
        x.retrieval ? kv("SHA-256", x.retrieval.sha256) : null,
        x.retrieval ? kv("Kopie im Repository", "data/raw/" + x.retrieval.file) : null))));
    const periods = (await load("data/de/years/1990.json")).context;
    app.replaceChildren(h("div", { class: "doc" },
      h("h1", null, "Quellen"),
      h("p", null, "Alle Rohdateien liegen unverändert im Repository (data/raw/) und sind über Abrufzeit und SHA-256 eindeutig bestimmt. ",
        "Die aufbereiteten Einzelemissionen mit allen Rechenergebnissen gibt es als ", h("a", { href: "data/de/de_emissionen.csv", download: "" }, "CSV-Datei"), "."),
      list,
      h("h2", null, "Deutschland: Abgrenzung, Währung, Gebietsstand"),
      h("p", null, de.scope),
      h("p", { class: "muted" }, `Beispiel 1990: ${periods.territory}. ${periods.state}`),
      h("p", null, "Die Angaben je Jahr erscheinen in der Jahresansicht im Kasten über den Kennzahlen."),
      h("h2", null, "Inflationsindexierte Bundeswertpapiere – amtliche Stammdaten"),
      h("div", { class: "table-scroll" }, h("table", null, h("thead", null, h("tr", null, ["ISIN", "Kupon", "Zinsen ab", "1. Kupon", "Fälligkeit"].map(x => h("th", null, x)))),
        h("tbody", null, Object.entries(src.ilb_meta).map(([k, m]) => h("tr", null, h("td", null, k), h("td", null, m["Kupon"] || "–"), h("td", null, m["Zinsen ab"] || "–"), h("td", null, m["1. Kupon"] || "–"), h("td", null, m["Fälligkeit"] || "–")))))),
      h("h2", null, "Geprüft, aber noch nicht importiert"),
      h("ul", null, src.candidates.map(c => h("li", null, h("strong", null, c.country + ": "), h("a", { href: c.url, rel: "noopener" }, c.title), " – ", c.note))),
      h("h2", null, "Warum Schuldenstand und Zinssummen nicht reichen"),
      h("p", null, "Ein Schuldenstand sagt nicht, zu welchem Kurs, mit welchem Kupon und bis wann die Kredite eines Jahres laufen. Die jährliche Zinssumme vermischt alle Jahrgänge. Beide Reihen werden deshalb nur als Vergleichs- und Kontextzahl gezeigt – mit sichtbarem Status."),
      h("p", { class: "muted" }, "Datenstand der Website: " + dateDe(src.built) + ". Letzte Emission im Datensatz: " + dateDe(de.last_auction) + ".")));
  }

  // ------------------------------------------------------------------ Methode (Markdown)
  function md(text) {
    const esc = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const inline = t => esc(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>").replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>').replace(/\\\*/g, "*");
    const lines = text.split("\n");
    let html = "", i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (/^```/.test(l)) { let j = i + 1, buf = []; while (j < lines.length && !/^```/.test(lines[j])) buf.push(lines[j++]); html += "<pre><code>" + esc(buf.join("\n")) + "</code></pre>"; i = j + 1; continue; }
      const hm = l.match(/^(#{1,3})\s+(.*)/); if (hm) { html += `<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>`; i++; continue; }
      if (/^---\s*$/.test(l)) { html += "<hr>"; i++; continue; }
      if (/^\s*\|/.test(l)) {
        const rows = []; while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
        const cells = r => r.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
        const body = rows.filter((r, k) => k !== 1 || !/^[\s|:-]+$/.test(r));
        html += '<div class="table-scroll"><table><thead><tr>' + cells(body[0]).map(c => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>" +
          body.slice(1).map(r => "<tr>" + cells(r).map(c => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table></div>";
        continue;
      }
      if (/^\s*(-|\d+\.)\s+/.test(l)) {
        const ordered = /^\s*\d+\./.test(l); const items = [];
        while (i < lines.length && (/^\s*(-|\d+\.)\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
          if (/^\s*(-|\d+\.)\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*(-|\d+\.)\s+/, "")); else items[items.length - 1] += " " + lines[i].trim();
          i++;
        }
        html += (ordered ? "<ol>" : "<ul>") + items.map(x => `<li>${inline(x)}</li>`).join("") + (ordered ? "</ol>" : "</ul>");
        continue;
      }
      if (!l.trim()) { i++; continue; }
      const buf = []; while (i < lines.length && lines[i].trim() && !/^(#|```|\s*\||\s*(-|\d+\.)\s|---)/.test(lines[i])) buf.push(lines[i++]);
      html += "<p>" + inline(buf.join(" ")).replace(/\\ /g, "<br>") + "</p>";
    }
    return html;
  }

  async function viewMethod() {
    const r = await fetch("METHODE.md", { cache: "no-cache" });
    const text = await r.text();
    const div = h("div", { class: "doc" });
    div.innerHTML = md(text); // eigener, im Repository versionierter Text; HTML wird vorher maskiert
    app.replaceChildren(div);
  }

  // ------------------------------------------------------------------ Prüfung
  async function viewVerification() {
    const v = await load("data/de/verification.json");
    const bt = (await load("data/de/summary.json")).model_backtest;
    const btBox = h("div", { class: "chart" });
    const yRows = Object.entries(v.yields).map(([k, x]) => h("tr", null, h("td", null, k), h("td", { class: "r" }, String(x.n)),
      h("td", { class: "r" }, nf1.format(x.share * 100) + " %"), h("td", { class: "r" }, nf3.format(x.median_abs_diff)), h("td", { class: "r" }, nf3.format(x.max_abs_diff))));
    const cov = Object.entries(v.coverage);
    const box = h("div", { class: "chart" });
    app.replaceChildren(h("div", { class: "doc" },
      h("h1", null, "Prüfung der Zahlungsströme gegen die Emissionsdaten"),
      h("p", null, `Automatisch erzeugt mit python -m pipeline.verify am ${dateDe(v.checked)}.`),
      h("h2", null, "1. Rendite-Nachrechnung"),
      h("p", null, "Aus Kurs, Kupon, Valuta, Stückzinsen und Kuponkalender wird für jede Emission die Rendite nachgerechnet und mit der veröffentlichten Durchschnittsrendite verglichen. Stimmen Kalender und Zahlungsströme, liegt die Abweichung innerhalb der Rundung der Veröffentlichung (±0,005 %-Punkte; Bubills: Geldmarktrendite act/360)."),
      h("div", { class: "table-scroll" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Gruppe"), h("th", { class: "r" }, "Emissionen"), h("th", { class: "r" }, "innerhalb Rundung"), h("th", { class: "r" }, "Median |Δ| %-Pkt."), h("th", { class: "r" }, "Max |Δ| %-Pkt."))), h("tbody", null, yRows))),
      v.yield_outliers.length ? h("details", { class: "table-view" }, h("summary", null, `Größte Abweichungen (${v.yield_outliers.length})`),
        h("div", { class: "table-scroll" }, h("table", null, h("thead", null, h("tr", null, ["Datum", "ISIN", "Art", "veröffentlicht", "nachgerechnet", "Δ"].map(x => h("th", null, x)))),
          h("tbody", null, v.yield_outliers.map(o => h("tr", null, h("td", null, dateDe(o.date)), h("td", null, o.isin), h("td", null, o.instrument + " / " + o.method), h("td", { class: "r" }, pct(o.yield_pub)), h("td", { class: "r" }, pct(o.yield_calc)), h("td", { class: "r" }, nf2.format(o.diff)))))))) : null,
      h("p", { class: "muted" }, "Restabweichungen von 0,01 %-Punkten entstehen durch Rundung (nachgerechnete Rendite auf zwei Stellen gerundet) oder eine abweichende tatsächliche Valuta."),
      h("h2", null, "2. Kostenidentität"),
      h("p", null, `${v.identity.n} Emissionen geprüft: Summe der Kostenkomponenten = Auszahlungen − Emissionserlös = Summe über Zahlungsjahre. Abweichungen: ${v.identity.failures}.`),
      h("h2", null, "3. Volumenabgleich mit dem amtlichen Umlauf"),
      h("p", null, `Für Wertpapiere, deren gesamte Emission in der Historie liegt, stimmt das kumulierte Emissionsvolumen an ${v.volumes.match} von ${v.volumes.n} Stichtagen (${nf1.format(v.volumes.share * 100)} %) auf ±1 Mio. € mit dem Umlauf laut Einzelaufstellung überein. Die Abweichungen betreffen Papiere der Jahre 1999–2002, die zusätzlich außerhalb der Auktionen (z. B. im Daueremissionsverfahren oder vor der ersten Auktion) begeben wurden.`),
      h("details", { class: "table-view" }, h("summary", null, "Größte Abweichungen"), h("div", { class: "table-scroll" }, h("table", null,
        h("thead", null, h("tr", null, ["ISIN", "Stichtag", "Emissionen kumuliert", "Umlauf", "Differenz"].map(x => h("th", null, x)))),
        h("tbody", null, v.volumes.largest_differences.map(d => h("tr", null, h("td", null, d.isin), h("td", null, dateDe(d.date)), h("td", { class: "r" }, money(d.emissions_cum)), h("td", { class: "r" }, money(d.outstanding)), h("td", { class: "r" }, money(d.diff)))))))),
      h("h2", null, "4. Konsistenz je Zeile"),
      h("p", null, `Emissionsvolumen = Zuteilung + Marktpflegequote: ${v.row_volumes.n - v.row_volumes.inconsistent} von ${v.row_volumes.n} Zeilen stimmen. Die übrigen (vor allem 1999–2002) weisen eine Zuteilung aus, die vom geplanten Volumen abweicht; berechnet wird stets mit der Zuteilung.`),
      h("h2", null, "5. Abdeckung der amtlichen Bruttokreditaufnahme"),
      h("p", null, "Anteil der zugeteilten Emissionen an der Bruttokreditaufnahme laut Schuldenbericht. Der Rest: Verkäufe aus dem Eigenbestand, nicht auktionierte Instrumente, Geldmarktkredite."),
      box,
      tableView("Als Tabelle anzeigen", [{ t: "Jahr" }, { t: "zugeteilt", r: 1 }, { t: "amtl. Bruttokreditaufnahme", r: 1 }, { t: "Anteil", r: 1 }],
        cov.map(([y, x]) => [y + (x.complete_year ? "" : " (unvollständig)"), money(x.allotted), money(x.gross_official), nf0.format(x.share * 100) + " %"])),
      h("h2", null, "6. Rückrechnung des Modells für die Jahre vor 1999"),
      h("p", null, "Für 1960–1998 gibt es keine Einzelemissionen. Die Zinslast wird dort aus Bundesbank-Aggregaten modelliert (Brutto-Absatz × Emissionsrendite × Laufzeitannahme). ",
        "Um die Güte zu prüfen, wird dasselbe Modell auf die Jahre ab 1999 angewendet und mit den exakt aus Einzelemissionen berechneten Werten verglichen."),
      bt.normal_years ? h("p", null, h("strong", null, `${bt.normal_years[0]}–${bt.normal_years[1]}: exakter Wert in ${bt.normal_in_band} von ${bt.normal_n} Jahren innerhalb der Modellspanne.`),
        " Der Mittelwert des Modells liegt meist darüber (u. a., weil die Bundesbank-Summen ab 2000 auch Geldmarktpapiere enthalten). Bei Renditen nahe null oder negativ (ab 2015) ist das Modell unbrauchbar; vor 1999 lagen die Renditen zwischen etwa 4 und 10 %.") : null,
      h("div", { class: "legend" }, h("span", null, h("span", { class: "key", style: "background:var(--series-1)" }), "exakt aus Einzelemissionen"),
        h("span", null, h("span", { class: "key dot", style: "background:var(--series-2)" }), "Modell Mitte; Linie = Modellspanne")),
      btBox,
      tableView("Als Tabelle anzeigen", [{ t: "Jahr" }, { t: "exakt berechnet", r: 1 }, { t: "Modell tief", r: 1 }, { t: "Modell Mitte", r: 1 }, { t: "Modell hoch", r: 1 }, { t: "in Spanne" }],
        bt.rows.map(r => [String(r.year), money(r.exact), money(r.low), money(r.mid), money(r.high), r.in_band ? "ja" : "nein"]))));
    queueMicrotask(() => cleanups.push(barChart(btBox, {
      cats: bt.rows.map(r => r.year), stacks: [{ color: "var(--series-1)", values: bt.rows.map(r => r.exact) }],
      whisker: { lo: bt.rows.map(r => r.low), hi: bt.rows.map(r => r.high) }, dots: { values: bt.rows.map(r => r.mid), color: "var(--series-2)" }, height: 220, xEvery: 5,
      tooltip: i => { const r = bt.rows[i]; return { head: String(r.year), rows: [{ color: "var(--series-1)", value: money(r.exact), label: "exakt berechnet" }, { color: "var(--series-2)", value: money(r.mid), label: `Modell Mitte (Spanne ${money(r.low)} – ${money(r.high)})` }] }; },
    })));
    const complete = cov.filter(([, x]) => x.complete_year);
    queueMicrotask(() => cleanups.push(barChart(box, {
      cats: complete.map(([y]) => y), stacks: [{ color: "var(--series-1)", values: complete.map(([, x]) => x.share * 100) }], height: 200,
      yFormat: t => nf0.format(t) + " %", xEvery: 5,
      tooltip: i => ({ head: complete[i][0], rows: [{ color: "var(--series-1)", value: nf0.format(complete[i][1].share * 100) + " %", label: "Abdeckung" }] }),
    })));
  }

  // ------------------------------------------------------------------ Start
  document.getElementById("themeToggle").addEventListener("click", () => {
    const root = document.documentElement;
    const cur = root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) { /* Speicher gesperrt */ }
    route();
  });
  route();
})();
