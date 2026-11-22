// Scenario pack format written by pipeline/extract_scenarios.py, plus the pure game rules.

export type Point = [t: number, x: number, y: number, alive: boolean];
export type Tier = '1' | '2' | '3';

export interface Site { label: string; x: number; y: number }
export interface MapInfo { bounds: { min: { x: number; y: number }; max: { x: number; y: number } }; sites: Site[] }
export interface Player { side: 'atk' | 'def'; track: Point[] }
export interface Scenario {
    id: string;
    map: string;
    site: string;
    plant: { t: number; x: number; y: number };
    snaps: Partial<Record<Tier, number>>;
    players: Player[];
    kills?: [number, number, number][]; // [t, shooter, victim] as indexes into players; older packs have none
}
export interface Pack { maps: Record<string, MapInfo>; scenarios: Scenario[] }

export const CHOOSE_SECONDS = 6;
export const FRESH_SECONDS = 3;
export const UNKNOWN_SECONDS = 10;
const CLEAR_LEAN = 1800; // world units (about 18 m): how much closer the team must be to the site it then leaves

/**
 * A session: 20 rounds, later rounds shown earlier before the plant, and a rising share of real rotates
 * (rounds where the attackers truly lined up on one site, then planted on another).
 */
export const ROUND_PLAN: { tier: Tier; rounds: number; rotates: number }[] = [
    { tier: '1', rounds: 6, rotates: 1 },
    { tier: '2', rounds: 7, rotates: 3 },
    { tier: '3', rounds: 7, rotates: 4 },
];
export const ROUND_COUNT = ROUND_PLAN.reduce((n, p) => n + p.rounds, 0);

export interface Round { scenario: Scenario; t: number; rotate: boolean }
export type Read = 'plain' | 'rotate' | 'murky';

/**
 * How the radar at time t reads. 'plain': the attackers lean toward the site they plant on. 'rotate': the team has
 * lined up on another site (at least 3 attackers nearest it, at most 1 nearest the real one, fresh sightings that
 * the later data confirms) and at least 2 of them then walked to the real site and were there, alive, at the plant. 'murky': the read is wrong only because of stale or scattered
 * data; such rounds would be a guess, so sessions skip them.
 */
export function readAt (map: MapInfo, scenario: Scenario, t: number): Read
{
    const atk = scenario.players.filter(p => p.side === 'atk');
    const seen = atk.map(p => lastSeen(p.track, t)).filter(s => s?.alive) as { x: number; y: number; age: number }[];
    if (seen.length === 0) return 'murky';
    const centre = (pts: { x: number; y: number }[]) => ({
        x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length,
    });
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    const nearest = (pt: { x: number; y: number }) => map.sites.reduce((a, b) => (dist(pt, a) <= dist(pt, b) ? a : b));
    const c = centre(seen);
    const obvious = nearest(c);
    if (obvious.label === scenario.site) return 'plain';
    const actual = map.sites.find(s => s.label === scenario.site)!;
    const truth = atk.map(p => positionAt(p.track, t)).filter(p => p.alive);
    const votes = (label: string) => seen.filter(s => nearest(s).label === label).length;
    const movers = atk.filter(p => {
        const then = lastSeen(p.track, t), end = positionAt(p.track, scenario.plant.t);
        return then?.alive && nearest(then).label === obvious.label && end.alive && nearest(end).label === actual.label;
    }).length;
    const real = votes(obvious.label) >= 3 && votes(actual.label) <= 1 && movers >= 2
        && seen.filter(s => s.age < FRESH_SECONDS).length >= 3 && truth.length > 0
        && nearest(centre(truth)).label === obvious.label && dist(c, actual) - dist(c, obvious) > CLEAR_LEAN;
    return real ? 'rotate' : 'murky';
}

/** One session following ROUND_PLAN, rotates shuffled within each tier, no scenario twice. */
export function pickRounds (pack: Pack, random: () => number = Math.random): Round[]
{
    const used = new Set<string>();
    const rounds: Round[] = [];
    for (const { tier, rounds: count, rotates } of ROUND_PLAN) {
        const kinds = Array.from({ length: count }, (_, i) => i < rotates);
        for (let i = kinds.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
        }
        const candidates = pack.scenarios
            .filter(s => s.snaps[tier] !== undefined)
            .map(s => ({ s, read: readAt(pack.maps[s.map], s, s.snaps[tier]!) }))
            .filter(c => c.read !== 'murky');
        for (const rotate of kinds) {
            const free = candidates.filter(c => !used.has(c.s.id));
            // shortcut: a small pack may lack rotates (or plain rounds) for a tier; take the other kind instead of failing
            const pool = free.filter(c => (c.read === 'rotate') === rotate);
            const from = pool.length ? pool : free;
            if (from.length === 0) throw new Error(`No scenarios left for tier ${tier}`);
            const { s, read } = from[Math.floor(random() * from.length)];
            used.add(s.id);
            rounds.push({ scenario: s, t: s.snaps[tier]!, rotate: read === 'rotate' });
        }
    }
    return rounds;
}

