"""Erzeugt die Daten der Website (site/data/) aus den Rohdateien.

Aufruf: python -m pipeline.build

Ausgaben
  site/data/countries.json        Länderliste mit Abdeckung
  site/data/sources.json          Quellenverzeichnis inkl. Abrufdatum und SHA-256
  site/data/intl.json             Weltbank-/IWF-Reihen je Land (nur Vergleich/Kontext)
  site/data/de/summary.json       Jahresübersicht 1945–heute
  site/data/de/years/<Jahr>.json  Jahrgangsdetails inkl. aller Einzelemissionen
  site/data/de/governments.json   Summen je Bundesregierung
  data/processed/de_emissionen.csv  normalisierte Einzelemissionen mit Rechenergebnissen
"""
from __future__ import annotations

import csv
import datetime as dt
import json
from collections import defaultdict
from pathlib import Path

from . import bbk_import, bonds
from .de_import import (INSTRUMENT_LABEL, METHOD_LABEL, load_auctions, load_debt_report,
                        load_index_ratios, load_securities)
from .sources import CANDIDATES, SOURCES
from .us_import import INSTRUMENT_LABEL as US_INSTRUMENT_LABEL

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site" / "data"
META = ROOT / "data" / "meta"
FIRST_YEAR = 1945

# Statuswerte, die in jeder Zelle der Website angezeigt werden
CALC = "calc"      # aus einzelnen Emissionen berechnet
MODEL = "model"    # modelliert (Annahme/Schätzung, Methode angegeben)
PROJ = "proj"      # Projektion (hängt von künftiger Inflation/Zinsen ab)
OFFICIAL = "official"  # amtliche Statistik unverändert übernommen
INTL = "intl"      # internationale Datenbank, abweichende Abgrenzung
NONE = "none"      # keine ausreichenden Daten


def r2(x):
    return None if x is None else round(x, 2)


def r1(x):
    return None if x is None else round(x, 1)


def iso(d):
    return d.isoformat() if d else None


