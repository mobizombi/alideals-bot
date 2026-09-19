// Static site generator for the deals website.
// Reads data/deals.json (written by the bot on every post) + site/content.mjs
// and writes a complete Hebrew RTL site to dist/.
//
//   SITE_BASE   path prefix the site is served under ("/" on a custom domain)
//   SITE_URL    absolute origin+base, used for canonical + sitemap
//   SITE_INDEX  "1" lets search engines index. Keep off on the temp address.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CATEGORIES, GUIDES } from './content.mjs';
import { loadDeals } from '../src/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');

const BASE = (process.env.SITE_BASE || '/alideals-bot/').replace(/\/?$/, '/');
const SITE_URL = (process.env.SITE_URL || `https://mobizombi.github.io${BASE}`).replace(/\/?$/, '/');
const INDEXABLE = process.env.SITE_INDEX === '1';
const BRAND = 'מציאון';
const TG_URL = 'https://t.me/israelfinds';
const NOW = Date.now();

// ---------- helpers ----------
const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const href = (p = '') => BASE + p.replace(/^\//, '');
const abs = (p = '') => SITE_URL + p.replace(/^\//, '');
const clip = (t, n = 70) => (t.length > n ? `${t.slice(0, n - 1).trim()}…` : t);
const money = (n) => `₪${Number(n).toFixed(2)}`;
const thumb = (url) => (/\.(jpe?g|png|webp)$/i.test(url) ? `${url}_350x350.jpg` : url);

function ago(iso) {
  const days = Math.floor((NOW - Date.parse(iso)) / 86400000);
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days < 30) return `לפני ${days} ימים`;
  return 'לפני יותר מחודש';
}

function categoryOf(d) {
  const byKw = CATEGORIES.find((c) => c.keywords.includes(d.keyword));
  if (byKw) return byKw.slug;
  return CATEGORIES.find((c) => c.match.test(d.title))?.slug || 'home';
}

const score = (d) =>
  (d.discount || 0) * 2 + Math.min(d.orders || 0, 20000) / 400 + ((d.rating || 0) >= 95 ? 15 : 0);

// ---------- data ----------
const deals = loadDeals()
  .filter((d) => d.url && d.image && d.title)
  .map((d) => ({ ...d, cat: categoryOf(d) }))
  .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));

const recent = (list, days) => list.filter((d) => NOW - Date.parse(d.postedAt) < days * 86400000);
const inCats = (cats) => (cats.length ? deals.filter((d) => cats.includes(d.cat)) : deals);

// ---------- components ----------
function dealCard(d) {
  const hasPrice = d.price != null;
  return `<article class="deal">
  <a class="deal-img" href="${esc(d.url)}" target="_blank" rel="sponsored nofollow noopener">
    <img src="${esc(thumb(d.image))}" alt="${esc(clip(d.title, 90))}" loading="lazy" width="350" height="350">
    ${d.discount >= 40 ? `<span class="badge">-${d.discount}%</span>` : ''}
  </a>
  <div class="deal-body">
    <h3 class="deal-title" dir="ltr">${esc(clip(d.title))}</h3>
    ${
      hasPrice
        ? `<p class="price"><b>${money(d.price)}</b>${d.originalPrice > d.price ? ` <s>${money(d.originalPrice)}</s>` : ''}</p>`
        : `<p class="price muted">המחיר העדכני באתר</p>`
    }
    <p class="meta">${d.orders ? `📦 ${Number(d.orders).toLocaleString('en-US')} הזמנות` : ''}${
      d.rating >= 90 ? ` · ⭐ ${Math.round(d.rating)}%` : ''
    }</p>
    <a class="btn" href="${esc(d.url)}" target="_blank" rel="sponsored nofollow noopener">${
      d.source === 'amazon' ? 'לדיל באמזון' : 'לדיל באליאקספרס'
    }</a>
    <p class="stamp">נמצא ${ago(d.postedAt)} · המחיר עשוי להשתנות</p>
  </div>
</article>`;
}

const dealGrid = (list) =>
  list.length
    ? `<div class="grid">${list.map(dealCard).join('\n')}</div>`
    : `<p class="empty">דילים חדשים בדרך. בינתיים, <a href="${TG_URL}">הצטרפו לערוץ</a>.</p>`;

const tgBox = (title = 'רוצים את הדילים לפני כולם?') => `<aside class="tg">
  <div><strong>${title}</strong><p>כל יום עולים לערוץ הטלגרם שלנו דילים חדשים שעברו סינון לפי הנחה, דירוג ומספר הזמנות.</p></div>
  <a class="btn btn-tg" href="${TG_URL}" target="_blank" rel="noopener">הצטרפו לערוץ בטלגרם</a>
</aside>`;

