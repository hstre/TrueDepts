"""Quellenverzeichnis. Einzige Stelle, an der URLs und Quellenbeschreibungen stehen.

Die Website zeigt dieses Verzeichnis (über site/data/sources.json) in der Quellenansicht.
"""

FA = "https://www.deutsche-finanzagentur.de/fileadmin/user_upload/Institutionelle-investoren"
WB_COUNTRIES = "DEU;FRA;ITA;ESP;NLD;AUT;GBR;USA;JPN"
IMF_COUNTRIES = "DEU/FRA/ITA/ESP/NLD/AUT/GBR/USA/JPN"

SOURCES = {
    "de_emissionshistorie": {
        "title": "Auktionsergebnisse seit 1999 (Emissionshistorie)",
        "publisher": "Bundesrepublik Deutschland – Finanzagentur GmbH / Deutsche Bundesbank",
        "kind": "amtlich",
        "country": "DE",
        "landing": "https://www.deutsche-finanzagentur.de/bundeswertpapiere/emissionen/emissionsergebnisse",
        "download": f"{FA}/auktionen/emissionshistorie_dt.xlsx",
        "file": "de/emissionshistorie_dt.xlsx",
        "used_for": "Jede einzelne Emission: Datum, ISIN, Kupon, Fälligkeit, zugeteiltes Volumen, "
                    "Marktpflegequote/Eigenbestand, gewogener Durchschnittskurs, Durchschnittsrendite. "
                    "Grundlage aller als „aus einzelnen Emissionen berechnet“ markierten Werte.",
    },
    "de_einzelaufstellung_jahre": {
        "title": "Ausstehende Bundeswertpapiere – Einzelaufstellung zu Jahresenden seit 1995",
        "publisher": "Bundesrepublik Deutschland – Finanzagentur GmbH",
        "kind": "amtlich",
        "country": "DE",
        "landing": "https://www.deutsche-finanzagentur.de/downloadcenter",
        "download": f"{FA}/berichtswesen/einzelaufstellung_jahre_dt.xlsx",
        "file": "de/einzelaufstellung_jahre_dt.xlsx",
        "used_for": "Zinslaufbeginn („Laufzeit ab“) je ISIN für Stückzinsen und ersten Kupon; "
                    "Abgleich der Emissionsvolumina mit dem Umlauf.",
    },
    "de_einzelaufstellung": {
        "title": "Ausstehende Bundeswertpapiere – aktuelle Einzelaufstellung",
        "publisher": "Bundesrepublik Deutschland – Finanzagentur GmbH",
        "kind": "amtlich",
        "country": "DE",
        "landing": "https://www.deutsche-finanzagentur.de/downloadcenter",
        "download": f"{FA}/berichtswesen/einzelaufstellung_dt.xlsx",
        "file": "de/einzelaufstellung_dt.xlsx",
        "used_for": "Zinslaufbeginn neuer Wertpapiere des laufenden Jahres.",
    },
    "de_schuldenbericht": {
        "title": "Schuldenbericht: Schuldenstand, Bruttokreditaufnahme, Tilgungen, Zinsen (monatlich seit 1995)",
        "publisher": "Bundesrepublik Deutschland – Finanzagentur GmbH, Abteilung F-HH",
        "kind": "amtlich",
        "country": "DE",
        "landing": "https://www.deutsche-finanzagentur.de/finanzierung-des-bundes/schuldenstatistik/zinsen",
        "download": f"{FA}/berichtswesen/schuldenbericht_dt.xlsx",
        "file": "de/schuldenbericht_dt.xlsx",
        "used_for": "Tatsächlich im Jahr gezahlte Zinsen (Vergleichszahl), amtliche Bruttokreditaufnahme "
                    "und Tilgungen (Aufteilung Anschlussfinanzierung / Nettokreditaufnahme, Abdeckungsgrad).",
    },
    "de_referenzindex_2005": {
        "title": "Archiv täglicher Referenzindex und Index-Verhältniszahlen (Basisjahr 2005)",
        "publisher": "Bundesrepublik Deutschland – Finanzagentur GmbH",
        "kind": "amtlich",
        "country": "DE",
        "landing": "https://www.deutsche-finanzagentur.de/bundeswertpapiere/bundeswertpapierarten/inflationsindexierte-bundeswertpapiere",
        "download": f"{FA}/indexverhaeltnis/archiv_referenzindex_bj2005_dt.xlsx",
        "file": "de/archiv_referenzindex_bj2005_dt.xlsx",
        "used_for": "Realisierte Index-Verhältniszahlen inflationsindexierter Bundeswertpapiere 2006–2016.",
    },
    "de_referenzindex_2015": {
        "title": "Archiv täglicher Referenzindex und Index-Verhältniszahlen (Basisjahr 2015)",
        "publisher": "Bundesrepublik Deutschland – Finanzagentur GmbH",
        "kind": "amtlich",
        "country": "DE",
        "landing": "https://www.deutsche-finanzagentur.de/bundeswertpapiere/bundeswertpapierarten/inflationsindexierte-bundeswertpapiere",
        "download": f"{FA}/indexverhaeltnis/archiv_referenzindex_bj2015_dt.xlsx",
        "file": "de/archiv_referenzindex_bj2015_dt.xlsx",
        "used_for": "Realisierte Index-Verhältniszahlen ab 2016, Basisindizes, Zinslaufbeginn und erster Kupon "
                    "der inflationsindexierten Bundeswertpapiere; Ausgangspunkt der Inflationsprojektion.",
    },
    "de_referenzindex_2025": {
        "title": "Täglicher Referenzindex und Index-Verhältniszahlen (Basisjahr 2025)",
        "publisher": "Bundesrepublik Deutschland – Finanzagentur GmbH",
        "kind": "amtlich",
        "country": "DE",
        "landing": "https://www.deutsche-finanzagentur.de/bundeswertpapiere/bundeswertpapierarten/inflationsindexierte-bundeswertpapiere",
        "download": f"{FA}/indexverhaeltnis/archiv_referenzindex_bj2025_dt.xlsx",
        "file": "de/archiv_referenzindex_bj2025_dt.xlsx",
        "used_for": "Aktuelle Index-Verhältniszahlen nach Umbasierung des HVPI auf 2025=100; letzter amtlicher "
                    "Wert ist Ausgangspunkt der Inflationsprojektion.",
    },
    "wb_interest": {
        "title": "World Development Indicators: Interest payments (current LCU), GC.XPN.INTP.CN",
        "publisher": "Weltbank (Datenbasis: IWF Government Finance Statistics)",
        "kind": "international",
        "country": None,
        "landing": "https://data.worldbank.org/indicator/GC.XPN.INTP.CN",
        "download": f"https://api.worldbank.org/v2/country/{WB_COUNTRIES}/indicator/GC.XPN.INTP.CN?format=json&per_page=2000&date=1960:2030",
        "file": "intl/worldbank_GC.XPN.INTP.CN.json",
        "used_for": "Gezahlte Zinsen des Zentralstaats in Landeswährung als Vergleichszahl für Jahre und Länder "
                    "ohne amtliche Einzeldaten. Nicht für Jahrgangskosten verwendbar.",
    },
    "imf_debt": {
        "title": "World Economic Outlook: General government gross debt (% of GDP), GGXWDG_NGDP",
        "publisher": "Internationaler Währungsfonds (IWF), DataMapper-API",
        "kind": "international",
        "country": None,
        "landing": "https://www.imf.org/external/datamapper/GGXWDG_NGDP@WEO",
        "download": f"https://www.imf.org/external/datamapper/api/v1/GGXWDG_NGDP/{IMF_COUNTRIES}",
        "file": "intl/imf_GGXWDG_NGDP.json",
        "used_for": "Kontext: Schuldenstand des Gesamtstaats in % des BIP. Ein Schuldenstand erlaubt keine "
                    "Rekonstruktion der Kosten eines Kreditjahrgangs und wird dafür nicht verwendet.",
    },
}

