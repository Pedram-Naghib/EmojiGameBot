import { api } from '../src/telegram.js';
import { isBotAdmin } from './botAdmins.js';

/**
 * Only group admins (or the creator) may start/cancel rounds. In a private
 * chat there's no admin concept, so we just allow it — it's the user's own chat.
 */
export async function isChatAdmin(chatId, userId, chatType) {
  if (chatType === 'private') return true;
  try {
    const member = await api.getChatMember({ chat_id: chatId, user_id: userId });
    return member.status === 'creator' || member.status === 'administrator';
  } catch (e) {
    console.warn('getChatMember failed', e?.description ?? e);
    return false;
  }
}

/**
 * Strictly the group's owner (Telegram "creator") — not any admin. Starting a
 * new game, and managing the bot's own admin list, are reserved for the owner
 * alone so a regular Telegram admin can't hand out those powers to themselves.
 */
export async function isChatOwner(chatId, userId, chatType) {
  if (chatType === 'private') return true;
  try {
    const member = await api.getChatMember({ chat_id: chatId, user_id: userId });
    return member.status === 'creator';
  } catch (e) {
    console.warn('getChatMember failed', e?.description ?? e);
    return false;
  }
}

/**
 * Owner, any real Telegram admin of the group, or someone the owner has added
 * to the bot's own admin list. Used for day-to-day game commands (/game,
 * /cancel, /setlimit, /setmaxtries) — only /addadmin and /removeadmin
 * themselves are restricted to isChatOwner specifically, so a regular
 * Telegram admin can't hand out bot-admin status to someone else.
 */
export async function isPrivileged(chatId, userId, chatType) {
  if (chatType === 'private') return true;
  if (await isChatAdmin(chatId, userId, chatType)) return true; // covers owner + any Telegram admin
  return isBotAdmin(chatId, userId);
}