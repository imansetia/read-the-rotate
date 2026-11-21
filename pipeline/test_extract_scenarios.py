"""Self-check on a synthetic feed (no GRID data needed). Run: python -m unittest discover pipeline"""
import json
import pathlib
import tempfile
import unittest

import zstandard

from extract_scenarios import assign_sites, extract_series, kmeans, pick_snapshots

MAP = {"name": "testmap", "bounds": {"min": {"x": 0, "y": 0}, "max": {"x": 100, "y": 100}}}


def state(game_id, round_id, shift=0, trimmed=False):
    """Full snapshot, or the trimmed one most GRID events carry (no started/finished/map/alive)."""
    teams = [{"id": tid, "players": [{"id": f"{tid}{i}", "position": {"x": 10 * i + shift, "y": base}}
                                     for i in range(5)]} for tid, base in (("A", 10), ("D", 90))]
    game = {"id": game_id, "segments": [{"id": round_id}], "teams": teams}
    if not trimmed:
        game.update(map=MAP, started=True, finished=False)
        for t in teams:
            for p in t["players"]:
                p["alive"] = True
    return {"games": [game]}


def event(typ, ss, actor=None):
    return {"type": typ, "actor": actor or {"type": "x", "id": "x"}, "target": {}, "seriesState": ss}


def planter(x, y):
    return {"type": "player", "id": "A0", "state": {"teamId": "A", "game": {"position": {"x": x, "y": y}}}}


def write_feed(path, timeline):
    with zstandard.open(path, "wt", encoding="utf-8") as f:
        for sec, ev in timeline:
            f.write(json.dumps({"occurredAt": f"2026-01-01T00:{sec // 60:02d}:{sec % 60:02d}Z", "events": [ev]}) + "\n")


class ExtractTest(unittest.TestCase):
    def run_feed(self, timeline, valid=("g1",)):
        with tempfile.TemporaryDirectory() as d:
            path = pathlib.Path(d) / "events_123_grid.jsonl.zst"
            write_feed(path, timeline)
            return extract_series(path, set(valid))

    def test_planted_round_becomes_scenario(self):
        found = self.run_feed([
            (0, event("game-started-round", state("g1", "round-1"))),
            (10, event("round-ended-freezetime", state("g1", "round-1"))),
            (20, event("player-used-ability", state("g1", "round-1", shift=5, trimmed=True))),
            (40, event("player-completed-plantBomb", state("g1", "round-1", shift=6, trimmed=True), planter(20, 80))),
            (50, event("player-used-ability", state("g1", "round-1", shift=7, trimmed=True))),  # past reveal tail
        ])
        self.assertEqual(len(found), 1)
        s = found[0]
        self.assertEqual(s["plant"], {"t": 30.0, "x": 20, "y": 80})
        self.assertEqual(sorted(p["side"] for p in s["players"]), ["atk"] * 5 + ["def"] * 5)
        self.assertEqual(s["map"], "testmap")
        self.assertEqual([pt[0] for pt in s["players"][0]["track"]], [0.0, 10.0, 30.0])
        self.assertTrue(all(pt[3] for pt in s["players"][0]["track"]))  # alive carried over trimmed snapshots
        self.assertNotIn("name", json.dumps(s))  # players stay anonymous

    def test_rolled_back_plant_and_unknown_game_are_skipped(self):
        found = self.run_feed([
            (0, event("game-started-round", state("g1", "round-1"))),
            (10, event("round-ended-freezetime", state("g1", "round-1"))),
            (30, event("player-completed-plantBomb", state("g1", "round-1"), planter(20, 80))),
            (31, event("player-!completed-plantBomb", state("g1", "round-1"))),
            (40, event("game-started-round", state("g2", "round-1"))),
            (50, event("round-ended-freezetime", state("g2", "round-1"))),
            (60, event("player-completed-plantBomb", state("g2", "round-1"), planter(20, 80))),
        ])
        self.assertEqual(found, [])

    def test_snapshot_picks_moment_with_most_known_players(self):
        # Plant at 40 s. Everyone is seen at 0 s and again at 20 s (20 s before the plant: tier 2).
        player = {"track": [[0.0, 0, 0, True], [20.0, 1, 1, True]]}
        scenario = {"plant": {"t": 40.0}, "players": [player] * 10}
        snaps = pick_snapshots(scenario)
        self.assertEqual(snaps["2"], 20.0)  # freshest moment in tier 2's 17-22 s window
        self.assertNotIn("1", snaps)  # 12-16 s before: the 20 s sighting is already 4+ s old
        self.assertNotIn("3", snaps)  # 23-30 s before: only the 0 s sighting, 10+ s old

    def test_sites_cluster_and_label(self):
        self.assertEqual(sorted(kmeans([(0, 0), (1, 1), (100, 100), (101, 99)], 2)), [(0.5, 0.5), (100.5, 99.5)])
        scenarios = [{"map": "testmap", "bounds": MAP["bounds"], "plant": {"x": x, "y": y}}
                     for x, y in ((10, 90), (12, 88), (80, 10), (82, 12))]
        maps = assign_sites(scenarios)
        self.assertEqual([s["site"] for s in scenarios], ["A", "A", "B", "B"])
        self.assertEqual(maps["testmap"]["bounds"], MAP["bounds"])
        self.assertNotIn("bounds", scenarios[0])


if __name__ == "__main__":
    unittest.main()
