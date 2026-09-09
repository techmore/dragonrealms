// The DIR verb: step-by-step directions to town landmarks (Elanthipedia
// "Directions command", clean-room). Behavior we model:
//   DIR .................. help + category summary
//   DIR LIST [category] .. destinations available in the player's city
//   DIR <place> [steps] .. walk directions; default 5 steps, more on request
// Routes are BFS over the real room graph (data/grid.js findPath), so the
// directions always match how movement actually works — no hand-maintained
// path table to drift out of sync. `dir` only answers in town (city zones
// with a DIR_DESTINATIONS table); the wilds get DR-flavored refusal prose.
import { ROOMS } from '../../data/world.js';
import { findPath, cityOf } from '../../data/grid.js';

// Keyword → room id, per city. Keys are the names a player types; aliases
// ride along as extra keys. Categories match the DIR LIST groups.
export const DIR_DESTINATIONS = {
  crossing: {
    guilds: {
      'barbarian guild': 'hall_barbarian', barbarian: 'hall_barbarian',
      'bard guild': 'hall_bard', bard: 'hall_bard',
      'cleric guild': 'hall_cleric', cleric: 'hall_cleric',
      'empath guild': 'hall_empath', empath: 'hall_empath',
      'moon mage guild': 'hall_moonmage', 'moonmage': 'hall_moonmage', 'moon mage': 'hall_moonmage',
      'necromancer guild': 'hall_necromancer', necromancer: 'hall_necromancer',
      'paladin guild': 'hall_paladin', paladin: 'hall_paladin',
      'ranger guild': 'hall_ranger', ranger: 'hall_ranger',
      "thief guild": 'hall_thief', thief: 'hall_thief', thieves: 'hall_thief',
      'trader guild': 'hall_trader', trader: 'hall_trader',
      'warrior mage guild': 'hall_warmage', 'warmage': 'hall_warmage', 'warrior mage': 'hall_warmage',
    },
    training: {
      training: 'fane', 'fane': 'fane', 'fane of training': 'fane',
      academy: 'academy', 'asemath academy': 'academy',
    },
    gates: {
      'north gate': 'north_gate', 'northeast gate': 'ne_gate', 'east gate': 'east_gate',
      'west gate': 'west_gate', docks: 'docks', ferry: 'rh_ferry',
    },
    hunting: {
      shipyard: 'tg_n', goblins: 'tg_ne', vineyard: 'tg_n', brambles: 'tg_nw',
    },
    shops: {
      herbalist: 'market_way', alchemist: 'alchemy_soc', 'alchemy society': 'alchemy_soc',
      weapons: 'bazaar', armor: 'bazaar', music: 'music_shop',
      locksmith: 'market_way', tanner: 'west_road', tannery: 'west_road',
      gems: 'market_plaza', pawnshop: 'market_plaza', artificer: 'rh_enchanting',
      repair: 'forge', forge: 'forge', tailor: 'tailor_shop',
      general: 'outfitting_row', 'general store': 'outfitting_row',
    },
    other: {
      'guard house': 'guard_house', bank: 'bank_plaza', hospital: 'temple',
      favors: 'temple', temple: 'temple', 'town hall': 'town_hall',
      debt: 'bank_plaza', "taelbert's inn": 'sand_spit', "half pint inn": 'half_pint',
      library: 'academy', 'town green': 'square', carousel: 'carousel',
      healerie: 'temple', mentors: 'academy', jail: 'jail',
      bazaar: 'bazaar', market: 'market_way', 'amusement pier': 'pier', pier: 'pier',
      'meeting hall': 'meeting_hall', inn: 'half_pint',
      'guild district': 'hall_walk', 'guild halls': 'hall_walk',
    },
  },
  riverhaven: {
    guilds: {
      guilds: 'rh_guilds', 'guild hall': 'rh_guilds', 'guilds hall': 'rh_guilds',
      'barbarian guild': 'rh_hall_barbarian', barbarian: 'rh_hall_barbarian',
      'bard guild': 'rh_hall_bard', bard: 'rh_hall_bard',
      'cleric guild': 'rh_hall_cleric', cleric: 'rh_hall_cleric',
      'empath guild': 'rh_hall_empath', empath: 'rh_hall_empath',
      'moon mage guild': 'rh_hall_moonmage', 'moon mage': 'rh_hall_moonmage', 'moonmage': 'rh_hall_moonmage',
    },
    gates: {
      ferry: 'rh_ferry',
    },
    shops: {
      market: 'rh_market', weapons: 'rh_market', armor: 'rh_market',
      bank: 'rh_market', 'enchanting society': 'rh_enchanting', artificer: 'rh_enchanting',
    },
    other: {
      temple: 'rh_temple', 'harbor shrine': 'rh_temple', healer: 'rh_temple',
      'temple garden': 'rh_temple_garden', academy: 'rh_academy', 'dance academy': 'rh_academy',
      "noble inn": 'rh_noble_inn', inn: 'rh_noble_inn', 'town square': 'rh_square',
    },
  },
};

