import crypto from 'node:crypto';
import { config } from './config.js';

/**
 * Client for the AliExpress Affiliate (Open Platform / IOP "system") API.
 *
 * Signing follows the documented IOP algorithm for the /sync gateway:
 *   1. collect every request param (system + business)
 *   2. sort keys ascending
 *   3. concatenate key+value pairs into one string (no separators)
 *   4. HMAC-SHA256 that string with the app secret, hex, UPPERCASE
 *
 * Docs: https://openservice.aliexpress.com  (Affiliate API group)
 */

function sign(params, secret) {
  const base = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');
  return crypto
    .createHmac('sha256', secret)
    .update(base, 'utf8')
    .digest('hex')
    .toUpperCase();
}

async function call(method, businessParams = {}) {
  const sysParams = {
    app_key: config.ali.appKey,
    timestamp: String(Date.now()),
    sign_method: 'sha256',
    method,
  };

  // Drop undefined/null/'' business params so they don't break the signature.
  const clean = {};
  for (const [k, v] of Object.entries(businessParams)) {
    if (v !== undefined && v !== null && `${v}` !== '') clean[k] = `${v}`;
  }

  const all = { ...sysParams, ...clean };
  all.sign = sign(all, config.ali.appSecret);

  const body = new URLSearchParams(all).toString();
  const res = await fetch(config.ali.gateway, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`AliExpress returned non-JSON for ${method}: ${text.slice(0, 300)}`);
  }

  if (json.error_response) {
    const e = json.error_response;
    throw new Error(
      `AliExpress API error on ${method}: [${e.code}] ${e.msg || ''} ${e.sub_msg || ''}`.trim()
    );
  }

  return json;
}

/**
 * Dig through the (deeply nested + inconsistently named) response envelope
 * to reach the array of product records, whatever this method calls it.
 */
function extractProducts(json) {
  // Find the first *_response key (e.g. aliexpress_affiliate_hotproduct_query_response)
  const top =
    Object.entries(json).find(([k]) => k.endsWith('_response'))?.[1] ?? json;

  const result = top.resp_result?.result ?? top.result ?? top;
  const container = result.products ?? result.product ?? {};
  const arr = container.product ?? container ?? [];
  return Array.isArray(arr) ? arr : arr ? [arr] : [];
}

/** Hot / trending affiliate products, optionally filtered by price + category. */
export async function queryHotProducts({
  keywords,
  categoryIds,
  pageNo = 1,
  pageSize = 30,
  sort = 'LAST_VOLUME_DESC',
} = {}) {
  const { targeting, ali } = config;
  const json = await call('aliexpress.affiliate.hotproduct.query', {
    keywords,
    category_ids: categoryIds,
    page_no: pageNo,
    page_size: pageSize,
    sort,
    max_sale_price:
      targeting.maxPrice != null ? Math.round(targeting.maxPrice * 100) : undefined, // API wants cents
    tracking_id: ali.trackingId,
    target_language: targeting.language,
    target_currency: targeting.currency,
    ship_to_country: targeting.shipTo,
  });
  return extractProducts(json).map(normalize);
}

/** Keyword search across the affiliate catalog. */
export async function queryProducts({
  keywords,
  categoryIds,
  pageNo = 1,
  pageSize = 30,
  sort = 'LAST_VOLUME_DESC',
} = {}) {
  const { targeting, ali } = config;
  const json = await call('aliexpress.affiliate.product.query', {
    keywords,
    category_ids: categoryIds,
    page_no: pageNo,
    page_size: pageSize,
    sort,
    max_sale_price:
      targeting.maxPrice != null ? Math.round(targeting.maxPrice * 100) : undefined,
    tracking_id: ali.trackingId,
    target_language: targeting.language,
    target_currency: targeting.currency,
    ship_to_country: targeting.shipTo,
  });
  return extractProducts(json).map(normalize);
}

/** Turn a raw product/detail URL into a tracked affiliate promotion link. */
export async function generateAffiliateLink(sourceUrl) {
  const json = await call('aliexpress.affiliate.link.generate', {
    promotion_link_type: 0,
    source_values: sourceUrl,
    tracking_id: config.ali.trackingId,
  });
  const top =
    Object.entries(json).find(([k]) => k.endsWith('_response'))?.[1] ?? json;
  const links =
    top.resp_result?.result?.promotion_links?.promotion_link ??
    top.result?.promotion_links?.promotion_link ??
    [];
  const list = Array.isArray(links) ? links : [links];
  return list[0]?.promotion_link || null;
}

/** Flatten the AliExpress field zoo into a clean, predictable shape. */
function normalize(p) {
  const price = Number(p.target_sale_price ?? p.sale_price ?? p.app_sale_price ?? 0);
  const original = Number(
    p.target_original_price ?? p.original_price ?? p.target_app_sale_price ?? price
  );
  const discountRaw = p.discount ?? '';
  let discount = parseInt(String(discountRaw).replace('%', ''), 10);
  if (!Number.isFinite(discount) && original > price && original > 0) {
    discount = Math.round((1 - price / original) * 100);
  }
  if (!Number.isFinite(discount)) discount = 0;

  const mainImage = p.product_main_image_url ?? p.productMainImageUrl ?? '';
  // The catalog returns extra shots under product_small_image_urls.string.
  const small =
    p.product_small_image_urls?.string ??
    p.product_small_image_urls ??
    p.productSmallImageUrls?.string ??
    [];
  const smallArr = Array.isArray(small) ? small : small ? [small] : [];
  const images = [...new Set([mainImage, ...smallArr].filter(Boolean))];

  return {
    id: String(p.product_id ?? p.productId ?? ''),
    title: p.product_title ?? p.productTitle ?? '',
    image: mainImage,
    images,
    detailUrl: p.product_detail_url ?? p.productDetailUrl ?? '',
    promotionLink: p.promotion_link ?? p.promotionLink ?? '',
    price,
    originalPrice: original,
    currency: p.target_sale_price_currency ?? config.targeting.currency,
    discount,
    rating: Number(p.evaluate_rate ? String(p.evaluate_rate).replace('%', '') : 0),
    orders: Number(p.lastest_volume ?? p.latest_volume ?? 0),
    store: p.shop_name ?? p.second_level_category_name ?? '',
  };
}
