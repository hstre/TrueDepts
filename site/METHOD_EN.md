# Data and methodology

*English translation of `docs/METHODE.md`. If the two versions differ, the German version applies.*

**The question this website answers:** What interest burden was committed for the future in a given year?

Budgets show interest in the year it is paid. This website additionally assigns to each year the *total*
financing cost of the borrowing taken up in that year – until maturity. This makes visible which payment
obligations a government leaves to its successors.

---

## 1. Principles

1. **No invented vintage figures.** A debt stock or an annual interest total is not enough to reconstruct the
   cost of a borrowing vintage. Vintage costs are only calculated from individual issues. Where these are
   missing, the site shows “insufficient data” – even if other series exist for that year.
2. **Every figure has a visible status:**

   | Status | Meaning |
   |---|---|
   | **calculated from individual issues** | result derived entirely from published issuance data (price, coupon, maturity, volume) and official index ratios |
   | **modelled** | contains an explicitly stated assumption or allocation rule (e.g. split into refinancing/net borrowing, US-dollar conversion) |
   | **projection** | depends on future inflation or rates; shown as a range from three scenarios |
   | **official statistics** | taken unchanged from an official series (e.g. interest paid according to the debt report) |
   | **international database** | World Bank/IMF; different definitions, for comparison only |
   | **insufficient data** | gap; the year/country is still shown |

3. **Raw data is versioned.** All source files are stored unchanged in `data/raw/`, with URL, retrieval time
   and SHA-256 in `data/raw/MANIFEST.json`.

## 2. Data sources (Germany)

| Source | Content | Use |
|---|---|---|
| German Finance Agency, *issuance history* (`emissionshistorie_dt.xlsx`) | Every auction/syndication since 1999: date, ISIN, coupon, maturity, issue volume, allotment, retention for market management, weighted average price, yield | Basis of all vintage costs |
| German Finance Agency, *list of securities* (year-ends since 1995 and current) | Per ISIN: interest start date, maturity, amount outstanding | Accrued interest, first coupon, volume check |
| German Finance Agency, *reference index archives* (base years 2005, 2015, 2025) | Official daily index ratios of inflation-linked federal securities, base index, first coupon | Realised payments of inflation-linked bonds; starting point of the projection |
| German Finance Agency, *debt report* | Monthly since 1995: gross borrowing, redemptions, interest (cash basis and incl. accrual-based distribution), debt | Interest paid (comparison figure), split refinancing/net borrowing, coverage |
| World Bank WDI `GC.XPN.INTP.CN` | Interest payments of central government, local currency | Comparison figure for years/countries without official individual data |
| IMF WEO (`GGXCNL_NGDP`, `GGXONLB_NGDP`, `GGXWDG_NGDP`) | Overall balance, primary balance, gross debt of general government in % of GDP | General government: net interest and debt; never used for vintage costs |
| Bundesbank, capital market statistics (BBSIS) | Monthly: gross sales of federal bonds (from 1948; by maturity up to/over 4 years from 1960), issue and outstanding yields of federal securities (from 1960), amount outstanding | Years before 1999: official issue volume, net sales, **modelled** order of magnitude of the interest burden (4.9) |

For the United States and the United Kingdom see section 7. For other countries, the official auction sources are listed
in the source register (`pipeline/sources.py`, section `CANDIDATES`); Germany, the United States and the United Kingdom
are imported.

**Scope for Germany:** the federal level (Bund), i.e. the federal budget and the special funds financed through
federal securities. Not included: Länder (states), municipalities, social security. Currency: euro (from 1999;
before that Deutsche Mark, €1 = DM 1.95583). Territory and definition of the state per year are recorded in
`data/meta/de_context.json` and shown in the year view.

## 3. Data model

```
Country ─┬─ Sources (official / international / candidates)
         ├─ Context per period (territory, currency, definition of the state)
         ├─ Governments (start, head of government, coalition) → assignment by issue date
         ├─ Annual series (official: gross borrowing, redemptions, interest paid; international)
         └─ Issue (one row per auction/syndication/retention tap)
               ├─ Master data: ISIN, type (fixed | zero coupon | inflation-linked | foreign currency | floating*),
               │               coupon, interest start date, short/long first coupon, maturity
               ├─ Issuance data: date, settlement, allotment, own holdings, price, published yield
               ├─ Result: proceeds, accrued interest, cost (fixed | range low/mid/high)
               └─ Cost components with payment date: coupon | accrued interest | discount/premium | inflation uplift
Vintage = all issues settling in the year (totals, payments by future year, maturities)
```
\* Floating-rate securities are supported by the model (fixed part = known fixings, remainder projection);
the German data set since 1999 contains none. US floating rate notes are covered (section 7.3).

