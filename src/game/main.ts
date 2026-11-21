import { GameOver } from './scenes/GameOver';
import { Game as MainGame } from './scenes/Game';
import { MainMenu } from './scenes/MainMenu';
import { AUTO, Game, Scale } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { COLORS } from './theme';

const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 1024,
    height: 768,
    parent: 'game-container',
    backgroundColor: COLORS.background,
    scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH }, // booth screens vary
    scene: [
        Preloader,
        MainMenu,
        MainGame,
        GameOver
    ]
};

const StartGame = (parent: string) => {

    const game = new Game({ ...config, parent });
    if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game; // dev-only handle for debugging
    return game;

}

export default StartGame;
