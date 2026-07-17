import 'dotenv/config';
import { api } from '../src/telegram.js';

const result = await api.deleteWebhook({ drop_pending_updates: false });
console.log('deleteWebhook result:', result);
