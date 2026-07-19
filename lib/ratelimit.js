// In-memory rate limiter for qualifying game throws (dice/dart/etc.).
// Scoped per (chatId, userId) so each user in each group has their own cooldown.
//
// NOTE: this resets if the process restarts, since it's a plain in-memory Map
// (same tradeoff as the rest of this file's neighbors — rounds/progress live in
// SQLite, but this is cheap, high-frequency, and fine to lose on redeploy). If
// you want the configured limit-per-chat to survive restarts, say the word and
// I'll add a `chat_settings` table instead of the Map below.

const DEFAULT_LIMIT_SECONDS = 5;

/** @type {Map<number, number>} chatId -> configured cooldown in seconds */
const chatLimits = new Map();

/** @type {Map<number, Map<number, number>>} chatId -> (userId -> last qualifying throw, ms) */
const lastThrowAt = new Map();

export function getLimitSeconds(chatId) {
  return chatLimits.get(chatId) ?? DEFAULT_LIMIT_SECONDS;
}

export function setLimitSeconds(chatId, seconds) {
  chatLimits.set(chatId, seconds);
}

/**
 * Call this once per qualifying throw (i.e. only for throws you were already
 * going to process — for this project, that's throws matching an active
 * round's game). Returns:
 *   - true  -> allowed; the throw's timestamp is now recorded, proceed normally
 *   - false -> too soon after this user's last qualifying throw in this chat;
 *              caller should delete the message and stop processing it
 */
export function checkAndRecordThrow(chatId, userId) {
  const now = Date.now();
  const limitMs = getLimitSeconds(chatId) * 1000;

  let chatMap = lastThrowAt.get(chatId);
  if (!chatMap) {
    chatMap = new Map();
    lastThrowAt.set(chatId, chatMap);
  }

  const last = chatMap.get(userId);
  if (last !== undefined && now - last < limitMs) {
    return false; // spam — do NOT update the timestamp, user must still wait out the original window
  }

  chatMap.set(userId, now);
  return true;
}