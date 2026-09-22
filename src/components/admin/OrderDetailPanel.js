'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Copy, Mail, Phone, Plus, Trash2, BadgePercent } from 'lucide-react';
import { formatActivityType } from '@/lib/orderActivity';
import { formatCrInstant } from '@/lib/crTime.mjs';
import { adminFetch } from '@/lib/adminApi';
import { confirmCustomerEmail } from '@/lib/confirmCustomerEmail.mjs';
import ProductCombobox from './ProductCombobox';
import AskForReviewButton from './AskForReviewButton';
import CardPaymentsPausedBanner from './CardPaymentsPausedBanner';
import { areCardPaymentsPausedForClient } from '@/lib/cardPaymentsPaused.mjs';

const CARD_PAYMENTS_PAUSED = areCardPaymentsPausedForClient();
import { isAgentReferralSource, isSalesAgentAffiliate } from '@/lib/salesAgentAffiliate.mjs';
import { OWNER_REASON_MAX, OWNER_REASON_MIN, sameOwner } from '@/lib/orderOwnership.mjs';
import OrderOwnerDialog from './OrderOwnerDialog';
import { bacGiftShortfall } from '@/lib/bacWater.mjs';
import { formatAmount as formatRefundMoney, orderCanBeRefunded } from '@/lib/orderRefund.mjs';
import {
  ORDER_PAYMENT_METHODS,
  orderPaymentIsSettled,
  paymentMethodLabel,
} from '@/lib/orderPaymentMethod.mjs';
import {
  ADMIN_FALLBACK_EXCHANGE_RATE,
  calculateAdminOrderTotals,
  getAdminCurrencyPair,
  getAdminOrderSubtotal,
  getAdminShippingCosts,
  manualDiscountReplacesVolume,
  normalizeAdminOrderCurrency,
  storedOrderVolumePct,
} from '@/lib/adminOrderTotals.mjs';

/**
 * When the order was marked complete, or null if it never was.
 *
 * Deliberately does not fall back to created_at the way the dashboard's
 * orderCompletedAtMs does: this feeds a label the team reads next to the placed
 * date, and showing the two as identical would claim a completion that never
 * happened. The earliest event wins, so a re-completion cannot move the date.
 */
function orderCompletedAt(order) {
  const completions = (Array.isArray(order?.activity_log) ? order.activity_log : [])
    .filter((entry) => entry?.type === 'status_change' && /complet/i.test(String(entry?.message || '')))
    .map((entry) => entry?.at)
    .filter(Boolean)
    .sort();
  return completions[0] || null;
}

const ORDER_STATUS_OPTIONS = [
  'Pending',
  'Payment Pending',
  'Pending - Card',
  'Pending - Card 3DS',
  'Paid',
  'Declined',
  'Error',
  'Processing',
  'Order Complete',
  'Cancelled',
];

const formatCustomerIdType = (idType) => {
  if (!idType) return '';
  const types = {
    '1': 'Cédula',
    '2': 'Cédula jurídica',
    '5': 'Passport',
    '6': 'DIMEX',
  };
  return types[String(idType)] || idType;
};

const parseProductPrice = (product, currency) => {
  if (currency === 'USD') {
    return parseFloat(String(product.priceUsd || '0').replace(/[^0-9.]/g, '')) || 0;
  }
  return parseFloat(String(product.priceCrc || '0').replace(/[^0-9.]/g, '')) || 0;
};

const getStoredTotal = (order) => {
  if (normalizeAdminOrderCurrency(order.currency) === 'USD') return Number(order.total_usd) || 0;
  return Number(order.total_crc) || 0;
};

const getCardPaymentBadge = (order) => {
  if (order.payment_method !== 'card') return null;
  const status = String(order.status || '').toLowerCase();
  const providerStatus = String(order.payment_provider_status || '').toLowerCase();

  if (
    status.includes('paid') ||
    status.includes('complete') ||
    providerStatus === 'approved' ||
    providerStatus === 'completed'
  ) {
    return { label: 'Paid', color: '#4ade80', bg: 'rgba(34, 197, 94, 0.14)' };
  }
  if (status.includes('declined') || providerStatus === 'declined') {
    return { label: 'Declined', color: '#f87171', bg: 'rgba(239, 68, 68, 0.14)' };
  }
  if (status.includes('3ds') || providerStatus.includes('3ds')) {
    return { label: '3DS Pending', color: '#c084fc', bg: 'rgba(168, 85, 247, 0.14)' };
  }
  if (status.includes('error') || providerStatus === 'failed') {
    return { label: 'Error', color: '#f87171', bg: 'rgba(239, 68, 68, 0.14)' };
  }
  return { label: 'Card Pending', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.14)' };
};

const inferShippingCosts = (order, exchangeRate = ADMIN_FALLBACK_EXCHANGE_RATE) => {
  const currency = normalizeAdminOrderCurrency(order.currency);
  const explicitCrc = Number(order.shipping_cost_crc) || 0;
  const explicitUsd = Number(order.shipping_cost_usd) || 0;

  if (explicitCrc > 0 || explicitUsd > 0) {
    return {
      crc: explicitCrc,
      usd: explicitUsd,
    };
  }

  const itemsSubtotal = getAdminOrderSubtotal(Array.isArray(order.items) ? order.items : []);
  const storedTotal = getStoredTotal(order);
  const inferred = Math.max(0, storedTotal - itemsSubtotal);

  if (!inferred) {
    return { crc: explicitCrc, usd: explicitUsd };
  }

  return currency === 'USD'
    ? {
        crc: Math.round(inferred * exchangeRate),
        usd: Number(inferred.toFixed(2)),
      }
    : {
        crc: Math.round(inferred),
        usd: Number((inferred / exchangeRate).toFixed(2)),
      };
};

