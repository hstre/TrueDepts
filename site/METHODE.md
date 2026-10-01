# Daten- und Methodenkonzept

**Frage der Website:** Welche Zinslast wurde in einem Jahr für die Zukunft eingegangen?

Haushalte zeigen Zinsen in dem Jahr, in dem sie gezahlt werden. Diese Website ordnet zusätzlich jedem
Jahr die *gesamten* Finanzierungskosten der in diesem Jahr aufgenommenen Kredite zu – bis zu deren
Fälligkeit. So wird sichtbar, welche Zahlungspflichten eine Regierung ihren Nachfolgern hinterlässt.

---

## 1. Grundsätze

1. **Keine erfundenen Jahrgangswerte.** Ein Schuldenstand oder eine jährliche Zinssumme reicht nicht,
   um die Kosten eines Kreditjahrgangs zu rekonstruieren. Jahrgangskosten werden nur aus Einzelemissionen
   berechnet. Wo diese fehlen, steht „keine ausreichenden Daten“ – auch wenn es für das Jahr andere Reihen gibt.
2. **Jede Zahl hat einen sichtbaren Status:**

   | Status | Bedeutung |
   |---|---|
   | **aus einzelnen Emissionen berechnet** | Ergebnis vollständig aus veröffentlichten Emissionsdaten (Kurs, Kupon, Laufzeit, Volumen) und amtlichen Index-Verhältniszahlen |
   | **modelliert** | enthält eine ausdrücklich genannte Annahme oder Zuordnungsregel (z. B. Aufteilung Anschlussfinanzierung/Nettokreditaufnahme, US-Dollar-Umrechnung) |
   | **Projektion** | hängt von künftiger Inflation ab; als Spanne aus drei Szenarien dargestellt |
   | **amtliche Statistik** | unverändert aus einer amtlichen Reihe übernommen (z. B. gezahlte Zinsen laut Schuldenbericht) |
   | **internationale Datenbank** | Weltbank/IWF; abweichende Abgrenzung, nur zum Vergleich |
   | **keine ausreichenden Daten** | Lücke; Jahr/Land wird trotzdem angezeigt |

3. **Rohdaten sind versioniert.** Alle Quelldateien liegen unverändert in `data/raw/` mit URL,
   Abrufzeit und SHA-256 in `data/raw/MANIFEST.json`.

## 2. Datenquellen (Prototyp Deutschland)

| Quelle | Inhalt | Verwendung |
|---|---|---|
| Finanzagentur, *Emissionshistorie* (`emissionshistorie_dt.xlsx`) | Jede Auktion/Syndizierung seit 1999: Datum, ISIN, Kupon, Fälligkeit, Emissionsvolumen, Zuteilung, Marktpflegequote, gewogener Durchschnittskurs, Rendite | Grundlage aller Jahrgangskosten |
| Finanzagentur, *Einzelaufstellung* (Jahresenden seit 1995 und aktuell) | Je ISIN Zinslaufbeginn, Fälligkeit, Umlauf | Stückzinsen, erster Kupon, Volumenabgleich |
| Finanzagentur, *Referenzindex-Archive* (Basisjahre 2005, 2015, 2025) | Amtliche tägliche Index-Verhältniszahlen der inflationsindexierten Bundeswertpapiere, Basisindex, 1. Kupon | Realisierte Zahlungen der ILB; Startpunkt der Projektion |
| Finanzagentur, *Schuldenbericht* | Monatlich seit 1995: Bruttokreditaufnahme, Tilgungen, Zinsen (kassenmäßig und inkl. periodengerechter Verteilung), Schuldenstand | Gezahlte Zinsen (Vergleichszahl), Aufteilung Anschluss-/Nettofinanzierung, Abdeckungsgrad |
| Weltbank WDI `GC.XPN.INTP.CN` | Zinszahlungen des Zentralstaats, Landeswährung | Vergleichszahl für Jahre/Länder ohne amtliche Einzeldaten |
| IWF WEO (`GGXCNL_NGDP`, `GGXONLB_NGDP`, `GGXWDG_NGDP`) | Finanzierungssaldo, Primärsaldo, Bruttoschulden des Gesamtstaats in % des BIP | Gesamtstaat: Nettozinsen und Schuldenstand; nie für Jahrgangskosten |
| Bundesbank, Kapitalmarktstatistik (BBSIS) | Monatlich: Brutto-Absatz von Bundesanleihen (ab 1948; nach Laufzeit bis/über 4 Jahre ab 1960), Emissions- und Umlaufsrendite von Bundeswertpapieren (ab 1960), Umlauf | Jahre vor 1999: amtliches Emissionsvolumen, Nettoabsatz, **modellierte** Größenordnung der Zinslast (4.9) |

