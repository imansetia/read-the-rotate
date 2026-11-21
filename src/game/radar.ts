// Radar drawing shared by the game and the menu's attract replay.
import type { GameObjects } from 'phaser';
import { FRESH_SECONDS, UNKNOWN_SECONDS, lastSeen, positionAt, type Scenario, type Site } from './scenarios';
import { COLORS, dotRing, magnet } from './theme';

export const SITE_RADIUS = 1800; // world units, about 18 m
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

/** Players at time t: true positions in a replay, last sightings (with their age) while someone is reading the round. */
export function drawPlayers (g: GameObjects.Graphics, labels: GameObjects.Text[], scenario: Scenario, t: number,
    replay: boolean, project: Project)
{
    scenario.players.forEach((player, i) => {
        const atk = player.side === 'atk';
        const color = atk ? COLORS.atk : COLORS.def;
        const label = labels[i].setText('').setColor(atk ? COLORS.atkText : COLORS.defText);
        const seen = replay ? { ...positionAt(player.track, t), age: 0 } : lastSeen(player.track, t);
        if (!seen) return;
        const p = project(seen.x, seen.y);
        label.setPosition(p.x, p.y - 22);
        if (!seen.alive) {
            g.lineStyle(3, COLORS.dead).lineBetween(p.x - 7, p.y - 7, p.x + 7, p.y + 7).lineBetween(p.x + 7, p.y - 7, p.x - 7, p.y + 7);
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

export function drawBomb (g: GameObjects.Graphics, scenario: Scenario, t: number, project: Project)
{
    if (t < scenario.plant.t) return;
    const p = project(scenario.plant.x, scenario.plant.y);
    // Dark outline keeps the bomb readable when it lands on the site letter.
    g.lineStyle(4, 0x0c0d0e).strokeTriangle(p.x, p.y - 14, p.x + 12, p.y + 9, p.x - 12, p.y + 9)
        .fillStyle(COLORS.bomb).fillTriangle(p.x, p.y - 14, p.x + 12, p.y + 9, p.x - 12, p.y + 9);
}