The website reads JSON files generated from this (`site/data/…`). Adding a country only requires an importer that
maps issuance rows to this schema, plus an entry in the source register.

## 4. Calculation rules

### 4.1 What counts as “new borrowing”?
The **allotted nominal amount** of an auction or the placed volume of a syndication.
The **retention for secondary market operations** and taps **into own holdings** are shown separately: they are
not sold to investors at issuance. The federal government sells them later in the secondary market; the price
is not part of the issuance data → “insufficient data”.

### 4.2 Financing cost of an issue
```
Cost = sum of all coupons + redemption amount − issue proceeds
Issue proceeds = nominal × price/100 + accrued interest paid by the buyer
```
Issues above or below par (premium/discount) are thus captured automatically. With prices above 100 and
negative yields (2015–2021), costs become negative – and are shown as such.

Breakdown by payment year (sum = total cost):

| Component | Amount | Year |
|---|---|---|
| Coupon | nominal × coupon × fraction of period | coupon date |
| Accrued interest | − accrued interest paid by the buyer | settlement |
| Discount/premium | nominal − nominal × price/100 | maturity (when the full nominal is repaid) |
| Inflation uplift (inflation-linked only) | redemption − capital indexed at settlement | maturity |

Note: the federal budget books premium/discount under its own rules (since 2025 the debt report also shows an
accrual-based distribution). This website assigns amounts to the year of payment.

### 4.3 Calendar
- **Settlement:** auction + 2 TARGET business days. Syndications: interest start date if it falls within 15 days
  after pricing, otherwise also T+2. The issuance history gives no settlement date – assumption.
- **Coupon dates:** annually on the maturity date (US-dollar bonds semi-annually), day count act/act (ICMA).
- **Short or long first coupon:** not stated in the issuance history. For inflation-linked bonds taken from the
  official “first coupon” date. For other bonds, per ISIN the variant is chosen that best reproduces the published
  yields of all affected auctions. The choice does not change total cost, only the split of a partial coupon
  between two years.

### 4.4 Inflation-linked bonds
Coupon and capital are multiplied by the index ratio (euro-area HICP excluding tobacco, unrevised, three-month
lag); the capital is protected against deflation (redemption at least at par).
- Up to the last officially published day (currently 1 Nov 2026), **official** index ratios are used → payments
  up to then are “calculated”.
- After that, a **projection** with 0%, 2% and 4% annual inflation from the last official value → range.
  0% is not a lower bound: with deflation, coupons would be lower; the capital is protected on the downside.
- Accrued interest and the discount/premium on the capital indexed at settlement are fixed at issuance.

### 4.5 Refinancing vs. additional net borrowing – **modelled**
Money is fungible: issuance data cannot show which bond replaces which maturing bond. Therefore the split is
allocated proportionally using official annual totals from the debt report:
```
Net borrowing = gross borrowing − redemptions
Share of net borrowing = max(net, 0) / gross
Cost attributed to additional borrowing = vintage cost × share
```
Limitations: gross borrowing contains money-market paper rolled over several times within the year; the debt
report's gross total also includes instruments outside the auction data (coverage is shown).

### 4.6 Refinancing risk – shown separately
Refinancing maturing amounts later is **not** part of the fixed cost of the original borrowing. It is shown
separately: amounts maturing per year and the additional cost per percentage point of interest on the
refinancing (amount maturing × 1% per year of the new term).

### 4.7 Interest actually paid in the year – comparison figure
From the debt report (row “Kredite Bundeshaushalt, Sondervermögen, Darlehensfinanzierung FMS & WSF”, sheet
“Zinsen”, December value): interest on old and new debt, cash basis. In addition the value including the
accrual-based distribution. Before 1995: World Bank (central government, different definition).

### 4.8 Political attribution
Issues are assigned to the federal government in office on the issue date (`data/meta/de_governments.json`).
This is a simplification: borrowing authority is granted by the Bundestag in the budget act, issuance is carried
out by the Finance Agency, and budgets are sometimes adopted by predecessors.

