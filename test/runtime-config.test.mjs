import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { runtimeConfig } from '../server/runtime-config.js';

test('desktop defaults stay on loopback with the local API and no debug API', () => {
  assert.deepEqual(runtimeConfig({}), {
    profile: 'local', host: '127.0.0.1', port: 3000, apiEnabled: true, debugApiEnabled: false, agentBoostEnabled: false,
    maxWsClients: 1000, wsAuthTimeoutMs: 30000, maxHttpConcurrent: 256, httpRequestTimeoutMs: 30000,
    requireWsOrigin: false, allowedOrigins: [], gmOperatorToken: undefined, gmAdminToken: undefined, gmPlayToken: undefined,
  });
  assert.equal(runtimeConfig({ DR_ENABLE_API: '0' }).apiEnabled, false);
  assert.throws(() => runtimeConfig({ DR_HOST: '0.0.0.0' }), /DR_PROFILE=public/);
});

test('public hosting requires configured credentials and opts out of test APIs by default', () => {
  assert.throws(() => runtimeConfig({ DR_PROFILE: 'public' }), /DR_GM_TOKEN/);
  const config = { DR_PROFILE: 'public', DR_GM_TOKEN: 'x'.repeat(32), DR_GM_OPERATOR_TOKEN: 'o'.repeat(32), DR_GM_ADMIN_TOKEN: 'a'.repeat(32), DR_GM_PLAY_TOKEN: 'p'.repeat(32), DR_ALLOWED_ORIGINS: 'https://play.example' };
  assert.deepEqual(runtimeConfig(config), {
    profile: 'public', host: '0.0.0.0', port: 3000, apiEnabled: false, debugApiEnabled: false, agentBoostEnabled: false,
    maxWsClients: 250, wsAuthTimeoutMs: 30000, maxHttpConcurrent: 256, httpRequestTimeoutMs: 30000,
    requireWsOrigin: true, allowedOrigins: ['https://play.example'],
    gmOperatorToken: 'o'.repeat(32), gmAdminToken: 'a'.repeat(32), gmPlayToken: 'p'.repeat(32),
  });
  assert.throws(() => runtimeConfig({ DR_PROFILE: 'public', DR_GM_TOKEN: 'x'.repeat(32) }), /DR_ALLOWED_ORIGINS/);
  assert.throws(() => runtimeConfig({ DR_PROFILE: 'public', DR_GM_TOKEN: 'x'.repeat(32), DR_ALLOWED_ORIGINS: 'https://play.example' }), /DR_GM_OPERATOR_TOKEN/);
  assert.equal(runtimeConfig({ ...config, DR_ENABLE_API: '1' }).apiEnabled, true);
  assert.throws(() => runtimeConfig({ ...config, DR_ENABLE_AGENT_BOOST: '1' }), /Agent boost cannot be enabled/);
  assert.throws(() => runtimeConfig({ ...config, DR_ENABLE_DEBUG_API: '1' }), /DR_DEBUG_TOKEN/);
  assert.equal(runtimeConfig({ ...config, DR_ENABLE_DEBUG_API: '1', DR_DEBUG_TOKEN: 'y'.repeat(32) }).debugApiEnabled, true);
});

test('invalid profile and port configuration fail explicitly', () => {
  assert.throws(() => runtimeConfig({ DR_PROFILE: 'publci' }), /DR_PROFILE/);
  for (const port of ['0', '-1', '65536', '3000oops', '3.5']) {
    assert.throws(() => runtimeConfig({ PORT: port }), /PORT/);
  }
  assert.equal(runtimeConfig({ PORT: '3137', DR_HOST: '::1' }).port, 3137);
});


test('invalid launch settings fail before creating a world database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dr-invalid-launch-'));
  const path = join(directory, 'must-not-open.db');
  try {
    const result = spawnSync(process.execPath, ['server/index.js'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 5000,
      env: { ...process.env, DR_PROFILE: 'invalid', DR_DB_PATH: path },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /DR_PROFILE must be local or public/);
    assert.equal(existsSync(path), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
