#!/usr/bin/env node
import cron from 'node-cron';
import { config } from './config.js';
import { runOnce } from './run.js';
import { checkChannel } from './telegram.js';
import { queryHotProducts } from './aliexpress.js';
import { postedCount } from './store.js';

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const cmd = process.argv[2] || 'post';

const commands = {
  // Post N deals right now (default N = POSTS_PER_RUN). --force ignores the
  // active-hours window (handy for a manual test outside 08:00-24:00).
  async post() {
    const n = Number(arg('--count', config.posting.perRun));
    const force = process.argv.includes('--force');
    await runOnce(n, { force });
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

  help() {
    console.log(`AliDealsBot

Usage:
  node src/index.js post [--count N]   Post N deals now (default ${config.posting.perRun})
  node src/index.js schedule           Run forever on POST_CRON (${config.posting.cron})
  node src/index.js test-ali           Check AliExpress API + show a sample product
  node src/index.js test-tg            Check Telegram bot + channel access
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
