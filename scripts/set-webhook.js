import 'dotenv/config';
import { api } from '../src/telegram.js';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (check your .env file)`);
  return value;
}

const publicUrl = requireEnv('PUBLIC_URL').replace(/\/+$/, '');
const pathSecret = requireEnv('WEBHOOK_PATH_SECRET');
const secretToken = process.env.WEBHOOK_SECRET_TOKEN;

const url = `${publicUrl}/webhook/${pathSecret}`;

const result = await api.setWebhook({
  url,
  secret_token: secretToken,
  allowed_updates: ['message', 'callback_query', 'my_chat_member'],
  drop_pending_updates: false,
});

console.log('setWebhook result:', result);
console.log('Webhook URL set to:', url);

const info = await api.getWebhookInfo();
console.log('getWebhookInfo:', info);