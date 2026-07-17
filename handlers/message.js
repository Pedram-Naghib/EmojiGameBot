import { api, BotApiError } from '../src/telegram.js';
import { EMOJI_TO_GAME, GAME_NAMES_FA, describeWinRule, checkWin } from '../lib/games.js';
import { isChatAdmin } from '../lib/admin.js';
import { getActiveRound, claimWin, listActiveRounds, incrementProgress, getTopProgress } from '../lib/rounds.js';
import { displayName, mentionHtml } from '../lib/util.js';

const HELP_TEXT = [
  '🎮 ربات بازی‌های ایموجی گروه',
  '',
  'وقتی یه بازی فعاله، کافیه همون ایموجی رو بفرستید:',
  '⚽ فوتبال — گل',
  '🏀 بسکتبال — توپ داخل سبد',
  '🎲 تاس — عدد تعیین‌شده',
  '🎯 دارت — بولزای (وسط هدف)',
  '🎳 بولینگ — استرایک',
  '🎰 اسلات — ترکیب برنده (مثلاً سه‌تا لیمو)',
  '',
  'موقع شروع بازی، ادمین می‌تونه تعیین کنه برنده کیه: اولین نفری که',
  'شرط رو انجام بده، یا اولین نفری که X بار انجامش بده (مثلاً ۳ بار).',
  '',
  '👑 دستورات مخصوص ادمین‌ها:',
  '/game — شروع یه بازی جدید (با دکمه انتخاب می‌کنید)',
  '/status — دیدن بازی‌های فعال گروه (و جدول امتیازات)',
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
  if (!game) return; // an emoji-dice type we don't play

  const round = await getActiveRound(chat.id, game);
  if (!round) return; // no active round for this game — ignore quietly, no spam

  if (!checkWin(game, round.conditionValue, dice.value)) return;

  // Count this qualifying throw towards the user's progress. For the common
  // case (targetCount === 1) this immediately returns 1, i.e. "first to hit it wins".
  const currentCount = await incrementProgress(round.id, message.from.id, displayName(message.from));
  if (currentCount < round.targetCount) return; // getting there, but not yet

  const claimed = await claimWin(round.id, {
    winnerUserId: message.from.id,
    winnerName: displayName(message.from),
    winnerValue: dice.value,
    winnerCount: currentCount,
  });
  if (!claimed) return; // lost the race to another simultaneous throw

  const lines = [
    `🏆 ${mentionHtml(message.from)} برنده‌ی بازی ${GAME_NAMES_FA[game]} شد!`,
    `شرط برد: ${describeWinRule(game, round.conditionValue, round.targetCount)}`,
  ];
  if (round.targetCount > 1) lines.push(`تعداد موفقیت: ${currentCount}/${round.targetCount}`);
  lines.push('🎉 تبریک می‌گیم!');

  const sent = await api.sendMessage({
    chat_id: chat.id,
    text: lines.join('\n'),
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
        [{ text: '🎳 بولینگ', callback_data: 'gpick:bowling' }, { text: '🎰 اسلات', callback_data: 'gpick:slot' }],
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

  const blocks = [];
  for (const r of active) {
    let block = `• ${GAME_NAMES_FA[r.game]} — شرط: ${describeWinRule(r.game, r.conditionValue, r.targetCount)}`;
    if (r.targetCount > 1) {
      const top = await getTopProgress(r.id, 3);
      if (top.length > 0) {
        block += '\n' + top.map((p) => `   ${p.userName}: ${p.count}/${r.targetCount}`).join('\n');
      }
    }
    blocks.push(block);
  }
  await api.sendMessage({ chat_id: chat.id, text: `🎮 بازی‌های فعال:\n${blocks.join('\n')}` });
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
        text: `${GAME_NAMES_FA[r.game]} (${describeWinRule(r.game, r.conditionValue, r.targetCount)})`,
        callback_data: `gcancel:${r.id}`,
      }]),
    },
  });
}
