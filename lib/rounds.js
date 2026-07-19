import { db } from '../src/db.js';
import { rounds, progress } from '../src/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';

export async function getActiveRound(chatId, game) {
  return db.select().from(rounds)
    .where(and(eq(rounds.chatId, chatId), eq(rounds.game, game), eq(rounds.status, 'active')))
    .get();
}

export async function listActiveRounds(chatId) {
  return db.select().from(rounds)
    .where(and(eq(rounds.chatId, chatId), eq(rounds.status, 'active')))
    .all();
}

/** Cheap existence check used for the early UX message before the multi-step wizard even starts. */
export async function hasActiveRound(chatId) {
  const row = db.select().from(rounds)
    .where(and(eq(rounds.chatId, chatId), eq(rounds.status, 'active')))
    .get();
  return Boolean(row);
}

/**
 * Only one round may be active per chat at a time (across all game types),
 * so members aren't spamming multiple different emojis simultaneously.
 * The pick → condition → count wizard spans several button presses, so two
 * admins could both pass the early hasActiveRound() check before either one
 * finishes — this runs the "is one already active?" check and the insert in
 * a single transaction so exactly one of them actually starts a round.
 * Returns the new round, or null if another game snuck in first.
 */
export async function startRound({ chatId, game, conditionType, conditionValue, targetCount, createdBy, createdByName }) {
  return db.transaction((tx) => {
    const existing = tx.select().from(rounds)
      .where(and(eq(rounds.chatId, chatId), eq(rounds.status, 'active')))
      .get();
    if (existing) return null;

    const [row] = tx.insert(rounds).values({
      chatId,
      game,
      status: 'active',
      conditionType,
      conditionValue: conditionValue === null || conditionValue === undefined ? null : String(conditionValue),
      targetCount: targetCount ?? 1,
      createdBy,
      createdByName,
    }).returning().all();
    return row;
  });
}

export async function setAnnounceMessage(roundId, messageId) {
  await db.update(rounds).set({ announceMessageId: messageId }).where(eq(rounds.id, roundId)).run();
}

/**
 * Atomically bumps a user's progress counter for this round and returns the
 * new total. Only called for throws that already satisfy the round's
 * per-throw condition (checkWin) — this is purely the "how many times" tally.
 */
export async function incrementProgress(roundId, userId, userName) {
  const key = `${roundId}:${userId}`;
  const [row] = await db.insert(progress)
    .values({ roundId, userId, userName, count: 1, key })
    .onConflictDoUpdate({
      target: progress.key,
      set: { count: sql`${progress.count} + 1`, userName },
    })
    .returning()
    .all();
  return row.count;
}

export async function getTopProgress(roundId, limit = 5) {
  return db.select().from(progress)
    .where(eq(progress.roundId, roundId))
    .orderBy(desc(progress.count))
    .limit(limit)
    .all();
}

/**
 * Atomically tries to mark a round as finished. Because every dice throw is
 * handled by a separate invocation, two users can reach the target count at
 * nearly the same time; this UPDATE only succeeds if the round was still
 * 'active' at the moment it ran, so exactly one throw ever wins even under
 * concurrency. Returns the updated row, or null if someone else already
 * claimed it first.
 */
export async function claimWin(roundId, { winnerUserId, winnerName, winnerValue, winnerCount }) {
  const result = await db.update(rounds)
    .set({
      status: 'finished',
      winnerUserId,
      winnerName,
      winnerValue,
      winnerCount,
      finishedAt: sql`(unixepoch())`,
    })
    .where(and(eq(rounds.id, roundId), eq(rounds.status, 'active')))
    .returning()
    .all();
  return result[0] ?? null;
}

export async function cancelRound(roundId) {
  const result = await db.update(rounds)
    .set({ status: 'cancelled' })
    .where(and(eq(rounds.id, roundId), eq(rounds.status, 'active')))
    .returning()
    .all();
  return result[0] ?? null;
}