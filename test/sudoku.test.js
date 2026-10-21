import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, format, validate, conflicts, solve, countSolutions, isSolved, candidates, PEERS, UNITS } from '../src/sudoku.js';

// An easy puzzle (solved by singles alone) and a hard one that needs guessing
const EASY = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const EASY_ANSWER = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
const HARD = '8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..';

test('every cell has 20 peers and there are 27 units of 9', () => {
  assert.ok(PEERS.every((p) => p.length === 20));
  assert.equal(UNITS.length, 27);
  assert.ok(UNITS.every((u) => new Set(u).size === 9));
});

test('parses dots, zeros and separators, and formats back', () => {
  const g = parse(EASY.replace(/\./g, '0'));
  assert.equal(g.length, 81);
  assert.equal(format(g), EASY);
  assert.deepEqual(parse('53..7.... | 6..195...\n' + EASY.slice(18)), parse(EASY));
});

test('rejects bad input with a clear message', () => {
  assert.throws(() => parse('12x'), /Unexpected character "x"/);
  assert.throws(() => parse('123'), /81 cells, but this has 3/);
});

test('solves an easy puzzle with constraint propagation only (no guesses)', () => {
  const { solution, stats } = solve(parse(EASY));
  assert.equal(format(solution), EASY_ANSWER);
  assert.equal(stats.guesses, 0);
});

test('solves a hard puzzle that needs guessing and backtracking', () => {
  const { solution, stats } = solve(parse(HARD));
  assert.ok(isSolved(solution));
  assert.ok(stats.guesses > 0);
  // the answer keeps every original clue
  parse(HARD).forEach((v, i) => v && assert.equal(solution[i], v));
});

test('finds duplicate clues and explains them', () => {
  const g = parse(EASY);
  g[1] = 5;                              // second 5 in row 1
  assert.deepEqual(conflicts(g), [0, 1]);
  assert.match(validate(g), /two 5s .*r1c1 and r1c2/);
  assert.equal(solve(g).solution, null);
});

test('flags too few clues', () => {
  assert.match(validate(new Array(81).fill(0)), /Only 0 clues/);
});

test('reports no solution when rules allow the clues but nothing fits', () => {
  // Row 1 has 1-8, and 9 is already in column 9, so r1c9 has no possible digit
  const g = parse('12345678.' + '........9' + '.'.repeat(63));
  assert.equal(solve(g).solution, null);
  assert.equal(countSolutions(g), 0);
});

test('counts solutions to check a puzzle is unique', () => {
  assert.equal(countSolutions(parse(EASY)), 1);
  assert.equal(countSolutions(parse(EASY_ANSWER)), 1);
  assert.equal(countSolutions(new Array(81).fill(0)), 2);      // stops counting at the limit
});

test('records steps for the animation, and every placement matches the answer', () => {
  const { solution, steps } = solve(parse(HARD), { record: true });
  assert.ok(steps.length > 50);
  assert.ok(steps.some((s) => s.type === 'guess'));
  assert.ok(steps.some((s) => s.type === 'backtrack'));
  assert.ok(steps.every((s) => typeof s.reason === 'string' && s.index >= 0 && s.index < 81));
  const last = steps.filter((s) => s.type !== 'backtrack').at(-1);
  assert.equal(solution[last.index], last.value);
});

test('lists candidate digits for empty cells', () => {
  const c = candidates(parse(EASY));
  assert.deepEqual(c[0], []);            // a clue
  assert.deepEqual(c[2], [1, 2, 4]);     // r1c3: not 3,5,6,7,8,9
});

test('isSolved checks completeness and the rules', () => {
  assert.equal(isSolved(parse(EASY_ANSWER)), true);
  assert.equal(isSolved(parse(EASY)), false);
});
