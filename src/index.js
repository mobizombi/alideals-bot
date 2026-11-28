#!/usr/bin/env node
import cron from 'node-cron';
import { config } from './config.js';
import { runOnce, runSlots } from './run.js';
import { getDeals } from './products.js';
import { buildPost } from './format.js';
import { checkChannel } from './telegram.js';
import { checkFacebook } from './facebook.js';
import { queryHotProducts } from './aliexpress.js';
import { postedCount } from './store.js';

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const cmd = process.argv[2] || 'post';

const commands = {
  // Peak-time mode (used by the GitHub Actions schedule): post the current
  // POST_SLOTS slot's remaining quota, spaced out, then exit.
  async slots() {
    await runSlots();
  },

  // Dry run: fetch + filter deals and print the exact captions. Posts nothing.
  async preview() {
    const n = Number(arg('--count', 5));
    const deals = await getDeals(n);
    console.log(`preview: ${deals.length} deal(s) pass the filters\n`);
    for (const d of deals) {
      const { caption, buttonText, url } = buildPost(d);
      console.log(`--- ${d.id} | ${d.discount}% off | rating ${d.rating} | ${d.orders} orders | ${d.keyword}`);
      console.log(caption);
      console.log(`[${buttonText}] -> ${url}\n`);
      // On Actions, also surface it as an annotation (readable via the API).
      if (process.env.GITHUB_ACTIONS) {
        const enc = (x) => String(x).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
        console.log(`::notice title=preview ${d.id}::${enc(`${caption}\n[${buttonText}] -> ${url}`)}`);
      }
    }
  },

  // Post N AliExpress deals right now (default N = POSTS_PER_RUN). --force
  // ignores the active-hours window (handy for a manual test outside 08:00-24:00).
  async post() {
    const n = Number(arg('--count', config.posting.perRun));
    const force = process.argv.includes('--force');
    await runOnce(n, { force, source: 'ali' });
  },

  // Post N curated Amazon products from data/amazon-products.json to Telegram.
  async amazon() {
    const n = Number(arg('--count', 1));
    const force = process.argv.includes('--force');
    await runOnce(n, { force, source: 'amazon' });
  },

  // Generate an HTML page of X.com-ready Amazon posts (bootstrap channel).
  async ['x-posts']() {
    const { generateXPosts } = await import('./xposts.js');
    await generateXPosts();
  },

  // Run forever on the configured cron schedule.
  async schedule() {
    if (!cron.validate(config.posting.cron)) {
      throw new Error(`Invalid POST_CRON: "${config.posting.cron}"`);
    }
    console.log(`Scheduler armed: "${config.posting.cron}" (${config.posting.perRun}/run).`);
    console.log(`Already posted historically: ${postedCount()} products.`);
    cron.schedule(config.posting.cron, () => {
      runOnce().catch((e) => console.error('run failed:', e.message));
    });
    // Fire once on boot so we don't wait for the first cron tick.
    await runOnce().catch((e) => console.error('initial run failed:', e.message));
  },

  // Verify the AliExpress credentials + see a sample product.
  async ['test-ali']() {
    console.log('Querying AliExpress hot products...');
    const products = await queryHotProducts({
      keywords: config.targeting.keywords[0],
      pageSize: 5,
    });
    console.log(`Got ${products.length} products. Sample:`);
    console.dir(products[0], { depth: null });
  },

  // Verify the Telegram bot + channel.
  async ['test-tg']() {
    const { bot, chat } = await checkChannel();
    console.log(`Bot: @${bot.username} (${bot.id})`);
    console.log(`Channel: ${chat.title || chat.username} (${chat.id}, type=${chat.type})`);
    console.log('Token + channel look good. Make sure the bot is an admin to post.');
  },

  // Verify the Facebook Page token can post.
  async ['test-fb']() {
    const { configured, page } = await checkFacebook();
    if (!configured) {
      console.log('Facebook not configured (FB_PAGE_ID / FB_PAGE_TOKEN unset). Cross-posting is off.');
      return;
    }
    console.log(`Facebook Page OK: ${page.name} (${page.id})`);
    console.log('Token is valid and can post. Deals will mirror to this Page.');
  },

  help() {
    console.log(`AliDealsBot

Usage:
  node src/index.js post [--count N]   Post N AliExpress deals now (default ${config.posting.perRun})
  node src/index.js amazon [--count N]  Post N curated Amazon products now
  node src/index.js x-posts             Build X.com-ready Amazon posts (HTML)
  node src/index.js schedule           Run forever on POST_CRON (${config.posting.cron})
  node src/index.js test-ali           Check AliExpress API + show a sample product
  node src/index.js test-tg            Check Telegram bot + channel access
  node src/index.js test-fb            Check Facebook Page token (cross-posting)
`);
  },
};

(async () => {
  const fn = commands[cmd] || commands.help;
  try {
    await fn();
    if (cmd !== 'schedule') process.exit(0);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
})();
