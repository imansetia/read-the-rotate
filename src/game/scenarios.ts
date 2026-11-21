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
}
export interface Pack { maps: Record<string, MapInfo>; scenarios: Scenario[] }

export const ROUND_TIERS: Tier[] = ['1', '1', '1', '2', '2', '2', '2', '3', '3', '3'];
export const CHOOSE_SECONDS = 6;
export const FRESH_SECONDS = 3;
export const UNKNOWN_SECONDS = 10;

export interface Round { scenario: Scenario; t: number }

/** One session: scenarios that have a snapshot for each round's tier, no repeats. */
export function pickRounds (pack: Pack, random: () => number = Math.random): Round[] {
    const used = new Set<string>();
    return ROUND_TIERS.map(tier => {
        const pool = pack.scenarios.filter(s => s.snaps[tier] !== undefined && !used.has(s.id));
        if (pool.length === 0) throw new Error(`No scenarios left for tier ${tier}`);
        const scenario = pool[Math.floor(random() * pool.length)];
        used.add(scenario.id);
        return { scenario, t: scenario.snaps[tier]! };
    });
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
