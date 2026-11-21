import { Scene } from 'phaser';
import { pickRounds, type Pack } from '../scenarios';
import { COLORS, FONT } from '../theme';

// The pro pack is generated locally from GRID data (gitignored); the demo pack is the committed fallback.
const PACKS = ['packs/pro/scenarios.json', 'packs/demo/scenarios.json'];

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    async create ()
    {
        const status = this.add.text(512, 384, 'Loading rounds...', { fontFamily: FONT, fontSize: '24px', color: COLORS.text }).setOrigin(0.5);
        for (const url of PACKS) {
            try {
                const res = await fetch(url);
                if (!res.ok) continue;
                const pack = await res.json() as Pack;
                pickRounds(pack); // throws if the pack cannot fill a session
                this.registry.set('pack', pack);
                this.scene.start('MainMenu');
                return;
            } catch {
                // try the next pack
            }
        }
        status.setText('No scenario pack found.\nRun pipeline/extract_scenarios.py first.').setAlign('center');
    }
}
