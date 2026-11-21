import { Scene } from 'phaser';
import { COLORS, HAND, LED, ledBackdrop } from '../theme';

export class GameOver extends Scene
{
    constructor ()
    {
        super('GameOver');
    }

    create ({ score, correct, total }: { score: number; correct: number; total: number })
    {
        ledBackdrop(this);
        this.add.text(512, 200, 'FINAL SCORE', { fontFamily: LED, fontSize: '28px', color: COLORS.label }).setOrigin(0.5);
        this.add.text(512, 300, String(score).padStart(4, '0'), { fontFamily: LED, fontSize: '140px', color: COLORS.amberText }).setOrigin(0.5);
        this.add.text(512, 420, `You read ${correct} of ${total} rounds like a pro`, {
            fontFamily: HAND, fontSize: '32px', color: COLORS.text,
        }).setOrigin(0.5);
        const again = this.add.text(512, 560, 'CLICK TO PLAY AGAIN', { fontFamily: LED, fontSize: '34px', color: COLORS.amberText })
            .setOrigin(0.5).setVisible(false);

        // Short pause so a click meant for the last round does not skip this screen.
        this.time.delayedCall(1500, () => {
            this.time.addEvent({ delay: 600, loop: true, callback: () => again.setVisible(!again.visible) });
            again.setVisible(true);
            this.input.once('pointerdown', () => this.scene.start('MainMenu'));
        });
    }
}
