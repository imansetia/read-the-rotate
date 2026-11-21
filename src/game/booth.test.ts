// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_SIZE, MIN_CROWD, betterThan, insert, parseBoard, parseScores, rankOf } from './booth.ts';

const board = [{ name: 'AAA', score: 900 }, { name: 'BBB', score: 500 }];

test('rankOf places a score, ties below older scores, zero never ranks', () => {
    assert.equal(rankOf(board, 1000), 0);
    assert.equal(rankOf(board, 500), 2);
    assert.equal(rankOf(board, 0), -1);
    const full = Array.from({ length: BOARD_SIZE }, () => ({ name: 'ZZZ', score: 300 }));
    assert.equal(rankOf(full, 300), -1);
    assert.equal(rankOf(full, 301), 0);
});

test('insert keeps the board sorted and capped', () => {
    assert.deepEqual(insert(board, { name: 'CCC', score: 700 }).map(e => e.name), ['AAA', 'CCC', 'BBB']);
    const full = Array.from({ length: BOARD_SIZE }, (_, i) => ({ name: 'ZZZ', score: 1000 - i }));
    assert.equal(insert(full, { name: 'NEW', score: 2000 }).length, BOARD_SIZE);
    assert.equal(insert(full, { name: 'LOW', score: 1 }), full);
});

test('parseBoard survives junk in storage', () => {
    assert.deepEqual(parseBoard(null), []);
    assert.deepEqual(parseBoard('not json'), []);
    assert.deepEqual(parseBoard('{"a":1}'), []);
    assert.deepEqual(parseBoard('[{"name":"abcd","score":5},{"name":3},{"name":"x","score":9}]'),
        [{ name: 'X', score: 9 }, { name: 'ABC', score: 5 }]);
});

test('betterThan waits for a crowd, then counts strictly lower scores', () => {
    assert.equal(betterThan([100, 200], 500), undefined);
    const crowd = [100, 200, 300, 400, 500];
    assert.equal(crowd.length, MIN_CROWD);
    assert.equal(betterThan(crowd, 350), 60);
    assert.equal(betterThan(crowd, 500), 80); // a tie is not a win
    assert.equal(betterThan(crowd, 50), 0);
    assert.equal(betterThan(crowd, 999), 100);
});

test('parseScores keeps numbers only', () => {
    assert.deepEqual(parseScores('[1,"x",null,2.5]'), [1, 2.5]);
    assert.deepEqual(parseScores('oops'), []);
    assert.deepEqual(parseScores('{"a":1}'), []);
});
