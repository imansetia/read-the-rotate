"""Write a synthetic scenario pack that anyone can play without GRID data.

Every round here is invented: made-up maps, scripted attacker plans (straight hit, fake, split) and
GRID-like sparse sightings. Nothing is read from or derived from the GRID data, so the output can be
committed and hosted. Seeded, so it is reproducible.

Usage: python pipeline/make_demo_pack.py
Output: public/packs/demo/scenarios.json (committed)
"""
import json
import math
import pathlib
import random

from extract_scenarios import REVEAL_TAIL, pick_snapshots

OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "packs" / "demo" / "scenarios.json"
BOUNDS = {"min": {"x": 0, "y": 0}, "max": {"x": 10000, "y": 10000}}
ATK_SPAWN, DEF_SPAWN, MID = (5000, 800), (5000, 9200), (5000, 5000)
# Invented layouts. Each site has the lane attackers gather in before they hit it.
MAPS = {
    "dockyard": {"A": ((2200, 7200), (2000, 4000)), "B": ((7800, 7000), (8000, 4000))},
    "quarry": {"A": ((1800, 7600), (1600, 4200)), "B": ((5000, 8000), (5000, 4800)),
               "C": ((8200, 7200), (8400, 4000))},
}
PER_MAP = 30
SPEED = 450  # world units per second, a jog with stops


def jitter(p, r, rng):
    return p[0] + rng.uniform(-r, r), p[1] + rng.uniform(-r, r)


def go(path, stops, rng):
    """Extend waypoints [(t, x, y)]: walk to each (point, hold seconds) in turn."""
    path = list(path)
    for p, hold in stops:
        t, x, y = path[-1]
        t += math.dist((x, y), p) / (SPEED * rng.uniform(0.85, 1.15))
        path += [(t, *p), (t + hold, *p)]
    return path


def wait(path, until):
    return path + [(until, *path[-1][1:])] if until > path[-1][0] else path


def at(path, t):
    if t <= path[0][0]:
        return path[0][1:]
    for (t0, x0, y0), (t1, x1, y1) in zip(path, path[1:]):
        if t <= t1:
            f = (t - t0) / (t1 - t0) if t1 > t0 else 1
            return x0 + (x1 - x0) * f, y0 + (y1 - y0) * f
    return path[-1][1:]


def sightings(path, death, end, mean_gap, rng):
    """GRID only reports a position when the player shows up in an event: sample sparse records."""
    stop = min(death, end) if death is not None else end
    times, t = [0.0], 0.0
    while True:
        t += min(max(rng.expovariate(1 / mean_gap), 0.4), 10)
        if t >= stop:
            break
        times.append(t)
    track = [[round(t, 1), round(x), round(y), True] for t in times for x, y in [at(path, t)]]
    if death is not None and death <= end:
        x, y = at(path, death)
        track.append([round(death, 1), round(x), round(y), False])
    return track


