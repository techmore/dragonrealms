// Shared compass rose: a DR-style direction map lit by the current room's
// exits. Used by the pinned room panel and the exits dock.
import { pressEnter } from './input.js';

const WORD_TO_DIR = {
  north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
  up: 'u', down: 'd',
};

export function buildCompassRose(exits = []) {
  const dirs = new Set(exits.map((e) => WORD_TO_DIR[e] || e));
  const compass = document.createElement('div');
  compass.className = 'compass';
  const layout = [
    ['nw', 'n', 'ne'],
    ['w', '_', 'e'],
    ['sw', 's', 'se'],
    ['_', 'u', 'd'],
  ];
  for (const trio of layout) {
    const row = document.createElement('div');
    row.className = 'compass-row';
    for (const dir of trio) {
      if (dir === '_') { row.appendChild(document.createElement('span')); continue; }
      const b = document.createElement('button');
      b.className = 'compass-btn' + (dirs.has(dir) ? '' : ' off');
      b.dataset.dir = dir;
      b.textContent = dir.toUpperCase();
      b.title = `go ${dir}`;
      b.disabled = !dirs.has(dir);
      b.addEventListener('click', () => pressEnter(`go ${dir}`));
      row.appendChild(b);
    }
    compass.appendChild(row);
  }
  return compass;
}

export { WORD_TO_DIR };
