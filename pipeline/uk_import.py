"""Import der britischen Gilt-Emissionen (UK Debt Management Office) und Berechnung der Einzelemissionen.

Abgrenzung: Zentralregierung (HM Treasury), Gilts aus Auktionen (einschließlich Post-Auction Option Facility, PAOF),
Tendern und – nur für das Haushaltsjahr 2025–26 – Syndizierungen. Nicht enthalten: Syndizierungen früherer Jahre,
Treasury Bills, National Savings & Investments, Schulden der Kommunen und der Regionalregierungen.
Umtausch- und Konversionsgeschäfte sowie Emissionen direkt an die DMO bringen keine Finanzierungsmittel und
werden nicht gezählt.

Stammdaten: Die DMO-Liste „Gilts in Issue“ mit Fälligkeitstag und Kuponterminen war nicht abrufbar (Captcha).
Der Fälligkeitstag jeder Anleihe wird deshalb aus den veröffentlichten Renditen ihrer Emissionen bestimmt:
Aus Kurs, Kupon und Valuta wird für jeden Kalendertag des Fälligkeitsjahres die Rendite nachgerechnet; gewählt
wird der Tag mit der kleinsten Abweichung über alle Emissionen derselben Anleihe. Die Kupontermine liegen
halbjährlich auf dem Tag und Monat der Fälligkeit (bzw. sechs Monate davor).
"""
from __future__ import annotations

import csv
import datetime as dt
import re
from collections import defaultdict
from pathlib import Path

import xlrd

from . import bonds

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "gb"

INSTRUMENT_LABEL = {
    "Gilt": "Conventional Gilt (festverzinst)",
    "Green Gilt": "Green Gilt (festverzinst)",
    "IL Gilt": "Index-linked Gilt (RPI, 3 Monate Verzögerung)",
    "IL Gilt (8M)": "Index-linked Gilt (RPI, 8 Monate Verzögerung, ältere Bauart)",
}
METHOD_LABEL_GB = {"AUK": "Auktion", "PAOF": "Auktion + PAOF", "TEN": "Tender", "SYN": "Syndizierung"}

FRAC = {"": 0.0, "1/8": .125, "1/4": .25, "3/8": .375, "1/2": .5, "5/8": .625, "3/4": .75, "7/8": .875,
        "⅛": .125, "¼": .25, "⅜": .375, "½": .5, "⅝": .625, "¾": .75, "⅞": .875}


# ---------------------------------------------------------------------------
# Kalender: Bankfeiertage in England und Wales
# ---------------------------------------------------------------------------

_EXTRA = {dt.date(1999, 12, 31), dt.date(2002, 6, 3), dt.date(2011, 4, 29), dt.date(2012, 6, 5),
          dt.date(2022, 6, 3), dt.date(2022, 9, 19), dt.date(2023, 5, 8)}
_MOVED = {1995: (dt.date(1995, 5, 8), None), 2020: (dt.date(2020, 5, 8), None),
          2002: (None, dt.date(2002, 6, 4)), 2012: (None, dt.date(2012, 6, 4)), 2022: (None, dt.date(2022, 6, 2))}
_HOL: dict[int, set] = {}


def _first_monday(y, m):
    d = dt.date(y, m, 1)
    return d + dt.timedelta((7 - d.weekday()) % 7)


def _last_monday(y, m):
    d = dt.date(y, m + 1, 1) - dt.timedelta(1) if m < 12 else dt.date(y, 12, 31)
    return d - dt.timedelta(d.weekday())


def uk_holidays(y):
    if y in _HOL:
        return _HOL[y]
    e = bonds.easter_sunday(y)
    h = {e - dt.timedelta(2), e + dt.timedelta(1)}
    may_early, spring = _MOVED.get(y, (None, None))
    h.add(may_early or _first_monday(y, 5))
    h.add(spring or _last_monday(y, 5))
    h.add(_last_monday(y, 8))
    ny = dt.date(y, 1, 1)
    h.add(ny if ny.weekday() < 5 else ny + dt.timedelta(7 - ny.weekday()))
    xmas, box = dt.date(y, 12, 25), dt.date(y, 12, 26)
    if xmas.weekday() == 5:
        h |= {xmas + dt.timedelta(2), box + dt.timedelta(2)}
    elif xmas.weekday() == 6:
        h |= {box, xmas + dt.timedelta(2)}
    elif box.weekday() == 5:
        h |= {xmas, box + dt.timedelta(2)}
    else:
        h |= {xmas, box}
    h |= {d for d in _EXTRA if d.year == y}
    _HOL[y] = h
    return h


