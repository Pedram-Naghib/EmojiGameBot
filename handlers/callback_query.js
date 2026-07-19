import { api, BotApiError } from '../src/telegram.js';
import { GAME_NAMES_FA, describeWinRule, conditionTypeFor } from '../lib/games.js';
import { isPrivileged } from '../lib/admin.js';
import { getActiveRound, hasActiveRound, startRound, setAnnounceMessage, cancelRound } from '../lib/rounds.js';
import { displayName } from '../lib/util.js';

const COUNT_OPTIONS = [1, 2, 3, 5, 10];
const NO_VALUE = '_'; // placeholder condition-value for games with no extra choice (dart/bowling/basketball/football)

const GAME_WIZARD_PREFIXES = ['gpick:', 'gcond:', 'gcount:'];

export default async function (cq) {
  const chat = cq.message?.chat;
  const from = cq.from;
  const data = cq.data ?? '';
  if (!chat) return;

  // Re-check permissions on every button press — anyone could tap a button
  // meant for whoever ran the original command, since inline keyboards are
  // visible to all. Starting a new game and cancelling one are both open to
  // the owner or any bot-admin (managing the bot-admin list itself is the
  // only thing reserved strictly for the owner, and that's a /command, not a button).
  if (GAME_WIZARD_PREFIXES.some((p) => data.startsWith(p)) || data.startsWith('gcancel:')) {
    const privileged = await isPrivileged(chat.id, from.id, chat.type);
    if (!privileged) {
      await api.answerCallbackQuery({
        callback_query_id: cq.id,
        text: '⛔ فقط مالک گروه یا ادمین‌های ربات اجازه دارن.',
        show_alert: true,
      });
      return;
    }
  }

  if (data.startsWith('gpick:')) return handlePick(cq, chat, data.slice('gpick:'.length));

  if (data.startsWith('gcond:')) {
    const [, game, value] = data.split(':');
    return showCountPicker(cq, chat, game, value);
  }

  if (data.startsWith('gcount:')) {
    const [, game, value, count] = data.split(':');
    return finalizeStart(cq, chat, from, game, value === NO_VALUE ? null : value, Number(count));
  }

  if (data.startsWith('gcancel:')) return handleCancel(cq, chat, Number(data.slice('gcancel:'.length)));

  await api.answerCallbackQuery({ callback_query_id: cq.id });
}

async function handlePick(cq, chat, game) {
  // Only one game may run at a time per group (across all game types), so
  // members aren't spamming several different emojis simultaneously.
  const busy = await hasActiveRound(chat.id);
  if (busy) {
    await api.answerCallbackQuery({
      callback_query_id: cq.id,
      text: 'یه بازی دیگه همین الان تو این گروه فعاله. اول با /cancel لغوش کن.',
      show_alert: true,
    });
    return;
  }

  if (game === 'dice') {
    await api.editMessageText({
      chat_id: chat.id,
      message_id: cq.message.message_id,
      text: '🎲 چه عددی برنده باشه؟',
      reply_markup: {
        inline_keyboard: [
          [1, 2, 3].map((n) => ({ text: String(n), callback_data: `gcond:dice:${n}` })),
          [4, 5, 6].map((n) => ({ text: String(n), callback_data: `gcond:dice:${n}` })),
        ],
      },
    });
    await api.answerCallbackQuery({ callback_query_id: cq.id });
    return;
  }

  if (game === 'slot') {
    await api.editMessageText({
      chat_id: chat.id,
      message_id: cq.message.message_id,
      text: '🎰 برنده با چه ترکیبی مشخص بشه؟',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🍋🍋🍋 لیمو', callback_data: 'gcond:slot:lemon' }, { text: '🍇🍇🍇 انگور', callback_data: 'gcond:slot:grapes' }],
          [{ text: '▬▬▬ بار', callback_data: 'gcond:slot:bar' }, { text: '7️⃣7️⃣7️⃣ جکپات', callback_data: 'gcond:slot:seven' }],
          [{ text: '✨ هر سه نماد یکسان', callback_data: 'gcond:slot:any' }],
        ],
      },
    });
    await api.answerCallbackQuery({ callback_query_id: cq.id });
    return;
  }

  // dart / bowling / basketball / football have a fixed rule — go straight to the count step.
  await showCountPicker(cq, chat, game, NO_VALUE);
}

async function showCountPicker(cq, chat, game, value) {
  await api.editMessageText({
    chat_id: chat.id,
    message_id: cq.message.message_id,
    text: '🔢 برنده باید چند بار این شرط رو تکرار کنه؟\n(۱ یعنی اولین نفری که انجامش بده برنده‌ست)',
    reply_markup: {
      inline_keyboard: [COUNT_OPTIONS.map((c) => ({ text: `${c} بار`, callback_data: `gcount:${game}:${value}:${c}` }))],
    },
  });
  await api.answerCallbackQuery({ callback_query_id: cq.id });
}

async function finalizeStart(cq, chat, from, game, conditionValue, targetCount) {
  const round = await startRound({
    chatId: chat.id,
    game,
    conditionType: conditionTypeFor(game),
    conditionValue,
    targetCount,
    createdBy: from.id,
    createdByName: displayName(from),
  });

  if (!round) {
    // Another admin finished their own wizard first, in the gap between our
    // earlier hasActiveRound() check and now.
    await api.answerCallbackQuery({
      callback_query_id: cq.id,
      text: 'یه بازی دیگه همین الان تو این گروه فعال شد. اول با /cancel لغوش کن.',
      show_alert: true,
    });
    return;
  }

  const text = [
    `🎮 بازی ${GAME_NAMES_FA[game]} شروع شد!`,
    `🏆 شرط برد: ${describeWinRule(game, conditionValue, targetCount)}`,
    '',
    'همین الان ایموجی مربوطه رو بفرستید! 🔥',
  ].join('\n');

  await api.editMessageText({ chat_id: chat.id, message_id: cq.message.message_id, text });
  await api.answerCallbackQuery({ callback_query_id: cq.id, text: 'بازی شروع شد!' });
  await setAnnounceMessage(round.id, cq.message.message_id);

  try {
    await api.pinChatMessage({ chat_id: chat.id, message_id: cq.message.message_id });
  } catch (e) {
    if (!(e instanceof BotApiError)) throw e;
    console.warn('pin failed', e.description);
  }
}

async function handleCancel(cq, chat, roundId) {
  const cancelled = await cancelRound(roundId);
  if (!cancelled) {
    await api.answerCallbackQuery({ callback_query_id: cq.id, text: 'این بازی قبلاً تموم یا لغو شده بود.' });
    return;
  }
  await api.answerCallbackQuery({ callback_query_id: cq.id, text: 'بازی لغو شد.' });
  await api.editMessageText({
    chat_id: chat.id,
    message_id: cq.message.message_id,
    text: `❌ بازی ${GAME_NAMES_FA[cancelled.game]} لغو شد.`,
  });
}