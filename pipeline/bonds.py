"""Rechenkern: Zahlungsströme und Finanzierungskosten einzelner Emissionen.

Grundsatz: Finanzierungskosten einer Emission =
    Summe aller Kupons + Rückzahlungsbetrag − tatsächlicher Emissionserlös,
wobei der Emissionserlös den vom Käufer gezahlten Kurs (Nennwert × Kurs/100)
plus die vom Käufer gezahlten Stückzinsen umfasst.

Die Kosten werden in Komponenten mit Zahlungsjahr zerlegt, deren Summe exakt die
Gesamtkosten ergibt:
    coupon      Kuponzahlung (im Jahr der Zahlung)
    accrued     vom Käufer bei Valuta gezahlte Stückzinsen (negativ, im Valutajahr)
    discount    Nennwert − Kurserlös, d. h. Disagio (+) bzw. Agio (−), im Fälligkeitsjahr
    indexation  nur inflationsindexiert: Inflationsausgleich auf das Kapital nach Valuta
                (Rückzahlung − indexiertes Kapital bei Valuta), im Fälligkeitsjahr

Alle Beträge in Mio. der Emissionswährung.
"""
from __future__ import annotations

import bisect
import datetime as dt
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# Kalender
# ---------------------------------------------------------------------------


def easter_sunday(year: int) -> dt.date:
    """Gregorianischer Ostersonntag (Anonymer Gregorianischer Algorithmus)."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return dt.date(year, month, day + 1)


def target_holidays(year: int) -> set[dt.date]:
    """TARGET2-Feiertage (seit 2000). 1999 war zusätzlich der 31.12. geschlossen."""
    es = easter_sunday(year)
    days = {
        dt.date(year, 1, 1),
        es - dt.timedelta(days=2),
        es + dt.timedelta(days=1),
        dt.date(year, 5, 1),
        dt.date(year, 12, 25),
        dt.date(year, 12, 26),
    }
    if year == 1999:
        days.add(dt.date(1999, 12, 31))
    return days


def is_business_day(d: dt.date) -> bool:
    return d.weekday() < 5 and d not in target_holidays(d.year)


def add_business_days(d: dt.date, n: int) -> dt.date:
    while n > 0:
        d += dt.timedelta(days=1)
        if is_business_day(d):
            n -= 1
    return d


def add_months(d: dt.date, months: int) -> dt.date:
    """Datum um ganze Monate verschieben; Monatsende wird gekappt (29.02. -> 28.02.)."""
    y, m = divmod(d.month - 1 + months, 12)
    y += d.year
    m += 1
    for day in (d.day, 30, 29, 28):
        try:
            return dt.date(y, m, day)
        except ValueError:
            continue
    raise ValueError(d)


def month_end(d: dt.date) -> dt.date:
    nxt = dt.date(d.year + (d.month == 12), d.month % 12 + 1, 1)
    return nxt - dt.timedelta(days=1)


# ---------------------------------------------------------------------------
# Kuponkalender und Stückzinsen (act/act ICMA)
# ---------------------------------------------------------------------------


class Schedule:
    """Kuponkalender einer Anleihe (act/act ICMA).

    grid: reguläre (Quasi-)Kupontermine rückwärts ab Fälligkeit, [p0, p1, ..., Fälligkeit]
          mit p0 <= Zinslaufbeginn < p1.
    long_first: Ist der erste Kupon lang, entfällt die Zahlung am Termin p1; der dort
          aufgelaufene Betrag wird mit dem Kupon am Termin p2 gezahlt.

    Ob der erste Kupon kurz oder lang ist, steht nicht in den Emissionsdaten. build.py leitet
    es je ISIN aus den veröffentlichten Renditen ab (bzw. bei inflationsindexierten Anleihen aus
    den amtlichen Stammdaten). Die Gesamtkosten hängen davon nicht ab, nur die Aufteilung eines
    Teilkupons auf zwei Zahlungsjahre und die Stückzinsen bei Valuta vor dem ersten Kupon.
    """

    def __init__(self, maturity: dt.date, interest_start: dt.date, freq: int = 1, long_first: bool = False,
                 eom: bool = False):
        """eom: Monatsende-Regel (US-Treasuries): Fällt die Fälligkeit auf ein Monatsende, liegen alle
        Kupontermine auf Monatsenden."""
        step = 12 // freq
        eom = eom and (maturity + dt.timedelta(days=1)).day == 1
        grid = [maturity]
        k = 1
        while grid[-1] > interest_start:
            d = add_months(maturity, -step * k)
            if eom:
                d = month_end(d)
            grid.append(d)
            k += 1
        grid.reverse()
        self.grid = grid
        self.start = interest_start
        self.freq = freq
        self.long_first = long_first and len(grid) >= 3 and interest_start > grid[0]
        # Zahlungen: (Index im Raster, Anteil eines vollen Periodenkupons)
        pays = []
        for i in range(1, len(grid)):
            p0, p1 = grid[i - 1], grid[i]
            frac = (p1 - max(p0, interest_start)).days / (p1 - p0).days
            pays.append([i, frac])
        if self.long_first:
            pays[1][1] += pays[0][1]
            pays = pays[1:]
        self.payments = [(i, f) for i, f in pays]

    def period_index(self, d: dt.date) -> int:
        """Index i mit grid[i] <= d < grid[i+1]."""
        i = bisect.bisect_right(self.grid, d) - 1
        return max(0, min(i, len(self.grid) - 2))

    def accrued(self, d: dt.date) -> float:
        """Aufgelaufene Periodenkupons (in Einheiten eines vollen Periodenkupons) am Tag d."""
        g = self.grid
        i = self.period_index(d)
        p0, p1 = g[i], g[i + 1]
        begin = max(p0, self.start)
        frac = max(0.0, (d - begin).days / (p1 - p0).days) if d > begin else 0.0
        if self.long_first and i == 1:
            frac += (g[1] - max(g[0], self.start)).days / (g[1] - g[0]).days
        return frac

    def next_payments(self, d: dt.date):
        """Zahlungen nach Tag d: Liste (Datum, Anteil, Zeit in Perioden ab d)."""
        g = self.grid
        i = self.period_index(d)
        t_first = (g[i + 1] - d).days / (g[i + 1] - g[i]).days
        out = []
        for j, frac in self.payments:
            if g[j] <= d:
                continue
            out.append((g[j], frac, t_first + (j - i - 1)))
        return out


# ---------------------------------------------------------------------------
# Emissionen
# ---------------------------------------------------------------------------


@dataclass
class Flow:
    date: dt.date
    component: str          # coupon | accrued | discount | indexation
    amount: float           # Kostenbeitrag (Mio.), Szenario "mittel" bzw. fest
    fixed: bool = True      # False = abhängig von künftiger Inflation/Referenzzins
    low: float | None = None
    high: float | None = None
    realized: bool = False  # bereits gezahlt und mit amtlichem Index berechnet

    def band(self):
        lo = self.amount if self.low is None else self.low
        hi = self.amount if self.high is None else self.high
        return lo, self.amount, hi


@dataclass
class Result:
    proceeds: float                 # Emissionserlös inkl. Stückzinsen
    clean_proceeds: float           # Nennwert × Kurs/100 (ggf. indexiert)
    accrued: float                  # gezahlte Stückzinsen (ggf. indexiert)
    redemption: float               # Rückzahlungsbetrag (Szenario mittel)
    flows: list[Flow] = field(default_factory=list)
    cash: list[tuple] = field(default_factory=list)  # (Datum, Art, Betrag) aus Sicht des Staates, Auszahlung positiv

    @property
    def cost(self):
        return sum(f.amount for f in self.flows)

    @property
    def cost_band(self):
        lo = sum(f.band()[0] for f in self.flows)
        hi = sum(f.band()[2] for f in self.flows)
        return lo, self.cost, hi

    @property
    def cost_fixed(self):
        return sum(f.amount for f in self.flows if f.fixed)


def fixed_rate(nominal, coupon, price, settle, maturity, interest_start, freq=1, long_first=False, eom=False,
               accrued_per100=None) -> Result:
    """Festverzinsliche Anleihe (auch Nullkupon mit coupon=0).

    nominal: platzierter Nennwert (Mio.), coupon: Jahreskupon als Dezimalzahl,
    price: sauberer Kurs in % des Nennwerts, settle: Valuta.
    """
    sch = Schedule(maturity, interest_start, freq, long_first, eom)
    per = coupon / freq
    if accrued_per100 is not None:
        ai = nominal * accrued_per100 / 100  # veröffentlichte Stückzinsen
    else:
        ai = nominal * per * sch.accrued(settle) if coupon else 0.0
    clean = nominal * price / 100.0
    res = Result(proceeds=clean + ai, clean_proceeds=clean, accrued=ai, redemption=nominal)
    res.cash.append((settle, "Emissionserlös", -(clean + ai)))
    if ai:
        res.flows.append(Flow(settle, "accrued", -ai))
    if coupon:
        for d, frac, _ in sch.next_payments(settle):
            amt = nominal * per * frac
            res.flows.append(Flow(d, "coupon", amt))
            res.cash.append((d, "Kupon", amt))
    res.flows.append(Flow(maturity, "discount", nominal - clean))
    res.cash.append((maturity, "Rückzahlung", nominal))
    return res


def zero_coupon(nominal, price, settle, maturity) -> Result:
    """Unverzinsliche Schatzanweisung (Bubill): Kosten = Nennwert − Erlös, fällig bei Tilgung."""
    clean = nominal * price / 100.0
    res = Result(proceeds=clean, clean_proceeds=clean, accrued=0.0, redemption=nominal)
    res.cash.append((settle, "Emissionserlös", -clean))
    res.flows.append(Flow(maturity, "discount", nominal - clean))
    res.cash.append((maturity, "Rückzahlung", nominal))
    return res


class IndexRatio:
    """Index-Verhältniszahl einer inflationsindexierten Anleihe.

    Für Tage mit amtlich veröffentlichter Index-Verhältniszahl (Archiv der Finanzagentur)
    wird dieser Wert verwendet. Nach dem letzten amtlichen Wert wird die Zahl mit einer
    konstanten jährlichen Inflationsrate fortgeschrieben – eine Projektion, kein amtlicher Wert.
    """

    def __init__(self, official: dict[dt.date, float]):
        self.official = official
        self.last_date = max(official)
        self.last_ratio = official[self.last_date]

    def known(self, d: dt.date) -> bool:
        return d <= self.last_date

    def __call__(self, d: dt.date, inflation: float = 0.02) -> float:
        if d in self.official:
            return self.official[d]
        if d <= self.last_date:
            earlier = [k for k in self.official if k <= d]
            if not earlier:
                raise KeyError(f"keine Index-Verhältniszahl vor {d}")
            return self.official[max(earlier)]
        years = (d - self.last_date).days / 365.25
        return round(self.last_ratio * (1 + inflation) ** years, 5)


SCENARIOS = {"low": 0.0, "mid": 0.02, "high": 0.04}


def inflation_linked(nominal, coupon, price, settle, maturity, interest_start, ratio: IndexRatio,
                     scenarios=SCENARIOS, long_first=False, freq=1, eom=False, accrued_real_per100=None) -> Result:
    """Inflationsindexierte Bundesanleihe (Kapital und Kupons an HVPI ohne Tabak gekoppelt).

    Rückzahlung = Nennwert × max(Index-Verhältniszahl bei Fälligkeit, 1) (Deflationsschutz).
    Kurs und Stückzinsen werden real notiert und mit der Index-Verhältniszahl der Valuta
    multipliziert.
    """
    sch = Schedule(maturity, interest_start, freq, long_first, eom)
    ir_s = ratio(settle)
    if accrued_real_per100 is not None:
        ai = nominal * accrued_real_per100 / 100 * ir_s
    else:
        ai = nominal * coupon / freq * sch.accrued(settle) * ir_s
    clean = nominal * price / 100.0 * ir_s
    lo_i, mid_i, hi_i = scenarios["low"], scenarios["mid"], scenarios["high"]
    red_mid = nominal * max(ratio(maturity, mid_i), 1.0)
    res = Result(proceeds=clean + ai, clean_proceeds=clean, accrued=ai, redemption=red_mid)
    res.cash.append((settle, "Emissionserlös", -(clean + ai)))
    if ai:
        res.flows.append(Flow(settle, "accrued", -ai, realized=ratio.known(settle)))
    for c, frac, _ in sch.next_payments(settle):
        base_amt = nominal * coupon / freq * frac
        if ratio.known(c):
            amt = base_amt * ratio(c)
            res.flows.append(Flow(c, "coupon", amt, fixed=True, realized=True))
        else:
            vals = [base_amt * ratio(c, s) for s in (lo_i, mid_i, hi_i)]
            amt = vals[1]
            res.flows.append(Flow(c, "coupon", vals[1], fixed=False, low=vals[0], high=vals[2]))
        res.cash.append((c, "Kupon", amt))
    # Disagio/Agio auf das bei Valuta indexierte Kapital: steht mit der Emission fest.
    res.flows.append(Flow(maturity, "discount", nominal * ir_s - clean))
    # Inflationsausgleich auf das Kapital ab Valuta bis Fälligkeit.
    if ratio.known(maturity):
        up = nominal * max(ratio(maturity), 1.0) - nominal * ir_s
        res.flows.append(Flow(maturity, "indexation", up, fixed=True, realized=True))
    else:
        vals = [nominal * max(ratio(maturity, s), 1.0) - nominal * ir_s for s in (lo_i, mid_i, hi_i)]
        res.flows.append(Flow(maturity, "indexation", vals[1], fixed=False, low=vals[0], high=vals[2]))
    res.cash.append((maturity, "Rückzahlung", red_mid))
    return res


# ---------------------------------------------------------------------------
# Renditen (zur Prüfung gegen die veröffentlichten Auktionsrenditen)
# ---------------------------------------------------------------------------


def isma_yield(coupon, price, settle, maturity, interest_start, freq=1, long_first=False, eom=False) -> float:
    """Rendite nach ICMA (Barwert mit Periodenzins y/freq) aus sauberem Kurs.

    Für inflationsindexierte Anleihen ergibt dieselbe Formel die reale Rendite.
    """
    sch = Schedule(maturity, interest_start, freq, long_first, eom)
    per = coupon / freq
    dirty = price + 100 * per * sch.accrued(settle)
    cfs = [(t, 100 * per * frac) for _, frac, t in sch.next_payments(settle)] if coupon else []
    t_end = sch.next_payments(settle)[-1][2] if coupon else (maturity - settle).days / 365.25 * freq
    cfs.append((t_end, 100.0))

    def pv(y):
        v = 1 / (1 + y / freq)
        return sum(c * v ** t for t, c in cfs)

    lo, hi = -0.5, 1.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if pv(mid) > dirty:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def money_market_yield(price, settle, maturity) -> float:
    """Geldmarktrendite act/360 (Konvention der Bubill-Auktionen)."""
    days = (maturity - settle).days
    return (100 / price - 1) * 360 / days


def price_from_yield(coupon, yld, settle, maturity, interest_start, freq=2, long_first=False, eom=False) -> float:
    """Sauberer Kurs aus Rendite (Umkehrung von isma_yield); für ältere US-Auktionen ohne veröffentlichten Kurs."""
    lo, hi = 1.0, 300.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if isma_yield(coupon, mid, settle, maturity, interest_start, freq, long_first, eom) > yld:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def bill_price_from_discount(discount_rate, settle, maturity) -> float:
    """US-Bills: Kurs aus Diskontsatz (act/360)."""
    return 100 * (1 - discount_rate * (maturity - settle).days / 360)


def bill_bond_equivalent_yield(price, settle, maturity) -> float:
    """US-Bills: „Investment Rate“ (Bond-Equivalent-Yield) wie von Treasury veröffentlicht."""
    days = (maturity - settle).days
    one_year = add_months(settle, 12)
    feb29 = any(settle < dt.date(y, 2, 29) <= one_year for y in (settle.year, settle.year + 1)
                if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0))
    Y = 366 if feb29 else 365
    if days <= Y / 2:
        return (100 - price) / price * Y / days
    t = days / Y  # Treasury-Formel für Laufzeiten über einem halben Jahr
    return (-2 * t + 2 * (t * t - (2 * t - 1) * (1 - 100 / price)) ** 0.5) / (2 * t - 1)


def floating_rate(nominal, spread, price, settle, maturity, interest_start, index_rate, last_known: dt.date,
                  accrued_per100=None, scenarios=(-0.02, 0.0, 0.02), lockout=None) -> Result:
    """US-FRN: vierteljährlicher Kupon aus täglicher Verzinsung (act/360) mit Index (13-Wochen-Bill) + festem Aufschlag.

    index_rate(d) liefert den am Tag d geltenden Indexsatz (dezimal) bis einschließlich last_known; die Regel, ab wann
    ein neuer Satz gilt (Kalendertag nach der Auktion), steckt in index_rate.
    lockout(pay) liefert den Beginn der Sperrfrist vor dem Zahlungstermin pay (zwei Geschäftstage davor): Ab diesem Tag
    gilt bis zur Zahlung der an diesem Tag geltende Indexsatz.
    Tageszins = max(0, Index + Aufschlag) / 360 (Mindestzins null).
    Nach last_known: Projektion mit letztem Indexsatz + Szenario (tief/mittel/hoch); Aufschlag und bekannte Tage fest.
    """
    sch = Schedule(maturity, interest_start, 4, False, eom=True)
    clean = nominal * price / 100
    ai = nominal * accrued_per100 / 100 if accrued_per100 is not None else 0.0
    res = Result(proceeds=clean + ai, clean_proceeds=clean, accrued=ai, redemption=nominal)
    res.cash.append((settle, "Emissionserlös", -(clean + ai)))
    if ai:
        res.flows.append(Flow(settle, "accrued", -ai))
    last_rate = index_rate(last_known)
    for i in range(1, len(sch.grid)):
        pay = sch.grid[i]
        start = max(sch.grid[i - 1], interest_start)
        if pay <= settle:
            continue
        lock = lockout(pay) if lockout else pay
        fixed_amt = 0.0
        proj = [0.0, 0.0, 0.0]
        d = start
        while d < pay:
            rate_day = min(d, lock)
            if rate_day <= last_known:
                fixed_amt += nominal * max(0.0, index_rate(rate_day) + spread) / 360
            else:
                # Aufschlag fest, Index als Szenario; Mindestzins null auf die Summe
                vals = [nominal * max(0.0, last_rate + sc + spread) / 360 for sc in scenarios]
                base = nominal * max(0.0, spread) / 360 if spread > 0 else 0.0
                base = min(base, min(vals))
                fixed_amt += base
                for k in range(3):
                    proj[k] += vals[k] - base
            d += dt.timedelta(days=1)
        res.flows.append(Flow(pay, "coupon", fixed_amt))
        if any(proj):
            res.flows.append(Flow(pay, "coupon", proj[1], fixed=False, low=proj[0], high=proj[2]))
        res.cash.append((pay, "Kupon", fixed_amt + proj[1]))
    res.flows.append(Flow(maturity, "discount", nominal - clean))
    res.cash.append((maturity, "Rückzahlung", nominal))
    return res