Für die USA und das Vereinigte Königreich siehe Abschnitt 7. Für weitere Länder sind die amtlichen Auktionsquellen im
Quellenverzeichnis (`pipeline/sources.py`, Abschnitt `CANDIDATES`) vermerkt; importiert sind Deutschland, die USA und das
Vereinigte Königreich.

**Abgrenzung Deutschland:** Bund, d. h. Bundeshaushalt und die über Bundeswertpapiere finanzierten
Sondervermögen. Nicht enthalten: Länder, Gemeinden, Sozialversicherung. Währung: Euro (ab 1999; vorher
D‑Mark, 1 € = 1,95583 DM). Gebietsstand und Staatsdefinition je Jahr stehen in `data/meta/de_context.json`
und werden in der Jahresansicht angezeigt.

## 3. Datenmodell

```
Land ─┬─ Quellen (amtlich / international / Kandidaten)
      ├─ Kontext je Zeitraum (Gebiet, Währung, Staatsdefinition)
      ├─ Regierungen (Beginn, Regierungschef, Koalition) → Zuordnung nach Emissionstag
      ├─ Jahresreihen (amtlich: Bruttokreditaufnahme, Tilgungen, gezahlte Zinsen; international)
      └─ Emission (eine Zeile je Auktion/Syndikat/Eigenbestandsaufstockung)
            ├─ Stammdaten: ISIN, Art (fest | Nullkupon | inflationsindexiert | Fremdwährung | variabel*),
            │              Kupon, Zinslaufbeginn, erster Kupon kurz/lang, Fälligkeit
            ├─ Emissionsdaten: Datum, Valuta, Zuteilung, Eigenbestand, Kurs, veröffentlichte Rendite
            ├─ Ergebnis: Emissionserlös, Stückzinsen, Kosten (fest | Spanne tief/mittel/hoch)
            └─ Kostenkomponenten mit Zahlungsdatum: Kupon | Stückzinsen | Disagio/Agio | Inflationsausgleich
Jahrgang = alle Emissionen mit Valuta im Jahr (Summen, Zahlungen nach künftigen Jahren, Fälligkeiten)
```
\* Variabel verzinste Titel sind im Modell vorgesehen (fester Teil = bekannte Fixings, Rest Projektion);
im deutschen Datensatz seit 1999 kommen sie nicht vor.

Die Website liest daraus erzeugte JSON-Dateien (`site/data/…`). Ein weiteres Land braucht nur einen
Importer, der Emissionszeilen in dieses Schema bringt, und einen Eintrag im Quellenverzeichnis.

## 4. Rechenregeln

### 4.1 Was zählt als „neu aufgenommen“?
Der **zugeteilte Nennwert** (Zuteilungsvolumen) einer Auktion bzw. das platzierte Volumen eines Syndikats.
Die **Marktpflegequote** und Aufstockungen **in den Eigenbestand** werden getrennt ausgewiesen: Sie sind bei
Emission nicht an Investoren verkauft. Der Bund verkauft sie später im Sekundärmarkt; zu welchem Kurs,
steht nicht in den Emissionsdaten → „keine ausreichenden Daten“.

