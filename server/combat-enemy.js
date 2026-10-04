// A fight owns positioning/timers/debuffs, but the world owns a live spawn's
// vitality and lifetime. Accessors cover every damage path (spells, allies,
// reflection, maneuvers) without duplicating synchronization in each attack.
export function combatEnemyView(source) {
  const enemy = { range: 'melee', ...source };
  const instance = enemy.instance;
  if (!instance) return enemy; // standalone fixtures and PvP retain local state
  const generation = instance.generation || 0;
  let retired = false;
  Object.defineProperties(enemy, {
    hp: { enumerable: true, get: () => instance.hp,
      set: (value) => { if (!enemy.dead) instance.hp = value; } },
    maxHp: { enumerable: true, get: () => instance.maxHp },
    dead: { enumerable: true,
      get: () => retired || !instance.alive || (instance.generation || 0) !== generation,
      set: (value) => { retired = Boolean(value); } },
  });
  return enemy;
}