const guideCard = (g) => `<a class="guide-card" href="${href(`guides/${g.slug}/`)}">
  <span class="guide-emoji">${g.emoji}</span>
  <strong>${esc(g.short)}</strong>
  <span class="muted">${esc(g.description)}</span>
</a>`;

const chips = (active) => `<nav class="chips" aria-label="קטגוריות">${CATEGORIES.map(
  (c) =>
    `<a class="chip${c.slug === active ? ' on' : ''}" href="${href(`deals/${c.slug}/`)}">${c.emoji} ${c.name}</a>`
).join('')}</nav>`;

function layout({ title, description, path: p, body, jsonld = [] }) {
  const full = p === '' ? `${BRAND} - דילים שווים מעליאקספרס, נבחרים כל יום` : `${title} | ${BRAND}`;
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">
${INDEXABLE ? '' : '<meta name="robots" content="noindex, follow">\n'}<link rel="canonical" href="${abs(p)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="he_IL">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${abs(p)}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛍️</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${href('assets/style.css')}">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head>
<body>
<header class="top">
  <div class="wrap top-in">
    <a class="logo" href="${href('')}">🛍️ ${BRAND}</a>
    <nav class="nav">
      <a href="${href('deals/')}">דילים</a>
      <a href="${href('guides/')}">מדריכים</a>
      <a href="${href('extension/')}">🧩 תוסף Chrome</a>
      <a class="nav-tg" href="${TG_URL}" target="_blank" rel="noopener">טלגרם</a>
    </nav>
  </div>
</header>
<main class="wrap">
${body}
</main>
<footer class="foot">
  <div class="wrap">
    <p><strong>${BRAND}</strong> - דילים שווים מעליאקספרס ואמזון, נבחרים כל יום.</p>
    <p class="muted">גילוי נאות: חלק מהקישורים באתר הם קישורי שותפים. אם תקנו דרכם, ייתכן שנקבל עמלה קטנה, בלי שום תוספת למחיר שלכם. המחירים מתעדכנים באתרי החנויות ועשויים להשתנות.</p>
    <p><a href="${href('about/')}">אודות</a> · <a href="${href('privacy/')}">פרטיות</a> · <a href="${TG_URL}" target="_blank" rel="noopener">ערוץ הטלגרם</a></p>
  </div>
</footer>
</body>
</html>`;
}

// ---------- pages ----------
const pages = [];
const add = (p, html) => pages.push({ p, html });

// Home
{
  const latest = deals.slice(0, 24);
  const top = [...recent(deals, 7)].sort((a, b) => score(b) - score(a)).slice(0, 8);
  add(
    '',
    layout({
      title: BRAND,
      path: '',
      description:
        'מציאון מסנן כל יום אלפי מוצרים מאליאקספרס ומעלה רק דילים עם הנחה גדולה, דירוג גבוה והרבה הזמנות. ועוד מדריכי קנייה בעברית.',
      jsonld: [
        { '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, url: abs(''), inLanguage: 'he' },
      ],
      body: `<section class="hero">
  <h1>הדילים הכי שווים מעליאקספרס,<br>נבחרים בשבילכם כל יום</h1>
  <p>אנחנו סורקים אלפי מוצרים ומעלים רק את מה שעבר סינון: הנחה של 40% ומעלה, דירוג גבוה והרבה קונים מרוצים. בלי חיפושים, בלי הפתעות.</p>
  <div class="hero-cta">
    <a class="btn btn-tg" href="${TG_URL}" target="_blank" rel="noopener">הצטרפו לערוץ בטלגרם</a>
    <a class="btn btn-ghost" href="${href('extension/')}">🧩 התקינו את תוסף Chrome</a>
    <a class="btn btn-ghost" href="${href('guides/how-to-buy-aliexpress-israel/')}">איך קונים באליאקספרס בלי להתאכזב</a>
  </div>
</section>
${chips()}
${top.length ? `<h2 class="sec">🔥 הכי שווים השבוע</h2>${dealGrid(top)}` : ''}
<h2 class="sec">🆕 דילים אחרונים</h2>
${dealGrid(latest)}
<p class="more"><a href="${href('deals/')}">לכל הדילים לפי קטגוריה ←</a></p>
${tgBox()}
<h2 class="sec">📚 מדריכי קנייה</h2>
<div class="guides">${GUIDES.map(guideCard).join('')}</div>`,
    })
  );
}

// Deals index + category hubs
add(
  'deals/',
  layout({
    title: 'כל הדילים לפי קטגוריה',
    path: 'deals/',
    description: 'דילים מעליאקספרס לפי קטגוריה: מטבח, רכב, תאורה, שעונים חכמים, אביזרים לטלפון, בית וכלי עבודה.',
    body: `<h1 class="page-h">כל הדילים לפי קטגוריה</h1>
${chips()}
${CATEGORIES.map((c) => {
  const list = deals.filter((d) => d.cat === c.slug).slice(0, 8);
  if (!list.length) return '';
  return `<h2 class="sec">${c.emoji} ${c.name}</h2>${dealGrid(list)}<p class="more"><a href="${href(`deals/${c.slug}/`)}">לכל הדילים ב${c.name} ←</a></p>`;
}).join('\n')}
${tgBox()}`,
  })
);

for (const c of CATEGORIES) {
  const list = deals.filter((d) => d.cat === c.slug).slice(0, 60);
  const guide = GUIDES.find((g) => g.slug === c.guide);
  add(
    `deals/${c.slug}/`,
    layout({
      title: `דילים ב${c.name} מעליאקספרס`,
      path: `deals/${c.slug}/`,
      description: c.intro,
      body: `<h1 class="page-h">${c.emoji} דילים ב${c.name} מעליאקספרס</h1>
<p class="lead">${esc(c.intro)}</p>
${guide ? `<p class="guide-link">📚 לפני שקונים: <a href="${href(`guides/${guide.slug}/`)}">${esc(guide.short)}</a></p>` : ''}
${chips(c.slug)}
${dealGrid(list)}
${tgBox()}`,
    })
  );
}

// Guides
add(
  'guides/',
  layout({
    title: 'מדריכי קנייה',
    path: 'guides/',
    description: 'מדריכי קנייה בעברית לאליאקספרס: מה שווה לקנות, ממה להיזהר, ואיך לבחור נכון.',
    body: `<h1 class="page-h">📚 מדריכי קנייה</h1>
<p class="lead">מה שווה לקנות, ממה להתרחק, ואיך לא להתאכזב. כל מדריך כולל גם דילים מעודכנים מהקטגוריה.</p>
<div class="guides">${GUIDES.map(guideCard).join('')}</div>
${tgBox()}`,
  })
);

for (const g of GUIDES) {
  const pool = inCats(g.categories);
  const fresh = recent(pool, 45);
  const picks = [...(fresh.length >= 6 ? fresh : pool)].sort((a, b) => score(b) - score(a)).slice(0, 6);
  const mid = Math.ceil(g.sections.length / 2);
  const section = (s) => `<h2>${s.h}</h2>\n${s.p.map((x) => `<p>${x}</p>`).join('\n')}`;
  const others = GUIDES.filter((x) => x.slug !== g.slug).slice(0, 3);

  add(
    `guides/${g.slug}/`,
    layout({
      title: g.title,
      path: `guides/${g.slug}/`,
      description: g.description,
      jsonld: [
        {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: g.title,
          description: g.description,
          inLanguage: 'he',
          dateModified: new Date(NOW).toISOString().slice(0, 10),
          publisher: { '@type': 'Organization', name: BRAND },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: g.faq.map(([q, a]) => ({
            '@type': 'Question',
            name: q,
            acceptedAnswer: { '@type': 'Answer', text: a },
          })),
        },
      ],
      body: `<article class="guide">
<p class="crumbs"><a href="${href('')}">ראשי</a> / <a href="${href('guides/')}">מדריכים</a></p>
<h1>${g.emoji} ${esc(g.title)}</h1>
<p class="lead">${g.lead}</p>
<nav class="toc"><strong>במדריך:</strong><ol>${g.sections.map((s) => `<li>${s.h}</li>`).join('')}</ol></nav>
${g.sections.slice(0, mid).map(section).join('\n')}
${picks.length ? `<h2>🔥 דילים שווים ${g.categories.length ? 'מהקטגוריה' : 'מהשבוע'} עכשיו</h2>${dealGrid(picks)}` : ''}
${g.sections.slice(mid).map(section).join('\n')}
${tgBox('לא רוצים לחפש לבד?')}
<h2>שאלות נפוצות</h2>
<div class="faq">${g.faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
${g.categories.map((slug) => {
  const c = CATEGORIES.find((x) => x.slug === slug);
  return `<p class="more"><a href="${href(`deals/${slug}/`)}">לכל הדילים ב${c.name} ←</a></p>`;
}).join('')}
<h2>מדריכים נוספים</h2>
<div class="guides">${others.map(guideCard).join('')}</div>
</article>`,
    })
  );
}

// About + privacy
add(
  'about/',
  layout({
    title: 'אודות',
    path: 'about/',
    description: `מי אנחנו ואיך ${BRAND} בוחר את הדילים.`,
    body: `<article class="guide">
<h1>אודות ${BRAND}</h1>
<p class="lead">${BRAND} נולד מערוץ טלגרם שמטרתו פשוטה: לחסוך לכם את השעות של גלילה באליאקספרס.</p>
<h2>איך אנחנו בוחרים דילים</h2>
<p>כל יום אנחנו סורקים אלפי מוצרים בקטגוריות שאנשים באמת קונים, ומעלים רק מוצרים שעומדים בכמה תנאים: הנחה של 40% ומעלה, מחיר נמוך יחסית, דירוג קונים גבוה, והרבה הזמנות קודמות. מוצר שכבר הופיע לא חוזר שוב.</p>
<h2>גילוי נאות</h2>
<p>הקישורים לחנויות הם קישורי שותפים. כשאתם קונים דרכם, החנות משלמת לנו עמלה קטנה, והמחיר שלכם נשאר בדיוק אותו מחיר. זה מה שמאפשר לנו להמשיך להפעיל את האתר ואת הערוץ בחינם.</p>
<h2>לגבי מחירים</h2>
<p>המחיר שמופיע ליד כל דיל הוא המחיר בזמן שהדיל נמצא. מחירים ומבצעים באליאקספרס משתנים לעיתים קרובות, ולכן המחיר הקובע הוא תמיד המחיר שמופיע באתר החנות ברגע הקנייה.</p>
${tgBox()}
</article>`,
  })
);

add(
  'extension/',
  layout({
    title: 'תוסף Chrome - דילים יומיים בסרגל הכלים',
    path: 'extension/',
    description: `תוסף Chrome חינמי של ${BRAND}: הדיל הכי חם כל יום, ישר מסרגל הכלים. בלי הרשמה, בלי איסוף מידע אישי.`,
    body: `<article class="guide">
<h1>🧩 תוסף Chrome של ${BRAND}</h1>
<p class="lead">רואים את הדילים הכי חמים ישר מסרגל הכלים של הדפדפן, בלי לפתוח את האתר כל פעם. חינמי, בלי הרשמה, ובלי איסוף מידע אישי.</p>

<div class="guide-link">
  <p style="margin:0 0 10px"><strong>שימו לב:</strong> התוסף עדיין לא ב-Chrome Web Store, אז ההתקנה היא ידנית (2 דקות, חד-פעמי). זה בטוח לגמרי - התוסף בקוד פתוח וניתן לבדיקה.</p>
  <a class="btn btn-tg" href="${href('metziaon-extension.zip')}" download>⬇️ הורדת התוסף (ZIP)</a>
</div>

<h2>מה מקבלים</h2>
<ul>
  <li>🔥 <strong>פופאפ עם הדילים הכי טריים</strong> - ישר מסרגל הכלים, בלי לפתוח לשונית חדשה.</li>
  <li>🔔 <strong>התראה יומית אחת</strong> עם הדיל הכי חם (אפשר לכבות בהגדרות בכל רגע).</li>
  <li>🏷️ <strong>תג קטן בדפי מוצר באליאקספרס</strong> אם המוצר כבר מופיע אצלנו בדילים - בלי לשלוח שום מידע לשום שרת.</li>
</ul>

<h2>איך מתקינים (2 דקות)</h2>
<ol>
  <li>לוחצים על "הורדת התוסף" למעלה, ומחלצים (Extract / פתיחת קובץ ה-ZIP) את התיקייה שהתקבלה.</li>
  <li>פותחים בכרום את הכתובת <code>chrome://extensions</code>.</li>
  <li>מפעילים <strong>מצב מפתח</strong> (Developer mode) - מתג בפינה הימנית העליונה.</li>
  <li>לוחצים <strong>טעינת תוסף בלתי ארוז</strong> (Load unpacked) ובוחרים את התיקייה <code>chrome-extension</code> שחילצתם.</li>
  <li>זהו - האייקון של ${BRAND} מופיע בסרגל הכלים.</li>
</ol>

<h2>שאלות נפוצות</h2>
<div class="faq">
<details><summary>למה זה לא זמין ישירות מ-Chrome Web Store?</summary><p>עדיין לא פרסמנו את התוסף לחנות של גוגל. ההתקנה הידנית לוקחת 2 דקות, ואם ולכשנעלה אותו לחנות, כל מי שהתקין כבר ימשיך לקבל עדכונים כרגיל.</p></details>
<details><summary>האם התוסף אוסף עליי מידע?</summary><p>לא. אין הרשמה, אין איסוף מידע אישי ואין מעקב אחרי הגלישה. התוסף שולף פיד דילים ציבורי מהאתר, ושומר את ההעדפות שלכם (קטגוריות, שעת התראה) מקומית בדפדפן בלבד.</p></details>
<details><summary>איך מסירים את התוסף?</summary><p>נכנסים ל-<code>chrome://extensions</code>, מוצאים את ${BRAND} ולוחצים "הסר".</p></details>
</div>
${tgBox('רוצים גם את הדילים בטלגרם?')}
</article>`,
  })
);

add(
  'privacy/',
  layout({
    title: 'מדיניות פרטיות',
    path: 'privacy/',
    description: `מדיניות הפרטיות של ${BRAND}.`,
    body: `<article class="guide">
<h1>מדיניות פרטיות</h1>
<p>האתר לא מבקש מכם להירשם ולא אוסף פרטים אישיים כמו שם, טלפון או כתובת מייל.</p>
<p>כשאתם לוחצים על קישור לחנות, אתם עוברים לאתר של החנות (כמו אליאקספרס או אמזון), שעשוי להשתמש בעוגיות כדי לשייך את הקנייה לקישור השותפים. השימוש באתרים האלה כפוף למדיניות הפרטיות שלהם.</p>
<p>ייתכן שנשתמש בכלי סטטיסטיקה בסיסיים כדי להבין אילו עמודים מעניינים את הגולשים, בלי לזהות אתכם אישית.</p>
</article>`,
  })
);

// ---------- write ----------
fs.rmSync(OUT, { recursive: true, force: true });
for (const { p, html } of pages) {
  const file = path.join(OUT, p, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
fs.copyFileSync(path.join(__dirname, 'style.css'), path.join(OUT, 'assets', 'style.css'));

fs.writeFileSync(
  path.join(OUT, '404.html'),
  layout({
    title: 'העמוד לא נמצא',
    path: '404.html',
    description: 'העמוד לא נמצא',
    body: `<section class="hero"><h1>העמוד לא נמצא</h1><p>אולי הדיל כבר נגמר. <a href="${href('')}">חזרה לדילים האחרונים</a></p></section>`,
  })
);

const today = new Date(NOW).toISOString().slice(0, 10);
fs.writeFileSync(
  path.join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
    .map(({ p }) => `  <url><loc>${abs(p)}</loc><lastmod>${today}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`
);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${abs('sitemap.xml')}\n`);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

// Public, no-secrets JSON feed for the "מציאון" Chrome extension. Same data
// that's already public on the website, just trimmed + machine-readable.
// GitHub Pages serves this with permissive CORS, so the extension can fetch
// it directly from chrome://extension code without a backend.
const FEED_LIMIT = 60;
const feed = {
  generatedAt: new Date(NOW).toISOString(),
  siteUrl: SITE_URL,
  deals: deals.slice(0, FEED_LIMIT).map((d) => ({
    id: d.id,
    title: d.title,
    image: thumb(d.image),
    url: d.url,
    price: d.price ?? null,
    originalPrice: d.originalPrice ?? null,
    currency: d.currency || 'ILS',
    discount: d.discount || 0,
    rating: d.rating ?? null,
    orders: d.orders ?? null,
    postedAt: d.postedAt,
    cat: d.cat,
    source: d.source || 'ali',
  })),
};
fs.writeFileSync(path.join(OUT, 'feed.json'), JSON.stringify(feed));

// Downloadable ZIP of the Chrome extension, linked from /extension/, so
// people can install it before it's on the Chrome Web Store.
const EXT_DIR = path.join(ROOT, 'chrome-extension');
if (fs.existsSync(EXT_DIR)) {
  try {
    execFileSync('zip', ['-rq', path.join(OUT, 'metziaon-extension.zip'), 'chrome-extension'], {
      cwd: ROOT,
    });
  } catch (err) {
    console.warn('could not zip chrome-extension (zip not installed?) -', err.message);
  }
}

console.log(`built ${pages.length} pages from ${deals.length} deals -> dist/ (base ${BASE}, indexable=${INDEXABLE})`);
