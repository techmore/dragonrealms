import { COMMAND_CATEGORIES, searchCommands, referenceDraft } from './command-reference.js';
import { gameState } from './state.js';
import { onServerMessage, onDisconnect } from './net.js';

let query = '';
let category = '';
let currentGuide = null;
let lastAvailability = null;
const available = () => gameState.value === 'playing' && !gameState.inChargen && !gameState.spectating
  && !document.getElementById('cmd').disabled;

function refreshAvailability() {
  if (!currentGuide?.isConnected) return;
  const enabled = available();
  if (lastAvailability === enabled) return;
  lastAvailability = enabled;
  for (const button of currentGuide.querySelectorAll('[data-prepare-command]')) button.disabled = !enabled;
  currentGuide.querySelector('.command-guide-hint').textContent = enabled
    ? 'Prepare a command in the input, add arguments, then press Enter. An existing draft is preserved.'
    : 'Browse commands anytime. Enter the world to prepare them; spectators can keep browsing.';
}
// Router updates state during message delivery; refresh after all subscribers run.
onServerMessage(() => queueMicrotask(refreshAvailability));
onDisconnect(() => queueMicrotask(refreshAvailability));

export function renderCommandGuide(body, initialQuery) {
  if (initialQuery !== undefined) { query = initialQuery; category = ''; }
  const guide = document.createElement('div');
  guide.className = 'command-guide';
  currentGuide = guide;
  lastAvailability = null;
  const hint = document.createElement('p');
  hint.className = 'command-guide-hint';
  const searchLabel = document.createElement('label');
  searchLabel.textContent = 'Search commands';
  searchLabel.htmlFor = 'command-guide-search';
  const search = document.createElement('input');
  search.id = 'command-guide-search';
  search.type = 'search';
  search.placeholder = 'Try bank, retreat, or Barbarian';
  search.value = query;
  const categoryLabel = document.createElement('label');
  categoryLabel.textContent = 'Category';
  categoryLabel.htmlFor = 'command-guide-category';
  const select = document.createElement('select');
  select.id = 'command-guide-category';
  for (const value of ['', ...COMMAND_CATEGORIES]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value || 'All categories';
    select.append(option);
  }
  select.value = category;
  const summary = document.createElement('p');
  summary.className = 'command-guide-count';
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');
  const feedback = document.createElement('p');
  feedback.className = 'command-guide-feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  const results = document.createElement('div');
  results.className = 'command-guide-results';
  guide.append(hint, searchLabel, search, categoryLabel, select, summary, feedback, results);
  body.replaceChildren(guide);

  const render = () => {
    results.replaceChildren();
    const entries = searchCommands(query, category);
    summary.textContent = `${entries.length} command${entries.length === 1 ? '' : 's'} found.`;
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No matches. Try fewer words or choose All categories.';
      results.append(empty);
    }
    for (const entry of entries) {
      const card = document.createElement('article');
      card.className = 'command-guide-card';
      const heading = document.createElement('h3');
      const syntax = document.createElement('code');
      syntax.textContent = entry.syntax;
      heading.append(syntax);
      const description = document.createElement('p');
      description.textContent = entry.description;
      const label = document.createElement('small');
      label.textContent = entry.category + (entry.aliases.length ? ` · Aliases: ${entry.aliases.join(', ')}` : '')
        + (entry.local ? ' · Client command' : '');
      const prepare = document.createElement('button');
      prepare.type = 'button';
      prepare.dataset.prepareCommand = entry.verb;
      prepare.textContent = `Prepare ${entry.verb}`;
      prepare.addEventListener('click', () => {
        const input = document.getElementById('cmd');
        const draft = referenceDraft(input.value, entry, available());
        feedback.textContent = draft.message;
        if (!draft.ok) return;
        input.value = draft.value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
      card.append(heading, label, description, prepare);
      results.append(card);
    }
    lastAvailability = null;
    refreshAvailability();
  };
  search.addEventListener('input', () => { query = search.value; feedback.textContent = ''; render(); });
  select.addEventListener('change', () => { category = select.value; feedback.textContent = ''; render(); });
  render();
  requestAnimationFrame(() => { if (guide.isConnected && !body.parentElement.hidden) search.focus(); });
}