### 4.2 Finanzierungskosten einer Emission
```
Kosten = Summe aller Kupons + Rückzahlungsbetrag − Emissionserlös
Emissionserlös = Nennwert × Kurs/100 + vom Käufer gezahlte Stückzinsen
```
Damit sind Ausgaben über oder unter pari (Agio/Disagio) automatisch berücksichtigt. Bei Kursen über 100
und negativen Renditen (2015–2021) werden Kosten negativ – das wird so angezeigt.

Zerlegung nach Zahlungsjahr (Summe = Gesamtkosten):

| Komponente | Betrag | Jahr |
|---|---|---|
| Kupon | Nennwert × Kupon × Periodenanteil | Kupontermin |
| Stückzinsen | − vom Käufer gezahlte Stückzinsen | Valuta |
| Disagio/Agio | Nennwert − Nennwert × Kurs/100 | Fälligkeit (dann wird der volle Nennwert zurückgezahlt) |
| Inflationsausgleich (nur ILB) | Rückzahlung − bei Valuta indexiertes Kapital | Fälligkeit |

Hinweis: Der Bundeshaushalt bucht Agio/Disagio nach eigenen Regeln (der Schuldenbericht weist seit 2025
zusätzlich eine periodengerechte Verteilung aus). Diese Website ordnet nach Zahlungszeitpunkt zu.

### 4.3 Kalender
- **Valuta:** Auktion + 2 TARGET-Geschäftstage. Syndikate: Zinslaufbeginn, wenn dieser bis zu 15 Tage nach
  der Preisfeststellung liegt, sonst ebenfalls T+2. Die Emissionshistorie nennt keine Valuta – Annahme.
- **Kupontermine:** jährlich am Fälligkeitstag (US-Dollar-Anleihen halbjährlich), Tagezählung act/act (ICMA).
- **Erster Kupon kurz oder lang:** steht nicht in der Emissionshistorie. Für ILB aus dem amtlichen Datum
  „1. Kupon“. Für andere Anleihen wird je ISIN die Variante gewählt, mit der die veröffentlichten Renditen
  aller betroffenen Auktionen am besten nachgerechnet werden. Die Wahl ändert die Gesamtkosten nicht,
  nur die Aufteilung eines Teilkupons auf zwei Jahre.

### 4.4 Inflationsindexierte Anleihen (ILB)
Kupon und Kapital werden mit der Index-Verhältniszahl (HVPI Euroraum ohne Tabak, unrevidiert, 3 Monate
verzögert) multipliziert; das Kapital hat einen Deflationsschutz (Rückzahlung mindestens zum Nennwert).
- Bis zum letzten amtlich veröffentlichten Tag (derzeit 01.11.2026) werden **amtliche** Index-Verhältniszahlen
  verwendet → Zahlungen bis dahin „berechnet“.
- Danach **Projektion** mit 0 %, 2 % und 4 % Jahresinflation ab dem letzten amtlichen Wert → Spanne.
  0 % ist keine Untergrenze: Bei Deflation lägen Kupons tiefer; das Kapital ist nach unten geschützt.
- Fest mit der Emission verbunden sind Stückzinsen und Disagio/Agio auf das bei Valuta indexierte Kapital.

### 4.5 Anschlussfinanzierung vs. zusätzliche Nettoverschuldung – **modelliert**
Geld ist fungibel: Aus Emissionsdaten lässt sich nicht ablesen, welche Anleihe eine fällige Anleihe ersetzt.
Deshalb wird mit amtlichen Jahressummen des Schuldenberichts proportional zugeordnet:
```
Nettokreditaufnahme = Bruttokreditaufnahme − Tilgungen
Anteil Nettokreditaufnahme = max(Netto, 0) / Brutto
Kosten, die rechnerisch auf zusätzliche Verschuldung entfallen = Jahrgangskosten × Anteil
```
Einschränkungen: Brutto enthält unterjährig mehrfach umgeschlagene Geldmarktpapiere; die Bruttosumme des
Schuldenberichts umfasst auch Instrumente außerhalb der Auktionsdaten (Abdeckungsgrad wird angezeigt).

