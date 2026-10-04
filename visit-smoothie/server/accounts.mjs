import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError, username, password } from './validation.mjs';

const derive = promisify(scrypt);
const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
const digest = value => createHash('sha256').update(value).digest('hex');

export class Accounts {
  constructor(file, { now = () => Date.now() } = {}) {
    this.now = now;
    this.hashing = 0;
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, profile TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL) STRICT;
      CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions(user_id);
      CREATE TABLE IF NOT EXISTS auth_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL) STRICT;`);
    if (file !== ':memory:') chmodSync(file, 0o600);
  }
  async hash(secret, salt = randomBytes(16).toString('hex')) {
    if (this.hashing >= 4) throw new HttpError(429, '请求较多，请稍后重试。', 'RATE_LIMITED');
    this.hashing++;
    try { return `scrypt$${salt}$${(await derive(secret, salt, 64, SCRYPT)).toString('hex')}`; }
    finally { this.hashing--; }
  }
  throttle(nameKey, ip) {
    const now = this.now();
    this.db.prepare('DELETE FROM auth_limits WHERE expires_at <= ?').run(now);
    for (const [key, limit] of [[`ip:${digest(ip)}`, 30], [`name:${digest(nameKey)}`, 5]]) {
      const row = this.db.prepare('SELECT count FROM auth_limits WHERE key=?').get(key);
      if (row?.count >= limit) throw new HttpError(429, '尝试次数过多，请在 15 分钟后重试。', 'RATE_LIMITED');
    }
    for (const key of [`ip:${digest(ip)}`, `name:${digest(nameKey)}`]) this.db.prepare('INSERT INTO auth_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key, now + 15 * 60_000);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  createSession(userId) {
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(this.now());
    this.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token), userId, this.now() + SESSION_SECONDS * 1000);
    // Keep a bounded number of independently revocable sessions per account.
    this.db.prepare('DELETE FROM sessions WHERE user_id=? AND rowid NOT IN (SELECT rowid FROM sessions WHERE user_id=? ORDER BY rowid DESC LIMIT 10)').run(userId, userId);
    return token;
  }
  session(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(token)) return null;
    const user = this.db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?').get(digest(token), this.now());
    return user || null;
  }
  payload(user) { return { account: { id: user.id, name: user.name }, profile: JSON.parse(user.profile), revision: user.revision }; }
  logout(token) { if (typeof token === 'string') this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token)); }
  async register(profile, secret, ip) {
    const identity = username(profile.name);
    password(secret);
    this.throttle(identity.key, ip);
    const passwordHash = await this.hash(secret);
    return this.transaction(() => {
        if (this.db.prepare('SELECT id FROM users WHERE name_key=?').get(identity.key)) throw new HttpError(409, '该姓名已注册，请登录或使用可区分的姓名。', 'NAME_TAKEN');
        const userId = randomUUID();
        this.db.prepare('INSERT INTO users VALUES (?,?,?,?,?,0,?)').run(userId, identity.name, identity.key, passwordHash, JSON.stringify(profile), this.now());
        const token = this.createSession(userId);
        return { token, ...this.payload(this.db.prepare('SELECT * FROM users WHERE id=?').get(userId)) };
    });
  }
  async login(name, secret, ip) {
    const identity = username(name);
    if (typeof secret !== 'string' || secret.length > 128) throw new HttpError(401, '姓名或密码不正确。', 'INVALID_CREDENTIALS');
    this.throttle(identity.key, ip);
    const user = this.db.prepare('SELECT * FROM users WHERE name_key=?').get(identity.key);
    const stored = user?.password_hash || `scrypt$00000000000000000000000000000000$${'0'.repeat(128)}`;
    const [, salt, expected] = stored.split('$');
    const actual = (await this.hash(secret, salt)).split('$')[2];
    if (!timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex')) || !user) throw new HttpError(401, '姓名或密码不正确。', 'INVALID_CREDENTIALS');
    this.db.prepare('DELETE FROM auth_limits WHERE key=?').run(`name:${digest(identity.key)}`);
    return { token: this.createSession(user.id), ...this.payload(user) };
  }
  update(user, profile, revision) {
    if (!Number.isSafeInteger(revision) || revision < 0) throw new HttpError(400, '资料版本不正确。');
    if (profile.name !== user.name) throw new HttpError(400, '姓名是登录用户名，暂不支持修改。', 'NAME_IMMUTABLE');
    const result = this.db.prepare('UPDATE users SET profile=?,revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(profile), user.id, revision);
    if (!result.changes) throw new HttpError(409, '资料已在其他页面更新，请刷新后再保存。', 'STALE_PROFILE');
    return this.payload(this.db.prepare('SELECT * FROM users WHERE id=?').get(user.id));
  }
  close() { this.db.close(); }
}
