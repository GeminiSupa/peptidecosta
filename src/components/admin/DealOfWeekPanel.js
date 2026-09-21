import React, { useState, useEffect, useMemo } from 'react';
import { Zap, Loader, AlertTriangle, CheckCircle, Megaphone, RotateCcw, Clock, Search, X, CalendarClock } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { formatCrInstant, formatCrDate, crWallToIso, isoToCrWall } from '@/lib/crTime.mjs';
import { toPercent, hasUntrackedStock, isUnavailableForDeal } from '@/lib/dealOfWeek.mjs';
import { OFFERS_PRICING_MODE, dealOfferRuleSummaries, dealOfferSummaries, dealOffersError, normalizeDealOffers } from '@/lib/dealOffers.mjs';
import { isBacWater } from '@/lib/bacWater.mjs';

/**
 * Deal of the Week — one promotion a week, ending Sunday midnight Costa Rica.
 *
 * A deal can mark chosen products down, apply a quantity discount, or run the
 * configurable Mix & Match / Buy & Get Free offers. Customers never need a
 * promo code, and checkout enforces the same settings the admin previews here.
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

const TIME_FIELDS = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };

/**
 * A deal time in Costa Rica AND on the reader's own clock. The business runs on
 * Costa Rica time, but the team schedules from Pakistan (11 hours ahead), so a
 * start typed as "Monday 00:00" has to show that it is Monday 11:00 for them.
 */
function DealTime({ iso }) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  let zone = '';
  let viewer = '';
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    viewer = new Intl.DateTimeFormat('en-US', TIME_FIELDS).format(new Date(iso));
  } catch {}
  return (
    <span>
      <strong>{formatCrDate(iso, TIME_FIELDS)}</strong> Costa Rica
      {viewer && zone !== 'America/Costa_Rica' && (
        <span style={{ color: '#94a3b8' }}> · {viewer} your time{zone ? ` (${zone})` : ''}</span>
      )}
    </span>
  );
}

/** "40% OFF" for a one-discount deal; both offers, in words, for a two-offer deal. */
function dealHeadline(deal) {
  if (deal?.pricing_mode === OFFERS_PRICING_MODE) return dealOfferSummaries(deal.offers, 'en').join('  ·  OR  ·  ').toUpperCase();
  return `${toPercent(deal?.discount_pct)}% OFF`;
}

function dealModeLine(deal) {
  if (deal?.pricing_mode === OFFERS_PRICING_MODE) return 'Two offers · each order gets whichever saves more';
  if (deal?.pricing_mode === 'bulk_threshold') {
    return `Automatic mix-and-match · ${deal.min_units}+ selected units${deal.max_units ? ` · maximum ${deal.max_units}` : ''}`;
  }
  return 'Automatic instant product sale';
}

/** The deal's products; for a two-offer deal, each offer's own list. */
function DealProductsLine({ deal }) {
  if (deal?.pricing_mode !== OFFERS_PRICING_MODE) return <>{(deal?.product_names || []).join(', ')}</>;
  const offers = normalizeDealOffers(deal.offers);
  return (
    <>
      {offers.mix.enabled && <span style={{ display: 'block' }}>Mix &amp; Match: {offers.mix.product_names.join(', ')}</span>}
      {offers.bundle.enabled && <span style={{ display: 'block' }}>Buy {offers.bundle.buy_qty} Get {offers.bundle.free_qty}: {offers.bundle.product_names.join(', ')}</span>}
    </>
  );
}

/**
 * A product checklist with search and the three bulk buttons. Each offer in a
 * two-offer deal has its own, because the owner may want Buy-4-Get-1 on only
 * some of the Mix & Match products.
 */
const OFFER_SCOPE_AVAILABLE = 'available';
const OFFER_SCOPE_CUSTOM = 'custom';
const OFFER_SCOPE_SAME_AS_MIX = 'same_as_mix';

function availableOfferProductNames(products) {
  return products
    .filter((product) => !isBacWater(product.product) && !isUnavailableForDeal(product))
    .map((product) => product.product);
}

