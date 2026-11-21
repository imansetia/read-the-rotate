# Read the Rotate

Booth mini game for the **Cloud9 x JetBrains: Sky's The Limit Hackathon 2026**, Category 3 (Event Mini Game).

You see a pro VALORANT round on an abstract radar, a few seconds before the plant. You call the site with one click. Then the round plays out and shows whether you read it like a pro. Ten rounds, about two minutes.

## Layout

```
hackathon/
├── stl-hackathon-2026-grid-starter/   # GRID data repo (clone separately, never commit)
└── read-the-rotate/                   # this repo
    ├── src/            # game (Phaser 4 + TypeScript + Vite), built in WebStorm
    ├── pipeline/       # Python scripts that turn GRID data into scenarios, built in PyCharm
    ├── public/packs/   # scenario packs: demo/ is committed, pro/ is generated and gitignored
    └── scripts/        # repo tooling
```

## Run the game

Requires Node 22+.

```bash
npm install
npm run dev      # http://localhost:8080
npm run build    # typecheck + production build into dist/
```

## Data pipeline

The GRID data is licensed for this hackathon only and may not be redistributed, including anything derived from it. So the data repo lives **next to** this repo, and generated packs go to gitignored folders.

```bash
git clone https://github.com/cloud9esports/stl-hackathon-2026-grid-starter.git ../stl-hackathon-2026-grid-starter
python -m venv .venv && .venv/Scripts/activate      # macOS/Linux: source .venv/bin/activate
pip install -r pipeline/requirements.txt
python pipeline/inspect_series.py <series_id>       # ids are in ../stl-hackathon-2026-grid-starter/val/series.csv
python pipeline/extract_scenarios.py                # first 30 series -> public/packs/pro/scenarios.json
python pipeline/extract_scenarios.py <series_id>... # or pick series; --max-series N to change the default
python -m unittest discover pipeline                # self-check on a synthetic feed, no data needed
```

A scenario is one planted round: each player's radar track from the end of buy phase until 5 s after the plant (`[t, x, y, alive]`, `t` in seconds), which side they are on, and the site. GRID has no site field, so sites come from k-means over every plant position on that map (3 sites on Haven and Lotus, 2 elsewhere). Player names and ids are dropped.

GRID only updates a player's position when an event involves them, so tracks are sparse (median gap about 3 s, longer for quiet players). The game should show how old each dot is.

Set `STL_DATA_DIR` if the data repo is somewhere else.

## Data guard

Git hooks in `.githooks/` block commits that contain GRID data or packs built from it, and commit messages that credit AI tools as co-authors. Enable them once per clone:

```bash
git config core.hooksPath .githooks
npm run check-data   # same check, on demand
```

## Credits and licence

MIT, see [LICENSE](LICENSE). Built on [phaserjs/template-vite-ts](https://github.com/phaserjs/template-vite-ts) (MIT). Match data is provided by GRID and is not part of this repository. VALORANT is a trademark of Riot Games, Inc. This project is not endorsed by Riot Games.
