"""Prüft die berechneten Zahlungsströme gegen die Emissionsdaten.

Aufruf: python -m pipeline.verify   (nach pipeline.build)

Prüfungen
 1. Rendite-Nachrechnung: Aus Kurs, Kupon, Valuta und Kuponkalender wird die Rendite
    nachgerechnet und mit der von der Finanzagentur veröffentlichten Durchschnittsrendite
    verglichen. Stimmen Kalender, Stückzinsen und Valuta, liegt die Abweichung innerhalb der
    Rundung der Veröffentlichung.
 2. Kostenidentität: Summe der Kostenkomponenten = Summe aller Auszahlungen − Emissionserlös.
 3. Volumenabgleich: Emissionsvolumen (inkl. Eigenbestand) je ISIN kumuliert bis Jahresende
    = amtlicher Umlauf laut Einzelaufstellung (nur ISINs, deren gesamte Emission in der
    Historie liegt).
 4. Volumenkonsistenz je Emission: Emissionsvolumen = Zuteilung + Marktpflegequote.
 5. Abdeckung: zugeteiltes Volumen im Verhältnis zur amtlichen Bruttokreditaufnahme.

Ergebnis: site/data/de/verification.json und Ausgabe auf der Konsole.
Exit-Code 1, wenn eine harte Prüfung (Kostenidentität) fehlschlägt.
"""
from __future__ import annotations

import datetime as dt
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

from .de_import import load_auctions, load_debt_report, load_securities

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site" / "data"


def load_issues(cc="de"):
    out = []
    for p in sorted((SITE / cc / "years").glob("*.json")):
        out.extend(json.loads(p.read_text(encoding="utf-8"))["issues"])
    return out


def check_yields(issues):
    groups = defaultdict(list)
    worst = []
    for i in issues:
        if i.get("yield_calc") is None or i.get("yield_pub") is None:
            continue
        diff = i["yield_calc"] - i["yield_pub"]
        key = "Bubill" if i["kind"] == "zero" else ("ILB (real)" if i["kind"] == "inflation_linked" else
                                                    ("USD" if i["kind"] == "fixed_fx" else "Kuponanleihen"))
        groups[key].append(abs(diff))
        worst.append((abs(diff), i))
    tol = {"Kuponanleihen": 0.0051, "ILB (real)": 0.0051, "Bubill": 0.0051, "USD": 0.0051}
    summary = {}
    for k, v in groups.items():
        within = sum(1 for x in v if x <= tol[k])
        summary[k] = {
            "n": len(v), "within_rounding": within, "share": round(within / len(v), 4),
            "median_abs_diff": round(statistics.median(v), 4), "max_abs_diff": round(max(v), 4),
            "tolerance_pp": tol[k],
        }
    worst.sort(key=lambda x: -x[0])
    outliers = [{"date": i["date"], "isin": i["isin"], "instrument": i["instrument"], "method": i["method"],
                 "yield_pub": i["yield_pub"], "yield_calc": i["yield_calc"], "diff": round(d, 4),
                 "settle_rule": i["settle_rule"]} for d, i in worst[:25] if d > 0.0051]
    return summary, outliers


def check_identity(issues):
    failures = []
    n = 0
    for i in issues:
        if "cost" not in i:
            continue
        n += 1
        comp = sum(i["components"].values())
        cash_out = sum(v for _, kind, v in i["cash"] if kind != "Emissionserlös")
        proceeds = -sum(v for _, kind, v in i["cash"] if kind == "Emissionserlös")
        flows = sum(v[0] + v[2] for v in i["flows"].values())
        tol = 0.006 * (len(i["flows"]) + len(i["cash"]) + 2)  # Rundung auf 0,01 Mio. je gespeichertem Wert
        if abs(comp - i["cost"]) > tol or abs(cash_out - proceeds - i["cost"]) > tol * 3 or abs(flows - i["cost"]) > tol * 3:
            failures.append({"date": i["date"], "isin": i["isin"], "cost": i["cost"], "components": round(comp, 2),
                             "cash": round(cash_out - proceeds, 2), "flows": round(flows, 2)})
    return {"n": n, "failures": len(failures), "examples": failures[:10]}