def dump(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


# ---------------------------------------------------------------------------
# Einzelemissionen berechnen
# ---------------------------------------------------------------------------


def compute_issue(a, ratios, long_first=False):
    """Rechnet eine Emission. Gibt (Result|None, status, note) zurück."""
    n = a["allotted"]
    if n <= 0:
        return None, NONE, "Kein Verkauf an Investoren bei Emission (Eigenbestand); spätere Verkäufe im Sekundärmarkt sind in den Emissionsdaten nicht enthalten."
    if a["price_avg"] is None:
        return None, NONE, "Kein Emissionskurs veröffentlicht."
    kind = a["kind"]
    if kind == "zero":
        return bonds.zero_coupon(n, a["price_avg"], a["settle"], a["maturity"]), CALC, None
    if kind == "fixed":
        res = bonds.fixed_rate(n, a["coupon"], a["price_avg"], a["settle"], a["maturity"], a["interest_start"],
                               long_first=long_first)
        return res, CALC, None
    if kind == "inflation_linked":
        ir = ratios.get(a["isin"])
        if not ir:
            return None, NONE, "Keine amtlichen Index-Verhältniszahlen gefunden."
        res = bonds.inflation_linked(n, a["coupon"], a["price_avg"], a["settle"], a["maturity"], a["interest_start"],
                                     bonds.IndexRatio(ir), long_first=long_first)
        status = CALC if all(f.fixed for f in res.flows) else PROJ
        return res, status, None if status == CALC else "Künftige Kupons und Inflationsausgleich hängen von der Inflation ab (Projektion 0 %/2 %/4 % p. a.)."
    if kind == "fixed_fx":
        res = bonds.fixed_rate(n, a["coupon"], a["price_avg"], a["settle"], a["maturity"], a["interest_start"], freq=2,
                               long_first=long_first)
        return res, MODEL, ("US-Dollar-Anleihe: Die Emissionshistorie nennt nur einen Euro-Gegenwert. Zahlungen werden zu diesem "
                            "festen Umrechnungskurs gerechnet (halbjährliche Kupons, act/act). Tatsächliche Euro-Kosten hängen von "
                            "Wechselkurs und Währungssicherung ab.")
    return None, NONE, f"Unbekannte Wertpapierart {a['instrument']}."


def published_yield_check(a, long_first=False):
    """Rechnet die Rendite aus Kurs und Kalender nach und vergleicht mit der veröffentlichten."""
    if a["price_avg"] is None or a["yield_avg"] is None or a["allotted"] <= 0:
        return None
    try:
        if a["kind"] == "zero":
            y = bonds.money_market_yield(a["price_avg"], a["settle"], a["maturity"]) * 100
        elif a["kind"] in ("fixed", "inflation_linked"):
            y = bonds.isma_yield(a["coupon"], a["price_avg"], a["settle"], a["maturity"], a["interest_start"],
                                 long_first=long_first) * 100
        elif a["kind"] == "fixed_fx":
            y = bonds.isma_yield(a["coupon"], a["price_avg"], a["settle"], a["maturity"], a["interest_start"], freq=2,
                                 long_first=long_first) * 100
        else:
            return None
    except Exception:  # pragma: no cover - Diagnose
        return None
    return y


def first_coupon_conventions(auctions, ilb_meta):
    """Kurzer oder langer erster Kupon je ISIN.

    Inflationsindexierte Anleihen: aus dem amtlichen Datum „1. Kupon“.
    Übrige Kuponanleihen: Ist der erste Kupon für eine Emission relevant (Valuta vor dem zweiten
    regulären Termin), wird die Variante gewählt, mit der die veröffentlichten Renditen aller
    Auktionen dieser ISIN am besten nachgerechnet werden. Sonst Standard „kurz“ (ohne Wirkung).
    """
    by_isin = defaultdict(list)
    for a in auctions:
        if a["kind"] in ("fixed", "fixed_fx", "inflation_linked") and a["interest_start"]:
            by_isin[a["isin"]].append(a)
    out = {}
    for isin, rows in by_isin.items():
        a0 = rows[0]
        freq = 2 if a0["kind"] == "fixed_fx" else 1
        sch = bonds.Schedule(a0["maturity"], a0["interest_start"], freq)
        if a0["kind"] == "inflation_linked" and isin in ilb_meta and "1. Kupon" in ilb_meta[isin]:
            d, m, y = ilb_meta[isin]["1. Kupon"].split(".")
            first = dt.date(int(y), int(m), int(d))
            out[isin] = {"long_first": first != sch.grid[1], "basis": "amtliche Stammdaten (1. Kupon " + ilb_meta[isin]["1. Kupon"] + ")"}
            continue
        if not (a0["interest_start"] > sch.grid[0] and len(sch.grid) >= 3):
            out[isin] = {"long_first": False, "basis": "regulärer erster Kupon"}
            continue
        relevant = [a for a in rows if a["settle"] < sch.grid[2] and a["yield_avg"] is not None and a["price_avg"]]
        if not relevant:
            out[isin] = {"long_first": False, "basis": "ohne Auswirkung (alle Valuten nach dem 2. Kupontermin)"}
            continue
        err = {}
        for lf in (False, True):
            err[lf] = sum(abs(bonds.isma_yield(a["coupon"], a["price_avg"], a["settle"], a["maturity"],
                                                a["interest_start"], freq, lf) * 100 - a["yield_avg"]) for a in relevant)
        lf = err[True] + 1e-9 < err[False]
        out[isin] = {"long_first": lf, "basis": f"aus {len(relevant)} veröffentlichten Rendite(n) abgeleitet "
                                                f"(mittl. Abweichung kurz {err[False]/len(relevant):.3f}, lang {err[True]/len(relevant):.3f} %-Pkt.)"}
    return out


def governments():
    return governments_from("de_governments.json")


def governments_from(fname):
    g = json.loads((META / fname).read_text(encoding="utf-8"))
    govs = sorted(g["governments"], key=lambda x: x["from"])
    fms = sorted(g["finance_ministers"], key=lambda x: x["from"])
    return govs, fms, g["_hinweis"]


def gov_for(date: dt.date, govs):
    cur = None
    for gv in govs:
        if dt.date.fromisoformat(gv["from"]) <= date:
            cur = gv
    return cur


def fm_for(date: dt.date, fms):
    cur = None
    for f in fms:
        if dt.date.fromisoformat(f["from"]) <= date:
            cur = f
    return cur


# ---------------------------------------------------------------------------
# Internationale Reihen
# ---------------------------------------------------------------------------

COUNTRY_NAMES = {
    "ARG": ("AR", "Argentinien", "ARS"), "AUS": ("AU", "Australien", "AUD"), "BRA": ("BR", "Brasilien", "BRL"),
    "CAN": ("CA", "Kanada", "CAD"), "CHN": ("CN", "China", "CNY"), "FRA": ("FR", "Frankreich", "EUR"),
    "DEU": ("DE", "Deutschland", "EUR"), "IND": ("IN", "Indien", "INR"), "IDN": ("ID", "Indonesien", "IDR"),
    "ITA": ("IT", "Italien", "EUR"), "JPN": ("JP", "Japan", "JPY"), "KOR": ("KR", "Südkorea", "KRW"),
    "MEX": ("MX", "Mexiko", "MXN"), "RUS": ("RU", "Russland", "RUB"), "SAU": ("SA", "Saudi-Arabien", "SAR"),
    "ZAF": ("ZA", "Südafrika", "ZAR"), "TUR": ("TR", "Türkei", "TRY"), "GBR": ("GB", "Vereinigtes Königreich", "GBP"),
    "USA": ("US", "Vereinigte Staaten", "USD"),
}


def load_intl():
    """Internationale Reihen je G20-Land.

    wb_interest: Zinszahlungen des Zentralstaats (Weltbank, Mio. Landeswährung).
    weo: Gesamtstaat laut IWF-WEO; net_interest = Primärsaldo − Finanzierungssaldo (% BIP, abgeleitet),
         debt = Bruttoschulden (% BIP); projection = Jahr nach dem letzten Ist-Jahr des IWF.
    """
    import csv
    import re
    raw = ROOT / "data" / "raw" / "intl"
    out = {code: {"iso3": iso3, "name": name, "currency": cur, "wb_interest": {}, "weo": {}, "weo_meta": {}}
           for iso3, (code, name, cur) in COUNTRY_NAMES.items()}
    wb = json.loads((raw / "worldbank_GC.XPN.INTP.CN.json").read_text(encoding="utf-8"))
    for row in wb[1] or []:
        iso3 = row["countryiso3code"]
        if iso3 in COUNTRY_NAMES and row["value"] is not None:
            out[COUNTRY_NAMES[iso3][0]]["wb_interest"][row["date"]] = round(row["value"] / 1e6, 1)
    vals = defaultdict(dict)
    with open(raw / "imf_weo_g20.csv", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            iso3 = r["COUNTRY"]
            if iso3 not in COUNTRY_NAMES or r["OBS_VALUE"] in ("", "NaN"):
                continue
            code = COUNTRY_NAMES[iso3][0]
            vals[(code, r["TIME_PERIOD"])][r["INDICATOR"]] = float(r["OBS_VALUE"])
            meta = out[code]["weo_meta"]
            la = re.findall(r"\d{4}", r["LATEST_ACTUAL_ANNUAL_DATA"] or "")
            if la:  # z. B. "2025" oder "FY2024/25" (Fiskaljahr, erstes Kalenderjahr)
                meta["latest_actual"] = int(la[0])
                meta["latest_actual_label"] = r["LATEST_ACTUAL_ANNUAL_DATA"]
            if r.get("FISCAL_SECTOR_GENERAL_GOVERNMENT_COMPOSITION"):
                meta["composition"] = r["FISCAL_SECTOR_GENERAL_GOVERNMENT_COMPOSITION"]
            if r.get("START_END_MONTHS_OF_REPORTING_YEAR"):
                meta["fiscal_year"] = r["START_END_MONTHS_OF_REPORTING_YEAR"]
    for (code, year), v in vals.items():
        e = {}
        if "GGXONLB_NGDP" in v and "GGXCNL_NGDP" in v:
            e["net_interest"] = round(v["GGXONLB_NGDP"] - v["GGXCNL_NGDP"], 2)
        if "GGXWDG_NGDP" in v:
            e["debt"] = round(v["GGXWDG_NGDP"], 1)
        la = out[code]["weo_meta"].get("latest_actual")
        e["projection"] = bool(la and int(year) > la)
        out[code]["weo"][year] = e
    return out


# ---------------------------------------------------------------------------
# Hauptprogramm
# ---------------------------------------------------------------------------


def main():
    today = dt.date.today()
    securities = load_securities()
    auctions = load_auctions(securities)
    ratio_tables, ilb_meta = load_index_ratios()
    report = load_debt_report()
    intl = load_intl()
    govs, fms, gov_note = governments()
    agg, agg_gov = bbk_import.annual_aggregates(govs)
    vgr = bbk_import.load_annual("vgr_zinsausgaben_staat")
    last_auction = max(a["date"] for a in auctions)
    ilb_last = max(max(v) for v in ratio_tables.values())

    conventions = first_coupon_conventions(auctions, ilb_meta)
    issues_by_year = defaultdict(list)
    csv_rows = []
    for a in sorted(auctions, key=lambda x: (x["date"], x["isin"])):
        conv = conventions.get(a["isin"], {"long_first": False, "basis": None})
        res, status, note = compute_issue(a, ratio_tables, conv["long_first"])
        y_calc = published_yield_check(a, conv["long_first"])
        gv = gov_for(a["date"], govs)
        fm = fm_for(a["date"], fms)
        rec = {
            "date": iso(a["date"]), "settle": iso(a["settle"]), "isin": a["isin"], "instrument": a["instrument"],
            "kind": a["kind"], "coupon": a["coupon"], "maturity": iso(a["maturity"]), "method": a["method"],
            "new": a["new_issue"], "issue_volume": r2(a["issue_volume"]), "allotted": r2(a["allotted"]),
            "retained": r2(a["retained"]), "price": a["price_avg"], "yield_pub": a["yield_avg"],
            "yield_calc": r2(y_calc) if y_calc is not None and a["kind"] != "zero" else (round(y_calc, 3) if y_calc is not None else None),
            "interest_start": iso(a["interest_start"]), "interest_start_source": a["interest_start_source"],
            "settle_rule": a["settle_rule"], "status": status, "note": note,
            "first_coupon": ("lang" if conv["long_first"] else "kurz/regulär"), "first_coupon_basis": conv["basis"],
            "gov": gv["id"] if gv else None, "fm": fm["name"] if fm else None, "row": a["source_row"],
        }
        if res is not None:
            lo, mid, hi = res.cost_band
            flows = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])  # fest, Projektion tief/mittel/hoch
            comp = defaultdict(float)
            for f in res.flows:
                y = f.date.year
                if f.fixed:
                    flows[y][0] += f.amount
                else:
                    b = f.band()
                    flows[y][1] += b[0]
                    flows[y][2] += b[1]
                    flows[y][3] += b[2]
                comp[f.component] += f.amount
            rec.update({
                "proceeds": r2(res.proceeds), "clean_proceeds": r2(res.clean_proceeds), "accrued": r2(res.accrued),
                "redemption": r2(res.redemption), "cost": r2(mid), "cost_low": r2(lo), "cost_high": r2(hi),
                "cost_fixed": r2(res.cost_fixed), "components": {k: r2(v) for k, v in comp.items()},
                "flows": {str(y): [r2(v) for v in vals] for y, vals in sorted(flows.items())},
                "cash": [[iso(d), kind, r2(v)] for d, kind, v in res.cash],
            })
        issues_by_year[a["settle"].year].append(rec)
        csv_rows.append(rec)

    # --- CSV der normalisierten Einzelemissionen ---
    proc = ROOT / "data" / "processed"
    proc.mkdir(parents=True, exist_ok=True)
    cols = ["date", "settle", "isin", "instrument", "kind", "coupon", "maturity", "method", "new", "issue_volume",
            "allotted", "retained", "price", "yield_pub", "yield_calc", "interest_start", "proceeds", "accrued",
            "redemption", "cost", "cost_low", "cost_high", "cost_fixed", "status", "gov", "row"]
    with open(proc / "de_emissionen.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for rec in csv_rows:
            w.writerow(rec)
    site_csv = SITE / "de" / "de_emissionen.csv"
    site_csv.parent.mkdir(parents=True, exist_ok=True)
    site_csv.write_bytes((proc / "de_emissionen.csv").read_bytes())

    # --- Jahrgänge ---
    context = json.loads((META / "de_context.json").read_text(encoding="utf-8"))
    summary = []
    gov_totals = defaultdict(lambda: defaultdict(float))
    for year in range(FIRST_YEAR, today.year + 1):
        items = issues_by_year.get(year, [])
        ctx = next((p for p in context["periods"] if p["from"] <= year <= p["to"]), None)
        rep = report.get(year)
        wb_int = intl["DE"]["wb_interest"].get(str(year))
        weo = intl["DE"]["weo"].get(str(year))
        imf = weo.get("debt") if weo else None
        general = {"weo": weo, "vgr_interest": vgr.get(year)} if (weo or vgr.get(year)) else None
        v = build_vintage(year, items, rep, wb_int, imf, ctx, govs, today, last_auction, ilb_last,
                          agg.get(year), {g: vals for (yy, g), vals in agg_gov.items() if yy == year}, general)
        dump(SITE / "de" / "years" / f"{year}.json", v)
        summary.append({k: v[k] for k in ("year", "status", "totals", "paid", "split", "coverage", "context", "aggregate", "general_gov")} |
                       {"govs": [g["id"] for g in v["governments"]]})
        for g in v["governments"]:
            if g.get("model"):
                t = gov_totals[g["id"]]
                for k, val in zip(("model_low", "model_mid", "model_high"), g["model"]):
                    t[k] += val
                t["model_first"] = min(t.get("model_first", year), year)
                t["model_last"] = max(t.get("model_last", year), year)
            if not g["n"]:
                continue
            t = gov_totals[g["id"]]
            for k in ("allotted", "proceeds", "cost", "cost_low", "cost_high", "cost_fixed", "n"):
                t[k] += g.get(k) or 0
            t["first"] = min(t.get("first", year), year)
            t["last"] = max(t.get("last", year), year)

    backtest = []
    for e in summary:
        m = (e.get("aggregate") or {}).get("model") or {}
        if m.get("role") == "backtest" and "exact_cost" in m:
            backtest.append({"year": e["year"], "exact": m["exact_cost"], "low": m["low"], "mid": m["mid"], "high": m["high"],
                             "in_band": m["exact_in_band"]})
    normal = [b for b in backtest if b["year"] <= 2014]
    dump(SITE / "de" / "summary.json", {
        "model_backtest": {"rows": backtest, "normal_years": [normal[0]["year"], normal[-1]["year"]] if normal else None,
                           "normal_n": len(normal), "normal_in_band": sum(b["in_band"] for b in normal)},
        "country": "DE", "first_year": FIRST_YEAR, "last_year": today.year, "years": summary,
        "last_auction": iso(last_auction), "ilb_last_official": iso(ilb_last),
        "scenarios": bonds.SCENARIOS, "scope": context["scope"],
        "model_terms": {"short": bbk_import.TERM_SHORT, "long": bbk_import.TERM_LONG},
    })
    all_issues = [i for y in sorted(issues_by_year) for i in issues_by_year[y]]
    pol = political_context(all_issues, govs, last_auction)
    gov_out = []
    for gv in govs:
        t = gov_totals.get(gv["id"])
        gv = gv | {"context": pol.get(gv["id"])}
        gov_out.append(gv | ({k: (r1(v) if k not in ("first", "last", "n", "model_first", "model_last") else int(v))
                              for k, v in t.items()} if t else {}))
    dump(SITE / "de" / "governments.json", {"last_year": today.year, "note": gov_note, "governments": gov_out, "finance_ministers": fms,
                                          "data_from": 1999, "gov_label": "Bundesregierung", "currency": "EUR"})

    # --- Vereinigte Staaten ---
    from .build_us import build_us
    us_info = build_us(today, intl)

    # --- Länder, Quellen, internationale Reihen ---
    vintage = {"DE": {"from": 1999, "to": today.year, "source": "Finanzagentur (Einzelemissionen)",
                      "scope": "Bund (Zentralstaat) einschließlich über Bundeswertpapiere finanzierter Sondervermögen",
                      "model_from": 1960},
               "US": {"from": 1979, "to": today.year, "source": "U.S. Treasury, FiscalData (Einzelauktionen)",
                      "scope": "Zentralregierung: marktfähige Treasury-Wertpapiere"}}
    countries = []
    for code, c in sorted(intl.items(), key=lambda kv: kv[1]["name"]):
        countries.append({
            "code": code, "name": c["name"], "currency": c["currency"],
            "vintage_data": code in vintage, "vintage": vintage.get(code),
            "vintage_years": [vintage[code]["from"], today.year] if code in vintage else None,
            "wb_years": [min(c["wb_interest"], default=None), max(c["wb_interest"], default=None)],
            "weo_meta": c["weo_meta"],
            "candidates": [x for x in CANDIDATES if x["country"] == code],
        })
    dump(SITE / "countries.json", {"countries": countries, "first_year": FIRST_YEAR, "last_year": today.year})
    dump(SITE / "intl.json", intl)
    manifest = json.loads((ROOT / "data" / "raw" / "MANIFEST.json").read_text(encoding="utf-8"))
    dump(SITE / "sources.json", {
        "sources": [{"id": k} | {kk: vv for kk, vv in v.items()} | {"retrieval": manifest.get(k)} for k, v in SOURCES.items()],
        "candidates": CANDIDATES, "ilb_meta": ilb_meta, "built": today.isoformat(),
        "instrument_labels": INSTRUMENT_LABEL | US_INSTRUMENT_LABEL, "method_labels": METHOD_LABEL,
    })
    (SITE.parent / "METHODE.md").write_bytes((ROOT / "docs" / "METHODE.md").read_bytes())
    print(f"{len(auctions)} Emissionen, Jahre {FIRST_YEAR}–{today.year} geschrieben nach {SITE.relative_to(ROOT)}")


def comparison_metrics(cost, proceeds, avg_term):
    """Vergleichskennzahlen unabhängig von Währung und Größe.

    cost_per_100: Finanzierungskosten bis Fälligkeit je 100 Einheiten Emissionserlös (über die gesamte Laufzeit).
    cost_per_100_year: dasselbe je Jahr durchschnittlicher Laufzeit – grobe jährliche Belastung; lange Kredite
    können insgesamt mehr kosten und trotzdem günstigere jährliche Konditionen haben.
    """
    if not proceeds or proceeds <= 0:
        return {}
    per100 = cost / proceeds * 100
    out = {"cost_per_100": round(per100, 2)}
    if avg_term:
        out["cost_per_100_year"] = round(per100 / avg_term, 3)
    return out


def political_context(issues, govs, last_date):
    """Zeitlicher Kontext je Regierung: Zinsniveau der Emissionen in der Amtszeit und übernommene Fälligkeiten.

    Übernommen = in der Amtszeit fällige Rückzahlungen aus Emissionen, die vor Amtsbeginn begeben wurden
    (nur erfasste Emissionen).
    """
    out = {}
    for k, gv in enumerate(govs):
        start = dt.date.fromisoformat(gv["from"])
        end = dt.date.fromisoformat(govs[k + 1]["from"]) if k + 1 < len(govs) else last_date
        own = [i for i in issues if "cost" in i and start <= dt.date.fromisoformat(i["date"]) < end]
        inherited = sum(i["redemption"] for i in issues if "cost" in i
                        and dt.date.fromisoformat(i["date"]) < start and start <= dt.date.fromisoformat(i["maturity"]) < end)
        own_due = sum(i["redemption"] for i in own if dt.date.fromisoformat(i["maturity"]) < end)
        wy = [(i["yield_pub"], i["allotted"]) for i in own if i["yield_pub"] is not None]
        vol = sum(w for _, w in wy)
        term = sum(i["allotted"] * (dt.date.fromisoformat(i["maturity"]) - dt.date.fromisoformat(i["settle"])).days / 365.25
                   for i in own)
        allotted = sum(i["allotted"] for i in own)
        out[gv["id"]] = {
            "avg_yield": round(sum(y * w for y, w in wy) / vol, 3) if vol else None,
            "avg_term": round(term / allotted, 2) if allotted else None,
            "inherited_redemptions": round(inherited, 1) if own or inherited else None,
            "own_redemptions_in_term": round(own_due, 1) if own else None,
            "period_end": end.isoformat(),
        }
        if own:
            out[gv["id"]].update(comparison_metrics(sum(i["cost"] for i in own), sum(i["proceeds"] for i in own),
                                                    term / allotted if allotted else None))
    return out


def build_vintage(year, items, rep, wb_int, imf, ctx, govs, today, last_auction, ilb_last, agg=None, agg_gov=None,
                  general=None, coverage_allowed=True):
    priced = [i for i in items if "cost" in i]
    has_issue_data = bool(items)
    totals = None
    by_instrument = {}
    flows = {}
    maturities = defaultdict(float)
    if has_issue_data:
        t = defaultdict(float)
        for i in items:
            t["n"] += 1
            t["retained"] += i["retained"] or 0
        for i in priced:
            t["allotted"] += i["allotted"]
            t["proceeds"] += i["proceeds"]
            t["accrued"] += i["accrued"]
            for k in ("cost", "cost_low", "cost_high", "cost_fixed"):
                t[k] += i[k]
            t["w_yield"] += (i["yield_pub"] or 0) * i["allotted"] if i["yield_pub"] is not None else 0
            t["w_yield_n"] += i["allotted"] if i["yield_pub"] is not None else 0
            t["w_term"] += i["allotted"] * (dt.date.fromisoformat(i["maturity"]) - dt.date.fromisoformat(i["settle"])).days / 365.25
            bi = by_instrument.setdefault(i["instrument"], defaultdict(float))
            bi["n"] += 1
            bi["allotted"] += i["allotted"]
            bi["proceeds"] += i["proceeds"]
            bi["cost"] += i["cost"]
            bi["cost_low"] += i["cost_low"]
            bi["cost_high"] += i["cost_high"]
            for y, vals in i["flows"].items():
                acc = flows.setdefault(y, [0.0, 0.0, 0.0, 0.0])
                for k in range(4):
                    acc[k] += vals[k]
            maturities[i["maturity"][:4]] += i["redemption"]
        totals = {
            "n": int(t["n"]), "allotted": r1(t["allotted"]), "proceeds": r1(t["proceeds"]), "accrued": r1(t["accrued"]),
            "retained": r1(t["retained"]), "cost": r1(t["cost"]), "cost_low": r1(t["cost_low"]),
            "cost_high": r1(t["cost_high"]), "cost_fixed": r1(t["cost_fixed"]),
            "avg_yield": round(t["w_yield"] / t["w_yield_n"], 3) if t["w_yield_n"] else None,
            "avg_term": round(t["w_term"] / t["allotted"], 2) if t["allotted"] else None,
            "partial": year == today.year,
        }
        totals.update(comparison_metrics(t["cost"], t["proceeds"], t["w_term"] / t["allotted"] if t["allotted"] else None))
    statuses = {i["status"] for i in items}
    if not has_issue_data:
        status = NONE
    elif statuses <= {CALC, NONE}:
        status = CALC
    else:
        status = "mixed"

    # Anschlussfinanzierung vs. Nettokreditaufnahme (amtliche Summen, proportionale Zuordnung)
    split = None
    if rep and rep.get("gross_borrowing") is not None and rep.get("redemptions") is not None:
        gross, red = rep["gross_borrowing"], rep["redemptions"]
        net = gross - red
        refi = min(red, gross)
        share_net = max(net, 0) / gross if gross else None
        split = {
            "status": MODEL, "gross": r1(gross), "redemptions": r1(red), "net": r1(net), "refinancing": r1(refi),
            "share_net": round(share_net, 4) if share_net is not None else None,
            "as_of": rep["as_of"], "complete_year": rep["complete_year"],
        }
        if totals:
            split["cost_net"] = r1(totals["cost"] * share_net)
            split["cost_refinancing"] = r1(totals["cost"] * (1 - share_net))
            split["allotted_net"] = r1(totals["allotted"] * share_net)
            split["allotted_refinancing"] = r1(totals["allotted"] * (1 - share_net))

    elif agg and agg.get("net_from_outstanding") is not None and agg.get("gross"):
        gross, net = agg["gross"], agg["net_from_outstanding"]
        refi = max(0.0, min(gross, gross - net))
        split = {
            "status": MODEL, "source": "bundesbank", "gross": r1(gross), "net": r1(net), "refinancing": r1(refi),
            "redemptions": r1(gross - net), "share_net": round(max(net, 0) / gross, 4) if gross else None,
            "as_of": f"{year}-12-31", "complete_year": True, "scope": "nur Anleihen des Bundes (Bundesbank-Kapitalmarktstatistik)",
        }
        if agg.get("model") and year < 1999 and split["share_net"] is not None:
            split["cost_net_model"] = [r1(agg["model"][k] * split["share_net"]) for k in ("model_low", "model_mid", "model_high")]

    coverage = None
    if coverage_allowed and totals and rep and rep.get("gross_borrowing") and rep.get("complete_year"):
        coverage = round(totals["allotted"] / rep["gross_borrowing"], 4)

    paid = {"status": NONE}
    if rep and rep.get("interest_cash") is not None:
        paid = {"status": OFFICIAL, "cash": r1(rep["interest_cash"]), "total": r1(rep.get("interest_total")),
                "as_of": rep["as_of"], "complete_year": rep["complete_year"]}
    elif wb_int is not None:
        paid = {"status": INTL, "wb": wb_int}
    if wb_int is not None:
        paid["wb"] = wb_int

    aggregate = None
    if agg:
        aggregate = {"status": OFFICIAL, "gross": agg["gross"], "gross_dm": r1(agg["gross"] * bbk_import.DM_PER_EUR) if year < 1999 else None,
                     "gross_le4": agg["gross_le4"], "gross_gt4": agg["gross_gt4"], "em_yield": agg["em_yield"],
                     "outstanding": agg["outstanding"]}
        if agg.get("model"):
            m = agg["model"]
            aggregate["model"] = {"status": MODEL, "low": m["model_low"], "mid": m["model_mid"], "high": m["model_high"],
                                  "volume_without_yield": m["volume_without_yield"],
                                  "volume_fallback_yield": m["volume_fallback_yield"],
                                  "role": "estimate" if year < 1999 else "backtest"}
            if totals and year < today.year:
                aggregate["model"]["exact_cost"] = totals["cost"]
                aggregate["model"]["exact_in_band"] = m["model_low"] <= totals["cost"] <= m["model_high"]

    # Regierungen im Jahr
    gov_list = []
    for gv in govs:
        start = dt.date.fromisoformat(gv["from"])
        nxt = next((dt.date.fromisoformat(x["from"]) for x in govs if x["from"] > gv["from"]), dt.date(9999, 1, 1))
        if start.year <= year and nxt > dt.date(year, 1, 1):
            sub = [i for i in priced if start <= dt.date.fromisoformat(i["date"]) < nxt]
            e = {"id": gv["id"], "head": gv["head"], "parties": gv["parties"], "from": gv["from"],
                 "first": year, "last": year, "n": len(sub)}
            if sub:
                for k in ("allotted", "proceeds", "cost", "cost_low", "cost_high", "cost_fixed"):
                    e[k] = r1(sum(i[k] for i in sub))
            if year < 1999 and agg_gov and gv["id"] in agg_gov:
                e["model"] = agg_gov[gv["id"]]
            gov_list.append(e)

    return {
        "year": year, "country": "DE", "status": status,
        "context": ctx, "totals": totals,
        "by_instrument": {k: {kk: r1(vv) if kk != "n" else int(vv) for kk, vv in v.items()} for k, v in by_instrument.items()},
        "flows": {y: [r1(x) for x in v] for y, v in sorted(flows.items())},
        "maturities": {y: r1(v) for y, v in sorted(maturities.items())},
        "split": split, "coverage": coverage, "paid": paid, "imf_debt": imf, "aggregate": aggregate,
        "general_gov": general,
        "governments": gov_list, "issues": items,
        "data_through": iso(last_auction) if year == today.year else None,
        "ilb_last_official": iso(ilb_last),
    }


if __name__ == "__main__":
    main()
