// Run: npm test (plain node, no extra deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lastSeen, makeProjection, pickRounds, positionAt, scoreFor, ROUND_TIERS, type Pack, type Point } from './scenarios.ts';

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

test('the committed demo pack can fill a session', () => {
    const pack = JSON.parse(readFileSync(new URL('../../public/packs/demo/scenarios.json', import.meta.url), 'utf8')) as Pack;
    const rounds = pickRounds(pack);
    assert.equal(rounds.length, ROUND_TIERS.length);
    for (const { scenario } of rounds) {
        assert.ok(pack.maps[scenario.map].sites.some(s => s.label === scenario.site));
        assert.equal(scenario.players.length, 10);
    }
});

test('makeProjection turns the map so attackers start at the bottom and sites sit side by side', () => {
    // Attackers spawn on the left, sites to the right (one higher, one lower): the raw map would stack the sites.
    const map = { bounds: { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } },
        sites: [{ label: 'A', x: 90, y: 80 }, { label: 'B', x: 90, y: 20 }] };
    const players = Array.from({ length: 5 }, () => ({ side: 'atk' as const, track: [[0, 5, 50, true]] as Point[] }));
    const scenario = { id: 's', map: 'm', site: 'A', plant: { t: 0, x: 0, y: 0 }, snaps: {}, players };
    const { project } = makeProjection(map, scenario, 600, 5);
    const [a, b, spawn] = [project(90, 80), project(90, 20), project(5, 50)];
    assert.ok(Math.abs(a.y - b.y) < 1, 'sites level');
    assert.ok(spawn.y > a.y + 100, 'attackers below the sites');
    assert.ok(a.x < b.x, 'no mirror: A stays on the left when walking from spawn to the sites');
    for (const p of [a, b, spawn]) assert.ok(p.x >= 0 && p.x <= 600 && p.y >= 0 && p.y <= 600, 'inside the radar');
});

test('scoreFor rewards correct, fast and streaking answers', () => {
    assert.equal(scoreFor(false, 6, 3), 0);
    assert.equal(scoreFor(true, 0, 1), 100);
    assert.equal(scoreFor(true, 6, 1), 150);
    assert.equal(scoreFor(true, 3, 3), 165);
});
