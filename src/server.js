import 'dotenv/config';
import express from 'express';
import { routeUpdate } from './router.js';

const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = `/webhook/${requireEnv('WEBHOOK_PATH_SECRET')}`;
const SECRET_TOKEN = process.env.WEBHOOK_SECRET_TOKEN; // optional but recommended

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (check your .env file)`);
  return value;
}

const app = express();
app.use(express.json());

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.post(WEBHOOK_PATH, (req, res) => {
  // Telegram sends this header back to you when you set secret_token on
  // setWebhook — verifying it stops randoms from POSTing fake updates even
  // if they guess your path.
  if (SECRET_TOKEN) {
    const got = req.get('X-Telegram-Bot-Api-Secret-Token');
    if (got !== SECRET_TOKEN) {
      return res.sendStatus(401);
    }
  }

  // Ack immediately — Telegram retries (and can eventually drop the
  // webhook) if it doesn't get a fast 200, and our own processing can take
  // longer than that (e.g. getChatMember round-trips) without needing to
  // block the response.
  res.sendStatus(200);

  routeUpdate(req.body).catch((err) => {
    console.error('Error handling update:', err);
  });
});

app.listen(PORT, () => {
  console.log(`EmojiGameBot listening on port ${PORT}`);
  console.log(`Webhook path: ${WEBHOOK_PATH}`);
});
