// Verify the full affiliate flow: query with tracking_id, then confirm a
// tracked promotion link is produced (this is what earns the commission).
import { queryHotProducts, generateAffiliateLink } from '../src/aliexpress.js';

const products = await queryHotProducts({ keywords: 'kitchen gadgets', pageSize: 5 });
console.log(`Got ${products.length} products.`);
const p = products[0];
if (!p) process.exit(0);

console.log('\nSample product:');
console.log('  title   :', p.title.slice(0, 60));
console.log('  price   :', p.price, p.currency, '| was', p.originalPrice, '| -' + p.discount + '%');
console.log('  images  :', p.images.length);
console.log('  promoLink (from query):', p.promotionLink || '(none returned)');

const link = p.promotionLink || (await generateAffiliateLink(p.detailUrl));
console.log('\nFinal affiliate link:', link);
console.log(
  link && /s\.click\.aliexpress|tracking|aff/i.test(link)
    ? '  ✓ looks like a tracked affiliate link'
    : '  ⚠ check whether this carries your PID'
);