function OfferProductPicker({
  products,
  scope,
  onScopeChange,
  selected,
  customSelected,
  onCustomChange,
  accent,
  allowSameAsMix = false,
}) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    // BAC water can never be an offer product, so it is not offered here.
    const eligible = products.filter((product) => !isBacWater(product.product));
    if (!q) return eligible;
    return eligible.filter((product) => (
      String(product.product || '').toLowerCase().includes(q)
      || String(product.category || '').toLowerCase().includes(q)
    ));
  }, [query, products]);
  const toggle = (name) => onCustomChange(customSelected.includes(name) ? customSelected.filter((n) => n !== name) : [...customSelected, name]);
  const small = { padding: '3px 9px', fontSize: '0.72rem' };
  const scopeOptions = [
    {
      value: OFFER_SCOPE_AVAILABLE,
      title: 'All available peptide products',
      help: 'Recommended · automatically excludes BAC Water and unavailable products.',
    },
    ...(allowSameAsMix ? [{
      value: OFFER_SCOPE_SAME_AS_MIX,
      title: 'Same products as Mix & Match',
      help: 'Keeps both offers aligned automatically.',
    }] : []),
    {
      value: OFFER_SCOPE_CUSTOM,
      title: 'Choose specific products',
      help: 'Use this only when the offer should cover part of the catalog.',
    },
  ];

  return (
    <div>
      <div className="weekly-deal-scope-options" role="group" aria-label="Which products qualify">
        {scopeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={scope === option.value ? 'is-active' : ''}
            aria-pressed={scope === option.value}
            onClick={() => onScopeChange(option.value)}
            style={scope === option.value ? { '--deal-scope-accent': accent } : undefined}
          >
            <strong>{option.title}</strong>
            <span>{option.help}</span>
          </button>
        ))}
      </div>
      <div className="weekly-deal-selection-summary">
        <CheckCircle size={14} /> {selected.length} qualifying product{selected.length === 1 ? '' : 's'} · BAC Water excluded
      </div>
      {scope === OFFER_SCOPE_CUSTOM && (
      <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{customSelected.length} manually selected</span>
        <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
          <button type="button" className="admin-btn" style={small} onClick={() => onCustomChange(availableOfferProductNames(products))}>Select available</button>
          <button type="button" className="admin-btn" style={small} onClick={() => onCustomChange([])} disabled={customSelected.length === 0}>Clear</button>
        </div>
      </div>
      <div className="weekly-deal-product-search">
        <Search size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products or categories" aria-label="Search offer products" />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear product search"><X size={14} /></button>}
      </div>
      <div className="admin-input" style={{ width: '100%', maxHeight: '170px', overflowY: 'auto', padding: '8px 12px', background: '#0b1220', border: '1px solid #334155', borderRadius: '8px' }}>
        {visible.map((p) => {
          const isChecked = customSelected.includes(p.product);
          return (
            <label key={p.id || p.product} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <input type="checkbox" style={{ width: '16px', height: '16px', accentColor: accent, cursor: 'pointer' }} checked={isChecked} onChange={() => toggle(p.product)} />
              <span style={{ fontSize: '0.85rem', fontWeight: isChecked ? 'bold' : 'normal', color: isChecked ? accent : '#e2e8f0' }}>{p.product}</span>
              {p.status !== 'In Stock' && (
                <span style={{ fontSize: '0.7rem', color: '#f87171', border: '1px solid rgba(248,113,113,0.4)', borderRadius: '4px', padding: '1px 5px' }}>{p.status}</span>
              )}
              <span className="weekly-deal-product-meta">
                <span>{p.priceUsd}</span>
                <small>{p.inventoryCount === null ? 'stock untracked' : `${p.inventoryCount} available`}</small>
              </span>
            </label>
          );
        })}
        {visible.length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '8px' }}>No matching products found.</div>}
      </div>
      </>
      )}
    </div>
  );
}

/** The first whole minute at or after an instant, as a CR datetime-local value. */
function crWallAtOrAfter(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return isoToCrWall(new Date(Math.ceil(ms / 60000) * 60000).toISOString());
}

