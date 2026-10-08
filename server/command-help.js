// Shared with the browser reference so syntax and discovery prose stay aligned.
// This module only formats text; it never dispatches a suggested command.
import { COMMAND_CATEGORIES, COMMAND_REFERENCE, searchCommands } from '../public/js/command-reference.js';
import { COMMAND_METADATA } from './commands/metadata.js';

const CATEGORY_ALIASES = new Map([
  ['movement', 'Exploration'], ['travel', 'Exploration'], ['world', 'Exploration'], ['wilds', 'Exploration'],
  ['fighting', 'Combat'], ['battle', 'Combat'],
  ['training', 'Character'], ['advancement', 'Character'], ['progression', 'Character'],
  ['items', 'Equipment'], ['gear', 'Equipment'],
  ['shops', 'Economy'], ['shopping', 'Economy'], ['banking', 'Economy'],
  ['crafts', 'Crafting'], ['spellcasting', 'Magic'], ['spells and mana', 'Magic'],
  ['guild', 'Guild powers'], ['guilds', 'Guild powers'], ['powers', 'Guild powers'], ['arts', 'Guild powers'],
  ['abilities', 'Guild powers'], ['guild abilities', 'Guild powers'],
  ['scripting', 'Client'], ['shortcuts', 'Client'],
]);

export function commandHelpEntries(query) {
  const normalized = String(query || '').replace(/[\x00-\x1f\x7f]/g, ' ').trim().toLowerCase().replace(/\s+/g, ' ');
  const exact = COMMAND_REFERENCE.find((entry) => entry.verb === normalized || entry.aliases.includes(normalized));
  if (exact) return { query: normalized, entries: [exact] };
  for (const [canonical, metadata] of Object.entries(COMMAND_METADATA)) {
    if (metadata.aliases?.includes(normalized)) {
      const entry = COMMAND_REFERENCE.find((candidate) => candidate.verb === canonical);
      if (entry) return { query: normalized, entries: [entry] };
    }
  }
  const category = COMMAND_CATEGORIES.find((candidate) => candidate.toLowerCase() === normalized)
    || CATEGORY_ALIASES.get(normalized);
  return { query: normalized, category, entries: normalized ? searchCommands(category ? '' : normalized, category || '') : [] };
}

export function formatCommandHelp(query) {
  const result = commandHelpEntries(query);
  const categories = COMMAND_CATEGORIES.join(', ');
  if (['topics', 'categories'].includes(result.query)) {
    return `\nHelp topics: ${categories}.\nUse "help <topic>", "help <command>", or "help <search terms>". Try "help combat" or "help join".`;
  }
  if (!result.entries.length) {
    return `No command reference matches "${result.query}".\nTry a command name or fewer search terms. Help topics: ${categories}.\nUse "help" for the quick overview or "help topics" for browsing.`;
  }
  const shown = result.entries.slice(0, 20);
  const lines = [`\nHelp — ${result.category || result.query}`];
  for (const entry of shown) {
    lines.push(`  ${entry.syntax}${entry.local ? ' (client command)' : ''}`);
    lines.push(`    ${entry.description}`);
    if (entry.aliases.length) lines.push(`    Aliases: ${entry.aliases.join(', ')}.`);
  }
  if (shown.length < result.entries.length) lines.push(`\nShowing ${shown.length} of ${result.entries.length} matches. Add search terms to narrow the list.`);
  lines.push('\nUse "help <command>" for one command, or "help topics" for categories.');
  return lines.join('\n');
}
