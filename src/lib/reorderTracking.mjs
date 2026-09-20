/**
 * Reorder Tracking & Customer Pattern Intelligence
 *
 * Calculates customer purchasing cycles, estimated supply duration, predicted reorder dates,
 * and overdue alerts for strategic follow-ups (doctors, pharmacies, retail buyers).
 */

export const DEFAULT_PRODUCT_SUPPLY_DAYS = 30; // 30 days per unit default

/**
 * Standard product supply duration guidelines (in days per unit)
 */
export const PRODUCT_SUPPLY_MAP = {
  'glp-1': 30,
  'semaglutide': 30,
  'tirzepatide': 30,
  'retatrutide': 30,
  'bpc-157': 30,
  'tb-500': 30,
  'ghk-cu': 30,
  'cjc-1295': 30,
  'ipamorelin': 30,
  'nad+': 30,
};

/**
 * Helper to safely extract items array from order
 */
export function extractOrderItems(order) {
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
 * Estimate supply duration in days for a single order item
 */
export function estimateItemSupplyDays(productName, quantity = 1) {
  const name = String(productName || '').toLowerCase();
  let baseDays = DEFAULT_PRODUCT_SUPPLY_DAYS;

  for (const [key, days] of Object.entries(PRODUCT_SUPPLY_MAP)) {
    if (name.includes(key)) {
      baseDays = days;
      break;
    }
  }

  const qty = Math.max(1, Number(quantity) || 1);
  return baseDays * qty;
}

/**
 * Format date string into YYYY-MM-DD
 */
export function formatDateIso(dateInput) {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

/**
 * Customer identification key
 */
export function getCustomerKey(order) {
  if (!order) return 'unknown';
  const email = (order.customer_email || '').trim().toLowerCase();
  const phone = (order.customer_phone || '').replace(/\D/g, '');
  const name = (order.customer_name || '').trim().toLowerCase();
  return email || phone || name || 'unknown';
}

/**
 * Label customer pattern cycle based on average interval in days
 */
export function getIntervalPatternLabel(avgDays) {
  if (!avgDays || avgDays <= 0) return 'First Order';
  if (avgDays <= 10) return 'Weekly (~7d)';
  if (avgDays <= 18) return 'Bi-Weekly (~14d)';
  if (avgDays <= 35) return 'Monthly (~30d)';
  if (avgDays <= 50) return '6-Weeks (~42d)';
  return `Every ${Math.round(avgDays)} days`;
}

/**
 * Classify customer segment (Doctor, Pharmacy, Retail, Repeat)
 */
export function classifyCustomerSegment({ orderCount, avgIntervalDays, totalQty, maxSingleOrderQty }) {
  if (orderCount >= 2 && (maxSingleOrderQty >= 5 || totalQty >= 10)) {
    return { label: 'Doctor / Clinic', badgeTone: 'purple' };
  }
  if (orderCount >= 3 && avgIntervalDays > 0 && avgIntervalDays <= 14) {
    return { label: 'Pharmacy / Weekly', badgeTone: 'blue' };
  }
  if (avgIntervalDays >= 10 && avgIntervalDays <= 18) {
    return { label: 'Bi-Weekly Buyer', badgeTone: 'indigo' };
  }
  if (avgIntervalDays >= 25 && avgIntervalDays <= 35) {
    return { label: 'Monthly Retailer', badgeTone: 'teal' };
  }
  if (avgIntervalDays >= 36 && avgIntervalDays <= 50) {
    return { label: '6-Week Buyer', badgeTone: 'amber' };
  }
  if (orderCount >= 2) {
    return { label: 'Repeat Customer', badgeTone: 'green' };
  }
  return { label: 'New Customer', badgeTone: 'slate' };
}

/**
 * Core calculation function for Customer Reorder Intelligence
 */
export function calculateCustomerReorderStats(orders = [], customSupplyOverrides = {}, referenceDate = new Date()) {
  const now = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const refTime = now.getTime();

  // Group valid non-cancelled orders by customer
  const customerMap = {};

  orders.forEach((o) => {
    if (!o || o.status === 'Cancelled') return;
    const key = getCustomerKey(o);
    if (key === 'unknown') return;

    if (!customerMap[key]) {
      customerMap[key] = {
        key,
        customerName: o.customer_name || 'Customer',
        customerEmail: o.customer_email || '',
        customerPhone: o.customer_phone || '',
        whatsappWaId: o.whatsapp_wa_id || '',
        orders: [],
      };
    }

    // Keep contact details fresh
    if (o.customer_name) customerMap[key].customerName = o.customer_name;
    if (o.customer_email) customerMap[key].customerEmail = o.customer_email;
    if (o.customer_phone) customerMap[key].customerPhone = o.customer_phone;
    if (o.whatsapp_wa_id) customerMap[key].whatsappWaId = o.whatsapp_wa_id;

    customerMap[key].orders.push(o);
  });

  const results = [];

  Object.values(customerMap).forEach((cust) => {
    // Sort customer orders ascending by created_at
    const sortedOrders = [...cust.orders].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const orderCount = sortedOrders.length;
    const latestOrder = sortedOrders[sortedOrders.length - 1];
    const lastOrderDate = new Date(latestOrder.created_at);

    // Parse items for latest order & all-time items
    const latestItems = extractOrderItems(latestOrder);
    let latestTotalQty = 0;
    latestItems.forEach((i) => {
      latestTotalQty += Number(i.quantity || i.qty || 1);
    });

    let maxSingleOrderQty = 0;
    let allTimeTotalQty = 0;

    // Calculate historical order intervals
    const intervals = [];
    sortedOrders.forEach((ord, idx) => {
      const items = extractOrderItems(ord);
      let qtySum = 0;
      items.forEach((i) => { qtySum += Number(i.quantity || i.qty || 1); });
      allTimeTotalQty += qtySum;
      if (qtySum > maxSingleOrderQty) maxSingleOrderQty = qtySum;

      if (idx > 0) {
        const prevDate = new Date(sortedOrders[idx - 1].created_at);
        const currDate = new Date(ord.created_at);
        const diffDays = (currDate - prevDate) / (1000 * 60 * 60 * 24);
        if (diffDays > 0) intervals.push(diffDays);
      }
    });

    const avgIntervalDays = intervals.length
      ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
      : 0;

    // Determine estimated supply duration in days
    let estimatedSupplyDays = 0;
    if (customSupplyOverrides[cust.key] && Number(customSupplyOverrides[cust.key]) > 0) {
      estimatedSupplyDays = Number(customSupplyOverrides[cust.key]);
    } else if (orderCount >= 2 && avgIntervalDays > 0) {
      // Use historical average reorder interval
      estimatedSupplyDays = avgIntervalDays;
    } else {
      // Estimate based on product & quantity in latest order
      if (latestItems.length > 0) {
        latestItems.forEach((item) => {
          const name = item.product || item.name || '';
          const qty = Number(item.quantity || item.qty || 1);
          estimatedSupplyDays += estimateItemSupplyDays(name, qty);
        });
      } else {
        estimatedSupplyDays = DEFAULT_PRODUCT_SUPPLY_DAYS;
      }
    }

    // Clamp supply days to reasonable range [7, 180]
    estimatedSupplyDays = Math.max(7, Math.min(180, Math.round(estimatedSupplyDays)));

    // Predicted Reorder Date = lastOrderDate + estimatedSupplyDays
    const predictedReorderDate = new Date(lastOrderDate.getTime() + estimatedSupplyDays * 24 * 60 * 60 * 1000);
    const diffMs = refTime - predictedReorderDate.getTime();
    const diffDaysFloat = diffMs / (1000 * 60 * 60 * 24);
    const diffDays = Math.floor(diffDaysFloat);

    // Status: overdue (diffDays > 0), due_soon (predicted within next 7 days), on_track
    let alertStatus = 'on_track';
    let daysOverdue = 0;
    let daysUntilDue = 0;

    if (diffDays > 0) {
      alertStatus = 'overdue';
      daysOverdue = diffDays;
    } else {
      daysUntilDue = Math.abs(diffDays);
      if (daysUntilDue <= 7) {
        alertStatus = 'due_soon';
      }
    }

    const segment = classifyCustomerSegment({
      orderCount,
      avgIntervalDays,
      totalQty: allTimeTotalQty,
      maxSingleOrderQty,
    });

    const lastProductPurchased = latestItems.map((i) => `${i.quantity || i.qty || 1}x ${i.product || i.name}`).join(', ') || 'Peptides';

    results.push({
      customerKey: cust.key,
      customerName: cust.customerName,
      customerEmail: cust.customerEmail,
      customerPhone: cust.customerPhone,
      whatsappWaId: cust.whatsappWaId,
      orderCount,
      lastOrderDate: lastOrderDate.toISOString(),
      latestItems,
      latestTotalQty,
      lastProductPurchased,
      avgIntervalDays,
      intervalPattern: getIntervalPatternLabel(avgIntervalDays),
      estimatedSupplyDays,
      predictedReorderDate: predictedReorderDate.toISOString(),
      alertStatus, // 'overdue' | 'due_soon' | 'on_track'
      daysOverdue,
      daysUntilDue,
      segment,
      customOverride: Boolean(customSupplyOverrides[cust.key]),
    });
  });

  // Sort results: Overdue first (descending by days overdue), then Due Soon (ascending by days until due), then On Track
  return results.sort((a, b) => {
    if (a.alertStatus === 'overdue' && b.alertStatus !== 'overdue') return -1;
    if (a.alertStatus !== 'overdue' && b.alertStatus === 'overdue') return 1;

    if (a.alertStatus === 'overdue' && b.alertStatus === 'overdue') {
      return b.daysOverdue - a.daysOverdue;
    }

    if (a.alertStatus === 'due_soon' && b.alertStatus !== 'due_soon') return -1;
    if (a.alertStatus !== 'due_soon' && b.alertStatus === 'due_soon') return 1;

    return new Date(a.predictedReorderDate) - new Date(b.predictedReorderDate);
  });
}

/**
 * Generate customized WhatsApp strategic reorder follow-up message
 */
export function buildReorderFollowupScript({ customerName, lastProductPurchased, alertStatus, daysOverdue, daysUntilDue, estimatedSupplyDays }) {
  const firstName = (customerName || '').trim().split(' ')[0] || 'there';
  const productLine = lastProductPurchased ? `your supply of ${lastProductPurchased}` : 'your previous order';

  if (alertStatus === 'overdue') {
    return `Hi ${firstName}, this is Peptides Costa Rica! Based on your last order, ${productLine} was estimated for ${estimatedSupplyDays} days of supply. We wanted to check in and see if you need to restock local Costa Rica inventory so your protocol isn't interrupted. Would you like me to check stock availability and current pricing for you?`;
  }

  if (alertStatus === 'due_soon') {
    return `Hi ${firstName}, quick check-in from Peptides Costa Rica. Your supply of ${lastProductPurchased} is coming up for reorder in about ${daysUntilDue} days. Let us know if you'd like to reserve your next batch with fast local delivery!`;
  }

  return `Hi ${firstName}, this is Peptides Costa Rica following up on ${productLine}. Please let us know whenever you are ready for your next order or if you need updated COA documentation!`;
}