export default function DealOfWeekPanel({ products = [], onSendAnnouncement, onProductsChanged }) {
  const [live, setLive] = useState(null);
  const [scheduled, setScheduled] = useState(null);
  const [startMode, setStartMode] = useState('now');
  const [startWall, setStartWall] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState([]);
  const [percent, setPercent] = useState(15);
  const [minUnits, setMinUnits] = useState(20);
  const [maxUnits, setMaxUnits] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [titleEs, setTitleEs] = useState('');

  // 'single' is the one-discount deal; 'offers' runs Mix & Match and
  // Buy X Get Y side by side, each on its own products.
  const [dealType, setDealType] = useState('single');
  const [mixEnabled, setMixEnabled] = useState(true);
  const [mixScope, setMixScope] = useState(OFFER_SCOPE_AVAILABLE);
  const [mixSelected, setMixSelected] = useState([]);
  const [mixMin, setMixMin] = useState(2);
  const [mixPct, setMixPct] = useState(10);
  const [bundleEnabled, setBundleEnabled] = useState(true);
  const [bundleScope, setBundleScope] = useState(OFFER_SCOPE_SAME_AS_MIX);
  const [bundleSelected, setBundleSelected] = useState([]);
  const [bundleBuy, setBundleBuy] = useState(4);
  const [bundleFree, setBundleFree] = useState(1);

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

  const isScheduling = startMode === 'later';
  const startsAtIso = isScheduling ? crWallToIso(startWall) : null;
  const discountPct = useMemo(() => Number(percent) / 100, [percent]);
  const percentIsValid = Number(percent) > 0 && Number(percent) < 100;
  const parsedMinUnits = Math.floor(Number(minUnits));
  const parsedMaxUnits = Math.floor(Number(maxUnits));
  const isOffers = dealType === 'offers';
  const pricingMode = isOffers
    ? 'offers'
    : (Number.isFinite(parsedMinUnits) && parsedMinUnits > 1 ? 'bulk_threshold' : 'shelf');
  const bulkUnitRangeError = isOffers ? '' : minUnits !== '' && (!Number.isFinite(parsedMinUnits) || parsedMinUnits < 1)
    ? 'Minimum selected units must be at least 1. Use 1 when the deal should apply immediately.'
    : (pricingMode === 'bulk_threshold' && maxUnits !== '' && (!Number.isFinite(parsedMaxUnits) || parsedMaxUnits < parsedMinUnits)
      ? 'Maximum selected units cannot be lower than the minimum.'
      : '');

  const availableProducts = useMemo(() => availableOfferProductNames(products), [products]);
  const resolvedMixProducts = mixScope === OFFER_SCOPE_AVAILABLE ? availableProducts : mixSelected;
  const resolvedBundleProducts = bundleScope === OFFER_SCOPE_SAME_AS_MIX
    ? resolvedMixProducts
    : (bundleScope === OFFER_SCOPE_AVAILABLE ? availableProducts : bundleSelected);
  const offersPayload = useMemo(() => ({
    mix: { enabled: mixEnabled, product_names: resolvedMixProducts, min_units: Number(mixMin), discount_pct: Number(mixPct) / 100 },
    bundle: { enabled: bundleEnabled, product_names: resolvedBundleProducts, buy_qty: Number(bundleBuy), free_qty: Number(bundleFree) },
  }), [mixEnabled, resolvedMixProducts, mixMin, mixPct, bundleEnabled, resolvedBundleProducts, bundleBuy, bundleFree]);
  const offersError = isOffers ? dealOffersError(offersPayload) : '';
  // Every product the deal touches, whichever type it is.
  const dealProducts = useMemo(() => (
    isOffers
      ? [...new Set([...(mixEnabled ? resolvedMixProducts : []), ...(bundleEnabled ? resolvedBundleProducts : [])])]
      : selected
  ), [isOffers, mixEnabled, resolvedMixProducts, bundleEnabled, resolvedBundleProducts, selected]);

  const outOfStockSelected = useMemo(() => (
    dealProducts.filter((name) => {
      const row = products.find((p) => p.product === name);
      return row && isUnavailableForDeal(row);
    })
  ), [dealProducts, products]);
  const untrackedStockSelected = useMemo(() => (
    dealProducts.filter((name) => {
      const row = products.find((p) => p.product === name);
      return row && hasUntrackedStock(row);
    })
  ), [dealProducts, products]);
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
      setScheduled(data.scheduled || null);
      setRecent(data.recent || []);
      // With a deal live, the only option is to schedule the next one, and
      // the natural start is the moment the live one ends.
      if (data.live) {
        setStartMode('later');
        setStartWall((current) => current || crWallAtOrAfter(data.live.ends_at));
      }
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
      if (saved.minUnits) setMinUnits(saved.minUnits);
      else if (saved.pricingMode === 'shelf') setMinUnits(1);
      if (saved.maxUnits !== undefined) setMaxUnits(saved.maxUnits);
      if (typeof saved.titleEn === 'string') setTitleEn(saved.titleEn);
      if (typeof saved.titleEs === 'string') setTitleEs(saved.titleEs);
      if (saved.dealType === 'offers') setDealType('offers');
      if (saved.offers) {
        const { mix = {}, bundle = {} } = saved.offers;
        if (typeof mix.enabled === 'boolean') setMixEnabled(mix.enabled);
        if ([OFFER_SCOPE_AVAILABLE, OFFER_SCOPE_CUSTOM].includes(saved.mixScope)) setMixScope(saved.mixScope);
        else if (Array.isArray(mix.product_names) && mix.product_names.length) setMixScope(OFFER_SCOPE_CUSTOM);
        if (Array.isArray(mix.product_names)) setMixSelected(mix.product_names);
        if (mix.min_units) setMixMin(mix.min_units);
        if (mix.discount_pct) setMixPct(Math.round(mix.discount_pct * 100));
        if (typeof bundle.enabled === 'boolean') setBundleEnabled(bundle.enabled);
        if ([OFFER_SCOPE_AVAILABLE, OFFER_SCOPE_CUSTOM, OFFER_SCOPE_SAME_AS_MIX].includes(saved.bundleScope)) setBundleScope(saved.bundleScope);
        else if (Array.isArray(bundle.product_names) && bundle.product_names.length) setBundleScope(OFFER_SCOPE_CUSTOM);
        if (Array.isArray(bundle.product_names)) setBundleSelected(bundle.product_names);
        if (bundle.buy_qty) setBundleBuy(bundle.buy_qty);
        if (bundle.free_qty) setBundleFree(bundle.free_qty);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('weekly_deal_draft_v2', JSON.stringify({
        selected, percent, pricingMode, minUnits, maxUnits, titleEn, titleEs, dealType,
        offers: offersPayload, mixScope, bundleScope,
      }));
    } catch {}
  }, [selected, percent, pricingMode, minUnits, maxUnits, titleEn, titleEs, dealType, offersPayload, mixScope, bundleScope]);

  // The preview is the only place the resolved Sunday and the real before/after
  // prices appear, so it refreshes whenever the inputs change rather than
  // sitting behind a button the admin might not press.
  useEffect(() => {
    if (dealProducts.length === 0 || offersError || (!isOffers && (!percentIsValid || bulkUnitRangeError))) {
      setPreview(null);
      // "Pick a product" is not an error worth shouting; a bad setting is.
      setPreviewError(dealProducts.length === 0 && isOffers ? '' : (offersError || bulkUnitRangeError));
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
            product_names: dealProducts,
            offers: isOffers ? offersPayload : null,
            discount_pct: discountPct,
            title_en: titleEn,
            title_es: titleEs,
            confirm_high_discount: confirmedHighDiscount,
            pricing_mode: pricingMode,
            min_units: minUnits,
            max_units: maxUnits,
            starts_at: startsAtIso,
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
  }, [dealProducts, discountPct, pricingMode, minUnits, maxUnits, titleEn, titleEs, percentIsValid, confirmedHighDiscount, bulkUnitRangeError, startsAtIso, isOffers, offersPayload, offersError]);

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
          action: isScheduling ? 'schedule' : 'launch',
          starts_at: startsAtIso,
          product_names: dealProducts,
          offers: isOffers ? offersPayload : null,
          discount_pct: discountPct,
          title_en: titleEn,
          title_es: titleEs,
          confirm_high_discount: confirmedHighDiscount,
          allow_untracked_stock: allowUntrackedStock,
          pricing_mode: pricingMode,
          min_units: minUnits,
          max_units: maxUnits,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || (isScheduling ? 'Scheduling failed' : 'Launch failed'));

      // A scheduled deal has not touched the storefront, so there is no
      // announcement to hand over yet.
      if (!isScheduling) setLaunched(data);
      setStartWall('');
      setSelected([]);
      setMixScope(OFFER_SCOPE_AVAILABLE);
      setMixSelected([]);
      setBundleScope(OFFER_SCOPE_SAME_AS_MIX);
      setBundleSelected([]);
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
      alert(`Could not ${isScheduling ? 'schedule' : 'launch'} the deal: ${err.message}`);
    } finally {
      setIsLaunching(false);
    }
  };

  const handleCancelSchedule = async () => {
    if (!window.confirm('Cancel the scheduled deal? It will not start. Nothing on the site changes.')) return;
    try {
      setIsCancelling(true);
      const res = await adminFetch('/api/admin/deals', {
        method: 'POST',
        body: JSON.stringify({ action: 'cancel_schedule' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not cancel the scheduled deal');
      await load();
    } catch (err) {
      alert('Could not cancel the scheduled deal: ' + err.message);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleEnd = async () => {
    const restoresPrices = !['bulk_threshold', OFFERS_PRICING_MODE].includes(live?.pricing_mode);
    const confirmed = window.confirm(
      `${restoresPrices ? 'End the deal now and put every price back?' : 'End the deal now?'}\n\n`
      + `${(live?.product_names || []).join(', ')}\n\n`
      + `The deal and site banner will stop immediately.`
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
  // Threshold and two-offer deals leave shelf prices alone: nothing to restore.
  const liveIsBulk = ['bulk_threshold', OFFERS_PRICING_MODE].includes(live?.pricing_mode);
  const announcementIsBulk = ['bulk_threshold', OFFERS_PRICING_MODE].includes(announcementDeal?.deal?.pricing_mode);
  const offerRules = isOffers ? dealOfferRuleSummaries(offersPayload, 'en') : [];
  const termsReady = isOffers ? !offersError : (percentIsValid && !bulkUnitRangeError);
  const productsReady = dealProducts.length > 0;
  const timingReady = !isScheduling || Boolean(startsAtIso);
  const previewReady = Boolean(preview) && !isPreviewing;
  const setupSteps = [
    { label: 'Offer terms', ready: termsReady },
    { label: 'Qualifying products', ready: productsReady },
    { label: 'Start time', ready: timingReady },
    { label: 'Customer preview', ready: previewReady },
  ];
  const launchBlocker = !termsReady
    ? (offersError || bulkUnitRangeError || 'Enter a valid discount.')
    : !productsReady
      ? 'Choose which products qualify.'
      : !timingReady
        ? 'Choose the scheduled start date and time.'
        : outOfStockSelected.length > 0
          ? 'Remove unavailable products before continuing.'
          : untrackedStockSelected.length > 0 && !allowUntrackedStock
            ? 'Confirm the stock for products without an inventory count.'
            : preview?.safety?.needsConfirmation && !confirmedHighDiscount
              ? 'Approve the high-discount review shown above.'
              : !preview
                ? (isPreviewing ? 'Preparing the customer preview…' : (previewError || 'Waiting for the customer preview.'))
                : !isScheduling && Boolean(live)
                  ? 'A deal is already live. Schedule this deal or end the live one first.'
                  : '';

  return (
    <div className="admin-orders-tab">
      <div className="admin-toolbar">
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={18} color="#fbbf24" /> Deal of the Week
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: '4px 0 0' }}>
            One promotion for the week, ending Sunday at midnight Costa Rica time. The
            discount is applied automatically — customers do not enter a code. Weekly deals
            replace volume pricing and cannot stack with promo codes.
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
                <Zap size={15} /> LIVE NOW — {dealHeadline(live)}
              </div>
              <div style={{ color: '#f8fafc', fontSize: '0.95rem', fontWeight: 700, marginTop: '6px' }}>
                <DealProductsLine deal={live} />
              </div>
              <div style={{ color: '#cbd5e1', fontSize: '0.82rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={13} /> Ends <DealTime iso={live.ends_at} />
              </div>
              <div style={{ color: '#fbbf24', fontSize: '0.78rem', marginTop: '6px' }}>
                {dealModeLine(live)} · no code · no stacking
              </div>
            </div>
            <button
              className="admin-btn"
              onClick={handleEnd}
              disabled={isEnding}
              style={{ background: '#7f1d1d', border: '1px solid #b91c1c', color: '#fee2e2', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {isEnding ? <Loader size={14} className="spin" /> : <RotateCcw size={14} />}
              {liveIsBulk ? 'End deal' : 'End deal & restore prices'}
            </button>
          </div>
          <div style={{ marginTop: '12px', fontSize: '0.78rem', color: '#94a3b8' }}>
            {liveIsBulk
              ? 'The automatic checkout discount and banner stop when the deal ends. This button ends it early.'
              : 'Prices are restored automatically when the deal ends. This button is for ending it early.'}
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
            {announcementIsBulk ? 'The automatic checkout discount' : 'The marked-down prices'} and site banner are live.
            {' '}Review the announcement below and send it from the Announcements screen, where you pick the audience.
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

      {/* ---------- The scheduled deal ---------- */}
      {!loading && scheduled && (
        <div style={{ ...card, borderColor: 'rgba(96,165,250,0.45)', background: 'rgba(96,165,250,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#93c5fd', fontWeight: 800, fontSize: '0.9rem' }}>
                <CalendarClock size={15} /> SCHEDULED — {dealHeadline(scheduled)}
              </div>
              <div style={{ color: '#f8fafc', fontSize: '0.95rem', fontWeight: 700, marginTop: '6px' }}>
                <DealProductsLine deal={scheduled} />
              </div>
              <div style={{ color: '#cbd5e1', fontSize: '0.82rem', marginTop: '6px' }}>
                Starts <DealTime iso={scheduled.starts_at} />
              </div>
              <div style={{ color: '#cbd5e1', fontSize: '0.82rem', marginTop: '4px' }}>
                Ends <DealTime iso={scheduled.ends_at} />
              </div>
              <div style={{ color: '#93c5fd', fontSize: '0.78rem', marginTop: '6px' }}>
                {dealModeLine(scheduled)} · no code · no stacking
              </div>
            </div>
            <button
              className="admin-btn"
              onClick={handleCancelSchedule}
              disabled={isCancelling}
              style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {isCancelling ? <Loader size={14} className="spin" /> : <X size={14} />}
              Cancel schedule
            </button>
          </div>
          <div style={{ marginTop: '12px', fontSize: '0.78rem', color: '#94a3b8' }}>
            It starts on its own within 5 minutes of the start time: banner, discount and prices, the same as pressing Launch.
            The A/B test on the Deal of the Week page carries on by itself. The announcement is not sent automatically —
            come back after it starts to review and send it.
          </div>
          {(scheduled.problems || []).length > 0 ? (
            <div className="weekly-deal-inline-alert is-danger">
              <AlertTriangle size={16} />
              <span>
                {scheduled.problems.map((problem) => <span key={problem} style={{ display: 'block' }}>{problem}</span>)}
              </span>
            </div>
          ) : (
            <div className="weekly-deal-inline-alert">
              <CheckCircle size={16} /> Ready to start — no problems found right now.
            </div>
          )}
        </div>
      )}

      {/* ---------- Set up the next deal ---------- */}
      {!loading && !scheduled && (
        <div style={card}>
          <h4 style={{ margin: '0 0 14px', color: '#f8fafc', fontSize: '0.95rem' }}>
            {live ? 'Schedule the next deal' : 'Set up this week’s deal'}
          </h4>

          <div className="weekly-deal-setup-progress" aria-label="Deal setup progress">
            {setupSteps.map((step, index) => (
              <div key={step.label} className={step.ready ? 'is-ready' : ''}>
                <span>{step.ready ? <CheckCircle size={14} /> : index + 1}</span>
                <strong>{step.label}</strong>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Start</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <button
                type="button"
                className={`admin-btn${startMode === 'now' ? ' primary' : ''}`}
                onClick={() => setStartMode('now')}
                disabled={Boolean(live)}
                title={live ? 'A deal is live. End it first, or schedule this one.' : undefined}
              >
                Right now
              </button>
              <button
                type="button"
                className={`admin-btn${startMode === 'later' ? ' primary' : ''}`}
                onClick={() => {
                  setStartMode('later');
                  if (!startWall && live) setStartWall(crWallAtOrAfter(live.ends_at));
                }}
              >
                At a date and time
              </button>
            </div>
            {isScheduling && (
              <div style={{ display: 'grid', gap: '6px', maxWidth: '420px' }}>
                <input
                  className="admin-input"
                  type="datetime-local"
                  value={startWall}
                  onChange={(e) => setStartWall(e.target.value)}
                  aria-label="Start date and time, Costa Rica time"
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: '0.75rem', color: '#fbbf24' }}>
                  Type the start in <strong>Costa Rica time</strong>, not your own.
                </div>
                {startsAtIso && (
                  <div style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                    Starts <DealTime iso={startsAtIso} />
                  </div>
                )}
                {live && (
                  <button
                    type="button"
                    className="admin-btn"
                    style={{ justifySelf: 'start', padding: '3px 9px', fontSize: '0.72rem' }}
                    onClick={() => setStartWall(crWallAtOrAfter(live.ends_at))}
                  >
                    Start when the current deal ends
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Deal type</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" className={`admin-btn${!isOffers ? ' primary' : ''}`} onClick={() => setDealType('single')}>
                One discount
              </button>
              <button type="button" className={`admin-btn${isOffers ? ' primary' : ''}`} onClick={() => setDealType('offers')}>
                Two offers (Mix &amp; Match + Buy &amp; Get Free)
              </button>
            </div>
            {isOffers && (
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px' }}>
                Offers never stack. If an order qualifies for both — or its normal volume discount is bigger — the customer
                automatically gets whichever one saves the most. BAC Water never counts toward an offer.
              </div>
            )}
          </div>

          {isOffers && (
            <>
              <div style={{ display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', marginBottom: '14px' }}>
                <div style={{ border: `1px solid ${mixEnabled ? 'rgba(251,191,36,0.45)' : '#334155'}`, borderRadius: '10px', padding: '14px', opacity: mixEnabled ? 1 : 0.6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontWeight: 800, fontSize: '0.88rem', marginBottom: '10px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={mixEnabled}
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        setMixEnabled(enabled);
                        if (!enabled && bundleScope === OFFER_SCOPE_SAME_AS_MIX) setBundleScope(OFFER_SCOPE_AVAILABLE);
                      }}
                      style={{ accentColor: '#fbbf24' }}
                    />
                    Offer #1: Mix &amp; Match
                  </label>
                  <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: '1fr 1fr', marginBottom: '8px' }}>
                    <div>
                      <label style={labelStyle}>Buy at least (vials)</label>
                      <input className="admin-input" type="number" min="1" value={mixMin} onChange={(e) => setMixMin(e.target.value)} style={{ width: '100%' }} disabled={!mixEnabled} />
                    </div>
                    <div>
                      <label style={labelStyle}>Discount on whole order (%)</label>
                      <input className="admin-input" type="number" min="1" max="99" value={mixPct} onChange={(e) => setMixPct(e.target.value)} style={{ width: '100%' }} disabled={!mixEnabled} />
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '8px' }}>
                    {mixMin || '?'}+ qualifying vials in any mix unlocks {mixPct || '?'}% off the entire order. BAC Water receives the discount but does not count toward the minimum.
                  </div>
                  {mixEnabled && (
                    <OfferProductPicker
                      products={products}
                      scope={mixScope}
                      onScopeChange={setMixScope}
                      selected={resolvedMixProducts}
                      customSelected={mixSelected}
                      onCustomChange={setMixSelected}
                      accent="#fbbf24"
                    />
                  )}
                </div>

                <div style={{ border: `1px solid ${bundleEnabled ? 'rgba(52,211,153,0.45)' : '#334155'}`, borderRadius: '10px', padding: '14px', opacity: bundleEnabled ? 1 : 0.6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 800, fontSize: '0.88rem', marginBottom: '10px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={bundleEnabled} onChange={(e) => setBundleEnabled(e.target.checked)} style={{ accentColor: '#34d399' }} />
                    Offer #2: Buy &amp; Get Free
                  </label>
                  <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: '1fr 1fr', marginBottom: '8px' }}>
                    <div>
                      <label style={labelStyle}>Buy (same product)</label>
                      <input className="admin-input" type="number" min="1" value={bundleBuy} onChange={(e) => setBundleBuy(e.target.value)} style={{ width: '100%' }} disabled={!bundleEnabled} />
                    </div>
                    <div>
                      <label style={labelStyle}>Get free</label>
                      <input className="admin-input" type="number" min="1" value={bundleFree} onChange={(e) => setBundleFree(e.target.value)} style={{ width: '100%' }} disabled={!bundleEnabled} />
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '8px' }}>
                    Every {bundleBuy || '?'} of one product adds {bundleFree || '?'} more of that same product free, automatically
                    ({Number(bundleBuy) * 2 || '?'} → {Number(bundleFree) * 2 || '?'} free). Free vials come out of stock like any other.
                  </div>
                  {bundleEnabled && (
                    <OfferProductPicker
                      products={products}
                      scope={bundleScope}
                      onScopeChange={setBundleScope}
                      selected={resolvedBundleProducts}
                      customSelected={bundleSelected}
                      onCustomChange={setBundleSelected}
                      accent="#34d399"
                      allowSameAsMix={mixEnabled}
                    />
                  )}
                </div>
              </div>
              <section className="weekly-deal-rules-card" aria-labelledby="weekly-deal-rules-title">
                <div>
                  <CheckCircle size={17} />
                  <span>
                    <strong id="weekly-deal-rules-title">Rules checkout will enforce automatically</strong>
                    <small>These update from the numbers and product choices above—no code changes required.</small>
                  </span>
                </div>
                {offersError ? (
                  <div className="weekly-deal-inline-alert is-danger"><AlertTriangle size={15} /> {offersError}</div>
                ) : (
                  <ul>
                    {offerRules.map((rule) => <li key={rule}>{rule}</li>)}
                  </ul>
                )}
              </section>
            </>
          )}

          <div style={{ display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '14px' }}>
            {!isOffers && (<>
            <div>
              <label style={labelStyle}>Deal discount (%)</label>
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
                This replaces volume discounts; percentages never compound.
              </div>
            </div>
            <div>
              <label style={labelStyle}>Minimum total vials for discount</label>
              <input
                className="admin-input"
                type="number"
                min="1"
                value={minUnits}
                onChange={(e) => setMinUnits(e.target.value)}
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                Use 20 for a bulk deal. Use 1 when the weekly deal should apply immediately.
              </div>
            </div>
            {pricingMode === 'bulk_threshold' && (
              <div>
                <label style={labelStyle}>Maximum total vials per order (optional)</label>
                <input
                  className="admin-input"
                  type="number"
                  min={minUnits || 1}
                  value={maxUnits}
                  onChange={(e) => setMaxUnits(e.target.value)}
                  placeholder="No cap"
                  style={{ width: '100%' }}
                />
              </div>
            )}
            </>)}
            <div>
              <label style={labelStyle}>Ends</label>
              <div className="admin-input" style={{ width: '100%', color: preview ? '#f8fafc' : '#64748b' }}>
                {preview ? formatCrInstant(preview.window.endsAt) : 'Pick a product…'}
              </div>
              {preview && (
                <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '4px' }}>
                  <DealTime iso={preview.window.endsAt} />
                </div>
              )}
              {preview?.window?.rolledForward && (
                <div style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '4px' }}>
                  That Sunday is less than a day after the start, so the deal runs to the following Sunday.
                </div>
              )}
            </div>
          </div>

          {/* A whole-store sale meant ticking every product one at a time, which
              is both tedious and the kind of thing that gets miscounted under
              time pressure — and this form does not survive a refresh, so it can
              have to be done twice. In-stock only is offered separately because
              a sold-out product can be marked down but not bought. */}
          {!isOffers && (<>
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
          </>)}

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
                 The deal will still include {outOfStockSelected.length === 1 ? 'it' : 'them'}, but the catalog sorts
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
              {preview.offers ? (
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.85rem', color: '#e2e8f0', display: 'grid', gap: '6px' }}>
                  {preview.offers.en.map((offer, index) => <li key={offer}><strong>Offer #{index + 1}:</strong> {offer}</li>)}
                  <li style={{ color: '#94a3b8' }}>Shelf prices stay the same. The saving is applied in the cart, and free vials are added there automatically.</li>
                </ul>
              ) : (
              <table style={{ width: '100%', fontSize: '0.83rem', color: '#e2e8f0', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#94a3b8', textAlign: 'left', fontSize: '0.75rem' }}>
                    <th style={{ padding: '4px 0' }}>Product</th>
                    <th style={{ padding: '4px 0' }}>Was</th>
                    <th style={{ padding: '4px 0' }}>{pricingMode === 'bulk_threshold' ? 'At threshold' : 'Now'}</th>
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
              )}
              <div style={{ marginTop: '12px', fontSize: '0.78rem', color: '#cbd5e1' }}>
                <strong>Banner:</strong> {preview.banner.en}
              </div>
              <div style={{ marginTop: '10px', fontSize: '0.78rem', color: '#94a3b8' }}>
                {isOffers
                  ? 'Each order gets only the single best saving: offer #1, offer #2, or its normal volume discount.'
                  : pricingMode === 'bulk_threshold' ? `Customers may mix these products; the ${minUnits}+ selected-vial minimum is counted automatically.` : 'These products get the orange sale ribbon and move to the top of the catalog.'}
                {' '}Promo codes do not stack with this deal.
              </div>
              {!isOffers && <div className="weekly-deal-stack-summary"><div><span>Final discount</span><strong>{preview.safety?.pct}% off</strong></div><div><span>Volume discount</span><strong>Replaced</strong></div><div><span>Promo codes</span><strong>Blocked</strong></div></div>}
              {preview.safety?.needsConfirmation && (
                <label className="weekly-deal-confirm-row is-warning">
                  <input
                    type="checkbox"
                    checked={confirmedHighDiscount}
                    onChange={(event) => setConfirmedHighDiscount(event.target.checked)}
                  />
                  <span><strong>High-discount review:</strong> I approve a final discount of {preview.safety.pct}% with no additional discounts.</span>
                </label>
              )}
            </div>
          )}

          <button
            className="admin-btn primary"
            onClick={handleLaunch}
            disabled={Boolean(launchBlocker) || isLaunching || isPreviewing}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {isLaunching ? <Loader size={15} className="spin" /> : (isScheduling ? <CalendarClock size={15} /> : <Zap size={15} />)}
            {isScheduling ? 'Schedule deal' : 'Launch deal'}
          </button>
          <div className={`weekly-deal-launch-readiness${launchBlocker ? '' : ' is-ready'}`} role="status">
            {launchBlocker ? <><AlertTriangle size={14} /> Before you can continue: {launchBlocker}</> : <><CheckCircle size={14} /> Ready for final review. Nothing goes live until you confirm.</>}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '8px' }}>
            {isScheduling
              ? 'Nothing changes on the site until the start time. The deal then starts on its own within 5 minutes.'
              : isOffers
              ? 'Launching activates the automatic offers, dedicated deal page and site banner right away. Shelf prices do not change.'
              : pricingMode === 'bulk_threshold'
              ? 'Launching activates the automatic cart discount and site banner right away.'
              : 'Launching changes the selected live prices and activates the site banner right away.'}
            {' '}The email and WhatsApp announcement is drafted for you to review and send afterwards.
          </div>
        </div>
      )}

      {/* ---------- History ---------- */}
      {!loading && recent.length > 0 && (
        <div style={card}>
          <h4 style={{ margin: '0 0 12px', color: '#f8fafc', fontSize: '0.95rem' }}>Past deals</h4>
          <div style={{ display: 'grid', gap: '8px' }}>
            {recent.filter((deal) => deal.status === 'ended').map((deal) => (
              <div key={deal.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.82rem' }}>
                <span style={{ color: '#e2e8f0' }}>
                  <strong>{dealHeadline(deal)}</strong> — {(deal.product_names || []).length} products
                </span>
                <span style={{ color: '#64748b' }}>
                  {/* A schedule cancelled before its start is closed with ended_at before starts_at. */}
                  {deal.ended_at && Date.parse(deal.ended_at) < Date.parse(deal.starts_at)
                    ? `schedule cancelled ${formatCrInstant(deal.ended_at)}`
                    : `ended ${formatCrInstant(deal.ended_at || deal.ends_at)}`}
                </span>
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
                <h4 id="weekly-deal-review-title">
                  {isScheduling ? 'Schedule' : 'Launch'} {preview.offers ? `${preview.offers.en.length} offer${preview.offers.en.length === 1 ? '' : 's'}` : `${preview.safety?.pct}% weekly deal`}?
                </h4>
              </div>
              <button type="button" onClick={() => setShowLaunchReview(false)} aria-label="Close launch review">
                <X size={18} />
              </button>
            </div>

            <div className="weekly-deal-review-summary">
              <div><span>Products</span><strong>{preview.products.length}</strong></div>
              {isScheduling && <div><span>Starts</span><strong>{formatCrInstant(startsAtIso)}</strong></div>}
              <div><span>Ends</span><strong>{formatCrInstant(preview.window.endsAt)}</strong></div>
              {!preview.offers && <div><span>Final customer saving</span><strong>{preview.safety?.pct}%</strong></div>}
            </div>

            {preview.offers && (
              <ul style={{ margin: '0 0 12px', paddingLeft: '18px', fontSize: '0.85rem', display: 'grid', gap: '4px' }}>
                {preview.offers.en.map((offer, index) => <li key={offer}><strong>Offer #{index + 1}:</strong> {offer}</li>)}
              </ul>
            )}

            <div className="weekly-deal-review-products">
              {preview.products.map((product) => (
                <div key={product.product}>
                  <span>{product.product}</span>
                  <strong>{preview.offers ? product.wasUsd : <><s>{product.wasUsd}</s> → {product.nowUsd}{pricingMode === 'bulk_threshold' ? ' at threshold' : ''}</>}</strong>
                  <small>{product.inventoryCount === null ? 'Stock manually verified' : `${product.inventoryCount} available`}</small>
                </div>
              ))}
            </div>

            <div className="weekly-deal-inline-alert is-warning">
              <AlertTriangle size={16} />
              <span>
                {isScheduling
                  ? <>The deal goes live on its own at <DealTime iso={startsAtIso} />.</>
                  : 'Launch activates the deal on the live catalog immediately.'}
                {' '}The announcement is created as a separate review step and is not sent automatically.
              </span>
            </div>

            <div className="weekly-deal-modal-actions">
              <button type="button" className="admin-btn" onClick={() => setShowLaunchReview(false)}>Go back</button>
              <button type="button" className="admin-btn primary" onClick={confirmLaunch} disabled={isLaunching}>
                {isLaunching ? <Loader size={15} className="spin" /> : (isScheduling ? <CalendarClock size={15} /> : <Zap size={15} />)}
                {isScheduling ? 'Confirm & schedule' : <>Confirm &amp; launch</>}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
