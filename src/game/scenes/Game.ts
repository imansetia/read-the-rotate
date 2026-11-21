import { Scene, GameObjects } from 'phaser';
import { idleReset } from '../booth';
import { SITE_RADIUS, drawBomb, drawPlayers, drawSites } from '../radar';
import { CHOOSE_SECONDS, ROUND_TIERS, makeProjection, pickRounds, scoreFor, type Pack, type Round } from '../scenarios';
import { COLORS, HAND, LED, ledBackdrop } from '../theme';

const RADAR = { x: 32, y: 60, size: 660 };
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
    roundText: GameObjects.Text;
    scoreText: GameObjects.Text;
    streakText: GameObjects.Text[];
    prompt: GameObjects.Text;

    constructor ()
    {
        super('Game');
    }

    create ()
    {
        this.rounds = pickRounds(this.registry.get('pack') as Pack);
        this.index = this.score = this.streak = this.correct = 0;

        ledBackdrop(this);
        this.gfx = this.add.graphics();
        this.dotLabels = Array.from({ length: 10 }, () =>
            this.add.text(0, 0, '', { fontFamily: HAND, fontSize: '17px', color: COLORS.text }).setOrigin(0.5));
        this.siteLabels = Array.from({ length: 3 }, () =>
            this.add.text(0, 0, '', { fontFamily: LED, fontSize: '40px', color: COLORS.amberText }).setOrigin(0.5));
        const led = (y: number, size: number, color: string, text = '') =>
            this.add.text(740, y, text, { fontFamily: LED, fontSize: `${size}px`, color });
        led(64, 20, COLORS.label, 'ROUND');
        this.roundText = led(90, 48, COLORS.amberText);
        led(170, 20, COLORS.label, 'SCORE');
        this.scoreText = led(196, 48, COLORS.amberText);
        this.streakText = [led(276, 20, COLORS.label, 'STREAK'), led(302, 48, COLORS.amberText)];
        this.prompt = this.add.text(RADAR.x, 18, '', { fontFamily: LED, fontSize: '28px', color: COLORS.amberText });
        // Notes in marker, like a coach's whiteboard next to the board.
        const legend: [string, string][] = [
            ['red: attackers', COLORS.atkText], ['blue: defenders', COLORS.defText], ['', ''],
            ['dotted: last seen', COLORS.text], ['?: position unknown', COLORS.text], ['x: dead', COLORS.text],
        ];
        legend.forEach(([text, color], i) =>
            this.add.text(740, 520 + i * 30, text, { fontFamily: HAND, fontSize: '21px', color }));

        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onClick(p.x, p.y));
        idleReset(this, 30); // about three unanswered rounds: the player has left
        this.startRound();
    }

    get round () { return this.rounds[this.index]; }

    startRound ()
    {
        this.setProjection(this.round);
        this.phase = 'choose';
        this.phaseStart = this.game.loop.time;
        this.picked = undefined;
        this.prompt.setText('WHERE WILL THEY PLANT?');
    }

    setProjection ({ scenario }: Round)
    {
        const { project, unitPx } = makeProjection((this.registry.get('pack') as Pack).maps[scenario.map], scenario, RADAR.size, SITE_RADIUS);
        this.project = (x, y) => { const p = project(x, y); return { x: RADAR.x + p.x, y: RADAR.y + p.y }; };
        this.unitPx = unitPx;
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
        this.prompt.setText(site ? `YOU CALLED ${site}. WATCH...` : 'TIME IS UP. WATCH...');
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
                this.prompt.setText(right ? `CORRECT +${this.gained}` : `THEY PLANTED ON ${scenario.site}`);
                this.prompt.setColor(right ? COLORS.good : COLORS.bad);
            }
        } else if (elapsed < RESULT_SECONDS) {
            this.draw(end, true); // same frame as the reveal's last, now with the answer rings
        } else {
            this.prompt.setColor(COLORS.amberText);
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

        g.lineStyle(1, COLORS.frame).strokeRect(RADAR.x, RADAR.y, RADAR.size, RADAR.size);

        const showAnswer = this.phase === 'result';
        drawSites(g, this.siteLabels, sites, this.project, this.unitPx, label => {
            const answer = showAnswer && label === scenario.site;
            const wrongPick = showAnswer && label === this.picked && !answer;
            return { color: answer ? COLORS.goodHex : wrongPick ? COLORS.badHex : COLORS.amber, strong: answer || label === this.picked };
        });
        drawPlayers(g, this.dotLabels, scenario, t, replay, this.project);
        if (replay) drawBomb(g, scenario, t, this.project);

        if (this.phase === 'choose') {
            const n = 48, lit = Math.ceil((n * Math.max(0, this.secondsLeft())) / CHOOSE_SECONDS);
            for (let i = 0; i < n; i++) {
                g.fillStyle(i < lit ? COLORS.amber : COLORS.amberOff)
                    .fillCircle(RADAR.x + 6 + (i * (RADAR.size - 12)) / (n - 1), RADAR.y + RADAR.size + 22, 4);
            }
        }

        this.roundText.setText(`${String(this.index + 1).padStart(2, '0')}/${ROUND_TIERS.length}`);
        this.scoreText.setText(String(this.score).padStart(4, '0'));
        this.streakText[1].setText(`x${this.streak}`);
        this.streakText.forEach(text => text.setVisible(this.streak > 1));
    }
}