### 4.6 Risiko der Anschlussfinanzierung – getrennt
Die spätere Refinanzierung fälliger Beträge gehört **nicht** zu den feststehenden Kosten des ursprünglichen
Kredits. Sie wird getrennt gezeigt: fällige Beträge je Jahr und die Mehrkosten je Prozentpunkt Zins auf die
Anschlussfinanzierung (fälliger Betrag × 1 % pro Jahr der neuen Laufzeit).

### 4.7 Tatsächlich gezahlte Zinsen im Jahr – Vergleichszahl
Aus dem Schuldenbericht (Zeile „Kredite Bundeshaushalt, Sondervermögen, Darlehensfinanzierung FMS & WSF“,
Blatt „Zinsen“, Dezemberwert): Zinsen auf alte und neue Schulden, kassenmäßig. Zusätzlich der Wert inkl.
periodengerechter Verteilung. Vor 1995: Weltbank (Zentralstaat, abweichende Abgrenzung).

### 4.8 Politische Zuordnung
Emissionen werden nach Emissionstag der jeweils amtierenden Bundesregierung zugeordnet
(`data/meta/de_governments.json`). Das ist eine Vereinfachung: Die Kreditermächtigung erteilt der Bundestag
im Haushaltsgesetz, die Emission führt die Finanzagentur aus, und Haushalte werden teils von Vorgängern
beschlossen.

### 4.9 Jahre vor 1999: modellierte Größenordnung – **modelliert**
Für 1949–1998 gibt es in den geprüften Quellen keine Einzelemissionen (Kupon, Ausgabekurs, Fälligkeit je Anleihe).
Die Bundesbank veröffentlicht aber je Monat das begebene Volumen von Bundesanleihen (Brutto-Absatz, nominal,
getrennt nach vereinbarter Laufzeit bis bzw. über 4 Jahre) und die durchschnittliche Emissionsrendite. Daraus:
```
Zinslast eines Monats ≈ Emissionsrendite × (Volumen bis 4 J. × T_kurz + Volumen über 4 J. × T_lang)
T_kurz = 1 / 2,5 / 4 Jahre,  T_lang = 6 / 9 / 12 Jahre  (tief / mittel / hoch)
```
Annahmen: Ausgabe zu pari, jährlicher Kupon gleich Emissionsrendite, keine Aufteilung nach Zahlungsjahren.
Fehlt in einem Monat die Emissionsrendite, wird die Umlaufsrendite desselben Monats verwendet (ausgewiesen).
Vor 1960 gibt es keine Emissionsrendite → „keine ausreichenden Daten“. D-Mark-Beträge werden mit 1,95583 in Euro
umgerechnet (nicht inflationsbereinigt). Erfasst sind nur Anleihen, nicht Kredite, Schuldscheindarlehen,
Ausgleichsforderungen oder Geldmarkttitel.

**Rückrechnung:** Dasselbe Modell auf 1999–2014 angewendet enthält den exakt aus
Einzelemissionen berechneten Wert in 15 von 16 Jahren; der Mittelwert liegt meist zu hoch.
Bei Renditen nahe null (ab 2015) versagt das Modell. Das Ergebnis ist daher nur eine grobe Größenordnung und wird
auf der Website nie mit berechneten Werten vermischt.

Anschlussfinanzierung vor 1995: Nettoabsatz = Veränderung des Umlaufs von Bundesanleihen, Tilgung = Brutto-Absatz −
Nettoabsatz (Bundesbank). Statistische Umstellungen (z. B. 1957, 1990) können Sprünge verursachen.

## 5. Vollständig durchgerechnetes Beispiel

**Aufstockung der Bundesobligation 2,90 % 08.10.2031 (ISIN DE000BU25075) am 22.09.2026**
Quelle: Emissionshistorie der Finanzagentur, Zeile vom 22.09.2026.

