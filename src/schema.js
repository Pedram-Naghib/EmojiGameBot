import { sqliteTable as table, integer, text, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Unchanged from the original schema.js — only the import source changed
// (drizzle-orm/sqlite-core instead of the platform's sdk/db, which was
// modeled directly on drizzle's SQLite API).

// One row per game round. Only one row can be `active` at a time for a given
// (chatId, game) pair — enforced in code, not by a DB constraint, because we
// need "insert a new one only if none is active" logic that a UNIQUE index
// on (chatId, game) alone can't express (finished rounds must remain).
export const rounds = table('rounds', {
  id:                integer('id').primaryKey({ autoIncrement: true }),
  chatId:            integer('chat_id').notNull(),
  game:              text('game').notNull(),            // 'dice' | 'dart' | 'basketball' | 'football' | 'slot' | 'bowling'
  status:            text('status').notNull().default('active'), // 'active' | 'finished' | 'cancelled'
  conditionType:     text('condition_type').notNull(),  // 'exact' | 'bullseye' | 'goal' | 'slot_combo' | 'strike'
  conditionValue:    text('condition_value'),           // e.g. '3', 'lemon', 'any' (null for dart/goal/strike games)
  targetCount:       integer('target_count').notNull().default(1), // how many times a user must hit the condition to win
  createdBy:         integer('created_by'),
  createdByName:     text('created_by_name'),
  createdAt:         integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  announceMessageId: integer('announce_message_id'),
  winnerUserId:      integer('winner_user_id'),
  winnerName:        text('winner_name'),
  winnerValue:       integer('winner_value'),
  winnerCount:       integer('winner_count'),
  finishedAt:        integer('finished_at', { mode: 'timestamp' }),
}, (t) => ({
  activeIdx: index('idx_rounds_chat_game_status').on(t.chatId, t.game, t.status),
}));

// Per-user progress within a round — how many qualifying throws they've
// landed so far. Only meaningful when rounds.targetCount > 1, but tracked
// unconditionally since it's cheap and lets /status show a live leaderboard.
export const progress = table('progress', {
  id:       integer('id').primaryKey({ autoIncrement: true }),
  roundId:  integer('round_id').notNull(),
  userId:   integer('user_id').notNull(),
  userName: text('user_name'),
  count:    integer('count').notNull().default(0),
  // `${roundId}:${userId}` — single-column conflict target for upserts,
  // since drizzle's onConflictDoUpdate is documented against one column.
  key:      text('key').unique(),
}, (t) => ({
  roundIdx: index('idx_progress_round').on(t.roundId),
}));
