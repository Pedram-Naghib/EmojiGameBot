import { db } from '../src/db.js';
import { botAdmins } from '../src/schema.js';
import { eq, and } from 'drizzle-orm';

/** True if this user is on the bot's own admin list for this chat (separate from Telegram admin status). */
export async function isBotAdmin(chatId, userId) {
  const row = db.select().from(botAdmins)
    .where(and(eq(botAdmins.chatId, chatId), eq(botAdmins.userId, userId)))
    .get();
  return Boolean(row);
}

export async function listBotAdmins(chatId) {
  return db.select().from(botAdmins)
    .where(eq(botAdmins.chatId, chatId))
    .all();
}

/** Adds (or refreshes the stored name of) a bot admin. Idempotent. */
export async function addBotAdmin(chatId, userId, userName, addedBy) {
  const key = `${chatId}:${userId}`;
  const [row] = await db.insert(botAdmins)
    .values({ chatId, userId, userName, addedBy, key })
    .onConflictDoUpdate({
      target: botAdmins.key,
      set: { userName, addedBy },
    })
    .returning()
    .all();
  return row;
}

/** Returns true if an admin entry was actually removed. */
export async function removeBotAdmin(chatId, userId) {
  const result = await db.delete(botAdmins)
    .where(and(eq(botAdmins.chatId, chatId), eq(botAdmins.userId, userId)))
    .returning()
    .all();
  return result.length > 0;
}