/** What the radar knows at time t: the last recorded position and how old it is. */
export function lastSeen (track: Point[], t: number) {
    let last: Point | undefined;
    for (const p of track) {
        if (p[0] > t) break;
        last = p;
    }
    return last && { x: last[1], y: last[2], alive: last[3], age: t - last[0] };
}

/** Where the player probably was at time t (straight line between records), for the reveal replay. */
export function positionAt (track: Point[], t: number) {
    const next = track.findIndex(p => p[0] > t);
    if (next <= 0) {
        const p = next === 0 ? track[0] : track[track.length - 1];
        return { x: p[1], y: p[2], alive: p[3] };
    }
    const a = track[next - 1], b = track[next];
    const k = (t - a[0]) / (b[0] - a[0]);
    return { x: a[1] + (b[1] - a[1]) * k, y: a[2] + (b[2] - a[2]) * k, alive: a[3] };
}

/** Correct: 100, up to +50 for answering fast, +20 per answer in a streak after the first. */
export function scoreFor (correct: boolean, secondsLeft: number, streak: number) {
    if (!correct) return 0;
    return 100 + Math.round(50 * Math.max(0, secondsLeft) / CHOOSE_SECONDS) + 20 * Math.max(0, streak - 1);
}

/**
 * Map world coordinates onto a square radar of `size` px. The map is turned so its two farthest-apart sites sit
 * level, then flipped if needed so the attackers' spawn is at the bottom. The turn depends only on the map's sites
 * (plus which side the attackers start), so a map looks the same every round. Rotation only, never a mirror, so
 * the map keeps its real left and right.
 */
