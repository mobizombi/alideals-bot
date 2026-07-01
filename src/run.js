import { config } from './config.js';
import { getDeals } from './products.js';
import { buildPost } from './format.js';
import { postDeal } from './telegram.js';
import { markPosted } from './store.js';

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
 * Run one posting cycle: fetch the best fresh deals and publish `count` of
 * them to the channel. Returns the number actually posted.
 *
 * @param {number} count how many to post
 * @param {{force?: boolean}} opts force bypasses the active-hours window
 */
export async function runOnce(count = config.posting.perRun, { force = false } = {}) {
  const stamp = new Date().toISOString();

  if (!force && !withinWindow()) {
    console.log(
      `[${stamp}] outside posting window ${config.window.start}:00-${config.window.end}:00 ${config.window.tz} (local hour ${localHour()}); skipping.`
    );
    return 0;
  }

  console.log(`\n[${stamp}] fetching up to ${count} deal(s)...`);

  const deals = await getDeals(count);
  if (!deals.length) {
    console.log('No fresh deals matched the filters this run.');
    return 0;
  }

  let posted = 0;
  for (const deal of deals) {
    if (posted >= count) break;
    const { caption, buttonText, followText, url } = buildPost(deal);
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
      console.log(
        `  ✓ posted ${deal.id} | ${deal.discount}% off | ${deal.price} ${deal.currency} | ${deal.title.slice(0, 50)}`
      );
    } catch (e) {
      console.warn(`  ✗ failed to post ${deal.id}: ${e.message}`);
    }
    if (posted < count) await sleep(config.posting.delaySeconds * 1000);
  }

  console.log(`[${stamp}] done. posted ${posted}/${count}.`);
  return posted;
}
