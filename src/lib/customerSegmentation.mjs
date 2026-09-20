/**
 * Customer Segmentation & Campaign Targeting Engine
 *
 * Groups customers into targeted segments for precision Email, SMS, and WhatsApp campaigns.
 */

export const CUSTOMER_SEGMENTS = [
  {
    key: 'weight_loss',
    label: 'Weight Loss',
    badgeTone: 'amber',
    icon: '⚖️',
    description: 'Purchased Semaglutide, Tirzepatide, Retatrutide, or GLP-1',
  },
  {
    key: 'recovery',
    label: 'Recovery / Injury',
    badgeTone: 'green',
    icon: '🩹',
    description: 'Purchased BPC-157, TB-500, or Healing protocols',
  },
  {
    key: 'anti_aging',
    label: 'Anti-Aging',
    badgeTone: 'purple',
    icon: '✨',
    description: 'Purchased GHK-Cu, CJC-1295, Ipamorelin, Sermorelin, or NAD+',
  },
  {
    key: 'first_time',
    label: 'First-Time Buyers',
    badgeTone: 'blue',
    icon: '🌟',
    description: 'Placed exactly 1 completed purchase',
  },
  {
    key: 'vip',
    label: 'VIP Customers',
    badgeTone: 'gold',
    icon: '👑',
    description: 'Spent $500+ or placed 3+ orders',
  },
  {
    key: 'wholesale',
    label: 'Wholesale & Doctors',
    badgeTone: 'indigo',
    icon: '🩺',
    description: 'Doctors, Pharmacies, or High-Volume Bulk Buyers',
  },
];

/**
 * Classify a customer into one or more matching segment keys
 */
export function getCustomerSegments(customer) {
  const segments = [];
  const items = [
    ...(customer.purchasedItems || []),
    ...(customer.cartItems ? customer.cartItems.map((i) => i.product || i.name || '') : []),
  ].map((i) => String(i || '').toLowerCase());

  // 1. Weight Loss (Semaglutide, Tirzepatide, Retatrutide, GLP-1)
  if (items.some((name) => name.includes('sema') || name.includes('tirz') || name.includes('retat') || name.includes('glp-1') || name.includes('glp1') || name.includes('ozempic') || name.includes('mounj'))) {
    segments.push('weight_loss');
  }

  // 2. Recovery / Injury (BPC-157, TB-500)
  if (items.some((name) => name.includes('bpc') || name.includes('157') || name.includes('tb-') || name.includes('tb500'))) {
    segments.push('recovery');
  }

  // 3. Anti-Aging (GHK-Cu, CJC-1295, Ipamorelin, Sermorelin, NAD+)
  if (items.some((name) => name.includes('ghk') || name.includes('cjc') || name.includes('ipam') || name.includes('sermor') || name.includes('nad'))) {
    segments.push('anti_aging');
  }

  // 4. First-Time Buyers
  if (!customer.isLead && (customer.orderCount === 1)) {
    segments.push('first_time');
  }

  // 5. VIP Customers
  if (!customer.isLead && ((customer.totalSpentUsd || 0) >= 500 || (customer.orderCount || 0) >= 3)) {
    segments.push('vip');
  }

  // 6. Wholesale & Doctors
  const isDoctorOrPharmacy = customer.segment?.label?.toLowerCase().includes('doctor') ||
                             customer.segment?.label?.toLowerCase().includes('pharmacy') ||
                             customer.name?.toLowerCase().includes('dr.') ||
                             customer.name?.toLowerCase().includes('doctor') ||
                             customer.name?.toLowerCase().includes('farmacia') ||
                             customer.name?.toLowerCase().includes('pharmacy') ||
                             (customer.latestTotalQty || 0) >= 5;
  if (isDoctorOrPharmacy) {
    segments.push('wholesale');
  }

  return segments;
}

/**
 * Filter customer array by target segment key
 */
export function filterCustomersBySegment(customers = [], segmentKey = 'all') {
  if (!segmentKey || segmentKey === 'all') return customers;

  return customers.filter((cust) => {
    const segs = getCustomerSegments(cust);
    return segs.includes(segmentKey);
  });
}
