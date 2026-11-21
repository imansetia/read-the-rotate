"""Week-1 spike: what does one VALORANT series feed hold, and where does a bomb plant live?

Usage: python pipeline/inspect_series.py <series_id>   (ids are in $STL_DATA_DIR/val/series.csv)
Prints event type counts and the shape of the first plant events. Never writes data anywhere.
"""
import json
import os
import pathlib
import sys
from collections import Counter

import zstandard

DATA_DIR = pathlib.Path(os.environ.get("STL_DATA_DIR", "../stl-hackathon-2026-grid-starter"))


def envelopes(path):
    with zstandard.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            yield json.loads(line)


def shape(obj, depth=2):
    """Keys only (no values), so we learn the schema without dumping data."""
    if isinstance(obj, list) and obj and depth > 0:
        return [shape(obj[0], depth - 1)]
    if not isinstance(obj, dict) or depth == 0:
        return type(obj).__name__
    return {k: shape(v, depth - 1) for k, v in obj.items()}


def main(series_id):
    path = DATA_DIR / "val" / f"events_{series_id}_grid.jsonl.zst"
    if not path.exists():
        sys.exit(f"Not found: {path}  (set STL_DATA_DIR to your clone of the data repo)")

    types = Counter()
    plants = []
    for env in envelopes(path):
        for ev in env["events"]:
            types[ev["type"]] += 1
            if "plantBomb" in ev["type"] and len(plants) < 2:
                plants.append({
                    "type": ev["type"],
                    "actor.state": shape(ev["actor"].get("state")),
                    "actor.stateDelta": shape(ev["actor"].get("stateDelta")),
                    "target": shape(ev.get("target")),
                    "seriesStateDelta": shape(ev.get("seriesStateDelta"), 4),
                })

    print(f"{sum(types.values())} events, {len(types)} types")
    for t, n in types.most_common():
        print(f"  {n:7d}  {t}")
    print("\nFirst plant events (schema only):")
    print(json.dumps(plants, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
