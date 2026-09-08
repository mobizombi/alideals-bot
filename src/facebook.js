import { config } from './config.js';

// Cross-post a deal to a Facebook Page via the official Graph API.
// This mirrors what goes to Telegram: the same first image + caption + link.
// It is a no-op when FB is not configured, so the bot keeps working without it.

const GRAPH = 'https://graph.facebook.com/v21.0';

/** Turn the Telegram HTML caption into plain text Facebook can display. */
export function htmlToText(html) {
  if (!html) return '';
  return html
    // keep the visible text of links, drop the tag/href
    .replace(/<a\b[^>]*>(.*?)<\/a>/gis, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    // unescape the few HTML entities Telegram formatting introduces
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Publish one deal to the Facebook Page.
 *   - with an image -> a photo post (Page /photos, image fetched by FB from its URL)
 *   - without one    -> a text post (Page /feed)
 * Facebook Pages have no inline buttons, so the affiliate URL is appended to
 * the message as a plain (clickable) link.
 *
 * Returns { skipped: true } when FB isn't configured. Throws on API errors so
 * the caller can log them without aborting the Telegram post.
 */
export async function postDealToFacebook({ image, images, caption, url }) {
  const { pageId, token } = config.facebook;
  if (!token) return { skipped: true };

  // With a Page access token, "me" resolves to the Page itself, so an explicit
  // Page id is optional (and avoids New-Pages-Experience id mismatches).
  const target = pageId || 'me';
  const pic = (images && images.length ? images[0] : image) || null;
  let message = htmlToText(caption);
  if (url) message += `\n\n👉 ${url}`;

  const endpoint = pic ? `${GRAPH}/${target}/photos` : `${GRAPH}/${target}/feed`;
  const body = new URLSearchParams({ access_token: token });
  if (pic) {
    body.set('url', pic);
    body.set('caption', message);
  } else {
    body.set('message', message);
  }

  const res = await fetch(endpoint, { method: 'POST', body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const err = json.error || {};
    throw new Error(`Facebook ${pic ? 'photos' : 'feed'} failed: [${err.code ?? res.status}] ${err.message || res.statusText}`);
  }
  return json;
}

/** Sanity check that the Page token works and can post. */
export async function checkFacebook() {
  const { pageId, token } = config.facebook;
  if (!token) return { configured: false };
  const target = pageId || 'me';
  const res = await fetch(`${GRAPH}/${target}?fields=id,name&access_token=${encodeURIComponent(token)}`);
  const json = await res.json();
  if (json.error) throw new Error(`Facebook check failed: ${json.error.message}`);
  return { configured: true, page: json };
}
