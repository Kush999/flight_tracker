#!/usr/bin/env python3
"""Build the compact IATA lookup from an OurAirports airports.csv snapshot."""

import csv
import json
import sys
from pathlib import Path


if len(sys.argv) != 3:
    raise SystemExit("usage: build_airport_reference.py airports.csv output.json")

source = Path(sys.argv[1])
output = Path(sys.argv[2])
type_rank = {"large_airport": 3, "medium_airport": 2, "small_airport": 1}
best = {}

with source.open(encoding="utf-8", newline="") as handle:
    for row in csv.DictReader(handle):
        airport_type = row.get("type", "")
        code = row.get("iata_code", "").strip().upper()
        country = row.get("iso_country", "").strip().upper()
        if airport_type not in type_rank or not code or not country:
            continue
        score = (int(row.get("scheduled_service") == "yes"), type_rank[airport_type])
        airport = {
            "name": row.get("name") or None,
            "city": row.get("municipality") or None,
            "countryCode": country,
        }
        if code not in best or score > best[code][0]:
            best[code] = (score, airport)

output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(
    json.dumps({code: value[1] for code, value in best.items()}, separators=(",", ":"), ensure_ascii=False),
    encoding="utf-8",
)
print(f"Wrote {len(best)} IATA airport references to {output}")
