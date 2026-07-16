export function displayName(user) {
  if (!user) return 'کاربر';
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ');
  return full || (user.username ? `@${user.username}` : 'کاربر');
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function mentionHtml(user) {
  return `<a href="tg://user?id=${user.id}">${escapeHtml(displayName(user))}</a>`;
}