// Category display order + prose taglines (DR-flavored, short).
const CATEGORY_TAGLINES = {
  guilds: 'Where the guild halls wait.',
  training: 'Rooms of learning and discipline.',
  gates: 'Ways out of town, and the river landing.',
  hunting: 'Where the creatures are said to be thick.',
  shops: 'Coin for goods, goods for coin.',
  other: 'Everything else worth finding.',
};

function cityDestinations(city) {
  return DIR_DESTINATIONS[city] || null;
}

function lookupDestination(city, query) {
  const table = cityDestinations(city);
  if (!table) return null;
  const q = String(query || '').toLowerCase().trim();
  if (!q) return null;
  // Exact keyword, then unique keyword/room-name containment match.
  for (const category of Object.keys(table)) {
    const dest = table[category][q];
    if (dest && ROOMS[dest]) return { category, roomId: dest, key: q };
  }
  for (const category of Object.keys(table)) {
    const matches = Object.entries(table[category])
      .filter(([key]) => key.includes(q) || (ROOMS[table[category][key]]?.name || '').toLowerCase().includes(q));
    const rooms = new Set(matches.map(([, id]) => id));
    if (rooms.size === 1) {
      const roomId = [...rooms][0];
      if (ROOMS[roomId]) return { category, roomId, key: matches[0][0] };
    }
  }
  return null;
}

function listDestinations(city, category) {
  const table = cityDestinations(city);
  if (!table) return null;
  const names = (cat) => {
    const roomIds = new Set(Object.values(table[cat] || {}));
    const labelFor = (id) => {
      const room = ROOMS[id];
      if (!room) return null;
      // Prefer a keyword spelling (e.g. "barbarian guild") over room id,
      // since that is what the player would type.
      const key = Object.entries(table[cat]).find(([, v]) => v === id)?.[0] || id;
      return { label: key.replace(/\b\w/g, (c) => c.toUpperCase()), room: room.name };
    };
    return [...roomIds].map(labelFor).filter(Boolean);
  };
  if (category) {
    const cat = category.toLowerCase();
    if (!table[cat]) return { unknown: category, categories: Object.keys(table) };
    return { category: cat, entries: names(cat), tagline: CATEGORY_TAGLINES[cat] };
  }
  return { all: Object.keys(table).map((cat) => ({ cat, entries: names(cat) })) };
}

// Directions text for a path: group repeated directions run-length style and
// present the first `steps` of them, exactly like DIR BANK 5 shows 5 moves.
function formatDirections(fromRoom, toRoom, path, steps) {
  const dest = ROOMS[toRoom];
  if (!path.length) return `You are already standing in ${dest ? dest.name : toRoom}.`;
  const shown = path.slice(0, steps);
  const remainder = path.length - shown.length;
  const run = [];
  for (const dir of shown) {
    const last = run[run.length - 1];
    if (last && last.dir === dir) last.n += 1;
    else run.push({ dir, n: 1 });
  }
  const rendered = run.map((r) => (r.n > 1 ? `${r.n}x ${r.dir}` : r.dir)).join(', ');
  const tail = remainder > 0
    ? ` ...and ${remainder} more step${remainder === 1 ? '' : 's'} beyond that — "dir <place> ${path.length}" shows the whole way.`
    : ' That should do it.';
  return `Heading to ${dest ? dest.name : toRoom} from here: ${rendered}.${tail}`;
}

