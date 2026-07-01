import { config } from './config.js';

const CUR = { ILS: '₪', USD: '$', EUR: '€', GBP: '£' };

function money(amount, currency) {
  const sym = CUR[currency] || '';
  const n = Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return sym ? `${sym}${n}` : `${n} ${currency}`;
}

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function clip(title, max = 90) {
  const t = title.trim();
  return t.length > max ? `${t.slice(0, max - 1).trim()}…` : t;
}

const FIRE = (d) => (d >= 70 ? '🔥🔥' : d >= 50 ? '🔥' : '');

/**
 * Build the channel caption. Returns { caption, buttonText, url }.
 */
export function buildPost(product) {
  const lang = config.posting.captionLang;
  const url = product.promotionLink || product.detailUrl;
  const title = esc(clip(product.title));
  const price = money(product.price, product.currency);
  const had =
    product.originalPrice > product.price
      ? money(product.originalPrice, product.currency)
      : null;
  const disc = product.discount > 0 ? product.discount : null;
  const orders = product.orders > 0 ? product.orders.toLocaleString('en-US') : null;

  if (lang === 'he') {
    const lines = [];
    lines.push(`${FIRE(product.discount)} <b>${title}</b>`.trim());
    lines.push('');
    if (had) {
      lines.push(`💰 <b>${price}</b>  <s>${had}</s>${disc ? `  (-${disc}%)` : ''}`);
    } else {
      lines.push(`💰 <b>${price}</b>`);
    }
    if (orders) lines.push(`📦 ${orders} הזמנות`);
    if (product.rating >= 90) lines.push(`⭐ דירוג ${product.rating}%`);
    lines.push('');
    lines.push('👇 לחצו על הכפתור לקנייה במחיר הזה');
    return {
      caption: lines.join('\n'),
      buttonText: '🛒 לקנייה באליאקספרס',
      followText: `💰 <b>${price}</b> 👇 המחיר כאן`,
      url,
    };
  }

  // English
  const lines = [];
  lines.push(`${FIRE(product.discount)} <b>${title}</b>`.trim());
  lines.push('');
  if (had) {
    lines.push(`💰 <b>${price}</b>  <s>${had}</s>${disc ? `  (-${disc}%)` : ''}`);
  } else {
    lines.push(`💰 <b>${price}</b>`);
  }
  if (orders) lines.push(`📦 ${orders} orders`);
  if (product.rating >= 90) lines.push(`⭐ ${product.rating}% positive`);
  lines.push('');
  lines.push('👇 Tap the button to grab this deal');
  return {
    caption: lines.join('\n'),
    buttonText: '🛒 Buy on AliExpress',
    followText: `💰 <b>${price}</b> 👇 grab it here`,
    url,
  };
}
