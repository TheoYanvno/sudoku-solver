import { generate, LEVELS } from './generator.js';
import { parse, format, validate, conflicts, solve, isSolved, PEERS } from './sudoku.js';

const $ = (id) => document.getElementById(id);
const SAMPLE = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

// ---- the grid: 81 inputs ----

const cells = Array.from({ length: 81 }, (_, i) => {
  const input = document.createElement('input');
  input.className = 'cell';
  input.inputMode = 'numeric';
  input.maxLength = 1;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', `Row ${Math.floor(i / 9) + 1}, column ${(i % 9) + 1}`);
  input.dataset.i = i;
  $('grid').append(input);
  return input;
});

let givens = new Array(81).fill(false);      // which cells were part of the puzzle

const values = () => cells.map((c) => Number(c.value) || 0);

function load(grid, { asGivens = true } = {}) {
  grid.forEach((v, i) => {
    cells[i].value = v || '';
    if (asGivens) givens[i] = v > 0;
    cells[i].className = 'cell' + (givens[i] ? ' given' : '');
    cells[i].readOnly = givens[i];
  });
  refresh();
}

/** Re-colors duplicate digits so mistakes show up as you type. */
function refresh() {
  const bad = new Set(conflicts(values()));
  cells.forEach((c, i) => {
    c.classList.toggle('conflict', bad.has(i));
    c.classList.remove('wrong');
  });
}

function setStatus(text, kind = '') {
  $('status').textContent = text;
  $('status').className = 'status ' + kind;
}

