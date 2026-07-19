import handleMessage from '../handlers/message.js';
import handleCallbackQuery from '../handlers/callback_query.js';
import handleMyChatMember from '../handlers/my_chat_member.js';

// On the serverless platform, each update type triggered a separate handler
// file directly. On a real webhook, all updates land on one endpoint as a
// single JSON body, so we dispatch by which field is present.
export async function routeUpdate(update) {
  if (!update) return;
  if (update.message) return handleMessage(update.message);
  if (update.callback_query) return handleCallbackQuery(update.callback_query);
  if (update.my_chat_member) return handleMyChatMember(update.my_chat_member);
  // Other update types (edited_message, etc.) are ignored — add cases here if needed.
}