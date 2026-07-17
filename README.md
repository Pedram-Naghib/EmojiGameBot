# Emoji Games Bot — webhook / self-hosted version

This is your `EmojiGameBot` game logic, ported off Telegram's serverless
platform (`@tgcloud`) onto a plain Node.js server you run yourself, talking
to Telegram over a **webhook** instead of the platform's built-in transport.

What changed vs. the original repo:

| Original (serverless)                     | This version                                   |
| ------------------------------------------ | ----------------------------------------------- |
| `sdk` (`api`, `BotApiError`)                | `src/telegram.js` — plain `fetch` wrapper       |
| `sdk/db` (query builder)                    | `drizzle-orm` + `better-sqlite3`                |
| Platform auto-invokes `handlers/*.js`       | `src/router.js` dispatches on the update shape  |
| Platform manages the webhook for you        | `scripts/set-webhook.js` / `express` server     |
| `npx tgcloud push` / `migrate`              | `npm start`, schema bootstraps itself on boot   |

Your game rules (`lib/games.js`), win-condition logic, admin checks, and
Persian message copy are all untouched.

## 1. Prerequisites

- A server (VPS, droplet, etc.) with a **public HTTPS URL**. Telegram will
  only deliver webhooks to `https://` addresses on port 443, 80, 88, or 8443.
- Node.js 18+ (for native `fetch`).
- Build tools for `better-sqlite3`'s native addon: `python3`, `make`, `g++`
  (skip this if you deploy with the provided Docker image, which installs
  them automatically).
- A bot token from [@BotFather](https://t.me/BotFather).
- In BotFather: `/setprivacy` → **Disable** for your bot, so it can see dice
  throws and messages from other group members (not just commands).
- Add the bot to your group and give it **"Delete messages" / "Pin
  messages"** admin permission (winner/announcement pinning silently no-ops
  without it, per the original code's design).

## 2. Configure

```bash
cp .env.example .env
```

Fill in `.env`:

- `BOT_TOKEN` — from BotFather.
- `PUBLIC_URL` — your server's public HTTPS URL, e.g. `https://yourdomain.com`.
- `WEBHOOK_PATH_SECRET` — random string (`openssl rand -hex 24`). Becomes
  part of the webhook URL path so it can't be guessed.
- `WEBHOOK_SECRET_TOKEN` — another random string. Telegram echoes it back
  in a header on every request; the server checks it and rejects anything
  else, even someone who somehow found the path.
- `DB_PATH` — where the SQLite file lives (defaults to `./data/bot.db`).

## 3. Run it

### Option A — Docker (recommended)

```bash
docker compose up -d --build
```

Then put a reverse proxy with TLS in front of port 3000 (see
`deploy/nginx.conf.example` for an nginx config using Let's Encrypt).

### Option B — Bare Node.js + systemd

```bash
npm install
npm start
```

For a real deployment, run it as a service instead of a foreground process:

```bash
sudo cp -r . /opt/emoji-games-bot
sudo cp deploy/emoji-games-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now emoji-games-bot
```

Either way, put nginx (or Caddy) in front for HTTPS — Telegram requires a
valid TLS certificate on the webhook URL; a raw HTTP port doesn't qualify.

## 4. Register the webhook with Telegram

Once the server is reachable at `https://yourdomain.com` and `.env` is filled in:

```bash
npm run set-webhook
```

This calls `setWebhook` with your `PUBLIC_URL` + `WEBHOOK_PATH_SECRET` and
prints Telegram's `getWebhookInfo` response so you can confirm it took (look
for `"pending_update_count": 0` and no `last_error_message`).

To go back to local testing (or switch to polling with a different tool),
remove it with:

```bash
npm run delete-webhook
```

## 5. Verify

- `GET https://yourdomain.com/healthz` should return `ok`.
- Send `/help` to the bot in a chat — you should get the Persian help text.
- Run `/game` as a group admin, pick a game, then throw the matching emoji.

## Notes

- The SQLite schema bootstraps itself (`CREATE TABLE IF NOT EXISTS ...`) on
  every startup in `src/db.js` — no separate migrate step needed for this
  simple two-table schema. If you extend `src/schema.js` significantly,
  consider switching to real `drizzle-kit` migrations.
- The webhook handler responds `200 OK` to Telegram immediately and
  processes the update afterward, so a slow `getChatMember` call, etc.,
  can't cause Telegram to time out and retry (which would otherwise risk
  double-processing a dice throw).
- Race-safety for "first to hit it wins" is preserved: `claimWin` in
  `lib/rounds.js` only succeeds if the round was still `active` at update
  time, same as the original.
