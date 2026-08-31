import React, { useState, useEffect, useMemo } from 'react';
import { Zap, Loader, AlertTriangle, CheckCircle, Megaphone, RotateCcw, Clock, Search, X } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { formatCrInstant } from '@/lib/crTime.mjs';
import { toPercent, hasUntrackedStock, isUnavailableForDeal } from '@/lib/dealOfWeek.mjs';

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
/**
 * Which of the health checks actually failed.
 *
 * The card had all of this — bannerPresent, bannerActive, and a per-product
 * matchesDeal — and collapsed it into one sentence naming "a product price or
 * the live banner", leaving the reader to work out which, on which product.
 */
function dealHealthProblems(live) {
  const health = live?.health;
  if (!health || health.ok) return [];
  const problems = [];

  if (Date.now() > Date.parse(live.ends_at)) {
    problems.push('This deal is past its end time but still marked live.');
  }

  const named = (live.product_names || []).length;
  const found = (health.products || []).length;
  if (found < named) {
    problems.push(`${named - found} of the ${named} products in this deal could not be found — they may have been renamed or removed.`);
  }

  const drifted = (health.products || []).filter((product) => !product.matchesDeal);
  if (drifted.length > 0) {
    problems.push(`Priced differently from what launch wrote: ${drifted.map((product) => product.product).join(', ')}.`);
  }

  if (!health.bannerPresent) problems.push('The storefront banner for this deal is missing.');
  else if (!health.bannerActive) problems.push('The storefront banner for this deal is switched off, so nobody is being told about it.');

  return problems.length > 0 ? problems : ['Something about this deal no longer matches the storefront.'];
}