def scenario(map_name, target, rng):
    sites = MAPS[map_name]
    decoy = rng.choice(sorted(set(sites) - {target}))
    site, lane = sites[target]
    commit = rng.uniform(30, 48)  # when the hit on the target starts
    plan = rng.choices(["direct", "fake", "split"], weights=[4, 3, 3])[0]

    # Roles: a lurker sits in the other lane in every plan; a split leaves two there; a fake sends three
    # to the decoy lane first and rotates them through mid just in time for the hit.
    roles = ["fake"] * 3 + ["hit"] if plan == "fake" else ["hit"] * 3 + ["lurk"] if plan == "split" else ["hit"] * 4
    atk = []
    for role in roles + ["lurk"]:
        path = [(rng.uniform(0, 3), *jitter(ATK_SPAWN, 500, rng))]
        if role == "lurk":
            atk.append(go(path, [(jitter(sites[decoy][1], 500, rng), 999)], rng))
            continue
        if role == "fake":
            dlane = jitter(sites[decoy][1], 500, rng)
            path = wait(go(path, [(dlane, 0)], rng), commit - (math.dist(dlane, MID) + math.dist(MID, lane)) / SPEED)
            path = go(path, [(jitter(MID, 400, rng), 0), (jitter(lane, 400, rng), 0)], rng)
        else:
            path = go(path, [(jitter(MID, 600, rng), rng.uniform(0, 4)), (jitter(lane, 500, rng), 0)], rng)
        atk.append(go(wait(path, commit), [(jitter(site, 700, rng), 999)], rng))  # go in together

    def arrival(path):
        return next(t for t, *xy in path if math.dist(xy, site) < 1200)

    hitters = [p for p, role in zip(atk, roles) if role != "lurk"]
    planter = min(hitters, key=arrival)
    plant_xy = at(planter, arrival(planter))
    plant_t = arrival(planter) + 4  # planting takes a few seconds
    end = plant_t + REVEAL_TAIL

    # Defenders hold their sites; the ones elsewhere rotate a few seconds after the hit starts.
    site_xy = [s[0] for s in sites.values()]
    anchors = site_xy * 2 + [MID] if len(sites) == 2 else site_xy + rng.sample(site_xy, 2)
    dfn = []
    for a in anchors:
        path = go([(0, *jitter(DEF_SPAWN, 500, rng))], [(jitter(a, 1200, rng), 0)], rng)
        if a != site:
            path = go(wait(path, commit + rng.uniform(1, 5)), [(jitter(site, 1500, rng), 0)], rng)
        dfn.append(path)

    # Fights during the hit: some defenders on the target and a hitter or two go down.
    deaths = {}
    for i in rng.sample([i for i, a in enumerate(anchors) if a == site], rng.randint(1, anchors.count(site))):
        deaths[("def", i)] = rng.uniform(commit + 2, plant_t)
    for p in rng.sample([p for p in hitters if p is not planter], rng.randint(0, 2)):
        deaths[("atk", atk.index(p))] = rng.uniform(commit + 1, plant_t + 3)

    keys = [(side, i) for side, paths in (("atk", atk), ("def", dfn)) for i in range(len(paths))]
    rng.shuffle(keys)
    paths = {("atk", i): p for i, p in enumerate(atk)} | {("def", i): p for i, p in enumerate(dfn)}
    gaps = {"atk": 2.5, "def": 4}
    players = [{"side": k[0], "track": sightings(paths[k], deaths.get(k), end, gaps[k[0]], rng)} for k in keys]

    def shooter(victim, t):  # the nearest enemy still standing takes the kill
        alive = [k for k in keys if k[0] != victim[0] and deaths.get(k, 999) > t]
        return min(alive, key=lambda k: math.dist(at(paths[k], t), at(paths[victim], t)))
    kills = sorted([round(t, 1), keys.index(shooter(k, t)), keys.index(k)] for k, t in deaths.items() if t <= end)
    return {"map": map_name, "site": target, "plant": {"t": round(plant_t, 1), "x": round(plant_xy[0]),
            "y": round(plant_xy[1])}, "players": players, "kills": kills}


def main():
    rng = random.Random(2026)
    scenarios = []
    for map_name in MAPS:
        made = 0
        while made < PER_MAP:
            s = scenario(map_name, sorted(MAPS[map_name])[made % len(MAPS[map_name])], rng)  # even split: no "always A"
            s["snaps"] = pick_snapshots(s)
            if s["snaps"]:
                made += 1
                scenarios.append({"id": f"demo-{map_name}-{made:02d}", **s})
    maps = {name: {"bounds": BOUNDS, "sites": [{"label": k, "x": v[0][0], "y": v[0][1]} for k, v in sites.items()]}
            for name, sites in MAPS.items()}
    tiers = {t: sum(t in s["snaps"] for s in scenarios) for t in "123"}
    assert all(n >= 10 for n in tiers.values()), tiers  # a session needs 6/7/7, keep some variety
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"maps": maps, "scenarios": scenarios}, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(scenarios)} demo scenarios to {OUT} ({OUT.stat().st_size // 1024} KB), tiers {tiers}")


if __name__ == "__main__":
    main()
