// Radar drawing shared by the game and the menu's attract replay.
import type { GameObjects } from 'phaser';
import { FRESH_SECONDS, UNKNOWN_SECONDS, lastSeen, positionAt, type Route, type Scenario, type Site } from './scenarios';
import { COLORS, dotRing, magnet } from './theme';

export const SITE_RADIUS = 1800; // world units, about 18 m
const KILL_SECONDS = 4; // round time a shot line stays up: one real second at the reveal's 4x
type Project = (x: number, y: number) => { x: number; y: number };
export interface SiteLook { color: number; strong: boolean }

export function drawSites (g: GameObjects.Graphics, labels: GameObjects.Text[], sites: Site[], project: Project,
    unitPx: number, look: (label: string) => SiteLook)
{
    labels.forEach((label, i) => {
        const s = sites[i];
        label.setVisible(!!s);
        if (!s) return;
        const p = project(s.x, s.y), r = SITE_RADIUS * unitPx, { color, strong } = look(s.label);
        if (strong) g.fillStyle(COLORS.amber, 0.1).fillCircle(p.x, p.y, r);
        dotRing(g, p.x, p.y, r, color, { size: strong ? 3.2 : 2.2 });
        label.setText(s.label).setPosition(p.x, p.y);
    });
}

/** Players at time t: positions along the routed tracks in a replay, last sightings (with their age) while someone is reading the round. */
export function drawPlayers (g: GameObjects.Graphics, labels: GameObjects.Text[], scenario: Scenario, t: number,
    replay: Route[] | undefined, project: Project)
{
    scenario.players.forEach((player, i) => {
        const atk = player.side === 'atk';
        const color = atk ? COLORS.atk : COLORS.def;
        const label = labels[i].setText('').setColor(atk ? COLORS.atkText : COLORS.defText);
        // Replay walks the routed tracks; while reading, only real sightings count.
        // An unknown stretch of the replay looks like a stale sighting: parked where last seen, ring and age.
        const seen = replay ? replayAt(replay[i], t) : lastSeen(player.track, t);
        if (!seen) return;
        const p = project(seen.x, seen.y);
        label.setPosition(p.x, p.y - 22);
        if (!seen.alive) {
            g.lineStyle(3, atk ? COLORS.atkDead : COLORS.defDead).lineBetween(p.x - 7, p.y - 7, p.x + 7, p.y + 7).lineBetween(p.x + 7, p.y - 7, p.x - 7, p.y + 7);
        } else if (seen.age < FRESH_SECONDS) {
            magnet(g, p.x, p.y, color, atk ? COLORS.atkRim : COLORS.defRim);
        } else if (seen.age < UNKNOWN_SECONDS) {
            dotRing(g, p.x, p.y, 10, color, { size: 1.8, gap: 5 });
            label.setText(`${Math.round(seen.age)}s`);
        } else {
            dotRing(g, p.x, p.y, 13, color, { alpha: 0.5, size: 1.6, gap: 6 });
            label.setText('?').setPosition(p.x, p.y);
        }
    });
}

function replayAt (route: Route, t: number)
{
    const gap = route.hidden.find(([from, to]) => t > from && t < to);
    return gap ? { ...positionAt(route.track, gap[0]), age: t - gap[0] } : { ...positionAt(route.track, t), age: 0 };
}

/** Each kill as a dotted line from the shooter to the victim, in the shooter's colour, fading out. */
export function drawKills (g: GameObjects.Graphics, scenario: Scenario, t: number, replay: Route[], project: Project)
{
    for (const [at, shooter, victim] of scenario.kills ?? []) {
        const fade = 1 - (t - at) / KILL_SECONDS;
        if (fade <= 0 || fade > 1) continue;
        const a = replayAt(replay[shooter], at), b = replayAt(replay[victim], at);
        const from = project(a.x, a.y), to = project(b.x, b.y);
        const n = Math.max(2, Math.round(Math.hypot(to.x - from.x, to.y - from.y) / 6));
        g.fillStyle(scenario.players[shooter].side === 'atk' ? COLORS.atkShot : COLORS.defShot, Math.min(1, 2 * fade)); // full strength for the first half
        for (let k = 0; k <= n; k++) g.fillCircle(from.x + ((to.x - from.x) * k) / n, from.y + ((to.y - from.y) * k) / n, 2.8);
    }
}

/** The map's walkable corridors as dim LED dots, drawn once per round on their own layer. */
export function drawCorridors (g: GameObjects.Graphics, cells: [number, number][], project: Project, unitPx: number)
{
    g.clear().fillStyle(COLORS.corridor);
    const r = Math.max(1, 150 * unitPx * 0.3); // a third of a 1.5 m cell
    for (const [x, y] of cells) {
        const p = project(x, y);
        g.fillCircle(p.x, p.y, r);
    }
}

export function drawBomb (g: GameObjects.Graphics, scenario: Scenario, t: number, project: Project)
{
    if (t < scenario.plant.t) return;
    const p = project(scenario.plant.x, scenario.plant.y);
    // Dark outline keeps the bomb readable when it lands on the site letter.
    g.lineStyle(4, 0x0c0d0e).strokeTriangle(p.x, p.y - 14, p.x + 12, p.y + 9, p.x - 12, p.y + 9)
        .fillStyle(COLORS.bomb).fillTriangle(p.x, p.y - 14, p.x + 12, p.y + 9, p.x - 12, p.y + 9);
}
