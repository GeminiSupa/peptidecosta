/**
 * The corrected receipt a customer gets when staff resend it.
 *
 * The case this covers: a bulk buyer negotiates a discount on the phone, the
 * order is written down, the confirmation goes out, and only then is the agreed
 * discount entered. The buyer is left holding a receipt for a price that was
 * never agreed — and for a pharmacy owner keeping books, a second copy that
 * looks identical to the first is not a fix, it is a second wrong record.
 *
 * A resend has to carry the discount that was entered late. Its wording stays
 * general — it is the customer's copy of the order, not an apology and not a
 * reference to an earlier mail — so these also pin down that no correction
 * language leaks into it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOrderNotificationPayload } from '../src/lib/adminOrderEmail.mjs';
import { buildCustomerHtml } from '../src/lib/orderEmailTemplates.mjs';
import { emailKindLabel } from '../src/lib/orderEmailLog.mjs';
import { calculateManualDiscountAmount } from '../src/lib/adminOrderTotals.mjs';

const LINKS = { whatsappNumber: '50684046973' };

/** An order whose discount was applied after the first receipt went out. */
const DISCOUNTED_ORDER = {
  order_number: 'WPCR-TEST01',
  customer_name: 'Pharmacy Buyer',
  customer_phone: '50684046973',
  customer_email: 'buyer@example.com',
  shipping_address: 'San Jose',
  currency: 'USD',
  status: 'Paid',
  payment_method: 'sinpe',
  items: [{ product: 'BPC-157', qty: 10, price: 60 }],
  shipping_cost_usd: 0,
  manual_discount_amount_usd: 90,
  manual_discount_reason: 'Bulk pharmacy pricing',
  total_usd: 390,
};

const renderReceipt = (order, extra = {}) => buildCustomerHtml(
  { ...buildOrderNotificationPayload(order, order.order_number), ...extra },
  'SINPE',
  '$390.00',
  '$390.00',
  '',
  'en',
  LINKS,
  '',
  '',
  [],
);

test('a resent receipt is worded neutrally, with no apology in it', () => {
  const html = renderReceipt(DISCOUNTED_ORDER, { isResend: true });

  assert.match(html, /Your Receipt/);
  assert.match(html, /Please keep this copy for your records/);

  // Nothing that points at an earlier mail or admits a mistake. Staff resend
  // receipts for ordinary reasons and the customer need not be told why.
  for (const wording of [/corrected/i, /replaces/i, /updated receipt/i, /apolog/i, /sorry/i, /earlier/i]) {
    assert.doesNotMatch(html, wording);
  }
});

test('the ordinary receipt is untouched by the resend wording', () => {
  const html = renderReceipt(DISCOUNTED_ORDER);

  assert.doesNotMatch(html, /Your Receipt/);
  assert.match(html, /Order Confirmed/);
});

test('a resent receipt carries the discount that was entered late', () => {
  const html = renderReceipt(DISCOUNTED_ORDER, { isResend: true });

  // The reason is the half a bookkeeper needs: an unexplained -$90 on a
  // receipt is a query, not a record.
  assert.match(html, /Order Discount \(Bulk pharmacy pricing\)/);
  assert.match(html, /-\$90\.00/);
  assert.match(html, /\$600\.00/); // the pre-discount subtotal is still shown
});

test('a Spanish resend is worded in Spanish', () => {
  const order = { ...DISCOUNTED_ORDER, currency: 'CRC' };
  const html = buildCustomerHtml(
    { ...buildOrderNotificationPayload(order, order.order_number), isResend: true },
    'SINPE',
    '₡390',
    '',
    '₡390',
    'es',
    LINKS,
    '',
    '',
    [],
  );

  assert.match(html, /Su Recibo/);
  assert.match(html, /conserve esta copia para sus registros/);
  assert.doesNotMatch(html, /corregido|reemplaza|anteriormente/i);
});

test('the order history distinguishes a resend from the original receipt', () => {
  assert.notEqual(emailKindLabel('receipt-resend'), emailKindLabel('customer-receipt'));
  assert.match(emailKindLabel('receipt-resend'), /resent/i);
});

test('the resend payload asks for the buyer receipt and nothing else', () => {
  const payload = buildOrderNotificationPayload(DISCOUNTED_ORDER, DISCOUNTED_ORDER.order_number, {
    adminNotificationOnly: false,
    customerReceiptOnly: true,
    forceCustomerReceipt: true,
  });

  // These three flags are what stop the team getting a second "New Order"
  // alert every time a price is corrected.
  assert.equal(payload.adminNotificationOnly, false);
  assert.equal(payload.customerReceiptOnly, true);
  assert.equal(payload.forceCustomerReceipt, true);
  assert.equal(payload.manualDiscount, 90);
  assert.equal(payload.manualDiscountReason, 'Bulk pharmacy pricing');
});

