"""Erzeugt die Website-Daten für die Vereinigten Staaten (site/data/us/).

Gleiches Schema wie Deutschland (site/data/de/), damit die Oberfläche beide Länder gleich darstellt.
"""
from __future__ import annotations

import datetime as dt
import json
from collections import defaultdict

from . import bonds, us_import
from .build import (CALC, META, MODEL, NONE, OFFICIAL, ROOT, SITE, build_vintage, comparison_metrics, dump, gov_for,
                    governments_from, iso, political_context, r1, r2)

FIRST_YEAR = 1945


def record(a, res, status, note, y_calc, price, price_src, govs):
    gv = gov_for(a["date"], govs)
    rec = {
        "date": iso(a["date"]), "settle": iso(a["settle"]), "isin": a["isin"], "instrument": a["instrument"],
        "kind": a["kind"], "coupon": a["coupon"], "spread": a["spread"], "maturity": iso(a["maturity"]), "method": a["method"],
        "term": a["term"], "new": a["new_issue"], "issue_volume": r2(a["issue_volume"]), "allotted": r2(a["allotted"]),
        "retained": 0.0, "soma": r2(a["soma"]), "price": round(price, 6) if price is not None else None, "price_source": price_src,
        "yield_pub": a["yield_pub"], "yield_calc": round(y_calc, 4) if y_calc is not None else None,
        "interest_start": iso(a["interest_start"]), "interest_start_source": "FiscalData (dated date)",
        "settle_rule": "Issue Date laut FiscalData", "status": status, "note": note,
        "first_coupon": "lang" if a["long_first"] else "kurz/regulär",
        "first_coupon_basis": "FiscalData (first interest period)" if a["kind"] not in ("zero",) else None,
        "gov": gv["id"] if gv else None, "fm": None, "row": a["source_row"],
    }
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


def build_us(today: dt.date, intl: dict):
    rows = us_import.normalize(us_import.load_raw(), today)
    refcpi = us_import.RefCPI(rows)
    bill_index = us_import.BillIndex(rows)
    govs, fms, gov_note = governments_from("us_governments.json")
    context = json.loads((META / "us_context.json").read_text(encoding="utf-8"))
    interest = us_import.load_interest_expense()

    issues_by_year = defaultdict(list)
    for a in sorted(rows, key=lambda x: (x["date"], x["isin"])):
        res, status, note, y_calc, price, src = us_import.compute(a, refcpi, bill_index)
        issues_by_year[a["settle"].year].append(record(a, res, status, note, y_calc, price, src, govs))
    all_issues = [i for y in sorted(issues_by_year) for i in issues_by_year[y]]
    last_auction = max(a["date"] for a in rows)

    # Jahressummen aus den Auktionsdaten: Brutto = zugeteilt, Tilgungen = Fälligkeiten erfasster Emissionen
    gross = defaultdict(float)
    red = defaultdict(float)
    for i in all_issues:
        if "cost" not in i:
            continue
        gross[int(i["settle"][:4])] += i["allotted"]
        red[int(i["maturity"][:4])] += i["redemption"]
    reps = {}
    for y in gross:
        rep = {"gross_borrowing": round(gross[y], 1), "redemptions": round(red.get(y, 0.0), 1),
               "as_of": f"{y}-12-31", "complete_year": y < today.year, "source": "auctions",
               "redemptions_incomplete": y < 2010}
        if y in interest:
            e = interest[y]
            rep.update({"interest_cash": e["public"], "interest_total": round(e["public"] + e["intragov"], 1),
                        "interest_complete": e["complete_year"]})
            if not e["complete_year"]:
                rep["as_of"] = f"{y} ({e['months']} Monate)"
        reps[y] = rep

    summary = []
    for year in range(FIRST_YEAR, today.year + 1):
        items = issues_by_year.get(year, [])
        ctx = next((p for p in context["periods"] if p["from"] <= year <= p["to"]), None)
        rep = reps.get(year)
        wb_int = intl["US"]["wb_interest"].get(str(year))
        weo = intl["US"]["weo"].get(str(year))
        general = {"weo": weo} if weo else None
        v = build_vintage(year, items, rep, wb_int, weo.get("debt") if weo else None, ctx, govs, today, last_auction,
                          refcpi.last, general=general, coverage_allowed=False)
        v["country"] = "US"
        # Tatsächlich gezahlte Zinsen: FiscalData (periodengerecht) statt Kassenwerte
        if rep and rep.get("interest_cash") is not None:
            v["paid"] = {"status": OFFICIAL, "cash": rep["interest_cash"], "total": rep["interest_total"],
                         "as_of": rep["as_of"], "complete_year": rep.get("interest_complete", True),
                         "labels": {"cash": "Zinsaufwand auf öffentlich gehaltene Schulden (periodengerecht, FiscalData)",
                                    "total": "einschließlich Zinsen auf intragouvernementale Schulden"}}
            if wb_int is not None:
                v["paid"]["wb"] = wb_int
        if v["split"]:
            v["split"]["source"] = "auctions"
            v["split"]["scope"] = ("aus den Auktionsdaten summiert; Tilgungen = Fälligkeiten erfasster Emissionen"
                                   + (" (unvollständig: vor 1979 begebene Papiere fehlen)" if rep.get("redemptions_incomplete") else ""))
        v["scope_note"] = ("Erfasst sind alle marktfähigen Treasury-Wertpapiere aus Auktionen. Nicht enthalten: nicht marktfähige "
                           "Schulden (Treuhandfonds der Sozialversicherung, Sparbriefe) sowie Bundesstaaten und Kommunen.")
        dump(SITE / "us" / "years" / f"{year}.json", v)
        summary.append({k: v[k] for k in ("year", "status", "totals", "paid", "split", "coverage", "context", "aggregate", "general_gov")}
                       | {"govs": [g["id"] for g in v["governments"]]})

    dump(SITE / "us" / "summary.json", {
        "country": "US", "first_year": FIRST_YEAR, "last_year": today.year, "years": summary,
        "last_auction": iso(last_auction), "ilb_last_official": iso(refcpi.last),
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
    dump(SITE / "us" / "governments.json", {"last_year": today.year, "note": gov_note, "note_en": NOTES_EN.get("us_governments.json"), "governments": gov_out,
                                          "finance_ministers": fms, "data_from": 1979, "gov_label": "US-Regierung (Präsidentschaft)",
                                          "currency": "USD"})
    # CSV der normalisierten Einzelemissionen
    import csv
    cols = ["date", "settle", "isin", "instrument", "term", "kind", "coupon", "spread", "maturity", "new", "allotted", "soma",
            "price", "price_source", "yield_pub", "yield_calc", "interest_start", "proceeds", "accrued", "redemption",
            "cost", "cost_low", "cost_high", "cost_fixed", "status", "gov", "row"]
    out = ROOT / "data" / "processed" / "us_auctions.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for i in all_issues:
            w.writerow(i)
    (SITE / "us" / "us_auctions.csv").write_bytes(out.read_bytes())
    return {"issues": len(all_issues), "last_auction": iso(last_auction)}