def is_bday(d):
    return d.weekday() < 5 and d not in uk_holidays(d.year)


def add_bdays(d, n):
    step = 1 if n >= 0 else -1
    while n:
        d += dt.timedelta(step)
        if is_bday(d):
            n -= step
    return d


def ex_dividend_date(coupon_date):
    """Ex-Dividenden-Tag: sieben Geschäftstage vor dem Kupontermin (seit 1998)."""
    return add_bdays(coupon_date, -7)


# ---------------------------------------------------------------------------
# Rohdaten
# ---------------------------------------------------------------------------


def _num(v):
    if v in ("", None, "N/A"):
        return None
    return float(str(v).replace(",", ""))


def _xl_date(v, book):
    return dt.date(*xlrd.xldate_as_tuple(v, book.datemode)[:3])


def parse_name(name):
    """'4 7/8% Treasury Gilt 2036' -> (Schlüssel, Kupon als Dezimalzahl, Art, Fälligkeitsjahr, Instrument)."""
    n = " ".join(name.replace("Index-Linked", "Index-linked").split())
    m = re.match(r"(\d*)\s*(1/8|1/4|3/8|1/2|5/8|3/4|7/8|⅛|¼|⅜|½|⅝|¾|⅞)?\s*%\s*(.+?)\s+(\d{4})$", n)
    if not m:
        raise ValueError(f"Gilt-Name nicht lesbar: {name!r}")
    cpn = (int(m.group(1) or 0) + FRAC[m.group(2) or ""]) / 100
    rest, year = m.group(3), int(m.group(4))
    if "Index-linked" in rest:
        kind = "linker8" if "Stock" in rest else "linker3"
        inst = "IL Gilt (8M)" if kind == "linker8" else "IL Gilt"
    else:
        kind, inst = "fixed", ("Green Gilt" if "Green" in rest else "Gilt")
    key = f"{cpn * 100:g}% {rest} {year}"
    return key, cpn, kind, year, inst


def _rows(fname):
    book = xlrd.open_workbook(RAW / fname)
    sh = book.sheet_by_index(0)
    for r in range(sh.nrows):
        row = sh.row_values(r)
        if isinstance(row[0], float):
            yield book, r + 1, row


def load_operations():
    ops = []
    for book, rn, r in _rows("dmo_outright_gilt_auctions.xls"):
        d = _xl_date(r[0], book)
        key, cpn, kind, year, inst = parse_name(r[1])
        paof = _num(r[3]) or 0.0
        ops.append({"date": d, "settle": add_bdays(d, 1), "settle_rule": "Auktionstag + 1 Geschäftstag (T+1)",
                    "name": " ".join(r[1].split()), "key": key, "coupon": cpn, "kind": kind, "instrument": inst, "mat_year": year,
                    "method": "PAOF" if paof else "AUK", "nominal": _num(r[4]), "nominal_auction": _num(r[2]), "paof": paof,
                    "cash": _num(r[5]), "price_pub": _num(r[7]), "yield_pub": _num(r[8]), "cover": _num(r[6]),
                    "source": "gb_auctions", "row": rn})
    for book, rn, r in _rows("dmo_gilt_tenders.xls"):
        d = _xl_date(r[0], book)
        key, cpn, kind, year, inst = parse_name(r[1])
        ops.append({"date": d, "settle": _xl_date(r[8], book) if r[8] else add_bdays(d, 1),
                    "settle_rule": "Valuta laut DMO", "name": " ".join(r[1].split()), "key": key, "coupon": cpn, "kind": kind,
                    "instrument": inst, "mat_year": year, "method": "TEN", "nominal": _num(r[2]), "nominal_auction": _num(r[2]),
                    "paof": 0.0, "cash": _num(r[3]), "price_pub": _num(r[5]), "yield_pub": _num(r[6]), "cover": _num(r[4]),
                    "source": "gb_tenders", "row": rn})
    with open(RAW / "dmo_syndications_2025_26.csv", encoding="utf-8") as fh:
        for rn, r in enumerate(csv.DictReader(fh), start=2):
            d = dt.date.fromisoformat(r["date"])
            key, cpn, kind, year, inst = parse_name(r["gilt"])
            ops.append({"date": d, "settle": add_bdays(d, 1), "settle_rule": "Preisfeststellung + 1 Geschäftstag (angenommen)",
                        "name": r["gilt"], "key": key, "coupon": cpn, "kind": kind, "instrument": inst, "mat_year": year,
                        "method": "SYN", "nominal": float(r["nominal_mn_gbp"]), "nominal_auction": float(r["nominal_mn_gbp"]),
                        "paof": 0.0, "cash": float(r["proceeds_cash_mn"]), "price_pub": float(r["issue_price"]),
                        "yield_pub": float(r["issue_yield_pct"]), "cover": None, "source": "gb_syndications", "row": rn})
    ops.sort(key=lambda o: (o["date"], o["key"]))
    return ops


