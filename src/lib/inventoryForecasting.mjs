/**
 * Product Inventory Forecasting & Supplier Intelligence
 *
 * Calculates profit per vial, profit margin %, sales velocity (units/day),
 * estimated days until stockout, and supplier lead time reorder alerts.
 */

/**
 * Calculate profit per vial and profit margin percentage
 */
export function calculateProductProfit(priceUsd, costUsd, exchangeRate = 454.48) {
  const price = Math.max(0, parseFloat(String(priceUsd || '0').replace(/[^0-9.]/g, '')) || 0);
  const cost = Math.max(0, parseFloat(String(costUsd || '0').replace(/[^0-9.]/g, '')) || 0);

  const profitUsd = price - cost;
  const profitCrc = Math.round(profitUsd * exchangeRate);
  const marginPct = price > 0 ? Math.round((profitUsd / price) * 100) : 0;

  return {
    priceUsd: price,
    costUsd: cost,
    profitUsd,
    profitCrc,
    marginPct,
  };
}

/**
 * Extract items from order JSON or array
 */
function extractItems(order) {
  if (!order || !order.items) return [];
  if (Array.isArray(order.items)) return order.items;
  if (typeof order.items === 'string') {
    try {
      const parsed = JSON.parse(order.items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Calculate product sales velocity (units sold per day) over a window of days
 */
export function calculateSalesVelocity(productName, orders = [], daysWindow = 30, referenceDate = new Date()) {
  const refTime = (referenceDate instanceof Date ? referenceDate : new Date(referenceDate)).getTime();
  const windowMs = daysWindow * 24 * 60 * 60 * 1000;
  const targetName = String(productName || '').trim().toLowerCase();

  if (!targetName) {
    return { totalUnitsSold: 0, dailyVelocity: 0, daysWindow };
  }

  let totalUnitsSold = 0;

  orders.forEach((o) => {
    if (!o || o.status === 'Cancelled') return;
    const orderTime = new Date(o.created_at || Date.now()).getTime();
    if (isNaN(orderTime) || refTime - orderTime > windowMs) return;

    const items = extractItems(o);
    items.forEach((item) => {
      const name = String(item.product || item.name || '').trim().toLowerCase();
      if (name.includes(targetName) || targetName.includes(name)) {
        const qty = Math.max(1, Number(item.quantity || item.qty || 1));
        totalUnitsSold += qty;
      }
    });
  });

  const dailyVelocity = totalUnitsSold / daysWindow;

  return {
    totalUnitsSold,
    dailyVelocity: Math.round(dailyVelocity * 100) / 100, // 2 decimal places
    daysWindow,
  };
}

/**
 * Calculate stockout forecast, days until stockout, and supplier lead time alerts
 */
export function calculateStockoutForecast({
  inventoryCount,
  dailyVelocity = 0,
  supplierLeadTimeDays = 14,
  lowStockThreshold = 5,
  referenceDate = new Date(),
}) {
  const stock = inventoryCount !== null && inventoryCount !== undefined ? Math.max(0, Number(inventoryCount)) : null;
  const velocity = Math.max(0, Number(dailyVelocity) || 0);
  const leadTime = Math.max(1, Number(supplierLeadTimeDays) || 14);
  const threshold = Math.max(1, Number(lowStockThreshold) || 5);

  if (stock === null) {
    return {
      tracked: false,
      daysUntilStockout: null,
      alertStatus: 'untracked',
      statusText: 'Stock untracked',
      estimatedStockoutDate: null,
      suggestedReorderQty: 0,
    };
  }

  let daysUntilStockout = null;
  let estimatedStockoutDate = null;

  if (velocity > 0) {
    daysUntilStockout = Math.round((stock / velocity) * 10) / 10;
    const refMs = (referenceDate instanceof Date ? referenceDate : new Date(referenceDate)).getTime();
    estimatedStockoutDate = new Date(refMs + daysUntilStockout * 24 * 60 * 60 * 1000).toISOString();
  } else {
    daysUntilStockout = stock === 0 ? 0 : 999;
  }

  let alertStatus = 'healthy';
  let statusText = 'Stock Healthy';

  if (stock === 0) {
    alertStatus = 'out_of_stock';
    statusText = 'OUT OF STOCK';
  } else if (velocity > 0 && daysUntilStockout <= leadTime) {
    alertStatus = 'reorder_now';
    statusText = `REORDER NOW (${daysUntilStockout}d stock vs ${leadTime}d lead time)`;
  } else if (stock <= threshold) {
    alertStatus = 'low_stock';
    statusText = `Low Stock (${stock} left)`;
  } else if (velocity > 0) {
    statusText = `~${Math.round(daysUntilStockout)} days left`;
  }

  // Suggested reorder quantity = cover lead time + 30 days buffer
  const suggestedReorderQty = velocity > 0
    ? Math.max(10, Math.ceil(velocity * (leadTime + 30)))
    : 20;

  return {
    tracked: true,
    inventoryCount: stock,
    dailyVelocity: Math.round(velocity * 100) / 100,
    supplierLeadTimeDays: leadTime,
    daysUntilStockout,
    alertStatus, // 'out_of_stock' | 'reorder_now' | 'low_stock' | 'healthy'
    statusText,
    estimatedStockoutDate,
    suggestedReorderQty,
  };
}
