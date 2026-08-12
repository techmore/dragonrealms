// Secure account management: registration, login, sessions.
// Passwords are hashed with scrypt (salt + per-user params). Login is
// rate-limited with lockout after repeated failures.
import {
  randomBytes, scryptSync, timingSafeEqual, createHash,
} from 'node:crypto';
import { db } from './db.js';

const SCRYPT_KEYLEN = 64;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 10 * 60 * 1000; // 10 minute lockout
const SESSION_MS = 12 * 60 * 60 * 1000; // 12 hour session

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hashPassword(password, salt) {
  return scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
}

function verifyPassword(password, salt, expectedHex) {
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sessionToken() {
  return createHash('sha256').update(randomBytes(32)).digest('hex');
}

export function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

export async function registerAccount(username, password) {
  const name = normalizeName(username);
  if (name.length < 3 || name.length > 24) {
    return { ok: false, error: 'Username must be 3-24 characters (letters, numbers, _ or -).' };
  }
  if (!password || password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  if (password.length > 128) {
    return { ok: false, error: 'Password is too long.' };
  }

  const salt = randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);

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
  if (!row) {
    await sleep(300); // constant-time-ish response for unknown accounts
    return { ok: false, error: 'Incorrect username or password.' };
  }

  const now = Date.now();
  if (row.locked_until > now) {
    const mins = Math.ceil((row.locked_until - now) / 60000);
    return { ok: false, error: `Account locked. Try again in ${mins} minute(s).` };
  }

  if (!verifyPassword(password, row.salt, row.pass_hash)) {
    const attempts = row.failed_attempts + 1;
    let lockedUntil = 0;
    let error = `Incorrect username or password. (${MAX_ATTEMPTS - attempts} attempts left)`;
    if (attempts >= MAX_ATTEMPTS) {
      lockedUntil = now + LOCK_MS;
      error = 'Too many failed attempts. Account locked for 10 minutes.';
    }
    db.prepare('UPDATE accounts SET failed_attempts = ?, locked_until = ? WHERE id = ?')
      .run(attempts, lockedUntil, row.id);
    return { ok: false, error };
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
