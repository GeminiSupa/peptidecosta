import React, { useDeferredValue, useMemo, useState } from 'react';
import { Database, Download, MessageCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { getAdminVolumeDiscountPct } from '@/lib/adminOrderTotals.mjs';
import { CUSTOMER_HISTORY_SOURCE } from '@/lib/agentAttribution.mjs';
import { formatCrDate } from '@/lib/crTime.mjs';

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
  // Picking this does NOT save a status. A refund has to be checked against
  // what the customer actually paid, tell four people and move the agent's
  // commission — so handleOrderStatusUpdate intercepts it and opens the refund
  // confirmation instead. Listed here because the dropdown is where a person
  // looks for it; "Partly Refunded" is not, because it is an outcome of that
  // confirmation rather than something you choose up front.
  'Refunded',
  'Cancelled',
];

const ORDER_STATUS_GROUPS = [
  {
    id: 'needs_payment',
    label: 'Needs Payment',
    filterLabel: 'Needs payment',
    statuses: ['Pending', 'Payment Pending', 'Pending - Card', 'Pending - Card 3DS'],
    nextStatus: 'Payment Pending',
  },
  {
    id: 'paid',
    label: 'Paid',
    filterLabel: 'Paid',
    statuses: ['Paid'],
    nextStatus: 'Paid',
  },
  {
    id: 'processing',
    label: 'Processing',
    filterLabel: 'Processing',
    statuses: ['Processing'],
    nextStatus: 'Processing',
  },
  {
    id: 'complete',
    label: 'Complete',
    filterLabel: 'Complete',
    statuses: ['Order Complete', 'Completed'],
    nextStatus: 'Order Complete',
  },
  {
    id: 'refunded',
    label: 'Refunded',
    filterLabel: 'Refunded',
    statuses: ['Refunded', 'Partly Refunded'],
    // No nextStatus: a refund is recorded through the refund box on the order,
    // which checks the amount against what was paid. Letting the bulk status
    // control set it would write the label without any of that.
    nextStatus: null,
  },
  {
    id: 'failed',
    label: 'Failed / Cancelled',
    filterLabel: 'Failed / cancelled',
    statuses: ['Declined', 'Error', 'Cancelled'],
    nextStatus: 'Cancelled',
  },
];

const ORDER_GROUP_BY_STATUS = ORDER_STATUS_GROUPS.reduce((map, group) => {
  group.statuses.forEach((status) => map.set(status.toLowerCase(), group));
  return map;
}, new Map());

function getOrderStatusGroup(status) {
  return ORDER_GROUP_BY_STATUS.get(String(status || 'Pending').toLowerCase()) || ORDER_STATUS_GROUPS[0];
}

/**
 * The options for one order's status control.
 *
 * A controlled <select> whose value is not among its options renders EMPTY, so
 * any status the panel can hold but not offer showed as a blank box. Several
 * exist: "Partly Refunded" is written by the refund dialog, "Processing - Card"
 * by the double-charge lock, "Payment Blocked" by a failed charge — and none of
 * them belong in the pick list, because a person choosing them would skip the
 * machinery that writes them.
 *
 * So the current status is added as a disabled option when it is not already
 * there: the order reads correctly, and still cannot be set that way by hand.
 */
function statusOptionsFor(status) {
  const current = String(status || '').trim();
  if (!current || ORDER_STATUS_OPTIONS.includes(current)) {
    return ORDER_STATUS_OPTIONS.map((value) => ({ value, disabled: false }));
  }
  return [
    { value: current, disabled: true },
    ...ORDER_STATUS_OPTIONS.map((value) => ({ value, disabled: false })),
  ];
}

