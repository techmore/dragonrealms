// Weather & seasons: the sky drifts every few game-hours, weighted by season.
// Storms charge mana and scatter game; fog dims both. Extracted from Game so
// the facade stays pure delegation — Game owns only the ticker + state slot.

export const WEATHER_MS = 4 * 60 * 1000; // one weather state lasts ~4 min

const WEATHER_POOL = {
  spring: ['clear', 'fair', 'rain', 'fog', 'storm'],
  summer: ['clear', 'fair', 'fair', 'storm', 'fog'],
  autumn: ['clear', 'rain', 'rain', 'fog', 'fair'],
  winter: ['clear', 'snow', 'snow', 'fog', 'storm'],
};

function seasonFor(date) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

// `state` is a {kind, until, season} box owned by the Game instance (kept
// there so saves/tests can inspect it); roll replaces it when lapsed.
export function roll(state) {
  if (Date.now() < state.until) return state;
  const season = seasonFor(new Date());
  const pool = WEATHER_POOL[season];
  return {
    kind: pool[Math.floor(Math.random() * pool.length)],
    until: Date.now() + WEATHER_MS * (0.6 + Math.random() * 0.8),
    season,
  };
}

export function now(state) {
  return { ...state, season: state.season || seasonFor(new Date()) };
}

// Wilds fortune shifts with the sky: clear skies help, storms hinder.
export function luckMod(game) {
  game.weather = roll(game.weather);
  return { clear: 0.08, fair: 0.03, rain: -0.05, fog: -0.1, storm: -0.15, snow: -0.08 }[game.weather.kind] || 0;
}

// Mana flows with the weather: storms charge the aether, fog dulls it.
export function manaMod(game) {
  game.weather = roll(game.weather);
  return { clear: 0.06, fair: 0, rain: 0.04, fog: -0.1, storm: 0.15, snow: -0.04 }[game.weather.kind] || 0;
}

export function label(game) {
  game.weather = roll(game.weather);
  const desc = {
    clear: 'the sky is clear and the air bright',
    fair: 'the weather is fair',
    rain: 'a steady rain is falling',
    fog: 'a thick fog has rolled in',
    storm: 'a thunderstorm rages overhead',
    snow: 'snow is falling softly',
  };
  const season = game.weather.season || seasonFor(new Date());
  const name = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' }[season];
  return `${desc[game.weather.kind]}. ${name}.`;
}
