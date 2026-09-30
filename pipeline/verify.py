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


def load_issues():
    out = []
    for p in sorted((SITE / "de" / "years").glob("*.json")):
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
    return 1 if identity["failures"] else 0


if __name__ == "__main__":
    sys.exit(main())
