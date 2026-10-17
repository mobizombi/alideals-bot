// Lightweight, privacy-safe helper: checks the current AliExpress product id
// against the deals feed already cached locally by the background worker.
// No network calls happen here and nothing about the page is sent anywhere.

(function () {
  const match = location.pathname.match(/\/item\/(\d+)\.html/);
  if (!match) return;
  const productId = match[1];

  chrome.storage.local.get('feed', ({ feed }) => {
    const deal = feed?.deals?.find((d) => d.id === productId);
    if (!deal) return;
    showBadge(deal);
  });

  function showBadge(deal) {
    if (document.getElementById('metziaon-badge')) return;

    const box = document.createElement('div');
    box.id = 'metziaon-badge';

    const text = document.createElement('span');
    const discountPart = deal.discount ? ` · ${deal.discount}% הנחה במעקב שלנו` : '';
    text.textContent = `🛍️ המוצר הזה מופיע במציאון${discountPart}`;
    box.appendChild(text);

    const close = document.createElement('button');
    close.textContent = '✕';
    close.setAttribute('aria-label', 'סגירה');
    close.addEventListener('click', () => box.remove());
    box.appendChild(close);

    document.body.appendChild(box);
    setTimeout(() => box.classList.add('metziaon-show'), 50);
  }
})();
