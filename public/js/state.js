// Client connection lifecycle: login | charselect | charcreate | playing.
export const gameState = {
  value: 'login',
  inChargen: false,
  spectating: false, // watching another player's stream via the relay
  gmPlay: null,      // {guild, race, name?, boost} — ?play= quick-launch pending
};
