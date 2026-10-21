// Makes new puzzles with exactly one solution.
//
// 1. Fill an empty grid with the solver, trying digits in random order, to get a random finished grid.
// 2. Remove clues one at a time in random order, putting a clue back if removing it allows a second solution.
// 3. Grade the result by how the solver had to work: logic only, or with guessing.

import { solve, countSolutions } from './sudoku.js';

export const LEVELS = {
  easy:   { label: 'Easy',   minClues: 36, guesses: 'none' },   // lots of clues, singles are enough
  medium: { label: 'Medium', minClues: 28, guesses: 'none' },   // fewer clues, still no guessing
  hard:   { label: 'Hard',   minClues: 22, guesses: 'some' },   // needs at least one guess
};

/** Small seeded random number generator, so a puzzle can be recreated from its seed (and tests are repeatable). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A random, completely filled valid grid. */
export function randomSolution(rand) {
  return solve(new Array(81).fill(0), { order: (digits) => shuffle(digits, rand) }).solution;
}

/** Removes clues while the answer stays unique, stopping at `minClues`. */
export function carve(solution, minClues, rand) {
  const puzzle = solution.slice();
  let clues = 81;
  for (const i of shuffle([...Array(81).keys()], rand)) {
    if (clues <= minClues) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle, 2) === 1) clues--;
    else puzzle[i] = keep;                 // removing this one made the puzzle ambiguous
  }
  return puzzle;
}

/**
 * A new puzzle at the given level. Returns { puzzle, solution, level, clues, seed }.
 * Tries a few grids until one grades at the requested level.
 */
export function generate(level = 'medium', seed = Math.floor(Math.random() * 2 ** 31)) {
  const spec = LEVELS[level] ?? LEVELS.medium;
  const rand = mulberry32(seed);
  let best = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const solution = randomSolution(rand);
    const puzzle = carve(solution, spec.minClues, rand);
    const { stats } = solve(puzzle);
    const fits = spec.guesses === 'none' ? stats.guesses === 0 : stats.guesses > 0;
    const result = { puzzle, solution, level, clues: puzzle.filter(Boolean).length, seed };
    if (fits) return result;
    best ??= result;                         // fall back to a unique puzzle even if the grade is off
  }
  return best;
}
