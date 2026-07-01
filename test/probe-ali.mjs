// Standalone probe: verifies the AliExpress app_key + app_secret sign correctly
// and the gateway accepts them. Does NOT need a tracking ID. Read-only.
import 'dotenv/config';
import crypto from 'node:crypto';

const APP_KEY = process.env.ALI_APP_KEY;
const APP_SECRET = process.env.ALI_APP_SECRET;
const GATEWAY = process.env.ALI_GATEWAY || 'https://api-sg.aliexpress.com/sync';

function sign(params, secret) {
  const base = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha256', secret).update(base, 'utf8').digest('hex').toUpperCase();
}

const params = {
  app_key: APP_KEY,
  timestamp: String(Date.now()),
  sign_method: 'sha256',
  method: 'aliexpress.affiliate.hotproduct.query',
  keywords: 'phone',
  page_no: '1',
  page_size: '3',
  target_currency: 'ILS',
  target_language: 'EN',
  ship_to_country: 'IL',
};
params.sign = sign(params, APP_SECRET);

const res = await fetch(GATEWAY, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(params).toString(),
});
const json = await res.json();
console.log(JSON.stringify(json, null, 2).slice(0, 1500));
