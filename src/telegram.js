import { config } from './config.js';

const API = (token, method) => `https://api.telegram.org/bot${token}/${method}`;

async function tg(method, payload) {
  const res = await fetch(API(config.telegram.token, method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(
      `Telegram ${method} failed: [${json.error_code}] ${json.description}`
    );
  }
  return json.result;
}

/**
 * Post a deal. With several images and IMAGES_PER_POST > 1 it sends an album
 * (sendMediaGroup) carrying the caption on the first photo, then a short
 * follow-up message with the inline "Buy" button (media groups can't hold
 * buttons). Otherwise it sends a single photo with the button attached.
 */
export async function postDeal({ image, images, caption, buttonText, followText, url }) {
  const pics = (images && images.length ? images : [image]).filter(Boolean);
  const want = config.posting.imagesPerPost;

  if (want > 1 && pics.length > 1) {
    try {
      return await postAlbum({ pics: pics.slice(0, want), caption, buttonText, followText, url });
    } catch (err) {
      console.warn(`  album failed (${err.message}); falling back to single photo`);
      // fall through to single-photo path below
    }
  }
  return postSingle({ image: pics[0] || image, caption, buttonText, url });
}

async function postAlbum({ pics, caption, buttonText, followText, url }) {
  const media = pics.map((p, i) => ({
    type: 'photo',
    media: p,
    ...(i === 0 ? { caption, parse_mode: 'HTML' } : {}),
  }));
  await tg('sendMediaGroup', { chat_id: config.telegram.channel, media });
  return tg('sendMessage', {
    chat_id: config.telegram.channel,
    text: followText || buttonText,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: buttonText, url }]] },
  });
}

async function postSingle({ image, caption, buttonText, url }) {
  const reply_markup = {
    inline_keyboard: [[{ text: buttonText, url }]],
  };

  try {
    return await tg('sendPhoto', {
      chat_id: config.telegram.channel,
      photo: image,
      caption,
      parse_mode: 'HTML',
      reply_markup,
    });
  } catch (err) {
    // Telegram occasionally rejects a remote image (size/format/host). Fall
    // back to a text post so the deal still goes out.
    if (/photo|IMAGE|wrong file|failed to get/i.test(err.message)) {
      return tg('sendMessage', {
        chat_id: config.telegram.channel,
        text: caption,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
        reply_markup,
      });
    }
    throw err;
  }
}

/** Sanity check that the token + channel are valid and the bot can post. */
export async function checkChannel() {
  const me = await tg('getMe', {});
  const chat = await tg('getChat', { chat_id: config.telegram.channel });
  return { bot: me, chat };
}
