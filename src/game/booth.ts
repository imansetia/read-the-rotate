// Things a booth needs that a normal game does not: a local leaderboard, a reset when players walk away,
// and keys for the operator.
import type { Game, Scene } from 'phaser';

export interface Entry { name: string; score: number }
export const BOARD_SIZE = 10;
const KEY = 'read-the-rotate/leaderboard';
const SCORES_KEY = 'read-the-rotate/scores';
export const MIN_CROWD = 5; // compare against the booth only once this many sessions have been played
const MAX_SCORES = 2000;
let memory: Entry[] = []; // fallbacks when the browser blocks storage
let memoryScores: number[] = [];

/** Place a score would take on the board (0 = top), or -1 if it does not make it. Ties go below older scores. */
export function rankOf (board: Entry[], score: number)
{
    const i = board.findIndex(e => score > e.score);
    const rank = i === -1 ? board.length : i;
    return score > 0 && rank < BOARD_SIZE ? rank : -1;
}

export function insert (board: Entry[], entry: Entry)
{
    const rank = rankOf(board, entry.score);
    return rank < 0 ? board : [...board.slice(0, rank), entry, ...board.slice(rank)].slice(0, BOARD_SIZE);
}

/** Stored board, ignoring anything malformed (the browser storage is not ours alone). */
export function parseBoard (raw: string | null): Entry[]
{
    try {
        const value: unknown = JSON.parse(raw ?? '[]');
        if (!Array.isArray(value)) return [];
        return value
            .filter((e): e is Entry => typeof e?.name === 'string' && Number.isFinite(e?.score))
            .map(e => ({ name: e.name.slice(0, 3).toUpperCase(), score: e.score }))
            .sort((a, b) => b.score - a.score)
            .slice(0, BOARD_SIZE);
    } catch {
        return [];
    }
}

export function loadBoard ()
{
    try {
        return parseBoard(localStorage.getItem(KEY));
    } catch {
        return memory;
    }
}

export function saveBoard (board: Entry[])
{
    memory = board;
    try {
        localStorage.setItem(KEY, JSON.stringify(board));
    } catch {
        // storage blocked: the board lasts until the page reloads
    }
}

/** Share (0-100) of earlier booth scores that this score beats, or undefined while the crowd is too small. */
export function betterThan (scores: number[], score: number)
{
    if (scores.length < MIN_CROWD) return undefined;
    return Math.floor((100 * scores.filter(s => s < score).length) / scores.length);
}

export function parseScores (raw: string | null): number[]
{
    try {
        const value: unknown = JSON.parse(raw ?? '[]');
        return Array.isArray(value) ? value.filter((n): n is number => Number.isFinite(n)).slice(-MAX_SCORES) : [];
    } catch {
        return [];
    }
}

/** Every finished session's score, newest last; returns the scores from before this one. */
export function recordScore (score: number)
{
    let before = memoryScores;
    try {
        before = parseScores(localStorage.getItem(SCORES_KEY));
    } catch {
        // storage blocked: use this page's scores only
    }
    memoryScores = [...before, score].slice(-MAX_SCORES);
    try {
        localStorage.setItem(SCORES_KEY, JSON.stringify(memoryScores));
    } catch {
        // storage blocked
    }
    return before;
}

/** Back to the menu after `seconds` without a click or key press, so an abandoned game never blocks the booth. */
export function idleReset (scene: Scene, seconds: number)
{
    let last = scene.game.loop.time;
    const touch = () => { last = scene.game.loop.time; };
    scene.input.on('pointerdown', touch);
    scene.input.keyboard?.on('keydown', touch);
    scene.time.addEvent({
        delay: 1000, loop: true,
        callback: () => { if (scene.game.loop.time - last > seconds * 1000) scene.scene.start('MainMenu'); },
    });
}

/** Operator keys: F2 fullscreen, F4 back to the menu, Shift+Delete clears the leaderboard and score history. */
export function installHotkeys (game: Game)
{
    const toMenu = () => {
        if (!game.registry.get('pack')) return; // still loading
        game.scene.getScenes(true).forEach(s => s.scene.stop());
        game.scene.start('MainMenu');
    };
    window.addEventListener('keydown', e => {
        if (e.key === 'F2') game.scale.toggleFullscreen();
        else if (e.key === 'F4') toMenu();
        else if (e.key === 'Delete' && e.shiftKey && window.confirm('Clear the leaderboard and score history?')) {
            saveBoard([]);
            memoryScores = [];
            try { localStorage.removeItem(SCORES_KEY); } catch { /* storage blocked */ }
            toMenu();
        } else return;
        e.preventDefault();
    });
}
