import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateExpandedSalesMetrics } from '../src/lib/salesAnalytics.mjs';
import { getCustomerSegments, filterCustomersBySegment } from '../src/lib/customerSegmentation.mjs';

test('calculateExpandedSalesMetrics computes today, month, LTV, AOV and inventory valuation', () => {
  const refDate = new Date('2026-09-20T12:00:00Z');

  const sampleOrders = [
    {
      id: 'ord-1',
      customer_email: 'doc@clinic.cr',
      created_at: '2026-09-20T10:00:00Z', // Today
      items: [{ product: 'Semaglutide 10mg', qty: 2, price: 125 }],
      total_usd: 250,
      status: 'Completed',
    },
    {
      id: 'ord-2',
      customer_email: 'doc@clinic.cr',
      created_at: '2026-09-05T10:00:00Z', // Earlier this month
      items: [{ product: 'BPC-157 5mg', qty: 2, price: 65 }],
      total_usd: 130,
      status: 'Completed',
    },
  ];

  const sampleProducts = [
    { product: 'Semaglutide 10mg', inventoryCount: 10, costUsd: 35, priceUsd: 125 },
    { product: 'BPC-157 5mg', inventoryCount: 20, costUsd: 15, priceUsd: 65 },
  ];

  const metrics = calculateExpandedSalesMetrics(sampleOrders, sampleProducts, 454.48, refDate);

  assert.equal(metrics.revenueTodayUsd, 250);
  assert.equal(metrics.revenueMonthUsd, 380);
  assert.equal(metrics.totalRevenueUsd, 380);
  assert.equal(metrics.paidOrdersCount, 2);
  assert.equal(metrics.aovUsd, 190); // 380 / 2 orders
  assert.equal(metrics.ltvUsd, 380); // 380 / 1 customer
  assert.equal(metrics.repeatCustomerPct, 100); // 1 customer with 2 orders = 100%

  // Inventory Valuation
  // Cost value = 10*35 + 20*15 = 350 + 300 = 650
  // Retail value = 10*125 + 20*65 = 1250 + 1300 = 2550
  assert.equal(metrics.inventoryCostValueUsd, 650);
  assert.equal(metrics.inventoryRetailValueUsd, 2550);
});

test('getCustomerSegments classifies customer groups accurately', () => {
  const weightLossCustomer = {
    purchasedItems: ['Semaglutide 10mg'],
    orderCount: 1,
    totalSpentUsd: 125,
  };

  const vipDoctor = {
    name: 'Dr. Santos',
    purchasedItems: ['BPC-157 5mg', 'GLP-1 10mg'],
    orderCount: 4,
    totalSpentUsd: 850,
  };

  const segs1 = getCustomerSegments(weightLossCustomer);
  assert.ok(segs1.includes('weight_loss'));
  assert.ok(segs1.includes('first_time'));

  const segs2 = getCustomerSegments(vipDoctor);
  assert.ok(segs2.includes('weight_loss'));
  assert.ok(segs2.includes('recovery'));
  assert.ok(segs2.includes('vip'));
  assert.ok(segs2.includes('wholesale'));
});
