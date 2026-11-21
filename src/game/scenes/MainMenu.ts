import { Scene } from 'phaser';
import { COLORS, FONT } from '../theme';

export class MainMenu extends Scene
{
    constructor ()
    {
        super('MainMenu');
    }

    create ()
    {
        this.add.text(512, 250, 'Read the Rotate', { fontFamily: FONT, fontSize: '72px', color: COLORS.text }).setOrigin(0.5);
        this.add.text(512, 330, 'Real pro rounds. Can you call the site before they plant?', {
            fontFamily: FONT, fontSize: '24px', color: COLORS.muted,
        }).setOrigin(0.5);
        this.add.text(512, 430, '10 rounds  ·  6 seconds each  ·  click a site', {
            fontFamily: FONT, fontSize: '22px', color: COLORS.siteText,
        }).setOrigin(0.5);
        const start = this.add.text(512, 560, 'Click to start', { fontFamily: FONT, fontSize: '32px', color: COLORS.text }).setOrigin(0.5);
        this.tweens.add({ targets: start, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

        this.input.once('pointerdown', () => this.scene.start('Game'));
    }
}
