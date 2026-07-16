import { api, BotApiError } from 'sdk';
import { GAME_NAMES_FA, describeCondition } from 'lib/games';
import { isChatAdmin } from 'lib/admin';
import { getActiveRound, startRound, setAnnounceMessage, cancelRound } from 'lib/rounds';
import { displayName } from 'lib/util';

export default async function (cq) {
  const chat = cq.message?.chat;
  const from = cq.from;
  const data = cq.data ?? '';
  if (!chat) return;

  // Re-check admin on every button press — a non-admin could tap a button
  // meant for whoever ran /game, since inline keyboards are visible to all.
  const admin = await isChatAdmin(chat.id, from.id, chat.type);
  if (!admin) {
    await api.answerCallbackQuery({
      callback_query_id: cq.id,
      text: '⛔ فقط ادمین‌های گروه اجازه دارن.',
      show_alert: true,
    });
    return;
  }

  if (data.startsWith('gpick:')) return handlePick(cq, chat, from, data.slice('gpick:'.length));
  if (data.startsWith('gnum:')) {
    const [, game, num] = data.split(':');
    return finalizeStart(cq, chat, from, game, num);
  }
  if (data.startsWith('gslot:')) return finalizeStart(cq, chat, from, 'slot', data.slice('gslot:'.length));
  if (data.startsWith('gcancel:')) return handleCancel(cq, chat, Number(data.slice('gcancel:'.length)));

  await api.answerCallbackQuery({ callback_query_id: cq.id });
}

async function handlePick(cq, chat, from, game) {
  const existing = await getActiveRound(chat.id, game);
  if (existing) {
    await api.answerCallbackQuery({
      callback_query_id: cq.id,
      text: 'یه بازی از همین نوع همین الان فعاله. اول با /cancel لغوش کن.',
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
          [1, 2, 3].map((n) => ({ text: String(n), callback_data: `gnum:dice:${n}` })),
          [4, 5, 6].map((n) => ({ text: String(n), callback_data: `gnum:dice:${n}` })),
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
          [{ text: '🍋🍋🍋 لیمو', callback_data: 'gslot:lemon' }, { text: '🍇🍇🍇 انگور', callback_data: 'gslot:grapes' }],
          [{ text: '▬▬▬ بار', callback_data: 'gslot:bar' }, { text: '7️⃣7️⃣7️⃣ جکپات', callback_data: 'gslot:seven' }],
          [{ text: '✨ هر سه نماد یکسان', callback_data: 'gslot:any' }],
        ],
      },
    });
    await api.answerCallbackQuery({ callback_query_id: cq.id });
    return;
  }

  // dart / basketball / football have a fixed rule — nothing more to configure.
  const conditionType = game === 'dart' ? 'bullseye' : 'goal';
  await finalizeStart(cq, chat, from, game, null, conditionType);
}

async function finalizeStart(cq, chat, from, game, conditionValue, conditionType = game === 'dice' ? 'exact' : 'slot_combo') {
  const round = await startRound({
    chatId: chat.id,
    game,
    conditionType,
    conditionValue,
    createdBy: from.id,
    createdByName: displayName(from),
  });

  const text = [
    `🎮 بازی ${GAME_NAMES_FA[game]} شروع شد!`,
    `🏆 شرط برد: ${describeCondition(game, conditionValue)}`,
    '',
    'همین الان ایموجی مربوطه رو بفرستید — اولین نفری که شرط رو برآورده کنه برنده‌ست! 🔥',
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
