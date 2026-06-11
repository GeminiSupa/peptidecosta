'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, X, ClipboardList, Users, Target, Package } from 'lucide-react';

const TYPE_META = {
  order: { icon: ClipboardList, label: 'Order' },
  product: { icon: Package, label: 'Product' },
  lead: { icon: Target, label: 'Lead' },
  customer: { icon: Users, label: 'Customer' },
};

export default function GlobalSearch({
  open,
  onClose,
  orders = [],
  products = [],
  leads = [],
  onSelect,
}) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIdx(0);
    }
  }, [open]);

  const customers = useMemo(() => {
    const map = new Map();
    for (const o of orders) {
      const key = (o.customer_email || o.customer_phone || o.customer_name || '').toLowerCase();
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: o.customer_name,
          phone: o.customer_phone,
          email: o.customer_email,
        });
      }
    }
    return [...map.values()];
  }, [orders]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const out = [];

    for (const o of orders) {
      const hay = [
        o.order_number, o.customer_name, o.customer_phone, o.customer_email, o.id,
      ].filter(Boolean).join(' ').toLowerCase();
      if (hay.includes(q)) {
        out.push({
          type: 'order',
          id: o.id,
          title: `#${o.order_number || o.id.slice(0, 8)} — ${o.customer_name}`,
          sub: o.status || 'Pending',
          payload: o,
        });
      }
    }

    for (const p of products) {
      const hay = [p.product, p.category].filter(Boolean).join(' ').toLowerCase();
      if (hay.includes(q)) {
        out.push({
          type: 'product',
          id: p.id || p.product,
          title: p.product,
          sub: p.category || 'Product',
          payload: p,
        });
      }
    }

    for (const l of leads) {
      const hay = [l.name, l.email, l.phone, l.id].filter(Boolean).join(' ').toLowerCase();
      if (hay.includes(q)) {
        out.push({
          type: 'lead',
          id: l.id,
          title: l.name || l.email || 'Lead',
          sub: l.phone || l.email || '',
          payload: l,
        });
      }
    }

    for (const c of customers) {
      const hay = [c.name, c.email, c.phone].filter(Boolean).join(' ').toLowerCase();
      if (hay.includes(q)) {
        out.push({
          type: 'customer',
          id: c.id,
          title: c.name || c.email,
          sub: c.phone || c.email || '',
          payload: c,
        });
      }
    }

    return out.slice(0, 12);
  }, [query, orders, products, leads, customers]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIdx]) {
      e.preventDefault();
      onSelect(results[activeIdx]);
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [results, activeIdx, onSelect, onClose]);

  if (!open) return null;

  return (
    <div className="global-search-overlay" onClick={onClose}>
      <div className="global-search-panel" onClick={(e) => e.stopPropagation()}>
        <div className="global-search-input-row">
          <Search size={18} style={{ color: '#64748b', flexShrink: 0 }} />
          <input
            autoFocus
            className="global-search-input"
            placeholder="Search orders, products, leads, customers…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={handleKeyDown}
          />
          <kbd className="global-search-kbd">esc</kbd>
          <button type="button" className="global-search-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="global-search-results">
          {query.length < 2 ? (
            <p className="global-search-hint">Type at least 2 characters · ↑↓ navigate · Enter to open</p>
          ) : results.length === 0 ? (
            <p className="global-search-hint">No results for &ldquo;{query}&rdquo;</p>
          ) : (
            results.map((r, idx) => {
              const Meta = TYPE_META[r.type];
              const Icon = Meta.icon;
              return (
                <button
                  key={`${r.type}-${r.id}`}
                  type="button"
                  className={`global-search-result${idx === activeIdx ? ' active' : ''}`}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => { onSelect(r); onClose(); }}
                >
                  <Icon size={16} style={{ color: '#38bdf8', flexShrink: 0 }} />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div className="global-search-result-title">{r.title}</div>
                    <div className="global-search-result-sub">{r.sub}</div>
                  </div>
                  <span className="global-search-type">{Meta.label}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
