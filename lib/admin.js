import { api } from '../src/telegram.js';

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
