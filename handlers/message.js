import { api, BotApiError } from '../src/telegram.js';
import { EMOJI_TO_GAME, GAME_NAMES_FA, describeWinRule, checkWin } from '../lib/games.js';
import { isChatOwner, isPrivileged } from '../lib/admin.js';
import { getActiveRound, claimWin, listActiveRounds, incrementProgress, getTopProgress, getAttemptCount, incrementAttempt, setMaxAttempts } from '../lib/rounds.js';
import { addBotAdmin, removeBotAdmin, listBotAdmins } from '../lib/botAdmins.js';
import { displayName, mentionHtml } from '../lib/util.js';
import { getLimitSeconds, setLimitSeconds, checkAndRecordThrow } from '../lib/ratelimit.js';

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
  '👑 دستورات مخصوص مالک گروه:',
  '/addadmin — ریپلای رو یه پیام از کسی کن که می‌خوای ادمین ربات بشه',
  '/removeadmin — ریپلای رو یه پیام از یه ادمین ربات کن تا حذفش کنی',
  '',
  '🛡 دستورات مالک + ادمین‌های تلگرام + ادمین‌های ربات:',
  '/game — شروع یه بازی جدید',
  '/status — دیدن بازی‌های فعال گروه (و جدول امتیازات)',
  '/cancel — لغو یه بازی فعال',
  '/setlimit ثانیه — فاصله‌ی مجاز بین دو پرتاب هر نفر (پیش‌فرض ۵ ثانیه، برای جلوگیری از اسپم)',
  '/setmaxtries تعداد — سقف تعداد شرکت هر نفر تو بازی فعلی (پیش‌فرض نامحدود؛ ۰ = نامحدود)',
  '/admins — لیست ادمین‌های ربات در این گروه',
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
    case '/setlimit':
      return handleSetLimitCommand(chat, from, text);
    case '/setmaxtries':
      return handleSetMaxTriesCommand(chat, from, text);
    case '/addadmin':
      return handleAddAdminCommand(chat, from, message);
    case '/removeadmin':
      return handleRemoveAdminCommand(chat, from, message);
    case '/admins':
      return handleListAdminsCommand(chat);
  }
}

