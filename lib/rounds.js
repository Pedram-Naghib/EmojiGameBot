import { db } from 'sdk';
import { rounds } from 'schema';
import { eq, and, sql } from 'sdk/db';

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

export async function startRound({ chatId, game, conditionType, conditionValue, createdBy, createdByName }) {
  const [row] = await db.insert(rounds).values({
    chatId,
    game,
    status: 'active',
    conditionType,
    conditionValue: conditionValue === null || conditionValue === undefined ? null : String(conditionValue),
    createdBy,
    createdByName,
  }).returning().run();
  return row;
}

export async function setAnnounceMessage(roundId, messageId) {
  await db.update(rounds).set({ announceMessageId: messageId }).where(eq(rounds.id, roundId)).run();
}

/**
 * Atomically tries to mark a round as finished. Because every dice throw is
 * handled by a separate invocation, two "winning" throws can race each other;
 * this UPDATE only succeeds if the round was still 'active' at the moment it
 * ran, so exactly one throw ever wins even under concurrency.
 * Returns the updated row, or null if someone else already claimed it.
 */
export async function claimWin(roundId, { winnerUserId, winnerName, winnerValue }) {
  const result = await db.update(rounds)
    .set({
      status: 'finished',
      winnerUserId,
      winnerName,
      winnerValue,
      finishedAt: sql`(unixepoch())`,
    })
    .where(and(eq(rounds.id, roundId), eq(rounds.status, 'active')))
    .returning()
    .run();
  return result[0] ?? null;
}

export async function cancelRound(roundId) {
  const result = await db.update(rounds)
    .set({ status: 'cancelled' })
    .where(and(eq(rounds.id, roundId), eq(rounds.status, 'active')))
    .returning()
    .run();
  return result[0] ?? null;
}
