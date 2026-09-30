"""Import der Bundesbank-Zeitreihen (Kapitalmarktstatistik) und aggregiertes Modell für Jahre ohne Einzelemissionen.

Die Bundesbank-Reihen enthalten keine Einzelemissionen. Sie liefern je Monat das begebene Volumen
(Brutto-Absatz, nominal, getrennt nach vereinbarter Laufzeit bis/über 4 Jahre) und die durchschnittliche
Emissionsrendite. Daraus lässt sich die Zinslast eines Jahrgangs nur grob abschätzen – das Ergebnis ist
immer „modelliert“ und wird mit einer Spanne ausgewiesen (siehe docs/METHODE.md, Abschnitt 4.9).
"""
from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "de"
DM_PER_EUR = 1.95583

# Laufzeitannahmen (Jahre) für das Modell: tief / mittel / hoch
TERM_SHORT = (1.0, 2.5, 4.0)    # vereinbarte Laufzeit bis 4 Jahre
TERM_LONG = (6.0, 9.0, 12.0)    # vereinbarte Laufzeit über 4 Jahre


def load_series(name: str) -> tuple[dict[str, float], dict[str, str]]:
    """Monat 'JJJJ-MM' -> Wert; Kopfangaben der Datei."""
    data, meta = {}, {}
    lines = (RAW / f"bundesbank_{name}.csv").read_text(encoding="utf-8-sig").splitlines()
    for i, line in enumerate(lines):
        parts = line.split(";")
        if i == 1:
            meta["title"] = parts[1]
        if re.fullmatch(r"\d{4}-\d{2}", parts[0]):
            v = parts[1].strip().replace(",", ".")
            if v not in ("", ".", "-"):
                data[parts[0]] = float(v)
        elif parts[0] in ("Einheit", "Kommentar", "Stand vom", "Dimension") and len(parts) > 1:
            meta[parts[0]] = parts[1]
        elif parts[0] == '""' and len(parts) > 1 and parts[1].startswith("Bemerkung"):
            meta.setdefault("Bemerkungen", []).append(parts[1])
    return data, meta


def to_eur(value_mio: float, year: int) -> float:
    """Bundesbank-Werte sind bis 1998 in Mio. DM, ab 1999 in Mio. €."""
    return value_mio / DM_PER_EUR if year < 1999 else value_mio


def annual_aggregates(govs=None):
    """Jahreswerte (Mio. €) und modellierte Zinslast je Jahr und – bei Monatsdaten – je Regierung."""
    gross, _ = load_series("gross")
    le4, _ = load_series("gross_le4")
    gt4, _ = load_series("gross_gt4")
    yld, _ = load_series("em_yield")
    outst, _ = load_series("outstanding")
    umr, _ = load_series("umlaufrendite")
    years: dict[int, dict] = defaultdict(lambda: defaultdict(float))
    gov_model: dict[tuple[int, str], list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0])
    for month in sorted(set(gross) | set(le4) | set(gt4)):
        y = int(month[:4])
        e = years[y]
        e["gross"] += to_eur(gross.get(month, 0.0), y)
        s, l = le4.get(month), gt4.get(month)
        if s is not None or l is not None:
            e["gross_le4"] += to_eur(s or 0.0, y)
            e["gross_gt4"] += to_eur(l or 0.0, y)
            r = yld.get(month)
            vol = (s or 0.0) + (l or 0.0)
            if vol > 0:
                if r is None:
                    r = umr.get(month)
                    if r is None:
                        e["volume_without_yield"] += to_eur(vol, y)
                        continue
                    e["volume_fallback_yield"] += to_eur(vol, y)
                e["w_yield"] += r * vol
                e["w_vol"] += vol
                costs = sorted(to_eur((s or 0.0) * ts + (l or 0.0) * tl, y) * r / 100
                               for ts, tl in zip(TERM_SHORT, TERM_LONG))  # bei negativen Renditen gespiegelt
                for k, c in zip(("model_low", "model_mid", "model_high"), costs):
                    e[k] += c
                if govs:
                    gid = gov_id_for_month(month, govs)
                    if gid:
                        acc = gov_model[(y, gid)]
                        for k in range(3):
                            acc[k] += costs[k]
    out = {}
    for y, e in years.items():
        dec = outst.get(f"{y}-12")
        prev = outst.get(f"{y - 1}-12")
        rec = {
            "gross": round(e["gross"], 1),
            "gross_le4": round(e["gross_le4"], 1) if e["gross_le4"] or e["gross_gt4"] else None,
            "gross_gt4": round(e["gross_gt4"], 1) if e["gross_le4"] or e["gross_gt4"] else None,
            "em_yield": round(e["w_yield"] / e["w_vol"], 2) if e["w_vol"] else None,
            "outstanding": round(to_eur(dec, y), 1) if dec is not None else None,
        }
        if e["w_vol"]:
            rec["model"] = {k: round(e[k], 1) for k in ("model_low", "model_mid", "model_high")}
            rec["model"]["volume_without_yield"] = round(e["volume_without_yield"], 1)
            rec["model"]["volume_fallback_yield"] = round(e["volume_fallback_yield"], 1)
        if dec is not None and prev is not None:
            net = to_eur(dec, y) - to_eur(prev, y - 1)
            rec["net_from_outstanding"] = round(net, 1)
        out[y] = rec
    gov = {(y, g): [round(v, 1) for v in vals] for (y, g), vals in gov_model.items()}
    return out, gov


def gov_id_for_month(month: str, govs) -> str | None:
    """Regierung, die am Monatsende im Amt war (Monatsdaten erlauben keine genauere Zuordnung)."""
    y, m = int(month[:4]), int(month[5:7])
    end = f"{y:04d}-{m:02d}-28"
    cur = None
    for g in govs:
        if g["from"] <= end:
            cur = g["id"]
    return cur


def meta_all():
    return {n: load_series(n)[1] for n in ("gross", "gross_le4", "gross_gt4", "em_yield", "outstanding", "umlaufrendite")}


def load_annual(name: str) -> dict[int, float]:
    """Jahreswerte einer Bundesbank-CSV (Zeilen 'JJJJ;Wert;'), z. B. VGR-Zinsausgaben des Staates in Mio. €."""
    out = {}
    for line in (RAW / f"bundesbank_{name}.csv").read_text(encoding="utf-8-sig").splitlines():
        parts = line.split(";")
        if re.fullmatch(r"\d{4}", parts[0]) and parts[1].strip() not in ("", ".", "-"):
            out[int(parts[0])] = float(parts[1].replace(",", "."))
    return out