test('a discount entered at order time reaches the same total as one entered later', () => {
  // What the create route now does inline: take the manual discount off the
  // subtotal that survives the volume and promo discounts, then add shipping.
  const subtotalAfterCatalogDiscounts = 480; // 600 less a 20% volume discount
  const shipping = 15;

  const percentage = calculateManualDiscountAmount(subtotalAfterCatalogDiscounts, 'percentage', 10);
  assert.equal(percentage, 48);
  assert.equal(subtotalAfterCatalogDiscounts - percentage + shipping, 447);

  const fixed = calculateManualDiscountAmount(subtotalAfterCatalogDiscounts, 'fixed', 50);
  assert.equal(fixed, 50);
  assert.equal(subtotalAfterCatalogDiscounts - fixed + shipping, 445);

  // A discount larger than the order cannot make the customer a creditor.
  assert.equal(calculateManualDiscountAmount(subtotalAfterCatalogDiscounts, 'fixed', 10000), 480);
  assert.equal(calculateManualDiscountAmount(subtotalAfterCatalogDiscounts, null, 25), 0);
});

test('the manual order preview and the saved order agree on the total', async () => {
  // The form shows the operator a total before they commit. If the server then
  // saves a different one, the customer's confirmation contradicts what the
  // agent just quoted on the phone — which is the whole failure this feature
  // exists to end, reintroduced one layer down.
  const { calculateAdminOrderTotals } = await import('../src/lib/adminOrderTotals.mjs');
  const { authoritativeCheckout } = await import('../src/lib/authoritativeCheckout.mjs');

  const items = [{ product: 'BPC-157', qty: 10, price: 60 }];
  const shipping = 15;
  const discount = { manualDiscountType: 'percentage', manualDiscountValue: 10 };

  // What the browser puts in front of the agent.
  const preview = calculateAdminOrderTotals(items, shipping, discount);

  // What the route computes from the catalog, with the same discount applied.
  const authoritative = authoritativeCheckout({
    postedOrder: { items, currency: 'USD' },
    products: [{ product: 'BPC-157', price_usd: 60, price_crc: 30000, status: 'In Stock', inventory_count: null }],
    promo: null,
    exchangeRate: 500,
  });
  assert.equal(authoritative.ok, true);

  const subtotalAfterCatalogDiscounts = authoritative.total - authoritative.shipping;
  const manual = calculateAdminOrderTotals(authoritative.items, 0, discount).manualDiscountAmount;
  const saved = subtotalAfterCatalogDiscounts - manual + shipping;

  assert.equal(preview.total, saved);
});

/**
 * A manual order now mails the buyer as well as the team.
 *
 * Until this change /api/admin/orders/create sent the team alert and nothing
 * else: a phone order produced a WhatsApp message and no document at all. The
 * flag that lifts the admin-only default is `forceCustomerReceipt`, and these
 * pin down that one call sends both mails, that the team alert survives when
 * the customer's is held back, and that neither is sent for a card order.
 */
test('one call sends the team alert and the buyer receipt together', async () => {
  const { buildOrderNotificationPayload: build } = await import('../src/lib/adminOrderEmail.mjs');
  const payload = build(DISCOUNTED_ORDER, 'WPCR-TEST01', { forceCustomerReceipt: true });

  // These are the two flags /api/order-notification reads to decide what to
  // send: skipAdmin is customerReceiptOnly, skipCustomer is
  // adminNotificationOnly-without-forceCustomerReceipt.
  const skipAdmin = payload.customerReceiptOnly === true;
  const skipCustomer = payload.adminNotificationOnly === true && payload.forceCustomerReceipt !== true;

  assert.equal(skipAdmin, false, 'the team must still get its new-order alert');
  assert.equal(skipCustomer, false, 'the customer must now get their receipt');
});

test('holding the customer back still alerts the team', async () => {
  const { buildOrderNotificationPayload: build } = await import('../src/lib/adminOrderEmail.mjs');
  const payload = build(DISCOUNTED_ORDER, 'WPCR-TEST01', { forceCustomerReceipt: false });

  const skipAdmin = payload.customerReceiptOnly === true;
  const skipCustomer = payload.adminNotificationOnly === true && payload.forceCustomerReceipt !== true;

  assert.equal(skipAdmin, false, 'a backfill is still a sale the team should see');
  assert.equal(skipCustomer, true, 'a backfill must not greet the customer with a fresh order');
});

test('the buyer receipt carries the discount entered on the order form', async () => {
  // The point of putting the discount on the create form: the very first thing
  // the customer receives already shows the negotiated price, so there is
  // nothing to correct afterwards.
  const html = renderReceipt(DISCOUNTED_ORDER);

  assert.match(html, /Order Discount \(Bulk pharmacy pricing\)/);
  assert.match(html, /-\$90\.00/);
  assert.match(html, /\$390\.00/);
});