export function makeProjection (map: MapInfo, scenario: Scenario, size: number, siteRadius: number)
{
    let [p, q] = [map.sites[0], map.sites[1]];
    for (const a of map.sites) for (const b of map.sites) if (Math.hypot(a.x - b.x, a.y - b.y) > Math.hypot(p.x - q.x, p.y - q.y)) [p, q] = [a, b];
    let turn = -Math.atan2(q.y - p.y, q.x - p.x);
    const rot = (x: number, y: number) => [x * Math.cos(turn) - y * Math.sin(turn), x * Math.sin(turn) + y * Math.cos(turn)];
    const atk = scenario.players.filter(pl => pl.side === 'atk').map(pl => rot(pl.track[0][1], pl.track[0][2])[1]);
    const sites = map.sites.map(s => rot(s.x, s.y)[1]);
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    if (mean(atk) > mean(sites)) turn += Math.PI; // world y points up: attackers belong below the sites

    // Fit the map, the sites and every recorded position (a few GRID positions fall outside the map bounds).
    const { min, max } = map.bounds;
    const pts = [[min.x, min.y], [min.x, max.y], [max.x, min.y], [max.x, max.y]].map(([x, y]) => rot(x, y));
    for (const s of map.sites) {
        const [x, y] = rot(s.x, s.y);
        pts.push([x - siteRadius, y - siteRadius], [x + siteRadius, y + siteRadius]);
    }
    for (const pl of scenario.players) for (const t of pl.track) pts.push(rot(t[1], t[2]));
    const xs = pts.map(pt => pt[0]), ys = pts.map(pt => pt[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const unitPx = (size - 40) / Math.max(maxX - minX, maxY - minY);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const project = (x: number, y: number) => {
        const [rx, ry] = rot(x, y);
        return { x: size / 2 + (rx - cx) * unitPx, y: size / 2 - (ry - cy) * unitPx }; // screen y grows down
    };
    return { project, unitPx };
}

const CELL = 150; // world units per corridor cell, about 1.5 m
const RUN_SPEED = 700; // world units per second, a little above full running speed
const hitsCache = new WeakMap<Pack, Map<string, Map<string, number>>>();
const cellKey = (x: number, y: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;

/** How many recorded positions fall in each cell of a map. */
function cellHits (pack: Pack, map: string)
{
    let byMap = hitsCache.get(pack);
    if (!byMap) hitsCache.set(pack, byMap = new Map());
    let hits = byMap.get(map);
    if (!hits) {
        hits = new Map();
        for (const s of pack.scenarios) {
            if (s.map !== map) continue;
            for (const p of s.players) for (const [, x, y] of p.track) hits.set(cellKey(x, y), (hits.get(cellKey(x, y)) ?? 0) + 1);
        }
        byMap.set(map, hits);
    }
    return hits;
}

/**
 * Where players have stood on a map, as cell centres in world units: the walkable corridors, with walls left dark.
 * Built from the pack's own positions, so no map art is needed. Every recorded cell counts, because the replay
 * routes through exactly these cells and the radar must show where it walks.
 */
export function corridorCells (pack: Pack, map: string): [number, number][]
{
    return [...cellHits(pack, map).keys()].map(key => {
        const [i, j] = key.split(',').map(Number);
        return [(i + 0.5) * CELL, (j + 0.5) * CELL] as [number, number];
    });
}

/** True if the straight line from a to b stays on cells someone has stood in. */
function clearLine (open: Set<string>, ax: number, ay: number, bx: number, by: number)
{
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / (CELL / 3));
    for (let k = 1; k < steps; k++) if (!open.has(cellKey(ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps))) return false;
    return true;
}

/** Shortest walk over open cells (8 neighbours, no cutting corners), as cell centres; undefined if none nearby. */
function walk (open: Set<string>, ax: number, ay: number, bx: number, by: number): [number, number][] | undefined
{
    const [si, sj] = [Math.floor(ax / CELL), Math.floor(ay / CELL)], [ti, tj] = [Math.floor(bx / CELL), Math.floor(by / CELL)];
    const margin = 40; // cells: how far the search may stray from the box around both ends
    const [minI, maxI] = [Math.min(si, ti) - margin, Math.max(si, ti) + margin];
    const [minJ, maxJ] = [Math.min(sj, tj) - margin, Math.max(sj, tj) + margin];
    const isOpen = (i: number, j: number) => (i === ti && j === tj) || open.has(`${i},${j}`);
    const from = new Map<string, string | null>([[`${si},${sj}`, null]]);
    let queue: [number, number][] = [[si, sj]];
    while (queue.length) {
        const next: [number, number][] = [];
        for (const [i, j] of queue) {
            if (i === ti && j === tj) {
                const path: [number, number][] = [];
                for (let k: string | null = `${i},${j}`; k; k = from.get(k)!) {
                    const [ci, cj] = k.split(',').map(Number);
                    path.unshift([(ci + 0.5) * CELL, (cj + 0.5) * CELL]);
                }
                return path;
            }
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
                const [ni, nj] = [i + di, j + dj];
                const k = `${ni},${nj}`;
                if (ni < minI || ni > maxI || nj < minJ || nj > maxJ || from.has(k) || !isOpen(ni, nj)) continue;
                if (di && dj && !(isOpen(i + di, j) && isOpen(i, j + dj))) continue; // no squeezing past a wall corner
                from.set(k, `${i},${j}`);
                next.push([ni, nj]);
            }
        }
        queue = next;
    }
    return undefined;
}

/**
 * The walk from a to b over `cells` (open, or widened to bridge gaps), pulled tight, as corner points; undefined
 * if none fits. Pulling only takes shortcuts that stay on recorded cells, so a bridge never becomes a long chord.
 */
function corridorWalk (open: Set<string>, walkable: Set<string>, ax: number, ay: number, bx: number, by: number, seconds: number)
{
    const cells = walk(walkable, ax, ay, bx, by);
    if (!cells) return undefined;
    // Pull the string tight: from each corner, go straight to the farthest point still in sight.
    const pts: [number, number][] = [[ax, ay], ...cells.slice(1, -1), [bx, by]];
    const route: [number, number][] = [pts[0]];
    for (let i = 0; i < pts.length - 1;) {
        let j = pts.length - 1;
        while (j > i + 1 && !clearLine(open, pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--;
        route.push(pts[j]);
        i = j;
    }
    const legs = route.slice(1).map(([x, y], i) => Math.hypot(x - route[i][0], y - route[i][1]));
    const length = legs.reduce((a, d) => a + d, 0);
    return length <= seconds * RUN_SPEED + 4 * CELL ? { route, legs, length } : undefined;
}

/** Open cells plus their neighbours: closes the one-cell gaps where nobody happened to be recorded. */
function widen (open: Set<string>)
{
    const wide = new Set(open);
    for (const k of open) {
        const [i, j] = k.split(',').map(Number);
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) wide.add(`${i + di},${j + dj}`);
    }
    return wide;
}

/** A replay track, plus the stretches where the player's way is unknown and the radar should say so. */
export interface Route { track: Point[]; hidden: [number, number][] }

/**
 * A track for the replay that walks the corridors between sightings instead of a straight line through walls.
 * The route is the shortest plausible walk, not the exact one (the data only has the sightings). When no walk
 * fits (corridors not connected in the data, or too far for the time) the move is marked hidden rather than
 * drawn through a wall: the radar keeps the player at the last sighting until the next one.
 */
export function routeTrack (open: Set<string>, track: Point[], wide = widen(open)): Route
{
    const out: Point[] = [track[0]];
    const hidden: [number, number][] = [];
    for (let n = 1; n < track.length; n++) {
        const [t0, ax, ay, alive] = track[n - 1], b = track[n];
        const [t1, bx, by] = b;
        if (Math.hypot(bx - ax, by - ay) > 2 * CELL && !clearLine(open, ax, ay, bx, by)) {
            const found = corridorWalk(open, open, ax, ay, bx, by, t1 - t0) ?? corridorWalk(open, wide, ax, ay, bx, by, t1 - t0);
            if (found) {
                let done = 0;
                for (let i = 1; i < found.route.length - 1; i++) {
                    done += found.legs[i - 1];
                    out.push([t0 + ((t1 - t0) * done) / found.length, found.route[i][0], found.route[i][1], alive]);
                }
            } else {
                hidden.push([t0, t1]);
            }
        }
        out.push(b);
    }
    return { track: out, hidden };
}

const routeCache = new WeakMap<Scenario, Route[]>();

/** Replay routes for every player of a scenario (same order as scenario.players), cached per scenario. */
export function routedTracks (pack: Pack, scenario: Scenario): Route[]
{
    let routes = routeCache.get(scenario);
    if (!routes) {
        const open = new Set(cellHits(pack, scenario.map).keys());
        const wide = widen(open);
        routes = scenario.players.map(p => routeTrack(open, p.track, wide));
        routeCache.set(scenario, routes);
    }
    return routes;
}

const NEAR_SITE = 3600; // world units (about 36 m): close enough to say "near B"

/** Plain facts about the round from the data, never a guessed reason: who stood where, and who fell first. */
export function roundFacts (map: MapInfo, scenario: Scenario, t: number): string[]
{
    const near = (x: number, y: number) => {
        const s = map.sites.reduce((a, b) => (Math.hypot(x - a.x, y - a.y) <= Math.hypot(x - b.x, y - b.y) ? a : b));
        return Math.hypot(x - s.x, y - s.y) <= NEAR_SITE ? s.label : undefined;
    };
    const counts = new Map<string, number>();
    let elsewhere = 0;
    for (const p of scenario.players) {
        if (p.side !== 'def') continue;
        const s = lastSeen(p.track, t);
        if (!s?.alive) continue;
        const label = near(s.x, s.y);
        if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
        else elsewhere++;
    }
    const parts = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label, n]) => `${n} near ${label}`);
    if (elsewhere) parts.push(`${elsewhere} elsewhere`);
    const facts = [parts.length ? `Defenders on your radar: ${parts.join(', ')}.` : 'No defender was on your radar.'];

    // Players already down when you read it: a lost fight at a site is the most common reason to rotate.
    const down = new Map<string, number>();
    for (const p of scenario.players) {
        const s = lastSeen(p.track, t);
        if (!s || s.alive) continue;
        const where = near(s.x, s.y);
        const key = `${p.side === 'atk' ? 'attacker' : 'defender'}|${where ? `near ${where}` : 'away from the sites'}`;
        down.set(key, (down.get(key) ?? 0) + 1);
    }
    if (down.size) {
        facts.unshift(`Already down: ${[...down].map(([key, n]) => {
            const [who, where] = key.split('|');
            return `${n} ${who}${n > 1 ? 's' : ''} ${where}`;
        }).join(', ')}.`);
    }

    let first: { side: string; at: Point } | undefined;
    for (const p of scenario.players) {
        const death = p.track.find(q => !q[3] && q[0] > t && q[0] <= scenario.plant.t);
        if (death && (!first || death[0] < first.at[0])) first = { side: p.side, at: death };
    }
    if (!first) facts.push('Nobody went down before the plant.');
    else {
        const label = near(first.at[1], first.at[2]);
        facts.push(`First player down after that: ${first.side === 'atk' ? 'an attacker' : 'a defender'}, ${label ? `near ${label}` : 'away from the sites'}.`);
    }
    return facts;
}
