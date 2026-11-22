"""Turn GRID VALORANT feeds into Read the Rotate scenarios.

One scenario = one round where the bomb was planted: every player's radar track from the end of
buy phase until shortly after the plant, plus the site it was planted on. Sites are not in the feed,
so they come from clustering all plant positions per map.

Usage: python pipeline/extract_scenarios.py [--max-series N] [series_id ...]
Output: public/packs/pro/scenarios.json (gitignored: GRID data licence forbids committing it).
"""
import argparse
import csv
import datetime as dt
import json
import os
import pathlib

import zstandard

DATA_DIR = pathlib.Path(os.environ.get("STL_DATA_DIR", "../stl-hackathon-2026-grid-starter"))
OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "packs" / "pro" / "scenarios.json"
REVEAL_TAIL = 5.0  # seconds of tracks kept after the plant, for the reveal animation
THREE_SITE_MAPS = {"haven", "lotus"}
# Difficulty tier -> (min, max) seconds before the plant to show the radar. Earlier = fewer clues.
# At 6-11 s attackers were often already standing on the site, so even tier 1 starts earlier.
TIERS = {"1": (12, 16), "2": (17, 22), "3": (23, 30)}
FRESH = 4.0  # a position younger than this counts as known
MIN_KNOWN = 7  # players (of 10) whose position is fresh, or who are dead, at the snapshot


def ts(iso):
    return dt.datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def envelopes(path):
    with zstandard.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            yield json.loads(line)


def active_game(series_state, valid_games):
    # Most events carry a trimmed snapshot: only the current game, without started/finished/map.
    games = [g for g in series_state.get("games", []) if g["id"] in valid_games and not g.get("finished")]
    started = [g for g in games if g.get("started")]
    return (started or games or [None])[0]


def extract_series(path, valid_games):
    """Scenarios (without site labels) for one series file."""
    rounds = {}  # (game_id, round_id) -> working record
    game_maps = {}  # game_id -> map, learned from the full snapshots
    for env in envelopes(path):
        t = ts(env["occurredAt"])
        for ev in env["events"]:
            g = active_game(ev.get("seriesState") or {}, valid_games)
            if not g or not g.get("segments"):
                continue
            if "map" in g:
                game_maps[g["id"]] = g["map"]
            seg = g["segments"][-1]
            key = (g["id"], seg["id"])
            typ = ev["type"]

            if typ == "game-started-round":  # also covers a replayed round: start it fresh
                rounds[key] = {"game": g["id"], "start": None, "plant": None, "tracks": {}, "kills": []}
                continue
            rec = rounds.get(key)
            if rec is None:
                continue
            if typ == "round-ended-freezetime":
                rec["start"] = t
            if rec["start"] is None:
                continue

            if typ == "player-completed-plantBomb":
                pos = ev["actor"]["state"]["game"]["position"]
                rec["plant"] = {"t": t - rec["start"], "x": pos["x"], "y": pos["y"],
                                "team": ev["actor"]["state"]["teamId"]}
            elif typ == "player-!completed-plantBomb":
                rec["plant"] = None

            rel = t - rec["start"]
            if rec["plant"] and rel > rec["plant"]["t"] + REVEAL_TAIL:
                continue
            if typ == "player-killed-player":
                rec["kills"].append([round(rel, 1), ev["actor"]["id"], ev["target"]["id"]])
            for team in g.get("teams", []):
                for p in team.get("players", []):
                    pos = p.get("position")
                    if not pos:
                        continue
                    track = rec["tracks"].setdefault(p["id"], {"team": team["id"], "points": []})
                    alive = p["alive"] if "alive" in p else (track["points"][-1][3] if track["points"] else True)
                    point = [round(rel, 1), round(pos["x"]), round(pos["y"]), alive]
                    if not track["points"] or track["points"][-1][1:] != point[1:]:
                        track["points"].append(point)

    scenarios = []
    for (game_id, round_id), rec in rounds.items():
        plant, game_map = rec["plant"], game_maps.get(rec["game"])
        if not plant or not game_map or len(rec["tracks"]) != 10:
            continue
        # Player ids and names are dropped on purpose: the game shows anonymous dots only.
        players = [{"side": "atk" if tr["team"] == plant["team"] else "def", "track": tr["points"]}
                   for tr in rec["tracks"].values()]
        ids = list(rec["tracks"])  # kills point at players by index: who shot whom, no names
        kills = [[t, ids.index(a), ids.index(v)] for t, a, v in rec["kills"] if a in ids and v in ids]
        scenarios.append({
            "id": f"{path.name.split('_')[1]}-{game_id[:8]}-{round_id}",
            "map": game_map["name"],
            "bounds": game_map["bounds"],
            "plant": {"t": round(plant["t"], 1), "x": round(plant["x"]), "y": round(plant["y"])},
            "players": players,
            "kills": kills,
        })
    return scenarios


