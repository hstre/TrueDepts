"""Tests des Rechenkerns. Aufruf: python -m unittest discover -s tests -v

Das Beispiel „Bobl 22.09.2026“ ist das durchgerechnete Beispiel aus docs/METHODE.md.
"""
import datetime as dt
import unittest

from pipeline import bonds

D = dt.date


class Calendar(unittest.TestCase):
    def test_easter(self):
        self.assertEqual(bonds.easter_sunday(2024), D(2024, 3, 31))
        self.assertEqual(bonds.easter_sunday(2026), D(2026, 4, 5))

    def test_t_plus_2_skips_good_friday_and_easter_monday(self):
        # Mi 01.04.2026 + 2 Geschäftstage: Do 02.04., (Karfreitag 03.04., Wochenende, Ostermontag 06.04.) -> Di 07.04.
        self.assertEqual(bonds.add_business_days(D(2026, 4, 1), 2), D(2026, 4, 7))

    def test_add_months_end_of_february(self):
        self.assertEqual(bonds.add_months(D(2024, 2, 29), -12), D(2023, 2, 28))


class WorkedExample(unittest.TestCase):
    """Bundesobligation 2,90 % fällig 08.10.2031 (DE000BU25075), Aufstockung am 22.09.2026."""

    def setUp(self):
        self.res = bonds.fixed_rate(nominal=3735.0, coupon=0.029, price=98.24, settle=D(2026, 9, 24),
                                    maturity=D(2031, 10, 8), interest_start=D(2026, 7, 23), long_first=True)

    def test_proceeds(self):
        self.assertAlmostEqual(self.res.clean_proceeds, 3669.264, places=3)
        # 63 Zinstage von 365 in der Quasi-Periode 08.10.2025–08.10.2026
        self.assertAlmostEqual(self.res.accrued, 3735 * 0.029 * 63 / 365, places=6)
        self.assertAlmostEqual(self.res.accrued, 18.695, places=3)

    def test_coupons(self):
        coupons = [(f.date, round(f.amount, 2)) for f in self.res.flows if f.component == "coupon"]
        self.assertEqual(coupons[0], (D(2027, 10, 8), round(108.315 * (1 + 77 / 365), 2)))
        self.assertEqual([c[1] for c in coupons[1:]], [108.32] * 4)

    def test_total_cost(self):
        expected = 108.315 * (1 + 77 / 365) + 4 * 108.315 + (3735 - 3669.264) - 3735 * 0.029 * 63 / 365
        self.assertAlmostEqual(self.res.cost, expected, places=6)
        self.assertAlmostEqual(self.res.cost, 611.47, places=2)

    def test_cost_equals_cash_identity(self):
        outflows = sum(v for _, k, v in self.res.cash if k != "Emissionserlös")
        self.assertAlmostEqual(outflows - self.res.proceeds, self.res.cost, places=9)

    def test_reproduces_published_yield(self):
        y = bonds.isma_yield(0.029, 98.24, D(2026, 9, 24), D(2031, 10, 8), D(2026, 7, 23), long_first=True)
        self.assertAlmostEqual(y * 100, 3.28, delta=0.005)


class FirstCoupon(unittest.TestCase):
    def test_long_or_short_first_coupon_does_not_change_total_cost(self):
        args = dict(nominal=1000.0, coupon=0.05, price=101.0, settle=D(2000, 9, 1),
                    maturity=D(2006, 2, 17), interest_start=D(2000, 8, 16))
        short = bonds.fixed_rate(**args, long_first=False)
        long = bonds.fixed_rate(**args, long_first=True)
        self.assertAlmostEqual(short.cost, long.cost, places=9)
        self.assertNotEqual(sorted({f.date.year for f in short.flows}), sorted({f.date.year for f in long.flows}))

    def test_bobl_2001_matches_published_yield_only_with_long_first_coupon(self):
        s = D(2001, 2, 16)
        y_long = bonds.isma_yield(0.05, 102.0, s, D(2006, 2, 17), D(2000, 8, 16), long_first=True)
        y_short = bonds.isma_yield(0.05, 102.0, s, D(2006, 2, 17), D(2000, 8, 16), long_first=False)
        self.assertAlmostEqual(y_long * 100, 4.52, delta=0.005)
        self.assertGreater(abs(y_short * 100 - 4.52), 0.02)


class ZeroCoupon(unittest.TestCase):
    def test_bubill(self):
        # 12-Monats-Bubill, Auktion 14.09.2026, Valuta 16.09.2026, fällig 15.09.2027
        res = bonds.zero_coupon(3650.0, 96.9941, D(2026, 9, 16), D(2027, 9, 15))
        self.assertAlmostEqual(res.cost, 3650 * (1 - 0.969941), places=6)
        self.assertEqual({f.date for f in res.flows}, {D(2027, 9, 15)})
        y = bonds.money_market_yield(96.9941, D(2026, 9, 16), D(2027, 9, 15))
        self.assertAlmostEqual(y * 100, 3.065, delta=0.0005)

    def test_negative_yield_gives_negative_cost(self):
        res = bonds.zero_coupon(1000.0, 100.5, D(2020, 1, 8), D(2021, 1, 6))
        self.assertLess(res.cost, 0)


class InflationLinked(unittest.TestCase):
    def ratio(self, last_ratio=1.10):
        official = {D(2020, 1, 1) + dt.timedelta(days=k): 1.0 + (last_ratio - 1.0) * k / 2000 for k in range(2001)}
        return bonds.IndexRatio({d: round(v, 5) for d, v in official.items()})

    def test_projection_band_and_fixed_part(self):
        ir = self.ratio()
        res = bonds.inflation_linked(100.0, 0.001, 95.0, D(2021, 1, 5), D(2030, 4, 15), D(2020, 4, 15), ir)
        lo, mid, hi = res.cost_band
        self.assertLess(lo, mid)
        self.assertLess(mid, hi)
        # Disagio auf das bei Valuta indexierte Kapital steht fest
        disc = [f for f in res.flows if f.component == "discount"][0]
        self.assertTrue(disc.fixed)
        self.assertAlmostEqual(disc.amount, 100 * ir(D(2021, 1, 5)) * 0.05, places=6)

    def test_deflation_floor(self):
        ir = bonds.IndexRatio({D(2020, 1, 1): 1.0, D(2020, 1, 2): 0.98})
        res = bonds.inflation_linked(100.0, 0.0, 100.0, D(2020, 1, 2), D(2020, 1, 2) + dt.timedelta(days=400),
                                     D(2019, 4, 15), ir, scenarios={"low": -0.02, "mid": -0.02, "high": -0.02})
        self.assertAlmostEqual(res.redemption, 100.0)


if __name__ == "__main__":
    unittest.main()
