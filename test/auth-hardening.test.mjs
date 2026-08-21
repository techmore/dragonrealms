import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'dr-auth-test-'));
process.env.DR_DB_PATH = join(tmp, 'auth.db');

const { db, migrate, closeDb } = await import('../server/db.js');
const {
  AUTH_QUEUE_LIMIT,
  AUTH_WORK_LIMIT,
  authWorkStats,
  loginAccount,
  registerAccount,
} = await import('../server/auth.js');

before(() => migrate());
after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

test('scrypt password work yields to the event loop', async () => {
  let settled = false;
  const registration = registerAccount('async-hash', 'responsive-password')
    .then((result) => {
      settled = true;
      return result;
    });

  // A synchronous hash resolves the async function before its caller can run
  // another microtask. Native async scrypt remains pending here.
  await Promise.resolve();
  assert.equal(settled, false, 'password work must not block and settle inline');

  const result = await registration;
  assert.equal(result.ok, true);
});

test('registration rejects malformed non-string passwords without hashing', async () => {
  const before = authWorkStats();
  const result = await registerAccount('bad-json-password', { value: 'not-a-password' });
  assert.deepEqual(result, { ok: false, error: 'Password must be at least 8 characters.' });
  assert.deepEqual(authWorkStats(), before);
});

test('unknown and known account failures use the same public error', async () => {
  const registered = await registerAccount('timing-user', 'correct-password');
  assert.equal(registered.ok, true);

  const unknown = await loginAccount('not-a-user', 'wrong-password');
  const known = await loginAccount('timing-user', 'wrong-password');
  assert.deepEqual(known, unknown);
  assert.deepEqual(known, { ok: false, error: 'Incorrect username or password.' });

  const row = db.prepare('SELECT failed_attempts FROM accounts WHERE username = ?')
    .get('timing-user');
  assert.equal(row.failed_attempts, 1, 'known-account failures still count toward lockout');
});

test('scrypt scheduler bounds active work and queued waiters', async () => {
  const overflow = 3;
  const total = AUTH_WORK_LIMIT + AUTH_QUEUE_LIMIT + overflow;
  const registrations = Array.from({ length: total }, (_, index) =>
    registerAccount(`burst-user-${index}`, 'bounded-password'));

  assert.deepEqual(authWorkStats(), {
    active: AUTH_WORK_LIMIT,
    queued: AUTH_QUEUE_LIMIT,
    activeLimit: AUTH_WORK_LIMIT,
    queueLimit: AUTH_QUEUE_LIMIT,
  });

  const results = await Promise.all(registrations);
  assert.equal(results.filter((result) => result.ok).length, total - overflow);
  assert.equal(
    results.filter((result) => result.error === 'Authentication service is busy. Try again shortly.').length,
    overflow,
  );
  assert.deepEqual(authWorkStats(), {
    active: 0,
    queued: 0,
    activeLimit: AUTH_WORK_LIMIT,
    queueLimit: AUTH_QUEUE_LIMIT,
  });
});

test('concurrent failures cannot bypass the five-attempt lockout', async () => {
  const registered = await registerAccount('lockout-user', 'correct-password');
  assert.equal(registered.ok, true);

  const failures = await Promise.all(Array.from({ length: 5 }, () =>
    loginAccount('lockout-user', 'wrong-password')));
  assert.ok(failures.some((result) => /locked for 10 minutes/.test(result.error)));

  const row = db.prepare(
    'SELECT failed_attempts, locked_until FROM accounts WHERE username = ?',
  ).get('lockout-user');
  assert.equal(row.failed_attempts, 5);
  assert.ok(row.locked_until > Date.now());

  const correct = await loginAccount('lockout-user', 'correct-password');
  assert.equal(correct.ok, false);
  assert.match(correct.error, /^Account locked\./);
});
