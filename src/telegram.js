// Minimal Telegram Bot API client. Replaces the `sdk` import that only
// existed inside Telegram's serverless platform. Every method the handlers
// use (sendMessage, editMessageText, answerCallbackQuery, pinChatMessage,
// getChatMember) is implemented as a thin wrapper around fetch, plus the
// couple of calls needed to manage the webhook itself.

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  throw new Error('BOT_TOKEN is not set (check your .env file)');
}

const BASE_URL = `https://api.telegram.org/bot${TOKEN}`;

export class BotApiError extends Error {
  constructor(description, error_code, method) {
    super(description || `Telegram API error calling ${method}`);
    this.name = 'BotApiError';
    this.description = description;
    this.error_code = error_code;
    this.method = method;
  }
}

async function call(method, params = {}) {
  const res = await fetch(`${BASE_URL}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new BotApiError(`Non-JSON response (HTTP ${res.status})`, res.status, method);
  }

  if (!data.ok) {
    throw new BotApiError(data.description, data.error_code, method);
  }
  return data.result;
}

export const api = {
  sendMessage: (params) => call('sendMessage', params),
  editMessageText: (params) => call('editMessageText', params),
  answerCallbackQuery: (params) => call('answerCallbackQuery', params),
  pinChatMessage: (params) => call('pinChatMessage', params),
  getChatMember: (params) => call('getChatMember', params),
  getChatAdministrators: (params) => call('getChatAdministrators', params),
  deleteMessage: (params) => call('deleteMessage', params),

  // Webhook management (used by scripts/set-webhook.js and delete-webhook.js)
  setWebhook: (params) => call('setWebhook', params),
  deleteWebhook: (params) => call('deleteWebhook', params),
  getWebhookInfo: () => call('getWebhookInfo'),
  getMe: () => call('getMe'),
};