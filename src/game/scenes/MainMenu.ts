import { Scene, GameObjects } from 'phaser';
import { loadBoard } from '../booth';
import { SITE_RADIUS, drawBomb, drawCorridors, drawKills, drawPlayers, drawSites } from '../radar';
import { ROUND_COUNT, corridorCells, makeProjection, routedTracks, type Pack, type Scenario } from '../scenarios';
import { isMuted } from '../sound';
import { COLORS, HAND, LED, ledBackdrop } from '../theme';

const RADAR = { x: 40, y: 180, size: 480 };
const REPLAY_SPEED = 2;
const HOLD_SECONDS = 2.5; // answer stays on screen before the next replay

/** Attract screen: a real round replays on the left while the top scores sit on the right. */
export class MainMenu extends Scene
{
    mapGfx: GameObjects.Graphics;
    gfx: GameObjects.Graphics;
    dotLabels: GameObjects.Text[];
    siteLabels: GameObjects.Text[];
    soundOff: GameObjects.Text;
    replay: { scenario: Scenario; from: number; start: number; project: (x: number, y: number) => { x: number; y: number }; unitPx: number };

    constructor ()
    {
        super('MainMenu');
    }

    create ()
    {
        ledBackdrop(this);
        this.add.text(512, 96, 'READ THE ROTATE', { fontFamily: LED, fontSize: '72px', color: COLORS.amberText }).setOrigin(0.5);

        this.mapGfx = this.add.graphics();
        this.gfx = this.add.graphics();
        this.dotLabels = Array.from({ length: 10 }, () => this.add.text(0, 0, '', { fontFamily: HAND, fontSize: '15px' }).setOrigin(0.5));
        this.siteLabels = Array.from({ length: 3 }, () =>
            this.add.text(0, 0, '', { fontFamily: LED, fontSize: '32px', color: COLORS.amberText }).setOrigin(0.5));
        const demo = this.registry.get('demo');
        this.add.text(RADAR.x, RADAR.y + RADAR.size + 14, demo ? 'A demo round, replayed' : 'A pro round, replayed', {
            fontFamily: HAND, fontSize: '19px', color: COLORS.label,
        });

        const col = { fontFamily: HAND, color: COLORS.text, wordWrap: { width: 420 } };
        this.add.text(570, 180, `${demo ? 'Demo rounds (made up, no match data).' : 'Real pro rounds.'} Can you call the site before they plant?`,
            { ...col, fontSize: '25px' });
        this.add.text(570, 268, `${ROUND_COUNT} rounds, 6 seconds each. Click the site you think they will hit. Watch for rotates.`,
            { ...col, fontSize: '20px', color: COLORS.label });

        this.add.text(570, 360, 'TOP SCORES', { fontFamily: LED, fontSize: '22px', color: COLORS.label });
        const board = loadBoard().slice(0, 5);
        if (board.length === 0) this.add.text(570, 400, 'No scores yet. Set the first one.', { ...col, fontSize: '22px' });
        board.forEach((e, i) => this.add.text(570, 398 + i * 40, `${i + 1} ${e.name.padEnd(3)} ${String(e.score).padStart(4, '0')}`,
            { fontFamily: LED, fontSize: '32px', color: i === 0 ? COLORS.amberText : COLORS.text }));

        const start = this.add.text(780, 650, 'CLICK TO START', { fontFamily: LED, fontSize: '36px', color: COLORS.amberText }).setOrigin(0.5);
        this.time.addEvent({ delay: 600, loop: true, callback: () => start.setVisible(!start.visible) }); // LED blink, not a fade

        this.soundOff = this.add.text(1004, 748, 'SOUND OFF (M)', { fontFamily: LED, fontSize: '16px', color: COLORS.label }).setOrigin(1);
        this.nextReplay();
        this.input.once('pointerdown', () => this.scene.start('Game'));
    }

    nextReplay ()
    {
        const pack = this.registry.get('pack') as Pack;
        const pool = pack.scenarios.filter(s => Object.keys(s.snaps).length);
        const scenario = pool[Math.floor(Math.random() * pool.length)];
        const { project, unitPx } = makeProjection(pack.maps[scenario.map], scenario, RADAR.size, SITE_RADIUS);
        this.replay = {
            scenario, from: Math.min(...Object.values(scenario.snaps)), start: this.game.loop.time, unitPx,
            project: (x, y) => { const p = project(x, y); return { x: RADAR.x + p.x, y: RADAR.y + p.y }; },
        };
        drawCorridors(this.mapGfx, corridorCells(pack, scenario.map), this.replay.project, unitPx);
        routedTracks(pack, scenario); // routes cached before the first frame draws them
    }

    update ()
    {
        this.soundOff.setVisible(isMuted());
        const { scenario, from, start, project, unitPx } = this.replay;
        const end = scenario.plant.t + 1;
        const t = from + ((this.game.loop.time - start) / 1000) * REPLAY_SPEED;
        if (t > end + HOLD_SECONDS * REPLAY_SPEED) return this.nextReplay();

        const g = this.gfx.clear();
        g.lineStyle(1, COLORS.frame).strokeRect(RADAR.x, RADAR.y, RADAR.size, RADAR.size);
        const sites = (this.registry.get('pack') as Pack).maps[scenario.map].sites;
        drawSites(g, this.siteLabels, sites, project, unitPx, label =>
            (t >= end && label === scenario.site ? { color: COLORS.goodHex, strong: true } : { color: COLORS.amber, strong: false }));
        const routes = routedTracks(this.registry.get('pack') as Pack, scenario);
        drawKills(g, scenario, Math.min(t, end), routes, project);
        drawPlayers(g, this.dotLabels, scenario, Math.min(t, end), routes, project);
        drawBomb(g, scenario, Math.min(t, end), project);
    }
}