| Angabe | Wert | Herkunft |
|---|---|---|
| Emissionsvolumen | 5.000 Mio. € | Emissionshistorie |
| davon zugeteilt (verkauft) | **3.735,0 Mio. €** | Emissionshistorie |
| davon Marktpflegequote (Eigenbestand) | 1.265,0 Mio. € | Emissionshistorie – nicht in den Kosten |
| gewogener Durchschnittskurs | 98,24 % | Emissionshistorie |
| veröffentlichte Rendite | 3,28 % | Emissionshistorie |
| Kupon, Fälligkeit | 2,90 %, 08.10.2031 | Emissionshistorie |
| Zinslaufbeginn | 23.07.2026 | Einzelaufstellung |
| erster Kupon | lang (bis 08.10.2027) | aus 4 veröffentlichten Renditen abgeleitet |
| Valuta | 24.09.2026 | Annahme T+2 |

**Schritt 1 – Emissionserlös**
- Kurserlös: 3.735,0 × 98,24 % = **3.669,26 Mio. €**
- Stückzinsen: Quasi-Kuponperiode 08.10.2025–08.10.2026 = 365 Tage; aufgelaufen 23.07.–24.09.2026 = 63 Tage.
  3.735,0 × 2,90 % × 63/365 = **18,70 Mio. €**
- Emissionserlös: 3.669,26 + 18,70 = **3.687,96 Mio. €**

**Schritt 2 – Zahlungen bis Fälligkeit**
- Voller Jahreskupon: 3.735,0 × 2,90 % = 108,315 Mio. €
- Erster (langer) Kupon am 08.10.2027: Stub 23.07.–08.10.2026 = 77/365 plus ein volles Jahr:
  108,315 × (1 + 77/365) = **131,17 Mio. €**
- Kupons 2028–2031: 4 × 108,32 = **433,26 Mio. €**
- Rückzahlung 08.10.2031: **3.735,00 Mio. €**

**Schritt 3 – Finanzierungskosten bis Fälligkeit**
```
Kupons 564,43 + Rückzahlung 3.735,00 − Emissionserlös 3.687,96 = 611,47 Mio. €
```
Gleichwertig nach Komponenten: Kupons 564,43 + Disagio (3.735,00 − 3.669,26 =) 65,74 − Stückzinsen 18,70 = 611,47.

**Schritt 4 – Aufteilung nach Zahlungsjahren (Kosten, nicht Tilgung)**

| Jahr | Kosten (Mio. €) | Inhalt |
|---|---|---|
| 2026 | −18,70 | Stückzinsen erhalten |
| 2027 | 131,17 | langer erster Kupon |
| 2028 | 108,32 | Kupon |
| 2029 | 108,32 | Kupon |
| 2030 | 108,32 | Kupon |
| 2031 | 174,05 | Kupon 108,32 + Disagio 65,74 |
| **Summe** | **611,47** (Rundungsdifferenz ±0,01) | |

Zusätzlich fällig 2031: Tilgung 3.735,0 Mio. € → Anschlussfinanzierungsrisiko: je Prozentpunkt Zins auf die
Refinanzierung 37,4 Mio. € pro Jahr – getrennt ausgewiesen, nicht Teil der 611,47 Mio. €.

**Schritt 5 – Prüfung gegen die Emissionsdaten**
Aus Kurs 98,24, Valuta, Stückzinsen und diesem Kuponkalender ergibt sich eine ICMA-Rendite von 3,28 % –
identisch mit der veröffentlichten Rendite. Status der Zahl: **aus einzelnen Emissionen berechnet**.

**Kurzbeispiel Nullkupon:** 12-Monats-Bubill, Auktion 14.09.2026, zugeteilt 3.650 Mio. € zu 96,9941 %.
Erlös 3.540,28 Mio. €; Kosten 109,72 Mio. €, fällig am 15.09.2027. Nachgerechnete Geldmarktrendite
(act/360) 3,065 % = veröffentlicht.

**Kurzbeispiel ILB (Projektion):** 0,10 % inflationsindexierte Bundesanleihe 2033 (DE0001030583), Aufstockung
10.10.2023, zugeteilt 326 Mio. € zu 97,01 % (real). Erlös inkl. Index 373,19 Mio. €. Kosten bis 2033:
fest 12,49 Mio. € (Disagio und bereits gezahlte Kupons), insgesamt 45,3 / 102,0 / 165,0 Mio. € bei 0 / 2 / 4 %
Inflation ab November 2026.

