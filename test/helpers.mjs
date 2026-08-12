// Shared test scaffolding for the domain test files.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'dr-test-'));
process.env.DR_DB_PATH = join(tmp, 'test.db');

export const { migrate, db, closeDb } = await import('../server/db.js');
export const auth = await import('../server/auth.js');
export const { createCharacter, loadPlayer } = await import('../server/player.js');
export const { Game } = await import('../server/game.js');
export const { handleCommand } = await import('../server/commands/index.js');

export function fakeWs() {
  const msgs = [];
  return {
    msgs,
    send(o) { msgs.push(typeof o === 'string' ? JSON.parse(o) : o); },
    readyState: 1,
    close() {},
  };
}

export let game;

export function setupGame() {
  migrate();
  game = new Game();
  game.init();
  game.combat.stopTicker();
  clearInterval(game.respawnTicker);
  return game;
}

export function teardownGame() {
  clearInterval(game.respawnTicker);
  game.combat.stopTicker();
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
}
