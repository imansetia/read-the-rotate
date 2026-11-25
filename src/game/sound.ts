// Booth sounds made in code with Web Audio: no audio files, nothing to license, works offline.
// Short and bright so they cut through a noisy hall; the game never depends on them.

const MUTE_KEY = 'read-the-rotate/muted';
let muted = (() => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } })();
let ctx: AudioContext | undefined;

export const isMuted = () => muted;

/** Operator key M. The choice stays on this machine. */
export function toggleMute ()
{
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* storage blocked: lasts until reload */ }
    if (!muted) sfx.select(); // audible confirmation that sound is back
    return muted;
}

/** One note: a waveform from `freq` (sliding to `to`), starting `at` s from now, `dur` s long, with a quick fade. */
function note (freq: number, at: number, dur: number, { type = 'square' as OscillatorType, gain = 0.12, to = freq } = {})
{
    if (muted || typeof AudioContext === 'undefined') return;
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume(); // browsers start it paused until the first click
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator(), amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
}

export const sfx = {
    tick: () => note(1200, 0, 0.05, { gain: 0.08 }),
    select: () => note(660, 0, 0.07, { type: 'triangle', gain: 0.18 }),
    correct: (rotate: boolean) => (rotate ? [523, 659, 784, 1047] : [659, 988])
        .forEach((f, i) => note(f, i * 0.09, 0.16, { type: 'triangle', gain: 0.16 })),
    wrong: () => note(220, 0, 0.38, { type: 'sawtooth', gain: 0.1, to: 110 }),
    kill: () => note(380, 0, 0.09, { gain: 0.07, to: 90 }),
    plant: () => [0, 0.14].forEach(at => note(1500, at, 0.08, { gain: 0.08 })),
    fanfare: () => [523, 659, 784, 1047, 784, 1047]
        .forEach((f, i) => note(f, i * 0.12, i === 5 ? 0.5 : 0.14, { type: 'triangle', gain: 0.15 })),
};
