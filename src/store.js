import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'posted.json');

// Keep at most this many ids so a product can eventually be re-posted, but
// not for a long while.
const MAX = 5000;

function load() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.ids) ? data : { ids: [] };
  } catch {
    return { ids: [] };
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function wasPosted(id) {
  if (!id) return false;
  return load().ids.includes(String(id));
}

export function markPosted(id) {
  if (!id) return;
  const data = load();
  data.ids.push(String(id));
  if (data.ids.length > MAX) data.ids = data.ids.slice(-MAX);
  save(data);
}

export function postedCount() {
  return load().ids.length;
}
