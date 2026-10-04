// Keyboard shortcuts overlay: discoverability for the keyboard-first client.
// Toggled by F1 or the `keys` command; Esc closes (handled here and in the
// global Escape router in main.js).
import { $ } from './util.js';

// The static table is shared with the parent integration surface.
const fontRow = [...$('keys-overlay').querySelectorAll('tr')]
  .find((row) => row.textContent.includes('font size up'));
if (fontRow) fontRow.cells[0].innerHTML = '<kbd>Ctrl/Cmd</kbd>+<kbd>Alt</kbd>+<kbd>=</kbd> / <kbd>-</kbd> / <kbd>0</kbd>';

export function toggleKeys(force) {
  const overlay = $('keys-overlay');
  if (!overlay) return;
  // No argument = toggle; true = open; false = close.
  const willHide = force === undefined ? !overlay.hidden : !force;
  overlay.hidden = willHide;
}

export function isKeysOpen() {
  const overlay = $('keys-overlay');
  return Boolean(overlay && !overlay.hidden);
}

$('keys-close').addEventListener('click', () => toggleKeys(false));
$('keys-overlay').addEventListener('click', (e) => {
  if (e.target === $('keys-overlay')) toggleKeys(false);
});
