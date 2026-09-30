# Zinslast-Jahrgänge

**Welche Zinslast wurde in einem Jahr für die Zukunft eingegangen?**

Haushalte zeigen Zinsen im Jahr ihrer Zahlung. Diese Website zeigt zusätzlich für jedes Jahr die gesamten
Finanzierungskosten der in diesem Jahr aufgenommenen Staatsschulden bis zu ihrer Fälligkeit – berechnet aus
einzelnen Emissionen, mit sichtbarem Status jeder Zahl („aus einzelnen Emissionen berechnet“, „modelliert“,
„Projektion“, „amtliche Statistik“, „internationale Datenbank“, „keine ausreichenden Daten“).

Prototyp: **Deutschland (Bund), Emissionen der Finanzagentur seit 1999**. Jahre ab 1945 und weitere Länder
werden mit ihren Datenlücken angezeigt.

- Daten- und Methodenkonzept mit durchgerechnetem Beispiel: [`docs/METHODE.md`](docs/METHODE.md)
- Quellen: [`pipeline/sources.py`](pipeline/sources.py), Rohdaten unverändert in `data/raw/` (mit `MANIFEST.json`)

## Aufbau

```
data/raw/            unveränderte Quelldateien (Finanzagentur, Weltbank, IWF) + MANIFEST.json (URL, Abrufzeit, SHA-256)
data/meta/           redaktionelle Metadaten: Regierungen, Gebietsstand/Währung/Staatsdefinition
data/processed/      normalisierte Einzelemissionen mit Rechenergebnissen (CSV)
pipeline/fetch.py    lädt die Rohdaten neu herunter
pipeline/de_import.py  liest die Excel-Dateien der Finanzagentur
pipeline/bonds.py    Rechenkern: Kalender, Stückzinsen, Kuponpläne, Kosten, Renditen
pipeline/build.py    erzeugt die JSON-Dateien der Website
pipeline/verify.py   prüft die Zahlungsströme gegen die Emissionsdaten
site/                statische Website (HTML/CSS/JS ohne Build-Schritt und ohne externe Bibliotheken)
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
Prüfung aus.

## Ein weiteres Land ergänzen

1. Quellen in `pipeline/sources.py` eintragen (Kandidaten stehen dort bereits unter `CANDIDATES`).
2. Einen Importer schreiben, der Emissionszeilen im Schema von `pipeline/de_import.load_auctions` liefert
   (Datum, Valuta, ISIN, Art, Kupon, Fälligkeit, Zinslaufbeginn, zugeteiltes Volumen, Kurs, Rendite).
3. Kontext (Gebietsstand, Währung, Staatsdefinition) und Regierungen unter `data/meta/` ergänzen.
4. `build.py` für das Land aufrufen; `verify.py` rechnet die veröffentlichten Renditen nach.

Variabel verzinste Titel sind im Datenmodell vorgesehen (bekannte Fixings fest, Rest Projektion), kommen im
deutschen Datensatz seit 1999 aber nicht vor.
