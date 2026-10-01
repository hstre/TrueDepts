/* Zinslast-Jahrgänge – Frontend ohne Build-Schritt und ohne externe Bibliotheken.
 * Liest die von pipeline/build.py erzeugten JSON-Dateien aus data/.
 * Zweisprachig: Oberflächentexte als L("deutsch", "english"); Datentexte über i18n.js.
 */
(function () {
  "use strict";

  // ------------------------------------------------------------------ Sprache
  let LANG = "de";
  try {
    const stored = localStorage.getItem("lang");
    LANG = stored || ((navigator.language || "de").toLowerCase().startsWith("de") ? "de" : "en");
  } catch (e) { /* Speicher gesperrt */ }
  const EN = () => LANG === "en";
  const L = (de, en) => (LANG === "en" ? en : de);
  const I18N = window.I18N_DATA || { exact: {}, rules: [], countries: {}, instruments: {}, methods: {} };
  /** Datentext übersetzen (Datendateien sind deutsch). */
  function tr(s) {
    if (!EN() || s === null || s === undefined) return s;
    if (I18N.exact[s] !== undefined) return I18N.exact[s];
    for (const [re, fn] of I18N.rules) { const m = String(s).match(re); if (m) return fn(m); }
    return s;
  }
  const countryName = c => (EN() && I18N.countries[c.code]) || c.name;

  // ------------------------------------------------------------------ Hilfen
  let nf0, nf1, nf2, nf3, dtf;
  function setLocale() {
    const loc = EN() ? "en-GB" : "de-DE";
    nf1 = new Intl.NumberFormat(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    nf2 = new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    nf3 = new Intl.NumberFormat(loc, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    nf0 = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
    dtf = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    document.documentElement.lang = LANG;
  }
  setLocale();
  const CUR_SYMBOL = { EUR: "€", USD: "US-$", GBP: "£", JPY: "¥" };
  const CUR_SYMBOL_EN = { EUR: "€", USD: "US$", GBP: "£", JPY: "¥" };
  let CUR = "EUR"; // Währung der gerade angezeigten Länderansicht

  function cmeta(code) {
    const M = {
      DE: {
        govLabel: L("Bundesregierung", "federal government"), govTitle: L("Bundesregierung", "German federal government"),
        govPlural: L("Bundesregierung(en) im Jahr", "Federal government(s) in the year"),
        scopeShort: L("Deutschland, Bund (Zentralstaat)", "Germany, federal level (central government)"),
        sourceRow: L("Emissionshistorie der Finanzagentur, Tabellenzeile", "Finance Agency issuance history, row"),
        paidLegend: L("bis 1994 Weltbank, ab 1995 amtlich (Schuldenbericht)", "World Bank until 1994, official from 1995 (debt report)"),
        dataFrom: 1999,
      },
      US: {
        govLabel: L("US-Regierung", "US administration"), govTitle: L("US-Regierung", "US administration"),
        govPlural: L("Präsidentschaft(en) im Jahr", "Administration(s) in the year"),
        scopeShort: L("USA, Zentralregierung (Treasury)", "USA, central government (Treasury)"),
        sourceRow: L("FiscalData Treasury Securities Auctions, Datensatz", "FiscalData Treasury Securities Auctions, record"),
        paidLegend: L("bis 2010 Weltbank, ab 2011 amtlich (FiscalData, periodengerecht)", "World Bank until 2010, official from 2011 (FiscalData, accrual basis)"),
        dataFrom: 1979,
      },
      GB: {
        govLabel: L("britische Regierung", "UK government"), govTitle: L("Britische Regierung", "UK government"),
        govPlural: L("Regierung(en) im Jahr", "Government(s) in the year"),
        scopeShort: L("Vereinigtes Königreich, Zentralregierung (HM Treasury)", "United Kingdom, central government (HM Treasury)"),
        sourceRow: L("DMO-Datenbericht, Zeile", "DMO data report, row"),
        paidLegend: L("Weltbank (Zentralstaat)", "World Bank (central government)"),
        dataFrom: 1998,
      },
    };
    return M[code];
  }

  function money(v, cur) {
    if (v === null || v === undefined || Number.isNaN(v)) return "–";
    const c = cur || CUR;
    if (EN()) {
      const sym = CUR_SYMBOL_EN[c];
      const [num, unit] = Math.abs(v) >= 1e6 ? [nf2.format(v / 1e6), "tn"] : Math.abs(v) >= 1000 ? [nf1.format(v / 1000), "bn"] : [nf1.format(v), "m"];
      return sym ? `${num.startsWith("-") ? "−" + sym + num.slice(1) : sym + num} ${unit}` : `${num} ${unit} ${c}`;
    }
    const s = CUR_SYMBOL[c] || c;
    if (Math.abs(v) >= 1e6) return nf2.format(v / 1e6) + " Bio. " + s;
    if (Math.abs(v) >= 1000) return nf1.format(v / 1000) + " Mrd. " + s;
    return nf1.format(v) + " Mio. " + s;
  }
  function moneyShort(v) {
    if (v === 0) return "0";
    const [bn, mn, tn] = EN() ? [" bn", " m", " tn"] : [" Mrd.", " Mio.", " Bio."];
    if (Math.abs(v) >= 1e6) return nf1.format(v / 1e6) + tn;
    if (Math.abs(v) >= 1000) return nf1.format(v / 1000) + bn;
    if (Math.abs(v) >= 100) return nf0.format(v) + mn;
    return nf1.format(v) + mn;
  }
  function pct(v, digits) {
    if (v === null || v === undefined) return "–";
    return (digits === 3 ? nf3 : nf2).format(v) + (EN() ? "%" : " %");
  }
  const pctNum = (v, f) => (f || nf2).format(v) + (EN() ? "%" : " %");
  function dateDe(iso) {
    if (!iso) return "–";
    const [y, m, d] = iso.split("-");
    if (EN()) return dtf.format(new Date(Date.UTC(+y, +m - 1, +d)));
    return d + "." + m + "." + y;
  }
  const yrs = n => nf1.format(n) + L(" J.", " yrs");

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

  const STATUS_DEF = {
    calc: { ico: "●", de: "aus einzelnen Emissionen berechnet", en: "calculated from individual issues" },
    mixed: { ico: "●", de: "berechnet, teils Projektion", en: "calculated, partly projection" },
    model: { ico: "◆", de: "modelliert", en: "modelled" },
    proj: { ico: "◌", de: "Projektion", en: "projection" },
    official: { ico: "▲", de: "amtliche Statistik", en: "official statistics" },
    intl: { ico: "○", de: "internationale Datenbank", en: "international database" },
    none: { ico: "–", de: "keine ausreichenden Daten", en: "insufficient data" },
  };
  const statusLabel = k => { const st = STATUS_DEF[k] || STATUS_DEF.none; return L(st.de, st.en); };
  function chip(status, text) {
    const st = STATUS_DEF[status] || STATUS_DEF.none;
    return h("span", { class: "chip " + status, title: statusLabel(status) }, h("span", { class: "ico", "aria-hidden": "true" }, st.ico), text || statusLabel(status));
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
      const g = s("g", { class: "grid" });
      for (const t of ticks) {
        g.append(s("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t) }));
        svg.append(s("text", { x: m.l - 6, y: Y(t) + 4, "text-anchor": "end" }, opts.yFormat ? opts.yFormat(t) : moneyShort(t)));
      }
      svg.insertBefore(g, svg.firstChild.nextSibling);
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
  const asTable = () => L("Als Tabelle anzeigen", "Show as table");

  // ------------------------------------------------------------------ Zustand & Routing
  const app = document.getElementById("app");
  let cleanups = [];
  const state = { country: "DE", year: null };

  function setNav(key) {
    document.querySelectorAll("nav.main a").forEach(a => a.toggleAttribute("aria-current", a.dataset.nav === key));
    document.querySelectorAll("nav.main a[aria-current]").forEach(a => a.setAttribute("aria-current", "page"));
  }

  /** Statische Texte in index.html (Navigation, Fußzeile) umschalten. */
  function applyStaticTexts() {
    document.querySelectorAll("[data-de]").forEach(el => { el.textContent = EN() ? el.dataset.en : el.dataset.de; });
    document.querySelectorAll("[data-html-de]").forEach(el => { el.innerHTML = EN() ? el.dataset.htmlEn : el.dataset.htmlDe; });
    const lt = document.getElementById("langToggle");
    if (lt) {
      lt.textContent = EN() ? "Deutsch" : "English";
      lt.setAttribute("lang", EN() ? "de" : "en");
      lt.setAttribute("aria-label", EN() ? "Auf Deutsch umschalten" : "Switch to English");
    }
    const tt = document.getElementById("themeToggle");
    if (tt) {
      tt.textContent = L("Hell/Dunkel", "Light/Dark");
      tt.setAttribute("aria-label", L("Farbschema wechseln", "Toggle colour scheme"));
    }
    document.querySelector('meta[name="description"]')?.setAttribute("content", L(
      "Welche Zinslast wurde in einem Jahr für die Zukunft eingegangen? Finanzierungskosten staatlicher Kreditjahrgänge bis zur Fälligkeit, berechnet aus einzelnen Emissionen.",
      "What interest burden was committed for the future in a given year? Financing costs of government borrowing vintages until maturity, calculated from individual issues."));
  }

  async function route() {
    cleanups.forEach(f => f()); cleanups = [];
    hideTip();
    applyStaticTexts();
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    try {
      if (parts[0] === "quellen") { setNav("quellen"); await viewSources(); }
      else if (parts[0] === "worum-geht-es") { setNav("einfach"); await viewExplainer(); }
      else if (parts[0] === "impressum") { setNav("impressum"); await viewImprint(); }
      else if (parts[0] === "methode") { setNav("methode"); await viewMethod(); }
      else if (parts[0] === "pruefung") { setNav("pruefung"); await viewVerification(); }
      else if (parts[0] === "regierungen") { setNav("regierungen"); await viewGovernments((parts[1] || "").toUpperCase()); }
      else if (parts[0] === "vergleich") { setNav("vergleich"); await viewCompare(parseInt(parts[1], 10)); }
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
      app.replaceChildren(h("div", { class: "card" }, h("h2", null, L("Daten konnten nicht geladen werden", "Data could not be loaded")),
        h("p", null, String(err)), h("p", { class: "muted" }, L("Die Seite muss über einen Webserver geöffnet werden (z. B. python -m http.server im Ordner site/).",
          "The page must be served by a web server (e.g. python -m http.server in the site/ folder)."))));
    }
  }
  window.addEventListener("hashchange", route);

  // ------------------------------------------------------------------ Jahresansicht
  function controls(countries) {
    const cSel = h("select", { id: "country", onchange: e => { location.hash = `#/${e.target.value}/${state.year}`; } },
      countries.countries.slice().sort((a, b) => countryName(a).localeCompare(countryName(b), LANG)).map(c => h("option", { value: c.code, selected: c.code === state.country ? true : null },
        countryName(c) + (c.vintage_data ? "" : L(" – nur Vergleichsdaten", " – comparison data only")))));
    const years = [];
    for (let y = countries.last_year; y >= countries.first_year; y--) years.push(y);
    const ySel = h("select", { id: "year", onchange: e => { location.hash = `#/${state.country}/${e.target.value}`; } },
      years.map(y => h("option", { value: y, selected: y === state.year ? true : null }, String(y))));
    const prev = h("button", { class: "btn", type: "button", "aria-label": L("Vorjahr", "Previous year"), disabled: state.year <= countries.first_year ? true : null,
      onclick: () => { location.hash = `#/${state.country}/${state.year - 1}`; } }, "‹");
    const next = h("button", { class: "btn", type: "button", "aria-label": L("Folgejahr", "Next year"), disabled: state.year >= countries.last_year ? true : null,
      onclick: () => { location.hash = `#/${state.country}/${state.year + 1}`; } }, "›");
    return h("div", { class: "controls" }, h("a", { href: "#/worum-geht-es", class: "intro-link" }, L("Neu hier? Worum geht es auf dieser Seite →", "New here? What this site is about →")),
      h("label", { for: "country" }, L("Land", "Country"), cSel),
      h("label", { for: "year" }, L("Jahr", "Year"), h("span", { class: "year-step" }, prev, ySel, next)));
  }

  /** Hinweis auf der Startseite: Pilotprojekt, Bitte um Daten zu fehlenden Ländern. */
  function pilotNote(countries) {
    const ART = { US: L("die USA", "the United States"), GB: L("das Vereinigte Königreich", "the United Kingdom") };
    const withData = countries.countries.filter(c => c.vintage_data).map(c => ART[c.code] || countryName(c));
    const list = withData.length > 1 ? withData.slice(0, -1).join(", ") + L(" und ", " and ") + withData[withData.length - 1] : withData.join("");
    const missing = countries.countries.length - withData.length;
    return h("aside", { class: "pilot", "aria-label": L("Hinweis zum Projektstand", "Project status") },
      h("strong", null, L("Pilotprojekt. ", "Pilot project. ")),
      L(`Aus einzelnen Emissionen berechnet sind bisher ${list}; für die übrigen ${missing} G20-Länder zeigt die Seite nur Vergleichszahlen. `,
        `So far, ${list} are calculated from individual issues; for the other ${missing} G20 countries the site shows comparison figures only. `),
      L("Über Daten zu den fehlenden Ländern würde ich mich sehr freuen – am besten einzelne Emissionen oder Auktionen mit Datum, Volumen, Kurs, Kupon und Fälligkeit, oder Hinweise auf amtliche Quellen: ",
        "I would be very glad to receive data on the missing countries – ideally individual issues or auctions with date, volume, price, coupon and maturity, or pointers to official sources: "),
      h("a", { href: "mailto:Rentschler@lbsmail.de?subject=Zinslast-Jahrg%C3%A4nge%3A%20Daten" }, "Rentschler@lbsmail.de"), ".");
  }

  async function viewYear(countries) {
    const country = countries.countries.find(c => c.code === state.country);
    const intl = await load("data/intl.json");
    CUR = country.currency;
    const nodes = [h("h1", null, L(`Kreditjahrgang ${state.year} · ${countryName(country)}`, `Borrowing vintage ${state.year} · ${countryName(country)}`)), pilotNote(countries), controls(countries)];
    if (country.vintage_data) {
      const cc = country.code.toLowerCase();
      const [summary, yearData, sources] = await Promise.all([
        load(`data/${cc}/summary.json`), load(`data/${cc}/years/${state.year}.json`), load("data/sources.json")]);
      nodes.push(...renderDE(summary, yearData, intl[country.code], sources, country));
    } else {
      nodes.push(...renderIntlOnly(country, intl[country.code], countries));
    }
    app.replaceChildren(...nodes);
    document.title = `${state.year} · ${countryName(country)} · ${L("Zinslast-Jahrgänge", "Interest Vintages")}`;
  }

  function overviewCard(summary, intlDE, country) {
    const meta = cmeta(country.code);
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
      h("h2", { id: "ov-h" }, L("Überblick: eingegangene Zinslast je Jahrgang", "Overview: interest burden committed per vintage")),
      h("div", { class: "note compare" },
        h("strong", null, L("Säulen und Punkte messen Verschiedenes und sind in der Höhe nicht direkt vergleichbar. ", "Bars and dots measure different things; their heights are not directly comparable. ")),
        h("br"), L("Säule: Summe aller Zinskosten, die die in diesem Jahr erfassten Kredite über ihre ", "Bar: total interest cost that the borrowing covered in this year causes over its "),
        h("em", null, L("gesamte Laufzeit", "entire term")),
        L(" auslösen – verteilt auf viele künftige Jahre, nur für die erfassten Emissionen.", " – spread over many future years, covered issues only."),
        h("br"), L("Punkt: Zinsen, die in ", "Dot: interest paid in "), h("em", null, L("genau diesem einen Jahr", "that single year")), L(" auf ", " on "), h("em", null, L("alle", "all")),
        L(" alten und neuen Schulden gezahlt wurden.", " old and new debt.")),
      h("p", { class: "chart-sub" }, meta.scopeShort + ". ",
        country.code === "DE" ? L("Beträge vor 1999 von D-Mark in Euro umgerechnet (1,95583), nicht inflationsbereinigt. ", "Amounts before 1999 converted from Deutsche Mark to euro (1.95583), not adjusted for inflation. ")
          : L("Nominal, nicht inflationsbereinigt. ", "Nominal, not adjusted for inflation. "), L("Jahr anklicken zum Wechseln.", "Click a year to switch.")),
      h("div", { class: "legend" },
        h("span", null, h("span", { class: "key", style: "background:var(--series-1)" }), L(`Säule: Zinslast über die gesamte Laufzeit – erfasste Emissionen, berechnet (ab ${meta.dataFrom})`, `Bar: interest burden over the full term – covered issues, calculated (from ${meta.dataFrom})`)),
        country.code === "DE" ? h("span", null, h("span", { class: "key", style: "background-image:repeating-linear-gradient(135deg,var(--series-1) 0 2px,transparent 2px 5px);border:1px solid var(--series-1)" }), L("Säule: dasselbe, modelliert aus Bundesbank-Aggregaten, Linie = Spanne (1960–1998)", "Bar: the same, modelled from Bundesbank aggregates, line = range (1960–1998)")) : null,
        h("span", null, h("span", { class: "key dot", style: "background:var(--paid)" }), L(`Punkt: in einem einzelnen Jahr gezahlte Zinsen auf alle Schulden (${meta.paidLegend})`, `Dot: interest paid in a single year on all debt (${meta.paidLegend})`)),
        h("span", null, h("span", { class: "key hatch" }), L("keine Einzelemissionsdaten", "no individual issue data"))),
      box);
    queueMicrotask(() => cleanups.push(barChart(box, {
      cats, stacks: [{ key: "cost", color: "var(--series-1)", values: cost }, { key: "model", pattern: "model", values: model }],
      whisker: { lo: wLo, hi: wHi }, dots: { values: paid, color: "var(--paid)" },
      gaps, gapLabel: L("keine ausreichenden Daten", "insufficient data"), selected: sel, height: 200, focusable: false,
      xEvery: 10, ariaLabel: L("Überblick der Jahrgangskosten und gezahlten Zinsen 1945 bis heute", "Overview of vintage costs and interest paid since 1945"),
      tooltip: i => {
        const y = years[i];
        const rows = [];
        const md = modelOf(y);
        rows.push(y.totals ? { color: "var(--series-1)", value: money(y.totals.cost), label: L("Zinslast der erfassten Emissionen, gesamte Laufzeit", "interest burden of covered issues, full term") + (y.totals.partial ? L(" (Jahr läuft)", " (year in progress)") : "") }
          : md ? { color: "var(--series-1)", value: `${money(md.low)} – ${money(md.high)}`, label: L("Zinslast, gesamte Laufzeit – modelliert (Größenordnung)", "interest burden, full term – modelled (order of magnitude)") }
          : { value: L("keine ausreichenden Daten", "insufficient data"), label: L("Jahrgangskosten", "vintage cost") });
        if (paid[i] !== null) rows.push({ color: "var(--paid)", value: money(paid[i]), label: y.paid && y.paid.cash !== undefined ? L("in diesem Jahr gezahlt, alle Schulden (amtlich)", "paid in this year, all debt (official)") : L("in diesem Jahr gezahlt, alle Schulden (Weltbank)", "paid in this year, all debt (World Bank)") });
        return { head: String(y.year), rows, note: md ? L("Modell: Brutto-Absatz × Emissionsrendite × angenommene Laufzeit", "Model: gross sales × issue yield × assumed term") : null };
      },
      onClick: i => { location.hash = `#/${country.code}/${cats[i]}`; },
    })));
    return card;
  }

  function contextCard(v, summary, country) {
    const meta = cmeta(country.code);
    const ctx = v.context || {};
    const govs = v.governments.length ? v.governments.map(g => `${g.head} (${tr(g.parties)}, ${L("ab", "from")} ${dateDe(g.from)})`).join("; ") : "–";
    return h("section", { class: "card", "aria-label": L("Rahmen des Jahres", "Context of the year") }, h("dl", { class: "context" },
      h("div", null, h("dt", null, L("Gebietsstand", "Territory")), h("dd", null, tr(ctx.territory) || "–")),
      h("div", null, h("dt", null, L("Währung", "Currency")), h("dd", null, tr(ctx.currency) || "–")),
      h("div", null, h("dt", null, L("Staatsdefinition", "Definition of the state")), h("dd", null, tr(ctx.state) || "–")),
      h("div", null, h("dt", null, meta.govPlural), h("dd", null, govs))),
      h("details", { class: "table-view" }, h("summary", null, L("Abgrenzung der Daten (Zentralstaat, nicht Gesamtstaat)", "Scope of the data (central government, not general government)")),
        h("p", { class: "muted" }, EN() && summary.scope_en ? summary.scope_en : summary.scope)));
  }

  function tile(label, statusChip, value, subs) {
    return h("div", { class: "tile" }, h("div", { class: "label" }, label), statusChip, value, ...subs.filter(Boolean));
  }

  /** Hinweis, welcher Anteil der amtlichen Bruttokreditaufnahme durch die erfassten Emissionen abgedeckt ist. */
  function coverageLine(v) {
    const t = v.totals;
    if (!t) return null;
    if (v.coverage !== null && v.coverage !== undefined && v.split) {
      return h("div", { class: "coverage" }, L("Teilsumme: Die erfassten Emissionen decken ", "Partial total: the covered issues account for "), h("strong", null, pctNum(v.coverage * 100, nf0)),
        L(` der amtlichen Bruttokreditaufnahme ab (${money(t.allotted)} von ${money(v.split.gross)}). `, ` of official gross borrowing (${money(t.allotted)} of ${money(v.split.gross)}). `),
        L("Nicht enthalten: Verkäufe aus dem Eigenbestand, nicht auktionierte Instrumente, Geldmarktkredite.", "Not included: sales from own holdings, instruments not sold at auction, money-market loans."));
    }
    if (v.scope_note) return h("div", { class: "coverage" }, L("Abgrenzung: ", "Scope: "), tr(v.scope_note));
    return h("div", { class: "coverage" }, L("Teilsumme: nur die erfassten Emissionen. Der Abdeckungsgrad gegenüber der amtlichen Bruttokreditaufnahme steht erst nach Jahresabschluss fest.",
      "Partial total: covered issues only. Coverage relative to official gross borrowing is only known after the year has ended."));
  }

  function renderDE(summary, v, intlDE, sources, country) {
    const out = [overviewCard(summary, intlDE, country), contextCard(v, summary, country)];
    const t = v.totals;
    const partial = v.year === summary.last_year;
    const tiles = [];
    const T = (num, de, en, rest) => h("span", null, h("b", null, `${num} · ${L(de, en)}`), rest ? L(rest[0], rest[1]) : null);
    // 1. Neu aufgenommen
    if (t) {
      tiles.push(tile(T(1, "Neu aufgenommen", "New borrowing", [" – erfasste Emissionen: zugeteilte Kredite und Anleihen (Nennwert)", " – covered issues: allotted loans and bonds (nominal)"]), chip("calc"),
        h("div", { class: "value" }, money(t.allotted)),
        [h("div", { class: "sub" }, L("Emissionserlös ", "Issue proceeds "), h("strong", null, money(t.proceeds)), L(` aus ${v.issues.filter(i => i.cost !== undefined).length} Emissionen`, ` from ${v.issues.filter(i => i.cost !== undefined).length} issues`)),
          t.retained ? h("div", { class: "sub" }, L("Zusätzlich ", "In addition "), h("strong", null, money(t.retained)), L(" in den Eigenbestand genommen (nicht verkauft; ", " taken into own holdings (not sold; "), chip("none", L("Verkaufserlös unbekannt", "sale proceeds unknown")), ")") : null,
          partial ? h("div", { class: "sub" }, L(`Laufendes Jahr: Emissionen bis ${dateDe(v.data_through)}.`, `Current year: issues up to ${dateDe(v.data_through)}.`)) : null]));
    } else if (v.aggregate && v.aggregate.gross) {
      const ag = v.aggregate;
      tiles.push(tile(T(1, "Neu aufgenommen", "New borrowing", [" – Anleihen des Bundes, Brutto-Absatz (Nennwert)", " – federal bonds, gross sales (nominal)"]), chip("official", L("amtlich: Bundesbank", "official: Bundesbank")),
        h("div", { class: "value" }, money(ag.gross)),
        [ag.gross_dm ? h("div", { class: "sub" }, "= ", h("strong", null, EN() ? `DM ${nf1.format(ag.gross_dm / 1000)} bn` : nf1.format(ag.gross_dm / 1000) + " Mrd. DM"), L(" (umgerechnet 1,95583 DM/€)", " (converted at DM 1.95583/€)")) : null,
          ag.gross_le4 !== null ? h("div", { class: "sub" }, L("Laufzeit bis 4 Jahre ", "Maturity up to 4 years "), h("strong", null, money(ag.gross_le4)), L(" · über 4 Jahre ", " · over 4 years "), h("strong", null, money(ag.gross_gt4))) : null,
          h("div", { class: "sub" }, L("Nur Anleihen (Inhaberschuldverschreibungen); Kredite, Schuldscheindarlehen und Geldmarkttitel fehlen. Keine Einzelemissionen ", "Bonds only (bearer bonds); loans, promissory notes and money-market paper are missing. No individual issues "), chip("none", L("Kurs, Kupon, Fälligkeit je Emission unbekannt", "price, coupon, maturity per issue unknown")))]));
    } else {
      tiles.push(tile(T(1, "Neu aufgenommen", "New borrowing"), chip("none"), h("div", { class: "value nodata" }, L("Keine Einzelemissionsdaten", "No individual issue data")),
        [v.split ? h("div", { class: "sub" }, L("Amtliche Bruttokreditaufnahme: ", "Official gross borrowing: "), h("strong", null, money(v.split.gross)), " ", chip("official")) : null]));
    }
    // 2. Anschlussfinanzierung / Netto
    const t2 = ["Anschlussfinanzierung / zusätzliche Nettoverschuldung", "Refinancing / additional net borrowing"];
    if (v.split) {
      const sp = v.split;
      const refShare = sp.gross ? Math.min(1, sp.refinancing / sp.gross) : 0;
      tiles.push(tile(T(2, t2[0], t2[1]), chip("model", L("modelliert: Saldenrechnung", "modelled: balance method")),
        h("div", { class: "value" }, money(sp.net), h("span", { class: "sub", style: "font-size:.85rem;font-weight:400" }, L(" netto", " net"))),
        [h("div", { class: "split-bar", role: "img", "aria-label": L(`Anteil Anschlussfinanzierung ${nf0.format(refShare * 100)} Prozent`, `Refinancing share ${nf0.format(refShare * 100)} percent`) },
          h("span", { style: `width:${refShare * 100}%;background:var(--series-1-soft)` }), h("span", { style: `width:${(1 - refShare) * 100}%;background:var(--series-1)` })),
          h("div", { class: "sub" }, L("Tilgungen (Anschlussfinanzierung) ", "Redemptions (refinancing) "), h("strong", null, money(sp.refinancing)), L(" · Brutto ", " · gross "), h("strong", null, money(sp.gross)), " ",
            sp.source === "auctions" ? chip("calc", L("aus Auktionsdaten summiert", "summed from auction data")) : chip("official", sp.source === "bundesbank" ? L("amtlich: Bundesbank", "official: Bundesbank") : null)),
          sp.source === "auctions" ? h("div", { class: "sub" }, L("Brutto = alle Auktionen des Jahres (kurzlaufende Bills werden mehrfach im Jahr erneuert); Tilgungen = Fälligkeiten erfasster Emissionen", "Gross = all auctions of the year (short-term bills are rolled over several times a year); redemptions = maturities of covered issues"),
            sp.scope && sp.scope.includes("unvollständig") ? L(" – unvollständig, da vor 1979 begebene Papiere fehlen.", " – incomplete, as securities issued before 1979 are missing.") : ".") : null,
          sp.cost_net !== undefined ? h("div", { class: "sub" }, L("Zinslast rechnerisch auf zusätzliche Verschuldung: ", "Interest burden attributable to additional borrowing: "), h("strong", null, money(sp.cost_net)), L(` (${nf0.format(sp.share_net * 100)} % proportional)`, ` (${nf0.format(sp.share_net * 100)}% proportional)`)) : null,
          sp.cost_net_model ? h("div", { class: "sub" }, L("Zinslast rechnerisch auf zusätzliche Verschuldung (modelliert): ", "Interest burden attributable to additional borrowing (modelled): "), h("strong", null, `${money(sp.cost_net_model[0])} – ${money(sp.cost_net_model[2])}`)) : null,
          sp.source === "bundesbank" ? h("div", { class: "sub" }, L("Nur Anleihen des Bundes; netto = Veränderung des Umlaufs laut Bundesbank, Tilgung = Brutto − netto. Umstellungen der Statistik (z. B. 1957, 1990) können Sprünge verursachen.",
            "Federal bonds only; net = change in amount outstanding according to the Bundesbank, redemption = gross − net. Statistical changes (e.g. 1957, 1990) can cause jumps.")) : null,
          !sp.complete_year ? h("div", { class: "sub" }, sp.source === "auctions"
            ? L(`Laufendes Jahr: Emissionen und Tilgungen jeweils mit Valuta bzw. Fälligkeit bis ${dateDe(sp.as_of)}.`, `Current year: issues and redemptions each with settlement or maturity up to ${dateDe(sp.as_of)}.`)
            : L(`Amtliche Werte bis ${dateDe(sp.as_of)}.`, `Official values up to ${dateDe(sp.as_of)}.`)) : null]));
    } else {
      tiles.push(tile(T(2, t2[0], t2[1]), chip("none"), h("div", { class: "value nodata" }, L("Keine amtlichen Brutto-/Tilgungsdaten", "No official gross/redemption data")), []));
    }
    // 3. Kosten bis Fälligkeit
    if (t) {
      const band = t.cost_low !== t.cost_high;
      tiles.push(tile(T(3, "Finanzierungskosten der erfassten Emissionen", "Financing cost of covered issues", [" – bis Fälligkeit", " – until maturity"]), chip(band ? "mixed" : "calc"),
        h("div", { class: "value" }, money(t.cost)),
        [coverageLine(v), band ? h("div", { class: "sub" }, L("davon fest ", "of which fixed "), h("strong", null, money(t.cost_fixed)), L("; gesamt ", "; total "), h("strong", null, money(t.cost_low) + L(" bis ", " to ") + money(t.cost_high)), " ",
          chip("proj", v.country === "US" ? L("Projektion Inflation/Geldmarktzins", "projection inflation/money-market rate") : L("Projektion 0–4 % Inflation", "projection 0–4% inflation"))) : null,
          h("div", { class: "sub" }, L("Ø Rendite ", "Avg. yield "), h("strong", null, pct(t.avg_yield)), L(" · Ø Laufzeit ", " · avg. term "), h("strong", null, yrs(t.avg_term))),
          t.cost < 0 ? h("div", { class: "sub" }, L("Negativ: Anleihen wurden über dem Rückzahlungsbetrag verkauft (negative Renditen).", "Negative: bonds were sold above their redemption amount (negative yields).")) : null]));
    } else if (v.aggregate && v.aggregate.model) {
      const m = v.aggregate.model, terms = summary.model_terms;
      const bt = summary.model_backtest;
      tiles.push(tile(T(3, "Finanzierungskosten der erfassten Anleihen", "Financing cost of covered bonds", [" – Größenordnung bis Fälligkeit", " – order of magnitude until maturity"]), chip("model", L("modelliert, grobe Spanne", "modelled, rough range")),
        h("div", { class: "value" }, `${money(m.low)} – ${money(m.high)}`),
        [h("div", { class: "sub" }, L("Mittelwert ", "Midpoint "), h("strong", null, money(m.mid)), L(" · Ø Emissionsrendite ", " · avg. issue yield "), h("strong", null, pct(v.aggregate.em_yield))),
          h("div", { class: "sub" }, L(`Modell: Brutto-Absatz × Emissionsrendite des Monats × Laufzeit (bis 4 J.: ${nf1.format(terms.short[0])}/${nf1.format(terms.short[1])}/${nf1.format(terms.short[2])} J.; über 4 J.: ${nf0.format(terms.long[0])}/${nf0.format(terms.long[1])}/${nf0.format(terms.long[2])} J.), Ausgabe zu pari.`,
            `Model: gross sales × issue yield of the month × term (up to 4 yrs: ${nf1.format(terms.short[0])}/${nf1.format(terms.short[1])}/${nf1.format(terms.short[2])} yrs; over 4 yrs: ${nf0.format(terms.long[0])}/${nf0.format(terms.long[1])}/${nf0.format(terms.long[2])} yrs), issued at par.`)),
          m.volume_fallback_yield ? h("div", { class: "sub" }, L(`Für ${money(m.volume_fallback_yield)} ohne veröffentlichte Emissionsrendite wurde die Umlaufsrendite des Monats verwendet.`, `For ${money(m.volume_fallback_yield)} without a published issue yield, the outstanding yield of the month was used.`)) : null,
          bt && bt.normal_years ? h("div", { class: "sub" }, L(`Rückrechnung ${bt.normal_years[0]}–${bt.normal_years[1]}: exakter Wert in ${bt.normal_in_band} von ${bt.normal_n} Jahren in der Spanne, Mittelwert meist zu hoch. `,
            `Back-test ${bt.normal_years[0]}–${bt.normal_years[1]}: exact value within the range in ${bt.normal_in_band} of ${bt.normal_n} years, midpoint usually too high. `), h("a", { href: "#/pruefung" }, L("Details", "Details"))) : null]));
    } else {
      tiles.push(tile(T(3, "Finanzierungskosten bis Fälligkeit", "Financing cost until maturity"), chip("none"), h("div", { class: "value nodata" }, L("Keine ausreichenden Daten", "Insufficient data")),
        [h("div", { class: "sub" }, v.aggregate && v.aggregate.gross ? L("Für diese Jahre veröffentlicht die Bundesbank keine Emissionsrendite; ohne Zinssatz lässt sich keine Zinslast abschätzen.", "The Bundesbank publishes no issue yield for these years; without an interest rate no interest burden can be estimated.")
          : L("Aus Schuldenstand oder Zinssumme lässt sich ein Jahrgang nicht rekonstruieren.", "A vintage cannot be reconstructed from debt levels or interest totals."))]));
    }
    // 5. Tatsächlich gezahlt
    const p = v.paid;
    const t5 = ["Im Jahr tatsächlich gezahlte Zinsen", "Interest actually paid in the year"];
    if (p.status === "official") {
      tiles.push(tile(T(5, t5[0], t5[1], [" – auf alte und neue Schulden (Vergleichszahl)", " – on old and new debt (comparison figure)"]), chip("official"),
        h("div", { class: "value" }, money(p.cash)),
        [p.labels ? h("div", { class: "sub" }, tr(p.labels.cash)) : null,
          p.total !== p.cash ? h("div", { class: "sub" }, p.labels ? tr(p.labels.total) + ": " : L("inkl. periodengerechter Verteilung von Agio/Disagio: ", "incl. accrual-based distribution of premium/discount: "), h("strong", null, money(p.total))) : null,
          !p.complete_year ? h("div", { class: "sub" }, L("Stand ", "As of "), /^\d{4}-\d{2}-\d{2}$/.test(p.as_of) ? dateDe(p.as_of) : String(p.as_of).replace("Monate", L("Monate", "months")), L(" (Jahr unvollständig).", " (year incomplete).")) : null,
          p.wb !== undefined ? h("div", { class: "sub" }, L("Weltbank, Zentralstaat: ", "World Bank, central government: "), h("strong", null, money(p.wb)), " ", chip("intl")) : null]));
    } else if (p.status === "intl") {
      tiles.push(tile(T(5, t5[0], t5[1]), chip("intl"),
        h("div", { class: "value" }, money(p.wb)), [h("div", { class: "sub" }, L("Weltbank, Zinsausgaben Zentralstaat (abweichende Abgrenzung", "World Bank, central government interest payments (different definition"),
          country.code === "DE" ? L("; historische DM-Werte in Euro umgerechnet laut Weltbank", "; historical DM values converted to euro by the World Bank") : "", ").")]));
    } else {
      tiles.push(tile(T(5, t5[0], t5[1]), chip("none"), h("div", { class: "value nodata" }, L("Keine ausreichenden Daten", "Insufficient data")), []));
    }
    out.push(h("div", { class: "tiles" }, tiles));
    out.push(h("div", { class: "tiles" }, comparisonTile(v), generalGovTile(v, country)));

    out.push(mainChartCard(v, summary));
    if (t) {
      out.push(refinancingCard(v));
      out.push(breakdownCard(v, sources, country));
      out.push(issuesCard(v, sources, country));
    }
    out.push(gapsCard(v, summary, country));
    return out;
  }

  function comparisonTile(v) {
    const t = v.totals;
    const head = rest => h("span", null, h("b", null, L("Vergleichsmaßstab", "Comparison measure")), rest);
    if (!t || t.cost_per_100 === undefined) {
      return tile(head(L(" – Kosten je 100 Einheiten Emissionserlös", " – cost per 100 units of issue proceeds")), chip("none"),
        h("div", { class: "value nodata" }, L("Keine ausreichenden Daten", "Insufficient data")), [h("div", { class: "sub" }, L("Nur mit Einzelemissionen berechenbar.", "Can only be calculated from individual issues."))]);
    }
    return tile(head(L(" – je 100 Einheiten Emissionserlös", " – per 100 units of issue proceeds")), chip(t.cost_low !== t.cost_high ? "mixed" : "calc"),
      h("div", { class: "value" }, nf2.format(t.cost_per_100), h("span", { class: "sub", style: "font-size:.85rem;font-weight:400" }, L(" über die gesamte Laufzeit", " over the full term"))),
      [h("div", { class: "sub" }, L("Ø Laufzeit ", "Avg. term "), h("strong", null, nf1.format(t.avg_term) + L(" Jahre", " years")), L(" → je Laufzeitjahr ", " → per year of term "), h("strong", null, nf2.format(t.cost_per_100_year))),
        h("div", { class: "sub" }, L("Ø Emissionsrendite ", "Avg. issue yield "), h("strong", null, pct(t.avg_yield))),
        h("div", { class: "sub" }, L("Lange Kredite können insgesamt mehr Zinsen kosten und trotzdem günstigere jährliche Konditionen haben – deshalb Laufzeit und Jahreswert immer mitlesen.",
          "Long-term borrowing can cost more interest in total and still have cheaper annual terms – so always read the term and the annual value alongside."))]);
  }

  function generalGovTile(v, country) {
    const g = v.general_gov || {};
    const w = g.weo;
    const subs = [];
    const ofGdp = L(" % des BIP", "% of GDP");
    if (w && w.debt !== undefined) subs.push(h("div", { class: "sub" }, L("Bruttoschulden des Gesamtstaats: ", "Gross general government debt: "), h("strong", null, nf1.format(w.debt) + ofGdp)));
    if (g.vgr_interest !== undefined && g.vgr_interest !== null) subs.push(h("div", { class: "sub" }, L("Zinsausgaben des Staates (VGR, amtlich): ", "General government interest expenditure (national accounts, official): "), h("strong", null, money(g.vgr_interest)), " ", chip("official")));
    subs.push(h("div", { class: "sub" }, L("Gesamtstaat = Zentralstaat + Länder/Bundesstaaten + Gemeinden (+ Sozialversicherung). Die Jahrgangsberechnung oben betrifft nur den Zentralstaat.",
      "General government = central government + states + municipalities (+ social security). The vintage calculation above covers central government only.")));
    if (w && w.projection) subs.push(h("div", { class: "sub" }, chip("proj", L("IWF-Projektion", "IMF projection")), L(" Wert liegt nach dem letzten Ist-Jahr des IWF.", " Value lies after the IMF's last actual year.")));
    return tile(h("span", null, h("b", null, L("Gesamtstaat", "General government")), L(" – Nettozinsen im Jahr (IWF, abgeleitet)", " – net interest in the year (IMF, derived)")), chip("intl"),
      w && w.net_interest !== undefined ? h("div", { class: "value" }, nf2.format(w.net_interest) + ofGdp) : h("div", { class: "value nodata" }, L("Keine Daten", "No data")),
      subs);
  }

  function mainChartCard(v, summary) {
    const card = h("section", { class: "card chart-card", "aria-labelledby": "main-h" },
      h("h2", { id: "main-h" }, L("Welche Zinslast wurde in diesem Jahr für die Zukunft eingegangen?", "What interest burden was committed for the future in this year?")));
    const t = v.totals;
    if (!t && v.aggregate && v.aggregate.model) {
      const m = v.aggregate.model;
      card.append(h("p", null, chip("model"), L(` Grobe Größenordnung für ${v.year}: `, ` Rough order of magnitude for ${v.year}: `), h("strong", null, `${money(m.low)} ${L("bis", "to")} ${money(m.high)}`), L(` (Mittelwert ${money(m.mid)}).`, ` (midpoint ${money(m.mid)}).`)),
        h("p", { class: "muted" }, L("Eine Aufteilung nach Zahlungsjahren ist nicht möglich, weil Kupon, Ausgabekurs und Fälligkeit der einzelnen Anleihen in den verwendeten Quellen fehlen. ",
          "A breakdown by payment year is not possible because coupon, issue price and maturity of individual bonds are missing from the sources used. "),
          L("Die Spanne entsteht aus Annahmen über die Laufzeit; sie ist keine Berechnung aus Einzelemissionen und nicht mit den Werten ab 1999 gleichwertig.",
            "The range results from assumptions about the term; it is not calculated from individual issues and is not equivalent to the values from 1999.")));
      return card;
    }
    if (!t) {
      card.append(h("p", null, chip("none"), L(` Für ${v.year} liegen keine Einzelemissionen vor. Die Zinslast dieses Jahrgangs wird deshalb nicht berechnet und nicht geschätzt.`,
        ` There are no individual issues for ${v.year}. The interest burden of this vintage is therefore neither calculated nor estimated.`)),
        h("p", { class: "muted" }, v.country === "US" ? L("Die Auktionsdaten von FiscalData beginnen 1979; ältere Einzelemissionen sind nicht maschinenlesbar erschlossen.", "FiscalData auction data begin in 1979; older individual issues are not available in machine-readable form.") :
          v.country === "GB" ? L("Die Auktionsdaten des UK Debt Management Office beginnen 1998 (Gründung der DMO); ältere Gilt-Emissionen der Bank of England sind nicht maschinenlesbar erschlossen.", "The UK Debt Management Office auction data begin in 1998 (when the DMO was set up); older gilt issues by the Bank of England are not available in machine-readable form.") :
          v.year < 1949 ? L("In diesem Jahr gab es noch keinen Bund als Schuldner.", "In this year there was no federal government as a debtor yet.") :
          v.aggregate && v.aggregate.gross ? L("Die Bundesbank weist für dieses Jahr zwar das begebene Volumen aus, aber keine Emissionsrendite (erst ab 1960).", "The Bundesbank reports the volume issued for this year, but no issue yield (only from 1960).") :
          L("Die Emissionshistorie der Finanzagentur beginnt 1999. Für frühere Jahre müssten Emissionsdaten der Bundesschuldenverwaltung bzw. Bundesbank erschlossen werden.",
            "The Finance Agency's issuance history begins in 1999. Earlier years would require issuance data from the former Federal Debt Administration or the Bundesbank.")));
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
      L(`Die ${v.year} erfassten Emissionen kosten bis zur letzten Fälligkeit ${last} insgesamt `, `The issues covered in ${v.year} cost a total of `), h("strong", null, money(t.cost)),
      EN() ? ` until the last maturity in ${last}` : "",
      band ? L(` (Spanne ${money(t.cost_low)} bis ${money(t.cost_high)}, davon fest ${money(t.cost_fixed)})`, ` (range ${money(t.cost_low)} to ${money(t.cost_high)}, of which fixed ${money(t.cost_fixed)})`) : "",
      L(". Dargestellt ist die Zinslast je Zahlungsjahr – ohne Tilgung, ohne spätere Anschlussfinanzierung.", ". Shown is the interest burden per payment year – excluding redemption and later refinancing."),
      v.coverage !== null && v.coverage !== undefined ? L(` Das ist eine Teilsumme: Die erfassten Emissionen decken ${nf0.format(v.coverage * 100)} % der amtlichen Bruttokreditaufnahme ab.`, ` This is a partial total: the covered issues account for ${nf0.format(v.coverage * 100)}% of official gross borrowing.`)
        : v.country === "GB" ? L(" Das ist eine Untergrenze: Syndizierungen vor April 2025 und Treasury Bills fehlen.", " This is a lower bound: syndications before April 2025 and Treasury bills are missing.")
        : v.scope_note ? L(" Erfasst sind alle marktfähigen Wertpapiere aus Auktionen, nicht die gesamte Staatsverschuldung.", " Covers all marketable securities from auctions, not total government debt.")
        : L(" Das ist eine Teilsumme der Kreditaufnahme dieses Jahres.", " This is a partial total of this year's borrowing.")));
    card.append(h("div", { class: "legend" },
      h("span", null, h("span", { class: "key", style: "background:var(--series-1)" }), L("feststehend (Kupons, Disagio/Agio, erhaltene Stückzinsen) ", "fixed (coupons, discount/premium, accrued interest received) "), chip("calc")),
      hasProj ? h("span", null, h("span", { class: "key proj" }), v.country === "US"
        ? L("abhängig von Inflation (TIPS) bzw. Geldmarktzins (FRN) – mittleres Szenario; Linie = Spanne der Szenarien ", "depends on inflation (TIPS) or money-market rate (FRN) – mid scenario; line = range of scenarios ")
        : v.country === "GB" ? L("abhängig vom RPI (Index-linked Gilts) – mittleres Szenario 2 %; Linie = Spanne 0 % bis 4 % ", "depends on RPI (index-linked gilts) – mid scenario 2%; line = range 0% to 4% ")
        : L("abhängig von Inflation – mittleres Szenario 2 %; Linie = Spanne 0 % bis 4 % ", "depends on inflation – mid scenario 2%; line = range 0% to 4% "), chip("proj")) : null));
    const box = h("div", { class: "chart" });
    card.append(box);
    queueMicrotask(() => cleanups.push(barChart(box, {
      cats, stacks: [{ key: "fixed", color: "var(--series-1)", values: fixed }].concat(hasProj ? [{ key: "proj", pattern: true, values: projMid }] : []),
      whisker: hasProj ? { lo: whiskerLo, hi: whiskerHi } : null,
      ariaLabel: L(`Zinslast des Jahrgangs ${v.year} nach Zahlungsjahr`, `Interest burden of vintage ${v.year} by payment year`),
      tooltip: i => {
        const y = cats[i];
        const rows = [{ color: "var(--series-1)", value: money(fixed[i]), label: L("feststehend", "fixed") }];
        if (hasProj && whiskerLo[i] !== null) rows.push({ color: "var(--series-2)", value: money(projMid[i]), label: L(`Projektion (mittel), Spanne ${money(get(y, 1))} – ${money(get(y, 3))}`, `projection (mid), range ${money(get(y, 1))} – ${money(get(y, 3))}`) });
        return { head: L(`Zahlungsjahr ${y}`, `Payment year ${y}`), rows, note: fixed[i] < 0 ? L("Negativ: erhaltene Stückzinsen oder Agio (Verkauf über pari).", "Negative: accrued interest received or premium (sale above par).") : null };
      },
    })));
    card.append(h("p", { class: "muted", style: "font-size:.85rem;margin-top:.5rem" },
      L("Disagio/Agio erscheint im Fälligkeitsjahr, weil erst dann der volle Nennwert zurückgezahlt wird; vom Käufer gezahlte Stückzinsen mindern die Kosten im Emissionsjahr. ",
        "Discount/premium appears in the year of maturity, when the full nominal is repaid; accrued interest paid by the buyer reduces the cost in the year of issue. "),
      summary.ilb_last_official ? L(`Inflationsindexierte Zahlungen bis ${dateDe(summary.ilb_last_official)} mit amtlichen Index-Verhältniszahlen, danach Projektion.`, `Inflation-linked payments up to ${dateDe(summary.ilb_last_official)} use official index ratios, projection thereafter.`) : ""));
    card.append(tableView(asTable(), [{ t: L("Zahlungsjahr", "Payment year") }, { t: L("feststehend", "fixed"), r: 1 }, { t: L("Projektion tief", "projection low"), r: 1 }, { t: L("Projektion mittel", "projection mid"), r: 1 }, { t: L("Projektion hoch", "projection high"), r: 1 }, { t: L("Summe (mittel)", "total (mid)"), r: 1 }],
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
    const perPp = L("je 1 %-Pkt. Anschlusszins p. a.", "per 1 pp refinancing rate p.a.");
    const card = h("section", { class: "card chart-card", "aria-labelledby": "refi-h" },
      h("h2", { id: "refi-h" }, L("Getrennt davon: Risiko der Anschlussfinanzierung", "Shown separately: refinancing risk")),
      h("p", { class: "chart-sub" }, L("Bei Fälligkeit muss der Rückzahlungsbetrag neu finanziert werden, sofern er nicht aus Überschüssen getilgt wird. Die Kosten dieser Anschlussfinanzierung stehen heute nicht fest und sind ",
        "At maturity the redemption amount has to be refinanced unless it is repaid from surpluses. The cost of this refinancing is not known today and is "),
        h("strong", null, L("nicht", "not")), L(" in der Zinslast oben enthalten. ", " included in the interest burden above. "),
        L(`Jeder Prozentpunkt Zins auf die Anschlussfinanzierung kostet ${money(total * 0.01)} pro Jahr, solange die Anschlusskredite laufen.`, `Each percentage point of interest on the refinancing costs ${money(total * 0.01)} per year for as long as the refinancing runs.`)),
      h("div", { class: "legend" }, h("span", null, h("span", { class: "key", style: "background:var(--series-1-soft);border:1px solid var(--series-1)" }), L("fälliger Rückzahlungsbetrag (inflationsindexiert: mittleres Szenario)", "redemption amount due (inflation-linked: mid scenario)"))),
      box,
      tableView(asTable(), [{ t: L("Jahr", "Year") }, { t: L("fällig", "due"), r: 1 }, { t: perPp, r: 1 }],
        cats.filter((y, i) => vals[i]).map(y => [String(y), money(v.maturities[y]), money(v.maturities[y] * 0.01)])));
    queueMicrotask(() => cleanups.push(barChart(box, {
      cats, stacks: [{ key: "mat", color: "var(--series-1-soft)", values: vals }], height: 180,
      ariaLabel: L("Fällige Beträge des Jahrgangs nach Jahr", "Amounts of the vintage due by year"),
      tooltip: i => ({ head: L(`Fällig ${cats[i]}`, `Due ${cats[i]}`), rows: [{ color: "var(--series-1)", value: money(vals[i]), label: L("Rückzahlung", "redemption") }, { value: money(vals[i] * 0.01), label: perPp }] }),
    })));
    return card;
  }

  const instLabel = (sources, k) => (EN() && I18N.instruments[k]) || sources.instrument_labels[k] || k;
  const methodLabel = (sources, k) => (EN() && I18N.methods[k]) || sources.method_labels[k] || k;

  function breakdownCard(v, sources, country) {
    const meta = cmeta(country.code);
    const inst = Object.entries(v.by_instrument).sort((a, b) => b[1].allotted - a[1].allotted);
    const govRows = v.governments.filter(g => g.n);
    const costH = L("Kosten bis Fälligkeit", "Cost until maturity");
    return h("section", { class: "card", "aria-labelledby": "bd-h" },
      h("h2", { id: "bd-h" }, L("Aufschlüsselung", "Breakdown")),
      h("div", { class: "two-col" },
        h("div", null, h("h3", null, L("Nach Wertpapierart", "By type of security")), h("div", { class: "table-scroll" }, h("table", null,
          h("thead", null, h("tr", null, h("th", null, L("Art", "Type")), h("th", { class: "r" }, L("Anzahl", "Number")), h("th", { class: "r" }, L("zugeteilt", "allotted")), h("th", { class: "r" }, costH))),
          h("tbody", null, inst.map(([k, x]) => h("tr", null, h("td", null, instLabel(sources, k)), h("td", { class: "r" }, String(x.n)), h("td", { class: "r" }, money(x.allotted)),
            h("td", { class: "r" }, money(x.cost), x.cost_low !== x.cost_high ? h("div", { class: "muted" }, `${money(x.cost_low)} – ${money(x.cost_high)}`) : null))))))),
        h("div", null, h("h3", null, L(`Nach ${meta.govLabel} (Emissionstag)`, `By ${meta.govLabel} (issue date)`)), h("div", { class: "table-scroll" }, h("table", null,
          h("thead", null, h("tr", null, h("th", null, L("Regierung", "Government")), h("th", { class: "r" }, L("zugeteilt", "allotted")), h("th", { class: "r" }, costH))),
          h("tbody", null, govRows.map(g => h("tr", null, h("td", null, g.head, h("div", { class: "muted" }, tr(g.parties))), h("td", { class: "r" }, money(g.allotted)),
            h("td", { class: "r" }, money(g.cost), g.cost_low !== g.cost_high ? h("div", { class: "muted" }, `${money(g.cost_low)} – ${money(g.cost_high)}`) : null)))))),
          h("p", { class: "muted", style: "font-size:.8rem" }, L("Vereinfachte zeitliche Zuordnung nach Emissionstag; Kreditermächtigungen erteilt das Parlament. ", "Simplified temporal assignment by issue date; borrowing authority is granted by parliament. "),
            h("a", { href: `#/regierungen/${country.code}` }, L("Alle Regierungen mit Zinsniveau und übernommenen Fälligkeiten", "All governments with interest-rate level and inherited maturities"))))));
  }

  function issuesCard(v, sources, country) {
    const kinds = Array.from(new Set(v.issues.map(i => i.instrument)));
    const sel = h("select", { id: "instFilter" }, h("option", { value: "" }, L("alle Wertpapierarten", "all types")), kinds.map(k => h("option", { value: k }, instLabel(sources, k))));
    const tbody = h("tbody");
    const LIMIT = 25;
    let showAll = false;
    const more = h("button", { class: "btn", type: "button", style: "margin-top:.5rem" });
    more.addEventListener("click", () => { showAll = !showAll; fill(); });
    const fill = () => {
      const f = sel.value;
      const rows = [];
      const list = v.issues.filter(i => !f || i.instrument === f);
      more.textContent = showAll ? L("Weniger anzeigen", "Show fewer") : L(`Alle ${list.length} Emissionen anzeigen`, `Show all ${list.length} issues`);
      more.hidden = list.length <= LIMIT;
      for (const i of (showAll ? list : list.slice(0, LIMIT))) {
        const name = `${i.instrument}${i.coupon ? " " + pctNum(i.coupon * 100) : ""} ${dateDe(i.maturity)}`;
        const st = i.status === "proj" ? chip("proj", L("berechnet + Projektion", "calculated + projection")) : chip(i.status, i.status === "calc" ? L("berechnet", "calculated") : null);
        const tr_ = h("tr", { class: "issue", tabindex: 0, "aria-expanded": "false" },
          h("td", { class: "num" }, dateDe(i.date)),
          h("td", null, name, h("div", { class: "muted" }, i.isin + " · " + methodLabel(sources, i.method))),
          h("td", { class: "r" }, i.cost !== undefined ? money(i.allotted) : "–", i.retained ? h("div", { class: "muted" }, "+" + money(i.retained) + L(" EB", " OH")) : null),
          h("td", { class: "r hide-sm" }, i.price !== null ? (EN() ? String(i.price) : String(i.price).replace(".", ",")) : "–"),
          h("td", { class: "r hide-sm" }, i.yield_pub !== null ? pct(i.yield_pub, i.kind === "zero" ? 3 : 2) : "–"),
          h("td", { class: "r" }, i.cost !== undefined ? money(i.cost) : "–", i.cost !== undefined && i.cost_low !== i.cost_high ? h("div", { class: "muted" }, `${money(i.cost_low)} – ${money(i.cost_high)}`) : null),
          h("td", null, st));
        let detail = null;
        const toggle = () => {
          if (detail) { detail.remove(); detail = null; tr_.setAttribute("aria-expanded", "false"); return; }
          detail = h("tr", { class: "detail" }, h("td", { colspan: 7 }, issueDetail(i, sources, country)));
          tr_.after(detail); tr_.setAttribute("aria-expanded", "true");
        };
        tr_.addEventListener("click", toggle);
        tr_.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
        rows.push(tr_);
      }
      tbody.replaceChildren(...rows);
    };
    sel.addEventListener("change", () => { showAll = false; fill(); });
    fill();
    return h("section", { class: "card", "aria-labelledby": "is-h" },
      h("h2", { id: "is-h" }, L(`Einzelemissionen ${v.year} (${v.issues.length})`, `Individual issues ${v.year} (${v.issues.length})`)),
      h("p", { class: "muted" }, L("Zeile antippen für Zahlungsstrom, Annahmen und Quellzeile. EB = Marktpflegequote/Eigenbestand, nicht an Investoren verkauft.",
        "Tap a row for cash flows, assumptions and source row. OH = retention/own holdings, not sold to investors.")),
      h("div", { class: "controls" }, h("label", { for: "instFilter" }, L("Filter", "Filter"), sel)),
      h("div", { class: "table-scroll" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, L("Auktion", "Auction")), h("th", null, L("Wertpapier", "Security")), h("th", { class: "r" }, L("zugeteilt", "allotted")), h("th", { class: "r hide-sm" }, L("Kurs", "Price")),
          h("th", { class: "r hide-sm" }, L("Rendite", "Yield")), h("th", { class: "r" }, L("Kosten bis Fälligkeit", "Cost until maturity")), h("th", null, L("Status", "Status")))), tbody)), more);
  }

  function issueDetail(i, sources, country) {
    const kv = (k, val) => [h("dt", null, k), h("dd", null, val)];
    const cashKind = { "Emissionserlös": L("Emissionserlös", "Issue proceeds"), "Kupon": L("Kupon", "Coupon"), "Rückzahlung": L("Rückzahlung", "Redemption") };
    const parts = [h("dl", { class: "kv" },
      kv(L("Wertpapier", "Security"), country.code === "GB" ? `${i.isin} (${instLabel(sources, i.instrument)})` : `${instLabel(sources, i.instrument)}, ${country.code === "US" ? "CUSIP" : "ISIN"} ${i.isin}`),
      i.maturity_source ? kv(L("Fälligkeit", "Maturity"), `${dateDe(i.maturity)} (${tr(i.maturity_source)})`) : null,
      kv(L("Verfahren", "Method"), `${methodLabel(sources, i.method)}${i.new ? L(" (Neuemission)", " (new issue)") : L(" (Aufstockung)", " (reopening)")}`),
      kv(L("Auktion / Valuta", "Auction / settlement"), `${dateDe(i.date)} / ${dateDe(i.settle)} (${i.settle_rule === "T+2" ? L("Annahme T+2 Geschäftstage", "assumption T+2 business days") : tr(i.settle_rule)})`),
      kv(L("Emissionsvolumen", "Issue volume"), L(`${money(i.issue_volume)}, davon zugeteilt ${money(i.allotted)}, Eigenbestand ${money(i.retained)}`, `${money(i.issue_volume)}, of which allotted ${money(i.allotted)}, own holdings ${money(i.retained)}`)),
      i.kind !== "zero" ? kv(L("Zinslaufbeginn", "Interest start"), `${dateDe(i.interest_start)} (${tr(i.interest_start_source) || "–"})`) : null,
      i.first_coupon_basis ? kv(L("Erster Kupon", "First coupon"), `${tr(i.first_coupon)} – ${tr(i.first_coupon_basis)}`) : null,
      kv(L("Kurs / Rendite", "Price / yield"), L(`${i.price ?? "–"} % / veröffentlicht ${i.yield_pub ?? "–"} %, nachgerechnet ${i.yield_calc ?? "–"} %`, `${i.price ?? "–"}% / published ${i.yield_pub ?? "–"}%, recalculated ${i.yield_calc ?? "–"}%`)),
      i.proceeds !== undefined ? kv(L("Emissionserlös", "Issue proceeds"), L(`${money(i.proceeds)} (Kurswert ${money(i.clean_proceeds)} + Stückzinsen ${money(i.accrued)})`, `${money(i.proceeds)} (price value ${money(i.clean_proceeds)} + accrued interest ${money(i.accrued)})`)) : null,
      i.cost !== undefined ? kv(L("Kosten bis Fälligkeit", "Cost until maturity"), `${money(i.cost)}${i.cost_low !== i.cost_high ? L(` (Spanne ${money(i.cost_low)} – ${money(i.cost_high)}, fest ${money(i.cost_fixed)})`, ` (range ${money(i.cost_low)} – ${money(i.cost_high)}, fixed ${money(i.cost_fixed)})`) : ""}`) : null,
      kv(country.code === "DE" ? L("Regierung / BMF", "Government / finance minister") : country.code === "GB" ? L("Regierung / Schatzkanzler", "Government / Chancellor") : L("Regierung", "Government"), i.fm ? `${i.gov || "–"} / ${i.fm}` : (i.gov || "–")),
      i.price_source ? kv(L("Kursquelle", "Price source"), tr(i.price_source)) : null,
      i.soma ? kv(L("davon Federal Reserve (SOMA)", "of which Federal Reserve (SOMA)"), money(i.soma)) : null,
      i.paof ? kv("PAOF", L(`${money(i.paof)} Nominal zusätzlich zum Auktionskurs (Post-Auction Option Facility)`, `${money(i.paof)} nominal in addition at the auction price (Post-Auction Option Facility)`)) : null,
      i.cash_pub !== undefined && i.cash_pub !== null ? kv(L("Cash-Erlös laut DMO", "Cash raised according to DMO"), L(`${money(i.cash_pub)} (ohne Stückzinsen)`, `${money(i.cash_pub)} (excluding accrued interest)`)) : null,
      kv(L("Quelle", "Source"), `${cmeta(country.code).sourceRow} ${i.row}`))];
    if (i.note) parts.push(h("p", { class: "note" }, tr(i.note)));
    if (i.cash) {
      parts.push(h("h3", { style: "margin-top:.5rem" }, L("Zahlungsstrom aus Sicht des Staates", "Cash flows from the government's perspective")),
        h("div", { class: "flowlist num" }, i.cash.map(([d, k, val]) => h("div", null, `${dateDe(d)} · ${cashKind[k] || k}: `, h("strong", null, money(val))))));
      const comp = i.components || {};
      const names = { coupon: L("Kupons", "coupons"), accrued: L("erhaltene Stückzinsen", "accrued interest received"), discount: L("Disagio (+) / Agio (−)", "discount (+) / premium (−)"), indexation: L("Inflationsausgleich Kapital (mittel)", "inflation uplift on capital (mid)") };
      parts.push(h("p", { class: "muted" }, L("Kostenkomponenten: ", "Cost components: "), Object.entries(comp).map(([k, val]) => `${names[k] || k} ${money(val)}`).join(" · ")));
    }
    return h("div", null, parts);
  }

  function gapsCard(v, summary, country) {
    const items = [];
    if (v.totals) {
      if (v.totals.retained) items.push(L(`Eigenbestand/Marktpflegequote: ${money(v.totals.retained)} Nennwert wurden bei Emission nicht verkauft. Spätere Verkäufe im Sekundärmarkt und deren Kurse sind in den Emissionsdaten nicht enthalten – keine ausreichenden Daten.`,
        `Own holdings/retention: ${money(v.totals.retained)} nominal was not sold at issuance. Later sales in the secondary market and their prices are not included in the issuance data – insufficient data.`));
      if (v.coverage !== null && v.coverage !== undefined) items.push(L(`Abdeckung: Die zugeteilten Emissionen entsprechen ${nf0.format(v.coverage * 100)} % der amtlichen Bruttokreditaufnahme. Der Rest entfällt u. a. auf Verkäufe aus dem Eigenbestand, nicht auktionierte Instrumente (z. B. Bundesschatzbriefe und Finanzierungsschätze bis 2012, Schuldscheindarlehen, Daueremissionen) und Geldmarktkredite.`,
        `Coverage: the allotted issues correspond to ${nf0.format(v.coverage * 100)}% of official gross borrowing. The rest consists of sales from own holdings, instruments not sold at auction (e.g. federal savings bonds and financing notes until 2012, promissory notes, tap issues) and money-market loans.`));
      if (country.code === "DE") items.push(L("Zins- und Währungsswaps des Bundes sind nicht berücksichtigt.", "Interest-rate and currency swaps of the federal government are not taken into account."));
      if (v.issues.some(i => i.kind === "fixed_fx")) items.push(L("US-Dollar-Anleihen: modelliert zum Euro-Gegenwert der Emissionshistorie.", "US-dollar bonds: modelled at the euro equivalent stated in the issuance history."));
      if (v.scope_note && country.code !== "GB") items.push(tr(v.scope_note));
      if (country.code === "GB") {
        items.push(L("Fälligkeitstag und Kupontermine sind aus den veröffentlichten Renditen abgeleitet, weil die DMO-Stammdaten (Gilts in Issue) nicht abrufbar waren. Die Renditen werden damit auf ±0,0005 %-Punkte getroffen; bei Gilts mit wenigen Emissionen kann der Tag um einen oder wenige Tage abweichen, die Kosten ändern sich dadurch nur geringfügig.",
          "Maturity date and coupon dates are derived from the published yields because the DMO reference data (gilts in issue) could not be retrieved. The yields are matched to ±0.0005 percentage points; for gilts with few issues the day may be off by one or a few days, which changes the cost only marginally."));
        items.push(L("Syndizierungen fehlen vor April 2025. Seit 2005 hat die DMO einen erheblichen Teil der langen und inflationsindexierten Gilts per Syndizierung begeben; 2025–26 waren es 50 von 304 Mrd. £.",
          "Syndications are missing before April 2025. Since 2005 the DMO has sold a substantial part of long and index-linked gilts by syndication; in 2025–26 it was £50 bn of £304 bn."));
        if (v.uncovered && v.uncovered.linker8) items.push(L(`${v.uncovered.linker8} Emission(en) älterer Index-linked Gilts mit 8-Monats-Verzögerung (${money(v.uncovered.linker8_nominal)} Nominal): Index-Basis nicht in den Daten, Kosten nicht berechnet – keine ausreichenden Daten.`,
          `${v.uncovered.linker8} issue(s) of older index-linked gilts with an 8-month lag (${money(v.uncovered.linker8_nominal)} nominal): index base not in the data, cost not calculated – insufficient data.`));
        if (v.issues.some(i => i.kind === "inflation_linked")) items.push(L("Index-linked Gilts: Index-Verhältniszahl aus dem RPI (ONS) mit 3 Monaten Verzögerung; ab 2030 wird der RPI methodisch an den CPIH angeglichen, was den künftigen Inflationsausgleich eher senkt. Die Szenarien 0/2/4 % decken das grob ab.",
          "Index-linked gilts: index ratio from RPI (ONS) with a 3-month lag; from 2030 RPI will be aligned methodologically with CPIH, which tends to lower future indexation. The 0/2/4% scenarios cover this roughly."));
        items.push(L("Nicht enthalten: Treasury Bills, National Savings & Investments, Kommunen und Regionalregierungen. Emissionen direkt an die DMO (Sicherheiten für die Kassensteuerung) sowie Umtausch- und Konversionsgeschäfte bringen keine Finanzierungsmittel und sind nicht gezählt.",
          "Not included: Treasury bills, National Savings & Investments, local and devolved governments. Issuance directly to the DMO (collateral for cash management) and switches/conversions raise no financing and are not counted."));
      }
      if (country.code === "US") {
        items.push(L("Kurzlaufende Bills werden mehrfach im Jahr erneuert; das zugeteilte Volumen eines Jahres ist deshalb viel größer als die Neuverschuldung.", "Short-term bills are rolled over several times a year; the volume allotted in a year is therefore much larger than new borrowing."));
        if (v.issues.some(i => i.soma)) items.push(L(`Enthalten sind Zuteilungen an die Federal Reserve (SOMA) von ${money(v.issues.reduce((a, i) => a + (i.soma || 0), 0))}: Die Notenbank ersetzt fällige Bestände; auch das ist Anschlussfinanzierung.`,
          `Includes allotments to the Federal Reserve (SOMA) of ${money(v.issues.reduce((a, i) => a + (i.soma || 0), 0))}: the central bank replaces maturing holdings; this is refinancing too.`));
        if (v.issues.some(i => i.status === "model")) items.push(L("TIPS: Index-Verhältniszahlen vor Mai 2008 durch Interpolation zwischen amtlichen Referenz-CPI-Werten der Emissionstage (modelliert).", "TIPS: index ratios before May 2008 by interpolation between official reference CPI values on issue dates (modelled)."));
        if (v.issues.some(i => i.kind === "frn")) items.push(L("FRN: Kupon aus der Rendite der 13-Wochen-Bill (aus denselben Auktionsdaten) plus festem Aufschlag; künftiger Index als Projektion (letzter Wert ±2 %-Punkte).", "FRN: coupon from the 13-week bill yield (from the same auction data) plus a fixed spread; future index as projection (last value ±2 percentage points)."));
        if (v.split && v.split.scope && v.split.scope.includes("unvollständig")) items.push(L("Tilgungen vor 2010 unvollständig: Fälligkeiten von vor 1979 begebenen Papieren fehlen in den Auktionsdaten.", "Redemptions before 2010 incomplete: maturities of securities issued before 1979 are missing from the auction data."));
      }
    } else if (v.aggregate && v.aggregate.model) {
      items.push(L("Keine Einzelemissionen: Zinslast nur als modellierte Spanne aus Bundesbank-Aggregaten (Brutto-Absatz, Emissionsrendite) mit Laufzeitannahmen; keine Aufteilung nach Zahlungsjahren.", "No individual issues: interest burden only as a modelled range from Bundesbank aggregates (gross sales, issue yield) with term assumptions; no breakdown by payment year."));
      items.push(L("Erfasst sind nur Anleihen des Bundes. Kredite, Schuldscheindarlehen, Ausgleichsforderungen und Geldmarkttitel fehlen.", "Only federal bonds are covered. Loans, promissory notes, equalisation claims and money-market paper are missing."));
      items.push(L("Beträge von D-Mark in Euro umgerechnet (1,95583 DM/€), nicht inflationsbereinigt.", "Amounts converted from Deutsche Mark to euro (DM 1.95583/€), not adjusted for inflation."));
    } else {
      items.push(L("Für dieses Jahr liegen in den geprüften Quellen keine Einzelemissionen und keine Emissionsrenditen vor; Jahrgangskosten werden weder berechnet noch geschätzt.", "For this year the sources checked contain neither individual issues nor issue yields; vintage costs are neither calculated nor estimated."));
    }
    if (!v.split && country.code === "DE") items.push(L("Amtliche Bruttokreditaufnahme und Tilgungen: Schuldenbericht ab 1995, Anleihen des Bundes laut Bundesbank ab 1948.", "Official gross borrowing and redemptions: debt report from 1995, federal bonds according to the Bundesbank from 1948."));
    if (v.paid.status === "intl") items.push(L("Gezahlte Zinsen stammen aus der Weltbank-Datenbank (Zentralstaat) und sind nicht direkt mit den amtlichen Werten späterer Jahre vergleichbar.", "Interest paid comes from the World Bank database (central government) and is not directly comparable with the official values of later years."));
    items.push(L("Gesamtstaat (IWF): Nettozinsen = Primärsaldo − Finanzierungssaldo; abgeleitete Größe, nicht mit den Jahrgangskosten des Zentralstaats vergleichbar.", "General government (IMF): net interest = primary balance − overall balance; a derived figure, not comparable with central government vintage costs."));
    return h("section", { class: "card", "aria-labelledby": "gap-h" },
      h("h2", { id: "gap-h" }, L("Datenlücken und Annahmen für ", "Data gaps and assumptions for ") + v.year),
      h("ul", { class: "gaps" }, items.map(x => h("li", null, x))),
      h("p", { class: "muted" }, L("Alle Quellen mit Abrufdatum: ", "All sources with retrieval date: "), h("a", { href: "#/quellen" }, L("Quellenansicht", "Sources")), L(" · Rechenweg mit Beispiel: ", " · Calculation with example: "), h("a", { href: "#/methode" }, L("Methode", "Methodology"))));
  }

  function renderIntlOnly(country, series, countries) {
    const years = [];
    for (let y = countries.first_year; y <= countries.last_year; y++) years.push(y);
    const wb = series.wb_interest, weo = series.weo || {}, wm = series.weo_meta || {};
    const val = wb[state.year];
    const w = weo[state.year];
    const name = countryName(country);
    const out = [];
    out.push(h("section", { class: "card" },
      h("p", null, chip("none"), L(` Für ${name} sind keine Einzelemissionen importiert. `, ` No individual issues are imported for ${name}. `),
        L("Kreditjahrgänge, Aufteilung in Anschlussfinanzierung und Nettoverschuldung sowie Finanzierungskosten bis Fälligkeit werden deshalb nicht angezeigt – auch nicht geschätzt. ",
          "Borrowing vintages, the split into refinancing and net borrowing and financing costs until maturity are therefore not shown – not even as estimates. "),
        L("Aus gesamten Zinszahlungen lässt sich die Finanzierungslast eines bestimmten Kreditjahrgangs nicht eindeutig rekonstruieren.", "The financing burden of a particular borrowing vintage cannot be reconstructed unambiguously from total interest payments.")),
      h("dl", { class: "context" },
        h("div", null, h("dt", null, L("Zentralstaat", "Central government")), h("dd", null, L(`Weltbank (Zinszahlungen, Mio. ${country.currency}, nominal)`, `World Bank (interest payments, ${country.currency} m, nominal)`))),
        h("div", null, h("dt", null, L("Gesamtstaat laut IWF", "General government according to the IMF")), h("dd", null, wm.composition || "–")),
        h("div", null, h("dt", null, L("Haushaltsjahr (IWF)", "Fiscal year (IMF)")), h("dd", null, wm.fiscal_year || "–")),
        h("div", null, h("dt", null, L("Letztes Ist-Jahr (IWF)", "Last actual year (IMF)")), h("dd", null, wm.latest_actual_label || "–")))));
    const nd = (n, de, en) => tile(h("span", null, h("b", null, n), " " + L(de, en)), chip("none"), h("div", { class: "value nodata" }, L("Keine ausreichenden Daten", "Insufficient data")), []);
    out.push(h("div", { class: "tiles" },
      nd("1 ·", "Neu aufgenommen", "New borrowing"), nd("2 ·", "Anschlussfinanzierung / Nettoverschuldung", "Refinancing / net borrowing"), nd("3 ·", "Finanzierungskosten bis Fälligkeit", "Financing cost until maturity"),
      val !== undefined
        ? tile(h("span", null, h("b", null, L("5 · Im Jahr gezahlte Zinsen", "5 · Interest paid in the year")), L(" – Zentralstaat", " – central government")), chip("intl"), h("div", { class: "value" }, money(val, country.currency)),
          [h("div", { class: "sub" }, L("Weltbank, nominal in Landeswährung (heutige Denomination).", "World Bank, nominal in local currency (current denomination)."))])
        : nd("5 ·", "Im Jahr gezahlte Zinsen – Zentralstaat", "Interest paid in the year – central government"),
      generalGovTile({ general_gov: w ? { weo: w } : null }, country)));
    const box2 = h("div", { class: "chart" });
    const ni = years.map(y => (weo[y] && weo[y].net_interest !== undefined ? weo[y].net_interest : null));
    const ofGdp = L(" % des BIP", "% of GDP");
    out.push(h("section", { class: "card chart-card" }, h("h2", null, L("Gesamtstaat: Nettozinsen in % des BIP", "General government: net interest in % of GDP")),
      h("p", { class: "chart-sub" }, L("IWF World Economic Outlook, abgeleitet als Primärsaldo − Finanzierungssaldo. In % des BIP über Länder vergleichbar. Werte nach dem letzten Ist-Jahr sind IWF-Projektionen (schraffiert).",
        "IMF World Economic Outlook, derived as primary balance − overall balance. Comparable across countries as % of GDP. Values after the last actual year are IMF projections (hatched).")),
      h("div", { class: "legend" }, h("span", null, h("span", { class: "key", style: "background:var(--series-1)" }), L("Ist-Werte", "Actual values")),
        h("span", null, h("span", { class: "key", style: "background-image:repeating-linear-gradient(135deg,var(--series-1) 0 2px,transparent 2px 5px);border:1px solid var(--series-1)" }), L("IWF-Projektion", "IMF projection"))),
      box2));
    queueMicrotask(() => cleanups.push(barChart(box2, {
      cats: years,
      stacks: [{ color: "var(--series-1)", values: years.map((y, i) => (ni[i] !== null && !weo[y].projection ? ni[i] : 0)) },
        { pattern: "model", values: years.map((y, i) => (ni[i] !== null && weo[y].projection ? ni[i] : 0)) }],
      gaps: ni.map(x => x === null), selected: years.indexOf(state.year), height: 200, xEvery: 10, focusable: false, gapLabel: L("keine Daten", "no data"),
      yFormat: t => pctNum(t, nf1),
      tooltip: i => ({ head: String(years[i]), rows: [ni[i] !== null ? { color: "var(--series-1)", value: nf2.format(ni[i]) + ofGdp, label: weo[years[i]].projection ? L("Nettozinsen Gesamtstaat (IWF-Projektion)", "general government net interest (IMF projection)") : L("Nettozinsen Gesamtstaat (IWF)", "general government net interest (IMF)") } : { value: L("keine Daten", "no data"), label: "" }] }),
      onClick: i => { location.hash = `#/${country.code}/${years[i]}`; },
    })));
    const box = h("div", { class: "chart" });
    out.push(h("section", { class: "card chart-card" }, h("h2", null, L("Zentralstaat: gezahlte Zinsen (Vergleichszahl)", "Central government: interest paid (comparison figure)")),
      h("p", { class: "chart-sub" }, L("Weltbank, Zinsausgaben des Zentralstaats in " + country.currency + ", nominal. Schraffiert: keine Daten. Nicht über Länder vergleichbar (Währung, Inflation) und keine Grundlage für Jahrgangskosten.",
        "World Bank, central government interest payments in " + country.currency + ", nominal. Hatched: no data. Not comparable across countries (currency, inflation) and no basis for vintage costs.")),
      box));
    queueMicrotask(() => cleanups.push(barChart(box, {
      cats: years, stacks: [{ color: "var(--series-1)", values: years.map(y => wb[y] || 0) }], gaps: years.map(y => wb[y] === undefined),
      selected: years.indexOf(state.year), height: 200, xEvery: 10, focusable: false, gapLabel: L("keine Daten", "no data"),
      yFormat: t => moneyShort(t),
      tooltip: i => ({ head: String(years[i]), rows: [wb[years[i]] !== undefined ? { color: "var(--series-1)", value: money(wb[years[i]], country.currency), label: L("gezahlte Zinsen Zentralstaat (Weltbank)", "central government interest paid (World Bank)") } : { value: L("keine Daten", "no data"), label: "" }] }),
      onClick: i => { location.hash = `#/${country.code}/${years[i]}`; },
    })));
    out.push(h("section", { class: "card" }, h("h2", null, L("Amtliche Quellen für Einzelemissionen", "Official sources for individual issues")),
      country.candidates.length ? h("ul", null, country.candidates.map(c => h("li", null, h("a", { href: c.url, rel: "noopener" }, c.title),
        h("div", { class: "muted" }, L("Abrufprüfung: ", "Retrieval check: ") + `${tr(c.check)}. ${tr(c.note)}`)))) : h("p", null, L("Noch keine Quelle erfasst.", "No source recorded yet."))));
    return out;
  }

  // ------------------------------------------------------------------ Vergleich
  async function viewCompare(yearArg) {
    const [countries, intl] = await Promise.all([load("data/countries.json"), load("data/intl.json")]);
    const year = Number.isFinite(yearArg) ? yearArg : countries.last_year - 1;
    const vintage = {};
    for (const c of countries.countries.filter(c => c.vintage_data)) {
      const sm = await load(`data/${c.code.toLowerCase()}/summary.json`);
      vintage[c.code] = sm.years.find(y => y.year === year);
    }
    const years = []; for (let y = countries.last_year; y >= 1950; y--) years.push(y);
    const sel = h("select", { id: "cmpYear", onchange: e => { location.hash = `#/vergleich/${e.target.value}`; } },
      years.map(y => h("option", { value: y, selected: y === year ? true : null }, String(y))));
    const list = countries.countries.slice().sort((a, b) => countryName(a).localeCompare(countryName(b), LANG));
    const rows = list.map(c => {
      const t = vintage[c.code] && vintage[c.code].totals;
      const w = intl[c.code].weo[year];
      const wb = intl[c.code].wb_interest[year];
      return h("tr", null,
        h("td", null, h("a", { href: `#/${c.code}/${year}` }, countryName(c))),
        ...(t ? [h("td", { class: "r" }, nf2.format(t.cost_per_100), h("div", { class: "muted" }, t.cost_low !== t.cost_high ? L("inkl. Projektion", "incl. projection") : L("berechnet", "calculated"))),
          h("td", { class: "r" }, yrs(t.avg_term)),
          h("td", { class: "r" }, nf2.format(t.cost_per_100_year)),
          h("td", { class: "r" }, pct(t.avg_yield))]
          : [h("td", { colspan: 4, class: "muted" }, c.vintage_data ? L("kein Jahrgang in diesem Jahr", "no vintage in this year") : L("keine Einzelemissionsdaten importiert", "no individual issue data imported"))]),
        h("td", { class: "r" }, w && w.net_interest !== undefined ? pctNum(w.net_interest) : "–", w && w.projection ? h("div", { class: "muted" }, L("Projektion", "projection")) : null),
        h("td", { class: "r" }, w && w.debt !== undefined ? pctNum(w.debt, nf1) : "–"),
        h("td", { class: "r" }, wb !== undefined ? money(wb, c.currency) : "–"));
    });
    app.replaceChildren(h("h1", null, L(`G20-Vergleich ${year}`, `G20 comparison ${year}`)),
      h("div", { class: "controls" }, h("label", { for: "cmpYear" }, L("Jahr", "Year"), sel)),
      h("p", { class: "note compare" }, h("strong", null, L("Lesehilfe. ", "How to read. ")),
        L("Die ersten vier Spalten beziehen sich auf die im Jahr erfassten Emissionen des Zentralstaats und liegen nur für Länder mit Einzelemissionsdaten vor. ",
          "The first four columns refer to the central government's issues covered in the year and are only available for countries with individual issue data. "),
        L("„Je 100 Erlös“ summiert die Kosten über die gesamte Laufzeit; lange Kredite kosten insgesamt mehr, können aber günstigere jährliche Konditionen haben – deshalb stehen Laufzeit und Jahreswert daneben. ",
          "“Per 100 of proceeds” sums the cost over the full term; long-term borrowing costs more in total but can have cheaper annual terms – hence term and annual value next to it. "),
        L("Gesamtstaat-Spalten: IWF (alle staatlichen Ebenen, % des BIP); Nettozinsen = Zinsausgaben abzüglich Zinseinnahmen, daher bei Ländern mit hohen Finanzanlagen (z. B. Japan, Kanada, Saudi-Arabien) sehr niedrig. Die letzte Spalte ist nominal in Landeswährung und nicht über Länder vergleichbar.",
          "General government columns: IMF (all levels of government, % of GDP); net interest = interest expenditure minus interest income, hence very low for countries with large financial assets (e.g. Japan, Canada, Saudi Arabia). The last column is nominal in local currency and not comparable across countries.")),
      h("section", { class: "card" }, h("div", { class: "table-scroll" }, h("table", null,
        h("thead", null,
          h("tr", null, h("th", null, ""), h("th", { colspan: 4 }, L("Zentralstaat: erfasste Emissionen des Jahres", "Central government: issues covered in the year")), h("th", { colspan: 2 }, L("Gesamtstaat (IWF)", "General government (IMF)")), h("th", null, L("Zentralstaat", "Central government"))),
          h("tr", null, h("th", null, L("Land", "Country")), h("th", { class: "r" }, L("Kosten je 100 Erlös", "Cost per 100 of proceeds")), h("th", { class: "r" }, L("Ø Laufzeit", "Avg. term")),
            h("th", { class: "r" }, L("je 100 u. Jahr", "per 100 and year")), h("th", { class: "r" }, L("Ø Rendite", "Avg. yield")), h("th", { class: "r" }, L("Nettozinsen % BIP", "Net interest % GDP")),
            h("th", { class: "r" }, L("Schulden % BIP", "Debt % GDP")), h("th", { class: "r" }, L("gezahlte Zinsen (Weltbank)", "interest paid (World Bank)")))),
        h("tbody", null, rows)))),
      h("p", { class: "muted" }, L("Status: Spalten 2–5 ", "Status: columns 2–5 "), chip("calc"), L(" (bei TIPS/inflationsindexierten Anleihen teils ", " (partly "), chip("proj"), L("), Spalten 6–8 ", " for TIPS/inflation-linked bonds), columns 6–8 "), chip("intl"),
        L(". Die Afrikanische Union und die EU sind als G20-Mitglieder keine Staaten mit eigener Zentralregierungsschuld im Sinne dieser Seite und werden nicht einzeln aufgeführt.",
          ". The African Union and the EU, as G20 members, are not states with their own central government debt in the sense of this site and are not listed individually.")));
  }

  // ------------------------------------------------------------------ Regierungen
  async function viewGovernments(codeArg) {
    const countries = await load("data/countries.json");
    const withData = countries.countries.filter(c => c.vintage_data);
    const c = withData.find(x => x.code === codeArg) || withData.find(x => x.code === "DE");
    CUR = c.currency;
    const meta = cmeta(c.code);
    const g = await load(`data/${c.code.toLowerCase()}/governments.json`);
    const sel = h("select", { id: "govCountry", onchange: e => { location.hash = `#/regierungen/${e.target.value}`; } },
      withData.map(x => h("option", { value: x.code, selected: x.code === c.code ? true : null }, countryName(x))));
    const running = x => (x.last === g.last_year ? L(" (laufend)", " (ongoing)") : "");
    const hasModel = g.governments.some(x => x.model_mid !== undefined);
    const rows = g.governments.slice().reverse().map(x => {
      const cx = x.context || {};
      return h("tr", null,
        h("td", null, x.head, h("div", { class: "muted" }, `${L("ab", "from")} ${dateDe(x.from)}`), h("div", { class: "muted" }, tr(x.parties))),
        x.n ? h("td", { class: "r" }, money(x.cost),
          Math.abs(x.cost_high - x.cost_low) > Math.abs(x.cost) * 0.005 ? h("div", { class: "muted" }, `${money(x.cost_low)} – ${money(x.cost_high)}`) : null,
          h("div", { class: "muted" }, `${x.first}–${x.last}${running(x)}`)) : h("td", { class: "r" }, chip("none", L("keine Einzeldaten", "no individual data"))),
        h("td", { class: "r" }, cx.cost_per_100 !== undefined ? nf2.format(cx.cost_per_100) : "–", cx.avg_term ? h("div", { class: "muted" }, L(`Ø ${nf1.format(cx.avg_term)} J. · ${nf2.format(cx.cost_per_100_year)} je Jahr`, `avg. ${nf1.format(cx.avg_term)} yrs · ${nf2.format(cx.cost_per_100_year)} per year`)) : null),
        h("td", { class: "r" }, cx.avg_yield !== null && cx.avg_yield !== undefined ? pct(cx.avg_yield) : "–"),
        h("td", { class: "r" }, cx.inherited_redemptions !== null && cx.inherited_redemptions !== undefined ? money(cx.inherited_redemptions) : "–"),
        hasModel ? (x.model_mid !== undefined ? h("td", { class: "r" }, `${money(x.model_low)} – ${money(x.model_high)}`,
          h("div", { class: "muted" }, L(`Mitte ${money(x.model_mid)} · ${x.model_first}–${x.model_last}`, `mid ${money(x.model_mid)} · ${x.model_first}–${x.model_last}`))) : h("td", { class: "r" }, x.n ? "–" : chip("none"))) : null);
    });
    app.replaceChildren(h("h1", null, L(`Eingegangene Zinslast je ${meta.govTitle}`, `Interest burden committed per ${meta.govTitle}`)),
      h("div", { class: "controls" }, h("label", { for: "govCountry" }, L("Land", "Country"), sel)),
      h("p", null, L("Summe der Finanzierungskosten bis Fälligkeit der Kredite, die in der Amtszeit aufgenommen wurden (", "Total financing cost until maturity of the borrowing taken up during the term ("), meta.scopeShort, "). ",
        L("Enthalten sind nur die Kosten der ursprünglichen Kredite, nicht deren spätere Anschlussfinanzierung.", "Only the cost of the original borrowing is included, not its later refinancing.")),
      h("p", { class: "note compare" }, h("strong", null, L("Zeitliche Zuordnung, keine politische Bewertung. ", "Temporal assignment, not a political judgement. ")),
        L("Wie viel Zinslast eine Regierung eingeht, hängt stark vom Zinsniveau ihrer Amtszeit und von den Fälligkeiten ab, die sie von Vorgängern übernimmt und refinanzieren muss. ",
          "How much interest burden a government commits depends heavily on the interest-rate level during its term and on the maturities it inherits from predecessors and has to refinance. "),
        L("Beides steht deshalb in eigenen Spalten. Für eine Bewertung gehören zudem Laufzeitwahl, Konjunktur und Krisen dazu.", "Both are therefore shown in separate columns. An assessment would also need to consider the choice of maturities, the economic cycle and crises.")),
      h("section", { class: "card" }, h("div", { class: "table-scroll" }, h("table", { class: "wrap-cells" },
        h("thead", null, h("tr", null, h("th", null, L("Regierung", "Government")), h("th", { class: "r" }, L(`Zinslast, berechnet (ab ${g.data_from})`, `Interest burden, calculated (from ${g.data_from})`)),
          h("th", { class: "r" }, L("je 100 Erlös", "per 100 of proceeds")), h("th", { class: "r" }, L("Zinsniveau (Ø Rendite)", "Interest-rate level (avg. yield)")),
          h("th", { class: "r" }, L("übernommene Fälligkeiten", "inherited maturities")),
          hasModel ? h("th", { class: "r" }, L("modelliert (1960–1998)", "modelled (1960–1998)")) : null)),
        h("tbody", null, rows)))),
      h("p", { class: "note" }, EN() && g.note_en ? g.note_en : g.note),
      h("p", { class: "muted" }, L(`„Übernommene Fälligkeiten“: Rückzahlungen in der Amtszeit aus Emissionen, die vor Amtsbeginn begeben wurden – nur erfasste Emissionen (ab ${g.data_from}); für die ersten Amtszeiten nach Datenbeginn deshalb zu niedrig. `,
        `“Inherited maturities”: redemptions during the term from issues made before the term began – covered issues only (from ${g.data_from}); therefore too low for the first terms after the data begin. `),
        L("Ø Emissionsrendite: volumengewichtet über alle Emissionen einschließlich kurzlaufender Geldmarktpapiere. ", "Avg. issue yield: volume-weighted over all issues including short-term money-market paper. "),
        hasModel ? L("Die modellierte Spalte stammt aus Bundesbank-Aggregaten mit Laufzeitannahmen und ist nicht gleichwertig mit den berechneten Werten. ", "The modelled column comes from Bundesbank aggregates with term assumptions and is not equivalent to the calculated values. ") : "",
        c.code === "DE" ? L("Beträge vor 1999 von D-Mark in Euro umgerechnet, nicht inflationsbereinigt.", "Amounts before 1999 converted from Deutsche Mark to euro, not adjusted for inflation.") : L("Nominal, nicht inflationsbereinigt.", "Nominal, not adjusted for inflation.")));
  }

  // ------------------------------------------------------------------ Worum geht es? (einfach erklärt)
  async function viewExplainer() {
    CUR = "EUR";
    const countriesAll = await load("data/countries.json");
    const years = [2026, 2027, 2028, 2029, 2030, 2031];
    const budget = [-18.7, 131.17, 108.32, 108.32, 108.32, 174.05];
    const vintage = [611.47, 0, 0, 0, 0, 0];
    const box1 = h("div", { class: "chart" }), box2 = h("div", { class: "chart" });
    const sec = (title, ...body) => h("section", { class: "card" }, h("h2", null, title), ...body);
    app.replaceChildren(h("div", { class: "doc" },
      h("h1", null, L("Worum geht es? Einfach erklärt", "What is this about? Explained simply")),
      pilotNote(countriesAll),
      h("p", { class: "lead" }, L("Wenn ein Staat Geld leiht, zahlt er dafür Zinsen – oft viele Jahre lang. Diese Seite zeigt, in welchem Jahr diese Zinsen ", "When a state borrows money, it pays interest on it – often for many years. This site shows in which year this interest was "),
        h("em", null, L("versprochen", "promised")), L(" wurden. Nicht nur, wann sie ", ". Not just when it is "), h("em", null, L("bezahlt", "paid")), L(" werden.", ".")),
      sec(L("Ein Vergleich aus dem Alltag", "An everyday comparison"),
        h("p", null, L("Stell dir vor, jemand schließt heute einen Handyvertrag über fünf Jahre ab. Bezahlt wird jeden Monat ein bisschen – die Entscheidung fiel aber heute. ",
          "Imagine someone signs a five-year mobile phone contract today. A little is paid every month – but the decision was made today. "),
          L("Wer später den Vertrag übernimmt, muss weiterzahlen, obwohl er ihn nicht abgeschlossen hat.", "Whoever takes over the contract later has to keep paying, although they did not sign it.")),
        h("p", null, L("Beim Staat ist es ähnlich: Eine Regierung nimmt Kredite auf, die Zinsen fallen über viele Jahre an. Im Haushalt steht aber immer nur, was ", "It is similar with the state: a government borrows, and the interest falls due over many years. But the budget only ever shows what is paid in interest "),
          h("em", null, L("in diesem Jahr", "in this year")),
          L(" an Zinsen bezahlt wird – egal, welche Regierung den Kredit aufgenommen hat.", " – regardless of which government took out the loan."))),
      sec(L("Was diese Seite anders macht", "What this site does differently"),
        h("p", null, L("Sie rechnet für jeden einzelnen Kredit aus, wie viel Zinsen er bis zum Ende kostet, und ordnet diese Summe dem Jahr zu, in dem der Kredit aufgenommen wurde. ",
          "For every single loan it calculates how much interest it costs until the end, and assigns this total to the year in which the loan was taken out. "),
          L("Ein echtes Beispiel: Im September 2026 lieh sich der Bund 3,7 Mrd. € für fünf Jahre (Bundesobligation). Bis 2031 kostet das 611 Mio. € Zinsen.",
            "A real example: in September 2026 the German federal government borrowed €3.7 bn for five years (a federal note). Until 2031 this costs €611 m in interest.")),
        h("div", { class: "two-col" },
          h("div", null, h("h3", null, L("So zeigt es der Haushalt", "How the budget shows it")), h("p", { class: "muted" }, L("Zinsen verteilt auf die Jahre, in denen sie gezahlt werden. 2026 sogar leicht negativ, weil der Käufer bei Kauf aufgelaufene Zinsen (Stückzinsen) mitbezahlt.",
            "Interest spread over the years in which it is paid. 2026 is even slightly negative because the buyer also pays the interest accrued so far (accrued interest).")), box1),
          h("div", null, h("h3", null, L("So zeigt es diese Seite", "How this site shows it")), h("p", { class: "muted" }, L("Die gesamte Zinslast von 611 Mio. € steht im Jahr der Entscheidung: 2026.", "The entire interest burden of €611 m appears in the year of the decision: 2026.")), box2))),
      sec(L("Was dadurch sichtbar wird", "What becomes visible"),
        h("ul", null,
          h("li", null, h("strong", null, L("Welche Lasten eine Regierung hinterlässt. ", "Which burdens a government leaves behind. ")), L("Zinsen aus Krediten von heute müssen oft spätere Regierungen bezahlen.", "Interest on today's borrowing often has to be paid by later governments.")),
          h("li", null, h("strong", null, L("Wie stark das Zinsniveau zählt. ", "How much the interest-rate level matters. ")), L("2016–2021 bekam der Bund teils mehr Geld, als er zurückzahlen muss (negative Zinsen). Seit 2022 kosten neue Kredite wieder deutlich mehr.",
            "In 2016–2021 the German government sometimes received more money than it has to repay (negative interest rates). Since 2022, new borrowing has become much more expensive again.")),
          h("li", null, h("strong", null, L("Dass der größte Teil neuer Kredite alte Kredite ersetzt. ", "That most new borrowing replaces old borrowing. ")), L("Wird ein Kredit fällig, leiht sich der Staat meist neues Geld, um ihn zurückzuzahlen (Anschlussfinanzierung). Nur ein kleinerer Teil ist echte neue Verschuldung.",
            "When a loan falls due, the state usually borrows new money to repay it (refinancing). Only a smaller part is genuinely new debt.")),
          h("li", null, h("strong", null, L("Wie teuer Kredite im Vergleich sind. ", "How expensive borrowing is in comparison. ")), L("„Kosten je 100 € Erlös“ zeigt, wie viel Zinsen der Staat für jeweils 100 € geliehenes Geld bis zum Ende zahlt – vergleichbar zwischen Jahren und Ländern. Die Laufzeit gehört immer dazu: Ein langer Kredit kostet insgesamt mehr, kann aber pro Jahr günstiger sein.",
            "“Cost per €100 of proceeds” shows how much interest the state pays until the end for every €100 borrowed – comparable across years and countries. The term always belongs with it: a long loan costs more in total but can be cheaper per year.")))),
      sec(L("Was diese Seite nicht tut", "What this site does not do"),
        h("ul", null,
          h("li", null, L("Sie bewertet keine Regierung. Sie ordnet zeitlich zu. Ob ein Kredit sinnvoll war, hängt von vielem ab: Zinsniveau, Krisen, wofür das Geld ausgegeben wurde.",
            "It does not judge any government. It assigns in time. Whether a loan made sense depends on many things: interest rates, crises, what the money was spent on.")),
          h("li", null, L("Sie erfindet keine Zahlen. Wo einzelne Kredite nicht bekannt sind, steht „keine ausreichenden Daten“ – oder eine klar markierte Schätzung.",
            "It does not invent figures. Where individual loans are not known, it says “insufficient data” – or shows a clearly marked estimate.")),
          h("li", null, L("Sie sagt nicht voraus, was die spätere Anschlussfinanzierung kostet. Das hängt von künftigen Zinsen ab und wird getrennt gezeigt.",
            "It does not predict what later refinancing will cost. That depends on future interest rates and is shown separately.")))),
      sec(L("Woran man erkennt, wie sicher eine Zahl ist", "How to tell how reliable a figure is"),
        h("ul", { class: "status-legend" },
          h("li", null, chip("calc"), L(" – aus jedem einzelnen Kredit nachgerechnet und gegen die veröffentlichten Daten geprüft.", " – recalculated from every single loan and checked against the published data.")),
          h("li", null, chip("official"), L(" – so von einer Behörde veröffentlicht.", " – published as such by an authority.")),
          h("li", null, chip("intl"), L(" – aus einer internationalen Datenbank (Weltbank, IWF), oft etwas anders abgegrenzt.", " – from an international database (World Bank, IMF), often defined slightly differently.")),
          h("li", null, chip("model"), L(" – geschätzt mit einer offen beschriebenen Annahme.", " – estimated with an openly described assumption.")),
          h("li", null, chip("proj"), L(" – hängt von der Zukunft ab, etwa der Inflation; deshalb als Spanne.", " – depends on the future, e.g. inflation; hence shown as a range.")),
          h("li", null, chip("none"), L(" – dafür gibt es keine verlässlichen Daten.", " – no reliable data exists for this.")))),
      sec(L("Wer steckt dahinter?", "Who is behind this?"),
        h("p", null, L("Ein unabhängiges Projekt. Alle Rohdaten stammen aus öffentlichen Quellen und liegen unverändert im ", "An independent project. All raw data comes from public sources and is stored unchanged in the "),
          h("a", { href: "https://github.com/hstre/TrueDepts", rel: "noopener" }, L("Quellcode-Repository", "source code repository")), ". ",
          L("Den genauen Rechenweg zeigt die Seite ", "The exact calculation is shown on the page "), h("a", { href: "#/methode" }, L("Methode", "Methodology")),
          L(", die Prüfungen die Seite ", ", the checks on the page "), h("a", { href: "#/pruefung" }, L("Prüfung", "Checks")), L(". Verantwortlich: siehe ", ". Responsible: see "), h("a", { href: "#/impressum" }, L("Impressum", "Legal notice")), "."),
        h("p", null, h("a", { class: "btn", href: "#/DE/2025" }, L("Zur Jahresansicht →", "Go to the year view →"))))));
    const common = { cats: years, height: 180, focusable: false, xEvery: 1, yFormat: t => moneyShort(t) };
    queueMicrotask(() => {
      cleanups.push(barChart(box1, { ...common, stacks: [{ color: "var(--series-1)", values: budget }], ariaLabel: L("Zinszahlungen nach Zahlungsjahr", "Interest payments by payment year"),
        tooltip: i => ({ head: String(years[i]), rows: [{ color: "var(--series-1)", value: money(budget[i]), label: L("in diesem Jahr gezahlt", "paid in this year") }] }) }));
      cleanups.push(barChart(box2, { ...common, stacks: [{ color: "var(--series-1)", values: vintage }], ariaLabel: L("Zinslast dem Aufnahmejahr zugeordnet", "Interest burden assigned to the year of borrowing"),
        tooltip: i => ({ head: String(years[i]), rows: [{ color: "var(--series-1)", value: money(vintage[i]), label: i === 0 ? L("gesamte Zinslast bis 2031", "total interest burden until 2031") : "" }] }) }));
    });
  }

  // ------------------------------------------------------------------ Impressum
  async function viewImprint() {
    const im = await load("data/impressum.json");
    const missing = t => h("span", { class: "missing" }, `[${t} ${L("fehlt", "missing")}]`);
    const street = im.street || missing(L("Straße und Hausnummer", "street and number"));
    const town = im.postal_code ? `${im.postal_code} ${im.city}` : h("span", null, missing(L("Postleitzahl", "postal code")), " ", im.city);
    app.replaceChildren(h("div", { class: "doc" },
      h("h1", null, L("Impressum", "Legal notice (Impressum)")),
      EN() ? h("p", { class: "note" }, "Translation for information. The German version is legally binding.") : null,
      h("h2", null, L("Angaben gemäß § 5 DDG", "Information pursuant to § 5 DDG (German Digital Services Act)")),
      h("p", null, im.name, h("br"), street, h("br"), town, h("br"), EN() ? "Germany" : im.country),
      h("h2", null, L("Kontakt", "Contact")),
      h("p", null, L("E-Mail: ", "Email: "), im.email ? h("a", { href: `mailto:${im.email}` }, im.email) : missing(L("E-Mail-Adresse", "email address")), im.phone ? h("span", null, h("br"), L("Telefon: ", "Phone: "), im.phone) : null),
      h("h2", null, L("Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV", "Responsible for content pursuant to § 18(2) MStV (Interstate Media Treaty)")),
      h("p", null, im.name, L(", Anschrift wie oben.", ", address as above.")),
      h("h2", null, L("Haftung für Inhalte", "Liability for content")),
      h("p", null, L("Die Inhalte wurden mit Sorgfalt aus öffentlichen Quellen berechnet; Rechenweg und Prüfungen sind offengelegt. Für Richtigkeit, Vollständigkeit und Aktualität wird keine Gewähr übernommen. ",
        "The content was calculated with care from public sources; the calculation method and checks are disclosed. No guarantee is given for accuracy, completeness or timeliness. "),
        L("Die Seite ist keine Anlage-, Steuer- oder Finanzberatung und keine politische Bewertung.", "The site is not investment, tax or financial advice and not a political assessment.")),
      h("h2", null, L("Haftung für Links", "Liability for links")),
      h("p", null, L("Die Seite verlinkt auf Angebote Dritter (Behörden, internationale Organisationen). Für deren Inhalte sind ausschließlich die jeweiligen Anbieter verantwortlich.",
        "The site links to third-party offerings (authorities, international organisations). Their respective providers are solely responsible for their content.")),
      h("h2", null, L("Datenschutz", "Privacy")),
      h("p", null, L("Diese Seite wird über GitHub Pages (GitHub Inc., USA) bereitgestellt. Beim Aufruf verarbeitet GitHub technisch notwendige Verbindungsdaten wie die IP-Adresse, um die Seite auszuliefern und abzusichern; Einzelheiten: ",
        "This site is hosted on GitHub Pages (GitHub Inc., USA). When the site is accessed, GitHub processes technically necessary connection data such as the IP address to deliver and secure the site; details: "),
        h("a", { href: EN() ? "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" : "https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement", rel: "noopener" }, L("Datenschutzerklärung von GitHub", "GitHub privacy statement")), "."),
      h("p", null, L("Die Seite selbst setzt keine Cookies, verwendet keine Analyse- oder Werbedienste und lädt keine Inhalte von Drittanbietern. Nur die Wahl hell/dunkel und die Sprache werden, falls gewählt, lokal im Browser gespeichert (localStorage) und nicht übertragen.",
        "The site itself sets no cookies, uses no analytics or advertising services and loads no third-party content. Only the light/dark choice and the language, if chosen, are stored locally in the browser (localStorage) and not transmitted.")),
      h("p", null, L("Betroffene haben nach der DSGVO das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Widerspruch sowie Beschwerde bei einer Aufsichtsbehörde. Kontakt: siehe oben.",
        "Under the GDPR, data subjects have the right of access, rectification, erasure, restriction of processing, objection and to lodge a complaint with a supervisory authority. Contact: see above.")),
      h("h2", null, L("Quellcode und Daten", "Source code and data")),
      h("p", null, L("Quellcode und unveränderte Rohdaten: ", "Source code and unchanged raw data: "), h("a", { href: "https://github.com/hstre/TrueDepts", rel: "noopener" }, "github.com/hstre/TrueDepts"),
        L(". Die Rechte an den Rohdaten liegen bei den jeweiligen Herausgebern (siehe ", ". Rights to the raw data remain with the respective publishers (see "), h("a", { href: "#/quellen" }, L("Quellen", "Sources")), ").")));
  }

  // ------------------------------------------------------------------ Quellen
  async function viewSources() {
    const [src, de] = await Promise.all([load("data/sources.json"), load("data/de/summary.json")]);
    const kv = (k, val) => [h("dt", null, k), h("dd", null, val)];
    const list = h("ol", { class: "source-list" }, src.sources.map(x => h("li", null,
      h("strong", null, EN() && x.title_en ? x.title_en : x.title), " ", chip(x.kind === "amtlich" ? "official" : "intl", x.kind === "amtlich" ? L("amtlich", "official") : L("international", "international")),
      h("div", { class: "muted" }, tr(x.publisher)),
      h("p", null, EN() && x.used_for_en ? x.used_for_en : x.used_for),
      h("dl", { class: "kv" },
        kv(L("Seite", "Page"), h("a", { href: x.landing, rel: "noopener" }, x.landing)),
        kv(L("Datei", "File"), h("a", { href: x.download, rel: "noopener" }, x.download)),
        x.retrieval ? kv(L("Abgerufen", "Retrieved"), x.retrieval.retrieved.replace("T", " ").replace("+00:00", " UTC")) : null,
        x.retrieval ? kv("SHA-256", x.retrieval.sha256) : null,
        x.retrieval ? kv(L("Kopie im Repository", "Copy in repository"), "data/raw/" + x.retrieval.file) : null))));
    const periods = (await load("data/de/years/1990.json")).context;
    app.replaceChildren(h("div", { class: "doc" },
      h("h1", null, L("Quellen", "Sources")),
      h("p", null, L("Alle Rohdateien liegen unverändert im Repository (data/raw/) und sind über Abrufzeit und SHA-256 eindeutig bestimmt. ", "All raw files are stored unchanged in the repository (data/raw/) and uniquely identified by retrieval time and SHA-256. "),
        L("Die aufbereiteten Einzelemissionen mit allen Rechenergebnissen gibt es als CSV: ", "The processed individual issues with all results are available as CSV: "),
        h("a", { href: "data/de/de_emissionen.csv", download: "" }, L("Deutschland", "Germany")), " · ", h("a", { href: "data/us/us_auctions.csv", download: "" }, L("Vereinigte Staaten", "United States")), " · ",
        h("a", { href: "data/gb/gb_gilts.csv", download: "" }, L("Vereinigtes Königreich", "United Kingdom")),
        L(" (dazu die aus den Renditen abgeleiteten Stammdaten je Gilt: ", " (plus the reference data per gilt derived from the yields: "),
        h("a", { href: "data/gb/gb_gilt_lines.csv", download: "" }, "gb_gilt_lines.csv"), ")."),
      list,
      h("h2", null, L("Deutschland: Abgrenzung, Währung, Gebietsstand", "Germany: scope, currency, territory")),
      h("p", null, EN() && de.scope_en ? de.scope_en : de.scope),
      h("p", { class: "muted" }, L("Beispiel 1990: ", "Example 1990: ") + `${tr(periods.territory)}. ${tr(periods.state)}`),
      h("p", null, L("Die Angaben je Jahr erscheinen in der Jahresansicht im Kasten über den Kennzahlen.", "The details per year appear in the year view in the box above the key figures.")),
      h("h2", null, L("Inflationsindexierte Bundeswertpapiere – amtliche Stammdaten", "Inflation-linked federal securities – official master data")),
      h("div", { class: "table-scroll" }, h("table", null, h("thead", null, h("tr", null, [L("ISIN", "ISIN"), L("Kupon", "Coupon"), L("Zinsen ab", "Interest from"), L("1. Kupon", "First coupon"), L("Fälligkeit", "Maturity")].map(x => h("th", null, x)))),
        h("tbody", null, Object.entries(src.ilb_meta).map(([k, m]) => h("tr", null, h("td", null, k), h("td", null, m["Kupon"] || "–"), h("td", null, m["Zinsen ab"] || "–"), h("td", null, m["1. Kupon"] || "–"), h("td", null, m["Fälligkeit"] || "–")))))),
      h("h2", null, L("Geprüft, aber noch nicht importiert", "Checked but not yet imported")),
      h("ul", null, src.candidates.map(c => h("li", null, h("strong", null, c.country + ": "), h("a", { href: c.url, rel: "noopener" }, c.title), " – ", tr(c.note)))),
      h("h2", null, L("Warum Schuldenstand und Zinssummen nicht reichen", "Why debt levels and interest totals are not enough")),
      h("p", null, L("Ein Schuldenstand sagt nicht, zu welchem Kurs, mit welchem Kupon und bis wann die Kredite eines Jahres laufen. Die jährliche Zinssumme vermischt alle Jahrgänge. Beide Reihen werden deshalb nur als Vergleichs- und Kontextzahl gezeigt – mit sichtbarem Status.",
        "A debt level does not say at what price, with what coupon and until when the borrowing of a year runs. The annual interest total mixes all vintages. Both series are therefore only shown as comparison and context figures – with a visible status.")),
      h("p", { class: "muted" }, L("Datenstand der Website: ", "Data as of: ") + dateDe(src.built) + L(". Letzte Emission im Datensatz: ", ". Latest issue in the data set: ") + dateDe(de.last_auction) + ".")));
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
    const r = await fetch(EN() ? "METHOD_EN.md" : "METHODE.md", { cache: "no-cache" });
    const text = await r.text();
    const div = h("div", { class: "doc" });
    div.innerHTML = md(text); // eigener, im Repository versionierter Text; HTML wird vorher maskiert
    app.replaceChildren(div);
  }

  // ------------------------------------------------------------------ Prüfung
  const GROUP_EN = { "Kuponanleihen": "Coupon bonds", "ILB (real)": "Inflation-linked (real)", "Bubill": "Bubill", "USD": "USD" };
  const groupLabel = k => {
    if (!EN()) return k;
    return GROUP_EN[k] || k.replace("Kurs aus Diskontsatz", "price from discount rate").replace("Kurs veröffentlicht", "price published");
  };

  async function viewVerification() {
    const v = await load("data/de/verification.json");
    const bt = (await load("data/de/summary.json")).model_backtest;
    const btBox = h("div", { class: "chart" });
    CUR = "EUR";
    const yRows = Object.entries(v.yields).map(([k, x]) => h("tr", null, h("td", null, groupLabel(k)), h("td", { class: "r" }, String(x.n)),
      h("td", { class: "r" }, pctNum(x.share * 100, nf1)), h("td", { class: "r" }, nf3.format(x.median_abs_diff)), h("td", { class: "r" }, nf3.format(x.max_abs_diff))));
    const cov = Object.entries(v.coverage);
    const box = h("div", { class: "chart" });
    const pp = L("%-Pkt.", "pp");
    app.replaceChildren(h("div", { class: "doc" },
      h("h1", null, L("Prüfung der Zahlungsströme gegen die Emissionsdaten", "Checking the cash flows against the issuance data")),
      h("p", { class: "muted" }, L("Deutschland (Abschnitte 1–6), danach Vereinigte Staaten und Vereinigtes Königreich.", "Germany (sections 1–6), followed by the United States and the United Kingdom.")),
      h("p", null, L(`Automatisch erzeugt mit python -m pipeline.verify am ${dateDe(v.checked)}.`, `Generated automatically with python -m pipeline.verify on ${dateDe(v.checked)}.`)),
      h("h2", null, L("1. Rendite-Nachrechnung", "1. Yield recalculation")),
      h("p", null, L("Aus Kurs, Kupon, Valuta, Stückzinsen und Kuponkalender wird für jede Emission die Rendite nachgerechnet und mit der veröffentlichten Durchschnittsrendite verglichen. Stimmen Kalender und Zahlungsströme, liegt die Abweichung innerhalb der Rundung der Veröffentlichung (±0,005 %-Punkte; Bubills: Geldmarktrendite act/360).",
        "For every issue the yield is recalculated from price, coupon, settlement, accrued interest and coupon schedule and compared with the published average yield. If calendar and cash flows are right, the deviation lies within the rounding of the publication (±0.005 percentage points; Bubills: money-market yield act/360).")),
      h("div", { class: "table-scroll" }, h("table", null, h("thead", null, h("tr", null, h("th", null, L("Gruppe", "Group")), h("th", { class: "r" }, L("Emissionen", "Issues")), h("th", { class: "r" }, L("innerhalb Rundung", "within rounding")), h("th", { class: "r" }, `Median |Δ| ${pp}`), h("th", { class: "r" }, `Max |Δ| ${pp}`))), h("tbody", null, yRows))),
      v.yield_outliers.length ? h("details", { class: "table-view" }, h("summary", null, L(`Größte Abweichungen (${v.yield_outliers.length})`, `Largest deviations (${v.yield_outliers.length})`)),
        h("div", { class: "table-scroll" }, h("table", null, h("thead", null, h("tr", null, [L("Datum", "Date"), "ISIN", L("Art", "Type"), L("veröffentlicht", "published"), L("nachgerechnet", "recalculated"), "Δ"].map(x => h("th", null, x)))),
          h("tbody", null, v.yield_outliers.map(o => h("tr", null, h("td", null, dateDe(o.date)), h("td", null, o.isin), h("td", null, o.instrument + " / " + o.method), h("td", { class: "r" }, pct(o.yield_pub)), h("td", { class: "r" }, pct(o.yield_calc)), h("td", { class: "r" }, nf2.format(o.diff)))))))) : null,
      h("p", { class: "muted" }, L("Restabweichungen von 0,01 %-Punkten entstehen durch Rundung (nachgerechnete Rendite auf zwei Stellen gerundet) oder eine abweichende tatsächliche Valuta.", "Remaining deviations of 0.01 percentage points arise from rounding (recalculated yield rounded to two decimals) or a different actual settlement date.")),
      h("h2", null, L("2. Kostenidentität", "2. Cost identity")),
      h("p", null, L(`${v.identity.n} Emissionen geprüft: Summe der Kostenkomponenten = Auszahlungen − Emissionserlös = Summe über Zahlungsjahre. Abweichungen: ${v.identity.failures}.`, `${v.identity.n} issues checked: sum of cost components = payments − issue proceeds = sum over payment years. Deviations: ${v.identity.failures}.`)),
      h("h2", null, L("3. Volumenabgleich mit dem amtlichen Umlauf", "3. Volume check against official amounts outstanding")),
      h("p", null, L(`Für Wertpapiere, deren gesamte Emission in der Historie liegt, stimmt das kumulierte Emissionsvolumen an ${v.volumes.match} von ${v.volumes.n} Stichtagen (${nf1.format(v.volumes.share * 100)} %) auf ±1 Mio. € mit dem Umlauf laut Einzelaufstellung überein. Die Abweichungen betreffen Papiere der Jahre 1999–2002, die zusätzlich außerhalb der Auktionen (z. B. im Daueremissionsverfahren oder vor der ersten Auktion) begeben wurden.`,
        `For securities whose entire issuance is in the history, the cumulative issue volume matches the amount outstanding according to the list of securities to within ±€1 m on ${v.volumes.match} of ${v.volumes.n} reference dates (${nf1.format(v.volumes.share * 100)}%). The deviations concern securities of 1999–2002 that were also issued outside auctions (e.g. as tap issues or before the first auction).`)),
      h("details", { class: "table-view" }, h("summary", null, L("Größte Abweichungen", "Largest deviations")), h("div", { class: "table-scroll" }, h("table", null,
        h("thead", null, h("tr", null, ["ISIN", L("Stichtag", "Reference date"), L("Emissionen kumuliert", "Issues cumulative"), L("Umlauf", "Outstanding"), L("Differenz", "Difference")].map(x => h("th", null, x)))),
        h("tbody", null, v.volumes.largest_differences.map(d => h("tr", null, h("td", null, d.isin), h("td", null, dateDe(d.date)), h("td", { class: "r" }, money(d.emissions_cum)), h("td", { class: "r" }, money(d.outstanding)), h("td", { class: "r" }, money(d.diff)))))))),
      h("h2", null, L("4. Konsistenz je Zeile", "4. Row consistency")),
      h("p", null, L(`Emissionsvolumen = Zuteilung + Marktpflegequote: ${v.row_volumes.n - v.row_volumes.inconsistent} von ${v.row_volumes.n} Zeilen stimmen. Die übrigen (vor allem 1999–2002) weisen eine Zuteilung aus, die vom geplanten Volumen abweicht; berechnet wird stets mit der Zuteilung.`,
        `Issue volume = allotment + retention: ${v.row_volumes.n - v.row_volumes.inconsistent} of ${v.row_volumes.n} rows match. The others (mainly 1999–2002) show an allotment that differs from the planned volume; calculations always use the allotment.`)),
      h("h2", null, L("5. Abdeckung der amtlichen Bruttokreditaufnahme", "5. Coverage of official gross borrowing")),
      h("p", null, L("Anteil der zugeteilten Emissionen an der Bruttokreditaufnahme laut Schuldenbericht. Der Rest: Verkäufe aus dem Eigenbestand, nicht auktionierte Instrumente, Geldmarktkredite.", "Share of allotted issues in gross borrowing according to the debt report. The rest: sales from own holdings, instruments not sold at auction, money-market loans.")),
      box,
      tableView(asTable(), [{ t: L("Jahr", "Year") }, { t: L("zugeteilt", "allotted"), r: 1 }, { t: L("amtl. Bruttokreditaufnahme", "official gross borrowing"), r: 1 }, { t: L("Anteil", "Share"), r: 1 }],
        cov.map(([y, x]) => [y + (x.complete_year ? "" : L(" (unvollständig)", " (incomplete)")), money(x.allotted), money(x.gross_official), pctNum(x.share * 100, nf0)])),
      h("h2", null, L("6. Rückrechnung des Modells für die Jahre vor 1999", "6. Back-test of the model for the years before 1999")),
      h("p", null, L("Für 1960–1998 gibt es keine Einzelemissionen. Die Zinslast wird dort aus Bundesbank-Aggregaten modelliert (Brutto-Absatz × Emissionsrendite × Laufzeitannahme). ", "For 1960–1998 there are no individual issues. The interest burden is modelled there from Bundesbank aggregates (gross sales × issue yield × term assumption). "),
        L("Um die Güte zu prüfen, wird dasselbe Modell auf die Jahre ab 1999 angewendet und mit den exakt aus Einzelemissionen berechneten Werten verglichen.", "To check its quality, the same model is applied to the years from 1999 and compared with the values calculated exactly from individual issues.")),
      bt.normal_years ? h("p", null, h("strong", null, L(`${bt.normal_years[0]}–${bt.normal_years[1]}: exakter Wert in ${bt.normal_in_band} von ${bt.normal_n} Jahren innerhalb der Modellspanne.`, `${bt.normal_years[0]}–${bt.normal_years[1]}: exact value within the model range in ${bt.normal_in_band} of ${bt.normal_n} years.`)),
        L(" Der Mittelwert des Modells liegt meist darüber (u. a., weil die Bundesbank-Summen ab 2000 auch Geldmarktpapiere enthalten). Bei Renditen nahe null oder negativ (ab 2015) ist das Modell unbrauchbar; vor 1999 lagen die Renditen zwischen etwa 4 und 10 %.",
          " The model's midpoint is usually higher (partly because the Bundesbank totals include money-market paper from 2000). With yields near zero or negative (from 2015) the model is unusable; before 1999 yields were roughly between 4 and 10%.")) : null,
      h("div", { class: "legend" }, h("span", null, h("span", { class: "key", style: "background:var(--series-1)" }), L("exakt aus Einzelemissionen", "exact from individual issues")),
        h("span", null, h("span", { class: "key dot", style: "background:var(--series-2)" }), L("Modell Mitte; Linie = Modellspanne", "model midpoint; line = model range"))),
      btBox,
      tableView(asTable(), [{ t: L("Jahr", "Year") }, { t: L("exakt berechnet", "calculated exactly"), r: 1 }, { t: L("Modell tief", "model low"), r: 1 }, { t: L("Modell Mitte", "model mid"), r: 1 }, { t: L("Modell hoch", "model high"), r: 1 }, { t: L("in Spanne", "in range") }],
        bt.rows.map(r => [String(r.year), money(r.exact), money(r.low), money(r.mid), money(r.high), r.in_band ? L("ja", "yes") : L("nein", "no")]))));
    queueMicrotask(() => cleanups.push(barChart(btBox, {
      cats: bt.rows.map(r => r.year), stacks: [{ color: "var(--series-1)", values: bt.rows.map(r => r.exact) }],
      whisker: { lo: bt.rows.map(r => r.low), hi: bt.rows.map(r => r.high) }, dots: { values: bt.rows.map(r => r.mid), color: "var(--series-2)" }, height: 220, xEvery: 5,
      tooltip: i => { const r = bt.rows[i]; return { head: String(r.year), rows: [{ color: "var(--series-1)", value: money(r.exact), label: L("exakt berechnet", "calculated exactly") }, { color: "var(--series-2)", value: money(r.mid), label: L(`Modell Mitte (Spanne ${money(r.low)} – ${money(r.high)})`, `model midpoint (range ${money(r.low)} – ${money(r.high)})`) }] }; },
    })));
    const us = await load("data/us/verification.json").catch(() => null);
    if (us) {
      const doc = app.querySelector(".doc");
      doc.append(h("h2", null, L("Vereinigte Staaten: Rendite-Nachrechnung und Kostenidentität", "United States: yield recalculation and cost identity")),
        h("p", null, L(`${nf0.format(us.n)} Auktionen (FiscalData, ab 1979). Für ${nf0.format(us.price_from_yield)} ältere Notes/Bonds ohne veröffentlichten Kurs wurde der Kurs aus der Rendite berechnet; diese sind von der Nachrechnung ausgenommen (zirkulär). `,
          `${nf0.format(us.n)} auctions (FiscalData, from 1979). For ${nf0.format(us.price_from_yield)} older notes/bonds without a published price, the price was calculated from the yield; these are excluded from the recalculation (circular). `),
          L("TIPS: Der veröffentlichte Kurs ist mit der Index-Verhältniszahl multipliziert; nachgerechnet wird mit dem realen Kurs. Bills bis etwa 1995: Rendite nur zweistellig veröffentlicht.", "TIPS: the published price is multiplied by the index ratio; recalculation uses the real price. Bills until around 1995: yield published to two decimals only.")),
        h("div", { class: "table-scroll" }, h("table", null, h("thead", null, h("tr", null, h("th", null, L("Gruppe", "Group")), h("th", { class: "r" }, L("Auktionen", "Auctions")), h("th", { class: "r" }, L("innerhalb Rundung", "within rounding")), h("th", { class: "r" }, L("Toleranz %-Pkt.", "Tolerance pp")), h("th", { class: "r" }, "Max |Δ|"))),
          h("tbody", null, Object.entries(us.yields).map(([k, x]) => h("tr", null, h("td", null, groupLabel(k)), h("td", { class: "r" }, nf0.format(x.n)), h("td", { class: "r" }, pctNum(x.share * 100, nf1)), h("td", { class: "r" }, EN() ? String(x.tolerance_pp) : String(x.tolerance_pp).replace(".", ",")), h("td", { class: "r" }, nf3.format(x.max_abs_diff))))))),
        h("p", null, L(`Kostenidentität: ${nf0.format(us.identity.n)} Emissionen, Abweichungen: ${us.identity.failures}. Status der Emissionen: `, `Cost identity: ${nf0.format(us.identity.n)} issues, deviations: ${us.identity.failures}. Status of the issues: `),
          Object.entries(us.status_counts).map(([k, n]) => `${statusLabel(k)}: ${nf0.format(n)}`).join(" · "), "."));
    }
    const gb = await load("data/gb/verification.json").catch(() => null);
    if (gb) {
      const doc = app.querySelector(".doc");
      const f = gb.fy2025_26, o = f.official;
      CUR = "GBP";
      doc.append(h("h2", null, L("Vereinigtes Königreich: Renditen, Erlöse, Summen", "United Kingdom: yields, proceeds, totals")),
        h("p", null, L(`${nf0.format(gb.n)} Emissionen (DMO, ab 1998). Wichtig: Die DMO-Stammdaten (Fälligkeitstag, Kupontermine) waren nicht abrufbar. Sie wurden je Gilt aus den veröffentlichten Renditen seiner Emissionen abgeleitet (${gb.lines.fitted} Gilts, davon ${gb.lines.single_issue} mit nur einer Emission). Die Tabelle zeigt deshalb, wie gut die abgeleiteten Daten die Renditen treffen – das ist eine Anpassung, keine unabhängige Nachrechnung. Unabhängig sind die beiden folgenden Prüfungen.`,
          `${nf0.format(gb.n)} issues (DMO, from 1998). Important: the DMO reference data (maturity date, coupon dates) could not be retrieved. They were derived for each gilt from the published yields of its issues (${gb.lines.fitted} gilts, ${gb.lines.single_issue} of them with only one issue). The table therefore shows how well the derived data match the yields – a fit, not an independent recalculation. The two checks that follow are independent.`)),
        h("div", { class: "table-scroll" }, h("table", null, h("thead", null, h("tr", null, h("th", null, L("Gruppe", "Group")), h("th", { class: "r" }, L("Emissionen", "Issues")), h("th", { class: "r" }, L("innerhalb Toleranz", "within tolerance")), h("th", { class: "r" }, L("Toleranz %-Pkt.", "Tolerance pp")), h("th", { class: "r" }, "Max |Δ|"))),
          h("tbody", null, Object.entries(gb.yields).map(([k, x]) => h("tr", null, h("td", null, EN() ? k.replace(" vor Nov. 1998", " before Nov 1998") : k), h("td", { class: "r" }, nf0.format(x.n)), h("td", { class: "r" }, pctNum(x.share * 100, nf1)), h("td", { class: "r" }, EN() ? String(x.tolerance_pp) : String(x.tolerance_pp).replace(".", ",")), h("td", { class: "r" }, nf3.format(x.max_abs_diff))))))),
        h("p", null, h("strong", null, L("Erlösabgleich der Index-linked Gilts: ", "Proceeds check for index-linked gilts: ")),
          L(`Nominal × realer Kurs × Index-Verhältniszahl (aus dem RPI des ONS berechnet) trifft den von der DMO veröffentlichten Cash-Erlös bei ${gb.cash.within_0_01pct} von ${gb.cash.n} Emissionen auf 0,01 % (seit 2015: ${gb.cash.since_2015_within_0_01pct} von ${gb.cash.since_2015_n}); größte Abweichung ${pctNum(gb.cash.max_rel * 100, nf2)}. Ältere Linker weichen stärker ab; gerechnet wird deshalb immer mit dem veröffentlichten Erlös.`,
            `Nominal × real price × index ratio (calculated from ONS RPI) matches the cash raised published by the DMO to within 0.01% for ${gb.cash.within_0_01pct} of ${gb.cash.n} issues (since 2015: ${gb.cash.since_2015_within_0_01pct} of ${gb.cash.since_2015_n}); largest deviation ${pctNum(gb.cash.max_rel * 100, nf2)}. Older linkers deviate more; calculations therefore always use the published proceeds.`)),
        h("p", null, h("strong", null, L("Summenabgleich Haushaltsjahr 2025–26: ", "Totals check fiscal year 2025–26: ")),
          L(`Auktionen einschließlich PAOF ${money(f.auctions_paof)} (Annual Review: ${money(o.auctions_paof)}, ${f.n_auctions} von ${o.n_auctions} Auktionen), Tender ${money(f.tenders)} (${money(o.tenders)}), Syndizierungen ${money(f.syndications)} (${money(o.syndications)}).`,
            `Auctions including PAOF ${money(f.auctions_paof)} (Annual Review: ${money(o.auctions_paof)}, ${f.n_auctions} of ${o.n_auctions} auctions), tenders ${money(f.tenders)} (${money(o.tenders)}), syndications ${money(f.syndications)} (${money(o.syndications)}).`)),
        h("p", null, L(`Kostenidentität: ${nf0.format(gb.identity.n)} Emissionen, Abweichungen: ${gb.identity.failures}. Status der Emissionen: `, `Cost identity: ${nf0.format(gb.identity.n)} issues, deviations: ${gb.identity.failures}. Status of the issues: `),
          Object.entries(gb.status_counts).map(([k, n]) => `${statusLabel(k)}: ${nf0.format(n)}`).join(" · "), "."));
      CUR = "EUR";
    }
    const complete = cov.filter(([, x]) => x.complete_year);
    queueMicrotask(() => cleanups.push(barChart(box, {
      cats: complete.map(([y]) => y), stacks: [{ color: "var(--series-1)", values: complete.map(([, x]) => x.share * 100) }], height: 200,
      yFormat: t => pctNum(t, nf0), xEvery: 5,
      tooltip: i => ({ head: complete[i][0], rows: [{ color: "var(--series-1)", value: pctNum(complete[i][1].share * 100, nf0), label: L("Abdeckung", "coverage") }] }),
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
  document.getElementById("langToggle")?.addEventListener("click", () => {
    LANG = EN() ? "de" : "en";
    try { localStorage.setItem("lang", LANG); } catch (e) { /* Speicher gesperrt */ }
    setLocale();
    route();
  });
  route();
})();
