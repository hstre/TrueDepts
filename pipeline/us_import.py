"""Import der US-Treasury-Auktionen (FiscalData) und Berechnung der Einzelemissionen.

Abgrenzung: Zentralregierung (U.S. Treasury), nur marktfähige Wertpapiere aus Auktionen
(Bills, Notes, Bonds, TIPS, FRN). Nicht enthalten: nicht marktfähige Schulden (u. a. Intragovernmental
Holdings der Sozialversicherungsfonds, Sparbriefe) und Schulden der Bundesstaaten/Kommunen.
"""
from __future__ import annotations

import bisect
import datetime as dt
import json
from collections import defaultdict
from pathlib import Path

from . import bonds

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "us"
TIPS_OFFICIAL_FROM = dt.date(2008, 5, 1)

INSTRUMENT_LABEL = {
    "Bill": "Treasury Bill", "CMB": "Cash Management Bill", "Note": "Treasury Note", "Bond": "Treasury Bond",
    "TIPS": "Treasury Inflation-Protected Security (TIPS)", "FRN": "Floating Rate Note (FRN)",
}


def _num(v):
    return None if v in (None, "null", "") else float(v)


def _date(v):
    return None if v in (None, "null", "") else dt.date.fromisoformat(v)


def load_raw():
    return json.loads((RAW / "fiscaldata_auctions.json").read_text(encoding="utf-8"))["data"]


def normalize(rows, until: dt.date):
    out = []
    for n, r in enumerate(rows):
        issue = _date(r["issue_date"])
        acc = _num(r["total_accepted"])
        if issue is None or acc is None or issue > until:
            continue
        typ = r["security_type"]
        if r["inflation_index_security"] == "Yes":
            inst, kind = "TIPS", "inflation_linked"
        elif r["floating_rate"] == "Yes":
            inst, kind = "FRN", "frn"
        elif typ == "Bill":
            inst, kind = ("CMB" if r["cash_management_bill_cmb"] == "Yes" else "Bill"), "zero"
        else:
            inst, kind = typ, "fixed"
        out.append({
            "source_row": n + 1, "date": _date(r["auction_date"]), "settle": issue, "isin": r["cusip"],
            "instrument": inst, "kind": kind, "term": r["security_term"],
            "coupon": (_num(r["int_rate"]) or 0.0) / 100 if kind != "frn" else 0.0,
            "spread": (_num(r["spread"]) or 0.0) / 100 if kind == "frn" else None,
            "maturity": _date(r["maturity_date"]),
            "interest_start": _date(r["dated_date"]) or issue,
            "long_first": r["first_int_period"] == "Long",
            "first_pay": _date(r["first_int_payment_date"]),
            "allotted": acc / 1e6, "soma": (_num(r["soma_accepted"]) or 0.0) / 1e6, "retained": 0.0,
            "issue_volume": acc / 1e6,
            "price_pub": _num(r["price_per100"]), "accrued_per100": _num(r["accrued_int_per100"]),
            "yield_pub": _num(r["high_yield"]) if kind != "zero" else _num(r["high_investment_rate"]),
            "discount_rate": _num(r["high_discnt_rate"]),
            "index_ratio_issue": _num(r["index_ratio_on_issue_date"]),
            "ref_cpi_dated": _num(r["ref_cpi_on_dated_date"]), "ref_cpi_issue": _num(r["ref_cpi_on_issue_date"]),
            "new_issue": r["reopening"] != "Yes", "method": "Auktion",
            "currency": "USD",
        })
    return out


# ---------------------------------------------------------------------------
# Referenz-CPI für TIPS
# ---------------------------------------------------------------------------


class RefCPI:
    """Täglicher Referenz-CPI: amtlich ab 2008-05-01, davor lineare Interpolation zwischen amtlichen
    Referenz-CPI-Werten, die in den Auktionsdaten zu Emissions- und Zinslaufbeginn-Tagen stehen."""

    def __init__(self, auctions):
        rows = json.loads((RAW / "fiscaldata_tips_refcpi.json").read_text(encoding="utf-8"))["data"]
        self.official = {dt.date.fromisoformat(r["index_date"]): float(r["ref_cpi"]) for r in rows}
        self.last = max(self.official)
        anchors = {}
        for a in auctions:
            if a["kind"] != "inflation_linked":
                continue
            if a["ref_cpi_dated"]:
                anchors[a["interest_start"]] = a["ref_cpi_dated"]
            if a["ref_cpi_issue"]:
                anchors[a["settle"]] = a["ref_cpi_issue"]
        first = min(self.official)
        anchors[first] = self.official[first]
        self.anchor_dates = sorted(d for d in anchors if d <= first)
        self.anchors = anchors

    def value(self, d: dt.date):
        """(Wert, Status) mit Status official | interp | None (nach letztem amtlichen Tag)."""
        if d in self.official:
            return self.official[d], "official"
        if d > self.last:
            return None, None
        if d in self.anchors:
            return self.anchors[d], "official"
        ds = self.anchor_dates
        i = bisect.bisect_right(ds, d)
        if i == 0:
            return self.anchors[ds[0]], "interp"
        if i >= len(ds):
            earlier = max(k for k in self.official if k <= d)
            return self.official[earlier], "official"
        d0, d1 = ds[i - 1], ds[i]
        v0, v1 = self.anchors[d0], self.anchors[d1]
        return v0 + (v1 - v0) * (d - d0).days / (d1 - d0).days, "interp"


