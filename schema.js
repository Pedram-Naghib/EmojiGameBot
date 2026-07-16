import { table, integer, text, index, sql } from 'sdk/db';

// One row per game round. Only one row can be `active` at a time for a given
// (chatId, game) pair — enforced in code, not by a DB constraint, because we
// need "insert a new one only if none is active" logic that a UNIQUE index
// on (chatId, game) alone can't express (finished rounds must remain).
export const rounds = table('rounds', {
  id:                integer('id').primaryKey({ autoIncrement: true }),
  chatId:            integer('chat_id').notNull(),
  game:              text('game').notNull(),            // 'dice' | 'dart' | 'basketball' | 'football' | 'slot'
  status:            text('status').notNull().default('active'), // 'active' | 'finished' | 'cancelled'
  conditionType:     text('condition_type').notNull(),  // 'exact' | 'bullseye' | 'goal' | 'slot_combo'
  conditionValue:    text('condition_value'),           // e.g. '3', 'lemon', 'any' (null for dart/goal games)
  createdBy:         integer('created_by'),
  createdByName:     text('created_by_name'),
  createdAt:         integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  announceMessageId: integer('announce_message_id'),
  winnerUserId:      integer('winner_user_id'),
  winnerName:        text('winner_name'),
  winnerValue:       integer('winner_value'),
  finishedAt:        integer('finished_at', { mode: 'timestamp' }),
}, (t) => ({
  activeIdx: index('idx_rounds_chat_game_status').on(t.chatId, t.game, t.status),
}));
