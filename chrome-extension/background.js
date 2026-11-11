import { FEED_URL, getSettings } from './common.js';

const REFRESH_ALARM = 'refresh-feed';
const DIGEST_ALARM = 'daily-digest';
const REFRESH_MINUTES = 90;

async function fetchFeed() {
  let feed;
  try {
    const res = await fetch(FEED_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`feed http ${res.status}`);
    feed = await res.json();
  } catch (err) {
    console.warn('[מציאון] feed fetch failed', err);
    return null;
  }

  const { seenIds = [] } = await chrome.storage.local.get('seenIds');
  const seen = new Set(seenIds);
  const newCount = feed.deals.filter((d) => !seen.has(d.id)).length;

  await chrome.storage.local.set({ feed, lastFetchedAt: Date.now() });
  await updateBadge(newCount);
  return feed;
}

async function updateBadge(count) {
  if (!count) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }
  await chrome.action.setBadgeBackgroundColor({ color: '#ff6a00' });
  await chrome.action.setBadgeText({ text: String(Math.min(count, 99)) });
}

function nextDigestDelayMinutes(hour) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return Math.max(1, Math.round((target - now) / 60000));
}

async function scheduleDigestAlarm() {
  const settings = await getSettings();
  await chrome.alarms.clear(DIGEST_ALARM);
  if (!settings.dailyDigestEnabled) return;
  chrome.alarms.create(DIGEST_ALARM, {
    delayInMinutes: nextDigestDelayMinutes(settings.digestHour),
    periodInMinutes: 24 * 60,
  });
}

async function showDailyDigest() {
  const settings = await getSettings();
  if (!settings.dailyDigestEnabled) return;

  const { feed } = await chrome.storage.local.get('feed');
  const deals = feed?.deals || [];
  const filtered = settings.categories.length
    ? deals.filter((d) => settings.categories.includes(d.cat))
    : deals;
  const top = filtered[0];
  if (!top) return;

  chrome.notifications.create(`digest:${top.id}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'מציאון – הדיל של היום',
    message: `${top.title}${top.discount ? ` · ${top.discount}%- הנחה` : ''}`,
    contextMessage: 'לחצו לפתיחת הדיל באליאקספרס',
    priority: 1,
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await fetchFeed();
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_MINUTES });
  await scheduleDigestAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await fetchFeed();
  await scheduleDigestAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) fetchFeed();
  if (alarm.name === DIGEST_ALARM) showDailyDigest();
});

chrome.notifications.onClicked.addListener((notificationId) => {
  const id = notificationId.split(':')[1];
  chrome.storage.local.get('feed').then(({ feed }) => {
    const deal = feed?.deals?.find((d) => d.id === id);
    chrome.tabs.create({ url: deal?.url || 'https://mobizombi.github.io/alideals-bot/' });
  });
  chrome.notifications.clear(notificationId);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'refresh-feed') {
    fetchFeed().then((feed) => sendResponse({ feed }));
    return true;
  }
  if (message?.type === 'mark-seen') {
    chrome.storage.local.get('feed').then(({ feed }) => {
      const ids = (feed?.deals || []).map((d) => d.id);
      chrome.storage.local.set({ seenIds: ids }).then(() => {
        updateBadge(0);
        sendResponse({ ok: true });
      });
    });
    return true;
  }
  if (message?.type === 'settings-changed') {
    scheduleDigestAlarm().then(() => sendResponse({ ok: true }));
    return true;
  }
});