export function dirHelp(city) {
  const table = cityDestinations(city);
  if (!table) return 'The locals here do not offer directions — the DIR verb speaks for the towns. Try it inside Crossing or Riverhaven.';
  const cats = Object.keys(table).map((c) => `${c} (${Object.keys(table[c]).length})`).join(', ');
  return [
    '\x1b[1mDirections\x1b[0m',
    '  dir list [category]  — what you can ask for, by category',
    '  dir <place> [steps]  — how to walk there (default 5 steps at a time)',
    `  Categories here: ${cats}`,
    '  Example: dir bank, dir bank 15, dir barbarian',
  ].join('\n');
}

// ctx = { game, p, arg1, arg2, rest, emit }
export function dirCommand(ctx) {
  const { game, p, arg1, emit } = ctx;
  const city = cityOf(p.room);
  if (!city || !cityDestinations(city)) {
    return emit('The locals here do not offer directions. The DIR verb speaks for the towns, and you are not in one.');
  }
  const rest = String(ctx.rest || '').trim();
  if (!arg1) return emit(dirHelp(city));

  const first = String(arg1).toLowerCase();
  const second = String(ctx.arg2 || '').toLowerCase();
  const remainder = rest.replace(/^\s*\S+\s*/, '').trim(); // rest minus arg1

  if (first === 'help') return emit(dirHelp(city));

  if (first === 'list') {
    // dir list | dir list shops | dir list guilds ...
    const category = second || null;
    const result = listDestinations(city, category);
    if (!result) return emit(dirHelp(city));
    if (result.unknown) {
      return emit(`No such category — try one of: ${result.categories.join(', ')}.`);
    }
    if (result.all) {
      const lines = ['\x1b[1mYou could ask directions to:\x1b[0m'];
      for (const { cat, entries } of result.all) {
        if (!entries.length) continue;
        lines.push(`\x1b[1m${cat.charAt(0).toUpperCase() + cat.slice(1)}\x1b[0m — ${entries.map((e) => e.label).join(', ')}`);
      }
      return emit(lines.join('\n'));
    }
    const lines = [`\x1b[1m${result.category.charAt(0).toUpperCase() + result.category.slice(1)}\x1b[0m — ${result.tagline || ''}`,
      result.entries.map((e) => `${e.label} (${e.room})`).join(', ')];
    return emit(lines.join('\n'));
  }

  // dir <place> [steps] — rebuild the query from the dispatcher's args.
  // arg1/arg2 come from the same token stream as rest, so appending
  // remainder after second would double-count arg2 ("ferry 30" became
  // "ferry 30 30"); strip the numeric tail from the full rest instead.
  const queryParts = rest.split(/\s+/).filter(Boolean);
  let steps = 5;
  const numericTail = queryParts.length > 1 && /^\d+$/.test(queryParts[queryParts.length - 1])
    ? Number(queryParts[queryParts.length - 1]) : null;
  const queryWords = numericTail != null ? queryParts.slice(0, -1) : queryParts;
  if (numericTail != null) steps = Math.max(1, Math.min(30, numericTail));
  const query = queryWords.join(' ').trim();
  if (!query) return emit(dirHelp(city));

  const dest = lookupDestination(city, query);
  if (!dest) {
    return emit(`You cannot recall directions to "${query}" from here. Try "dir list" to see what the locals know.`);
  }
  const path = findPath(p.room, dest.roomId);
  if (!path) {
    return emit(`The way to ${ROOMS[dest.roomId]?.name || query} is a mystery to the locals from where you stand.`);
  }
  emit(formatDirections(p.room, dest.roomId, path, steps));
}

// Dispatcher registry: DIR (and its spelled-out sibling DIRECTION) are free
// reads — never roundtime-gated, exactly like `look`.
export const commands = {
  dir: dirCommand,
  direction: dirCommand,
};
