import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, randomSolution, mulberry32, LEVELS } from '../src/generator.js';
import { solve, countSolutions, isSolved, conflicts } from '../src/sudoku.js';

test('builds a random finished grid that follows the rules', () => {
  const grid = randomSolution(mulberry32(1));
  assert.ok(isSolved(grid));
  assert.notDeepEqual(grid, randomSolution(mulberry32(2)));
});

for (const level of Object.keys(LEVELS)) {
  test(`${level} puzzles have one solution, the right clue count and difficulty`, () => {
    const { puzzle, solution, clues } = generate(level, 42);
    assert.equal(conflicts(puzzle).length, 0);
    assert.equal(countSolutions(puzzle), 1);
    assert.deepEqual(solve(puzzle).solution, solution);
    assert.ok(clues >= LEVELS[level].minClues, `${clues} clues`);
    const { stats } = solve(puzzle);
    if (LEVELS[level].guesses === 'none') assert.equal(stats.guesses, 0);
    else assert.ok(stats.guesses > 0);
  });
}

test('the same seed makes the same puzzle', () => {
  assert.deepEqual(generate('easy', 7).puzzle, generate('easy', 7).puzzle);
});

test('harder levels have fewer clues', () => {
  assert.ok(generate('hard', 3).clues < generate('easy', 3).clues);
});
