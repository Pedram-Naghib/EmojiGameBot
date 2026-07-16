import { api, BotApiError } from 'sdk';
import { EMOJI_TO_GAME, GAME_NAMES_FA, describeCondition, checkWin } from 'lib/games';
import { isChatAdmin } from 'lib/admin';
import { getActiveRound, claimWin, listActiveRounds, cancelRound } from 'lib/rounds';
import { displayName, mentionHtml } from 'lib/util';

const HELP_TEXT = [
  '🎮 ربات بازی‌های ایموجی گروه',
  '',
  'وقتی یه بازی فعاله، کافیه همون ایموجی رو بفرستید:',
  '⚽ فوتبال — اولین گل برنده‌ست',
  '🏀 بسکتبال — اولین توپ داخل سبد برنده‌ست',
  '🎲 تاس — اولین کسی که عدد تعیین‌شده رو بیاره برنده‌ست',
  '🎯 دارت — اولین بولزای (وسط هدف) برنده‌ست',
  '🎰 اسلات — اولین ترکیب برنده (مثلاً سه‌تا لیمو) برنده‌ست',
  '',
  '👑 دستورات مخصوص ادمین‌ها:',
  '/game — شروع یه بازی جدید (با دکمه انتخاب می‌کنید)',
  '/status — دیدن بازی‌های فعال گروه',
  '/cancel — لغو یه بازی فعال',
  '/help — همین راهنما',
].join('\n');

export default async function (message) {
  if (message.dice) {
    return handleDiceThrow(message);
  }

  const text = message.text ?? '';
  if (!text.startsWith('/')) return;

  const command = text.split(/[\s@]/, 1)[0];
  const chat = message.chat;
  const from = message.from;

  switch (command) {
    case '/start':
    case '/help':
      await api.sendMessage({ chat_id: chat.id, text: HELP_TEXT });
      return;
    case '/game':
      return handleGameCommand(chat, from);
    case '/status':
      return handleStatusCommand(chat);
    case '/cancel':
      return handleCancelCommand(chat, from);
  }
}

async function handleDiceThrow(message) {
  const chat = message.chat;
  const dice = message.dice;
  const game = EMOJI_TO_GAME[dice.emoji];
  if (!game) return; // an emoji-dice type we don't play (e.g. bowling, for now)

  const round = await getActiveRound(chat.id, game);
  if (!round) return; // no active round for this game — ignore quietly, no spam

  if (!checkWin(game, round.conditionValue, dice.value)) return;

  const claimed = await claimWin(round.id, {
    winnerUserId: message.from.id,
    winnerName: displayName(message.from),
    winnerValue: dice.value,
  });
  if (!claimed) return; // lost the race to another simultaneous throw

  const text = [
    `🏆 ${mentionHtml(message.from)} برنده‌ی بازی ${GAME_NAMES_FA[game]} شد!`,
    `شرط برد: ${describeCondition(game, round.conditionValue)}`,
    '🎉 تبریک می‌گیم!',
  ].join('\n');

  const sent = await api.sendMessage({
    chat_id: chat.id,
    text,
    parse_mode: 'HTML',
    reply_to_message_id: message.message_id,
  });

  try {
    await api.pinChatMessage({ chat_id: chat.id, message_id: sent.message_id });
  } catch (e) {
    // Bot probably lacks "pin messages" admin permission in this group —
    // the winner announcement still went out, so this is non-fatal.
    if (!(e instanceof BotApiError)) throw e;
    console.warn('pin failed', e.description);
  }
}

async function handleGameCommand(chat, from) {
  const admin = await isChatAdmin(chat.id, from.id, chat.type);
  if (!admin) {
    await api.sendMessage({ chat_id: chat.id, text: '⛔ فقط ادمین‌های گروه می‌تونن بازی جدید شروع کنن.' });
    return;
  }
  await api.sendMessage({
    chat_id: chat.id,
    text: '🎮 کدوم بازی رو می‌خوای شروع کنی؟',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎲 تاس', callback_data: 'gpick:dice' }, { text: '🎯 دارت', callback_data: 'gpick:dart' }],
        [{ text: '🏀 بسکتبال', callback_data: 'gpick:basketball' }, { text: '⚽ فوتبال', callback_data: 'gpick:football' }],
        [{ text: '🎰 اسلات', callback_data: 'gpick:slot' }],
      ],
    },
  });
}

async function handleStatusCommand(chat) {
  const active = await listActiveRounds(chat.id);
  if (active.length === 0) {
    await api.sendMessage({ chat_id: chat.id, text: 'الان هیچ بازی فعالی نیست. با /game یکی شروع کن!' });
    return;
  }
  const lines = active.map(
    (r) => `• ${GAME_NAMES_FA[r.game]} — شرط: ${describeCondition(r.game, r.conditionValue)}`,
  );
  await api.sendMessage({ chat_id: chat.id, text: `🎮 بازی‌های فعال:\n${lines.join('\n')}` });
}

async function handleCancelCommand(chat, from) {
  const admin = await isChatAdmin(chat.id, from.id, chat.type);
  if (!admin) {
    await api.sendMessage({ chat_id: chat.id, text: '⛔ فقط ادمین‌ها می‌تونن بازی رو لغو کنن.' });
    return;
  }
  const active = await listActiveRounds(chat.id);
  if (active.length === 0) {
    await api.sendMessage({ chat_id: chat.id, text: 'هیچ بازی فعالی برای لغو وجود نداره.' });
    return;
  }
  await api.sendMessage({
    chat_id: chat.id,
    text: 'کدوم بازی رو می‌خوای لغو کنی؟',
    reply_markup: {
      inline_keyboard: active.map((r) => [{
        text: `${GAME_NAMES_FA[r.game]} (${describeCondition(r.game, r.conditionValue)})`,
        callback_data: `gcancel:${r.id}`,
      }]),
    },
  });
}