// Costa Rica time, not the reader's — so this column names the same day the
// Revenue tiles counted the order on. See formatCrDate.
function getOrderDateLabel(order) {
  return formatCrDate(order.created_at, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getOrderDisplayTotal(order) {
  const stored = order.currency === 'USD' ? Number(order.total_usd || 0) : Number(order.total_crc || 0);
  return order.currency === 'USD'
    ? `$${stored.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
    : `₡${Math.round(stored).toLocaleString('en-US')}`;
}

function getStatusSelectStyle(status) {
  const normalized = String(status || 'Pending').toLowerCase();
  if (normalized.includes('complete')) {
    return {
      background: 'rgba(34, 197, 94, 0.15)',
      color: '#4ade80',
      border: '1px solid rgba(34, 197, 94, 0.3)',
    };
  }
  if (normalized.includes('paid')) {
    return {
      background: 'rgba(234, 179, 8, 0.15)',
      color: '#eab308',
      border: '1px solid rgba(234, 179, 8, 0.3)',
    };
  }
  if (normalized.includes('declined') || normalized.includes('cancel') || normalized.includes('error')) {
    return {
      background: 'rgba(239, 68, 68, 0.15)',
      color: '#f87171',
      border: '1px solid rgba(239, 68, 68, 0.3)',
    };
  }
  if (normalized.includes('3ds')) {
    return {
      background: 'rgba(168, 85, 247, 0.15)',
      color: '#c084fc',
      border: '1px solid rgba(168, 85, 247, 0.3)',
    };
  }
  if (normalized.includes('processing')) {
    return {
      background: 'rgba(56, 189, 248, 0.15)',
      color: '#38bdf8',
      border: '1px solid rgba(56, 189, 248, 0.3)',
    };
  }
  if (normalized.includes('payment')) {
    return {
      background: 'rgba(244, 63, 94, 0.15)',
      color: '#fb7185',
      border: '1px solid rgba(244, 63, 94, 0.3)',
    };
  }
  return {
    background: 'rgba(245, 158, 11, 0.15)',
    color: '#f59e0b',
    border: '1px solid rgba(245, 158, 11, 0.3)',
  };
}

function getCardPaymentBadge(order) {
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
}

function hasConfirmedPayment(order, group, cardBadge) {
  const status = String(order.status || '').toLowerCase();
  return group.id === 'paid' ||
    cardBadge?.label === 'Paid' ||
    status.includes('paid') ||
    status.includes('complete');
}

function getOrderAgentSourceLabel(order) {
  if (!order?.sales_agent) return 'Unassigned';
  if (order.agent_commission_source === CUSTOMER_HISTORY_SOURCE) return 'Auto: customer history';
  if (order.agent_commission_source) return `Source: ${order.agent_commission_source}`;
  return 'Assigned owner';
}

export default function OrdersManager({
  visibleOrders,
  isStaffAgent,
  setManualOrderOpen,
  orders,
  setExportModalType,
  loadingOrders,
  handleOrderStatusUpdate,
  handleOrderSalesAgentUpdate,
  setSelectedOrderDetails,
  openWhatsAppComposer,
  handleDeleteOrder,
  agents,
  formatCustomerIdType,
  loggedInEmailRef,
  currentAgentName,
  onRefreshOrders,
  refreshingOrders = false,
  ordersRefreshError = ''
}) {
  // These four only ever drove this table. Holding them in the 7,900-line admin
  // page meant every keystroke re-rendered the whole dashboard; owning them here
  // keeps a search to this component.
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('All');
  const [ordersCurrentPage, setOrdersCurrentPage] = useState(1);
  const [ordersPerPage, setOrdersPerPage] = useState(25);

  // Every order renders twice below (a mobile card and a desktop row, one hidden
  // by CSS), each carrying two <select>s — so a page rebuilds ~750 elements.
  // Deferring the term lets the input repaint on the keystroke and hands the
  // table re-render to React at a lower priority, where the next keystroke can
  // interrupt it. The box stays bound to `orderSearch`, so typing never lags;
  // only the results trail it, by a frame.
  const deferredOrderSearch = useDeferredValue(orderSearch);

  const scopedOrders = visibleOrders;
  const filteredOrders = useMemo(() => scopedOrders.filter(o => {
    if (orderStatusFilter !== 'All') {
      if (String(orderStatusFilter).startsWith('group:')) {
        const groupId = orderStatusFilter.replace('group:', '');
        if (getOrderStatusGroup(o.status).id !== groupId) return false;
      } else if (o.status !== orderStatusFilter) {
        return false;
      }
    }
    if (deferredOrderSearch) {
      const s = deferredOrderSearch.toLowerCase();
      return (
        o.customer_name?.toLowerCase().includes(s) ||
        o.customer_phone?.toLowerCase().includes(s) ||
        o.customer_email?.toLowerCase().includes(s) ||
        o.id?.toLowerCase().includes(s) ||
        o.order_number?.toLowerCase().includes(s) ||
        o.customer_id_number?.toLowerCase().includes(s) ||
        o.tracking_number?.toLowerCase().includes(s)
      );
    }
    return true;
  }), [scopedOrders, orderStatusFilter, deferredOrderSearch]);

  const totalOrdersPages = Math.ceil(filteredOrders.length / ordersPerPage);
  const paginatedOrders = useMemo(
    () => filteredOrders.slice((ordersCurrentPage - 1) * ordersPerPage, ordersCurrentPage * ordersPerPage),
    [filteredOrders, ordersCurrentPage, ordersPerPage],
  );
  // Independent of the search box, so typing must not recount all the tabs.
  const groupCounts = useMemo(() => ORDER_STATUS_GROUPS.reduce((acc, group) => {
    acc[group.id] = scopedOrders.filter((order) => getOrderStatusGroup(order.status).id === group.id).length;
    return acc;
  }, {}), [scopedOrders]);
  const setGroupFilter = (groupId) => {
    setOrderStatusFilter(`group:${groupId}`);
    setOrdersCurrentPage(1);
  };
  const formatItemsCount = (order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    return `${items.length} ${items.length === 1 ? 'item' : 'items'}`;
  };
  const openPaymentReminder = (order) => openWhatsAppComposer({
    name: order.customer_name,
    phone: order.customer_phone,
    orderNumber: order.order_number,
    orderDbId: order.id,
    cartItems: order.cart_data || [],
  }, 'payment');
  const openOrderWhatsapp = (order) => openWhatsAppComposer({
    name: order.customer_name,
    phone: order.customer_phone,
    orderNumber: order.order_number,
    orderDbId: order.id,
    cartItems: order.cart_data || [],
  });
  // Claim writes the same value the dropdown offers — the agent's display name.
  // Storing the raw email instead left the select showing "-- Unassigned --" on
  // an order that was in fact claimed.
  const claimOrder = async (orderId) => {
    const email = loggedInEmailRef?.current || (typeof window !== 'undefined' ? localStorage.getItem('admin_email') : '') || '';
    const matchedAgent = agents.find((agent) => {
      const value = String(agent || '').trim().toLowerCase();
      const claimEmail = String(email).trim().toLowerCase();
      return value === claimEmail || value === claimEmail.split('@')[0];
    });
    const claimName = matchedAgent || currentAgentName || email || 'info@peptidescostarica.net';
    const result = await handleOrderSalesAgentUpdate(orderId, claimName, { onlyIfUnassigned: true });
    if (result?.ok === false && result.takenBy) {
      alert(`This order was just claimed by ${result.takenBy}.`);
    }
  };

  /** Orders claimed before this fix hold an email, which is not in `agents`. */
  const agentOptionsFor = (order) => {
    const current = String(order?.sales_agent || '').trim();
    if (!current || agents.some((agent) => String(agent).trim() === current)) return agents;
    return [current, ...agents];
  };

  return (
    <div className="admin-tab-panel admin-tab-orders-panel">
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
      <div className="admin-toolbar" style={{ flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <h3>{isStaffAgent ? 'Team Orders' : 'Customer Orders Log Ledger'}</h3>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '4px 0 12px 0' }}>
            {isStaffAgent
              ? 'Shared order queue for the sales team. Tag the managing agent on an order to claim commission ownership.'
              : 'A secure listing of all catalog order intents placed by customers. Double check entries here before coordinating dispatches on WhatsApp.'}
          </p>
          <div className="admin-toolbar-filters">
            <input 
              className="admin-input admin-filter-input"
              type="text" 
              placeholder="Search by name, phone, email, or tracking..." 
              value={orderSearch}
              onChange={(e) => {
                setOrderSearch(e.target.value);
                setOrdersCurrentPage(1);
              }}
            />
            <select
              className="admin-select"
              value={orderStatusFilter}
              onChange={(e) => {
                setOrderStatusFilter(e.target.value);
                setOrdersCurrentPage(1);
              }}
            >
              <option value="All">All Statuses</option>
              {ORDER_STATUS_GROUPS.map(group => (
                <option key={group.id} value={`group:${group.id}`}>{group.filterLabel}</option>
              ))}
              <option disabled>──────────</option>
              {/* The filter, not a per-order control: every status is
                  selectable here because filtering by one changes nothing. */}
              {ORDER_STATUS_OPTIONS.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="admin-toolbar-actions">
          {/* Reloads this table only. Reloading the browser tab pulls products,
              carts, agents and WhatsApp too, and loses the current search. */}
          {onRefreshOrders && (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={onRefreshOrders}
              disabled={refreshingOrders}
              title="Reload the orders list without reloading the page"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <RefreshCw
                size={14}
                style={refreshingOrders ? { animation: 'spin 0.8s linear infinite' } : undefined}
              />
              {refreshingOrders ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => setManualOrderOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={14} />
            Manual Order
          </button>
          {orders.length > 0 && (
            <button
              className="admin-btn admin-btn-primary"
              onClick={() => setExportModalType('orders')}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Download size={14} />
              Export Orders
            </button>
          )}
        </div>
      </div>

      {ordersRefreshError && (
        <div
          role="status"
          style={{
            margin: '0 0 12px 0', padding: '10px 14px', borderRadius: '8px',
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
            color: '#fca5a5', fontSize: '0.82rem', fontWeight: 600,
          }}
        >
          {ordersRefreshError}
        </div>
      )}

      {loadingOrders ? (
        <div className="loader">
          <div className="sync-spinner" style={{ marginBottom: '16px' }}></div>
          <div>Fetching logs from database...</div>
        </div>
      ) : orders.length === 0 ? (
        <div className="loader" style={{ background: '#0e1626', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
          <Database size={32} style={{ margin: '0 auto 16px auto', opacity: 0.3, display: 'block' }} />
          No orders registered in the system yet.
        </div>
      ) : (
        <>
        <div className="order-mobile-status-strip admin-mobile-only" aria-label="Order status filters">
          <button
            type="button"
            className={orderStatusFilter === 'All' ? 'active' : ''}
            onClick={() => {
              setOrderStatusFilter('All');
              setOrdersCurrentPage(1);
            }}
          >
            All <span>{scopedOrders.length}</span>
          </button>
          {ORDER_STATUS_GROUPS.map((group) => (
            <button
              key={group.id}
              type="button"
              className={orderStatusFilter === `group:${group.id}` ? 'active' : ''}
              onClick={() => setGroupFilter(group.id)}
            >
              {group.label} <span>{groupCounts[group.id] || 0}</span>
            </button>
          ))}
        </div>

        <div className="order-mobile-list admin-mobile-only">
          {paginatedOrders.map((order) => {
            const group = getOrderStatusGroup(order.status);
            const cardBadge = getCardPaymentBadge(order);
            const status = String(order.status || '').toLowerCase();
            const paymentConfirmed = hasConfirmedPayment(order, group, cardBadge);
            const canQuickProcess = group.id === 'paid' || (group.id === 'needs_payment' && paymentConfirmed);
            const canQuickComplete = group.id === 'processing';
            const isActionRequired = order.payment_method === 'card' &&
              cardBadge?.label === 'Paid' &&
              !status.includes('complete') &&
              !status.includes('cancel');

            return (
              <article key={order.id} className={`order-mobile-card order-status-${group.id}`}>
                <button type="button" className="order-mobile-card-main" onClick={() => setSelectedOrderDetails(order)}>
                  <div className="order-mobile-card-top">
                    <div>
                      <div className="order-mobile-number">
                        #{order.order_number || order.id.slice(0, 8)}
                        {isActionRequired && <span className="order-action-dot" title="Card payment approved" />}
                      </div>
                      <div className="order-mobile-date">{getOrderDateLabel(order)}</div>
                    </div>
                    <span className="order-mobile-total">{getOrderDisplayTotal(order)}</span>
                  </div>
                  <div className="order-mobile-customer">{order.customer_name || 'Customer'}</div>
                  <div className="order-mobile-meta">
                    <span>{formatItemsCount(order)}</span>
                    <span>{order.customer_phone || 'No phone'}</span>
                  </div>
                  <div className="order-mobile-badges">
                    <span className="order-mobile-status">{group.label}</span>
                    {cardBadge && <span className="order-mobile-payment" style={{ color: cardBadge.color, background: cardBadge.bg }}>{cardBadge.label}</span>}
                    {order.sales_agent && <span className="order-mobile-agent">Owner: {order.sales_agent}</span>}
                  </div>
                </button>
                <div className="order-mobile-control-grid">
                  <label className="order-mobile-field" htmlFor={`order-status-${order.id}`}>
                    <span>Status</span>
                    <select
                      id={`order-status-${order.id}`}
                      className="order-mobile-status-select"
                      value={order.status || 'Pending'}
                      onChange={(e) => handleOrderStatusUpdate(order.id, e.target.value)}
                      style={getStatusSelectStyle(order.status)}
                    >
                      {statusOptionsFor(order.status).map(opt => (
                        <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.value}</option>
                      ))}
                    </select>
                  </label>
                  <label className="order-mobile-field" htmlFor={`order-agent-${order.id}`}>
                    <span>Owner</span>
                    <select
                      id={`order-agent-${order.id}`}
                      className={`order-mobile-agent-select${order.sales_agent ? ' is-assigned' : ''}`}
                      value={order.sales_agent || ''}
                      onChange={(e) => handleOrderSalesAgentUpdate(order.id, e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {agentOptionsFor(order).map((agent) => (
                        <option key={agent} value={agent}>{agent}</option>
                      ))}
                    </select>
                    {order.sales_agent && (
                      <small style={{ color: '#a78bfa', fontWeight: 800 }}>
                        {getOrderAgentSourceLabel(order)}
                      </small>
                    )}
                  </label>
                </div>
                {!order.sales_agent && (
                  <div className="order-mobile-claim-zone">
                    <button
                      type="button"
                      className="admin-btn admin-btn-primary order-mobile-claim-primary"
                      onClick={() => claimOrder(order.id)}
                      title="Assign this order to yourself"
                    >
                      Claim this order
                    </button>
                  </div>
                )}
                <div className="order-mobile-actions">
                  {group.id === 'needs_payment' && !paymentConfirmed && (
                    <button type="button" className="admin-btn admin-btn-secondary" onClick={() => openPaymentReminder(order)}>
                      <MessageCircle size={14} /> Ask payment
                    </button>
                  )}
                  {canQuickProcess && (
                    <button type="button" className="admin-btn admin-btn-primary" onClick={() => handleOrderStatusUpdate(order.id, 'Processing')}>
                      Process
                    </button>
                  )}
                  {canQuickComplete && (
                    <button type="button" className="admin-btn admin-btn-primary" onClick={() => handleOrderStatusUpdate(order.id, 'Order Complete')}>
                      Complete
                    </button>
                  )}
                  <button type="button" className="admin-btn" onClick={() => openOrderWhatsapp(order)}>
                    WhatsApp
                  </button>
                  <button type="button" className="admin-btn order-mobile-delete" onClick={() => handleDeleteOrder(order.id)} aria-label="Delete order">
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="table-responsive admin-table-wrap admin-desktop-table" style={{ background: '#0e1626', borderRadius: '12px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)' }}>
          <table className="spreadsheet-table responsive-table admin-orders-table">
            <thead>
              <tr>
                <th style={{ padding: '10px 12px' }}>Date</th>
                <th style={{ padding: '10px 12px' }}>Order Info</th>
                <th style={{ padding: '10px 12px' }}>Customer Details</th>
                <th style={{ padding: '10px 12px' }}>Total Amount</th>
                <th style={{ padding: '10px 12px' }}>Payment</th>
                <th style={{ padding: '10px 12px' }}>Status</th>
                <th style={{ padding: '10px 12px' }}>Agent</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedOrders.map(order => {
                  const items = Array.isArray(order.items) ? order.items : [];
                  const orderDate = getOrderDateLabel(order);

                  const _discountPct = getAdminVolumeDiscountPct(items);
                  
                  const status = String(order.status || '').toLowerCase();
                  const cardBadge = getCardPaymentBadge(order);
                  const group = getOrderStatusGroup(order.status);
                  const paymentConfirmed = hasConfirmedPayment(order, group, cardBadge);
                  const isActionRequired = order.payment_method === 'card' && 
                                            cardBadge?.label === 'Paid' && 
                                            !status.includes('complete') && 
                                            !status.includes('cancel');
                  
                  return (
                    <tr key={order.id}>
                      <td data-label="Date" style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#cbd5e1' }}>
                        {orderDate}
                      </td>
                      <td data-label="Order Info" style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ 
                            fontWeight: 'bold', 
                            color: '#fbbf24', 
                            fontSize: '0.85rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            #{order.order_number || order.id.slice(0, 8)}
                            {isActionRequired && (
                              <span 
                                title="Card payment approved - Action required to complete order"
                                style={{
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  backgroundColor: '#ef4444',
                                  display: 'inline-block',
                                  boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.7)',
                                  animation: 'alert-pulse 1.8s infinite ease-in-out',
                                  flexShrink: 0,
                                }}
                              />
                            )}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {items.length} {items.length === 1 ? 'item' : 'items'}
                          </span>
                        </div>
                      </td>
                      <td data-label="Customer Details" style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '0.85rem' }}>
                            {order.customer_name}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            💬 {order.customer_phone}
                          </span>
                          {order.customer_id_number && (
                            <span style={{ fontSize: '0.75rem', color: '#cbd5e1', fontFamily: 'monospace' }}>
                              🪪 {order.customer_id_number}
                              {order.customer_id_type ? ` (${formatCustomerIdType(order.customer_id_type)})` : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td data-label="Total Amount" style={{ padding: '10px 12px', fontWeight: 'bold', color: '#38bdf8', fontSize: '0.9rem' }}>
                        {getOrderDisplayTotal(order)}
                        {_discountPct > 0 && (
                          <span style={{ display: 'block', fontSize: '0.65rem', color: '#4ade80', fontWeight: '700', marginTop: '2px' }}>
                            -{_discountPct}% vol. discount
                          </span>
                        )}
                      </td>
                      <td data-label="Payment" style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-start' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            background: 'rgba(255,255,255,0.05)',
                            color: '#94a3b8',
                            fontSize: '0.75rem',
                            fontWeight: 'bold'
                          }}>
                            {order.payment_method === 'paypal' ? '💳 PayPal' : order.payment_method === 'sinpe' ? '📱 SINPE' : order.payment_method === 'card' ? '💳 Card' : '💬 WA'}
                          </span>
                          {getCardPaymentBadge(order) && (
                            <span style={{
                              padding: '3px 7px',
                              borderRadius: '999px',
                              background: getCardPaymentBadge(order).bg,
                              color: getCardPaymentBadge(order).color,
                              fontSize: '0.68rem',
                              fontWeight: 900,
                              whiteSpace: 'nowrap',
                            }}>
                              {getCardPaymentBadge(order).label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td data-label="Status" style={{ padding: '10px 12px' }}>
                        <select 
                          className="cell-select"
                          value={order.status || 'Pending'}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleOrderStatusUpdate(order.id, e.target.value);
                          }}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            width: '120px',
                            ...getStatusSelectStyle(order.status),
                            fontWeight: 'bold',
                            textAlign: 'center',
                            cursor: 'pointer'
                          }}
                        >
                          {statusOptionsFor(order.status).map(opt => (
                            <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.value}</option>
                          ))}
                        </select>
                      </td>
                      <td data-label="Agent" style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                          <select
                            className="cell-select"
                            value={order.sales_agent || ''}
                            onChange={(e) => handleOrderSalesAgentUpdate(order.id, e.target.value)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              width: '120px',
                              background: order.sales_agent ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255,255,255,0.03)',
                              color: order.sales_agent ? '#c084fc' : '#94a3b8',
                              fontWeight: 'bold',
                              border: order.sales_agent ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid rgba(255,255,255,0.05)',
                              textAlign: 'center',
                              cursor: 'pointer'
                            }}
                          >
                            <option value="">-- Unassigned --</option>
                            {agentOptionsFor(order).map(agent => (
                              <option key={agent} value={agent}>{agent}</option>
                            ))}
                          </select>
                          <span style={{ color: order.sales_agent ? '#a78bfa' : '#64748b', fontSize: '0.66rem', fontWeight: 800 }}>
                            {getOrderAgentSourceLabel(order)}
                          </span>
                        </div>
                      </td>
                      <td data-label="Actions" style={{ padding: '10px 12px' }}>
                        <div className="admin-card-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                          <button 
                            className="admin-btn" 
                            onClick={() => setSelectedOrderDetails(order)}
                            style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}
                          >
                            Details
                          </button>
                          
                          {/* Quick CTAs based on status */}
                          {group.id === 'needs_payment' && !paymentConfirmed && (
                            <button 
                              className="admin-btn admin-cta-btn" 
                              onClick={() => openPaymentReminder(order)}
                              style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              💬 Ask Payment
                            </button>
                          )}

                          {(group.id === 'paid' || (group.id === 'needs_payment' && paymentConfirmed)) && (
                            <button 
                              className="admin-btn admin-cta-btn" 
                              onClick={() => handleOrderStatusUpdate(order.id, 'Processing')}
                              style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}
                            >
                              🚚 Process
                            </button>
                          )}

                          {group.id === 'processing' && (
                            <>
                              <button 
                                className="admin-btn admin-cta-btn" 
                                onClick={() => handleOrderStatusUpdate(order.id, 'Order Complete')}
                                style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}
                              >
                                ✅ Complete
                              </button>
                            </>
                          )}

                          {/* Quick Agent Claim CTA */}
                          {!order.sales_agent && (
                            <button 
                              className="admin-btn admin-cta-btn" 
                              onClick={() => claimOrder(order.id)}
                              style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#a855f7', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}
                              title="Assign this order to yourself"
                            >
                              👤 Claim
                            </button>
                          )}

                           <button 
                            onClick={() => openOrderWhatsapp(order)}
                            className="admin-btn"
                            style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', color: '#4ade80', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            WhatsApp
                          </button>
                          <button
                            className="admin-btn"
                            onClick={() => handleDeleteOrder(order.id)}
                            style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', borderRadius: '6px' }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        </>
      )}
      
      {filteredOrders.length > 0 && (
        <div className="admin-pagination-bar">
          <div className="admin-pagination-info">
            Showing {Math.min(filteredOrders.length, (ordersCurrentPage - 1) * ordersPerPage + 1)} to {Math.min(filteredOrders.length, ordersCurrentPage * ordersPerPage)} of {filteredOrders.length} orders
          </div>
          <div className="admin-pagination-controls">
            <button 
              className="admin-pagination-btn"
              onClick={() => setOrdersCurrentPage(p => Math.max(1, p - 1))}
              disabled={ordersCurrentPage === 1}
            >
              &laquo; Prev
            </button>
            {Array.from({ length: totalOrdersPages }, (_, i) => i + 1)
              .filter(page => {
                return page === 1 || 
                       page === totalOrdersPages || 
                       Math.abs(page - ordersCurrentPage) <= 1;
              })
              .map((page, index, array) => {
                const elements = [];
                if (index > 0 && page - array[index - 1] > 1) {
                  elements.push(
                    <span key={`ell-${page}`} style={{ padding: '0 8px', color: '#64748b', fontSize: '0.8rem' }}>
                      ...
                    </span>
                  );
                }
                elements.push(
                  <button
                    key={page}
                    className={`admin-pagination-btn ${ordersCurrentPage === page ? 'active' : ''}`}
                    onClick={() => setOrdersCurrentPage(page)}
                  >
                    {page}
                  </button>
                );
                return elements;
              })
            }
            <button 
              className="admin-pagination-btn"
              onClick={() => setOrdersCurrentPage(p => Math.min(totalOrdersPages, p + 1))}
              disabled={ordersCurrentPage === totalOrdersPages}
            >
              Next &raquo;
            </button>
          </div>
          <div>
            <select
              className="admin-pagination-limit"
              value={ordersPerPage}
              onChange={(e) => {
                setOrdersPerPage(Number(e.target.value));
                setOrdersCurrentPage(1);
              }}
            >
              <option value={10}>Show 10</option>
              <option value={25}>Show 25</option>
              <option value={50}>Show 50</option>
              <option value={100}>Show 100</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