def known_at(scenario, t):
    """(players we can place with confidence, -total position age) at time t; None if someone has no position yet."""
    known = age = 0
    for p in scenario["players"]:
        seen = [pt for pt in p["track"] if pt[0] <= t]
        if not seen:
            return None
        known += (t - seen[-1][0] < FRESH) or not seen[-1][3]
        age += t - seen[-1][0]
    return known, -age


def pick_snapshots(scenario):
    """Per tier, the moment (seconds after buy phase) with the most known players. Tiers that fall short are left out."""
    snaps = {}
    for tier, (lo, hi) in TIERS.items():
        best = None
        for half_secs in range(lo * 2, hi * 2 + 1):
            t = round(scenario["plant"]["t"] - half_secs / 2, 1)
            score = known_at(scenario, t) if t >= 0 else None
            if score and score[0] >= MIN_KNOWN and (best is None or score > best[0]):
                best = (score, t)
        if best:
            snaps[tier] = best[1]
    return snaps


def kmeans(points, k, iters=25):
    """Plain k-means with farthest-point init, so results are deterministic."""
    centers = [points[0]]
    while len(centers) < k:
        centers.append(max(points, key=lambda p: min((p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 for c in centers)))
    for _ in range(iters):
        groups = [[] for _ in centers]
        for p in points:
            i = min(range(k), key=lambda i: (p[0] - centers[i][0]) ** 2 + (p[1] - centers[i][1]) ** 2)
            groups[i].append(p)
        centers = [(sum(p[0] for p in grp) / len(grp), sum(p[1] for p in grp) / len(grp)) if grp else centers[i]
                   for i, grp in enumerate(groups)]
    return centers


def assign_sites(scenarios):
    """Label each scenario's plant with a site. Returns {map: {bounds, sites}}; labels are ours, not Riot's."""
    maps = {}
    for name in sorted({s["map"] for s in scenarios}):
        mine = [s for s in scenarios if s["map"] == name]
        k = 3 if name in THREE_SITE_MAPS else 2
        if len(mine) < k:
            for s in mine:
                scenarios.remove(s)
            continue
        centers = sorted(kmeans([(s["plant"]["x"], s["plant"]["y"]) for s in mine], k), key=lambda c: -c[1])
        sites = [{"label": "ABC"[i], "x": round(c[0]), "y": round(c[1])} for i, c in enumerate(centers)]
        maps[name] = {"bounds": mine[0]["bounds"], "sites": sites}
        for s in mine:
            p = s["plant"]
            s["site"] = min(sites, key=lambda c: (p["x"] - c["x"]) ** 2 + (p["y"] - c["y"]) ** 2)["label"]
            del s["bounds"]
    return maps


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("series", nargs="*", help="series ids (default: first --max-series rows of val/series.csv)")
    ap.add_argument("--max-series", type=int, default=30)
    args = ap.parse_args()

    if not (DATA_DIR / "val" / "series.csv").exists():
        raise SystemExit(f"Data not found in {DATA_DIR} (set STL_DATA_DIR to your clone of the data repo)")
    with open(DATA_DIR / "meta" / "games.csv", encoding="utf-8") as f:
        valid_games = {r["game_id"] for r in csv.DictReader(f) if r["title"] == "val"}
    with open(DATA_DIR / "val" / "series.csv", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if args.series:
        rows = [r for r in rows if r["series_id"] in set(args.series)]
    else:
        rows = rows[:args.max_series]

    scenarios = []
    for i, row in enumerate(rows, 1):
        found = extract_series(DATA_DIR / row["file"], valid_games)
        for s in found:
            s["snaps"] = pick_snapshots(s)
        playable = [s for s in found if s["snaps"]]
        print(f"[{i}/{len(rows)}] {row['series_id']} {row['event']}: {len(playable)}/{len(found)} playable")
        scenarios += playable

    maps = assign_sites(scenarios)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"maps": maps, "scenarios": scenarios}, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(scenarios)} scenarios on {len(maps)} maps to {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
