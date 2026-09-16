// One-off: fill data/deals.json with a starter batch so the site isn't empty
// on launch. Does NOT post to Telegram and does NOT mark ids as posted.
// Usage: node site/seed.mjs [perKeyword]
import { config } from '../src/config.js';
import { queryProducts, queryHotProducts, generateAffiliateLink } from '../src/aliexpress.js';
import { loadDeals, recordDeal } from '../src/store.js';

const KEYWORDS = [
  'kitchen gadgets', 'car accessories', 'led lights', 'smart watch',
  'phone accessories', 'home decor', 'tools',
];
const per = Number(process.argv[2] || 12);
const have = new Set(loadDeals().map((d) => d.id));
const { maxPrice, minDiscount, minRating } = config.targeting;

let added = 0;
for (const keyword of KEYWORDS) {
  const raw = [
    ...(await queryHotProducts({ keywords: keyword, pageSize: 40 }).catch(() => [])),
    ...(await queryProducts({ keywords: keyword, pageSize: 40 }).catch(() => [])),
  ];
  const seen = new Set();
  const picks = raw
    .filter((p) => {
      if (!p.id || seen.has(p.id) || have.has(p.id)) return false;
      seen.add(p.id);
      if (!p.image || !(p.price > 0)) return false;
      if (maxPrice != null && p.price > maxPrice) return false;
      if (minDiscount != null && p.discount < minDiscount) return false;
      if (minRating != null && p.rating > 0 && p.rating < minRating) return false;
      return true;
    })
    .sort((a, b) => b.orders - a.orders)
    .slice(0, per);

  for (const p of picks) {
    try {
      const short = await generateAffiliateLink(p.detailUrl.split('?')[0]);
      if (short) p.promotionLink = short;
    } catch {}
    p.keyword = keyword;
    recordDeal(p);
    have.add(p.id);
    added += 1;
  }
  console.log(`${keyword}: +${picks.length}`);
}
console.log(`seeded ${added} deals`);
