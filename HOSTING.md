# Free hosting - GitHub Actions

The bot is a *scheduled* job (post a deal every few hours), so it doesn't need
an always-on server. GitHub Actions runs it for free, on schedule, forever - no
credit card, no server to keep alive, nothing to maintain.

- Schedule: 2 posts/hour, 08:00-24:00 Israel time (32 deals/day). The workflow
  fires every 30 min over a UTC window; the code gates each run to the exact
  Israel window (`Asia/Jerusalem`), so it stays correct across summer/winter DST.
- Dedupe (`data/posted.json`) is committed back after each run so deals never repeat.
- Secrets live in GitHub Secrets, never in the repo.
- Cost: ~34 runs/day x ~1.5 min = ~1,500 min/month. **Make the repo PUBLIC for
  unlimited free Actions minutes** (no secrets are in the code - they're in
  GitHub Secrets). A private repo also works but the 2,000 min/month free tier
  is borderline at this cadence.

## Option A - let Claude deploy it (fastest)

`gh` is already logged in as **mobizombi**. On your go-ahead Claude runs:

```bash
gh repo create alideals-bot --public --source . --push   # public = unlimited free minutes
gh secret set ALI_APP_KEY     -b '511064'
gh secret set ALI_APP_SECRET  -b '********'
gh secret set ALI_TRACKING_ID -b 'newtlgclde'
gh secret set TG_BOT_TOKEN    -b '********'
gh secret set TG_CHANNEL      -b '@israelfinds'
gh workflow run "Post AliExpress deal"   # one manual test run
```

That's the whole deploy. After it, the bot posts every 3 hours on its own.

## Option B - do it yourself

1. Create a new **private** repo on GitHub.
2. Push this folder to it (`git init && git add . && git commit && git push`).
3. Repo -> Settings -> Secrets and variables -> Actions -> add 5 secrets:
   `ALI_APP_KEY`, `ALI_APP_SECRET`, `ALI_TRACKING_ID`, `TG_BOT_TOKEN`, `TG_CHANNEL`.
4. Actions tab -> enable workflows -> Run workflow (manual test).
5. Done - it now runs on the cron schedule.

## Tuning after deploy

Edit the `env:` block in `.github/workflows/post.yml` (cadence via the `cron`
line, `POSTS_PER_RUN`, `MIN_DISCOUNT`, `KEYWORDS`, etc.), commit, push.

## Alternative host

**Oracle Cloud Always Free** gives a real always-on VM (run with `pm2`) - free
forever but needs a credit card for verification and more upkeep. Overkill for a
job that just fires every few hours; use it only if you later want the bot online
24/7 (e.g. responding to messages).
