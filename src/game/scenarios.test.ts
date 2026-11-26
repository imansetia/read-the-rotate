// Run: npm test (plain node, no extra deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { corridorCells, routeTrack, lastSeen, makeProjection, pickRounds, positionAt, readAt, roundFacts, scoreFor, ROUND_COUNT, ROUND_PLAN, type Pack, type Point, type Scenario } from './scenarios.ts';

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

// Two sites far apart; attackers stand by site A, seen every second (fresh) or only once at the start (stale).
const MAP = { bounds: { min: { x: 0, y: 0 }, max: { x: 10000, y: 10000 } },
    sites: [{ label: 'A', x: 1000, y: 5000 }, { label: 'B', x: 9000, y: 5000 }] };
// A rotating team stands by A until 40 s, then walks to B and is there at the plant (45 s).
const byA = (fresh: boolean): Point[] => (fresh
    ? [...Array.from({ length: 41 }, (_, t) => [t, 1500, 4000, true] as Point), [45, 8800, 5000, true]]
    : [[0, 1500, 4000, true]]);
const scenario = (id: string, site: string, fresh: boolean): Scenario => ({
    id, map: 'm', site, plant: { t: 45, x: 0, y: 0 }, snaps: { '1': 30, '2': 25, '3': 20 },
    players: [...Array.from({ length: 5 }, () => ({ side: 'atk' as const, track: byA(fresh) })),
        ...Array.from({ length: 5 }, () => ({ side: 'def' as const, track: [[0, 9000, 5000, true]] as Point[] }))],
});

test('readAt tells a plain read, a real rotate, and a read spoiled by stale data apart', () => {
    assert.equal(readAt(MAP, scenario('p', 'A', true), 20), 'plain');
    assert.equal(readAt(MAP, scenario('r', 'B', true), 20), 'rotate');
    assert.equal(readAt(MAP, scenario('m', 'B', false), 20), 'murky');
});

test('pickRounds follows the plan: tier ramp, rising rotates, no murky rounds, no repeats', () => {
    const scenarios = [
        ...Array.from({ length: 30 }, (_, i) => scenario(`p${i}`, 'A', true)),
        ...Array.from({ length: 30 }, (_, i) => scenario(`r${i}`, 'B', true)),
        ...Array.from({ length: 30 }, (_, i) => scenario(`m${i}`, 'B', false)),
    ];
    const rounds = pickRounds({ maps: { m: MAP }, scenarios } as Pack);
    assert.equal(rounds.length, ROUND_COUNT);
    assert.equal(new Set(rounds.map(r => r.scenario.id)).size, rounds.length);
    assert.ok(rounds.every(r => !r.scenario.id.startsWith('m')), 'no murky rounds');
    assert.ok(rounds.every(r => r.rotate === r.scenario.id.startsWith('r')));
    let at = 0;
    for (const { tier, rounds: count, rotates } of ROUND_PLAN) {
        const part = rounds.slice(at, at += count);
        assert.ok(part.every(r => r.t === ({ '1': 30, '2': 25, '3': 20 })[tier]));
        assert.equal(part.filter(r => r.rotate).length, rotates);
    }
    assert.throws(() => pickRounds({ maps: { m: MAP }, scenarios: scenarios.slice(0, 5) } as Pack));
});

test('the committed demo pack can fill a session', () => {
    const pack = JSON.parse(readFileSync(new URL('../../public/packs/demo/scenarios.json', import.meta.url), 'utf8')) as Pack;
    const rounds = pickRounds(pack);
    assert.equal(rounds.length, ROUND_COUNT);
    assert.ok(rounds.filter(r => r.rotate).length >= 4, 'a demo session still shows real rotates'); // pickRounds would quietly fill with plain rounds
    for (const { scenario } of rounds) {
        assert.ok(pack.maps[scenario.map].sites.some(s => s.label === scenario.site));
        assert.equal(scenario.players.length, 10);
        for (const [t, shooter, victim] of scenario.kills ?? []) {
            assert.notEqual(scenario.players[shooter].side, scenario.players[victim].side, 'a kill crosses teams');
            assert.equal(positionAt(scenario.players[victim].track, t + 0.1).alive, false, 'the victim is down after the shot');
        }
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

test('corridorCells marks every cell a player stood in', () => {
    const s = scenario('p', 'A', true);
    s.players.push({ side: 'def', track: [[0, 5000, 9000, true]] }); // seen once still counts
    const cells = corridorCells({ maps: { m: MAP }, scenarios: [s] } as Pack, 'm');
    assert.equal(cells.length, 4); // the attackers' spot, where they walked to, the defenders' spot, the lone sighting
    assert.ok(cells.some(([x, y]) => x === 1575 && y === 3975));
});

test('roundFacts states only what the data shows', () => {
    const quiet = scenario('r', 'B', true);
    assert.deepEqual(roundFacts(MAP, quiet, 20), ['Defenders on your radar: 5 near B.', 'Nobody went down before the plant.']);
    const fight = scenario('r', 'B', true);
    fight.players[5] = { side: 'def', track: [[0, 9000, 5000, true], [30, 9000, 5000, false]] };
    fight.players[0] = { side: 'atk', track: [[0, 1500, 4000, true], [35, 5000, 5000, false]] };
    assert.equal(roundFacts(MAP, fight, 20)[1], 'First player down after that: a defender, near B.');
    assert.equal(roundFacts(MAP, fight, 32)[0], 'Already down: 1 defender near B.');
    assert.equal(roundFacts(MAP, fight, 32)[2], 'First player down after that: an attacker, away from the sites.');
});

test('routeTrack walks around a wall instead of through it, and keeps the straight line when it must', () => {
    // An L-shaped corridor of 1.5 m cells: along the bottom row, then up the column at i = 10.
    const open = new Set<string>();
    for (let k = 0; k <= 10; k++) open.add(`${k},0`).add(`10,${k}`);
    const cellOf = (x: number, y: number) => `${Math.floor(x / 150)},${Math.floor(y / 150)}`;
    const { track: route, hidden } = routeTrack(open, [[0, 75, 75, true], [10, 1575, 1575, true]]);
    assert.deepEqual(hidden, []);
    assert.ok(route.length > 2, 'corner points were added');
    assert.deepEqual(route.at(-1), [10, 1575, 1575, true]);
    for (let i = 1; i < route.length; i++) {
        const [t0, x0, y0] = route[i - 1], [t1, x1, y1] = route[i];
        assert.ok(t1 >= t0, 'time only moves forward');
        for (let k = 0; k <= 20; k++) assert.ok(open.has(cellOf(x0 + ((x1 - x0) * k) / 20, y0 + ((y1 - y0) * k) / 20)), 'every step is on a corridor');
    }
    // No corridor between the two sightings, or no time to walk it: no line through the wall, the move is hidden.
    const lost = routeTrack(new Set(['0,0', '10,10']), [[0, 75, 75, true], [10, 1575, 1575, true]]);
    assert.equal(lost.track.length, 2);
    assert.deepEqual(lost.hidden, [[0, 10]]);
    assert.deepEqual(routeTrack(open, [[0, 75, 75, true], [0.5, 1575, 1575, true]]).hidden, [[0, 0.5]]);
    // A one-cell gap in the recorded corridor is bridged instead of hiding the move.
    const gappy = new Set(open);
    gappy.delete('5,0');
    assert.deepEqual(routeTrack(gappy, [[0, 75, 75, true], [10, 1575, 1575, true]]).hidden, []);
});
