import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateProductProfit,
  calculateSalesVelocity,
  calculateStockoutForecast,
} from '../src/lib/inventoryForecasting.mjs';

test('calculateProductProfit computes correct profit and margin %', () => {
  const result = calculateProductProfit(125, 35);
  assert.equal(result.priceUsd, 125);
  assert.equal(result.costUsd, 35);
  assert.equal(result.profitUsd, 90);
  assert.equal(result.marginPct, 72); // (90 / 125) * 100 = 72%
});

test('calculateSalesVelocity sums quantities over specified window', () => {
  const refDate = new Date('2026-09-20T12:00:00Z');
  const sampleOrders = [
    {
      created_at: '2026-09-10T10:00:00Z', // 10 days ago
      items: [{ product: 'Semaglutide 10mg', qty: 6 }],
      status: 'Completed',
    },
    {
      created_at: '2026-09-15T10:00:00Z', // 5 days ago
      items: [{ product: 'Semaglutide 10mg', qty: 9 }],
      status: 'Completed',
    },
  ];

  const velocity = calculateSalesVelocity('Semaglutide', sampleOrders, 30, refDate);
  assert.equal(velocity.totalUnitsSold, 15);
  assert.equal(velocity.dailyVelocity, 0.5); // 15 units / 30 days = 0.5 units/day
});

test('calculateStockoutForecast triggers reorder_now alert when days left <= supplier lead time', () => {
  const refDate = new Date('2026-09-20T12:00:00Z');

  // Case 1: 5 units in stock, velocity = 0.5 units/day => 10 days left.
  // Supplier Lead Time = 14 days => REORDER NOW! (10d < 14d)
  const forecast1 = calculateStockoutForecast({
    inventoryCount: 5,
    dailyVelocity: 0.5,
    supplierLeadTimeDays: 14,
    lowStockThreshold: 5,
    referenceDate: refDate,
  });

  assert.equal(forecast1.daysUntilStockout, 10);
  assert.equal(forecast1.alertStatus, 'reorder_now');
  assert.match(forecast1.statusText, /REORDER NOW/);

  // Case 2: 20 units in stock, velocity = 0.5 units/day => 40 days left.
  // Supplier Lead Time = 14 days => Healthy (40d > 14d)
  const forecast2 = calculateStockoutForecast({
    inventoryCount: 20,
    dailyVelocity: 0.5,
    supplierLeadTimeDays: 14,
    lowStockThreshold: 5,
    referenceDate: refDate,
  });

  assert.equal(forecast2.daysUntilStockout, 40);
  assert.equal(forecast2.alertStatus, 'healthy');
});
