import { getCachedFeed, getSettings, saveSettings, money, clip, CATEGORIES } from './common.js';

const listEl = document.getElementById('list');
const catsEl = document.getElementById('cats');
const refreshBtn = document.getElementById('refresh');
const optionsLink = document.getElementById('openOptions');

let activeCat = 'all';

function dealCard(d) {
  const a = document.createElement('a');
  a.className = 'deal';
  a.href = d.url;
  a.target = '_blank';
  a.rel = 'sponsored nofollow noopener';

  const img = document.createElement('img');
  img.src = d.image;
  img.loading = 'lazy';
  img.alt = '';
  a.appendChild(img);

  const info = document.createElement('div');
  info.className = 'deal-info';

  const title = document.createElement('p');
  title.className = 'deal-title';
  title.textContent = clip(d.title, 80);
  info.appendChild(title);

  const price = document.createElement('p');
  price.className = 'deal-price';
  if (d.price != null) {
    price.textContent = money(d.price, d.currency);
    if (d.originalPrice > d.price) {
      const s = document.createElement('s');
      s.textContent = money(d.originalPrice, d.currency);
      price.appendChild(s);
    }
  } else {
    price.textContent = 'המחיר העדכני באתר';
  }
  if (d.discount >= 30) {
    const badge = document.createElement('span');
    badge.className = 'discount-badge';
    badge.textContent = `-${d.discount}%`;
    price.appendChild(badge);
  }
  info.appendChild(price);

  const meta = document.createElement('p');
  meta.className = 'deal-meta';
  const bits = [];
  if (d.orders) bits.push(`📦 ${Number(d.orders).toLocaleString('en-US')} הזמנות`);
  if (d.rating >= 90) bits.push(`⭐ ${Math.round(d.rating)}%`);
  meta.textContent = bits.join(' · ');
  info.appendChild(meta);

  a.appendChild(info);
  return a;
}

function renderCats() {
  catsEl.innerHTML = '';
  const all = document.createElement('button');
  all.textContent = 'הכל';
  all.className = activeCat === 'all' ? 'active' : '';
  all.addEventListener('click', () => { activeCat = 'all'; render(); });
  catsEl.appendChild(all);

  for (const c of CATEGORIES) {
    const btn = document.createElement('button');
    btn.textContent = `${c.emoji} ${c.name}`;
    btn.className = activeCat === c.slug ? 'active' : '';
    btn.addEventListener('click', () => { activeCat = c.slug; render(); });
    catsEl.appendChild(btn);
  }
}

async function render() {
  renderCats();
  const feed = await getCachedFeed();
  listEl.innerHTML = '';

  if (!feed.deals.length) {
    const p = document.createElement('p');
    p.className = 'state';
    p.textContent = 'אין דילים עדיין. נסו לרענן בעוד רגע.';
    listEl.appendChild(p);
    return;
  }

  const deals = activeCat === 'all' ? feed.deals : feed.deals.filter((d) => d.cat === activeCat);
  if (!deals.length) {
    const p = document.createElement('p');
    p.className = 'state';
    p.textContent = 'אין דילים בקטגוריה הזו כרגע.';
    listEl.appendChild(p);
    return;
  }

  for (const d of deals.slice(0, 30)) listEl.appendChild(dealCard(d));
}

refreshBtn.addEventListener('click', async () => {
  refreshBtn.disabled = true;
  await chrome.runtime.sendMessage({ type: 'refresh-feed' });
  await render();
  refreshBtn.disabled = false;
});

optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

render();
chrome.runtime.sendMessage({ type: 'mark-seen' });
