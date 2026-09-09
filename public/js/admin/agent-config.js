// Browser-safe launch contract; tests compare these IDs with authored content.
export const AG_RACES = ['human', 'dwarf', 'elf', 'elothean', 'gnome', 'gortog', 'halfling', 'kaldar', 'prydaen', 'rakash', 'skra'];
export const AG_GUILDS = ['barbarian', 'bard', 'cleric', 'empath', 'moonmage', 'necromancer', 'paladin', 'ranger', 'thief', 'trader', 'warmage'];

export function validateAgentConfig(input) {
  const name = String(input.name || '').trim();
  const race = String(input.race || '').trim().toLowerCase();
  const guild = String(input.guild || '').trim().toLowerCase();
  if (!/^[A-Za-z]{2,20}$/.test(name)) throw new Error('Character name must be 2–20 letters.');
  if (!AG_RACES.includes(race)) throw new Error('Choose a supported race.');
  if (!AG_GUILDS.includes(guild)) throw new Error('Choose a supported guild.');
  const number = (key, fallback, min, max, integer = false) => {
    const raw = input[key] === undefined ? fallback : input[key];
    const value = Number(raw);
    if (raw === '' || raw === null || typeof raw === 'boolean' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      throw new Error(`${key} must be ${integer ? 'a whole number' : 'a number'} from ${min} to ${max}.`);
    }
    return value;
  };
  return { name, race, guild,
    minutes: number('minutes', 10, 1, 720),
    circleTarget: number('circleTarget', 2, 2, 20, true),
    boost: number('boost', 0, 0, 100, true),
    fleePct: number('fleePct', 0.35, 0.05, 0.95),
    tickMs: number('tickMs', 1500, 500, 10000, true),
  };
}

export const AG_STATUS_LABELS = {
  connecting: 'connecting', registering: 'registering', creating: 'creating character',
  loading_scripts: 'loading scripts', running: 'running', completed: 'target reached',
  time_limit: 'time limit reached', script_finished: 'script finished',
  cancelled: 'cancelled', failed: 'failed', interrupted: 'interrupted by tab reload',
};
