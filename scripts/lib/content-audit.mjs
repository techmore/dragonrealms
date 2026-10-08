// Pure, dependency-free content validation. Fixtures can supply catalogs without
// booting a world or opening the game database.
export const DEFAULT_VERB_LINKS = [
  ['docks', 'rh_ferry'], ['rh_ferry', 'docks'],
  ['passage_ravens', 'pass_hub'], ['passage_swithen', 'pass_hub'],
  ['pass_hub', 'passage_ravens'], ['pass_hub', 'passage_swithen'],
  ['pass_hub', 'pass_den'], ['pass_den', 'pass_hub'],
];
const SETS = new Set(['weapon', 'armor', 'survival', 'lore', 'magic', 'supernatural']);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// The tables are private in guilds.js. Parse only the current literal format,
// and fail explicitly if it changes, rather than evaluating module source or
// silently skipping tables. Comments never count as requirement rows.
export function parseCircleTables(source) {
  const literal = source.match(/const CIRCLE_TABLES = \{([\s\S]*?)\n\};/);
  if (!literal) throw new Error('CIRCLE_TABLES literal not found');
  let body = literal[1].replace(/\/\/[^\n]*/g, '');
  const tables = {};
  body = body.replace(/(\w+)\s*:\s*\[([\s\S]*?)\]\s*,?/g, (_, guild, rowsSource) => {
    if (Object.hasOwn(tables, guild)) throw new Error(`Duplicate circle table ${guild}`);
    const rows = [];
    const remainder = rowsSource.replace(/\{([^{}]*)\}\s*,?/g, (_, rowSource) => {
      const row = {};
      for (const part of rowSource.split(',').map((part) => part.trim()).filter(Boolean)) {
        const match = part.match(/^(\w+)\s*:\s*(\d+(?:\.\d+)?|'[^']*'|true|false)$/);
        if (!match) throw new Error(`Unsupported circle row in ${guild}: ${part}`);
        const [, key, value] = match;
        if (Object.hasOwn(row, key)) throw new Error(`Duplicate circle field ${guild}.${key}`);
        row[key] = value.startsWith("'") ? value.slice(1, -1) : value === 'true' ? true : value === 'false' ? false : Number(value);
      }
      rows.push(row);
      return '';
    });
    if (remainder.trim() || !rows.length) throw new Error(`Unsupported or empty circle table ${guild}`);
    tables[guild] = rows;
    return '';
  });
  if (body.trim() || !Object.keys(tables).length) throw new Error('Unsupported CIRCLE_TABLES structure');
  return tables;
}

export function auditContent(input, options = {}) {
  const issues = [];
  const add = (code, path, message) => issues.push({ code, path, message });
  const catalogs = {};
  const optionalCatalogs = ['forgeRecipes', 'engineerRecipes', 'outfitRecipes', 'craftTechniques', 'manaTypes', 'spellTierRanks', 'spellSlotCosts'];
  for (const name of ['skills', 'guilds', 'items', 'creatures', 'rares', 'npcs', 'rooms', 'zones', 'recipes', 'mana', 'circleTables', ...optionalCatalogs]) {
    if (optionalCatalogs.includes(name) && !Object.hasOwn(input ?? {}, name)) continue;
    const value = input?.[name];
    if (!isObject(value)) {
      add('invalid-shape', name, `${name} must be an object`);
      catalogs[name] = {};
    } else {
      catalogs[name] = Object.fromEntries(Object.entries(value).filter(([id, entry]) => {
        const valid = ['spellTierRanks', 'spellSlotCosts'].includes(name) ? typeof entry === 'number' : name === 'mana' ? typeof entry === 'string' : name === 'circleTables' ? Array.isArray(entry) : isObject(entry);
        if (!valid) add('invalid-shape', `${name}.${id}`, `${name}.${id} has an invalid definition`);
        return valid;
      }));
    }
  }
  const { skills, guilds, items, creatures, rares, npcs, rooms, zones, recipes, mana, circleTables } = catalogs;
  const list = (value, path, optional = true) => {
    if (value === undefined && optional) return [];
    if (!Array.isArray(value)) { add('invalid-shape', path, `${path} must be an array`); return []; }
    return value;
  };
  const object = (value, path, optional = true) => {
    if (value === undefined && optional) return {};
    if (!isObject(value)) { add('invalid-shape', path, `${path} must be an object`); return {}; }
    return value;
  };
  const reference = (catalog, id, path) => {
    if (typeof id !== 'string' || !Object.hasOwn(catalog, id)) add('missing-reference', path, `${path} references missing ${String(id)}`);
  };
  const identity = (definition, id, path) => {
    if (definition.id !== id) add('id-mismatch', path, `${path} key disagrees with id ${definition.id}`);
  };
  const band = (value, path) => {
    if (!Array.isArray(value) || value.length !== 2 || value.some((n) => !Number.isFinite(n) || n < 0) || value[0] > value[1]) add('invalid-range', path, `${path} must be an ordered pair of nonnegative numbers`);
  };
  let spellCount = 0;
  const spellKinds = new Set(['damage', 'heal', 'drain', 'sleep', 'mark', 'ward', 'buff', 'flee', 'teleport']);
  for (const [id, guild] of Object.entries(guilds)) {
    identity(guild, id, `guilds.${id}`);
    for (const field of ['primary', 'secondary']) for (const skill of list(guild[field], `guilds.${id}.${field}`, false)) reference(skills, skill, `guilds.${id}.${field}`);
    if (guild.guildSkill) reference(skills, guild.guildSkill, `guilds.${id}.guildSkill`);
    const spellIds = new Set();
    const spells = list(guild.spells, `guilds.${id}.spells`);
    if (guild.magic !== undefined && typeof guild.magic !== 'boolean') add('invalid-shape', `guilds.${id}.magic`, 'Guild magic flag must be boolean');
    if (guild.magic === false && spells.length) add('nonmagical-curriculum', `guilds.${id}.spells`, 'A nonmagical guild has a spell curriculum');
    for (const [index, spell] of spells.entries()) {
      const path = `guilds.${id}.spells.${index}`;
      if (!isObject(spell)) { add('invalid-shape', path, `${path} must be an object`); continue; }
      spellCount++;
      if (typeof spell.id !== 'string' || !spell.id.trim()) add('invalid-spell-id', `${path}.id`, 'Spell requires a nonempty id');
      if (spellIds.has(spell.id)) add('duplicate-spell-id', `${path}.id`, `Guild ${id} repeats spell ${spell.id}`);
      spellIds.add(spell.id);
      if (typeof spell.name !== 'string' || !spell.name.trim()) add('missing-spell-name', `${path}.name`, 'Spell requires a nonempty name');
      if (!Number.isInteger(spell.mana) || spell.mana <= 0) add('invalid-spell-cost', `${path}.mana`, 'Spell mana cost must be a positive integer');
      if (!Number.isInteger(spell.minCircle) || spell.minCircle < 1) add('invalid-spell-circle', `${path}.minCircle`, 'Spell circle gate must be a positive integer');
      if (!Number.isFinite(spell.base) || spell.base < 0) add('invalid-spell-power', `${path}.base`, 'Spell base power must be nonnegative and finite');
      if (spell.kind && !spellKinds.has(spell.kind)) add('unsupported-spell-kind', `${path}.kind`, `Spell kind ${spell.kind} is not handled by casting`);
      if (spell.kind === 'buff' || spell.buff !== undefined) {
        const buff = object(spell.buff, `${path}.buff`, false);
        if (typeof buff.key !== 'string' || !buff.key.trim()) add('invalid-spell-buff', `${path}.buff.key`, 'Spell buff requires a nonempty effect key');
        if (!Number.isInteger(buff.ticks) || buff.ticks <= 0) add('invalid-spell-buff', `${path}.buff.ticks`, 'Spell buff duration must be a positive integer');
        if (spell.kind !== 'buff') add('spell-buff-kind-mismatch', `${path}.buff`, 'Buff payload belongs to the buff spell kind');
      }
      reference(skills, spell.skill, `${path}.skill`);
      if (!spell.kind) add('missing-field', `${path}.kind`, `${path} has no spell kind`);
    }
    reference(mana, id, `guilds.${id}.mana`);
    reference(circleTables, id, `guilds.${id}.circleTable`);
  }
  if (catalogs.manaTypes) {
    for (const [guild, type] of Object.entries(mana)) {
      reference(guilds, guild, `mana.${guild}.guild`);
      reference(catalogs.manaTypes, type, `mana.${guild}.type`);
      if (guilds[guild]?.magic === true && type === 'none') add('magical-guild-no-mana', `mana.${guild}`, 'A magical guild must have an active mana type');
    }
    for (const [type, definition] of Object.entries(catalogs.manaTypes)) for (const field of ['name', 'desc']) {
      if (typeof definition[field] !== 'string' || !definition[field].trim()) add('invalid-mana-definition', `manaTypes.${type}.${field}`, `Mana type ${type} requires nonempty ${field}`);
    }
  }
  const tiers = ['intro', 'basic', 'intermediate', 'advanced', 'esoteric'];
  for (const name of ['spellTierRanks', 'spellSlotCosts']) if (catalogs[name]) {
    let previous = -1;
    for (const tier of tiers) {
      const value = catalogs[name][tier];
      if (!Number.isInteger(value) || value < (name === 'spellSlotCosts' ? 1 : 0) || value <= previous) add('invalid-spell-tier-value', `${name}.${tier}`, `${name} requires ordered nonnegative integer ranks or positive integer costs`);
      if (name === 'spellTierRanks' && tier === 'intro' && value !== 0) add('invalid-intro-rank', `${name}.${tier}`, 'Intro tier rank must be zero');
      previous = value;
    }
    for (const tier of Object.keys(catalogs[name])) if (!tiers.includes(tier)) add('unknown-spell-tier', `${name}.${tier}`, `Unknown spell tier ${tier}`);
  }
  const magicCounts = { guildSpells: spellCount, magicalGuilds: Object.values(guilds).filter(guild => guild.magic === true).length };
  if (Object.hasOwn(input ?? {}, 'spellTierSamples')) {
    const samples = list(input.spellTierSamples, 'spellTierSamples', false);
    magicCounts.spellTierSamples = samples.length;
    let previousTier = -1;
    for (const [index, sample] of samples.entries()) {
      const path = `spellTierSamples.${index}`;
      if (!isObject(sample)) { add('invalid-shape', path, 'Tier sample must be an object'); continue; }
      if (!Number.isInteger(sample.circle) || sample.circle < 1 || !tiers.includes(sample.tier)) add('invalid-tier-sample', path, 'Tier sample requires positive circle and supported tier');
      if (tiers.indexOf(sample.tier) < previousTier) add('nonmonotonic-spell-tier', path, 'Sampled spell tiers must not decrease');
      previousTier = tiers.indexOf(sample.tier);
      if (catalogs.spellSlotCosts && sample.cost !== catalogs.spellSlotCosts[sample.tier]) add('spell-slot-cost-mismatch', path, 'Sampled spell cost disagrees with tier catalog');
    }
  }
  if (Object.hasOwn(input ?? {}, 'spellSlotSamples')) {
    const samples = list(input.spellSlotSamples, 'spellSlotSamples', false);
    magicCounts.spellSlotSamples = samples.length;
    const previous = new Map();
    for (const [index, sample] of samples.entries()) {
      const path = `spellSlotSamples.${index}`;
      if (!isObject(sample)) { add('invalid-shape', path, 'Slot sample must be an object'); continue; }
      reference(guilds, sample.guild, `${path}.guild`);
      if (!Number.isInteger(sample.circle) || sample.circle < 1 || !['primary', 'secondary', 'tertiary'].includes(sample.tier)) add('invalid-spell-slot-sample', path, 'Slot sample requires positive circle and known magic tier');
      for (const field of ['total', 'used', 'forgottenAllUsed']) if (!Number.isInteger(sample[field]) || sample[field] < 0) add('invalid-spell-slot-count', `${path}.${field}`, 'Slot counts must be nonnegative integers');
      if (sample.forgottenAllUsed !== 0) add('forgotten-spell-slots', path, 'Forgetting the entire curriculum must release every used slot');
      if (guilds[sample.guild]?.magic === false && sample.total !== 0) add('nonmagical-spell-slots', path, 'Nonmagical guilds must have zero spell slots');
      for (const field of ['rate', 'regen']) if (!Number.isFinite(sample[field]) || sample[field] <= 0 || sample[field] > 1) add('invalid-magic-rate', `${path}.${field}`, 'Magic rate must be finite in (0, 1]');
      const earlier = previous.get(sample.guild);
      if (earlier && sample.circle > earlier.circle && sample.total < earlier.total) add('nonmonotonic-spell-slots', path, 'Slot budgets must not decrease with circle');
      previous.set(sample.guild, sample);
    }
  }
  if (Object.hasOwn(input ?? {}, 'manaCycleSamples')) {
    const samples = list(input.manaCycleSamples, 'manaCycleSamples', false);
    magicCounts.manaCycleSamples = samples.length;
    for (const [index, sample] of samples.entries()) {
      const path = `manaCycleSamples.${index}`;
      if (!isObject(sample)) { add('invalid-shape', path, 'Mana sample must be an object'); continue; }
      if (catalogs.manaTypes) reference(catalogs.manaTypes, sample.type, `${path}.type`);
      if (!Number.isFinite(sample.hours) || !Number.isFinite(sample.level) || sample.level < 0 || sample.level > 1) add('invalid-mana-cycle', path, 'Mana cycle samples require finite time and level in [0, 1]');
    }
  }
  for (const [id, rows] of Object.entries(circleTables)) {
    reference(guilds, id, `circleTables.${id}`);
    for (const [index, row] of rows.entries()) {
      const path = `circleTables.${id}.${index}`;
      if (!isObject(row)) { add('invalid-shape', path, `${path} must be an object`); continue; }
      if (row.skill) reference(skills, row.skill, `${path}.skill`);
      if (row.set && !SETS.has(row.set)) add('unknown-skillset', `${path}.set`, `${path} has unknown skillset ${row.set}`);
      if (!Number.isFinite(row.rank) || row.rank < 0) add('invalid-range', `${path}.rank`, `${path} requires a nonnegative rank`);
      if (row.nth !== undefined && (!Number.isInteger(row.nth) || row.nth < 1 || !row.set)) add('invalid-requirement', path, `${path} has a malformed nth requirement`);
      if (!row.skill && row.nth === undefined) add('invalid-requirement', path, `${path} requires a skill or nth skillset`);
    }
  }
  const itemCounts = { weaponItems: 0, armorItems: 0, consumableItems: 0, cambrinthItems: 0, equippableItems: 0, circleGatedItems: 0 };
  for (const [id, item] of Object.entries(items)) {
    const path = `items.${id}`;
    identity(item, id, path);
    const has = field => Object.hasOwn(item, field);
    const numeric = (field, positive = false) => {
      if (has(field) && (!Number.isFinite(item[field]) || (positive ? item[field] <= 0 : item[field] < 0))) add('invalid-item-number', `${path}.${field}`, `${path}.${field} must be finite and ${positive ? 'positive' : 'nonnegative'}`);
    };
    // Complete authored catalogs require common fields. Lightweight fixtures
    // may omit them, but explicitly malformed values are always diagnosed.
    if (options.requireItemFields) for (const field of ['name', 'type', 'slot', 'value']) {
      if (!has(field)) add('missing-item-field', `${path}.${field}`, `${path} requires authored ${field}`);
    }
    for (const field of ['name', 'type']) if (has(field) && (typeof item[field] !== 'string' || !item[field].trim())) add('invalid-item-field', `${path}.${field}`, `${path}.${field} must be a nonempty string`);
    if (has('slot') && item.slot !== null && (typeof item.slot !== 'string' || !item.slot.trim())) add('invalid-item-slot', `${path}.slot`, `${path}.slot must be null or a nonempty equipment key`);
    for (const field of ['value', 'burden', 'weight', 'magicEdge']) numeric(field);
    if (has('req') && (!Number.isInteger(item.req) || item.req < 0)) add('invalid-item-circle', `${path}.req`, `${path}.req must be a nonnegative integer circle gate (zero means no gate)`);
    if (item.req > 0) itemCounts.circleGatedItems++;
    if (typeof item.slot === 'string' && item.slot.trim()) itemCounts.equippableItems++;
    if (has('skill')) reference(skills, item.skill, `${path}.skill`);
    if (item.type === 'weapon') {
      itemCounts.weaponItems++;
      band(item.dmg, `${path}.dmg`);
      numeric('speed', true);
      if (has('slot') && item.slot !== 'hand') add('weapon-slot-mismatch', `${path}.slot`, `${path} weapon must occupy the hand slot`);
      if (options.requireItemFields) for (const field of ['skill', 'speed']) if (!has(field)) add('missing-item-field', `${path}.${field}`, `${path} weapon requires ${field}`);
    }
    if (item.type === 'armor') {
      itemCounts.armorItems++;
      if (!Number.isFinite(item.armor) || item.armor <= 0) add('invalid-range', `${path}.armor`, `${path} requires a positive armor value`);
      if (has('slot') && (typeof item.slot !== 'string' || !item.slot.trim() || item.slot === 'hand')) add('armor-slot-mismatch', `${path}.slot`, `${path} armor requires an equipped body, shield or accessory slot`);
      if (options.requireItemFields && !has('skill')) add('missing-item-field', `${path}.skill`, `${path} armor requires a training skill`);
    }
    if (item.type === 'consumable') {
      itemCounts.consumableItems++;
      if (has('slot') && item.slot !== null) add('consumable-slot-mismatch', `${path}.slot`, `${path} consumables cannot be equipped`);
    }
    for (const field of ['restore', 'restoreMana']) {
      numeric(field, true);
      if (has(field) && item.type !== 'consumable') add('consumable-effect-type', `${path}.${field}`, `${path}.${field} is only consumed on consumable items`);
    }
    if (has('buff')) {
      const buffs = object(item.buff, `${path}.buff`, false);
      if (item.type !== 'consumable') add('consumable-effect-type', `${path}.buff`, `${path} item buffs require a consumable`);
      if (!Object.keys(buffs).length) add('invalid-item-buff', `${path}.buff`, `${path} buff payload must not be empty`);
      for (const [key, ticks] of Object.entries(buffs)) if (!key.trim() || !Number.isInteger(ticks) || ticks <= 0) add('invalid-item-buff', `${path}.buff.${key}`, `${path} buff durations must be positive integer ticks with nonempty effect keys`);
      if (item.restore > 0 || item.restoreMana > 0) add('shadowed-consumable-effect', `${path}.buff`, `${path} buff consumption returns before restoration, so mixed effects cannot both apply`);
    }
    if (item.type === 'cambrinth') {
      itemCounts.cambrinthItems++;
      if (!Number.isFinite(item.capacity) || item.capacity <= 0) add('invalid-cambrinth-capacity', `${path}.capacity`, `${path} cambrinth requires positive finite capacity`);
    } else if (has('capacity')) numeric('capacity', true);
  }
  for (const [catalogName, catalog] of [['creatures', creatures], ['rares', rares]]) {
    for (const [id, creature] of Object.entries(catalog)) {
      const path = `${catalogName}.${id}`;
      if (catalogName === 'creatures') identity(creature, id, path);
      else reference(zones, id, `${path}.zone`);
      const weapon = object(creature.weapon, `${path}.weapon`, false);
      reference(skills, weapon.skill, `${path}.weapon.skill`);
      for (const loot of list(creature.loot, `${path}.loot`)) reference(items, loot, `${path}.loot`);
      if (creature.teaches !== undefined) band(creature.teaches, `${path}.teaches`);
    }
  }
  for (const [id, npc] of Object.entries(npcs)) {
    const path = `npcs.${id}`;
    identity(npc, id, path);
    for (const item of Object.keys(object(npc.stock, `${path}.stock`))) reference(items, item, `${path}.stock`);
    for (const item of list(npc.buys, `${path}.buys`)) reference(items, item, `${path}.buys`);
    if (npc.role === 'guild') reference(guilds, npc.guild, `${path}.guild`);
  }
  const rareIds = new Set(Object.values(rares).map((rare) => rare.id));
  const exits = {};
  const oneWay = new Set(options.oneWayExits ?? ['pier>rh_square']);
  for (const [id, room] of Object.entries(rooms)) exits[id] = object(room.exits, `rooms.${id}.exits`);
  for (const [id, room] of Object.entries(rooms)) {
    const path = `rooms.${id}`;
    identity(room, id, path);
    reference(zones, room.zone, `${path}.zone`);
    for (const npc of list(room.npcs, `${path}.npcs`)) reference(npcs, npc, `${path}.npcs`);
    for (const spawn of list(room.spawns, `${path}.spawns`)) {
      if (rareIds.has(spawn)) add('rare-spawn', `${path}.spawns`, `${path} lists rare ${spawn} as a regular spawn; this slot never stocks`);
      else reference(creatures, spawn, `${path}.spawns`);
    }
    for (const [direction, target] of Object.entries(exits[id])) {
      reference(rooms, target, `${path}.exits.${direction}`);
      if (Object.hasOwn(rooms, target) && !Object.values(exits[target]).includes(id) && !oneWay.has(`${id}>${target}`)) add('one-way-exit', `${path}.exits.${direction}`, `${path} exit to ${target} is not reciprocal`);
    }
  }
  const verbOut = {};
  for (const [from, to] of options.verbLinks ?? DEFAULT_VERB_LINKS) {
    reference(rooms, from, `travel.${from}.from`);
    reference(rooms, to, `travel.${from}.to`);
    (verbOut[from] ??= []).push(to);
  }
  const origins = options.origins ?? ['square', 'rh_square'];
  for (const origin of origins) reference(rooms, origin, `origins.${origin}`);
  const reachable = new Set(origins.filter((id) => Object.hasOwn(rooms, id)));
  const frontier = [...reachable];
  for (let index = 0; index < frontier.length; index++) {
    const id = frontier[index];
    for (const target of [...Object.values(exits[id]), ...(verbOut[id] ?? [])]) {
      if (!reachable.has(target) && Object.hasOwn(rooms, target)) { reachable.add(target); frontier.push(target); }
    }
  }
  for (const id of Object.keys(rooms)) if (!reachable.has(id)) add('unreachable-room', `rooms.${id}`, `room ${id} is unreachable from every starting city`);
  const craftingCounts = { alchemyRecipes: Object.keys(recipes).length };
  for (const [name, discipline] of [['recipes', 'alchemy'], ['forgeRecipes', 'forging'], ['engineerRecipes', 'engineering'], ['outfitRecipes', 'outfitting']]) {
    const catalog = catalogs[name];
    if (!catalog) continue;
    craftingCounts[`${discipline}Recipes`] = Object.keys(catalog).length;
    if (name !== 'recipes') reference(skills, discipline, `${name}.skill`);
    for (const [id, recipe] of Object.entries(catalog)) {
      const path = `${name}.${id}`;
      identity(recipe, id, path);
      reference(items, recipe.item, `${path}.item`);
      if (name !== 'recipes' || recipe.minSkill !== undefined) {
        if (!Number.isInteger(recipe.minSkill) || recipe.minSkill < 0) add('invalid-rank', `${path}.minSkill`, `${path} requires a nonnegative integer minSkill`);
      }
      const ingredients = object(recipe.ingredients, `${path}.ingredients`, false);
      if (!Object.keys(ingredients).length) add('missing-ingredients', `${path}.ingredients`, `${path} requires at least one ingredient`);
      for (const [item, quantity] of Object.entries(ingredients)) {
        reference(items, item, `${path}.ingredients.${item}`);
        if (!Number.isInteger(quantity) || quantity <= 0) add('invalid-quantity', `${path}.ingredients.${item}`, `${path} ingredient ${item} requires a positive integer quantity`);
      }
    }
  }
  const disciplines = ['alchemy', 'forging', 'engineering', 'outfitting'];
  if (catalogs.craftTechniques) {
    for (const discipline of disciplines) craftingCounts[`${discipline}Techniques`] = 0;
    for (const [id, technique] of Object.entries(catalogs.craftTechniques)) {
      const path = `craftTechniques.${id}`;
      identity(technique, id, path);
      reference(skills, technique.skill, `${path}.skill`);
      if (!disciplines.includes(technique.skill)) add('invalid-discipline', `${path}.skill`, `${path} requires a supported crafting discipline`);
      else craftingCounts[`${technique.skill}Techniques`]++;
      if (!Number.isInteger(technique.minRank) || technique.minRank < 0) add('invalid-rank', `${path}.minRank`, `${path} requires a nonnegative integer minRank`);
      const effect = object(technique.effect, `${path}.effect`, false);
      if (!['quality', 'order', 'brew', 'potency'].includes(effect.kind)) add('invalid-effect', `${path}.effect.kind`, `${path} has an unsupported effect kind`);
      else if ((['brew', 'potency'].includes(effect.kind) && technique.skill !== 'alchemy') || (effect.kind === 'quality' && technique.skill === 'alchemy')) add('effect-discipline-mismatch', `${path}.effect.kind`, `${path} effect does not apply to its discipline`);
      if (!Number.isFinite(effect.mag) || effect.mag <= 0) add('invalid-effect', `${path}.effect.mag`, `${path} requires a positive finite effect magnitude`);
    }
  }
  if (Object.hasOwn(input ?? {}, 'qualityLadder')) {
    const ladder = list(input.qualityLadder, 'qualityLadder', false);
    craftingCounts.qualityLevels = ladder.length;
    if (!ladder.length) add('invalid-quality-ladder', 'qualityLadder', 'Quality ladder must contain at least one level');
    const names = new Set();
    let previousMin = -1, previousMult = 0;
    for (const [index, level] of ladder.entries()) {
      const path = `qualityLadder.${index}`;
      if (!isObject(level)) { add('invalid-shape', path, `${path} must be an object`); continue; }
      if (typeof level.name !== 'string' || !level.name.trim() || names.has(level.name)) add('invalid-quality-name', `${path}.name`, `${path} requires a unique nonempty name`);
      names.add(level.name);
      if (!Number.isFinite(level.min) || level.min < 0 || level.min > 1 || level.min <= previousMin || (index === 0 && level.min !== 0)) add('invalid-quality-threshold', `${path}.min`, `${path} threshold must be between 0 and 1, strictly increasing, and start at zero`);
      if (!Number.isFinite(level.mult) || level.mult <= 0 || level.mult <= previousMult) add('invalid-quality-multiplier', `${path}.mult`, `${path} multiplier must be positive, finite and strictly increasing`);
      previousMin = level.min;
      previousMult = level.mult;
    }
  }
  if (Object.hasOwn(input ?? {}, 'craftSlotSamples')) {
    const samples = list(input.craftSlotSamples, 'craftSlotSamples', false);
    craftingCounts.craftSlotSamples = samples.length;
    if (!samples.length) add('invalid-slot-samples', 'craftSlotSamples', 'Craft slot samples must contain at least one rank');
    const byRank = new Map();
    for (const [index, sample] of samples.entries()) {
      const path = `craftSlotSamples.${index}`;
      if (!isObject(sample)) { add('invalid-shape', path, `${path} must be an object`); continue; }
      if (!Number.isFinite(sample.rank) || sample.rank < 0 || typeof sample.affinity !== 'boolean') add('invalid-slot-sample', path, `${path} requires nonnegative rank and boolean affinity`);
      if (!Number.isInteger(sample.slots) || sample.slots < 1 || sample.slots > 6) add('invalid-slot-count', `${path}.slots`, `${path} requires between one and six integer slots`);
      const key = `${sample.rank}:${sample.affinity}`;
      if (byRank.has(key)) add('duplicate-slot-sample', path, `${path} repeats a rank/affinity sample`);
      byRank.set(key, sample.slots);
    }
    for (const affinity of [false, true]) {
      let previousSlots = 0;
      for (const sample of samples.filter(sample => isObject(sample) && sample.affinity === affinity).sort((a, b) => a.rank - b.rank)) {
        if (sample.slots < previousSlots) add('nonmonotonic-slots', 'craftSlotSamples', 'Craft slots must not decrease as rank increases');
        previousSlots = sample.slots;
        const base = byRank.get(`${sample.rank}:false`), bonus = byRank.get(`${sample.rank}:true`);
        if (affinity && base !== undefined && bonus !== undefined && (bonus < base || bonus > Math.min(6, base + 1))) add('invalid-affinity-slots', 'craftSlotSamples', 'Craft affinity must retain base slots and add at most one within the six-slot cap');
      }
    }
  }
  for (const [index, ability] of list(input?.abilities, 'abilities', false).entries()) {
    if (!isObject(ability)) { add('invalid-shape', `abilities.${index}`, `abilities.${index} must be an object`); continue; }
    if (ability.minCircle > 10) add('ability-scope', `abilities.${index}.minCircle`, `ability ${ability.id} exceeds circle-10 scope`);
  }
  return { schemaVersion: 1, ok: issues.length === 0, counts: { ...Object.fromEntries(Object.entries(catalogs).map(([name, catalog]) => [name, Object.keys(catalog).length])), ...craftingCounts, ...magicCounts, ...itemCounts }, reachableRooms: reachable.size, issueCount: issues.length, issues };
}
