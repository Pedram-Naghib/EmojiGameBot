import { api } from '../src/telegram.js';

// Fires whenever the BOT's own membership/role in a chat changes: added,
// removed, promoted to admin, demoted back to member, etc. This is how we
// proactively ask for admin rights instead of silently failing later (e.g.
// the rate-limit delete, or the winner-announcement pin, both need admin).
export default async function (update) {
  const chat = update.chat;
  if (!chat || chat.type === 'private') return;

  const oldStatus = update.old_chat_member?.status;
  const newMember = update.new_chat_member;
  const newStatus = newMember?.status;

  // Just added to the group as a plain member (not admin) — either freshly
  // added, or demoted from admin back down to member.
  if (newStatus === 'member' && oldStatus !== 'member') {
    await api.sendMessage({
      chat_id: chat.id,
      text: [
        '👋 سلام! برای این‌که بازی‌ها درست کار کنن، باید من رو ادمین گروه کنید.',
        '',
        'حداقل این دو تا دسترسی رو لازم دارم:',
        '🗑 حذف پیام‌ها — برای پاک کردن پرتاب‌های زودتر از موعد (رعایت محدودیت زمانی)',
        '📌 سنجاق کردن پیام‌ها — برای اعلام شروع بازی و برنده‌ها',
        '',
        'بدون این‌ها، ممکنه دستورات و بازی‌ها اصلاً کار نکنن.',
      ].join('\n'),
    });
    return;
  }

  // Just promoted to admin — confirm we actually got the two permissions we need.
  if (newStatus === 'administrator' && oldStatus !== 'administrator') {
    const missing = [];
    if (!newMember.can_delete_messages) missing.push('🗑 حذف پیام‌ها');
    if (!newMember.can_pin_messages) missing.push('📌 سنجاق کردن پیام‌ها');

    if (missing.length === 0) {
      await api.sendMessage({ chat_id: chat.id, text: '✅ ممنون! حالا همه‌چیز آماده‌ست، می‌تونید با /game شروع کنید.' });
    } else {
      await api.sendMessage({
        chat_id: chat.id,
        text: [
          '✅ ادمین شدم، ولی این دسترسی(ها) هنوز روشن نیست:',
          missing.map((m) => `• ${m}`).join('\n'),
          '',
          'لطفاً از تنظیمات ادمین‌ها این‌ها رو هم فعال کنید تا همه‌چیز کامل کار کنه.',
        ].join('\n'),
      });
    }
  }
}