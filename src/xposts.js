import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { getAmazonDeals } from './amazon.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'data', 'x-posts.html');

// X (free tier) caps tweets at 280 chars. We keep the hook short and put the
// affiliate link + disclosure at the end. No static price (Amazon compliance).
function tweetText(p) {
  const parts = [];
  if (p.note) parts.push(`🔥 ${p.note}`);
  parts.push(p.title);
  parts.push(`🛒 ${p.promotionLink}`);
  parts.push('#ad #AmazonFinds #דילים #אמזון');
  let t = parts.join('\n\n');
  // Trim the title if the whole thing runs past 280.
  if (t.length > 280) {
    const over = t.length - 280 + 1;
    p = { ...p, title: p.title.slice(0, Math.max(10, p.title.length - over)).trim() + '…' };
    return tweetText(p);
  }
  return t;
}

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function card(p) {
  const text = tweetText(p);
  return `
  <div class="card">
    <img src="${esc(p.image)}" alt="" loading="lazy" />
    <div class="body">
      <textarea readonly>${esc(text)}</textarea>
      <div class="row">
        <button onclick="copyText(this)">📋 העתק טקסט</button>
        <a class="btn" href="${esc(p.image)}" download target="_blank">⬇️ הורד תמונה</a>
        <a class="btn" href="${esc(p.promotionLink)}" target="_blank">🔗 בדוק לינק</a>
      </div>
    </div>
  </div>`;
}

export async function generateXPosts(count = 100) {
  const deals = await getAmazonDeals(count, { includePosted: true });
  if (!deals.length) {
    console.log('No Amazon products in the catalog. Add some to data/amazon-products.json first.');
    return null;
  }

  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>פוסטים מוכנים ל-X - Amazon (${config.amazon.tag})</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; background:#f2f4f7; margin:0; padding:24px; color:#111; }
  h1 { font-size:20px; }
  .note { background:#fff8e1; border:1px solid #ffe082; padding:12px 16px; border-radius:10px; font-size:14px; margin-bottom:20px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px; }
  .card { background:#fff; border:1px solid #e3e6ea; border-radius:14px; overflow:hidden; display:flex; flex-direction:column; }
  .card img { width:100%; height:220px; object-fit:contain; background:#fafafa; }
  .body { padding:12px; display:flex; flex-direction:column; gap:10px; }
  textarea { width:100%; box-sizing:border-box; height:130px; resize:vertical; border:1px solid #d0d5dd; border-radius:8px; padding:8px; font:inherit; font-size:13px; }
  .row { display:flex; gap:8px; flex-wrap:wrap; }
  button, .btn { cursor:pointer; border:0; border-radius:8px; padding:8px 12px; font-size:13px; text-decoration:none; color:#fff; background:#1d9bf0; display:inline-block; }
  .btn { background:#475467; }
  button.done { background:#12b76a; }
</style>
</head>
<body>
  <h1>פוסטים מוכנים ל-X.com - ${deals.length} מוצרי אמזון</h1>
  <div class="note">
    כל פוסט כבר כולל את לינק האפיליאט שלך (<b>tag=${esc(config.amazon.tag)}</b>) וגילוי נאות (#ad).
    לחצו "העתק טקסט", "הורד תמונה", ופרסמו ב-X עם התמונה מצורפת.
    מומלץ להוסיף פעם אחת ל-<b>ביו של X</b>: "As an Amazon Associate I earn from qualifying purchases".
  </div>
  <div class="grid">
    ${deals.map(card).join('\n')}
  </div>
<script>
  function copyText(btn){
    const ta = btn.closest('.card').querySelector('textarea');
    navigator.clipboard.writeText(ta.value).then(()=>{
      const t = btn.textContent; btn.textContent='✓ הועתק'; btn.classList.add('done');
      setTimeout(()=>{ btn.textContent=t; btn.classList.remove('done'); }, 1500);
    });
  }
</script>
</body>
</html>`;

  fs.writeFileSync(OUT, html);
  console.log(`Wrote ${deals.length} X-ready posts to:\n  ${OUT}`);
  console.log('Open it in a browser, copy each post, attach the image, and publish on X.com.');
  return OUT;
}
