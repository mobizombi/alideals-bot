import { config } from './config.js';
import { queryHotProducts, queryProducts, generateAffiliateLink } from './aliexpress.js';
import { wasPosted } from './store.js';

function pickKeyword() {
  const k = config.targeting.keywords;
  if (!k.length) return undefined;
  return k[Math.floor(Math.random() * k.length)];
}

const HEBREW = /[\u0590-\u05FF]/;

function hasLocalTitle(title) {
  const lang = config.targeting.language.toUpperCase();
  if (lang === 'HE' || lang === 'IW') return HEBREW.test(title);
  return true;
}

function passesFilters(p) {
  const { maxPrice, minDiscount, minRating, minOrders, requireLocalTitle } = config.targeting;
  if (!p.id || !p.title || !p.image) return false;
  if (!(p.price > 0)) return false;
  if (maxPrice != null && p.price > maxPrice) return false;
  if (minDiscount != null && p.discount < minDiscount) return false;
  if (minRating != null && !(p.rating >= minRating)) return false;
  if (minOrders != null && !(p.orders >= minOrders)) return false;
  if (requireLocalTitle && !hasLocalTitle(p.title)) return false;
  if (wasPosted(p.id)) return false;
  return true;
}

// Score deals so the most attention-grabbing ones post first: heavy discount,
// strong sales volume, good rating.
function score(p) {
  return (
    p.discount * 2 +
    Math.min(p.orders, 5000) / 100 +
    (p.rating >= 95 ? 20 : p.rating >= 90 ? 10 : 0)
  );
}

/**
 * Gather a ranked list of fresh, filtered deals ready to post. Pulls from the
 * hot-products feed plus a rotating keyword search, dedupes, and ensures each
 * has a tracked affiliate link.
 *
 * @param {number} want how many posts we ultimately need
 */
export async function getDeals(want = 1, { attempts = 3 } = {}) {
  // Strict filters can empty a single keyword's pool, so try a few keywords.
  const chosen = [];
  const tried = new Set();
  for (let i = 0; i < attempts && chosen.length < want; i++) {
    let kw = pickKeyword();
    for (let j = 0; j < 5 && tried.has(kw); j++) kw = pickKeyword();
    tried.add(kw);
    const more = await getDealsForKeyword(want - chosen.length, kw, chosen);
    chosen.push(...more);
  }
  return chosen;
}

async function getDealsForKeyword(want, keyword, already = []) {
  const batches = [];

  // Hot products are the bread and butter.
  batches.push(
    queryHotProducts({
      keywords: keyword,
      categoryIds: config.targeting.categoryIds.join(',') || undefined,
      pageSize: 40,
    }).catch((e) => {
      console.warn('hotproduct.query failed:', e.message);
      return [];
    })
  );

  // A keyword search widens the pool and surfaces different inventory.
  if (keyword) {
    batches.push(
      queryProducts({ keywords: keyword, pageSize: 40 }).catch((e) => {
        console.warn('product.query failed:', e.message);
        return [];
      })
    );
  }

  const raw = (await Promise.all(batches)).flat();

  // Dedupe by product id, then filter and rank.
  const seen = new Set();
  const unique = [];
  for (const p of raw) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    p.keyword = keyword || '';
    unique.push(p);
  }

  const skip = new Set(already.map((p) => p.id));
  const candidates = unique
    .filter((p) => !skip.has(p.id))
    .filter(passesFilters)
    .sort((a, b) => score(b) - score(a));

  // Give each chosen deal a SHORT affiliate link. The query returns a
  // 1000+ char s.click.aliexpress.com/s/... link, but link.generate returns a
  // tidy s.click.aliexpress.com/e/_xxx one that carries the same tracking id.
  // We prefer the short link and keep the long query link only as a fallback.
  const chosen = [];
  for (const p of candidates) {
    if (chosen.length >= want) break;
    const cleanUrl = p.detailUrl.split('?')[0];
    try {
      const short = await generateAffiliateLink(cleanUrl);
      if (short) p.promotionLink = short;
    } catch (e) {
      console.warn(`link.generate failed for ${p.id}:`, e.message);
    }
    if (p.promotionLink || p.detailUrl) chosen.push(p);
  }

  return chosen;
}
