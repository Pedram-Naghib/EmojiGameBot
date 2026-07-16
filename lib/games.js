// Central place for "what game is this, what does winning mean" — add a new
// Telegram dice-emoji game by extending the objects below and adding one
// `case` to checkWin/describeCondition/conditionTypeFor. Nothing else changes.

export const GAME_EMOJI = {
  dice: '🎲',
  dart: '🎯',
  basketball: '🏀',
  football: '⚽',
  slot: '🎰',
  bowling: '🎳',
};

export const EMOJI_TO_GAME = Object.fromEntries(
  Object.entries(GAME_EMOJI).map(([game, emoji]) => [emoji, game]),
);

export const GAME_NAMES_FA = {
  dice: 'تاس 🎲',
  dart: 'دارت 🎯',
  basketball: 'بسکتبال 🏀',
  football: 'فوتبال ⚽',
  slot: 'اسلات 🎰',
  bowling: 'بولینگ 🎳',
};

export const SLOT_SYMBOLS = ['bar', 'grapes', 'lemon', 'seven'];

export const SLOT_SYMBOL_FA = {
  bar: 'میله (BAR)',
  grapes: 'انگور 🍇',
  lemon: 'لیمو 🍋',
  seven: 'هفت 7️⃣',
};

/**
 * Telegram's slot machine dice value (1-64) encodes 3 reels, each 0-3,
 * in base-4: reel = floor((value-1) / 4^i) % 4, i = 0,1,2.
 * Symbol order per reel index: 0=bar, 1=grapes, 2=lemon, 3=seven.
 * (Undocumented by Telegram but stable / widely relied upon.)
 */
export function decodeSlot(value) {
  let v = value - 1;
  const reels = [];
  for (let i = 0; i < 3; i++) {
    reels.push(SLOT_SYMBOLS[v % 4]);
    v = Math.floor(v / 4);
  }
  return reels;
}

/** The DB's `condition_type` value for a game (fixed per game, except dice/slot). */
export function conditionTypeFor(game) {
  switch (game) {
    case 'dice': return 'exact';
    case 'slot': return 'slot_combo';
    case 'dart': return 'bullseye';
    case 'bowling': return 'strike';
    case 'basketball':
    case 'football': return 'goal';
    default: return 'unknown';
  }
}

/**
 * Returns true if `diceValue` (the value Telegram sent for this emoji throw)
 * satisfies the round's per-throw winning condition. This does NOT know
 * about `targetCount` — that's a separate "how many times" layer handled
 * by the progress-tracking code in lib/rounds.js.
 */
export function checkWin(game, conditionValue, diceValue) {
  switch (game) {
    case 'dice':
      return diceValue === Number(conditionValue);
    case 'dart':
      // 6 = bullseye. (1-6 range; 6 is currently the max/bullseye per Telegram.)
      return diceValue === 6;
    case 'bowling':
      // 6 = strike (all pins down). (1-6 range, same shape as dart.)
      return diceValue === 6;
    case 'basketball':
    case 'football':
      // 4-5 = scored, 1-3 = missed (per Telegram's current behavior).
      return diceValue >= 4;
    case 'slot': {
      const [a, b, c] = decodeSlot(diceValue);
      if (conditionValue === 'any') return a === b && b === c;
      return a === conditionValue && b === conditionValue && c === conditionValue;
    }
    default:
      return false;
  }
}

/** Base (no ordinal/count wording) description of a round's per-throw condition. */
export function describeCondition(game, conditionValue) {
  switch (game) {
    case 'dice':
      return `آوردن عدد ${conditionValue}`;
    case 'dart':
      return 'زدن دقیقاً وسط هدف (بولزای)';
    case 'bowling':
      return 'زدن استرایک (همه‌ی پین‌ها)';
    case 'basketball':
      return 'وارد کردن توپ به سبد';
    case 'football':
      return 'زدن گل';
    case 'slot':
      if (conditionValue === 'any') return 'سه نماد یکسان (هر ترکیبی)';
      return `سه ${SLOT_SYMBOL_FA[conditionValue] ?? conditionValue}`;
    default:
      return '';
  }
}

/**
 * Full, human-readable win rule including how many times it must happen.
 * targetCount === 1 (the default) reads as a simple "first to..." race;
 * targetCount > 1 reads as a "first to reach N..." accumulation race.
 */
export function describeWinRule(game, conditionValue, targetCount = 1) {
  const base = describeCondition(game, conditionValue);
  if (targetCount <= 1) return `اولین کسی که ${base} رو انجام بده`;
  return `اولین کسی که ${targetCount} بار ${base} رو انجام بده`;
}