def tips_ratio(a, refcpi: RefCPI, dates):
    """IndexRatio für eine TIPS-Emission; markiert, ob interpolierte Werte verwendet wurden."""
    base = a["ref_cpi_dated"]
    official, interp = {}, False
    for d in dates:
        v, st = refcpi.value(d)
        if v is None:
            continue
        official[d] = round(v / base, 5)
        interp |= st == "interp"
    # Ausgangspunkt der Projektion: letzter amtlicher Tag
    official[refcpi.last] = round(refcpi.official[refcpi.last] / base, 5)
    if a["index_ratio_issue"]:
        official[a["settle"]] = a["index_ratio_issue"]
    return bonds.IndexRatio(official), interp


# ---------------------------------------------------------------------------
# FRN-Index (13-Wochen-Bill)
# ---------------------------------------------------------------------------


def us_holidays(y):
    """Bundesfeiertage (Bond-Markt geschlossen) inkl. Good Friday – Näherung der „U.S. Government Securities Business Days“."""
    def nth(month, weekday, n):
        d = dt.date(y, month, 1)
        d += dt.timedelta((weekday - d.weekday()) % 7)
        return d + dt.timedelta(7 * (n - 1))

    def last(month, weekday):
        d = dt.date(y, month + 1, 1) - dt.timedelta(1)
        return d - dt.timedelta((d.weekday() - weekday) % 7)

    def observed(d):
        return d - dt.timedelta(1) if d.weekday() == 5 else d + dt.timedelta(1) if d.weekday() == 6 else d

    h = {observed(dt.date(y, 1, 1)), nth(1, 0, 3), nth(2, 0, 3), last(5, 0), observed(dt.date(y, 7, 4)), nth(9, 0, 1),
         nth(10, 0, 2), observed(dt.date(y, 11, 11)), nth(11, 3, 4), observed(dt.date(y, 12, 25)),
         bonds.easter_sunday(y) - dt.timedelta(2)}
    if y >= 2022:
        h.add(observed(dt.date(y, 6, 19)))
    return h


def us_bday_before(d, n):
    """n Geschäftstage vor d."""
    while n:
        d -= dt.timedelta(1)
        if d.weekday() < 5 and d not in us_holidays(d.year):
            n -= 1
    return d


def frn_lockout(pay):
    """Beginn der Sperrfrist: zwei Geschäftstage vor dem Zinstermin (Treasury FRN)."""
    return us_bday_before(pay, 2)


class BillIndex:
    """Indexsatz der FRN: High Rate der jeweils letzten 13-Wochen-Bill-Auktion als Geldmarktrendite (act/360, mit der
    tatsächlichen Laufzeit der Bill). Ein neuer Satz gilt ab dem Kalendertag nach dem Auktionstag."""

    def __init__(self, auctions):
        pts = {}
        for a in auctions:
            if a["instrument"] == "Bill" and a["term"] in ("13-Week", "91-Day", "3-Month") and a["discount_rate"] is not None:
                d = a["discount_rate"] / 100
                days = (a["maturity"] - a["settle"]).days if a["maturity"] and a["settle"] else 91
                pts[a["date"]] = 360 * d / (360 - days * d)
        self.dates = sorted(pts)
        self.rates = [pts[d] for d in self.dates]
        # Der letzte bekannte Satz gilt bis einschließlich zum Tag der nächsten (noch nicht bekannten) Auktion,
        # in der Regel eine Woche später.
        self.last = self.dates[-1] + dt.timedelta(days=7)

    def __call__(self, d: dt.date) -> float:
        i = bisect.bisect_left(self.dates, d) - 1  # nur Auktionen vor dem Tag d gelten
        return self.rates[max(i, 0)]


# ---------------------------------------------------------------------------
# Rechnen
# ---------------------------------------------------------------------------


