// Secure account management: registration, login, sessions.
// Passwords are hashed with scrypt and a per-user salt. Expensive password
// work runs off the event loop behind a small queue, while repeated failures
// retain the account lockout policy.
import {
  randomBytes, scrypt, timingSafeEqual, createHash,
} from 'node:crypto';
import { db } from './db.js';

const SCRYPT_KEYLEN = 64;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 10 * 60 * 1000; // 10 minute lockout
const SESSION_MS = 12 * 60 * 60 * 1000; // 12 hour session
const INVALID_LOGIN = 'Incorrect username or password.';
const BUSY_LOGIN = 'Authentication service is busy. Try again shortly.';

// scrypt is intentionally more expensive than ordinary request work. Bound
// both active libuv jobs and retained waiters so a burst cannot consume an
// unbounded amount of native-worker or application memory.
export const AUTH_WORK_LIMIT = 2;
export const AUTH_QUEUE_LIMIT = 32;
let activeAuthWork = 0;
const authWorkQueue = [];

class AuthWorkBusyError extends Error {
  constructor() {
    super(BUSY_LOGIN);
    this.code = 'AUTH_WORK_BUSY';
  }
}

function drainAuthWork() {
  while (activeAuthWork < AUTH_WORK_LIMIT && authWorkQueue.length) {
    const job = authWorkQueue.shift();
    activeAuthWork++;
    Promise.resolve()
      .then(job.work)
      .then(job.resolve, job.reject)
      .finally(() => {
        activeAuthWork--;
        drainAuthWork();
      });
  }
}

function scheduleAuthWork(work) {
  if (activeAuthWork >= AUTH_WORK_LIMIT && authWorkQueue.length >= AUTH_QUEUE_LIMIT) {
    return Promise.reject(new AuthWorkBusyError());
  }
  return new Promise((resolve, reject) => {
    authWorkQueue.push({ work, resolve, reject });
    drainAuthWork();
  });
}

// This is useful operational telemetry as well as a deterministic way to
// assert the resource bound without exposing passwords, salts, or hashes.
export function authWorkStats() {
  return {
    active: activeAuthWork,
    queued: authWorkQueue.length,
    activeLimit: AUTH_WORK_LIMIT,
    queueLimit: AUTH_QUEUE_LIMIT,
  };
}

function derivePassword(password, salt) {
  return scheduleAuthWork(() => new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEYLEN, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  }));
}

async function hashPassword(password, salt) {
  return (await derivePassword(password, salt)).toString('hex');
}

async function verifyPassword(password, salt, expectedHex) {
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = await derivePassword(password, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Unknown users do the same scrypt work as real users, avoiding the former
// fast-path timing signal. The value is a precomputed scrypt result for the
// fixed dummy salt; it is never used to authenticate an account.
const DUMMY_SALT = 'dragon-realms-auth-dummy-v1';
const DUMMY_HASH = 'e49c72118266e4c63ba65f54af600aeb4c179d04ebca9c9f7ded712c87db09b82d3bb86a0dd4cb7b5c7e2788fa6de8ed1829c70d5cd79e2bfc0f52b104ba8ecc';

function boundedPassword(password) {
  // Registered passwords are capped at 128 characters, so a 129-character
  // prefix can never authenticate and prevents giant login payloads from
  // becoming giant native-worker inputs.
  return String(password ?? '').slice(0, 129);
}

function busyResult(error) {
  if (error?.code === 'AUTH_WORK_BUSY') return { ok: false, error: BUSY_LOGIN };
  throw error;
}

function sessionToken() {
  return createHash('sha256').update(randomBytes(32)).digest('hex');
}

export function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

export async function registerAccount(username, password) {
  const name = normalizeName(username);
  const suppliedPassword = String(password ?? '');
  if (name.length < 3 || name.length > 24) {
    return { ok: false, error: 'Username must be 3-24 characters (letters, numbers, _ or -).' };
  }
  if (typeof password !== 'string' || suppliedPassword.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  if (suppliedPassword.length > 128) {
    return { ok: false, error: 'Password is too long.' };
  }

  const salt = randomBytes(16).toString('hex');
  let hash;
  try {
    hash = await hashPassword(suppliedPassword, salt);
  } catch (error) {
    return busyResult(error);
  }

  try {
    const info = db.prepare(
      'INSERT INTO accounts (username, pass_hash, salt, created_at) VALUES (?, ?, ?, ?)'
    ).run(name, hash, salt, Date.now());
    return { ok: true, accountId: Number(info.lastInsertRowid) };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return { ok: false, error: 'That username is already taken.' };
    throw e;
  }
}

export async function loginAccount(username, password) {
  const name = normalizeName(username);
  const row = db.prepare('SELECT * FROM accounts WHERE username = ?').get(name);
  const suppliedPassword = boundedPassword(password);
  if (!row) {
    try {
      await verifyPassword(suppliedPassword, DUMMY_SALT, DUMMY_HASH);
    } catch (error) {
      return busyResult(error);
    }
    return { ok: false, error: INVALID_LOGIN };
  }

  const now = Date.now();
  if (row.locked_until > now) {
    const mins = Math.ceil((row.locked_until - now) / 60000);
    return { ok: false, error: `Account locked. Try again in ${mins} minute(s).` };
  }

  let passwordMatches;
  try {
    passwordMatches = await verifyPassword(suppliedPassword, row.salt, row.pass_hash);
  } catch (error) {
    return busyResult(error);
  }

  if (!passwordMatches) {
    // The read occurs before asynchronous scrypt work, so increment in SQL to
    // prevent concurrent failures from losing updates and bypassing lockout.
    const updated = db.prepare(`
      UPDATE accounts
      SET failed_attempts = MIN(failed_attempts + 1, ?),
          locked_until = CASE
            WHEN failed_attempts + 1 >= ? THEN MAX(locked_until, ?)
            ELSE 0
          END
      WHERE id = ?
      RETURNING failed_attempts, locked_until
    `).get(MAX_ATTEMPTS, MAX_ATTEMPTS, now + LOCK_MS, row.id);
    const attempts = updated?.failed_attempts ?? row.failed_attempts + 1;
    let error = INVALID_LOGIN;
    if (attempts >= MAX_ATTEMPTS) {
      error = 'Too many failed attempts. Account locked for 10 minutes.';
    }
    return { ok: false, error };
  }

  // A concurrent failure may have locked the account while this password was
  // being derived. Observe that lock before resetting counters or issuing a
  // session, matching the sequential behavior of the old synchronous path.
  const current = db.prepare('SELECT locked_until FROM accounts WHERE id = ?').get(row.id);
  if (current?.locked_until > Date.now()) {
    const mins = Math.ceil((current.locked_until - Date.now()) / 60000);
    return { ok: false, error: `Account locked. Try again in ${mins} minute(s).` };
  }

  db.prepare('UPDATE accounts SET failed_attempts = 0, locked_until = 0 WHERE id = ?').run(row.id);

  const token = sessionToken();
  const expiresAt = now + SESSION_MS;
  db.prepare('INSERT INTO sessions (token, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, row.id, now, expiresAt);

  return { ok: true, token, accountId: row.id, username: row.username, expiresAt };
}

export function validateSession(token) {
  if (!token) return null;
  const row = db.prepare(
    'SELECT s.*, a.username FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token = ?'
  ).get(token);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return { token: row.token, accountId: row.account_id, username: row.username };
}

export function logoutSession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function pruneExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}