## 6. Prüfungen (automatisch, `python -m pipeline.verify`)

1. **Rendite-Nachrechnung** für jede Auktion mit veröffentlichter Rendite (Stand des Datensatzes: 2.181
   Emissionen). Abweichungen über 0,005 %-Punkte werden aufgelistet.
2. **Kostenidentität** je Emission: Komponenten = Auszahlungen − Erlös = Jahresverteilung.
3. **Volumenabgleich:** kumuliertes Emissionsvolumen je ISIN = amtlicher Umlauf zum Jahresende.
4. **Zeilenkonsistenz:** Emissionsvolumen = Zuteilung + Marktpflegequote.
5. **Abdeckungsgrad:** zugeteiltes Volumen / amtliche Bruttokreditaufnahme. Differenzen erklären sich durch
   nicht auktionierte Instrumente (Bundesschatzbriefe, Finanzierungsschätze bis 2012, Schuldscheindarlehen,
   Daueremissionen, Geldmarktkredite) und durch Verkäufe aus dem Eigenbestand.

Die Ergebnisse erscheinen auf der Website unter „Prüfung“. Für die USA werden Rendite-Nachrechnung und Kostenidentität
ebenso geprüft. Für das Vereinigte Königreich siehe 7.4 (die Renditeprüfung ist dort eine Anpassung, keine unabhängige
Nachrechnung).

## 7. Länder, Staatsebenen und Vergleich (G20)

### 7.1 Abdeckung
| Land | Einzelemissionen (Jahrgangskosten) | Zentralstaat, gezahlte Zinsen | Gesamtstaat |
|---|---|---|---|
| Deutschland | ab 1999 berechnet (Finanzagentur); 1960–1998 modellierte Größenordnung | amtlich ab 1995, Weltbank davor | IWF; VGR-Zinsausgaben (amtlich) ab 1970 |
| Vereinigte Staaten | ab 1979 berechnet (FiscalData, alle Auktionen) | amtlich (FiscalData) ab 2011, Weltbank davor | IWF |
| Vereinigtes Königreich | ab 1998 berechnet (DMO: Auktionen, Tender; Syndizierungen nur 2025–26) – Untergrenze | Weltbank | IWF |
| übrige G20 | keine – Quellen im Verzeichnis, Import nicht umgesetzt | Weltbank | IWF |

Jede Zahl trägt ihren Status. Aus gesamten Zinszahlungen oder Schuldenständen werden für kein Land Jahrgangswerte abgeleitet.

### 7.2 Staatsebenen
- **Zentralstaat:** Deutschland = Bund; USA = Bundesregierung (Treasury, nur marktfähige Wertpapiere; ohne intragouvernementale
  Schulden wie die Treuhandfonds der Sozialversicherung); Vereinigtes Königreich = HM Treasury (Gilts; ohne Treasury Bills und
  National Savings & Investments). Die Jahrgangsberechnung betrifft immer nur diese Ebene.
- **Gesamtstaat:** zusätzlich Länder/Bundesstaaten, Gemeinden und (je nach Land) Sozialversicherung. Für alle G20 aus dem
  IWF World Economic Outlook: Nettozinsen = Primärsaldo − Finanzierungssaldo (% des BIP, abgeleitet; Zinsausgaben minus
  Zinseinnahmen) und Bruttoschulden (% des BIP). Die Zusammensetzung laut IWF-Metadaten und das Haushaltsjahr werden je Land
  angezeigt; Jahre nach dem letzten Ist-Jahr sind IWF-Projektionen.

### 7.3 US-Konventionen
- Valuta = veröffentlichtes Issue Date; Zinslaufbeginn = Dated Date; langer/kurzer erster Kupon laut FiscalData.
- Notes/Bonds: halbjährliche Kupons, act/act, Monatsende-Regel. Fehlt bei älteren Auktionen der Kurs, wird er aus der
  veröffentlichten Rendite berechnet (ausgewiesen; von der Rendite-Nachrechnung ausgenommen).
