# AliDealsBot

Autonomous Telegram bot that posts cheap AliExpress deals to a channel with your
affiliate links. It pulls trending / discounted products from the AliExpress
Affiliate API, filters them by price + discount + rating, builds a clean
Hebrew (or English) post with photo, price, strike-through, discount and order
count, attaches a **Buy on AliExpress** button with your tracking link, and avoids
ever posting the same product twice.

```
fetch hot/keyword deals  ->  filter (price/discount/rating/already-posted)
  ->  rank by discount+volume  ->  ensure affiliate link  ->  post photo+caption+button
```

## 1. What you need to give it

Everything goes into a `.env` file (copy `.env.example` to `.env`):

| Value | Where to get it |
|-------|-----------------|
| `ALI_APP_KEY`, `ALI_APP_SECRET` | https://portals.aliexpress.com -> log in -> API. (App key + secret) |
| `ALI_TRACKING_ID` | Portals dashboard -> Tracking IDs (a.k.a. PID). |
| `TG_BOT_TOKEN` | Talk to [@BotFather](https://t.me/BotFather) -> `/newbot` -> copy the token. |
| `TG_CHANNEL` | Your channel, e.g. `@mydeals` or the numeric `-100...` id. **Add the bot as an admin of the channel.** |

That's it. No code changes needed.

## 2. Setup

```bash
cd 07-Projects/AliDealsBot
npm install
cp .env.example .env      # then fill in the 6 values above
```

## 3. Verify the wiring

```bash
npm run test:tg     # confirms the bot token + channel + admin access
npm run test:ali    # confirms the AliExpress key/secret/PID and shows a sample product
```

## 4. Run it

```bash
# Post one batch right now (good for a first live test):
node src/index.js post --count 1

# Run forever on a schedule (default: every 3 hours, set by POST_CRON):
npm start
```

To keep it running on a server / Mac in the background:

```bash
nohup npm start > bot.log 2>&1 &
# or with pm2:  pm2 start "npm start" --name alideals
```

## 5. Tuning (all in `.env`, no code)

- `KEYWORDS` - rotating niches it searches each run.
- `CATEGORY_IDS` - optional AliExpress category ids to also pull hot products from.
- `MAX_PRICE` - only post deals at/under this price (in `TARGET_CURRENCY`).
- `MIN_DISCOUNT` - only post deals with at least this % off.
- `MIN_RATING` - drop low-rated products.
- `IMAGES_PER_POST` - `1` = single photo; `2-4` = a photo album of the product's
  extra shots, followed by the Buy button (Telegram albums can't hold buttons).
- `POSTS_PER_RUN` - how many deals per cycle.
- `POST_CRON` - posting schedule (cron syntax).
- `CAPTION_LANG` - `he` or `en`.
- `TARGET_CURRENCY` / `TARGET_LANGUAGE` / `SHIP_TO_COUNTRY` - storefront the prices/links are localized for.

## How it stays clean

- **No duplicates:** every posted product id is recorded in `data/posted.json`; it
  won't repost until ~5000 other deals have gone out.
- **Short, tracked links:** every deal is run through
  `aliexpress.affiliate.link.generate`, producing a tidy
  `s.click.aliexpress.com/e/_xxx` link (~42 chars) that carries your tracking id,
  instead of the 1000+ char link the catalog query returns.
- **Resilient posting:** if Telegram rejects a remote image, it falls back to a
  text post with a link preview so the deal still goes out.

## Files

```
src/
  config.js       env loading + validation
  aliexpress.js   signed Affiliate API client (hot/search/link.generate)
  telegram.js     channel posting (sendPhoto + inline button)
  format.js       Hebrew/English caption builder
  products.js     fetch -> filter -> rank -> ensure-link pipeline
  store.js        already-posted dedupe store
  run.js          one posting cycle
  index.js        CLI: post / schedule / test-ali / test-tg
test/selftest.mjs offline tests (signing, caption, filters)
```

Run the offline tests anytime with `node test/selftest.mjs`.