### 4.9 Years before 1999: modelled order of magnitude – **modelled**
For 1949–1998 the sources checked contain no individual issues (coupon, issue price, maturity per bond).
The Bundesbank does, however, publish the monthly volume of federal bonds issued (gross sales, nominal, split by
agreed maturity up to/over 4 years) and the average yield at issue. From this:
```
Interest burden of a month ≈ issue yield × (volume up to 4 yrs × T_short + volume over 4 yrs × T_long)
T_short = 1 / 2.5 / 4 years,  T_long = 6 / 9 / 12 years  (low / mid / high)
```
Assumptions: issued at par, annual coupon equal to issue yield, no breakdown by payment year. If the issue yield
is missing for a month, the outstanding yield of the same month is used (shown). Before 1960 there is no issue
yield → “insufficient data”. Deutsche Mark amounts are converted to euro at 1.95583 (not adjusted for inflation).
Only bonds are covered, not loans, promissory notes, equalisation claims or money-market paper.

**Back-test:** Applied to 1999–2014, the same model contains the value calculated exactly from individual issues
in 15 of 16 years; the midpoint is usually too high. With yields near zero (from 2015) the model fails. The result
is therefore only a rough order of magnitude and is never mixed with calculated values on the website.

Refinancing before 1995: net sales = change in federal bonds outstanding, redemptions = gross sales − net sales
(Bundesbank). Statistical changes (e.g. 1957, 1990) can cause jumps.

## 5. Fully worked example

**Tap of the 2.90% Federal note (Bobl) maturing 8 Oct 2031 (ISIN DE000BU25075) on 22 Sep 2026**
Source: Finance Agency issuance history, row of 22 Sep 2026.

| Item | Value | Origin |
|---|---|---|
| Issue volume | €5,000 m | issuance history |
| of which allotted (sold) | **€3,735.0 m** | issuance history |
| of which retained (own holdings) | €1,265.0 m | issuance history – not in the cost |
| weighted average price | 98.24% | issuance history |
| published yield | 3.28% | issuance history |
| coupon, maturity | 2.90%, 8 Oct 2031 | issuance history |
| interest start date | 23 Jul 2026 | list of securities |
| first coupon | long (to 8 Oct 2027) | derived from 4 published yields |
| settlement | 24 Sep 2026 | assumption T+2 |

**Step 1 – Issue proceeds**
- Price proceeds: 3,735.0 × 98.24% = **€3,669.26 m**
- Accrued interest: quasi coupon period 8 Oct 2025–8 Oct 2026 = 365 days; accrued 23 Jul–24 Sep 2026 = 63 days.
  3,735.0 × 2.90% × 63/365 = **€18.70 m**
- Issue proceeds: 3,669.26 + 18.70 = **€3,687.96 m**

**Step 2 – Payments until maturity**
- Full annual coupon: 3,735.0 × 2.90% = €108.315 m
- First (long) coupon on 8 Oct 2027: stub 23 Jul–8 Oct 2026 = 77/365 plus one full year:
  108.315 × (1 + 77/365) = **€131.17 m**
- Coupons 2028–2031: 4 × 108.32 = **€433.26 m**
- Redemption on 8 Oct 2031: **€3,735.00 m**

**Step 3 – Financing cost until maturity**
```
Coupons 564.43 + redemption 3,735.00 − issue proceeds 3,687.96 = €611.47 m
```
Equivalently by component: coupons 564.43 + discount (3,735.00 − 3,669.26 =) 65.74 − accrued interest 18.70 = 611.47.

**Step 4 – Breakdown by payment year (cost, not redemption)**

| Year | Cost (€ m) | Content |
|---|---|---|
| 2026 | −18.70 | accrued interest received |
| 2027 | 131.17 | long first coupon |
| 2028 | 108.32 | coupon |
| 2029 | 108.32 | coupon |
| 2030 | 108.32 | coupon |
| 2031 | 174.05 | coupon 108.32 + discount 65.74 |
| **Total** | **611.47** (rounding difference ±0.01) | |

Also due in 2031: redemption of €3,735.0 m → refinancing risk: each percentage point of interest on the
refinancing costs €37.4 m per year – shown separately, not part of the €611.47 m.