- Bills: Kurs aus Diskontsatz (act/360, auf drei Stellen gerundet), Prüfung gegen die Investment Rate.
- TIPS: Der veröffentlichte Kurs enthält bereits die Index-Verhältniszahl; gerechnet wird mit dem realen Kurs. Index-Verhältniszahlen
  aus amtlichen Referenz-CPI-Werten ab Mai 2008; davor Interpolation zwischen amtlichen Referenz-CPI-Werten der Emissionstage
  (modelliert); nach dem letzten amtlichen Wert Projektion mit 0/2/4 % Inflation; Deflationsschutz der Rückzahlung.
- FRN: Kupon = Rendite der jeweils letzten 13-Wochen-Bill (aus denselben Daten) + fester Aufschlag, vereinfacht täglich act/360;
  künftiger Index: letzter Wert ±2 %-Punkte (Projektion).
- Zugeteiltes Volumen einschließlich Zuteilungen an die Federal Reserve (SOMA); ausgewiesen.
- Brutto/Tilgungen werden aus den Auktionsdaten summiert; Tilgungen vor 2010 unvollständig (vor 1979 begebene Papiere fehlen).
  Im laufenden Jahr zählen beide Seiten nur bis zum Datenstand (letzte Valuta): Emissionen mit Valuta und Tilgungen mit
  Fälligkeit bis zu diesem Tag. `pipeline.verify` prüft das für jedes Jahr.

### 7.4 Konventionen Vereinigtes Königreich
- Quellen: DMO-Datenberichte „Outright Gilt Auctions“ (ab 1998, mit PAOF), „Gilt Tenders“ (ab 2008), „Other gilt operations“ und
  die Syndizierungen des Haushaltsjahres 2025–26 aus dem Gilt Annual Review (Table 12). Die Datenseiten der DMO sind durch ein
  Captcha geschützt; die Dateien wurden im Browser exportiert und liegen unverändert unter `data/raw/gb/`.
- **Stammdaten abgeleitet:** Die Liste „Gilts in Issue“ (Fälligkeitstag, Kupontermine, erster Kupon) war nicht abrufbar. Für jedes
  Gilt wird deshalb aus den veröffentlichten Renditen seiner Emissionen bestimmt, auf welchen Kalendertag des Fälligkeitsjahres
  die Fälligkeit fällt und ob der Zinslauf mit der ersten erfassten Emission beginnt (kurzer oder langer erster Kupon) – gewählt
  wird die Kombination mit der kleinsten Quadratsumme der Renditeabweichungen. Kupons halbjährlich an Tag und Monat der
  Fälligkeit, act/act; Ex-Dividenden-Periode sieben Geschäftstage vor dem Kupon (negative Stückzinsen, der nächste Kupon entfällt).
  Mit den abgeleiteten Daten werden 99,6 % der veröffentlichten Renditen konventioneller Gilts auf ±0,0005 %-Punkte getroffen.
  Das ist eine **Anpassung, keine unabhängige Prüfung**; bei Gilts mit nur einer oder zwei Emissionen kann der Tag um einen oder
  wenige Tage abweichen. Die Kosten ändern sich dadurch nur um wenige Tage Zinsen. Die abgeleiteten Stammdaten stehen als
  `site/data/gb/gb_gilt_lines.csv` zur Prüfung bereit und werden ersetzt, sobald die DMO-Stammdaten vorliegen.
- Valuta: Auktionstag + 1 Geschäftstag (England und Wales); Tender: Valuta laut DMO; Syndizierungen: + 1 Geschäftstag (Annahme).
- Emissionserlös: Cash-Erlös laut DMO (sauber, ohne Stückzinsen) zuzüglich berechneter Stückzinsen. Bei Syndizierungen liegt der
  Cash-Erlös rund 0,15–0,2 % unter Nominal × Emissionskurs – vermutlich die Konsortialprovision; sie zählt zu den Kosten.