async function handleDiceThrow(message) {
  const chat = message.chat;
  const dice = message.dice;
  const game = EMOJI_TO_GAME[dice.emoji];
  if (!game) return; // an emoji-dice type we don't play

  const round = await getActiveRound(chat.id, game);
  if (!round) return; // no active round for this game — ignore quietly, no spam

  // Rate limit: only the user's most recent qualifying throw counts. If they
  // throw again before the cooldown elapses, delete the spammy throw instead
  // of scoring it.
  if (!checkAndRecordThrow(chat.id, message.from.id)) {
    try {
      await api.deleteMessage({ chat_id: chat.id, message_id: message.message_id });
    } catch (e) {
      // Bot probably lacks "delete messages" admin permission in this group.
      if (!(e instanceof BotApiError)) throw e;
      console.warn('rate-limit delete failed', e.description);
    }
    return;
  }

  // Cap on total throws per user for this round (separate from the cooldown
  // above — this limits *how many* attempts total, not how fast). Unlimited
  // by default (round.maxAttemptsPerUser is null unless an admin set one).
  if (round.maxAttemptsPerUser) {
    const used = await getAttemptCount(round.id, message.from.id);
    if (used >= round.maxAttemptsPerUser) {
      try {
        await api.deleteMessage({ chat_id: chat.id, message_id: message.message_id });
      } catch (e) {
        if (!(e instanceof BotApiError)) throw e;
        console.warn('max-attempts delete failed', e.description);
      }
      return;
    }
  }
  await incrementAttempt(round.id, message.from.id, displayName(message.from));

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
  const privileged = await isPrivileged(chat.id, from.id, chat.type);
  if (!privileged) {
    await api.sendMessage({ chat_id: chat.id, text: '⛔ فقط مالک گروه، ادمین‌های تلگرام، یا ادمین‌های ربات می‌تونن بازی جدید شروع کنن.' });
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

async function handleSetLimitCommand(chat, from, text) {
  const privileged = await isPrivileged(chat.id, from.id, chat.type);
  if (!privileged) {
    await api.sendMessage({ chat_id: chat.id, text: '⛔ فقط مالک گروه، ادمین‌های تلگرام، یا ادمین‌های ربات می‌تونن این محدودیت رو تغییر بدن.' });
    return;
  }

  const arg = text.trim().split(/\s+/)[1];
  const seconds = Number(arg);

  if (!arg || !Number.isInteger(seconds) || seconds < 1) {
    await api.sendMessage({
      chat_id: chat.id,
      text: `استفاده درست: /setlimit ثانیه\nمثال: /setlimit 10\nمقدار فعلی: ${getLimitSeconds(chat.id)} ثانیه`,
    });
    return;
  }

  setLimitSeconds(chat.id, seconds);
  await api.sendMessage({
    chat_id: chat.id,
    text: `✅ فاصله‌ی مجاز بین دو پرتاب هر نفر روی ${seconds} ثانیه تنظیم شد.`,
  });
}

async function handleSetMaxTriesCommand(chat, from, text) {
  const privileged = await isPrivileged(chat.id, from.id, chat.type);
  if (!privileged) {
    await api.sendMessage({ chat_id: chat.id, text: '⛔ فقط مالک گروه، ادمین‌های تلگرام، یا ادمین‌های ربات می‌تونن این محدودیت رو تغییر بدن.' });
    return;
  }

  const active = await listActiveRounds(chat.id);
  const round = active[0]; // at most one active round per chat, per the one-game-at-a-time rule
  if (!round) {
    await api.sendMessage({ chat_id: chat.id, text: 'الان هیچ بازی فعالی نیست. اول با /game یکی شروع کن.' });
    return;
  }

  const arg = text.trim().split(/\s+/)[1];

  if (!arg) {
    const current = round.maxAttemptsPerUser ? `${round.maxAttemptsPerUser} بار` : 'نامحدود';
    await api.sendMessage({
      chat_id: chat.id,
      text: `استفاده درست: /setmaxtries تعداد\nمثال: /setmaxtries 3\nبرای نامحدود کردن دوباره: /setmaxtries 0\nمقدار فعلی برای «${GAME_NAMES_FA[round.game]}»: ${current}`,
    });
    return;
  }

  const count = Number(arg);
  if (!Number.isInteger(count) || count < 0) {
    await api.sendMessage({ chat_id: chat.id, text: 'عدد باید صحیح و صفر یا بیشتر باشه (۰ یعنی نامحدود).' });
    return;
  }

  await setMaxAttempts(round.id, count === 0 ? null : count);
  await api.sendMessage({
    chat_id: chat.id,
    text: count === 0
      ? `✅ محدودیت تعداد شرکت برای «${GAME_NAMES_FA[round.game]}» برداشته شد (نامحدود).`
      : `✅ هر نفر حداکثر ${count} بار می‌تونه برای «${GAME_NAMES_FA[round.game]}» شرکت کنه.`,
  });
}

async function handleAddAdminCommand(chat, from, message) {
  const owner = await isChatOwner(chat.id, from.id, chat.type);
  if (!owner) {
    await api.sendMessage({ chat_id: chat.id, text: '⛔ فقط مالک گروه می‌تونه ادمین ربات اضافه کنه.' });
    return;
  }

  const target = message.reply_to_message?.from;
  if (!target) {
    await api.sendMessage({
      chat_id: chat.id,
      text: 'روی پیام کسی که می‌خوای ادمین ربات بشه ریپلای کن و بنویس /addadmin',
    });
    return;
  }

  if (target.is_bot) {
    await api.sendMessage({ chat_id: chat.id, text: '⛔ نمی‌شه یه ربات رو ادمین ربات کرد.' });
    return;
  }

  await addBotAdmin(chat.id, target.id, displayName(target), from.id);
  await api.sendMessage({
    chat_id: chat.id,
    text: `✅ ${mentionHtml(target)} به لیست ادمین‌های ربات اضافه شد.`,
    parse_mode: 'HTML',
  });
}

async function handleRemoveAdminCommand(chat, from, message) {
  const owner = await isChatOwner(chat.id, from.id, chat.type);
  if (!owner) {
    await api.sendMessage({ chat_id: chat.id, text: '⛔ فقط مالک گروه می‌تونه ادمین ربات رو حذف کنه.' });
    return;
  }

  const target = message.reply_to_message?.from;
  if (!target) {
    await api.sendMessage({
      chat_id: chat.id,
      text: 'روی پیام یه ادمین ربات ریپلای کن و بنویس /removeadmin',
    });
    return;
  }

  const removed = await removeBotAdmin(chat.id, target.id);
  if (!removed) {
    await api.sendMessage({ chat_id: chat.id, text: `${displayName(target)} روی لیست ادمین‌های ربات نبود.` });
    return;
  }

  await api.sendMessage({
    chat_id: chat.id,
    text: `✅ ${mentionHtml(target)} از لیست ادمین‌های ربات حذف شد.`,
    parse_mode: 'HTML',
  });
}

async function handleListAdminsCommand(chat) {
  let members = [];
  try {
    members = await api.getChatAdministrators({ chat_id: chat.id });
  } catch (e) {
    if (!(e instanceof BotApiError)) throw e;
    console.warn('getChatAdministrators failed', e.description);
  }

  const owner = members.find((m) => m.status === 'creator');
  const telegramAdmins = members.filter((m) => m.status === 'administrator');
  const botAdmins = await listBotAdmins(chat.id);

  const lines = ['👑 مالک گروه:'];
  lines.push(owner ? `• ${displayName(owner.user)}` : '• نامشخص');

  lines.push('', '🛡 ادمین‌های تلگرام:');
  lines.push(telegramAdmins.length > 0
    ? telegramAdmins.map((m) => `• ${displayName(m.user)}`).join('\n')
    : '• کسی نیست');

  lines.push('', '🔧 ادمین‌های ربات (اضافه‌شده با /addadmin):');
  lines.push(botAdmins.length > 0
    ? botAdmins.map((a) => `• ${a.userName || 'کاربر'}`).join('\n')
    : '• کسی اضافه نشده');

  await api.sendMessage({ chat_id: chat.id, text: lines.join('\n') });
}

async function handleCancelCommand(chat, from) {
  const privileged = await isPrivileged(chat.id, from.id, chat.type);
  if (!privileged) {
    await api.sendMessage({ chat_id: chat.id, text: '⛔ فقط مالک گروه، ادمین‌های تلگرام، یا ادمین‌های ربات می‌تونن بازی رو لغو کنن.' });
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