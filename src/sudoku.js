// Sudoku solving with constraint propagation and backtracking. No DOM code, so it runs in Node tests.
//
// A grid is an array of 81 numbers, row by row; 0 means empty.
// Cells are numbered 0-80: row = Math.floor(i / 9), column = i % 9.

export const ALL = 0b1111111110;          // bits 1-9 set: every digit is still possible

/** The 20 cells that share a row, column or 3x3 box with each cell. Computed once. */
export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const r = Math.floor(i / 9);
  const c = i % 9;
  const br = r - (r % 3);
  const bc = c - (c % 3);
  const set = new Set();
  for (let k = 0; k < 9; k++) {
    set.add(r * 9 + k);
    set.add(k * 9 + c);
    set.add((br + Math.floor(k / 3)) * 9 + bc + (k % 3));
  }
  set.delete(i);
  return [...set];
});

/** The 27 units (9 rows, 9 columns, 9 boxes), each a list of 9 cell numbers. */
export const UNITS = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) =>
    Array.from({ length: 9 }, (_, k) => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3))),
];

export const UNIT_NAMES = [
  ...Array.from({ length: 9 }, (_, i) => `row ${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `column ${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `box ${i + 1}`),
];

const bitCount = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
const digitsOf = (m) => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => m & (1 << d));
export const cellName = (i) => `r${Math.floor(i / 9) + 1}c${(i % 9) + 1}`;

/**
 * Reads a puzzle from text: 81 characters of 1-9 for givens and 0, '.' or '-' for blanks.
 * Spaces, newlines and | + separators are ignored. Throws a helpful error on anything else.
 */
export function parse(text) {
  const chars = String(text).replace(/[\s|+]/g, '').split('');
  const bad = chars.find((ch) => !/[0-9.\-]/.test(ch));
  if (bad) throw new Error(`Unexpected character "${bad}". Use 1-9 for clues and 0 or . for blanks.`);
  if (chars.length !== 81) throw new Error(`A puzzle needs 81 cells, but this has ${chars.length}.`);
  return chars.map((ch) => (/[1-9]/.test(ch) ? Number(ch) : 0));
}

export const format = (grid) => grid.map((v) => v || '.').join('');

/** Finds clues that break the rules: the same digit twice in a row, column or box. */
export function conflicts(grid) {
  const bad = new Set();
  for (let i = 0; i < 81; i++) {
    if (!grid[i]) continue;
    for (const p of PEERS[i]) if (grid[p] === grid[i]) { bad.add(i); bad.add(p); }
  }
  return [...bad].sort((a, b) => a - b);
}

/**
 * Checks a puzzle before solving. Returns null if it's fine, or a plain-language reason it can't be solved.
 * (A puzzle can pass this and still have no solution; solve() reports that case.)
 */
export function validate(grid) {
  if (!Array.isArray(grid) || grid.length !== 81) return 'A puzzle needs 81 cells.';
  if (grid.some((v) => !Number.isInteger(v) || v < 0 || v > 9)) return 'Cells must be empty or 1-9.';
  const bad = conflicts(grid);
  if (bad.length) {
    const i = bad[0];
    const p = PEERS[i].find((q) => grid[q] === grid[i]);
    return `There are two ${grid[i]}s that see each other (${cellName(i)} and ${cellName(p)}).`;
  }
  const clues = grid.filter(Boolean).length;
  if (clues < 17) return `Only ${clues} clues: a Sudoku needs at least 17 to have a single answer.`;
  return null;
}

/**
 * Solver state: the grid plus a bitmask of possible digits ("candidates") for every cell.
 * Placing a digit removes it from all 20 peers, which is the "constraint propagation".
 */
class Board {
  constructor(grid) {
    this.values = grid.slice();
    this.cands = new Array(81).fill(ALL);
    for (let i = 0; i < 81; i++) if (grid[i]) for (const p of PEERS[i]) this.cands[p] &= ~(1 << grid[i]);
    for (let i = 0; i < 81; i++) if (grid[i]) this.cands[i] = 0;
  }

  clone() {
    const b = Object.create(Board.prototype);
    b.values = this.values.slice();
    b.cands = this.cands.slice();
    return b;
  }

  place(i, d) {
    this.values[i] = d;
    this.cands[i] = 0;
    for (const p of PEERS[i]) this.cands[p] &= ~(1 << d);
  }

