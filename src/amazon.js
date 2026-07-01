import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { wasPosted } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.join(__dirname, '..', 'data', 'amazon-products.json');

function loadCatalog() {
  try {
    const data = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
    return Array.isArray(data.products) ? data.products : [];
  } catch (e) {
    console.warn('Could not read amazon-products.json:', e.message);
    return [];
  }
}

/** Build a tagged affiliate URL for an ASIN. This is what earns the commission. */
export function amazonLink(asin) {
  return `https://${config.amazon.domain}/dp/${asin}/?tag=${config.amazon.tag}`;
}

/**
 * Normalize a curated catalog entry into the same product shape the rest of the
 * bot uses. Deliberately carries NO price/discount: Amazon's terms require any
 * displayed price to be pulled live via their API, so in manual mode we omit it
 * and let the live price show on Amazon after the click.
 */
function normalize(entry) {
  const images = [entry.image, ...(entry.images || [])].filter(Boolean);
  return {
    id: `AMZ-${entry.asin}`, // prefixed so it never collides with AliExpress ids
    asin: entry.asin,
    title: entry.title || '',
    image: entry.image || '',
    images,
    detailUrl: amazonLink(entry.asin),
    promotionLink: amazonLink(entry.asin),
    note: entry.note || '',
    category: entry.category || '',
    // no price / discount / rating in manual mode (see note above)
    price: 0,
    originalPrice: 0,
    discount: 0,
    rating: 0,
    orders: 0,
    currency: '',
  };
}

/**
 * Return up to `want` curated Amazon products in catalog order (so you control
 * priority by ordering the JSON). By default skips ones already posted to
 * Telegram; pass { includePosted: true } (used for the X generator, a separate
 * channel) to return everything.
 */
export async function getAmazonDeals(want = 1, { includePosted = false } = {}) {
  const all = loadCatalog()
    .filter((e) => e && e.asin && e.title && e.image)
    .map(normalize)
    .filter((p) => includePosted || !wasPosted(p.id));
  return all.slice(0, want);
}