def check_volumes(auctions, securities):
    first_n = {}
    for a in sorted(auctions, key=lambda x: x["date"]):
        first_n.setdefault(a["isin"], a)
    total = match = 0
    mismatches = []
    for isin, first in first_n.items():
        if not first["new_issue"] or first["kind"] == "zero":
            continue  # Wertpapier vor 1999 begonnen oder Bubill (unterjährige Fälligkeit)
        sec = securities.get(isin)
        if not sec or not sec["outstanding"]:
            continue
        rows = [a for a in auctions if a["isin"] == isin]
        for d, outstanding in sorted(sec["outstanding"].items()):
            if sec["maturity"] and d >= sec["maturity"]:
                continue
            cum = sum(a["issue_volume"] for a in rows if a["date"] <= d)
            if cum == 0 and outstanding == 0:
                continue
            total += 1
            if abs(cum - outstanding) <= 1.0:
                match += 1
            else:
                mismatches.append({"isin": isin, "date": d.isoformat(), "emissions_cum": round(cum, 1),
                                   "outstanding": round(outstanding, 1), "diff": round(cum - outstanding, 1)})
    mismatches.sort(key=lambda m: -abs(m["diff"]))
    return {"n": total, "match": match, "share": round(match / total, 4) if total else None,
            "largest_differences": mismatches[:20]}


def check_row_volumes(auctions):
    bad = [a for a in auctions if a["method"] != "EB" and abs(a["issue_volume"] - a["allotted"] - a["retained"]) > 1.0]
    return {"n": len(auctions), "inconsistent": len(bad),
            "examples": [{"date": a["date"].isoformat(), "isin": a["isin"], "issue_volume": a["issue_volume"],
                          "allotted": a["allotted"], "retained": a["retained"]} for a in bad[:15]]}


def check_coverage(issues, report):
    by_year = defaultdict(float)
    for i in issues:
        if "cost" in i:
            by_year[int(i["settle"][:4])] += i["allotted"]
    out = {}
    for y in sorted(by_year):
        rep = report.get(y)
        if rep and rep.get("gross_borrowing"):
            out[y] = {"allotted": round(by_year[y], 1), "gross_official": rep["gross_borrowing"],
                      "share": round(by_year[y] / rep["gross_borrowing"], 4), "complete_year": rep["complete_year"]}
    return out


def check_split_window(cc, issues):
    """Brutto und Tilgungen der Aufteilung müssen denselben Zeitraum abdecken: Tilgungen werden nur bis zum Stichtag
    (as_of) gezählt, Emissionen nur mit Valuta bis zum Stichtag. Prüft das für jedes Jahr mit Aufteilung aus Auktionsdaten."""
    failures = []
    n = 0
    for p in sorted((SITE / cc / "years").glob("*.json")):
        v = json.loads(p.read_text(encoding="utf-8"))
        sp = v.get("split")
        if not sp or sp.get("source") != "auctions":
            continue
        n += 1
        y = v["year"]
        cut = sp["as_of"]
        gross = sum(i["allotted"] for i in issues if "cost" in i and i["settle"][:4] == str(y) and i["settle"] <= cut)
        red = sum(i["redemption"] for i in issues if "cost" in i and i["maturity"][:4] == str(y) and i["maturity"] <= cut)
        if abs(gross - sp["gross"]) > 1.0 or abs(red - sp["redemptions"]) > 1.0:
            failures.append({"year": y, "as_of": cut, "gross": sp["gross"], "gross_check": round(gross, 1),
                             "redemptions": sp["redemptions"], "redemptions_check": round(red, 1)})
    return {"n": n, "failures": failures}


