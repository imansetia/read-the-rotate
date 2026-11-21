import { Scene } from 'phaser';
import { COLORS, HAND, LED, ledBackdrop } from '../theme';

export class MainMenu extends Scene
{
    constructor ()
    {
        super('MainMenu');
    }

    create ()
    {
        ledBackdrop(this);
        this.add.text(512, 240, 'READ THE ROTATE', { fontFamily: LED, fontSize: '88px', color: COLORS.amberText }).setOrigin(0.5);
        const rounds = this.registry.get('demo') ? 'Demo rounds (made up, no match data).' : 'Real pro rounds.';
        this.add.text(512, 340, `${rounds} Can you call the site before they plant?`, {
            fontFamily: HAND, fontSize: '26px', color: COLORS.text,
        }).setOrigin(0.5);
        this.add.text(512, 390, '10 rounds, 6 seconds each. Click the site you think they will hit.', {
            fontFamily: HAND, fontSize: '22px', color: COLORS.label,
        }).setOrigin(0.5);
        const start = this.add.text(512, 560, 'CLICK TO START', { fontFamily: LED, fontSize: '40px', color: COLORS.amberText }).setOrigin(0.5);
        this.time.addEvent({ delay: 600, loop: true, callback: () => start.setVisible(!start.visible) }); // LED blink, not a fade

        this.input.once('pointerdown', () => this.scene.start('Game'));
    }
}