export default function DealOfWeekPanel({ products = [], onSendAnnouncement, onProductsChanged }) {
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
  const [productQuery, setProductQuery] = useState('');
  const [confirmedHighDiscount, setConfirmedHighDiscount] = useState(false);
  const [allowUntrackedStock, setAllowUntrackedStock] = useState(false);
  const [showLaunchReview, setShowLaunchReview] = useState(false);

  const discountPct = useMemo(() => Number(percent) / 100, [percent]);
  const percentIsValid = Number(percent) > 0 && Number(percent) < 100;

  const outOfStockSelected = useMemo(() => (
    selected.filter((name) => {
      const row = products.find((p) => p.product === name);
      return row && isUnavailableForDeal(row);
    })
  ), [selected, products]);
  const untrackedStockSelected = useMemo(() => (
    selected.filter((name) => {
      const row = products.find((p) => p.product === name);
      return row && hasUntrackedStock(row);
    })
  ), [selected, products]);
  const visibleProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) => (
      String(product.product || '').toLowerCase().includes(query)
      || String(product.category || '').toLowerCase().includes(query)
    ));
  }, [productQuery, products]);

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

  // Setup survives a refresh or an accidental tab change. It is local to this
  // browser and cleared only after a successful launch.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('weekly_deal_draft_v2') || 'null');
      if (!saved) return;
      if (Array.isArray(saved.selected)) setSelected(saved.selected);
      if (saved.percent) setPercent(saved.percent);
      if (typeof saved.titleEn === 'string') setTitleEn(saved.titleEn);
      if (typeof saved.titleEs === 'string') setTitleEs(saved.titleEs);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('weekly_deal_draft_v2', JSON.stringify({ selected, percent, titleEn, titleEs }));
    } catch {}
  }, [selected, percent, titleEn, titleEs]);

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
            confirm_high_discount: confirmedHighDiscount,
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
  }, [selected, discountPct, titleEn, titleEs, percentIsValid, confirmedHighDiscount]);

  const toggleProduct = (name) => {
    setSelected((current) => (
      current.includes(name) ? current.filter((n) => n !== name) : [...current, name]
    ));
  };

  const handleLaunch = async () => {
    if (!preview) return;
    setShowLaunchReview(true);
  };

  const confirmLaunch = async () => {
    if (!preview) return;
    setShowLaunchReview(false);

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
          confirm_high_discount: confirmedHighDiscount,
          allow_untracked_stock: allowUntrackedStock,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Launch failed');

      setLaunched(data);
      setSelected([]);
      setTitleEn('');
      setTitleEs('');
      setPreview(null);
      setConfirmedHighDiscount(false);
      setAllowUntrackedStock(false);
      localStorage.removeItem('weekly_deal_draft_v2');
      await load();
      try {
        await onProductsChanged?.();
      } catch (refreshError) {
        console.warn('[weekly-deal] Product refresh after launch failed:', refreshError);
      }
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
      try {
        await onProductsChanged?.();
      } catch (refreshError) {
        console.warn('[weekly-deal] Product refresh after expiry failed:', refreshError);
      }
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
  const announcementDeal = launched || (live?.drafts ? { deal: live, drafts: live.drafts } : null);
  const announcementStatus = live?.announcement?.status || live?.announcement_status || (launched ? 'not_sent' : null);
  const announcementNeedsAction = announcementDeal && !['queued', 'scheduled', 'sending', 'completed'].includes(announcementStatus);

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
          <div className="weekly-deal-health-grid">
            <div className="weekly-deal-stat">
              <span>Storefront</span>
              <strong className={live.health?.ok ? 'is-good' : 'is-bad'}>
                {live.health?.ok ? 'Healthy' : 'Needs attention'}
              </strong>
            </div>
            <div className="weekly-deal-stat">
              <span>Announcement</span>
              <strong>{String(announcementStatus || 'not sent').replace(/_/g, ' ')}</strong>
            </div>
            <div className="weekly-deal-stat">
              <span>Attributed orders</span>
              <strong>{live.metrics?.orders ?? 0}</strong>
            </div>
            <div className="weekly-deal-stat">
              <span>Deal units</span>
              <strong>{live.metrics?.targetUnits ?? 0}</strong>
            </div>
            <div className="weekly-deal-stat">
              <span>Net revenue</span>
              <strong>${Number(live.metrics?.revenue?.usd || 0).toFixed(2)}</strong>
            </div>
            <div className="weekly-deal-stat">
              <span>WA / email reached</span>
              <strong>{Number(live.announcement?.delivery?.delivered || 0)}</strong>
            </div>
          </div>
          {live.health && !live.health.ok && (
            <div className="weekly-deal-inline-alert is-danger">
              <AlertTriangle size={16} />
              <span>
                {dealHealthProblems(live).map((problem) => <span key={problem} style={{ display: 'block' }}>{problem}</span>)}
                <span style={{ display: 'block', marginTop: '6px', opacity: 0.85 }}>
                  Ending the deal restores prices only where they still match what launch wrote, so a deliberate edit is never overwritten.
                </span>
              </span>
            </div>
          )}
          {live.metrics && !live.metrics.attributionReady && (
            <div className="weekly-deal-inline-alert">
              <AlertTriangle size={16} /> Deal attribution is waiting for the Weekly Deal process migration.
            </div>
          )}
        </div>
      )}

      {/* ---------- Drafts to send, after a launch ---------- */}
      {announcementDeal && (
        <div style={{ ...card, borderColor: 'rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6ee7b7', fontWeight: 800, fontSize: '0.9rem' }}>
            {announcementNeedsAction ? <AlertTriangle size={15} /> : <CheckCircle size={15} />}
            {announcementNeedsAction ? 'DEAL IS LIVE — ANNOUNCEMENT STILL NEEDS TO BE SENT' : `ANNOUNCEMENT ${String(announcementStatus || '').toUpperCase()}`}
          </div>
          <div style={{ color: '#d1fae5', fontSize: '0.84rem', margin: '10px 0 14px' }}>
            Prices are marked down and the site banner is up. Review the announcement below and
            send it from the Announcements screen, where you pick the audience.
          </div>

          <label style={labelStyle}>Email subject</label>
          <div style={{ background: '#0b1220', border: '1px solid #334155', borderRadius: '8px', padding: '10px 12px', color: '#f8fafc', fontSize: '0.85rem', marginBottom: '12px' }}>
            {announcementDeal.drafts.emailSubject}
          </div>

          <label style={labelStyle}>Message (sent on both WhatsApp and email)</label>
          <pre style={{ background: '#0b1220', border: '1px solid #334155', borderRadius: '8px', padding: '10px 12px', color: '#cbd5e1', fontSize: '0.8rem', whiteSpace: 'pre-wrap', margin: '0 0 14px' }}>
            {announcementDeal.drafts.message}
          </pre>

          {announcementNeedsAction && (
            <button
              className="admin-btn primary"
              onClick={() => onSendAnnouncement?.({
                message: announcementDeal.drafts.message,
                emailSubject: announcementDeal.drafts.emailSubject,
                whatsappTemplate: announcementDeal.drafts.whatsappTemplate || null,
                targetProducts: announcementDeal.deal?.product_names || [],
                sourceDealId: announcementDeal.deal?.id || null,
              })}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Megaphone size={15} /> Review &amp; send in Announcements
            </button>
          )}
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
          <div className="weekly-deal-product-search">
            <Search size={15} />
            <input
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder="Search products or categories"
              aria-label="Search deal products"
            />
            {productQuery && (
              <button type="button" onClick={() => setProductQuery('')} aria-label="Clear product search"><X size={14} /></button>
            )}
          </div>
          <div className="admin-input" style={{ width: '100%', maxHeight: '190px', overflowY: 'auto', padding: '8px 12px', background: '#0b1220', border: '1px solid #334155', borderRadius: '8px', marginBottom: '14px' }}>
            {visibleProducts.map((p) => {
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
                  <span className="weekly-deal-product-meta">
                    <span>{p.priceUsd}</span>
                    <small>{p.inventoryCount === null ? 'stock untracked' : `${p.inventoryCount} available`}</small>
                  </span>
                </label>
              );
            })}
            {visibleProducts.length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '8px' }}>No matching products found.</div>
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

          {untrackedStockSelected.length > 0 && (
            <label className="weekly-deal-confirm-row">
              <input
                type="checkbox"
                checked={allowUntrackedStock}
                onChange={(event) => setAllowUntrackedStock(event.target.checked)}
              />
              <span>
                <strong>Confirm stock manually.</strong> {untrackedStockSelected.join(', ')} {untrackedStockSelected.length === 1 ? 'has' : 'have'} no inventory count. I verified enough units are available for this deal.
              </span>
            </label>
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
              <div className="weekly-deal-stack-summary">
                <div><span>Deal alone</span><strong>{preview.safety?.pct}% off</strong></div>
                <div><span>At 5+ vials</span><strong>{preview.safety?.stackedAtFive}% off</strong></div>
                <div><span>At 10+ vials</span><strong>{preview.safety?.stackedAtTen}% off</strong></div>
              </div>
              {preview.safety?.needsConfirmation && (
                <label className="weekly-deal-confirm-row is-warning">
                  <input
                    type="checkbox"
                    checked={confirmedHighDiscount}
                    onChange={(event) => setConfirmedHighDiscount(event.target.checked)}
                  />
                  <span><strong>High-discount review:</strong> I understand that the 10+ vial total becomes {preview.safety.stackedAtTen}% off.</span>
                </label>
              )}
            </div>
          )}

          <button
            className="admin-btn primary"
            onClick={handleLaunch}
            disabled={!preview || isLaunching || isPreviewing || outOfStockSelected.length > 0 || (untrackedStockSelected.length > 0 && !allowUntrackedStock) || Boolean(preview?.safety?.needsConfirmation && !confirmedHighDiscount)}
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

      {showLaunchReview && preview && (
        <div className="weekly-deal-modal-backdrop" role="presentation" onMouseDown={() => setShowLaunchReview(false)}>
          <section
            className="weekly-deal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="weekly-deal-review-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="weekly-deal-modal-heading">
              <div>
                <span>Final review</span>
                <h4 id="weekly-deal-review-title">Launch {preview.safety?.pct}% weekly deal?</h4>
              </div>
              <button type="button" onClick={() => setShowLaunchReview(false)} aria-label="Close launch review">
                <X size={18} />
              </button>
            </div>

            <div className="weekly-deal-review-summary">
              <div><span>Products</span><strong>{preview.products.length}</strong></div>
              <div><span>Ends</span><strong>{formatCrInstant(preview.window.endsAt)}</strong></div>
              <div><span>Maximum stacked saving</span><strong>{preview.safety?.stackedAtTen}%</strong></div>
            </div>

            <div className="weekly-deal-review-products">
              {preview.products.map((product) => (
                <div key={product.product}>
                  <span>{product.product}</span>
                  <strong><s>{product.wasUsd}</s> → {product.nowUsd}</strong>
                  <small>{product.inventoryCount === null ? 'Stock manually verified' : `${product.inventoryCount} available`}</small>
                </div>
              ))}
            </div>

            <div className="weekly-deal-inline-alert is-warning">
              <AlertTriangle size={16} /> Launch changes the live catalog immediately. The announcement is created as a separate review step and is not sent automatically.
            </div>

            <div className="weekly-deal-modal-actions">
              <button type="button" className="admin-btn" onClick={() => setShowLaunchReview(false)}>Go back</button>
              <button type="button" className="admin-btn primary" onClick={confirmLaunch} disabled={isLaunching}>
                {isLaunching ? <Loader size={15} className="spin" /> : <Zap size={15} />}
                Confirm &amp; launch
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