def check_us():
    """USA: Rendite-Nachrechnung und Kostenidentität."""
    issues = load_issues("us")
    groups = defaultdict(list)
    worst = []
    for i in issues:
        if i.get("yield_calc") is None or i.get("yield_pub") is None:
            continue
        derived = i.get("price_source") in ("aus veröffentlichter Rendite berechnet",)
        if derived:
            continue  # Kurs wurde aus der Rendite berechnet – Nachrechnung wäre zirkulär
        # Ältere Bills: Rendite nur zweistellig veröffentlicht
        tol = 0.0051 if i.get("price_source") == "aus Diskontsatz" else 0.0015
        key = f"{i['instrument']} ({'Kurs aus Diskontsatz' if i.get('price_source') == 'aus Diskontsatz' else 'Kurs veröffentlicht'})"
        d = abs(i["yield_calc"] - i["yield_pub"])
        groups[key].append((d, tol))
        worst.append((d - tol, d, i))
    summary = {k: {"n": len(v), "within_rounding": sum(d <= t for d, t in v), "share": round(sum(d <= t for d, t in v) / len(v), 4),
                   "median_abs_diff": round(statistics.median(d for d, _ in v), 4), "max_abs_diff": round(max(d for d, _ in v), 4),
                   "tolerance_pp": v[0][1]} for k, v in groups.items()}
    worst.sort(key=lambda x: -x[0])
    outliers = [{"date": i["date"], "isin": i["isin"], "instrument": f"{i['instrument']} {i.get('term') or ''}", "method": i["method"],
                 "yield_pub": i["yield_pub"], "yield_calc": i["yield_calc"], "diff": round(d, 4), "settle_rule": i.get("price_source")}
                for over, d, i in worst[:25] if over > 0]
    identity = check_identity(issues)
    window = check_split_window("us", issues)
    status = defaultdict(int)
    for i in issues:
        status[i["status"]] += 1
    derived = sum(1 for i in issues if i.get("price_source") == "aus veröffentlichter Rendite berechnet")
    result = {"checked": dt.date.today().isoformat(), "yields": summary, "yield_outliers": outliers, "identity": identity,
              "status_counts": dict(status), "price_from_yield": derived, "n": len(issues), "split_window": window}
    (SITE / "us" / "verification.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print("USA – Rendite-Nachrechnung:")
    for k, v in summary.items():
        print(f"   {k:40s} n={v['n']:5d}  innerhalb ±{v['tolerance_pp']}: {v['share']:.1%}  Max {v['max_abs_diff']:.4f}")
    print(f"USA – Kostenidentität: {identity['n']} Emissionen, {identity['failures']} Abweichungen")
    print(f"USA – Zeitraum Brutto/Tilgungen: {window['n']} Jahre geprüft, {len(window['failures'])} Abweichungen"
          + (f" {window['failures']}" if window["failures"] else ""))
    return identity["failures"] + len(window["failures"])


def check_gb():
    """Vereinigtes Königreich: Anpassungsgüte der Renditen, Erlösabgleich der Linker, Kostenidentität,
    Summenabgleich mit dem DMO Annual Review 2025–26."""
    issues = load_issues("gb")
    groups = defaultdict(list)
    worst = []
    for i in issues:
        if i.get("yield_calc") is None or i.get("yield_pub") is None:
            continue
        d = abs(i["yield_calc"] - i["yield_pub"])
        pre = i["date"] < "1998-11-01"
        key = ("Index-linked (real)" if i["kind"] == "inflation_linked" else "Conventional") + (" vor Nov. 1998" if pre else "")
        tol = 0.0051 if pre else 0.0005
        groups[key].append((d, tol))
        worst.append((d - tol, d, i))
    summary = {k: {"n": len(v), "within_rounding": sum(d <= t for d, t in v), "share": round(sum(d <= t for d, t in v) / len(v), 4),
                   "median_abs_diff": round(statistics.median(d for d, _ in v), 5), "max_abs_diff": round(max(d for d, _ in v), 5),
                   "tolerance_pp": v[0][1]} for k, v in groups.items()}
    worst.sort(key=lambda x: -x[0])
    outliers = [{"date": i["date"], "isin": i["isin"], "instrument": i["instrument"], "method": i["method"],
                 "yield_pub": i["yield_pub"], "yield_calc": i["yield_calc"], "diff": round(d, 4)} for over, d, i in worst[:25] if over > 0]
    cc = [abs(i["cash_check"]) for i in issues if "cash_check" in i]
    cash = {"n": len(cc), "median_rel": round(statistics.median(cc), 6) if cc else None,
            "within_0_01pct": sum(x <= 1e-4 for x in cc), "within_0_1pct": sum(x <= 1e-3 for x in cc),
            "max_rel": round(max(cc), 5) if cc else None,
            "since_2015_within_0_01pct": sum(abs(i["cash_check"]) <= 1e-4 for i in issues if "cash_check" in i and i["date"] >= "2015"),
            "since_2015_n": sum(1 for i in issues if "cash_check" in i and i["date"] >= "2015")}
    identity = check_identity(issues)
    fy = [i for i in issues if "2025-04-01" <= i["date"] <= "2026-03-31"]
    agg = {"auctions_paof": round(sum(i["cash_pub"] for i in fy if i["method"] in ("AUK", "PAOF")), 1),
           "tenders": round(sum(i["cash_pub"] for i in fy if i["method"] == "TEN"), 1),
           "syndications": round(sum(i["cash_pub"] for i in fy if i["method"] == "SYN"), 1),
           "n_auctions": sum(1 for i in fy if i["method"] in ("AUK", "PAOF")),
           "official": {"auctions_paof": 232388, "tenders": 21165, "syndications": 50392, "n_auctions": 64,
                        "source": "DMO Gilt Annual Review 2025–26, Table 5 und 12"}}
    lines_csv = SITE / "gb" / "gb_gilt_lines.csv"
    import csv
    lines = list(csv.DictReader(open(lines_csv, encoding="utf-8")))
    fitted = [l for l in lines if l["maturity"]]
    single = sum(1 for l in fitted if l["n_fit"] == "1")
    status = defaultdict(int)
    for i in issues:
        status[i["status"]] += 1
    result = {"checked": dt.date.today().isoformat(), "yields": summary, "yield_outliers": outliers, "cash": cash,
              "identity": identity, "fy2025_26": agg, "lines": {"n": len(lines), "fitted": len(fitted), "single_issue": single},
              "status_counts": dict(status), "n": len(issues)}
    (SITE / "gb" / "verification.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print("Vereinigtes Königreich – Anpassung der Renditen (Fälligkeit aus Renditen abgeleitet):")
    for k, v in summary.items():
        print(f"   {k:32s} n={v['n']:5d}  innerhalb ±{v['tolerance_pp']}: {v['share']:.1%}  Max {v['max_abs_diff']:.5f}")
    print(f"   Linker-Erlösabgleich: {cash['within_0_01pct']}/{cash['n']} innerhalb 0,01 %, Median {cash['median_rel']}")
    print(f"   Haushaltsjahr 2025–26: Auktionen+PAOF {agg['auctions_paof']} (amtlich 232388), Tender {agg['tenders']} (21165), "
          f"Syndizierungen {agg['syndications']} (50392)")
    print(f"Vereinigtes Königreich – Kostenidentität: {identity['n']} Emissionen, {identity['failures']} Abweichungen")
    return identity["failures"]


def main():
    issues = load_issues()
    securities = load_securities()
    auctions = load_auctions(securities)
    report = load_debt_report()
    yields, outliers = check_yields(issues)
    identity = check_identity(issues)
    volumes = check_volumes(auctions, securities)
    rows = check_row_volumes(auctions)
    coverage = check_coverage(issues, report)
    result = {"checked": dt.date.today().isoformat(), "yields": yields, "yield_outliers": outliers,
              "identity": identity, "volumes": volumes, "row_volumes": rows, "coverage": coverage}
    (SITE / "de" / "verification.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")

    print("1. Rendite-Nachrechnung (Abweichung zur veröffentlichten Durchschnittsrendite):")
    for k, v in yields.items():
        print(f"   {k:14s} n={v['n']:5d}  innerhalb ±{v['tolerance_pp']} %-Pkt.: {v['share']:.1%}  "
              f"Median {v['median_abs_diff']:.4f}  Max {v['max_abs_diff']:.4f}")
    print(f"2. Kostenidentität: {identity['n']} Emissionen, {identity['failures']} Abweichungen")
    print(f"3. Volumenabgleich mit Umlauf: {volumes['match']}/{volumes['n']} ISIN-Stichtage stimmen (±1 Mio. €)")
    print(f"4. Emissionsvolumen = Zuteilung + Marktpflegequote: {rows['inconsistent']} von {rows['n']} Zeilen weichen ab")
    print("5. Abdeckung der amtlichen Bruttokreditaufnahme durch zugeteilte Emissionen:")
    print("   " + ", ".join(f"{y}: {v['share']:.0%}" for y, v in coverage.items()))
    us_fail = check_us()
    gb_fail = check_gb()
    return 1 if identity["failures"] or us_fail or gb_fail else 0


if __name__ == "__main__":
    sys.exit(main())
