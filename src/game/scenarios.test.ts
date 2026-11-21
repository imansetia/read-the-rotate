// Run: npm test (plain node, no extra deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastSeen, pickRounds, positionAt, scoreFor, ROUND_TIERS, type Pack, type Point } from './scenarios.ts';

const track: Point[] = [[0, 0, 0, true], [10, 100, 0, true], [20, 100, 50, false]];

test('lastSeen gives the latest record and its age', () => {
    assert.deepEqual(lastSeen(track, 15), { x: 100, y: 0, alive: true, age: 5 });
    assert.equal(lastSeen(track, -1), undefined);
});

test('positionAt interpolates between records and clamps at the ends', () => {
    assert.deepEqual(positionAt(track, 5), { x: 50, y: 0, alive: true });
    assert.deepEqual(positionAt(track, 99), { x: 100, y: 50, alive: false });
    assert.deepEqual(positionAt(track, -3), { x: 0, y: 0, alive: true });
});

test('pickRounds follows the tier ramp without repeating a scenario', () => {
    const scenarios = Array.from({ length: 30 }, (_, i) => ({
        id: `s${i}`, map: 'm', site: 'A', plant: { t: 40, x: 0, y: 0 }, players: [],
        snaps: { '1': 30, '2': 25, '3': 20 },
    }));
    const rounds = pickRounds({ maps: {}, scenarios } as Pack);
    assert.equal(rounds.length, ROUND_TIERS.length);
    assert.equal(new Set(rounds.map(r => r.scenario.id)).size, rounds.length);
    assert.deepEqual(rounds.map(r => r.t), ROUND_TIERS.map(t => ({ '1': 30, '2': 25, '3': 20 })[t]));
    assert.throws(() => pickRounds({ maps: {}, scenarios: scenarios.slice(0, 3) } as Pack));
});

test('scoreFor rewards correct, fast and streaking answers', () => {
    assert.equal(scoreFor(false, 6, 3), 0);
    assert.equal(scoreFor(true, 0, 1), 100);
    assert.equal(scoreFor(true, 6, 1), 150);
    assert.equal(scoreFor(true, 3, 3), 165);
});
