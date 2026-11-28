import { config } from './config.js';
import { getDeals } from './products.js';
import { getAmazonDeals } from './amazon.js';
import { buildPost, buildAmazonPost } from './format.js';
import { postDeal } from './telegram.js';
import { postDealToFacebook } from './facebook.js';
import { markPosted, recordDeal, loadDeals } from './store.js';

// A "source" bundles where deals come from and how their post is built.
export const SOURCES = {
  ali: { label: 'AliExpress', fetch: getDeals, build: buildPost },
  amazon: { label: 'Amazon', fetch: getAmazonDeals, build: buildAmazonPost },
};

/**
 * Audit trail for each post: what Telegram actually stored (one message?
 * photo? button?) and whether the Buy link really lands on AliExpress.
 * Printed as an Actions annotation so it can be read via the GitHub API.
 */
async function reportPost(deal, msg, url) {
  const btn = msg?.reply_markup?.inline_keyboard?.[0]?.[0];
  let landing = 'unchecked';
  try {
    const r = await fetch(url, { redirect: 'manual' });
    landing = `${r.status} -> ${(r.headers.get('location') || '').slice(0, 80)}`;
  } catch (e) {
    landing = `error ${e.message}`;
  }
  const line =
    `tg message_id=${msg?.message_id} photo=${!!msg?.photo} album=${!!msg?.media_group_id} ` +
    `button="${btn?.text || 'NONE'}" button_url=${btn?.url || 'NONE'} landing=${landing} ` +
    `title=${(deal.title || '').slice(0, 70)}`;
  console.log(process.env.GITHUB_ACTIONS ? `::notice title=posted ${deal.id}::${line}` : `  ${line}`);
}

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
      const msg = await postDeal({
        image: deal.image,
        images: deal.images,
        caption,
        buttonText,
        followText,
        url,
      });
      markPosted(deal.id);
      recordDeal(deal, { source });
      posted += 1;
      console.log(`  ✓ posted ${deal.id} | ${deal.title.slice(0, 55)}`);
      await reportPost(deal, msg, url);

      // Mirror to the Facebook Page. Never let a FB error undo the Telegram
      // post that already went out - just log it and move on.
      try {
        const fb = await postDealToFacebook({ image: deal.image, images: deal.images, caption, url });
        if (!fb.skipped) console.log(`  ✓ mirrored ${deal.id} -> Facebook Page`);
      } catch (e) {
        console.warn(`  ✗ Facebook mirror failed for ${deal.id}: ${e.message}`);
      }
    } catch (e) {
      console.warn(`  ✗ failed to post ${deal.id}: ${e.message}`);
    }
    if (posted < count) await sleep(config.posting.delaySeconds * 1000);
  }

  console.log(`[${stamp}] [${src.label}] done. posted ${posted}/${count}.`);
  return posted;
}

/** Local {date: 'YYYY-MM-DD', hour, minute} for a Date in POST_TZ. */
function localParts(d = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: config.window.tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: +parts.hour, minute: +parts.minute };
}

/** The POST_SLOTS slot we are inside right now, or null. */
export function currentSlot(now = new Date()) {
  const { hour } = localParts(now);
  return config.posting.slots.find((s) => hour >= s.start && hour < s.end) || null;
}

/** How many deals already went out today inside this slot (from data/deals.json). */
function postedInSlot(slot, now = new Date()) {
  const today = localParts(now).date;
  return loadDeals().filter((d) => {
    if (!d.postedAt) return false;
    const p = localParts(new Date(d.postedAt));
    return p.date === today && p.hour >= slot.start && p.hour < slot.end;
  }).length;
}

/** Minutes left until the slot closes. */
function minutesLeft(slot, now = new Date()) {
  const { hour, minute } = localParts(now);
  return (slot.end - hour) * 60 - minute;
}

/**
 * Peak-time posting. GitHub's cron is throttled and often hours late, so we
 * do not rely on its timing: any run that lands inside a slot posts the
 * slot's REMAINING quota (counted from deals.json), spread evenly over the
 * time left, then exits. Later runs in the same slot find the quota met.
 */
export async function runSlots() {
  const slot = currentSlot();
  const stamp = new Date().toISOString();
  if (!slot) {
    const { hour } = localParts();
    console.log(`[${stamp}] not in a posting slot (local hour ${hour}, slots ${JSON.stringify(config.posting.slots)}); skipping.`);
    return 0;
  }
  let remaining = slot.quota - postedInSlot(slot);
  console.log(`[${stamp}] slot ${slot.start}-${slot.end} quota ${slot.quota}, remaining ${remaining}.`);
  let posted = 0;
  let misses = 0;
  while (remaining > 0 && minutesLeft(slot) > 0 && misses < 3) {
    const n = await runOnce(1, { force: true, source: 'ali' });
    if (n) { posted += n; remaining -= n; misses = 0; } else { misses += 1; }
    if (remaining <= 0) break;
    const left = minutesLeft(slot);
    const gap = Math.max(config.posting.minGapMinutes, Math.floor(left / (remaining + 1)));
    if (gap >= left) break;
    console.log(`  next post in ${gap} min (${remaining} left, ${left} min left in slot)`);
    await sleep(gap * 60 * 1000);
  }
  console.log(`[${new Date().toISOString()}] slot done. posted ${posted} this run.`);
  return posted;
}