  /** An empty cell with no candidates left means an earlier guess was wrong. */
  deadEnd() {
    for (let i = 0; i < 81; i++) if (!this.values[i] && !this.cands[i]) return true;
    // a digit with no place left in a unit is also a dead end
    for (const unit of UNITS) {
      let seen = 0;
      for (const i of unit) seen |= this.values[i] ? 1 << this.values[i] : this.cands[i];
      if (seen !== ALL) return true;
    }
    return false;
  }

  /**
   * Fills in every cell the rules force, repeating until nothing changes:
   *  - naked single: a cell with only one candidate left
   *  - hidden single: a digit that fits in only one cell of a row, column or box
   * Returns false on a contradiction.
   */
  propagate(log) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < 81; i++) {
        if (this.values[i]) continue;
        if (!this.cands[i]) return false;
        if (bitCount(this.cands[i]) === 1) {
          const d = digitsOf(this.cands[i])[0];
          this.place(i, d);
          log?.({ type: 'single', index: i, value: d, reason: `only ${d} fits in ${cellName(i)}` });
          changed = true;
        }
      }
      for (let u = 0; u < UNITS.length; u++) {
        for (let d = 1; d <= 9; d++) {
          const bit = 1 << d;
          let spot = -1;
          let count = 0;
          let placed = false;
          for (const i of UNITS[u]) {
            if (this.values[i] === d) { placed = true; break; }
            if (this.cands[i] & bit) { spot = i; count++; }
          }
          if (placed) continue;
          if (count === 0) return false;
          if (count === 1) {
            this.place(spot, d);
            log?.({ type: 'hidden', index: spot, value: d, reason: `${d} can only go in ${cellName(spot)} in ${UNIT_NAMES[u]}` });
            changed = true;
          }
        }
      }
    }
    return !this.deadEnd();
  }

  /** The empty cell with the fewest candidates: guessing there has the best odds. */
  bestCell() {
    let best = -1;
    let fewest = 10;
    for (let i = 0; i < 81; i++) {
      if (this.values[i]) continue;
      const n = bitCount(this.cands[i]);
      if (n < fewest) { fewest = n; best = i; if (n === 2) break; }
    }
    return best;
  }

  solved() { return this.values.every(Boolean); }
}

/**
 * Solves a puzzle. Returns { solution, stats, steps } where solution is null if there is none.
 * Options:
 *   record: true to keep every step (for the "watch it solve" animation)
 *   order:  function to shuffle candidate digits (the generator uses this for random grids)
 */
export function solve(grid, { record = false, order = null } = {}) {
  const stats = { singles: 0, hidden: 0, guesses: 0, backtracks: 0 };
  const steps = [];
  const log = (s) => {
    if (s.type === 'single') stats.singles++;
    if (s.type === 'hidden') stats.hidden++;
    if (record) steps.push(s);
  };

  if (validate(grid) && conflicts(grid).length) return { solution: null, stats, steps };

  const search = (board) => {
    if (!board.propagate(log)) return null;
    if (board.solved()) return board;
    const i = board.bestCell();
    let digits = digitsOf(board.cands[i]);
    if (order) digits = order(digits);
    for (const d of digits) {
      stats.guesses++;
      const next = board.clone();
      if (record) steps.push({ type: 'guess', index: i, value: d, reason: `guess ${d} in ${cellName(i)} (${digits.length} options)`, snapshot: board.values.slice() });
      next.place(i, d);
      const result = search(next);
      if (result) return result;
      stats.backtracks++;
      if (record) steps.push({ type: 'backtrack', index: i, value: d, reason: `${d} in ${cellName(i)} led to a dead end, undo`, snapshot: board.values.slice() });
    }
    return null;
  };

  const result = search(new Board(grid));
  return { solution: result ? result.values : null, stats, steps };
}

/** Counts solutions, stopping at `limit`. A proper puzzle has exactly 1. */
export function countSolutions(grid, limit = 2) {
  if (conflicts(grid).length) return 0;
  let count = 0;
  const search = (board) => {
    if (count >= limit || !board.propagate()) return;
    if (board.solved()) { count++; return; }
    const i = board.bestCell();
    for (const d of digitsOf(board.cands[i])) {
      const next = board.clone();
      next.place(i, d);
      search(next);
      if (count >= limit) return;
    }
  };
  search(new Board(grid));
  return count;
}

/** True when the grid is completely and correctly filled. */
export function isSolved(grid) {
  return grid.every((v) => v >= 1 && v <= 9) && conflicts(grid).length === 0;
}

/** Candidate digits for each empty cell, given the current clues (for pencil marks and hints). */
export function candidates(grid) {
  const b = new Board(grid);
  return b.cands.map((m, i) => (grid[i] ? [] : digitsOf(m)));
}