- Index-linked Gilts mit 3-Monats-Verzögerung (ab 2005): Referenz-RPI = RPI(m−3) + (Tag−1)/Tage(m) × (RPI(m−2) − RPI(m−3)),
  Index-Verhältniszahl = Referenz-RPI(Valuta) / Referenz-RPI(Erstemission). Liegt die Erstemission nicht in den Daten, wird die
  Basis aus dem Cash-Erlös der ersten erfassten Emission zurückgerechnet (ausgewiesen). Unabhängige Prüfung: Nominal × realer
  Kurs × Index-Verhältniszahl trifft den veröffentlichten Cash-Erlös seit 2015 praktisch exakt, davor mit Abweichungen bis 0,17 %;
  gerechnet wird deshalb mit dem veröffentlichten Erlös. Nach dem letzten veröffentlichten RPI: Projektion 0/2/4 % p. a.
- Ältere Index-linked Gilts mit 8-Monats-Verzögerung (bis 2006 aufgestockt): Index-Basis nicht in den Daten → Volumen erfasst,
  Kosten „keine ausreichenden Daten“.
- Nicht gezählt: Emissionen direkt an die DMO (Sicherheiten für die Kassensteuerung), Umtausch- und Konversionsgeschäfte.
- Keine Aufteilung in Anschlussfinanzierung und Nettokreditaufnahme: Tilgungen vor 1998 begebener Gilts und die Syndizierungen
  fehlen, eine Aufteilung aus diesen Daten wäre verzerrt.
- Unabhängiger Summenabgleich: Die Emissionen des Haushaltsjahres 2025–26 ergeben Auktionen + PAOF 232.388 Mio. £,
  Tender 21.165 Mio. £ und Syndizierungen 50.392 Mio. £ – genau die Werte des DMO Annual Review (Table 5).

### 7.5 Vergleichsmaßstab
Beträge in Landeswährung sind zwischen Ländern und Jahrzehnten kaum vergleichbar. Deshalb zusätzlich:
```
Kosten je 100 Erlös          = Finanzierungskosten bis Fälligkeit / Emissionserlös × 100   (über die gesamte Laufzeit)
je 100 und Laufzeitjahr      = Kosten je 100 Erlös / volumengewichtete Ø Laufzeit
Ø Emissionsrendite           = volumengewichtet über alle Emissionen des Jahres
```
Lange Kredite können insgesamt mehr Zinsen kosten und trotzdem günstigere jährliche Konditionen haben; die Laufzeit steht deshalb
immer neben dem Gesamtwert. US-Jahrgänge sind wegen der vielen Bills sehr kurzlaufend (Ø um 1–2 Jahre), deutsche Jahrgänge länger.

### 7.6 Politische Zuordnung
Die Zuordnung zu Regierungen nach Emissionstag ist zeitlich, nicht rechtlich (Kreditermächtigung und Schuldenobergrenze liegen beim
Parlament). Für eine Einordnung zeigt die Regierungsansicht zusätzlich das **Zinsniveau** der Amtszeit (Ø Emissionsrendite) und die
**übernommenen Fälligkeiten** (Rückzahlungen in der Amtszeit aus Emissionen früherer Regierungen, nur erfasste Emissionen).

## 8. Bekannte Grenzen

- Vor 1999 gibt es in den verwendeten Quellen keine Einzelemissionen → für 1960–1998 nur eine modellierte
  Größenordnung aus Bundesbank-Aggregaten (4.9), für 1945–1959 „keine ausreichenden Daten“.
- Verkäufe aus dem Eigenbestand (Marktpflege) und nicht auktionierte Instrumente fehlen in den Jahrgangskosten.
- Zins- und Währungsswaps des Bundes sind nicht berücksichtigt.
- Valuta ist angenommen (T+2); bei Syndikaten kann sie abweichen.
- Vereinigtes Königreich: Stammdaten aus Renditen abgeleitet, Syndizierungen vor April 2025 und Treasury Bills fehlen, ältere
  Linker mit 8-Monats-Verzögerung ohne Kosten; die Jahreswerte sind deshalb Untergrenzen (7.4).
- Die ILB-Projektion ist ein Szenario, keine Prognose.
