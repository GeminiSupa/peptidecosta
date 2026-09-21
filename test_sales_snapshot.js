import { buildWhatsAppSalesSnapshot } from './src/lib/whatsappSales.mjs';

const products = [];
const promos = [
  { code: 'PUBLIC20', discount_pct: 0.20, is_active: true, hidden: false, valid_until: new Date(Date.now() + 100000).toISOString() },
  { code: 'HIDDEN10', discount_pct: 0.10, is_active: true, hidden: true, issued_to: 'phone:12345678', valid_until: new Date(Date.now() + 100000).toISOString() },
  { code: 'OTHER10', discount_pct: 0.10, is_active: true, hidden: true, issued_to: 'phone:87654321', valid_until: new Date(Date.now() + 100000).toISOString() }
];

const customerKeys = ['phone:12345678'];

const snapshot = buildWhatsAppSalesSnapshot({ products, promos, customerKeys });
console.log(JSON.stringify(snapshot, null, 2));
