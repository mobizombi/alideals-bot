import { getSettings, saveSettings, CATEGORIES } from './common.js';

const digestEnabled = document.getElementById('digestEnabled');
const digestHour = document.getElementById('digestHour');
const catsEl = document.getElementById('cats');
const saveBtn = document.getElementById('save');
const savedMsg = document.getElementById('saved');

for (let h = 0; h < 24; h++) {
  const opt = document.createElement('option');
  opt.value = String(h);
  opt.textContent = `${String(h).padStart(2, '0')}:00`;
  digestHour.appendChild(opt);
}

for (const c of CATEGORIES) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = c.slug;
  label.appendChild(input);
  label.appendChild(document.createTextNode(`${c.emoji} ${c.name}`));
  catsEl.appendChild(label);
}

async function load() {
  const s = await getSettings();
  digestEnabled.checked = s.dailyDigestEnabled;
  digestHour.value = String(s.digestHour);
  for (const input of catsEl.querySelectorAll('input')) {
    input.checked = s.categories.includes(input.value);
  }
}

saveBtn.addEventListener('click', async () => {
  const categories = [...catsEl.querySelectorAll('input:checked')].map((i) => i.value);
  await saveSettings({
    dailyDigestEnabled: digestEnabled.checked,
    digestHour: Number(digestHour.value),
    categories,
  });
  await chrome.runtime.sendMessage({ type: 'settings-changed' });
  savedMsg.hidden = false;
  setTimeout(() => (savedMsg.hidden = true), 1500);
});

load();
