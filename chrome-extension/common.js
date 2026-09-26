// Shared constants + small helpers used by background/popup/options/content.

export const FEED_URL = 'https://mobizombi.github.io/alideals-bot/feed.json';
export const SITE_URL = 'https://mobizombi.github.io/alideals-bot/';

export const CATEGORIES = [
  { slug: 'kitchen', name: 'מטבח', emoji: '🍳' },
  { slug: 'car', name: 'רכב', emoji: '🚗' },
  { slug: 'lighting', name: 'תאורה ו-LED', emoji: '💡' },
  { slug: 'watches', name: 'שעונים חכמים', emoji: '⌚' },
  { slug: 'phone', name: 'אביזרים לטלפון', emoji: '📱' },
  { slug: 'home', name: 'בית ועיצוב', emoji: '🏠' },
  { slug: 'tools', name: 'כלי עבודה', emoji: '🔧' },
];

export const DEFAULT_SETTINGS = {
  dailyDigestEnabled: true,
  digestHour: 9, // 24h, local time
  categories: [], // empty = all categories
};

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function getCachedFeed() {
  const { feed } = await chrome.storage.local.get('feed');
  return feed && Array.isArray(feed.deals) ? feed : { deals: [], generatedAt: null };
}

export function money(n, currency = 'ILS') {
  if (n == null) return '';
  const symbol = currency === 'ILS' ? '₪' : currency + ' ';
  return `${symbol}${Number(n).toFixed(2)}`;
}

export function clip(text = '', n = 70) {
  return text.length > n ? `${text.slice(0, n - 1).trim()}…` : text;
}

export function categoryLabel(slug) {
  const c = CATEGORIES.find((c) => c.slug === slug);
  return c ? `${c.emoji} ${c.name}` : '';
}
