"""Erzeugt die Website-Daten für das Vereinigte Königreich (site/data/gb/).

Gleiches Schema wie Deutschland und die USA, damit die Oberfläche alle Länder gleich darstellt.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
from collections import defaultdict

from . import bonds, uk_import
from .build import (META, ROOT, SITE, build_vintage, dump, fm_for, gov_for, governments_from, iso,
                    political_context, r1, r2)

FIRST_YEAR = 1945
DATA_FROM = 1998


def record(o, line, res, status, note, y_calc, price, price_src, govs, fms):
    gv = gov_for(o["date"], govs)
    fm = fm_for(o["date"], fms)
    rec = {
        "date": iso(o["date"]), "settle": iso(o["settle"]), "isin": o["name"], "instrument": o["instrument"],
        "kind": {"fixed": "fixed", "linker3": "inflation_linked", "linker8": "inflation_linked"}[o["kind"]],
        "coupon": o["coupon"], "maturity": iso(line.get("maturity")), "method": o["method"],
        "new": bool(line.get("new_in_data")) and o["date"] == line.get("first_date"),
        "issue_volume": r2(o["nominal"]), "allotted": r2(o["nominal"]), "retained": 0.0,
        "paof": r2(o["paof"]) if o["paof"] else None, "cash_pub": o["cash"], "cover": o["cover"],
        "price": round(price, 6) if price is not None else None, "price_pub": o["price_pub"], "price_source": price_src,
        "yield_pub": o["yield_pub"], "yield_calc": round(y_calc, 4) if y_calc is not None else None,
        "interest_start": iso(line.get("interest_start")) if line.get("new_in_data") or line.get("start_searched") else None,
        "interest_start_source": ("Valuta der Erstemission, aus den Renditen abgeleitet" if line.get("new_in_data")
                                  else "vor der ersten erfassten Emission, aus den Renditen abgeleitet" if line.get("start_searched")
                                  else "regulärer Kuponkalender (aus den Renditen abgeleitet)"),
        "maturity_source": "aus den veröffentlichten Renditen abgeleitet (DMO-Stammdaten nicht abrufbar)",
        "settle_rule": o["settle_rule"], "status": status, "note": note,
        "first_coupon": "lang" if line.get("long_first") else "kurz/regulär",
        "first_coupon_basis": line.get("first_coupon_basis"),
        "gov": gv["id"] if gv else None, "fm": fm["name"] if fm else None, "row": o["row"], "source": o["source"],
    }
    if o.get("cash_check") is not None:
        rec["cash_check"] = round(o["cash_check"], 6)
    if res is not None:
        lo, mid, hi = res.cost_band
        flows = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
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
    return rec


SCOPE_NOTE = ("Erfasst sind Gilts aus Auktionen (einschließlich PAOF) und Tendern; Syndizierungen nur im Haushaltsjahr 2025–26. "
              "Nicht enthalten: frühere Syndizierungen, Treasury Bills, National Savings & Investments, Kommunen und "
              "Regionalregierungen. Die Summen sind deshalb eine Untergrenze der Kreditaufnahme des Jahres.")


def build_gb(today: dt.date, intl: dict):
    ops, lines, rpi = uk_import.load_all()
    govs, fms, gov_note = governments_from("gb_governments.json")
    context = json.loads((META / "gb_context.json").read_text(encoding="utf-8"))

    issues_by_year = defaultdict(list)
    for o in ops:
        line = lines[o["key"]]
        res, status, note, y_calc, price, src = uk_import.compute(o, line, rpi)
        issues_by_year[o["settle"].year].append(record(o, line, res, status, note, y_calc, price, src, govs, fms))
    all_issues = [i for y in sorted(issues_by_year) for i in issues_by_year[y]]
    last_auction = max(o["date"] for o in ops)

    data_start = min(o["date"] for o in ops)
    summary = []
    for year in range(FIRST_YEAR, today.year + 1):
        items = issues_by_year.get(year, [])
        ctx = next((p for p in context["periods"] if p["from"] <= year <= p["to"]), None)
        wb_int = intl["GB"]["wb_interest"].get(str(year))
        weo = intl["GB"]["weo"].get(str(year))
        general = {"weo": weo} if weo else None
        v = build_vintage(year, items, None, wb_int, weo.get("debt") if weo else None, ctx, govs, today, last_auction,
                          rpi.last_known, general=general, coverage_allowed=False, country_derived=True)
        v["country"] = "GB"
        v["scope_note"] = SCOPE_NOTE
        if items:
            n8 = sum(1 for i in items if i["instrument"] == "IL Gilt (8M)")
            v["uncovered"] = {"linker8": n8, "linker8_nominal": r1(sum(i["allotted"] for i in items if i["instrument"] == "IL Gilt (8M)"))}
        # Angebrochenes Startjahr: Die Datenreihe beginnt erst im Laufe des Jahres; die Kennzahlen beruhen dann auf wenigen,
        # nicht repräsentativen Emissionen (z. B. nur lange Anleihen) und werden als solche gekennzeichnet.
        if v["totals"] and year == data_start.year and data_start > dt.date(year, 2, 1):
            v["totals"]["incomplete_start"] = iso(data_start)
        dump(SITE / "gb" / "years" / f"{year}.json", v)
        summary.append({k: v[k] for k in ("year", "status", "totals", "paid", "split", "coverage", "context", "aggregate", "general_gov")}
                       | {"govs": [g["id"] for g in v["governments"]]})

    dump(SITE / "gb" / "summary.json", {
        "country": "GB", "first_year": FIRST_YEAR, "last_year": today.year, "years": summary,
        "last_auction": iso(last_auction), "ilb_last_official": iso(rpi.last_known),
        "scenarios": bonds.SCENARIOS, "scope": context["scope"], "scope_en": context.get("scope_en"),
    })
    pol = political_context(all_issues, govs, last_auction)
    tot = defaultdict(lambda: defaultdict(float))
    for i in all_issues:
        if "cost" in i and i["gov"]:
            t = tot[i["gov"]]
            for k in ("allotted", "proceeds", "cost", "cost_low", "cost_high", "cost_fixed"):
                t[k] += i[k]
            t["n"] += 1
            y = int(i["date"][:4])
            t["first"] = min(t.get("first", y), y)
            t["last"] = max(t.get("last", y), y)
    gov_out = []
    for gv in govs:
        t = tot.get(gv["id"])
        e = gv | {"context": pol.get(gv["id"])}
        if t:
            e |= {k: (int(v) if k in ("n", "first", "last") else r1(v)) for k, v in t.items()}
        gov_out.append(e)
    from .build import NOTES_EN
    dump(SITE / "gb" / "governments.json", {"last_year": today.year, "note": gov_note, "note_en": NOTES_EN.get("gb_governments.json"),
                                          "governments": gov_out, "finance_ministers": fms, "data_from": DATA_FROM,
                                          "gov_label": "Britische Regierung (Premierminister)", "currency": "GBP"})

    # CSV: Einzelemissionen und abgeleitete Stammdaten
    cols = ["date", "settle", "isin", "instrument", "method", "coupon", "maturity", "allotted", "paof", "cash_pub", "price_pub",
            "price", "price_source", "yield_pub", "yield_calc", "proceeds", "accrued", "redemption", "cost", "cost_low",
            "cost_high", "cost_fixed", "status", "gov", "fm", "source", "row"]
    out = ROOT / "data" / "processed" / "gb_gilts.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for i in all_issues:
            w.writerow(i)
    (SITE / "gb" / "gb_gilts.csv").write_bytes(out.read_bytes())
    lcols = ["key", "kind", "n", "first_date", "maturity", "new_in_data", "interest_start", "long_first", "first_coupon_basis",
             "n_fit", "fit_median", "fit_max", "runner_up", "runner_up_median", "base_ref_rpi", "base_source"]
    with open(SITE / "gb" / "gb_gilt_lines.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=lcols, extrasaction="ignore")
        w.writeheader()
        for k in sorted(lines, key=lambda k: (lines[k].get("maturity") or dt.date(1900, 1, 1), k)):
            w.writerow({kk: (vv.isoformat() if isinstance(vv, dt.date) else (round(vv, 6) if isinstance(vv, float) else vv))
                        for kk, vv in lines[k].items()})
    return {"issues": len(all_issues), "last_auction": iso(last_auction)}
