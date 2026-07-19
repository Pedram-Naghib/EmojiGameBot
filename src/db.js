import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

const DB_PATH = process.env.DB_PATH || './data/bot.db';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Idempotent bootstrap — safe to run on every startup. For anything beyond
// this simple two-table schema, switch to proper drizzle-kit migrations.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS rounds (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id              INTEGER NOT NULL,
    game                 TEXT NOT NULL,
    status               TEXT NOT NULL DEFAULT 'active',
    condition_type       TEXT NOT NULL,
    condition_value      TEXT,
    target_count         INTEGER NOT NULL DEFAULT 1,
    created_by           INTEGER,
    created_by_name      TEXT,
    created_at           INTEGER DEFAULT (unixepoch()),
    announce_message_id  INTEGER,
    winner_user_id       INTEGER,
    winner_name          TEXT,
    winner_value         INTEGER,
    winner_count         INTEGER,
    finished_at          INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_rounds_chat_game_status ON rounds (chat_id, game, status);

  CREATE TABLE IF NOT EXISTS progress (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id  INTEGER NOT NULL,
    user_id   INTEGER NOT NULL,
    user_name TEXT,
    count     INTEGER NOT NULL DEFAULT 0,
    key       TEXT UNIQUE
  );
  CREATE INDEX IF NOT EXISTS idx_progress_round ON progress (round_id);

  CREATE TABLE IF NOT EXISTS bot_admins (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id    INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    user_name  TEXT,
    added_by   INTEGER,
    added_at   INTEGER DEFAULT (unixepoch()),
    key        TEXT UNIQUE
  );
  CREATE INDEX IF NOT EXISTS idx_bot_admins_chat ON bot_admins (chat_id);
`);

export const db = drizzle(sqlite, { schema });