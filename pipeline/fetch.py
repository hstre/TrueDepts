"""Lädt die Rohdaten aus amtlichen und internationalen Quellen herunter.

Jede Datei wird unverändert unter data/raw/ abgelegt. In data/raw/MANIFEST.json
werden URL, Abrufzeitpunkt, Größe und SHA-256 festgehalten, damit jede Zahl der
Website auf eine konkrete Dateiversion zurückgeführt werden kann.

Aufruf:  python -m pipeline.fetch            (alle Quellen)
         python -m pipeline.fetch de_emissionshistorie   (einzelne Quelle)
"""
import datetime as dt
import hashlib
import json
import sys
import time
import urllib.request
from pathlib import Path

from .sources import SOURCES

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
MANIFEST = RAW / "MANIFEST.json"


def load_manifest():
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text(encoding="utf-8"))
    return {}


def fetch(source_id, manifest):
    src = SOURCES[source_id]
    target = RAW / src["file"]
    target.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(src["download"], headers={"User-Agent": "Mozilla/5.0 (compatible; TrueDepts-Datenimport/1.0)", "Accept": "*/*"})
    body = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                body = resp.read()
            break
        except OSError as exc:  # Zeitüberschreitung, Verbindungsabbruch
            print(f"{source_id}: Versuch {attempt + 1} fehlgeschlagen ({exc}), neuer Versuch …")
            time.sleep(2 ** (attempt + 1))
    if body is None:
        raise RuntimeError(f"{source_id}: Download fehlgeschlagen")
    target.write_bytes(body)
    manifest[source_id] = {
        "file": src["file"],
        "url": src["download"],
        "retrieved": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "bytes": len(body),
        "sha256": hashlib.sha256(body).hexdigest(),
    }
    print(f"{source_id}: {len(body):,} Bytes -> {target.relative_to(ROOT)}")


def main(argv):
    manifest = load_manifest()
    ids = argv or [k for k, v in SOURCES.items() if v.get("download")]
    for sid in ids:
        fetch(sid, manifest)
        MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
