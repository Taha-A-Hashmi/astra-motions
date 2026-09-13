/* ═══════════════════════════════════════════════════════════════════════
   server/db.js — inquiry storage on Node's built-in SQLite (node:sqlite,
   Node ≥ 22.13). No native build step, one file on disk, and every
   submission is kept even before the studio inbox is wired up.
   ═══════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

let db;

export function openDb() {
  if (db) return db;
  fs.mkdirSync(config.dataDir, { recursive: true });
  db = new DatabaseSync(path.join(config.dataDir, 'inquiries.sqlite'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS inquiries (
      id          TEXT PRIMARY KEY,
      created_at  TEXT NOT NULL,
      name        TEXT NOT NULL,
      email       TEXT NOT NULL,
      message     TEXT NOT NULL,
      budget      TEXT NOT NULL,
      ip          TEXT,
      user_agent  TEXT,
      referrer    TEXT,
      status      TEXT NOT NULL DEFAULT 'new',   -- new | read | replied | archived
      emailed     INTEGER NOT NULL DEFAULT 0,    -- 1 once the notification went out
      email_error TEXT
    );
    CREATE INDEX IF NOT EXISTS inquiries_created ON inquiries (created_at DESC);
  `);
  return db;
}

export function insertInquiry({ name, email, message, budget, ip, userAgent, referrer }) {
  const d = openDb();
  const row = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    name,
    email,
    message,
    budget,
    ip: ip || null,
    user_agent: userAgent || null,
    referrer: referrer || null,
  };
  d.prepare(
    `INSERT INTO inquiries (id, created_at, name, email, message, budget, ip, user_agent, referrer)
     VALUES (@id, @created_at, @name, @email, @message, @budget, @ip, @user_agent, @referrer)`
  ).run(row);
  return row;
}

export function markEmailed(id, error = null) {
  openDb()
    .prepare(`UPDATE inquiries SET emailed = ?, email_error = ? WHERE id = ?`)
    .run(error ? 0 : 1, error, id);
}

export function listInquiries({ limit = 50, offset = 0, status } = {}) {
  const d = openDb();
  const where = status ? `WHERE status = ?` : '';
  const params = status ? [status, limit, offset] : [limit, offset];
  return d
    .prepare(`SELECT * FROM inquiries ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params);
}

export function getInquiry(id) {
  return openDb().prepare(`SELECT * FROM inquiries WHERE id = ?`).get(id) || null;
}

export function setStatus(id, status) {
  const res = openDb().prepare(`UPDATE inquiries SET status = ? WHERE id = ?`).run(status, id);
  return res.changes > 0;
}

export function countInquiries() {
  const rows = openDb().prepare(`SELECT status, COUNT(*) AS n FROM inquiries GROUP BY status`).all();
  const out = { total: 0 };
  for (const r of rows) {
    out[r.status] = r.n;
    out.total += r.n;
  }
  return out;
}