def compute(a, refcpi: RefCPI, bill_index: BillIndex):
    """Gibt (Result, Status, Hinweis, nachgerechnete Rendite, verwendeter Kurs, Kursquelle) zurück."""
    n, kind = a["allotted"], a["kind"]
    note = None
    if kind == "zero":
        if a["price_pub"] is not None:
            price, src = a["price_pub"], "veröffentlicht"
        elif a["discount_rate"] is not None:
            # Treasury rundet den Kurs auf drei Nachkommastellen
            price = round(bonds.bill_price_from_discount(a["discount_rate"] / 100, a["settle"], a["maturity"]), 3)
            src = "aus Diskontsatz"
        else:
            return None, "none", "Weder Kurs noch Diskontsatz veröffentlicht.", None, None, None
        res = bonds.zero_coupon(n, price, a["settle"], a["maturity"])
        y = bonds.bill_bond_equivalent_yield(price, a["settle"], a["maturity"]) * 100
        return res, "calc", note, y, price, src
    if kind == "fixed":
        price, src = a["price_pub"], "veröffentlicht"
        if price is None:
            if a["yield_pub"] is None:
                return None, "none", "Weder Kurs noch Rendite veröffentlicht.", None, None, None
            price = bonds.price_from_yield(a["coupon"], a["yield_pub"] / 100, a["settle"], a["maturity"], a["interest_start"],
                                           2, a["long_first"], True)
            src = "aus veröffentlichter Rendite berechnet"
            note = "Für diese ältere Auktion ist kein Kurs veröffentlicht; er wurde aus der veröffentlichten Rendite berechnet."
        res = bonds.fixed_rate(n, a["coupon"], price, a["settle"], a["maturity"], a["interest_start"], freq=2,
                               long_first=a["long_first"], eom=True, accrued_per100=a["accrued_per100"])
        y = bonds.isma_yield(a["coupon"], price, a["settle"], a["maturity"], a["interest_start"], 2, a["long_first"], True) * 100
        return res, "calc", note, y, price, src
    if kind == "inflation_linked":
        if not a["ref_cpi_dated"] or a["price_pub"] is None:
            return None, "none", "Referenz-CPI oder Kurs fehlt.", None, None, None
        sch = bonds.Schedule(a["maturity"], a["interest_start"], 2, a["long_first"], True)
        dates = [a["settle"], a["maturity"]] + [sch.grid[j] for j, _ in sch.payments]
        ratio, interp = tips_ratio(a, refcpi, dates)
        # Veröffentlichter TIPS-Kurs ist bereits mit der Index-Verhältniszahl des Emissionstags multipliziert
        real_price = a["price_pub"] / (a["index_ratio_issue"] or 1.0)
        res = bonds.inflation_linked(n, a["coupon"], real_price, a["settle"], a["maturity"], a["interest_start"], ratio,
                                     long_first=a["long_first"], freq=2, eom=True, accrued_real_per100=a["accrued_per100"])
        y = bonds.isma_yield(a["coupon"], real_price, a["settle"], a["maturity"], a["interest_start"], 2, a["long_first"], True) * 100
        future = not all(f.fixed for f in res.flows)
        if interp:
            status, note = "model", ("Index-Verhältniszahlen vor Mai 2008 durch Interpolation zwischen amtlichen Referenz-CPI-Werten "
                                     "der Emissionstage ermittelt (modelliert).")
        elif future:
            status, note = "proj", "Künftige Kupons und Inflationsausgleich hängen von der Inflation ab (Projektion 0 %/2 %/4 % p. a.)."
        else:
            status = "calc"
        return res, status, note, y, real_price, "veröffentlicht (durch Index-Verhältniszahl geteilt)"
    if kind == "frn":
        if a["price_pub"] is None:
            return None, "none", "Kein Kurs veröffentlicht.", None, None, None
        res = bonds.floating_rate(n, a["spread"], a["price_pub"], a["settle"], a["maturity"], a["interest_start"],
                                  bill_index, bill_index.last, accrued_per100=a["accrued_per100"], lockout=frn_lockout)
        future = not all(f.fixed for f in res.flows)
        note = ("Kupon = High Rate der 13-Wochen-Bill (aus den Auktionsdaten, gültig ab dem Folgetag der Auktion) + fester Aufschlag, "
                "täglich act/360 mit Mindestzins null; Sperrfrist zwei Geschäftstage vor jedem Zinstermin. "
                + ("Künftiger Indexsatz: letzter Wert ±2 %-Punkte (Projektion)." if future else ""))
        return res, ("proj" if future else "calc"), note, None, a["price_pub"], "veröffentlicht"
    return None, "none", "Unbekannte Wertpapierart.", None, None, None


def load_interest_expense():
    """Kalenderjahressummen (Mio. USD): Zinsaufwand auf marktfähige und nicht marktfähige öffentliche Schulden
    ("public issues", periodengerecht inkl. Agio-/Disagio-Amortisation) und auf intragouvernementale Schulden."""
    rows = json.loads((RAW / "fiscaldata_interest_expense.json").read_text(encoding="utf-8"))["data"]
    out = defaultdict(lambda: {"public": 0.0, "intragov": 0.0, "months": set()})
    for r in rows:
        y = int(r["record_calendar_year"])
        amt = float(r["month_expense_amt"]) / 1e6
        e = out[y]
        e["months"].add(r["record_calendar_month"])
        if r["expense_catg_desc"].startswith("INTEREST EXPENSE ON PUBLIC ISSUES"):
            e["public"] += amt
        elif r["expense_group_desc"] != "ACCRUAL BASIS GAS EXPENSE":
            e["intragov"] += amt
    return {y: {"public": round(e["public"], 1), "intragov": round(e["intragov"], 1),
                "complete_year": len(e["months"]) == 12, "months": len(e["months"])} for y, e in out.items()}
