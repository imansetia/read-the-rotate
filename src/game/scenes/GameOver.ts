import { Scene, GameObjects } from 'phaser';
import { BOARD_SIZE, betterThan, idleReset, insert, loadBoard, rankOf, recordScore, saveBoard } from '../booth';
import { sfx } from '../sound';
import { COLORS, HAND, LED, ledBackdrop } from '../theme';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export class GameOver extends Scene
{
    constructor ()
    {
        super('GameOver');
    }

    create ({ score, correct, total }: { score: number; correct: number; total: number })
    {
        ledBackdrop(this);
        this.add.text(512, 90, 'FINAL SCORE', { fontFamily: LED, fontSize: '26px', color: COLORS.label }).setOrigin(0.5);
        this.add.text(512, 175, String(score).padStart(4, '0'), { fontFamily: LED, fontSize: '110px', color: COLORS.amberText }).setOrigin(0.5);
        this.add.text(512, 255, `You read ${correct} of ${total} rounds like a pro`, {
            fontFamily: HAND, fontSize: '30px', color: COLORS.text,
        }).setOrigin(0.5);
        const beat = betterThan(recordScore(score), score);
        if (beat !== undefined) {
            this.add.text(512, 293, `Better than ${beat}% of players at this booth`, {
                fontFamily: HAND, fontSize: '24px', color: COLORS.good,
            }).setOrigin(0.5);
        }
        sfx.fanfare();
        idleReset(this, 30); // a player who walks off without initials does not block the next one

        const rank = rankOf(loadBoard(), score);
        if (rank < 0) this.showBoard(-1);
        else this.askInitials(score, rank);
    }

    /** Mouse-only initials: arrows above and below each letter, or type them if there is a keyboard. */
    askInitials (score: number, rank: number)
    {
        const letters = [0, 0, 0];
        let slot = 0;
        const ui: GameObjects.GameObject[] = [];
        ui.push(this.add.text(512, 340, `Top ${BOARD_SIZE}! Type your initials or use the arrows.`, {
            fontFamily: HAND, fontSize: '28px', color: COLORS.good,
        }).setOrigin(0.5));
        const gfx = this.add.graphics();
        ui.push(gfx);
        const xs = [432, 512, 592];
        const texts = xs.map(x => this.add.text(x, 470, '', { fontFamily: LED, fontSize: '80px' }).setOrigin(0.5));
        ui.push(...texts);
        const render = () => texts.forEach((t, i) => t.setText(LETTERS[letters[i]]).setColor(i === slot ? COLORS.amberText : COLORS.text));
        const step = (i: number, by: number) => {
            letters[i] = (letters[i] + by + LETTERS.length) % LETTERS.length;
            slot = i;
            render();
        };
        xs.forEach((x, i) => {
            gfx.fillStyle(COLORS.amber).fillTriangle(x, 395, x + 18, 420, x - 18, 420).fillTriangle(x, 548, x + 18, 523, x - 18, 523);
            ui.push(this.add.zone(x, 407, 70, 50).setInteractive().on('pointerdown', () => step(i, 1)));
            ui.push(this.add.zone(x, 535, 70, 50).setInteractive().on('pointerdown', () => step(i, -1)));
            ui.push(this.add.zone(x, 470, 70, 80).setInteractive().on('pointerdown', () => { slot = i; render(); }));
        });
        const save = this.add.text(512, 620, 'SAVE', { fontFamily: LED, fontSize: '40px', color: COLORS.amberText })
            .setOrigin(0.5).setInteractive();
        ui.push(save);

        const onKey = (e: KeyboardEvent) => {
            if (e.repeat) return;
            const i = LETTERS.indexOf(e.key.toUpperCase());
            if (e.key.length === 1 && i >= 0) { letters[slot] = i; slot = Math.min(2, slot + 1); render(); }
            else if (e.key === 'Backspace') { slot = Math.max(0, slot - 1); render(); }
            else if (e.key === 'Enter') done();
        };
        const done = () => {
            window.removeEventListener('keydown', onKey);
            const board = insert(loadBoard(), { name: letters.map(i => LETTERS[i]).join(''), score });
            saveBoard(board);
            ui.forEach(o => o.destroy());
            this.showBoard(rank, board); // the board we just made, even if storage refused to save it
        };
        // Plain DOM events, not Phaser's keyboard: Phaser 4.0.0 replays earlier keys when several arrive in one
        // frame (K, Enter typed fast saved "KKA").
        window.addEventListener('keydown', onKey);
        this.game.canvas.focus(); // ready to type without clicking first
        this.events.once('shutdown', () => window.removeEventListener('keydown', onKey)); // walk-away reset or F4
        save.on('pointerdown', done);
        render();
    }

    showBoard (highlight: number, board = loadBoard())
    {
        this.add.text(512, 340, 'TOP SCORES', { fontFamily: LED, fontSize: '22px', color: COLORS.label }).setOrigin(0.5);
        const rows = board.slice(0, 5).map((e, i) => [i, e] as const);
        if (highlight >= 5) rows.push([highlight, board[highlight]]); // keep the new entry visible even below the top 5
        rows.forEach(([i, e], row) => this.add.text(512, 385 + row * 40, `${i + 1} ${e.name.padEnd(3)} ${String(e.score).padStart(4, '0')}`,
            { fontFamily: LED, fontSize: '32px', color: i === highlight ? COLORS.good : COLORS.text }).setOrigin(0.5, 0));

        const again = this.add.text(512, 700, 'CLICK TO PLAY AGAIN', { fontFamily: LED, fontSize: '32px', color: COLORS.amberText })
            .setOrigin(0.5).setVisible(false);
        // Short pause so a click meant for the last round or the save button does not skip this screen.
        this.time.delayedCall(1500, () => {
            again.setVisible(true);
            this.time.addEvent({ delay: 600, loop: true, callback: () => again.setVisible(!again.visible) });
            this.input.once('pointerdown', () => this.scene.start('MainMenu'));
        });
    }
}
