import { $ } from './util.js';
import { journeyHint } from './journey-hints.js';
let current = null;
let runner = () => {};
const key = id => `dr_journey_hidden_${id}`;
export function initJourney(dispatch) {
  runner = dispatch;
  $('journey-toggle').addEventListener('click', () => {
    if (!current) return;
    const hidden = !$('journey-guide').hidden;
    try { localStorage.setItem(key(current.journey.characterId), String(hidden)); } catch {}
    render();
  });
  $('journey-dismiss').addEventListener('click', () => {
    if (!current) return;
    try { localStorage.setItem(key(current.journey.characterId), 'true'); } catch {}
    $('journey-guide').hidden = true;
    $('journey-toggle').setAttribute('aria-expanded', 'false');
    $('journey-toggle').focus();
  });
}
export function updateJourney(journey, requirements, available) {
  current = available && journeyHint(journey, requirements) ? { journey, requirements } : null;
  render();
}
function render() {
  const guide = $('journey-guide'), toggle = $('journey-toggle');
  toggle.hidden = !current;
  if (!current) { guide.hidden = true; toggle.setAttribute('aria-expanded', 'false'); return; }
  let hidden = false;
  try { hidden = localStorage.getItem(key(current.journey.characterId)) === 'true'; } catch {}
  guide.hidden = hidden;
  toggle.setAttribute('aria-expanded', String(!hidden));
  const hint = journeyHint(current.journey, current.requirements);
  $('journey-text').textContent = hint.text;
  const commands = $('journey-actions');
  // Avoid replacing a keyboard user's focused action on every prompt.
  const signature = hint.commands.join('\n');
  if (commands.dataset.signature === signature) return;
  const focused = commands.contains(document.activeElement) ? document.activeElement.textContent : null;
  commands.replaceChildren();
  commands.dataset.signature = signature;
  for (const command of hint.commands) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'tool'; button.textContent = command;
    button.addEventListener('click', () => runner(command));
    commands.appendChild(button);
    if (focused === command) button.focus();
  }
  if (focused && !hint.commands.includes(focused)) toggle.focus();
}
