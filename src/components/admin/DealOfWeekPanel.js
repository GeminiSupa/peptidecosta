import React, { useState, useEffect, useMemo } from 'react';
import { Zap, Loader, AlertTriangle, CheckCircle, Megaphone, RotateCcw, Clock } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { formatCrInstant } from '@/lib/crTime.mjs';
import { toPercent } from '@/lib/dealOfWeek.mjs';

/**
 * Deal of the Week — one promotion a week, ending Sunday midnight Costa Rica.
 *
 * A deal marks the chosen products' prices down for the week rather than issuing
 * a promo code, so the discount applies with nothing for the customer to type
 * and shows up identically in the cart, the order, the WhatsApp receipt and any
 * bot-generated checkout link. The automatic volume discount then stacks on top.
 *
 * Launch does NOT send the announcement. It marks the prices down and raises the
 * site banner, then hands the email and WhatsApp copy to the Announcements panel
 * so the send still goes through the audience picker and confirmation every
 * other broadcast uses.
 */
export default function DealOfWeekPanel({ products = [], onSendAnnouncement }) {
  const [live, setLive] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState([]);
  const [percent, setPercent] = useState(15);
  const [titleEn, setTitleEn] = useState('');
  const [titleEs, setTitleEs] = useState('');

  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [launched, setLaunched] = useState(null);

  const discountPct = useMemo(() => Number(percent) / 100, [percent]);
  const percentIsValid = Number(percent) > 0 && Number(percent) < 100;

  const outOfStockSelected = useMemo(() => (
    selected.filter((name) => {
      const row = products.find((p) => p.product === name);
      return row && row.status !== 'In Stock';
    })
  ), [selected, products]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await adminFetch('/api/admin/deals');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load deals');
      setLive(data.live || null);
      setRecent(data.recent || []);
    } catch (err) {
      setPreviewError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // The preview is the only place the resolved Sunday and the real before/after
  // prices appear, so it refreshes whenever the inputs change rather than
  // sitting behind a button the admin might not press.
  useEffect(() => {
    if (selected.length === 0 || !percentIsValid) {
      setPreview(null);
      setPreviewError('');
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setIsPreviewing(true);
        setPreviewError('');
        const res = await adminFetch('/api/admin/deals', {
          method: 'POST',
          body: JSON.stringify({
            action: 'preview',
            product_names: selected,
            discount_pct: discountPct,
            title_en: titleEn,
            title_es: titleEs,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Preview failed');
        setPreview(data);
      } catch (err) {
        if (!cancelled) { setPreview(null); setPreviewError(err.message); }
      } finally {
        if (!cancelled) setIsPreviewing(false);
      }
    }, 350);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [selected, discountPct, titleEn, titleEs, percentIsValid]);

  const toggleProduct = (name) => {
    setSelected((current) => (
      current.includes(name) ? current.filter((n) => n !== name) : [...current, name]
    ));
  };

  const handleLaunch = async () => {
    if (!preview) return;

    const lines = preview.products.map((p) => `  • ${p.product}: ${p.wasUsd} → ${p.nowUsd}`);
    const confirmed = window.confirm(
      `Launch this deal? Prices change on the live site immediately.\n\n`
      + `${lines.join('\n')}\n\n`
      + `Ends ${formatCrInstant(preview.window.endsAt)}.\n\n`
      + `Nothing is emailed or sent on WhatsApp yet — you review and send that next.`
    );
    if (!confirmed) return;

    try {
      setIsLaunching(true);
      const res = await adminFetch('/api/admin/deals', {
        method: 'POST',
        body: JSON.stringify({
          action: 'launch',
          product_names: selected,
          discount_pct: discountPct,
          title_en: titleEn,
          title_es: titleEs,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Launch failed');

      setLaunched(data);
      setSelected([]);
      setTitleEn('');
      setTitleEs('');
      setPreview(null);
      await load();
    } catch (err) {
      alert('Could not launch the deal: ' + err.message);
    } finally {
      setIsLaunching(false);
    }
  };

  const handleEnd = async () => {
    const confirmed = window.confirm(
      `End the deal now and put every price back?\n\n`
      + `${(live?.product_names || []).join(', ')}\n\n`
      + `The site banner comes down too.`
    );
    if (!confirmed) return;

    try {
      setIsEnding(true);
      const res = await adminFetch('/api/admin/deals', {
        method: 'POST',
        body: JSON.stringify({ action: 'end' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not end the deal');
      setLaunched(null);
      await load();
    } catch (err) {
      alert('Could not end the deal: ' + err.message);
    } finally {
      setIsEnding(false);
    }
  };

  const card = {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '18px',
    marginBottom: '16px',
  };
  const labelStyle = { display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 };

  return (
    <div className="admin-orders-tab">
      <div className="admin-toolbar">
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={18} color="#fbbf24" /> Deal of the Week
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: '4px 0 0' }}>
            One promotion for the week, ending Sunday at midnight Costa Rica time. The
            discount is applied to the shelf price — customers do not enter a code — and it
            stacks on top of the automatic volume discounts.
          </p>
        </div>
      </div>

      {loading && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8' }}>
          <Loader size={16} className="spin" /> Loading…
        </div>
      )}

      {/* ---------- The live deal ---------- */}
      {!loading && live && (
        <div style={{ ...card, borderColor: 'rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontWeight: 800, fontSize: '0.9rem' }}>
                <Zap size={15} /> LIVE NOW — {toPercent(live.discount_pct)}% OFF
              </div>
              <div style={{ color: '#f8fafc', fontSize: '0.95rem', fontWeight: 700, marginTop: '6px' }}>
                {(live.product_names || []).join(', ')}
              </div>
              <div style={{ color: '#cbd5e1', fontSize: '0.82rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={13} /> Ends {formatCrInstant(live.ends_at)}
              </div>
            </div>
            <button
              className="admin-btn"
              onClick={handleEnd}
              disabled={isEnding}
              style={{ background: '#7f1d1d', border: '1px solid #b91c1c', color: '#fee2e2', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {isEnding ? <Loader size={14} className="spin" /> : <RotateCcw size={14} />}
              End deal & restore prices
            </button>
          </div>
          <div style={{ marginTop: '12px', fontSize: '0.78rem', color: '#94a3b8' }}>
            Prices are restored automatically when the deal ends. This button is for ending it early.
          </div>
        </div>
      )}

      {/* ---------- Drafts to send, after a launch ---------- */}
      {launched && (
        <div style={{ ...card, borderColor: 'rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6ee7b7', fontWeight: 800, fontSize: '0.9rem' }}>
            <CheckCircle size={15} /> DEAL IS LIVE — announcement not sent yet
          </div>
          <div style={{ color: '#d1fae5', fontSize: '0.84rem', margin: '10px 0 14px' }}>
            Prices are marked down and the site banner is up. Review the announcement below and
            send it from the Announcements screen, where you pick the audience.
          </div>

          <label style={labelStyle}>Email subject</label>
          <div style={{ background: '#0b1220', border: '1px solid #334155', borderRadius: '8px', padding: '10px 12px', color: '#f8fafc', fontSize: '0.85rem', marginBottom: '12px' }}>
            {launched.drafts.emailSubject}
          </div>

          <label style={labelStyle}>Message (sent on both WhatsApp and email)</label>
          <pre style={{ background: '#0b1220', border: '1px solid #334155', borderRadius: '8px', padding: '10px 12px', color: '#cbd5e1', fontSize: '0.8rem', whiteSpace: 'pre-wrap', margin: '0 0 14px' }}>
            {launched.drafts.message}
          </pre>

          <button
            className="admin-btn primary"
            onClick={() => onSendAnnouncement?.({
              message: launched.drafts.message,
              emailSubject: launched.drafts.emailSubject,
              targetProducts: launched.deal?.product_names || [],
            })}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Megaphone size={15} /> Review &amp; send in Announcements
          </button>
        </div>
      )}

      {/* ---------- Set up the next deal ---------- */}
      {!loading && !live && (
        <div style={card}>
          <h4 style={{ margin: '0 0 14px', color: '#f8fafc', fontSize: '0.95rem' }}>Set up this week&apos;s deal</h4>

          <div style={{ display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Extra discount (%)</label>
              <input
                className="admin-input"
                type="number"
                min="1"
                max="99"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                On top of volume discounts, not instead of them.
              </div>
            </div>
            <div>
              <label style={labelStyle}>Ends</label>
              <div className="admin-input" style={{ width: '100%', color: preview ? '#f8fafc' : '#64748b' }}>
                {preview ? formatCrInstant(preview.window.endsAt) : 'Pick a product…'}
              </div>
              {preview?.window?.rolledForward && (
                <div style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '4px' }}>
                  This Sunday is less than a day away, so the deal runs to the following Sunday.
                </div>
              )}
            </div>
          </div>

          {/* A whole-store sale meant ticking every product one at a time, which
              is both tedious and the kind of thing that gets miscounted under
              time pressure — and this form does not survive a refresh, so it can
              have to be done twice. In-stock only is offered separately because
              a sold-out product can be marked down but not bought. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Products on deal</label>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              {selected.length} of {products.length} selected
            </span>
            <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
              <button
                type="button"
                className="admin-btn"
                style={{ padding: '3px 9px', fontSize: '0.72rem' }}
                onClick={() => setSelected(products.map((p) => p.product))}
              >
                Select all
              </button>
              <button
                type="button"
                className="admin-btn"
                style={{ padding: '3px 9px', fontSize: '0.72rem' }}
                onClick={() => setSelected(products.filter((p) => p.status === 'In Stock').map((p) => p.product))}
              >
                In stock only
              </button>
              <button
                type="button"
                className="admin-btn"
                style={{ padding: '3px 9px', fontSize: '0.72rem' }}
                onClick={() => setSelected([])}
                disabled={selected.length === 0}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="admin-input" style={{ width: '100%', maxHeight: '190px', overflowY: 'auto', padding: '8px 12px', background: '#0b1220', border: '1px solid #334155', borderRadius: '8px', marginBottom: '14px' }}>
            {products.map((p) => {
              const isChecked = selected.includes(p.product);
              return (
                <label key={p.id || p.product} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#f8fafc' }}>
                  <input
                    type="checkbox"
                    style={{ width: '16px', height: '16px', accentColor: '#fbbf24', cursor: 'pointer' }}
                    checked={isChecked}
                    onChange={() => toggleProduct(p.product)}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: isChecked ? 'bold' : 'normal', color: isChecked ? '#fbbf24' : '#e2e8f0' }}>
                    {p.product}
                  </span>
                  {/* Stock is shown because a deal on something nobody can buy
                      is a wasted week — and out-of-stock rows sort to the
                      bottom of the catalog regardless of the sale ribbon. */}
                  {p.status !== 'In Stock' && (
                    <span style={{ fontSize: '0.7rem', color: '#f87171', border: '1px solid rgba(248,113,113,0.4)', borderRadius: '4px', padding: '1px 5px' }}>
                      {p.status}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#64748b' }}>{p.priceUsd}</span>
                </label>
              );
            })}
            {products.length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '8px' }}>No products found…</div>
            )}
          </div>

          <div style={{ display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Banner text EN (optional)</label>
              <input
                className="admin-input"
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                placeholder="Leave blank to generate it"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Banner text ES (optional)</label>
              <input
                className="admin-input"
                value={titleEs}
                onChange={(e) => setTitleEs(e.target.value)}
                placeholder="Dejar vacío para generarlo"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {outOfStockSelected.length > 0 && (
            <div style={{ padding: '10px 14px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '10px', fontSize: '0.82rem', color: '#fca5a5', marginBottom: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>
                <strong>{outOfStockSelected.join(', ')}</strong> {outOfStockSelected.length === 1 ? 'is' : 'are'} not in stock.
                The price will be marked down and the deal will still run, but the catalog sorts
                out-of-stock products to the bottom and nobody can add them to a cart. Fix the
                stock status in the Products tab first, or leave {outOfStockSelected.length === 1 ? 'it' : 'them'} out.
              </span>
            </div>
          )}

          {previewError && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', fontSize: '0.82rem', color: '#fca5a5', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={15} /> {previewError}
            </div>
          )}

          {isPreviewing && !preview && (
            <div style={{ color: '#94a3b8', fontSize: '0.82rem', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Loader size={14} className="spin" /> Working out the new prices…
            </div>
          )}

          {preview && (
            <div style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 700, marginBottom: '10px' }}>
                What customers will see
              </div>
              <table style={{ width: '100%', fontSize: '0.83rem', color: '#e2e8f0', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#94a3b8', textAlign: 'left', fontSize: '0.75rem' }}>
                    <th style={{ padding: '4px 0' }}>Product</th>
                    <th style={{ padding: '4px 0' }}>Was</th>
                    <th style={{ padding: '4px 0' }}>Now</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.products.map((p) => (
                    <tr key={p.product} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '6px 0' }}>{p.product}</td>
                      <td style={{ padding: '6px 0', textDecoration: 'line-through', color: '#94a3b8' }}>{p.wasUsd}</td>
                      <td style={{ padding: '6px 0', color: '#fca5a5', fontWeight: 700 }}>{p.nowUsd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: '12px', fontSize: '0.78rem', color: '#cbd5e1' }}>
                <strong>Banner:</strong> {preview.banner.en}
              </div>
              <div style={{ marginTop: '10px', fontSize: '0.78rem', color: '#94a3b8' }}>
                These products get the orange sale ribbon and move to the top of the catalog.
                A customer buying 5+ vials still gets their 15% volume discount on top of this price.
              </div>
            </div>
          )}

          <button
            className="admin-btn primary"
            onClick={handleLaunch}
            disabled={!preview || isLaunching || isPreviewing}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {isLaunching ? <Loader size={15} className="spin" /> : <Zap size={15} />}
            Launch deal
          </button>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '8px' }}>
            Launching changes prices on the live site right away. The email and WhatsApp
            announcement is drafted for you to review and send afterwards.
          </div>
        </div>
      )}

      {/* ---------- History ---------- */}
      {!loading && recent.length > 0 && (
        <div style={card}>
          <h4 style={{ margin: '0 0 12px', color: '#f8fafc', fontSize: '0.95rem' }}>Past deals</h4>
          <div style={{ display: 'grid', gap: '8px' }}>
            {recent.filter((deal) => deal.status !== 'live').map((deal) => (
              <div key={deal.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.82rem' }}>
                <span style={{ color: '#e2e8f0' }}>
                  <strong>{toPercent(deal.discount_pct)}%</strong> — {(deal.product_names || []).join(', ')}
                </span>
                <span style={{ color: '#64748b' }}>ended {formatCrInstant(deal.ended_at || deal.ends_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