function showStats(rows) {
  $('stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('stats').hidden = false;
}

// ---- typing and moving around ----

$('grid').addEventListener('input', (e) => {
  const c = e.target;
  const digit = c.value.replace(/[^1-9]/g, '').slice(-1);
  c.value = digit;
  refresh();
  setStatus('');
});

$('grid').addEventListener('keydown', (e) => {
  const i = Number(e.target.dataset.i);
  const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
  if (moves[e.key] !== undefined) {
    e.preventDefault();
    cells[(i + moves[e.key] + 81) % 81].focus();
  } else if ((e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') && !givens[i]) {
    e.preventDefault();
    cells[i].value = '';
    refresh();
  }
});

// Shade the row, column and box of the focused cell
$('grid').addEventListener('focusin', (e) => {
  const peers = new Set(PEERS[Number(e.target.dataset.i)]);
  cells.forEach((c, i) => c.classList.toggle('peer', peers.has(i)));
});
$('grid').addEventListener('focusout', () => cells.forEach((c) => c.classList.remove('peer')));

// ---- buttons ----

$('solve').onclick = () => {
  // Solve from the clues only, so a wrong entry by the player doesn't block the solver
  const puzzle = values().map((v, i) => (givens[i] || !givens.some(Boolean) ? v : 0));
  const problem = validate(puzzle);
  if (problem && conflicts(puzzle).length) return setStatus(problem, 'error');
  const t0 = performance.now();
  const { solution, stats } = solve(puzzle);
  const ms = performance.now() - t0;
  if (!solution) return setStatus('This puzzle has no solution. Check the clues for a typo.', 'error');
  if (!givens.some(Boolean)) givens = puzzle.map((v) => v > 0);
  solution.forEach((v, i) => {
    if (!givens[i]) { cells[i].value = v; cells[i].classList.add('solved'); }
  });
  refresh();
  setStatus(problem ? `Solved, but note: ${problem}` : 'Solved!', 'good');
  showStats([
    ['Time', `${ms < 1 ? ms.toFixed(2) : Math.round(ms)} ms`],
    ['Only-one-fits cells', stats.singles],
    ['Only-one-spot digits', stats.hidden],
    ['Guesses', stats.guesses],
    ['Backtracks', stats.backtracks],
  ]);
};

// ---- watch it solve: replay the solver's steps one at a time ----

let playing = null;

function logLine(step) {
  const li = document.createElement('li');
  li.className = step.type;
  li.textContent = step.reason[0].toUpperCase() + step.reason.slice(1);
  $('log').prepend(li);
  while ($('log').children.length > 8) $('log').lastChild.remove();
}

function applyStep(step) {
  if (step.type === 'backtrack') {
    // undo everything since the guess by going back to the grid as it was then
    step.snapshot.forEach((v, i) => {
      if (givens[i]) return;
      cells[i].value = v || '';
      if (!v) cells[i].classList.remove('solved', 'guess');
    });
    cells[step.index].classList.add('flash');
  } else {
    const c = cells[step.index];
    c.value = step.value;
    c.classList.remove('solved', 'guess', 'flash');
    void c.offsetWidth;                              // restart the flash animation
    c.classList.add(step.type === 'guess' ? 'guess' : 'solved', 'flash');
  }
  logLine(step);
}

function stopWatching(message, kind) {
  clearTimeout(playing);
  playing = null;
  $('stop').hidden = true;
  $('watch').hidden = false;
  ['solve', 'check', 'clear', 'load', 'generate'].forEach((id) => { $(id).disabled = false; });
  cells.forEach((c, i) => { c.readOnly = givens[i]; });
  if (message) setStatus(message, kind);
}

$('watch').onclick = () => {
  const puzzle = values().map((v, i) => (givens[i] || !givens.some(Boolean) ? v : 0));
  if (conflicts(puzzle).length) return setStatus(validate(puzzle), 'error');
  const { solution, steps, stats } = solve(puzzle, { record: true });
  if (!solution) return setStatus('This puzzle has no solution. Check the clues for a typo.', 'error');
  if (!givens.some(Boolean)) givens = puzzle.map((v) => v > 0);

  load(puzzle, { asGivens: false });
  $('log').innerHTML = '';
  $('watch').hidden = true;
  $('stop').hidden = false;
  ['solve', 'check', 'clear', 'load', 'generate'].forEach((id) => { $(id).disabled = true; });
  cells.forEach((c) => { c.readOnly = true; });
  setStatus(`Solving… ${steps.length} steps`);

  let n = 0;
  const next = () => {
    if (n >= steps.length) {
      showStats([
        ['Steps', steps.length],
        ['Only-one-fits cells', stats.singles],
        ['Only-one-spot digits', stats.hidden],
        ['Guesses', stats.guesses],
        ['Backtracks', stats.backtracks],
      ]);
      return stopWatching(stats.guesses ? `Solved with ${stats.guesses} guesses and ${stats.backtracks} backtracks.` : 'Solved by logic alone, no guessing needed.', 'good');
    }
    applyStep(steps[n++]);
    // speed 1 = 600 ms per step, speed 10 = 8 ms
    const speed = Number($('speed').value);
    playing = setTimeout(next, Math.round(600 * Math.pow(0.62, speed - 1)));
  };
  next();
};

$('stop').onclick = () => {
  // finish instantly so the grid isn't left half-filled
  const puzzle = values().map((v, i) => (givens[i] ? v : 0));
  const { solution } = solve(puzzle);
  solution?.forEach((v, i) => { if (!givens[i]) { cells[i].value = v; cells[i].classList.add('solved'); } });
  stopWatching('Stopped, and filled in the rest.', 'good');
};

$('check').onclick = () => {
  const puzzle = values().map((v, i) => (givens[i] ? v : 0));
  const { solution } = solve(puzzle);
  if (!solution) return setStatus('The clues have no solution, so answers can\'t be checked.', 'error');
  let wrong = 0;
  let empty = 0;
  cells.forEach((c, i) => {
    const v = Number(c.value) || 0;
    if (!v) empty++;
    else if (!givens[i] && v !== solution[i]) { wrong++; c.classList.add('wrong'); }
  });
  if (wrong) setStatus(`${wrong} ${wrong === 1 ? 'answer is' : 'answers are'} wrong (underlined).`, 'error');
  else if (empty) setStatus(`Everything so far is right. ${empty} to go.`, 'good');
  else setStatus(isSolved(values()) ? 'Complete and correct. Nice work!' : 'Something is off.', isSolved(values()) ? 'good' : 'error');
};

$('clear').onclick = () => {
  givens = new Array(81).fill(false);
  load(new Array(81).fill(0), { asGivens: false });
  $('stats').hidden = true;
  setStatus('Grid cleared. Type a puzzle, then press Solve.');
  history.replaceState(null, '', location.pathname);
};

$('load').onclick = () => {
  try {
    const grid = parse($('pasteText').value);
    load(grid);
    $('stats').hidden = true;
    setStatus(validate(grid) ?? `Loaded ${grid.filter(Boolean).length} clues.`, validate(grid) ? 'error' : '');
  } catch (err) {
    setStatus(err.message, 'error');
  }
};

$('generate').onclick = () => {
  const level = $('level').value;
  const { puzzle, clues } = generate(level);
  load(puzzle);
  $('stats').hidden = true;
  $('log').innerHTML = '';
  history.replaceState(null, '', '#' + format(puzzle));      // the URL now shares this puzzle
  setStatus(`New ${LEVELS[level].label.toLowerCase()} puzzle with ${clues} clues and exactly one solution.`);
  cells.find((c) => !c.value)?.focus();
};

// A puzzle can be shared in the URL: index.html#53..7....6..195...
function fromHash() {
  try { return parse(decodeURIComponent(location.hash.slice(1))); } catch { return null; }
}

load(fromHash() ?? parse(SAMPLE));
setStatus('Here is a sample puzzle. Press Solve, or clear the grid and type your own.');
addEventListener('hashchange', () => { const g = fromHash(); if (g) load(g); });