class RPI:
    """RPI (ONS CHAW) und Referenz-RPI für Gilts mit 3-Monats-Verzögerung:
    Ref RPI(Tag t im Monat m) = RPI(m−3) + (t−1)/Tage(m) × (RPI(m−2) − RPI(m−3))."""

    MONTHS = {m: i + 1 for i, m in enumerate("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split())}

    def __init__(self):
        self.m = {}
        with open(RAW / "ons_rpi_chaw.csv", encoding="utf-8") as fh:
            for row in csv.reader(fh):
                if len(row) == 2 and re.match(r"^\d{4} [A-Z]{3}$", row[0]):
                    y, mon = row[0].split()
                    self.m[(int(y), self.MONTHS[mon])] = float(row[1])
        self.last_month = max(self.m)
        y, mo = self.last_month
        # letzter Tag, dessen Referenz-RPI feststeht: Monat m mit m−2 = letzter veröffentlichter Monat
        ny, nm = (y, mo + 2) if mo <= 10 else (y + 1, mo - 10)
        self.last_known = dt.date(ny, nm, 1) + dt.timedelta(days=_days_in_month(ny, nm) - 1)

    def _month(self, y, m, back):
        m -= back
        while m <= 0:
            m += 12
            y -= 1
        return self.m.get((y, m))

    def ref(self, d):
        a, b = self._month(d.year, d.month, 3), self._month(d.year, d.month, 2)
        if a is None or b is None:
            return None
        return a + (d.day - 1) / _days_in_month(d.year, d.month) * (b - a)


def _days_in_month(y, m):
    return ((dt.date(y + (m == 12), m % 12 + 1, 1)) - dt.date(y, m, 1)).days


# ---------------------------------------------------------------------------
# Rechnung
# ---------------------------------------------------------------------------


def schedule(maturity, interest_start, long_first=False):
    return bonds.Schedule(maturity, interest_start, 2, long_first, False)


def exdiv(sch, settle):
    """True, wenn die Valuta in der Ex-Dividenden-Periode vor dem nächsten Kupon liegt."""
    nxt = next((sch.grid[j] for j, _ in sch.payments if sch.grid[j] > settle), None)
    return nxt is not None and settle > ex_dividend_date(nxt)


def accrued_per100(coupon, sch, settle):
    """Stückzinsen je 100 (real bei Linkern); in der Ex-Dividenden-Periode negativ."""
    per = coupon / 2 * 100
    a = per * sch.accrued(settle)
    if exdiv(sch, settle):
        frac = next(f for j, f in sch.payments if sch.grid[j] > settle)
        a -= per * frac
    return a


def gilt_yield(coupon, price, settle, maturity, interest_start, long_first=False):
    """Rendite nach DMO-Formel (halbjährlich, act/act) aus sauberem Kurs; berücksichtigt die Ex-Dividenden-Periode.
    Bei Linkern mit 3-Monats-Verzögerung: reale Rendite aus realem Kurs und realem Kupon."""
    sch = schedule(maturity, interest_start, long_first)
    dirty = price + accrued_per100(coupon, sch, settle)
    pays = sch.next_payments(settle)
    skip = exdiv(sch, settle)
    cfs = [(t, 100 * coupon / 2 * frac) for k, (_, frac, t) in enumerate(pays) if not (skip and k == 0)]
    cfs.append((pays[-1][2], 100.0))

    def pv(y):
        v = 1 / (1 + y / 2)
        return sum(c * v ** t for t, c in cfs)

    lo, hi = -0.2, 1.0
    for _ in range(56):
        mid = (lo + hi) / 2
        if pv(mid) > dirty:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2 * 100


def _drop_first_coupon(res, settle):
    """Ex-Dividenden-Valuta: Der nächste Kupon geht an den bisherigen Inhaber, nicht an den Käufer."""
    first = min((f.date for f in res.flows if f.component == "coupon" and f.date > settle), default=None)
    if first is None:
        return res
    res.flows = [f for f in res.flows if not (f.component == "coupon" and f.date == first)]
    res.cash = [c for c in res.cash if not (c[1] == "Kupon" and c[0] == first)]
    return res


def fit_line(ops):
    """Bestimmt Fälligkeitstag und ersten Kupon einer Anleihe aus den veröffentlichten Renditen ihrer Emissionen.

    Für jeden Kalendertag des Fälligkeitsjahres und drei Varianten des Zinslaufs (regulärer Kuponkalender;
    Zinslaufbeginn am Valutatag der ersten erfassten Emission mit kurzem bzw. langem erstem Kupon) wird die Rendite
    jeder Emission nachgerechnet. Gewählt wird die Kombination mit der kleinsten Quadratsumme der Abweichungen;
    bei Gleichstand der reguläre Kalender.
    Rückgabe: dict mit maturity, interest_start (None = regulär), long_first, fit_median, fit_max, runner_up."""
    usable = [o for o in ops if o["yield_pub"] is not None and o["price_pub"] and o["date"] >= dt.date(1998, 11, 1)]
    if not usable:
        usable = [o for o in ops if o["yield_pub"] is not None and o["price_pub"]]
    if not usable:
        return None
    year, cpn = ops[0]["mat_year"], ops[0]["coupon"]
    first_settle = min(o["settle"] for o in ops)
    last_settle = max(o["settle"] for o in usable)
    configs = [(None, False), (first_settle, False), (first_settle, True)]
    scores = []
    d = dt.date(year, 1, 1)
    while d.year == year:
        if d > last_settle + dt.timedelta(30):
            for ci, (start, lf) in enumerate(configs):
                errs = [abs(gilt_yield(cpn, o["price_pub"], o["settle"], d,
                                       start or (o["settle"] - dt.timedelta(400)), lf) - o["yield_pub"]) for o in usable]
                scores.append((round(sum(e * e for e in errs), 10), ci, d, errs))
        d += dt.timedelta(1)
    scores.sort(key=lambda x: (x[0], x[1]))
    sse, ci, mat, errs = scores[0]
    runner = next((x for x in scores[1:] if x[2] != mat), None)
    errs = sorted(errs)
    start, lf = configs[ci]
    top = []
    for x in scores:
        if x[2] not in top:
            top.append(x[2])
        if len(top) == 20:
            break
    return {"maturity": mat, "interest_start": start, "long_first": lf, "n_fit": len(errs), "_top": top,
            "fit_median": errs[len(errs) // 2], "fit_max": errs[-1],
            "runner_up": runner[2] if runner else None,
            "runner_up_median": sorted(runner[3])[len(runner[3]) // 2] if runner else None}


def compute(o, line, rpi: RPI):
    """Gibt (Result, Status, Hinweis, nachgerechnete Rendite, verwendeter Kurs, Kursquelle) zurück."""
    n = o["nominal"]
    if o["kind"] == "linker8":
        return None, "none", ("Ältere Index-linked Gilts mit 8-Monats-Verzögerung: Die Index-Basis (RPI acht Monate vor der "
                              "Erstemission vor 1998) steht nicht in den Daten; Zahlungsstrom deshalb nicht berechnet."), None, None, None
    mat, start, lf = line["maturity"], line["interest_start"], line["long_first"]
    if mat is None or o["price_pub"] is None:
        return None, "none", "Fälligkeit oder Kurs fehlt.", None, None, None
    sch = schedule(mat, start, lf)
    y = gilt_yield(o["coupon"], o["price_pub"], o["settle"], mat, start, lf) if o["yield_pub"] is not None else None
    ai = accrued_per100(o["coupon"], sch, o["settle"])
    price, src = o["price_pub"], "veröffentlicht (Durchschnittskurs bzw. Emissionskurs)"
    note = None
    if o["kind"] == "fixed":
        if o["method"] == "SYN" and o["cash"]:
            # Cash-Erlös der Syndizierung liegt unter Nominal × Emissionskurs (Konsortialprovision); maßgeblich ist der Erlös
            price, src = o["cash"] / n * 100, "aus veröffentlichtem Cash-Erlös (nach Abzug der Differenz zum Emissionskurs)"
            note = (f"Cash-Erlös laut DMO {o['cash']:,.0f} Mio. £ statt {n * o['price_pub'] / 100:,.0f} Mio. £ (Nominal × Emissionskurs); "
                    "die Differenz ist vermutlich die Konsortialprovision und zählt zu den Kosten.").replace(",", ".")
        res = bonds.fixed_rate(n, o["coupon"], price, o["settle"], mat, start, freq=2, long_first=lf, accrued_per100=ai)
        if exdiv(sch, o["settle"]):
            _drop_first_coupon(res, o["settle"])
        return res, "derived", note, y, price, src
    # Linker mit 3-Monats-Verzögerung
    base = line.get("base_ref_rpi")
    if base is None:
        return None, "none", "Index-Basis der Anleihe nicht bestimmbar.", y, None, None
    official = {}
    d = o["settle"] - dt.timedelta(1)
    while d <= min(rpi.last_known, mat):
        d += dt.timedelta(1)
        r = rpi.ref(d)
        if r is None:
            break
        official[d] = round(r / base, 5)
    ratio = bonds.IndexRatio(official)
    ir = ratio(o["settle"])
    if o["cash"]:
        # Maßgeblich ist der tatsächliche Erlös: Cash-Erlös laut DMO = Nominal × realer sauberer Kurs/100 × Index-Verhältniszahl
        price = o["cash"] / n * 100 / ir
        src = "aus veröffentlichtem Cash-Erlös (geteilt durch Index-Verhältniszahl)"
        if o["method"] == "SYN":
            note = "Cash-Erlös laut DMO; Differenz zu Nominal × Emissionskurs vermutlich Konsortialprovision."
        else:
            o["cash_check"] = (n * o["price_pub"] / 100 * ir) / o["cash"] - 1
    res = bonds.inflation_linked(n, o["coupon"], price, o["settle"], mat, start, ratio, long_first=lf, freq=2,
                                 accrued_real_per100=ai)
    if exdiv(sch, o["settle"]):
        _drop_first_coupon(res, o["settle"])
    future = not all(f.fixed for f in res.flows)
    note2 = "Künftige Kupons und Inflationsausgleich hängen vom RPI ab (Projektion 0 %/2 %/4 % p. a.)." if future else None
    if line.get("base_source") != "Erstemission in den Daten":
        note2 = ((note2 + " ") if note2 else "") + f"Index-Basis: {line['base_source']}."
    note = " ".join(x for x in (note, note2) if x) or None
    return res, ("proj" if future else "derived"), note, y, price, src


def refine_line(lo, fit, top):
    """Zweiter Schritt für Gilts mit schlechter Anpassung: Die Erstemission liegt oft nicht in den Daten (z. B. eine nicht
    erfasste Syndizierung), der Zinslauf beginnt also vor der ersten erfassten Emission. Für die 20 besten Fälligkeitstage aus
    dem ersten Schritt wird deshalb zusätzlich der Zinslaufbeginn (bis zu einem Jahr vor der ersten erfassten Emission,
    kurzer oder langer erster Kupon) gesucht."""
    usable = [o for o in lo if o["yield_pub"] is not None and o["price_pub"]]
    first_settle = min(o["settle"] for o in lo)
    cpn = lo[0]["coupon"]
    best = None
    for mat in top:
        for back in range(1, 370):
            start = first_settle - dt.timedelta(back)
            for lf in (False, True):
                errs = [abs(gilt_yield(cpn, o["price_pub"], o["settle"], mat, start, lf) - o["yield_pub"]) for o in usable]
                sse = sum(e * e for e in errs)
                if best is None or sse < best[0] - 1e-12:
                    best = (sse, mat, start, lf, errs)
    errs = sorted(best[4])
    if errs[-1] >= 0.8 * fit["fit_max"]:
        return None
    return {"maturity": best[1], "interest_start": best[2], "long_first": best[3], "n_fit": len(errs),
            "fit_median": errs[len(errs) // 2], "fit_max": errs[-1], "runner_up": fit["maturity"],
            "runner_up_median": fit["fit_median"], "start_searched": True}


def build_lines(ops, rpi: RPI):
    """Stammdaten je Anleihe: Fälligkeit, Zinslaufbeginn, erster Kupon, Index-Basis."""
    by = defaultdict(list)
    for o in ops:
        by[o["key"]].append(o)
    lines = {}
    for key, lo in by.items():
        lo.sort(key=lambda o: o["date"])
        info = {"key": key, "kind": lo[0]["kind"], "n": len(lo), "first_date": lo[0]["date"]}
        if lo[0]["kind"] == "linker8":
            info.update(maturity=None, interest_start=None, long_first=False)
            lines[key] = info
            continue
        fit = fit_line(lo)
        if fit is None:
            info.update(maturity=None, interest_start=None, long_first=False)
            lines[key] = info
            continue
        if fit["fit_max"] > 0.0004:
            ref = refine_line(lo, fit, fit["_top"])
            if ref is not None:
                fit = ref
        new_in_data = fit["interest_start"] is not None and not fit.get("start_searched")
        fit.pop("_top", None)
        info.update(fit)
        info.update(new_in_data=new_in_data,
                    interest_start=fit["interest_start"] or (lo[0]["settle"] - dt.timedelta(400)),
                    first_coupon_basis=("Zinslaufbeginn = Valuta der ersten erfassten Emission ("
                                        + ("langer" if fit["long_first"] else "kurzer") + " erster Kupon), aus den Renditen abgeleitet")
                    if new_in_data else
                    ("Zinslaufbeginn vor der ersten erfassten Emission (Erstemission nicht in den Daten), aus den Renditen abgeleitet"
                     if fit.get("start_searched") else
                     "regulärer Kuponkalender (Anleihe schon vor der ersten erfassten Emission im Umlauf)"))
        mat, start, lf = info["maturity"], info["interest_start"], info["long_first"]
        if lo[0]["kind"] == "linker3":
            if new_in_data:
                info["base_ref_rpi"] = rpi.ref(lo[0]["settle"])
                info["base_source"] = "Erstemission in den Daten"
            else:
                # Erstemission (meist Syndizierung) nicht in den Daten: Basis aus dem Cash-Erlös der ersten erfassten
                # Emission zurückgerechnet (Cash-Erlös laut DMO = Nominal × realer sauberer Kurs/100 × Index-Verhältniszahl)
                o = lo[0]
                ref = rpi.ref(o["settle"])
                if o["cash"] and ref:
                    ir = o["cash"] / (o["nominal"] * o["price_pub"] / 100)
                    info["base_ref_rpi"] = ref / ir
                    info["base_source"] = (f"aus dem Cash-Erlös der ersten erfassten Emission ({o['date'].isoformat()}) "
                                           "zurückgerechnet, da die Erstemission nicht in den Daten liegt")
        lines[key] = info
    return lines


FIT_VERSION = 5
CACHE = ROOT / "data" / "processed" / "gb_gilt_lines.json"


def _inputs_hash():
    import hashlib
    h = hashlib.sha256(f"v{FIT_VERSION}".encode())
    for f in ("dmo_outright_gilt_auctions.xls", "dmo_gilt_tenders.xls", "dmo_syndications_2025_26.csv", "ons_rpi_chaw.csv"):
        h.update((RAW / f).read_bytes())
    return h.hexdigest()


def load_all():
    """Emissionen, abgeleitete Stammdaten je Anleihe und RPI. Die Stammdaten-Ableitung dauert einige Minuten und wird
    in data/processed/gb_gilt_lines.json zwischengespeichert (neu berechnet, wenn sich Rohdaten oder Verfahren ändern)."""
    import json
    ops = load_operations()
    rpi = RPI()
    hsh = _inputs_hash()
    if CACHE.exists():
        c = json.loads(CACHE.read_text(encoding="utf-8"))
        if c.get("inputs") == hsh:
            lines = {k: {kk: (dt.date.fromisoformat(vv) if kk in DATE_KEYS and vv else vv) for kk, vv in v.items()}
                     for k, v in c["lines"].items()}
            return ops, lines, rpi
    lines = build_lines(ops, rpi)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps({"inputs": hsh, "lines": {k: {kk: (vv.isoformat() if isinstance(vv, dt.date) else vv)
                                                                for kk, vv in v.items()} for k, v in lines.items()}},
                                ensure_ascii=False, indent=1), encoding="utf-8")
    return ops, lines, rpi


DATE_KEYS = {"maturity", "interest_start", "runner_up", "first_date"}