export default function OrderDetailPanel({
  order,
  products = [],
  onClose,
  onUpdated,
  onStatusChange,
  onResendCompletion,
  onResendAccounting,
  onResendReceipt,
  agents = [],
  affiliates = [],
  isSuperadmin = false,
  onRequestRefund,
  exchangeRate = ADMIN_FALLBACK_EXCHANGE_RATE,
  currentAgentName = '',
  onOwnerAction,
}) {
  const initialShipping = order ? inferShippingCosts(order, exchangeRate) : { crc: 0, usd: 0 };
  const initialCurrency = normalizeAdminOrderCurrency(order?.currency);
  const [notes, setNotes] = useState(order.internal_notes || '');
  const [uploading, setUploading] = useState(false);
  const [shippingAmount, setShippingAmount] = useState(
    (initialCurrency === 'USD' ? initialShipping.usd : initialShipping.crc) || ''
  );
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number || '');
  const [savingAll, setSavingAll] = useState(false);
  const [saveError, setSaveError] = useState('');
  const saveInFlightRef = useRef(false);

  const [customerName, setCustomerName] = useState(order.customer_name || '');
  const [customerPhone, setCustomerPhone] = useState(order.customer_phone || '');
  const [customerEmail, setCustomerEmail] = useState(order.customer_email || '');
  const [shippingAddress, setShippingAddress] = useState(order.shipping_address || '');
  const [editItems, setEditItems] = useState([]);
  const [addProduct, setAddProduct] = useState('');
  const [orderError, setOrderError] = useState('');
  const [manualDiscountType, setManualDiscountType] = useState(order.manual_discount_type || 'none');
  const [manualDiscountValue, setManualDiscountValue] = useState(order.manual_discount_value || '');
  const [manualDiscountReason, setManualDiscountReason] = useState(order.manual_discount_reason || '');
  const [discountError, setDiscountError] = useState('');
  const [phoneCopied, setPhoneCopied] = useState(false);
  const [changingPaymentMethod, setChangingPaymentMethod] = useState(false);
  const [paymentMethodError, setPaymentMethodError] = useState('');
  const [paymentMethodNotice, setPaymentMethodNotice] = useState('');
  const [cardLinkLoading, setCardLinkLoading] = useState(false);
  const [cardLinkCopied, setCardLinkCopied] = useState(false);
  const [cardLinkError, setCardLinkError] = useState('');
  const [creditedAgent, setCreditedAgent] = useState(order.sales_agent || '');
  const [attributionAffiliateId, setAttributionAffiliateId] = useState(order.affiliate_id || '');
  const [commissionMode, setCommissionMode] = useState(order.agent_commission_rate_override ? 'custom' : 'default');
  const [commissionOverridePct, setCommissionOverridePct] = useState(order.agent_commission_rate_override || 20);
  const [ownerReason, setOwnerReason] = useState('');
  const [ownerRequestOpen, setOwnerRequestOpen] = useState(false);
  const [attributionError, setAttributionError] = useState('');
  const [resendingReceipt, setResendingReceipt] = useState(false);
  const [receiptResendNotice, setReceiptResendNotice] = useState('');
  const [resendingCompletion, setResendingCompletion] = useState(false);
  const [resendingAccounting, setResendingAccounting] = useState(false);
  const [markingReady, setMarkingReady] = useState(false);

  useEffect(() => {
    if (!order) return;
    const nextShipping = inferShippingCosts(order);
    const nextCurrency = normalizeAdminOrderCurrency(order.currency);
    setNotes(order.internal_notes || '');
    setTrackingNumber(order.tracking_number || '');
    setSaveError('');
    setShippingAmount((nextCurrency === 'USD' ? nextShipping.usd : nextShipping.crc) || '');
    setCustomerName(order.customer_name || '');
    setCustomerPhone(order.customer_phone || '');
    setCustomerEmail(order.customer_email || '');
    setShippingAddress(order.shipping_address || '');
    setEditItems(Array.isArray(order.items) ? order.items.map((i) => ({ ...i })) : []);
    setOrderError('');
    setManualDiscountType(order.manual_discount_type || 'none');
    setManualDiscountValue(order.manual_discount_value || '');
    setManualDiscountReason(order.manual_discount_reason || '');
    setDiscountError('');
    setPhoneCopied(false);
    setReceiptResendNotice('');
    setCardLinkCopied(false);
    setCardLinkError('');
    setCreditedAgent(order.sales_agent || '');
    setOwnerReason('');
    setAttributionAffiliateId(order.affiliate_id || '');
    setCommissionMode(
      isAgentReferralSource(order.agent_commission_source)
        ? 'agent_referral'
        : (order.agent_commission_rate_override ? 'custom' : 'default')
    );
    setCommissionOverridePct(order.agent_commission_rate_override || 20);
    setAttributionError('');
  }, [order]);

  // No early return for a missing order: the state above already reads
  // order.* directly, and a return here would put the hooks below out of order.

  const orderCurrency = normalizeAdminOrderCurrency(order.currency);

  // A customer who picked WhatsApp and then asks to pay by card used to mean
  // recreating the order by hand — two records for one sale, with the activity
  // log, the agent attribution and the commission split between them.
  const changePaymentMethod = async (nextMethod) => {
    const current = String(order.payment_method || '').trim().toLowerCase();
    if (!nextMethod || nextMethod === current) return;

    const label = paymentMethodLabel(nextMethod);
    if (!window.confirm(`Change this order from ${paymentMethodLabel(current)} to ${label}?`)) return;

    setChangingPaymentMethod(true);
    setPaymentMethodError('');
    setPaymentMethodNotice('');
    setCardLinkCopied(false);
    setCardLinkError('');

    try {
      const res = await adminFetch('/api/admin/orders/payment-method', {
        method: 'POST',
        body: JSON.stringify({ orderId: order.id, paymentMethod: nextMethod }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Could not change the payment method');

      onUpdated(data.order);

      if (data.paymentUrl) {
        // Handed over with the change so the agent can paste it straight into
        // the conversation they are already having.
        try {
          await navigator.clipboard.writeText(data.paymentUrl);
          setPaymentMethodNotice(`Now set to ${label}. The secure card payment link is on your clipboard.`);
        } catch {
          setPaymentMethodNotice(`Now set to ${label}. Use "Copy card payment link" below to send it.`);
        }
      } else {
        setPaymentMethodNotice(
          data.paymentLinkError
            ? `Now set to ${label}, but ${data.paymentLinkError}`
            : `Now set to ${label}.`,
        );
      }
    } catch (err) {
      setPaymentMethodError(err.message);
    } finally {
      setChangingPaymentMethod(false);
    }
  };

  const copyCardPaymentLink = async () => {
    setCardLinkLoading(true);
    setCardLinkCopied(false);
    setCardLinkError('');

    try {
      const res = await adminFetch('/api/admin/orders/card-payment-link', {
        method: 'POST',
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create card payment link');

      await navigator.clipboard.writeText(data.paymentUrl);
      setCardLinkCopied(true);
    } catch (err) {
      setCardLinkError(err.message);
    } finally {
      setCardLinkLoading(false);
    }
  };

  // Only enough to decide whether to offer the button and what to say above it.
  // The amount, the checks and the sending all live in RefundDialog and the
  // route behind it, so there is one place that can refuse a bad number.
  const refundPaid = orderCurrency === 'CRC' ? Number(order.total_crc || 0) : Number(order.total_usd || 0);
  const refundDone = orderCurrency === 'CRC'
    ? Number(order.refunded_amount_crc || 0)
    : Number(order.refunded_amount_usd || 0);
  const canRefund = orderCanBeRefunded(order);

  const activity = Array.isArray(order.activity_log) ? order.activity_log : [];
  const cardPaymentBadge = getCardPaymentBadge(order);
  const paymentIsSettled = orderPaymentIsSettled(order);
  const statusLower = String(order.status || '').toLowerCase();
  const isActionRequired = order.payment_method === 'card' && 
                            cardPaymentBadge?.label === 'Paid' && 
                            !statusLower.includes('complete') && 
                            !statusLower.includes('cancel');
  const shipping = Number(shippingAmount) || 0;
  const shippingCosts = getAdminShippingCosts(shipping, orderCurrency, exchangeRate);
  const promoDiscount = orderCurrency === 'USD'
    ? Number(order.discount_amount_usd || 0)
    : Number(order.discount_amount_crc || 0);
  const {
    itemsSubtotal,
    discountPct,
    discountAmount,
    promoDiscountAmount,
    manualDiscountAmount,
    total: orderTotal,
  } = calculateAdminOrderTotals(editItems, shipping, {
    promoDiscountAmount: promoDiscount,
    manualDiscountType,
    manualDiscountValue,
    // The rate this order was priced at. Without it, reopening an order taken
    // during a deal week would recompute the total at today's lower tier and
    // let staff save the customer a different figure than they agreed to.
    volumeDiscountPct: storedOrderVolumePct(order),
    // Manual orders only. A website order's volume discount is the offer the
    // customer accepted at checkout and is not staff's to overwrite.
    replaceVolumeDiscount: manualDiscountReplacesVolume(
      order.source, manualDiscountType, manualDiscountValue,
    ),
  });
  const totalCosts = getAdminCurrencyPair(orderTotal, orderCurrency, exchangeRate);

  // Free vials the order is entitled to but does not list. Storefront orders
  // arrive with the gift already written in; orders typed in by an agent, or
  // placed before the gift became a line, do not — and the box still has to be
  // packed with them. Derived rather than stored so the archive is covered too.
  const giftShortfall = bacGiftShortfall(editItems);

  const isSettledOrder = (() => {
    const normalized = String(order.status || '').toLowerCase();
    return normalized.includes('paid') || normalized.includes('complete');
  })();

  const hasManualDiscountChanged =
    (order.manual_discount_type || 'none') !== manualDiscountType ||
    Number(order.manual_discount_value || 0) !== Number(manualDiscountValue || 0) ||
    (String(order.manual_discount_reason || '').trim() || '') !== (manualDiscountReason.trim() || '');
  const canPersistManualDiscount = Object.hasOwn(order, 'manual_discount_type');

  const patchOrder = async (updates, activityEntry, options = {}) => {
    const res = await adminFetch('/api/admin/orders/update', {
      method: 'PATCH',
      body: JSON.stringify({ orderId: order.id, updates, activity: activityEntry, ...options }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Update failed');
    onUpdated(data.order);
    return data.order;
  };

  const confirmPaidOrderDiscount = () => {
    if (!isSettledOrder || !hasManualDiscountChanged) return true;
    return window.confirm(
      'This order is already paid or complete. Changing the discount updates the order record only; it does not refund the customer or change a completed card charge. Continue?'
    );
  };

  const getManualDiscountUpdates = () => {
    const type = manualDiscountType === 'percentage' || manualDiscountType === 'fixed'
      ? manualDiscountType
      : null;
    return {
      manual_discount_type: type,
      manual_discount_value: type ? Number(manualDiscountValue) || 0 : 0,
      manual_discount_reason: type ? manualDiscountReason.trim() || null : null,
    };
  };

  const agentOptions = (() => {
    const current = String(creditedAgent || '').trim();
    if (!current || agents.some((agent) => String(agent).trim() === current)) return agents;
    return [current, ...agents];
  })();

  const selectedAffiliate = affiliates.find((affiliate) => affiliate.id === attributionAffiliateId);
  const salesAgentAffiliates = affiliates.filter(isSalesAgentAffiliate);
  const externalAffiliates = affiliates.filter((affiliate) => !isSalesAgentAffiliate(affiliate));
  const selectedAffiliateRate = selectedAffiliate ? Number(selectedAffiliate.commission_rate || 0) * 100 : 0;
  const selectedAffiliateIsAgent = isSalesAgentAffiliate(selectedAffiliate);
  const currentAgentOverride = Number(order.agent_commission_rate_override || 0);
  const currentCommissionLabel = currentAgentOverride > 0
    ? `${currentAgentOverride}%${isAgentReferralSource(order.agent_commission_source) ? ' agent referral' : ' override'}`
    : 'Profile rate';

  // Replacing someone who already owns the order needs a reason on the record;
  // filling an empty owner does not.
  const replacingOwner = Boolean(String(order.sales_agent || '').trim())
    && !sameOwner(order.sales_agent, creditedAgent);

  // What differs from the saved order, group by group. The one Save button
  // sends only these. Sending everything used to break the common case: the
  // items went along with an email fix, and the server refuses any item change
  // on a paid order — so a paid order's contact details could not be saved.
  const normalizeItemsForCompare = (items) => JSON.stringify(
    (Array.isArray(items) ? items : []).map((i) => [i.product, Number(i.qty) || 1, Number(i.price) || 0])
  );
  const savedShippingCosts = inferShippingCosts(order, exchangeRate);
  const savedShipping = Number((orderCurrency === 'USD' ? savedShippingCosts.usd : savedShippingCosts.crc) || 0);
  const savedCommissionMode = isAgentReferralSource(order.agent_commission_source)
    ? 'agent_referral'
    : (order.agent_commission_rate_override ? 'custom' : 'default');

  // Compared exactly as typed, spaces included: anything the person typed
  // counts as a change, so the Save button and the close warning react to
  // it. The save itself still trims.
  const contactChanged =
    customerName !== (order.customer_name || '') ||
    customerPhone !== (order.customer_phone || '') ||
    customerEmail !== (order.customer_email || '') ||
    shippingAddress !== (order.shipping_address || '');
  const itemsChanged = normalizeItemsForCompare(editItems) !== normalizeItemsForCompare(order.items);
  const shippingChanged = Math.abs((Number(shippingAmount) || 0) - savedShipping) > 0.004;
  const pricingChanged = itemsChanged || shippingChanged || hasManualDiscountChanged;
  const notesChanged = notes !== (order.internal_notes || '');
  const trackingChanged = trackingNumber !== (order.tracking_number || '');
  const attributionChanged = isSuperadmin && (
    !sameOwner(order.sales_agent || '', creditedAgent) ||
    (attributionAffiliateId || '') !== (order.affiliate_id || '') ||
    commissionMode !== savedCommissionMode ||
    (commissionMode !== 'default' &&
      Number(commissionOverridePct || 0) !== Number(order.agent_commission_rate_override || 20))
  );
  const hasUnsavedChanges = contactChanged || pricingChanged || notesChanged || trackingChanged || attributionChanged;

  // Reloading or closing the browser tab would drop the edits without a word.
  // The browser shows its own "Leave site?" box; the text is not ours to set.
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  const closePanel = () => {
    if (hasUnsavedChanges && !window.confirm('You have changes that are not saved. Close without saving?')) return;
    onClose();
  };

  const saveAll = async () => {
    if (saveInFlightRef.current || !hasUnsavedChanges) return;
    setSaveError('');
    setOrderError('');
    setDiscountError('');
    setAttributionError('');

    if (contactChanged && (!customerName.trim() || !customerPhone.trim())) {
      setSaveError('Name and phone are required.');
      return;
    }
    if (itemsChanged && editItems.length === 0) {
      setSaveError('Order must have at least one item.');
      return;
    }
    if (hasManualDiscountChanged) {
      const value = Number(manualDiscountValue || 0);
      if (manualDiscountType !== 'none' && (!Number.isFinite(value) || value <= 0)) {
        setSaveError('Enter a discount greater than zero.');
        return;
      }
      if (manualDiscountType === 'percentage' && value > 100) {
        setSaveError('Percentage discount cannot exceed 100%.');
        return;
      }
    }
    if (attributionChanged) {
      if (commissionMode !== 'default' && !creditedAgent.trim()) {
        setSaveError('Choose a credited agent before setting a commission override.');
        return;
      }
      if (replacingOwner && ownerReason.trim().length < OWNER_REASON_MIN) {
        setSaveError(`Type a short reason for moving this order away from ${order.sales_agent}. It is saved in the timeline.`);
        return;
      }
    }
    if (pricingChanged && !confirmPaidOrderDiscount()) return;

    const updates = {};
    const changedParts = [];
    if (contactChanged) {
      updates.customer_name = customerName.trim();
      updates.customer_phone = customerPhone.trim();
      updates.customer_email = customerEmail.trim() || null;
      updates.shipping_address = shippingAddress.trim() || null;
      changedParts.push('contact details');
    }
    if (pricingChanged) {
      // The server reprices from these and writes the totals itself.
      const ship = Number(shippingAmount) || 0;
      const shippingPair = getAdminShippingCosts(ship, orderCurrency, exchangeRate);
      updates.items = editItems.map((i) => ({
        product: i.product,
        qty: Number(i.qty) || 1,
        price: Number(i.price) || 0,
      }));
      updates.shipping_cost_crc = shippingPair.crc;
      updates.shipping_cost_usd = shippingPair.usd;
      if (canPersistManualDiscount || hasManualDiscountChanged) Object.assign(updates, getManualDiscountUpdates());
      if (itemsChanged) changedParts.push('items');
      if (shippingChanged) changedParts.push('shipping');
      if (hasManualDiscountChanged) changedParts.push('discount');
    }
    if (notesChanged) {
      updates.internal_notes = notes;
      changedParts.push('internal notes');
    }
    if (attributionChanged) {
      const overrideRate = commissionMode === 'default' ? null : Math.max(0, Number(commissionOverridePct) || 0);
      updates.sales_agent = creditedAgent.trim() || null;
      updates.affiliate_id = attributionAffiliateId || null;
      updates.agent_commission_rate_override = overrideRate;
      updates.agent_commission_source = commissionMode === 'default'
        ? null
        : (commissionMode === 'agent_referral' ? 'agent_referral' : 'custom_override');
      changedParts.push(
        `attribution (${creditedAgent.trim() || 'unassigned'} / ${selectedAffiliate?.name || 'no affiliate'} / ${overrideRate ? `${overrideRate}%` : 'profile rate'})`
      );
    }
    const tracking = trackingNumber.trim();
    if (trackingChanged) {
      updates.tracking_number = tracking || null;
      changedParts.push(tracking ? `tracking ${tracking}` : 'tracking removed');
    }

    saveInFlightRef.current = true;
    setSavingAll(true);
    try {
      const saved = await patchOrder(
        updates,
        {
          type: changedParts.length === 1 && notesChanged ? 'note'
            : changedParts.length === 1 && trackingChanged ? 'tracking_update'
              : 'items_updated',
          message: `Updated by admin: ${changedParts.join(', ')}`,
        },
        {
          acknowledgePaidOrderDiscount: isSettledOrder && hasManualDiscountChanged,
          ...(attributionChanged && replacingOwner ? { ownerChangeReason: ownerReason.trim() } : {}),
        }
      );
      setOwnerReason('');
      alert('Changes saved.');
      // Same as the tracking field always did: a tracking number added to a
      // completed order sends the customer the completion email with it.
      // Compared trimmed here: a stray space is a change worth saving, not a
      // new tracking number worth emailing the customer about.
      const newTracking = tracking && tracking !== String(order.tracking_number || '').trim();
      if (newTracking && ['Completed', 'Order Complete'].includes(saved?.status)) {
        await onResendCompletion?.(saved);
      }
    } catch (err) {
      setSaveError(err.message);
    } finally {
      saveInFlightRef.current = false;
      setSavingAll(false);
    }
  };

  const updateItemQty = (idx, qty) => {
    const next = [...editItems];
    next[idx] = { ...next[idx], qty: Math.max(1, Number(qty) || 1) };
    setEditItems(next);
  };

  const updateItemPrice = (idx, price) => {
    const next = [...editItems];
    next[idx] = { ...next[idx], price: Number(price) || 0 };
    setEditItems(next);
  };

  const removeItem = (idx) => {
    setEditItems(editItems.filter((_, i) => i !== idx));
  };

  const handleAddProduct = () => {
    if (!addProduct) return;
    const product = products.find((p) => p.product === addProduct);
    if (!product) return;
    if (editItems.some((i) => i.product === product.product)) {
      setOrderError('Product already on this order — change quantity instead.');
      return;
    }
    setEditItems([
      ...editItems,
      {
        product: product.product,
        qty: 1,
        price: parseProductPrice(product, orderCurrency),
      },
    ]);
    setAddProduct('');
    setOrderError('');
  };

  const uploadProof = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('orderId', order.id);
      const res = await adminFetch('/api/admin/orders/upload-proof', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      await patchOrder({ payment_proof_url: data.url }, { type: 'payment_proof', message: 'Payment proof uploaded' });
    } catch (err) {
      alert(err.message);
    }
    setUploading(false);
    e.target.value = '';
  };

  return (
    <div className="modal active" onClick={closePanel} style={{ zIndex: 210 }}>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes alert-pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
            transform: scale(0.95);
          }
          70% {
            box-shadow: 0 0 0 6px rgba(239, 68, 68, 0);
            transform: scale(1.15);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
            transform: scale(0.95);
          }
        }
      `}} />
      <div className="modal-content order-detail-panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="close-modal" onClick={closePanel}>&times;</button>

        <div className="order-detail-header">
          <div style={{ padding: '10px', background: 'rgba(251, 191, 36, 0.1)', borderRadius: '12px', fontSize: '1.5rem' }}>📦</div>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 900, margin: 0 }}>Order Details</h2>
            <span style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 'bold' }}>
              #{order.order_number || order.id}
            </span>
            {order.source === 'admin_manual' && (
              <span className="order-detail-badge">Manual entry</span>
            )}
          </div>
        </div>

        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 12px' }}>
          Fix contact typos or adjust line items after speaking with the customer — no need to re-checkout.
        </p>

        <div className="order-detail-section">
          <h3>Customer</h3>
          <div className="order-detail-grid">
            <div>
              <label>Name</label>
              <input className="admin-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div>
              <label>Phone</label>
              <input className="admin-input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              {customerPhone.trim() && (
                <div className="order-detail-quick-actions">
                  <a href={`tel:${customerPhone.replace(/\s/g, '')}`} className="admin-btn admin-btn-secondary order-detail-quick-btn">
                    <Phone size={14} /> Call
                  </a>
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary order-detail-quick-btn"
                    onClick={() => {
                      navigator.clipboard?.writeText(customerPhone.trim());
                      setPhoneCopied(true);
                      setTimeout(() => setPhoneCopied(false), 2000);
                    }}
                  >
                    <Copy size={14} /> {phoneCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
            <div>
              <label>Email</label>
              <input className="admin-input" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label>ID Number</label>
              <span style={{ fontFamily: 'monospace' }}>
                {order.customer_id_number
                  ? `${order.customer_id_number}${order.customer_id_type ? ` (${formatCustomerIdType(order.customer_id_type)})` : ''}`
                  : '—'}
              </span>
            </div>
            {/* Both dates, in Costa Rica time. The team is spread across
                timezones, and the accounting copy goes out on the completed
                date, not the placed one — reading the reader's own clock here
                is what made an order look a day out from the mailbox. */}
            <div><label>Placed</label><span>{formatCrInstant(order.created_at)}</span></div>
            <div>
              <label>Completed</label>
              <span>{orderCompletedAt(order) ? formatCrInstant(orderCompletedAt(order)) : '—'}</span>
            </div>
          </div>
          <div style={{ marginTop: '10px' }}>
            <label>Address</label>
            <textarea
              className="admin-input"
              rows={2}
              value={shippingAddress}
              onChange={(e) => setShippingAddress(e.target.value)}
              placeholder="Shipping address"
            />
          </div>
        </div>

        <div className="order-detail-section">
          <h3>Transaction</h3>
          <div className="order-detail-grid">
            {isActionRequired && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                padding: '10px 12px',
                color: '#f87171',
                fontSize: '0.8rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                gridColumn: '1 / -1',
                marginBottom: '8px',
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.7)',
                  animation: 'alert-pulse 1.8s infinite ease-in-out',
                  display: 'inline-block'
                }} />
                <span>Card payment approved. Fulfill order and set status to "Order Complete".</span>
              </div>
            )}
            <div>
              <label>Payment</label>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {paymentIsSettled ? (
                  // Money already arrived one way; the record of how must not
                  // change afterwards.
                  <>
                    {paymentMethodLabel(order.payment_method)}
                    <small style={{ color: 'rgba(255,255,255,0.4)' }}>settled — cannot be changed</small>
                  </>
                ) : (
                  <select
                    value={String(order.payment_method || '').trim().toLowerCase()}
                    onChange={(event) => changePaymentMethod(event.target.value)}
                    disabled={changingPaymentMethod}
                    aria-label="Payment method"
                    className="admin-inline-select"
                  >
                    {!ORDER_PAYMENT_METHODS.some(m => m.id === String(order.payment_method || '').trim().toLowerCase()) && (
                      <option value={String(order.payment_method || '')}>{order.payment_method || 'unknown'}</option>
                    )}
                    {ORDER_PAYMENT_METHODS.map(method => (
                      <option key={method.id} value={method.id}>{method.icon} {method.label}</option>
                    ))}
                  </select>
                )}
                {changingPaymentMethod && <small style={{ color: 'rgba(255,255,255,0.5)' }}>Changing…</small>}
              </span>
            </div>
            {paymentMethodNotice && (
              <div>
                <label />
                <span style={{ color: '#34d399', fontSize: '0.78rem' }}>{paymentMethodNotice}</span>
              </div>
            )}
            {paymentMethodError && (
              <div>
                <label />
                <span style={{ color: '#f87171', fontSize: '0.78rem' }}>{paymentMethodError}</span>
              </div>
            )}
            {cardPaymentBadge && (
              <div>
                <label>Card payment</label>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px 9px',
                  borderRadius: '999px',
                  background: cardPaymentBadge.bg,
                  color: cardPaymentBadge.color,
                  fontSize: '0.75rem',
                  fontWeight: 900,
                }}>
                  {cardPaymentBadge.label}
                </span>
              </div>
            )}
            <div>
              <label>Status</label>
              <select
                className="admin-select"
                value={order.status || 'Pending'}
                onChange={(e) => onStatusChange(order.id, e.target.value)}
                style={{ width: '100%', marginTop: '4px' }}
              >
                {ORDER_STATUS_OPTIONS.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            {order.payment_transaction_id && (
              <div>
                <label>Shield transaction ID</label>
                <span style={{ fontFamily: 'monospace' }}>{order.payment_transaction_id}</span>
              </div>
            )}
            {order.payment_provider_status && (
              <div><label>Shield status</label><span>{order.payment_provider_status}</span></div>
            )}
            {order.payment_authorization && (
              <div><label>Authorization</label><span style={{ fontFamily: 'monospace' }}>{order.payment_authorization}</span></div>
            )}
            {order.payment_descriptor && (
              <div><label>Descriptor</label><span>{order.payment_descriptor}</span></div>
            )}
            <div>
              <label>Tracking</label>
              <input
                className="admin-input"
                value={trackingNumber}
                placeholder="Correos tracking #"
                onChange={(e) => setTrackingNumber(e.target.value)}
              />
            </div>
            <div>
              <label>Fulfillment</label>
              {order.ready_to_prepare_at ? (
                <span style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-start' }}>
                  <strong style={{ color: '#4ade80', fontSize: '.78rem' }}>
                    Ready to prepare since {new Date(order.ready_to_prepare_at).toLocaleString()}
                    {order.ready_to_prepare_by ? ` (by ${order.ready_to_prepare_by})` : ''}
                  </strong>
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary"
                    disabled={markingReady}
                    onClick={async () => {
                      setMarkingReady(true);
                      try {
                        await patchOrder(
                          { ready_to_prepare_at: null, ready_to_prepare_by: null },
                          { type: 'note', message: 'Removed from the fulfillment queue' }
                        );
                      } catch (err) {
                        alert(err.message);
                      } finally {
                        setMarkingReady(false);
                      }
                    }}
                    style={{ fontSize: '.74rem', padding: '6px 9px' }}
                  >
                    {markingReady ? 'Removing…' : 'Remove from fulfillment queue'}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  disabled={markingReady}
                  onClick={async () => {
                    setMarkingReady(true);
                    try {
                      await patchOrder(
                        { ready_to_prepare_at: new Date().toISOString(), ready_to_prepare_by: currentAgentName || null },
                        { type: 'ready_to_prepare', message: 'Marked ready to prepare — handed off to fulfillment' }
                      );
                    } catch (err) {
                      alert(err.message);
                    } finally {
                      setMarkingReady(false);
                    }
                  }}
                  style={{ fontSize: '.78rem', padding: '7px 11px' }}
                >
                  {markingReady ? 'Sending…' : 'Mark ready to prepare'}
                </button>
              )}
            </div>
            {/* Any status, not just completed. The case this exists for is a
                negotiated order whose discount was entered after the receipt
                went out — the customer is holding a figure that was never the
                agreed price, and waiting for the order to complete before it
                can be corrected is exactly the wait that caused the problem. */}
            <div>
              <label>Customer receipt</label>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-start' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  disabled={resendingReceipt || !order.customer_email}
                  title={order.customer_email
                    ? 'Emails the customer a corrected receipt with the order exactly as it stands now'
                    : 'This order has no email address on it'}
                  onClick={async () => {
                    // Nothing here can be taken back, and the button sits in a
                    // column of controls that only change the record.
                    if (!confirmCustomerEmail('receipt', order.customer_email, [
                      `Order: ${order.order_number}`,
                      `Total: ${orderCurrency === 'USD' ? `$${Number(order.total_usd || 0).toFixed(2)}` : `₡${Number(order.total_crc || 0).toLocaleString()}`}`,
                    ])) return;
                    setResendingReceipt(true);
                    setReceiptResendNotice('');
                    const result = await onResendReceipt?.(order);
                    const notice = result?.sent
                      ? `Corrected receipt sent to ${result.to}.`
                      : `Could not send: ${result?.error || 'unknown error'}`;
                    setReceiptResendNotice(notice);
                    setResendingReceipt(false);
                    // Same popup as the completion and accounting buttons. The
                    // inline line alone was easy to miss: the order refresh that
                    // follows a send can re-render the panel and clear it.
                    alert(notice);
                  }}
                  style={{ fontSize: '.74rem', padding: '6px 9px' }}
                >
                  <Mail size={13} />
                  {resendingReceipt ? 'Sending…' : 'Resend receipt with current totals'}
                </button>
                {!order.customer_email && (
                  <small style={{ color: '#94a3b8' }}>No email address on this order.</small>
                )}
                {receiptResendNotice && (
                  <small style={{ color: receiptResendNotice.startsWith('Could not') ? '#f87171' : '#4ade80' }}>
                    {receiptResendNotice}
                  </small>
                )}
              </span>
            </div>
            {/* Only on a completed order. Asking someone to review a purchase
                that has not arrived reads as though nobody is paying
                attention, and the automatic request has the same rule. */}
            {['Completed', 'Order Complete'].includes(order.status) && (
              <div>
                <label>Review request</label>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-start' }}>
                  <AskForReviewButton
                    order={order}
                    onDone={() => onUpdated?.({ ...order, review_requested_at: new Date().toISOString() })}
                  />
                  {!order.customer_email && (
                    <small style={{ color: '#94a3b8' }}>No email address on this order.</small>
                  )}
                </span>
              </div>
            )}
            {['Completed', 'Order Complete'].includes(order.status) && (
              <div>
                <label>Completion email</label>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-start' }}>
                  <strong style={{ color: order.completion_notification_status === 'sent' ? '#4ade80' : '#fbbf24', textTransform: 'capitalize' }}>
                    {order.completion_notification_status || 'Not recorded'}
                  </strong>
                  {order.completion_notification_error && (
                    <small style={{ color: '#f87171' }}>{order.completion_notification_error}</small>
                  )}
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary"
                    disabled={resendingCompletion || !order.customer_email}
                    onClick={async () => {
                      if (!confirmCustomerEmail('completion email', order.customer_email, [
                        `Order: ${order.order_number}`,
                        order.tracking_number ? `Tracking: ${order.tracking_number}` : 'No tracking number on this order yet.',
                      ])) return;
                      setResendingCompletion(true);
                      await onResendCompletion?.(order);
                      setResendingCompletion(false);
                    }}
                    style={{ fontSize: '.74rem', padding: '6px 9px' }}
                  >
                    {resendingCompletion ? 'Sending…' : 'Send / resend email'}
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary"
                    disabled={resendingAccounting}
                    onClick={async () => {
                      setResendingAccounting(true);
                      await onResendAccounting?.(order);
                      setResendingAccounting(false);
                    }}
                    style={{ fontSize: '.74rem', padding: '6px 9px' }}
                  >
                    {resendingAccounting ? 'Sending accounting…' : 'Resend accounting only'}
                  </button>
                </span>
              </div>
            )}
            {order.promo_code && (
              <div><label>Promo</label><span style={{ color: '#38bdf8' }}>{order.promo_code}</span></div>
            )}
          </div>
          {order.payment_method === 'card' && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid rgba(251, 191, 36, 0.25)',
              background: 'rgba(251, 191, 36, 0.09)',
              color: '#fbbf24',
              fontSize: '0.82rem',
              fontWeight: 700,
              lineHeight: 1.45,
            }}>
              Verify this card payment in Shield Hub Pay before fulfilling the order.
              <CardPaymentsPausedBanner compact />
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={copyCardPaymentLink}
                  // Disabled rather than left to fail at the route. The route
                  // refuses either way, but a button that visibly cannot be
                  // pressed explains itself; one that errors on click reads as
                  // a broken admin panel.
                  disabled={cardLinkLoading || CARD_PAYMENTS_PAUSED}
                  title={CARD_PAYMENTS_PAUSED ? 'Card payments are paused for maintenance' : undefined}
                  style={{ fontSize: '0.78rem', padding: '8px 10px' }}
                >
                  <Copy size={13} />
                  {CARD_PAYMENTS_PAUSED
                    ? 'Card payments paused'
                    : cardLinkLoading ? 'Creating link...' : cardLinkCopied ? 'Payment link copied' : 'Copy card payment link'}
                </button>
                {cardLinkError && (
                  <span style={{ color: '#f87171', fontSize: '0.78rem' }}>{cardLinkError}</span>
                )}
              </div>
            </div>
          )}

          {/* Refunds. Superadmin only, matching the route — this is money
              leaving the business, so it sits behind the same gate as
              approving a payout rather than the ordinary order controls. */}
          {isSuperadmin && (canRefund || refundDone > 0) && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ color: '#fca5a5', fontSize: '0.82rem', fontWeight: 700 }}>
                  Refund
                  {refundDone > 0 && (
                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                      {' '}— {formatRefundMoney(refundDone, orderCurrency)} of {formatRefundMoney(refundPaid, orderCurrency)} already refunded
                    </span>
                  )}
                </span>
                {canRefund && (
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary"
                    // Opens the same confirmation the orders list opens, rather
                    // than a second form that would have to repeat its checks.
                    onClick={() => onRequestRefund?.(order)}
                    style={{ fontSize: '0.78rem', padding: '6px 10px' }}
                  >
                    Record a refund
                  </button>
                )}
              </div>

            </div>
          )}
        </div>

        <div className="order-detail-section">
          <h3>Attribution &amp; Payout</h3>
          <div className="order-detail-grid">
            <div>
              <label>Credited agent</label>
              {isSuperadmin ? (
                <>
                  <select
                    className="admin-select"
                    value={creditedAgent}
                    onChange={(e) => setCreditedAgent(e.target.value)}
                    style={{ width: '100%', marginTop: '4px' }}
                  >
                    <option value="">Unassigned</option>
                    {agentOptions.map((agent) => (
                      <option key={agent} value={agent}>{agent}</option>
                    ))}
                  </select>
                  {replacingOwner && (
                    <input
                      className="admin-input"
                      aria-label="Reason for changing the owner"
                      value={ownerReason}
                      maxLength={OWNER_REASON_MAX}
                      onChange={(e) => setOwnerReason(e.target.value)}
                      placeholder={`Why move it from ${order.sales_agent}? (required)`}
                      style={{ width: '100%', marginTop: '6px' }}
                    />
                  )}
                </>
              ) : (
                <>
                  <span>{order.sales_agent || 'Unassigned'}</span>
                  {onOwnerAction && (
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary"
                      onClick={() => setOwnerRequestOpen(true)}
                      style={{ display: 'block', marginTop: '6px', fontSize: '0.75rem', padding: '4px 10px' }}
                    >
                      Request owner change
                    </button>
                  )}
                  {ownerRequestOpen && (
                    <OrderOwnerDialog
                      order={order}
                      mode="request"
                      agents={agents}
                      onClose={() => setOwnerRequestOpen(false)}
                      onSubmit={async ({ salesAgent, reason }) => {
                        const result = await onOwnerAction(order.id, { action: 'request', salesAgent, reason });
                        if (result.ok) alert(result.message || 'Request sent. A superadmin will approve or reject it.');
                        return result;
                      }}
                    />
                  )}
                </>
              )}
            </div>
            <div>
              <label>Agent commission</label>
              {isSuperadmin ? (
                <select
                  className="admin-select"
                  value={commissionMode}
                  onChange={(e) => {
                    setCommissionMode(e.target.value);
                    if (e.target.value === 'agent_referral') setCommissionOverridePct(20);
                  }}
                  style={{ width: '100%', marginTop: '4px' }}
                >
                  <option value="default">Profile rate</option>
                  <option value="agent_referral">Agent referral - combined 20%</option>
                  <option value="custom">Custom Percentage</option>
                </select>
              ) : (
                <span>{currentCommissionLabel}</span>
              )}
            </div>
            {isSuperadmin && commissionMode === 'custom' && (
              <div>
                <label>Override %</label>
                <input
                  className="admin-input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={commissionOverridePct}
                  onChange={(e) => setCommissionOverridePct(e.target.value)}
                />
              </div>
            )}
            <div>
              <label>Affiliate</label>
              {isSuperadmin ? (
                <select
                  className="admin-select"
                  value={attributionAffiliateId}
                  onChange={(e) => {
                    const affiliateId = e.target.value;
                    const affiliate = affiliates.find((row) => row.id === affiliateId);
                    setAttributionAffiliateId(affiliateId);
                    if (isSalesAgentAffiliate(affiliate)) {
                      setCreditedAgent(affiliate.name || affiliate.email || '');
                      setCommissionMode('agent_referral');
                      setCommissionOverridePct(20);
                    }
                  }}
                  style={{ width: '100%', marginTop: '4px' }}
                >
                  <option value="">No affiliate</option>
                  {salesAgentAffiliates.length > 0 && (
                    <optgroup label="Sales agents - combined 20%">
                      {salesAgentAffiliates.map((affiliate) => (
                        <option key={affiliate.id} value={affiliate.id}>
                          {affiliate.name}{affiliate.whatsapp ? ' - WhatsApp ready' : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {externalAffiliates.length > 0 && (
                    <optgroup label="External affiliates">
                      {externalAffiliates.map((affiliate) => (
                        <option key={affiliate.id} value={affiliate.id}>
                          {affiliate.name}{affiliate.whatsapp ? ' - WhatsApp ready' : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              ) : (
                <span>{selectedAffiliate?.name || (order.affiliate_id ? 'Affiliate assigned' : 'No affiliate')}</span>
              )}
            </div>
          </div>
          {selectedAffiliate && (
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '10px 0 0' }}>
              {selectedAffiliateIsAgent
                ? 'Sales-agent affiliate: one combined 20% payout appears in the agent report. No separate affiliate commission is added.'
                : `Affiliate payout preview uses ${selectedAffiliateRate.toFixed(0)}% and will send their WhatsApp alert when this affiliate is newly assigned.`}
            </p>
          )}
          {attributionError && <p style={{ color: '#f87171', fontSize: '0.85rem', marginTop: '8px' }}>{attributionError}</p>}
        </div>

        <div className="order-detail-section">
          <h3>Items &amp; Totals</h3>
          {editItems.map((item, idx) => (
            <div key={`${item.product}-${idx}`} className="manual-order-item-row" style={{ marginBottom: '8px' }}>
              <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600 }}>{item.product}</span>
              <input
                className="admin-input"
                type="number"
                min="1"
                value={item.qty}
                onChange={(e) => updateItemQty(idx, e.target.value)}
                style={{ width: '64px' }}
              />
              <input
                className="admin-input"
                type="number"
                min="0"
                step="0.01"
                value={item.price}
                onChange={(e) => updateItemPrice(idx, e.target.value)}
                style={{ width: '90px' }}
              />
              <button type="button" className="admin-btn admin-btn-danger" onClick={() => removeItem(idx)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {giftShortfall.missing > 0 && (
            <div
              className="manual-order-item-row"
              style={{
                marginBottom: '8px',
                padding: '8px 10px',
                borderRadius: '10px',
                border: '1px dashed rgba(56, 189, 248, 0.35)',
                background: 'rgba(56, 189, 248, 0.06)',
              }}
            >
              <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600, color: '#7dd3fc' }}>
                🎁 Bacteriostatic Water 3ml{' '}
                <span style={{ fontWeight: 500, color: '#94a3b8' }}>
                  — free, 1 per peptide
                </span>
              </span>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#7dd3fc', whiteSpace: 'nowrap' }}>
                × {giftShortfall.missing}
              </span>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8' }}>Free</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <ProductCombobox
              products={products}
              value={addProduct}
              placeholder="Type to add a product…"
              onClear={() => setAddProduct('')}
              onSelect={(product) => setAddProduct(product.product)}
              className="order-detail-product-picker"
            />
            <button type="button" className="admin-btn admin-btn-secondary" onClick={handleAddProduct}>
              <Plus size={14} /> Add
            </button>
          </div>

          <div style={{
            margin: '14px 0',
            padding: '14px',
            borderRadius: '10px',
            border: '1px solid rgba(56, 189, 248, 0.22)',
            background: 'rgba(56, 189, 248, 0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px', color: '#e2e8f0', fontWeight: 800, fontSize: '0.85rem' }}>
              <BadgePercent size={16} /> Order discount
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 0.8fr) minmax(100px, 0.7fr) minmax(180px, 1.5fr)', gap: '8px' }}>
              <select
                className="admin-select"
                value={manualDiscountType}
                onChange={(e) => {
                  setManualDiscountType(e.target.value);
                  setDiscountError('');
                }}
              >
                <option value="none">No manual discount</option>
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
              <input
                className="admin-input"
                type="number"
                min="0"
                max={manualDiscountType === 'percentage' ? '100' : undefined}
                step={manualDiscountType === 'percentage' ? '0.1' : (orderCurrency === 'USD' ? '0.01' : '1')}
                value={manualDiscountValue}
                onChange={(e) => {
                  setManualDiscountValue(e.target.value);
                  setDiscountError('');
                }}
                disabled={manualDiscountType === 'none'}
                placeholder={manualDiscountType === 'percentage' ? 'Percent' : `Amount ${orderCurrency}`}
              />
              <input
                className="admin-input"
                value={manualDiscountReason}
                maxLength={200}
                onChange={(e) => setManualDiscountReason(e.target.value)}
                disabled={manualDiscountType === 'none'}
                placeholder="Reason shown on receipt (optional)"
              />
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.4 }}>
              Applied after volume and promo discounts, before shipping.
            </p>
            {isSettledOrder && hasManualDiscountChanged && (
              <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: '#fbbf24', lineHeight: 1.4 }}>
                This order is already paid or complete. Saving changes the record only and does not issue a refund.
              </p>
            )}
            {discountError && <p style={{ color: '#f87171', fontSize: '0.8rem', margin: '8px 0 0' }}>{discountError}</p>}
          </div>

          <div className="order-detail-totals">
            <div><span>Items subtotal</span><span>{orderCurrency === 'USD' ? `$${itemsSubtotal.toFixed(2)}` : `₡${itemsSubtotal.toLocaleString()}`}</span></div>
            {discountPct > 0 && (
              <div style={{ color: '#16a34a' }}>
                <span>Volume discount ({discountPct}%)</span>
                <span>{orderCurrency === 'USD' ? `-$${discountAmount.toFixed(2)}` : `-₡${Math.round(discountAmount).toLocaleString()}`}</span>
              </div>
            )}
            {promoDiscountAmount > 0 && (
              <div style={{ color: '#38bdf8' }}>
                <span>Promo discount{order.promo_code ? ` (${order.promo_code})` : ''}</span>
                <span>{orderCurrency === 'USD' ? `-$${promoDiscountAmount.toFixed(2)}` : `-₡${Math.round(promoDiscountAmount).toLocaleString()}`}</span>
              </div>
            )}
            {manualDiscountAmount > 0 && (
              <div style={{ color: '#c084fc' }}>
                <span>Order discount{manualDiscountReason.trim() ? ` (${manualDiscountReason.trim()})` : ''}</span>
                <span>{orderCurrency === 'USD' ? `-$${manualDiscountAmount.toFixed(2)}` : `-₡${Math.round(manualDiscountAmount).toLocaleString()}`}</span>
              </div>
            )}
            <div>
              <span>Shipping</span>
              <span>
                {orderCurrency === 'USD'
                  ? `$${shippingCosts.usd.toFixed(2)} (≈ ₡${shippingCosts.crc.toLocaleString()})`
                  : `₡${shippingCosts.crc.toLocaleString()} (≈ $${shippingCosts.usd.toFixed(2)})`}
              </span>
            </div>
            <div className="order-detail-total-line">
              <span>Total (preview)</span>
              <span>
                {orderCurrency === 'USD'
                  ? `$${totalCosts.usd.toFixed(2)} (≈ ₡${totalCosts.crc.toLocaleString()})`
                  : `₡${totalCosts.crc.toLocaleString()} (≈ $${totalCosts.usd.toFixed(2)})`}
              </span>
            </div>
          </div>

          <div className="order-detail-shipping-edit" style={{ marginTop: '12px' }}>
            <label htmlFor="order-shipping-cost">Shipping cost ({orderCurrency})</label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <span
                  aria-hidden="true"
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontWeight: 700 }}
                >
                  {orderCurrency === 'USD' ? '$' : '₡'}
                </span>
                <input
                  id="order-shipping-cost"
                  className="admin-input"
                  type="number"
                  min="0"
                  step={orderCurrency === 'USD' ? '0.01' : '1'}
                  placeholder="0"
                  value={shippingAmount}
                  onChange={(e) => setShippingAmount(e.target.value)}
                  style={{ width: '100%', paddingLeft: '30px' }}
                />
              </div>
            </div>
            <div style={{ marginTop: '6px', color: '#94a3b8', fontSize: '0.75rem' }}>
              {orderCurrency === 'USD'
                ? `Shipping CRC equivalent: ₡${shippingCosts.crc.toLocaleString()}`
                : `Shipping USD equivalent: $${shippingCosts.usd.toFixed(2)}`}
            </div>
          </div>

          {orderError && <p style={{ color: '#f87171', fontSize: '0.85rem', marginTop: '8px' }}>{orderError}</p>}
        </div>

        <div className="order-detail-section">
          <h3>Payment Proof</h3>
          {order.payment_proof_url ? (
            <a href={order.payment_proof_url} target="_blank" rel="noopener noreferrer" className="order-proof-link">
              View uploaded proof
            </a>
          ) : (
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 8px' }}>No proof uploaded yet.</p>
          )}
          <label className="admin-btn admin-btn-secondary" style={{ display: 'inline-flex', cursor: 'pointer' }}>
            {uploading ? 'Uploading…' : 'Upload proof'}
            <input type="file" accept="image/*,.pdf" onChange={uploadProof} style={{ display: 'none' }} disabled={uploading} />
          </label>
        </div>

        <div className="order-detail-section">
          <h3>Internal Notes</h3>
          <textarea
            className="admin-input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Private notes for your team…"
          />
        </div>

        <div className="order-detail-section">
          <h3>Timeline</h3>
          {activity.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Order created {new Date(order.created_at).toLocaleString()}</p>
          ) : (
            <ul className="order-timeline">
              {activity.map((entry, idx) => (
                <li key={idx}>
                  <div className="order-timeline-type">{formatActivityType(entry.type)}</div>
                  {entry.message && <div className="order-timeline-msg">{entry.message}</div>}
                  <div className="order-timeline-meta">
                    {entry.by && <span>{entry.by}</span>}
                    {entry.at && <span>{new Date(entry.at).toLocaleString()}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* The one Save for everything typed into this panel. Pinned to the
            bottom so it is on screen wherever the edit was made. Actions
            that do something straight away (status, emails, fulfillment,
            proof upload, refunds) keep their own buttons. */}
        <div style={{
          position: 'sticky',
          bottom: '-18px',
          margin: '16px -16px -18px',
          padding: '12px 16px 14px',
          background: '#0e1626',
          borderTop: '1px solid rgba(148, 163, 184, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          zIndex: 2,
        }}>
          {saveError && <p style={{ color: '#f87171', fontSize: '0.85rem', margin: 0 }}>{saveError}</p>}
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={saveAll}
            disabled={savingAll || !hasUnsavedChanges}
            style={{ width: '100%', opacity: hasUnsavedChanges || savingAll ? 1 : 0.5 }}
          >
            {savingAll ? 'Saving…' : hasUnsavedChanges ? 'Save changes' : 'No changes to save'}
          </button>
        </div>
      </div>
    </div>
  );
}
