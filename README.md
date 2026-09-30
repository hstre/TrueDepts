# Zinslast-Jahrgänge

**Welche Zinslast wurde in einem Jahr für die Zukunft eingegangen?**

Haushalte zeigen Zinsen im Jahr ihrer Zahlung. Diese Website zeigt zusätzlich für jedes Jahr die gesamten
Finanzierungskosten der in diesem Jahr aufgenommenen Staatsschulden bis zu ihrer Fälligkeit – berechnet aus
einzelnen Emissionen, mit sichtbarem Status jeder Zahl („aus einzelnen Emissionen berechnet“, „modelliert“,
„Projektion“, „amtliche Statistik“, „internationale Datenbank“, „keine ausreichenden Daten“).

Abdeckung (G20):
- **Deutschland (Bund):** Einzelemissionen der Finanzagentur ab 1999; 1960–1998 modellierte Größenordnung aus Bundesbank-Aggregaten.
- **Vereinigte Staaten (Treasury):** alle Auktionen seit 1979 (FiscalData), einschließlich TIPS und FRN.
- **Vereinigtes Königreich (HM Treasury):** Gilt-Auktionen und -Tender der DMO ab 1998, Syndizierungen nur 2025–26
  (Untergrenze). Die DMO-Datenseiten sind durch ein Captcha geschützt: Die Dateien wurden im Browser exportiert und liegen
  unter `data/raw/gb/`. Fälligkeitstage und Kupontermine sind aus den veröffentlichten Renditen abgeleitet (Zwischenspeicher
  `data/processed/gb_gilt_lines.json`; die Neuberechnung dauert einige Minuten).
- **Übrige G20:** gezahlte Zinsen des Zentralstaats (Weltbank) und Gesamtstaat (IWF: Nettozinsen, Schulden in % des BIP);
  keine Jahrgangswerte, weil Einzelemissionen (noch) nicht importiert sind. Amtliche Quellen sind im Quellenverzeichnis vermerkt.

Vergleichsansicht mit Kosten je 100 Einheiten Emissionserlös, Laufzeit und Jahreswert; Regierungsansicht mit Zinsniveau und
übernommenen Fälligkeiten.

- Daten- und Methodenkonzept mit durchgerechnetem Beispiel: [`docs/METHODE.md`](docs/METHODE.md)
- Quellen: [`pipeline/sources.py`](pipeline/sources.py), Rohdaten unverändert in `data/raw/` (mit `MANIFEST.json`)

## Aufbau

```
data/raw/            unveränderte Quelldateien (Finanzagentur, Weltbank, IWF) + MANIFEST.json (URL, Abrufzeit, SHA-256)
data/meta/           redaktionelle Metadaten: Regierungen, Gebietsstand/Währung/Staatsdefinition
data/processed/      normalisierte Einzelemissionen mit Rechenergebnissen (CSV)
pipeline/fetch.py    lädt die Rohdaten neu herunter
pipeline/de_import.py  liest die Excel-Dateien der Finanzagentur
pipeline/bbk_import.py Bundesbank-Reihen (vor 1999, VGR-Zinsausgaben)
pipeline/us_import.py  US-Treasury-Auktionen, TIPS-Referenz-CPI, FRN-Index
pipeline/build_us.py   Website-Daten USA
pipeline/uk_import.py  DMO-Gilts, RPI (ONS), Ableitung der Stammdaten aus Renditen
pipeline/build_gb.py   Website-Daten Vereinigtes Königreich
pipeline/bonds.py    Rechenkern: Kalender, Stückzinsen, Kuponpläne, Kosten, Renditen
pipeline/build.py    erzeugt die JSON-Dateien der Website
pipeline/verify.py   prüft die Zahlungsströme gegen die Emissionsdaten
site/                statische Website (HTML/CSS/JS ohne Build-Schritt und ohne externe Bibliotheken)
site/i18n.js         englische Übersetzungen für Texte aus den Daten (Oberflächentexte stehen zweisprachig in app.js)
docs/METHOD_EN.md    englische Fassung der Methodenbeschreibung
tests/               Unit-Tests des Rechenkerns
```

## Benutzen

```bash
pip install -r requirements.txt
python -m unittest discover -s tests      # Tests
python -m pipeline.fetch                  # optional: Rohdaten aktualisieren (Netzwerk)
python -m pipeline.build                  # Website-Daten erzeugen
python -m pipeline.verify                 # Prüfung gegen Emissionsdaten
cd site && python -m http.server 8000     # http://localhost:8000
```

Die Seite ist rein statisch und kann auf jedem Webserver liegen. Öffentlich erreichbar über GitHub Pages
(Modus „Deploy from a branch“, `main`, Wurzelverzeichnis): https://hstre.github.io/TrueDepts/ – die `index.html`
im Hauptverzeichnis leitet auf `site/` weiter. `.github/workflows/check.yml` führt bei jedem Push Tests, Build und
Prüfung aus und veröffentlicht dieselbe Struktur auch dann, wenn Pages auf „GitHub Actions“ steht.

## Sprachen

Die Oberfläche ist zwischen Deutsch und Englisch umschaltbar (Schalter oben rechts). Ohne gespeicherte Wahl richtet
sich die Sprache nach der Browsereinstellung. Texte in `app.js` stehen als `L("deutsch", "english")`; Texte, die aus den
Daten kommen (Instrumente, Hinweise, Quellen), werden über `site/i18n.js` übersetzt. Neue deutsche Datentexte ohne
Eintrag dort erscheinen in der englischen Ansicht unverändert auf Deutsch. Rechtlich maßgeblich ist das deutsche Impressum.

## Ein weiteres Land ergänzen

1. Quellen in `pipeline/sources.py` eintragen (Kandidaten stehen dort bereits unter `CANDIDATES`).
2. Einen Importer schreiben, der Emissionszeilen im Schema von `pipeline/de_import.load_auctions` liefert
   (Datum, Valuta, ISIN, Art, Kupon, Fälligkeit, Zinslaufbeginn, zugeteiltes Volumen, Kurs, Rendite).
3. Kontext (Gebietsstand, Währung, Staatsdefinition) und Regierungen unter `data/meta/` ergänzen.
4. `build.py` für das Land aufrufen; `verify.py` rechnet die veröffentlichten Renditen nach.

Variabel verzinste Titel sind im Datenmodell vorgesehen (bekannte Fixings fest, Rest Projektion), kommen im
deutschen Datensatz seit 1999 aber nicht vor.
