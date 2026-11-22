// Stadium LED board with whiteboard magnets for players. Original palette and fonts (OFL); no Riot colours or assets.
import type { GameObjects, Scene } from 'phaser';

export const LED = '"Doto", monospace';
export const HAND = '"Kalam", cursive';

export const COLORS = {
    background: '#0c0d0e',
    ledOff: 0x1d2023,
    frame: 0x2a2e33,
    corridor: 0x3a4047,
    amber: 0xffb000,
    amberText: '#ffb000',
    amberOff: 0x3a2a08,
    label: '#8a8f94',
    atk: 0xe2384a,
    atkRim: 0x8c1424,
    atkText: '#ff7482',
    def: 0x3d74e8,
    defRim: 0x163a8a,
    defText: '#86a9ff',
    atkShot: 0xff7482,
    defShot: 0x86a9ff,
    atkDead: 0xb0404e,
    defDead: 0x4d6fbd,
    bomb: 0xf5f3ea,
    text: '#e9e7e1',
    good: '#2be07a',
    goodHex: 0x2be07a,
    bad: '#ff3b30',
    badHex: 0xff3b30,
};

/** Unlit LED dots across the whole screen, drawn once into a tiled texture. */
export function ledBackdrop (scene: Scene)
{
    if (!scene.textures.exists('led')) {
        const g = scene.make.graphics({}, false).fillStyle(COLORS.ledOff).fillCircle(4, 4, 1.4);
        g.generateTexture('led', 8, 8);
        g.destroy();
    }
    scene.add.tileSprite(0, 0, 1024, 768, 'led').setOrigin(0);
}

/** A circle drawn the way an LED board draws one: a ring of dots. */
export function dotRing (g: GameObjects.Graphics, x: number, y: number, r: number, color: number,
    { alpha = 1, size = 2.2, gap = 9 } = {})
{
    const n = Math.max(10, Math.round((2 * Math.PI * r) / gap));
    g.fillStyle(color, alpha);
    for (let i = 0; i < n; i++) g.fillCircle(x + r * Math.cos((2 * Math.PI * i) / n), y + r * Math.sin((2 * Math.PI * i) / n), size);
}

/** A whiteboard magnet: dark rim, coloured face, a small glint. */
export function magnet (g: GameObjects.Graphics, x: number, y: number, face: number, rim: number)
{
    g.fillStyle(rim).fillCircle(x, y, 11).fillStyle(face).fillCircle(x, y, 9).fillStyle(0xffffff, 0.35).fillCircle(x - 3, y - 3, 2.5);
}