# Quellen, die für weitere Länder geprüft, aber noch nicht importiert sind.
CANDIDATES = [
    {"country": "FR", "title": "Agence France Trésor – Résultats des adjudications",
     "url": "https://www.aft.gouv.fr/fr/resultats-adjudications", "note": "Einzelauktionen OAT/BTAN/BTF; Import noch nicht umgesetzt."},
    {"country": "IT", "title": "Dipartimento del Tesoro – Risultati delle aste",
     "url": "https://www.dt.mef.gov.it/it/debito_pubblico/emissioni_titoli_di_stato_interni/", "note": "Einzelauktionen BTP/BOT/CCTeu (variabel verzinst); Import noch nicht umgesetzt."},
    {"country": "US", "title": "TreasuryDirect – Auction query / FiscalData",
     "url": "https://fiscaldata.treasury.gov/datasets/treasury-securities-auctions-data/", "note": "Maschinenlesbare Auktionsdaten seit 1979; Import noch nicht umgesetzt."},
    {"country": "GB", "title": "UK Debt Management Office – Gilt auction results",
     "url": "https://www.dmo.gov.uk/data/gilt-market/", "note": "Einzelauktionen und Syndikate; Import noch nicht umgesetzt."},
    {"country": "AT", "title": "OeBFA – Emissionen", "url": "https://www.oebfa.at/", "note": "Import noch nicht umgesetzt."},
    {"country": "NL", "title": "DSTA – Auction results", "url": "https://www.dsta.nl/", "note": "Import noch nicht umgesetzt."},
    {"country": "ES", "title": "Tesoro Público – Resultados de subastas", "url": "https://www.tesoro.es/", "note": "Import noch nicht umgesetzt."},
    {"country": "JP", "title": "Ministry of Finance Japan – JGB auction results", "url": "https://www.mof.go.jp/english/policy/jgbs/auction/", "note": "Import noch nicht umgesetzt."},
]
