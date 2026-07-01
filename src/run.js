import { config } from './config.js';
import { getDeals } from './products.js';
import { getAmazonDeals } from './amazon.js';
import { buildPost, buildAmazonPost } from './format.js';
import { postDeal } from './telegram.js';
import { markPosted } from './store.js';

// A "source" bundles where deals come from and how their post is built.
export const SOURCES = {
  ali: { label: 'AliExpress', fetch: getDeals, build: buildPost },
  amazon: { label: 'Amazon', fetch: getAmazonDeals, build: buildAmazonPost },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Current hour (0-23) in the configured timezone, DST-aware. */
function localHour() {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.window.tz,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  return parseInt(h, 10);
}

/** Are we inside the allowed posting window right now? */
export function withinWindow() {
  const { start, end } = config.window;
  if (start <= 0 && end >= 24) return true; // 24h, no gate
  const h = localHour();
  return h >= start && h < end;
}

/**
 * Run one posting cycle: fetch fresh deals from a source and publish `count`
 * of them to the channel. Returns the number actually posted.
 *
 * @param {number} count how many to post
 * @param {{force?: boolean, source?: 'ali'|'amazon'}} opts
 *        force bypasses the active-hours window; source selects the feed.
 */
export async function runOnce(count = config.posting.perRun, { force = false, source = 'ali' } = {}) {
  const stamp = new Date().toISOString();
  const src = SOURCES[source] || SOURCES.ali;

  if (!force && !withinWindow()) {
    console.log(
      `[${stamp}] outside posting window ${config.window.start}:00-${config.window.end}:00 ${config.window.tz} (local hour ${localHour()}); skipping.`
    );
    return 0;
  }

  console.log(`\n[${stamp}] [${src.label}] fetching up to ${count} deal(s)...`);

  const deals = await src.fetch(count);
  if (!deals.length) {
    console.log(`No fresh ${src.label} deals available this run.`);
    return 0;
  }

  let posted = 0;
  for (const deal of deals) {
    if (posted >= count) break;
    const { caption, buttonText, followText, url } = src.build(deal);
    try {
      await postDeal({
        image: deal.image,
        images: deal.images,
        caption,
        buttonText,
        followText,
        url,
      });
      markPosted(deal.id);
      posted += 1;
      console.log(`  ✓ posted ${deal.id} | ${deal.title.slice(0, 55)}`);
    } catch (e) {
      console.warn(`  ✗ failed to post ${deal.id}: ${e.message}`);
    }
    if (posted < count) await sleep(config.posting.delaySeconds * 1000);
  }

  console.log(`[${stamp}] [${src.label}] done. posted ${posted}/${count}.`);
  return posted;
}