**Step 5 – Check against the issuance data**
Price 98.24, settlement, accrued interest and this coupon schedule give an ICMA yield of 3.28% – identical to the
published yield. Status of the figure: **calculated from individual issues**.

**Short example, zero coupon:** 12-month Bubill, auction 14 Sep 2026, €3,650 m allotted at 96.9941%.
Proceeds €3,540.28 m; cost €109.72 m, due on 15 Sep 2027. Recalculated money-market yield (act/360) 3.065% =
published.

**Short example, inflation-linked (projection):** 0.10% inflation-linked federal bond 2033 (DE0001030583), tap on
10 Oct 2023, €326 m allotted at 97.01% (real). Proceeds incl. index €373.19 m. Cost until 2033: fixed €12.49 m
(discount and coupons already paid), in total €45.3 / 102.0 / 165.0 m at 0 / 2 / 4% inflation from November 2026.

## 6. Checks (automatic, `python -m pipeline.verify`)

1. **Yield recalculation** for every auction with a published yield. Deviations above 0.005 percentage points are
   listed.
2. **Cost identity** per issue: components = payments − proceeds = distribution over years.
3. **Volume check:** cumulative issue volume per ISIN = official amount outstanding at year-end.
4. **Row consistency:** issue volume = allotment + retention.
5. **Coverage:** allotted volume / official gross borrowing. Differences are explained by instruments not sold at
   auction (federal savings bonds and financing notes until 2012, promissory notes, tap issues, money-market loans)
   and by sales from own holdings.

The results appear on the website under “Checks”. For the United States, yield recalculation and cost identity are
checked in the same way. For the United Kingdom see 7.4 (there the yield check is a fit, not an independent
recalculation).

## 7. Countries, levels of government and comparison (G20)

### 7.1 Coverage
| Country | Individual issues (vintage cost) | Central government, interest paid | General government |
|---|---|---|---|
| Germany | calculated from 1999 (Finance Agency); 1960–1998 modelled order of magnitude | official from 1995, World Bank before | IMF; national accounts interest expenditure (official) from 1970 |
| United States | calculated from 1979 (FiscalData, all auctions) | official (FiscalData) from 2011, World Bank before | IMF |
| United Kingdom | calculated from 1998 (DMO: auctions, tenders; syndications only 2025–26) – lower bound | World Bank | IMF |
| other G20 | none – sources listed in the register, import not implemented | World Bank | IMF |

Every figure carries its status. For no country are vintage figures derived from total interest payments or debt
levels.

### 7.2 Levels of government
- **Central government:** Germany = Bund; United States = federal government (Treasury, marketable securities only;
  excluding intragovernmental debt such as the Social Security trust funds); United Kingdom = HM Treasury (gilts;
  excluding Treasury bills and National Savings & Investments). Vintage calculations always refer to
  this level only.
- **General government:** additionally states, municipalities and (depending on the country) social security. For
  all G20 from the IMF World Economic Outlook: net interest = primary balance − overall balance (% of GDP, derived;
  interest expenditure minus interest income) and gross debt (% of GDP). The composition according to IMF metadata
  and the fiscal year are shown per country; years after the last actual year are IMF projections.

### 7.3 US conventions
- Settlement = published issue date; interest start = dated date; long/short first coupon according to FiscalData.
- Notes/bonds: semi-annual coupons, act/act, end-of-month rule. If the price is missing for older auctions, it is
  calculated from the published yield (flagged; excluded from the yield recalculation).
- Bills: price from the discount rate (act/360, rounded to three decimals), checked against the investment rate.
- TIPS: the published price already includes the index ratio; calculations use the real price. Index ratios from
  official reference CPI values from May 2008; before that interpolation between official reference CPI values on
  issue dates (modelled); after the last official value projection with 0/2/4% inflation; deflation floor on
  redemption.
- FRN: coupon = yield of the most recent 13-week bill (from the same data) + fixed spread, simplified daily act/360;
  future index: last value ±2 percentage points (projection).
- Allotted volume includes allotments to the Federal Reserve (SOMA); shown.
- Gross borrowing/redemptions are summed from the auction data; redemptions before 2010 are incomplete (securities
  issued before 1979 are missing).
  In the current year both sides only count up to the data cut-off (last settlement date): issues settled and
  redemptions maturing up to that day. `pipeline.verify` checks this for every year.

