import { Scene, GameObjects } from 'phaser';
import {
    CHOOSE_SECONDS, FRESH_SECONDS, ROUND_TIERS, UNKNOWN_SECONDS,
    lastSeen, pickRounds, positionAt, scoreFor, type Pack, type Round,
} from '../scenarios';
import { COLORS, FONT } from '../theme';

const RADAR = { x: 32, y: 60, size: 660 };
const SITE_RADIUS = 1800; // world units, about 18 m
const REVEAL_SPEED = 4;
const RESULT_SECONDS = 2;

type Phase = 'choose' | 'reveal' | 'result';

export class Game extends Scene
{
    rounds: Round[];
    index: number;
    score: number;
    streak: number;
    correct: number;
    phase: Phase;
    phaseStart: number;
    picked?: string;
    gained: number;
    project: (x: number, y: number) => { x: number; y: number };
    unitPx: number;

    gfx: GameObjects.Graphics;
    dotLabels: GameObjects.Text[];
    siteLabels: GameObjects.Text[];
    hud: GameObjects.Text;
    prompt: GameObjects.Text;

    constructor ()
    {
        super('Game');
    }

    create ()
    {
        this.rounds = pickRounds(this.registry.get('pack') as Pack);
        this.index = this.score = this.streak = this.correct = 0;

        this.gfx = this.add.graphics();
        this.dotLabels = Array.from({ length: 10 }, () =>
            this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '13px', color: COLORS.muted }).setOrigin(0.5));
        this.siteLabels = Array.from({ length: 3 }, () =>
            this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '28px', color: COLORS.siteText }).setOrigin(0.5));
        this.hud = this.add.text(740, 64, '', { fontFamily: FONT, fontSize: '22px', color: COLORS.text, lineSpacing: 10 });
        this.prompt = this.add.text(RADAR.x, 24, '', { fontFamily: FONT, fontSize: '24px', color: COLORS.text });
        const legend: [string, string][] = [
            ['Attackers', '#d85a30'], ['Defenders', '#1d9e75'], ['', ''],
            ['Faded: last seen', COLORS.muted], ['?: position unknown', COLORS.muted], ['X: dead', COLORS.muted],
        ];
        legend.forEach(([text, color], i) =>
            this.add.text(740, 520 + i * 28, text, { fontFamily: FONT, fontSize: '18px', color }));

        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onClick(p.x, p.y));
        this.startRound();
    }

    get round () { return this.rounds[this.index]; }

    startRound ()
    {
        this.setProjection(this.round);
        this.phase = 'choose';
        this.phaseStart = this.game.loop.time;
        this.picked = undefined;
        this.prompt.setText('Where will they plant? Click a site.');
    }

    /** Fit the map into the radar square, attackers' spawn at the bottom. */
    setProjection ({ scenario }: Round)
    {
        const { bounds, sites } = (this.registry.get('pack') as Pack).maps[scenario.map];
        const xs = [bounds.min.x, bounds.max.x, ...sites.map(s => s.x - SITE_RADIUS), ...sites.map(s => s.x + SITE_RADIUS)];
        const ys = [bounds.min.y, bounds.max.y, ...sites.map(s => s.y - SITE_RADIUS), ...sites.map(s => s.y + SITE_RADIUS)];
        const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const span = Math.max(maxX - minX, maxY - minY);
        const k = (RADAR.size - 40) / span;
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        const atk = scenario.players.filter(p => p.side === 'atk').map(p => p.track[0]);
        const atkY = atk.reduce((sum, p) => sum + p[2], 0) / atk.length;
        const flip = atkY > cy ? -1 : 1; // screen y grows down: attackers should end up below the centre
        const mid = RADAR.size / 2;
        this.project = (x, y) => ({ x: RADAR.x + mid + flip * (x - cx) * k, y: RADAR.y + mid + flip * (cy - y) * k });
        this.unitPx = k;
    }

    onClick (x: number, y: number)
    {
        if (this.phase !== 'choose') return;
        const sites = (this.registry.get('pack') as Pack).maps[this.round.scenario.map].sites;
        const hit = sites
            .map(s => ({ s, d: Math.hypot(this.project(s.x, s.y).x - x, this.project(s.x, s.y).y - y) }))
            .filter(h => h.d < SITE_RADIUS * this.unitPx * 1.4)
            .sort((a, b) => a.d - b.d)[0];
        if (hit) this.resolve(hit.s.label, this.secondsLeft());
    }

    secondsLeft () { return CHOOSE_SECONDS - (this.game.loop.time - this.phaseStart) / 1000; }

    resolve (site: string | undefined, secondsLeft: number)
    {
        const correct = site === this.round.scenario.site;
        this.streak = correct ? this.streak + 1 : 0;
        this.gained = scoreFor(correct, secondsLeft, this.streak);
        this.score += this.gained;
        this.correct += Number(correct);
        this.picked = site;
        this.phase = 'reveal';
        this.phaseStart = this.game.loop.time;
        this.prompt.setText(site ? `You called ${site}. Watch the round...` : 'Time is up. Watch the round...');
    }

    update ()
    {
        const elapsed = (this.game.loop.time - this.phaseStart) / 1000; // game loop clock: the scene clock is stale right after create()
        const { scenario, t } = this.round;
        const end = scenario.plant.t + 1;

        if (this.phase === 'choose') {
            if (elapsed >= CHOOSE_SECONDS) this.resolve(undefined, 0);
            else this.draw(t, false);
        } else if (this.phase === 'reveal') {
            const now = Math.min(t + elapsed * REVEAL_SPEED, end);
            this.draw(now, true);
            if (now >= end) {
                this.phase = 'result';
                this.phaseStart = this.game.loop.time;
                const right = this.picked === scenario.site;
                this.prompt.setText(right ? `Correct! +${this.gained}` : `They planted on ${scenario.site}.`);
                this.prompt.setColor(right ? COLORS.good : COLORS.bad);
            }
        } else if (elapsed < RESULT_SECONDS) {
            this.draw(end, true); // same frame as the reveal's last, now with the answer rings
        } else {
            this.prompt.setColor(COLORS.text);
            this.index++;
            if (this.index < this.rounds.length) this.startRound();
            else this.scene.start('GameOver', { score: this.score, correct: this.correct, total: this.rounds.length });
        }
    }

    draw (t: number, replay: boolean)
    {
        const { scenario } = this.round;
        const sites = (this.registry.get('pack') as Pack).maps[scenario.map].sites;
        const g = this.gfx.clear();

        g.fillStyle(COLORS.radar).fillRect(RADAR.x, RADAR.y, RADAR.size, RADAR.size);
        g.lineStyle(1, COLORS.grid);
        for (let i = 1; i < 8; i++) {
            const o = (RADAR.size / 8) * i;
            g.lineBetween(RADAR.x + o, RADAR.y, RADAR.x + o, RADAR.y + RADAR.size);
            g.lineBetween(RADAR.x, RADAR.y + o, RADAR.x + RADAR.size, RADAR.y + o);
        }

        const showAnswer = this.phase === 'result';
        this.siteLabels.forEach((label, i) => {
            const s = sites[i];
            label.setVisible(!!s);
            if (!s) return;
            const p = this.project(s.x, s.y);
            const answer = showAnswer && s.label === scenario.site;
            const wrongPick = showAnswer && s.label === this.picked && !answer;
            g.fillStyle(COLORS.site, s.label === this.picked || answer ? 0.35 : 0.14).fillCircle(p.x, p.y, SITE_RADIUS * this.unitPx);
            g.lineStyle(answer || wrongPick ? 4 : 1, answer ? COLORS.goodHex : wrongPick ? COLORS.badHex : COLORS.site)
                .strokeCircle(p.x, p.y, SITE_RADIUS * this.unitPx);
            label.setText(s.label).setPosition(p.x, p.y);
        });

        scenario.players.forEach((player, i) => {
            const color = player.side === 'atk' ? COLORS.atk : COLORS.def;
            const label = this.dotLabels[i].setText('');
            const seen = replay ? { ...positionAt(player.track, t), age: 0 } : lastSeen(player.track, t);
            if (!seen) return;
            const p = this.project(seen.x, seen.y);
            label.setPosition(p.x, p.y - 20);
            if (!seen.alive) {
                g.lineStyle(3, COLORS.dead).lineBetween(p.x - 7, p.y - 7, p.x + 7, p.y + 7).lineBetween(p.x + 7, p.y - 7, p.x - 7, p.y + 7);
            } else if (seen.age < FRESH_SECONDS) {
                g.fillStyle(color).fillCircle(p.x, p.y, 9);
            } else if (seen.age < UNKNOWN_SECONDS) {
                g.fillStyle(color, 0.3).fillCircle(p.x, p.y, 9).lineStyle(2, color, 0.8).strokeCircle(p.x, p.y, 9);
                label.setText(`${Math.round(seen.age)}s`);
            } else {
                g.lineStyle(2, color, 0.5).strokeCircle(p.x, p.y, 13);
                label.setText('?').setPosition(p.x, p.y);
            }
        });

        if (replay && t >= scenario.plant.t) {
            const p = this.project(scenario.plant.x, scenario.plant.y);
            g.fillStyle(COLORS.bomb).fillTriangle(p.x, p.y - 12, p.x + 10, p.y + 8, p.x - 10, p.y + 8);
        }

        if (this.phase === 'choose') {
            const left = Math.max(0, this.secondsLeft());
            g.fillStyle(COLORS.grid).fillRect(RADAR.x, RADAR.y + RADAR.size + 16, RADAR.size, 10);
            g.fillStyle(COLORS.site).fillRect(RADAR.x, RADAR.y + RADAR.size + 16, RADAR.size * left / CHOOSE_SECONDS, 10);
        }

        this.hud.setText([
            `Round ${this.index + 1}/${ROUND_TIERS.length}`,
            `Score ${this.score}`,
            this.streak > 1 ? `Streak x${this.streak}` : '',
        ].join('\n'));
    }
}
