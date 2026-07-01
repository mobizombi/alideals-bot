// Compare link formats: the long promotion_link from the query vs. what
// link.generate returns with different promotion_link_type values.
import crypto from 'node:crypto';
import { queryHotProducts } from '../src/aliexpress.js';
import { config } from '../src/config.js';

function sign(params, secret) {
  const base = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha256', secret).update(base, 'utf8').digest('hex').toUpperCase();
}

async function genLink(sourceUrl, type) {
  const params = {
    app_key: config.ali.appKey,
    timestamp: String(Date.now()),
    sign_method: 'sha256',
    method: 'aliexpress.affiliate.link.generate',
    promotion_link_type: String(type),
    source_values: sourceUrl,
    tracking_id: config.ali.trackingId,
  };
  params.sign = sign(params, config.ali.appSecret);
  const res = await fetch(config.ali.gateway, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const json = await res.json();
  const top = Object.entries(json).find(([k]) => k.endsWith('_response'))?.[1] ?? json;
  const links = top.resp_result?.result?.promotion_links?.promotion_link ?? [];
  const list = Array.isArray(links) ? links : [links];
  return { link: list[0]?.promotion_link || null, raw: JSON.stringify(json).slice(0, 200) };
}

const [p] = await queryHotProducts({ keywords: 'led lights', pageSize: 1 });
console.log('Detail URL:', p.detailUrl.split('?')[0]);
console.log('\nQuery promotion_link length:', (p.promotionLink || '').length, '\n', p.promotionLink?.slice(0, 90) + '...');

for (const type of [0, 2, 3]) {
  try {
    const r = await genLink(p.detailUrl.split('?')[0], type);
    console.log(`\nlink.generate type=${type}: len=${r.link ? r.link.length : 'null'}`);
    console.log('  ', r.link || r.raw);
  } catch (e) {
    console.log(`\nlink.generate type=${type} error:`, e.message);
  }
}
