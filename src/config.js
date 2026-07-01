import 'dotenv/config';

function req(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return v.trim();
}

function opt(name, fallback = '') {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

function list(name) {
  return opt(name)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function num(name, fallback = null) {
  const v = opt(name);
  if (v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  ali: {
    get appKey() {
      return req('ALI_APP_KEY');
    },
    get appSecret() {
      return req('ALI_APP_SECRET');
    },
    get trackingId() {
      return req('ALI_TRACKING_ID');
    },
    gateway: opt('ALI_GATEWAY', 'https://api-sg.aliexpress.com/sync'),
  },
  telegram: {
    get token() {
      return req('TG_BOT_TOKEN');
    },
    get channel() {
      return req('TG_CHANNEL');
    },
  },
  targeting: {
    language: opt('TARGET_LANGUAGE', 'EN'),
    currency: opt('TARGET_CURRENCY', 'USD'),
    shipTo: opt('SHIP_TO_COUNTRY', 'US'),
    keywords: list('KEYWORDS'),
    categoryIds: list('CATEGORY_IDS'),
    maxPrice: num('MAX_PRICE'),
    minDiscount: num('MIN_DISCOUNT'),
    minRating: num('MIN_RATING'),
  },
  posting: {
    perRun: num('POSTS_PER_RUN', 1),
    cron: opt('POST_CRON', '0 */3 * * *'),
    captionLang: opt('CAPTION_LANG', 'he').toLowerCase(),
    delaySeconds: num('POST_DELAY_SECONDS', 8),
    imagesPerPost: Math.max(1, Math.min(4, num('IMAGES_PER_POST', 3))),
  },
  // Active hours, evaluated in POST_TZ so it stays correct across DST. Posts
  // only go out when the local hour is in [start, end). end=24 means through 23:59.
  window: {
    start: num('POST_WINDOW_START', 0),
    end: num('POST_WINDOW_END', 24),
    tz: opt('POST_TZ', 'Asia/Jerusalem'),
  },
};
