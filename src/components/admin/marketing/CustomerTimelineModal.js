"use client";

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Ban, Eye, Mail, MousePointerClick, Package, RefreshCw, ShoppingCart, UserPlus, X, Zap } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

const ICONS = {
  order: Package, cart: ShoppingCart, view: Eye, lead: UserPlus,
  click: MousePointerClick, open: Mail, journey: Zap, delivery: Mail,
  suppression: Ban, subscriber: UserPlus,
};

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0);

export default function CustomerTimelineModal({ contact, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (contact.email) params.set('email', contact.email);
    if (contact.phone) params.set('phone', contact.phone);
    adminFetch(`/api/admin/customer-timeline?${params}`)
      .then(async response => ({ response, payload: await response.json() }))
      .then(({ response, payload }) => {
        if (cancelled) return;
        if (!response.ok) throw new Error(payload.error || 'Unable to load customer profile');
        setData(payload);
      })
      .catch(loadError => { if (!cancelled) setError(loadError.message); });
    return () => { cancelled = true; };
  }, [contact.email, contact.phone]);

  return (
    <div className="mkt-modal-backdrop" onClick={onClose}>
      <div className="mkt-customer-profile" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Customer activity timeline">
        <div className="mkt-editor-header">
          <div><div className="mkt-panel-kicker">Unified customer profile</div><h3>{data?.profile.name || contact.name}</h3><p>{[data?.profile.email || contact.email, data?.profile.phone || contact.phone].filter(Boolean).join(' · ')}</p></div>
          <button className="mkt-btn mkt-btn-icon" onClick={onClose} aria-label="Close customer profile"><X size={17} /></button>
        </div>

        {!data && !error && <div className="mkt-loading-state"><RefreshCw className="mkt-spin" size={22} /> Building customer timeline…</div>}
        {error && <div className="mkt-warning-strip"><AlertTriangle size={15} /> {error}</div>}

        {data && <>
          <div className="mkt-profile-stats">
            <div><strong>{money(data.profile.totalRevenue)}</strong><span>Lifetime revenue</span></div>
            <div><strong>{data.profile.orderCount}</strong><span>Orders</span></div>
            <div><strong>{data.profile.activeCarts}</strong><span>Active carts</span></div>
            <div><strong>{data.profile.activeJourneys}</strong><span>Active journeys</span></div>
          </div>

          {(data.profile.productInterests.length > 0 || data.profile.suppressions.length > 0) && <div className="mkt-profile-context">
            {data.profile.productInterests.length > 0 && <div><span>Product interest</span><div className="mkt-flex mkt-gap-1" style={{ flexWrap: 'wrap' }}>{data.profile.productInterests.map(product => <span className="mkt-badge mkt-badge-info" key={product}>{product}</span>)}</div></div>}
            {data.profile.suppressions.length > 0 && <div><span>Marketing restrictions</span><div className="mkt-flex mkt-gap-1">{data.profile.suppressions.map(item => <span className="mkt-badge mkt-badge-danger" key={`${item.channel}-${item.reason}`}>{item.channel}: {item.reason.replaceAll('_', ' ')}</span>)}</div></div>}
          </div>}

          {data.warnings.length > 0 && <div className="mkt-warning-strip"><AlertTriangle size={14} /> Partial profile: {data.warnings.join(', ')}</div>}
          <div className="mkt-timeline-heading"><h4>Activity timeline</h4><span>{data.timeline.length} events</span></div>
          <div className="mkt-timeline">
            {data.timeline.length === 0 ? <div className="mkt-empty-compact"><Eye size={24} /><span>No recorded activity</span></div> : data.timeline.map((item, index) => {
              const Icon = ICONS[item.type] || Zap;
              return <div className={`mkt-timeline-event type-${item.type}`} key={`${item.type}-${item.date}-${index}`}><div className="mkt-timeline-icon"><Icon size={14} /></div><div><div className="mkt-timeline-title"><strong>{item.title}</strong><time>{new Date(item.date).toLocaleString()}</time></div><p>{item.description}</p></div></div>;
            })}
          </div>
        </>}
      </div>
    </div>
  );
}