### 7.4 United Kingdom conventions
- Sources: DMO data reports “Outright Gilt Auctions” (from 1998, with PAOF), “Gilt Tenders” (from 2008), “Other gilt
  operations” and the syndications of fiscal year 2025–26 from the Gilt Annual Review (Table 12). The DMO data pages are
  protected by a captcha; the files were exported in a browser and are stored unchanged under `data/raw/gb/`.
- **Derived reference data:** the “Gilts in Issue” list (maturity date, coupon dates, first coupon) could not be retrieved.
  For each gilt, the published yields of its issues are therefore used to determine on which calendar day of the maturity
  year it matures and whether interest starts with the first issue covered (short or long first coupon) – the combination
  with the smallest sum of squared yield deviations is chosen. Coupons semi-annually on the day and month of maturity,
  act/act; ex-dividend period seven business days before the coupon (negative accrued interest, the next coupon is not
  received). With the derived data, 99.6% of the published yields of conventional gilts are matched to ±0.0005 percentage
  points. This is a **fit, not an independent check**; for gilts with only one or two issues the day may be off by one or a
  few days, which changes the cost by only a few days' interest. The derived reference data are available as
  `site/data/gb/gb_gilt_lines.csv` and will be replaced once the DMO reference data are available.
- Settlement: auction date + 1 business day (England and Wales); tenders: settlement date according to the DMO;
  syndications: + 1 business day (assumption).
- Issue proceeds: cash raised according to the DMO (clean, excluding accrued interest) plus calculated accrued interest. For
  syndications, cash raised is about 0.15–0.2% below nominal × issue price – presumably the syndicate commission; it counts
  as a cost.
- Index-linked gilts with a 3-month lag (from 2005): reference RPI = RPI(m−3) + (day−1)/days(m) × (RPI(m−2) − RPI(m−3)),
  index ratio = reference RPI(settlement) / reference RPI(first issue). If the first issue is not in the data, the base is
  backed out from the cash raised of the first issue covered (stated). Independent check: nominal × real price × index
  ratio matches the published cash raised practically exactly since 2015, with deviations of up to 0.17% before; the
  published proceeds are therefore used. After the last published RPI: projection 0/2/4% p.a.
- Older index-linked gilts with an 8-month lag (reopened until 2006): index base not in the data → volume covered, cost
  “insufficient data”.
- Not counted: issuance directly to the DMO (collateral for cash management), switches and conversions.
- No split into refinancing and net borrowing: redemptions of gilts issued before 1998 and the syndications are missing, so a
  split from these data would be distorted.
- Independent totals check: the issues of fiscal year 2025–26 add up to auctions + PAOF £232,388 m, tenders £21,165 m and
  syndications £50,392 m – exactly the figures in the DMO Annual Review (Table 5).

### 7.5 Comparison measures
Amounts in local currency are hardly comparable across countries and decades. Therefore additionally:
```
Cost per 100 of proceeds        = financing cost until maturity / issue proceeds × 100   (over the full term)
per 100 and year of term        = cost per 100 of proceeds / volume-weighted average term
Average issue yield             = volume-weighted over all issues of the year
```
Long-term borrowing can cost more interest in total and still have cheaper annual terms; the term is therefore
always shown next to the total. US vintages are very short because of the many bills (average around 1–2 years),
German vintages are longer.

### 7.6 Political attribution
Assignment to governments by issue date is temporal, not legal (borrowing authority and the debt ceiling lie with
parliament). To put it in context, the government view also shows the **interest-rate level** of the term (average
issue yield) and the **inherited maturities** (redemptions during the term from issues by earlier governments,
covered issues only).

## 8. Known limitations

- Before 1999 the sources used contain no individual issues → for 1960–1998 only a modelled order of magnitude from
  Bundesbank aggregates (4.9), for 1945–1959 “insufficient data”.
- Sales from own holdings (market management) and instruments not sold at auction are missing from vintage costs.
- Interest-rate and currency swaps of the federal government are not taken into account.
- Settlement is assumed (T+2); it may differ for syndications.
- United Kingdom: reference data derived from yields; syndications before April 2025 and Treasury bills are missing; older
  linkers with an 8-month lag without cost. The annual figures are therefore lower bounds (7.4).
- The inflation-linked projection is a scenario, not a forecast.
