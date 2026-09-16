import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'posted.json');

// Keep at most this many ids so a product can eventually be re-posted, but
// not for a long while.
const MAX = 5000;

function load() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.ids) ? data : { ids: [] };
  } catch {
    return { ids: [] };
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function wasPosted(id) {
  if (!id) return false;
  return load().ids.includes(String(id));
}

export function markPosted(id) {
  if (!id) return;
  const data = load();
  data.ids.push(String(id));
  if (data.ids.length > MAX) data.ids = data.ids.slice(-MAX);
  save(data);
}

export function postedCount() {
  return load().ids.length;
}

// Full deal records for the website (data/deals.json). posted.json stays the
// lean dedupe list; this keeps what the site needs to render a deal card.
const DEALS_FILE = path.join(__dirname, '..', 'data', 'deals.json');
const DEALS_MAX = 1500;

export function loadDeals() {
  try {
    const data = JSON.parse(fs.readFileSync(DEALS_FILE, 'utf8'));
    return Array.isArray(data.deals) ? data.deals : [];
  } catch {
    return [];
  }
}

export function recordDeal(deal, { source = 'ali', postedAt = new Date().toISOString() } = {}) {
  if (!deal?.id) return;
  const deals = loadDeals().filter((d) => d.id !== String(deal.id));
  deals.push({
    id: String(deal.id),
    source,
    title: deal.title,
    image: deal.image,
    url: deal.promotionLink || deal.detailUrl,
    price: deal.price ?? null,
    originalPrice: deal.originalPrice ?? null,
    currency: deal.currency ?? null,
    discount: deal.discount ?? 0,
    rating: deal.rating ?? 0,
    orders: deal.orders ?? 0,
    keyword: deal.keyword ?? '',
    postedAt,
  });
  const trimmed = deals.slice(-DEALS_MAX);
  fs.mkdirSync(path.dirname(DEALS_FILE), { recursive: true });
  fs.writeFileSync(DEALS_FILE, JSON.stringify({ deals: trimmed }, null, 1));
}
