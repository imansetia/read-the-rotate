import { Scene } from 'phaser';
import { COLORS, FONT } from '../theme';

export class GameOver extends Scene
{
    constructor ()
    {
        super('GameOver');
    }

    create ({ score, correct, total }: { score: number; correct: number; total: number })
    {
        this.add.text(512, 220, 'Final score', { fontFamily: FONT, fontSize: '32px', color: COLORS.muted }).setOrigin(0.5);
        this.add.text(512, 310, `${score}`, { fontFamily: FONT, fontSize: '96px', color: COLORS.text }).setOrigin(0.5);
        this.add.text(512, 410, `You read ${correct} of ${total} rounds like a pro`, {
            fontFamily: FONT, fontSize: '28px', color: COLORS.siteText,
        }).setOrigin(0.5);
        const again = this.add.text(512, 560, 'Click to play again', { fontFamily: FONT, fontSize: '28px', color: COLORS.text })
            .setOrigin(0.5).setAlpha(0);

        // Short pause so a click meant for the last round does not skip this screen.
        this.time.delayedCall(1500, () => {
            again.setAlpha(1);
            this.input.once('pointerdown', () => this.scene.start('MainMenu'));
        });
    }
}
