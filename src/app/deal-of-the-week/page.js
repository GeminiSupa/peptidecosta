"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CalendarClock, Check, Minus, PackageCheck, Plus, RefreshCw, ShieldCheck, ShoppingCart, Tag, X } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { usePublicPageContent } from '@/hooks/usePublicPageContent';
import { useDealPageExperiment } from '@/hooks/useDealPageExperiment';
import { useSharedCart } from '@/hooks/useSharedCart';
import { PRODUCT_SELECT } from '@/lib/catalogProducts';
import { dealMaxUnits, dealMinUnits, dealPricingMode } from '@/lib/dealOfWeek.mjs';
import { OFFERS_PRICING_MODE, chooseDealOffer, dealOfferCartMessage, dealOfferRuleSummaries, dealOfferSummaries, normalizeDealOffers } from '@/lib/dealOffers.mjs';
import { isBacWater } from '@/lib/bacWater.mjs';
import { getVolumeDiscountPct } from '@/lib/pricing';
import { StorefrontFooter, StorefrontHeader } from '@/components/StorefrontChrome';
import MobileActionBar from '@/components/MobileActionBar';
import EvenProductImage from '@/components/EvenProductImage';
import styles from './deal-of-the-week.module.css';
import '../landing.css';

/**
 * The Deal of the Week, on one page the sales team can link to.
 *
 * Whatever deal is live in the admin's Deal of the Week tab is shown here —
 * a bulk mix-and-match deal or a plain markdown — so the page never needs
 * editing week to week. Two versions are A/B tested; see dealPageExperiment.mjs.
 */

const priceNumber = (value) => {
  const number = Number.parseFloat(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(number) ? number : 0;
};

// Some product names are stored with a non-breaking space ("GLP-1 10mg"),
// so names are compared with every kind of space collapsed.
const nameKey = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

// Time left until the deal ends, ticking every second. Version B only.
function useTimeLeft(endsAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [endsAt]);
  const end = endsAt ? Date.parse(endsAt) : NaN;
  if (!Number.isFinite(end)) return null;
  const total = Math.max(0, Math.floor((end - now) / 1000));
  return {
    done: total === 0,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const pad2 = (value) => String(value).padStart(2, '0');

const isSoldOut = (product) => String(product?.status || '').toLowerCase().includes('out of stock')
  || product?.inventory_count === 0;

export default function DealOfTheWeekPage() {
  const { lang, setLang, landingSettings } = usePublicPageContent('page_bulk_discounts');
  const { links } = useBusinessLinks();
  const { variant, track } = useDealPageExperiment();
  const [deal, setDeal] = useState(undefined);
  const [products, setProducts] = useState([]);
  // Version A's headline is built from the product prices, so the page waits
  // for them rather than showing one headline and swapping it a moment later.
  const [productsReady, setProductsReady] = useState(false);
  const [rate, setRate] = useState(0);
  // Spanish prices are in colones, so the page also waits for the rate.
  const [rateReady, setRateReady] = useState(false);
  const viewRecorded = useRef(false);
  const en = lang === 'en';
  const timeLeft = useTimeLeft(variant === 'b' ? deal?.ends_at : null);
  const { cart, qtyOf, setQty, removeItem } = useSharedCart();
  const [cartOpen, setCartOpen] = useState(false);
  const [stockNotice, setStockNotice] = useState('');

  useEffect(() => {
    fetch('/api/deals/current', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => setDeal(data?.deal || null))
      .catch(() => setDeal(null));
    fetch('/api/exchange-rate', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (Number(data?.rate) > 0) setRate(Number(data.rate)); })
      .catch(() => {})
      .finally(() => setRateReady(true));
  }, []);

  useEffect(() => {
    const names = deal?.product_names || [];
    if (!names.length || !isSupabaseConfigured || !supabase) {
      if (deal !== undefined) setProductsReady(true);
      return;
    }
    supabase
      .from('products')
      // The full catalog row: "Add to my order" builds the cart item from it.
      .select(PRODUCT_SELECT)
      .then(({ data }) => {
        const byName = new Map((data || []).map((row) => [nameKey(row.product), row]));
        setProducts(names.map((name) => byName.get(nameKey(name)) || { product: name }));
        setProductsReady(true);
      }, () => setProductsReady(true));
  }, [deal]);

  useEffect(() => {
    if (!variant || !deal || viewRecorded.current) return;
    viewRecorded.current = true;
    track('view', { dealId: deal.id, lang });
  }, [variant, deal, track, lang]);

  const ready = Boolean(variant) && deal !== undefined && (!deal || productsReady) && (en || rateReady);
  const pct = deal ? Math.round(Number(deal.discount_pct || 0) * 100) : 0;
  const bulk = dealPricingMode(deal) === 'bulk_threshold';
  // A flexible list of percentage and Buy/Get-Free offers. Checkout compares
  // every qualifying entry and applies only the one that saves the most.
  const offersDeal = dealPricingMode(deal) === OFFERS_PRICING_MODE;
  const offers = normalizeDealOffers(deal?.offers);
  const activeOffers = offers.items.filter((offer) => offer.enabled);
  const offerSummaries = offersDeal ? dealOfferSummaries(deal?.offers, lang) : [];
  const heroOffers = activeOffers.map((offer) => {
    if (offer.type === 'bundle') {
      return {
        id: offer.id,
        value: en
          ? `${offer.free_qty} free ${offer.free_qty === 1 ? 'vial' : 'vials'}`
          : `${offer.free_qty} ${offer.free_qty === 1 ? 'vial gratis' : 'viales gratis'}`,
        condition: en
          ? `Buy ${offer.buy_qty} of the same vial`
          : `Compra ${offer.buy_qty} del mismo vial`,
      };
    }
    return {
      id: offer.id,
      value: en
        ? `${Math.round(offer.discount_pct * 100)}% off your order`
        : `${Math.round(offer.discount_pct * 100)}% de descuento`,
      condition: en
        ? `Buy ${offer.min_units}+ vials`
        : `Compra ${offer.min_units}+ viales`,
    };
  });
  const minUnits = dealMinUnits(deal);
  const maxUnits = dealMaxUnits(deal);
  const productCount = (deal?.product_names || []).length;
  const endsLabel = deal?.ends_at
    ? new Date(deal.ends_at).toLocaleDateString(en ? 'en-US' : 'es-CR', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Costa_Rica',
    })
    : '';

  const money = (usd) => {
    if (!en && rate > 0) return `₡${Math.round(usd * rate).toLocaleString('en-US')}`;
    return `$${(Math.round(usd * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  };
  const priceFor = (product) => {
    const shelf = priceNumber(product.price_usd);
    if (!shelf) return null;
    // Offers change no shelf price; the saving is worked out in the cart.
    if (offersDeal) return { now: shelf, was: null };
    if (bulk) return { now: shelf * (1 - pct / 100), was: shelf };
    const was = priceNumber(product.original_price_usd);
    return { now: shelf, was: was > shelf ? was : null };
  };

  // The one wording difference on every product card: A shows the saving in
  // money, B as a percentage. Same discount, two ways of saying it.
  const savingLabel = (price) => {
    if (!price?.was || !(price.was > price.now)) return '';
    if (variant === 'b') {
      const off = Math.round((1 - price.now / price.was) * 100);
      return en ? `${off}% off` : `${off}% de descuento`;
    }
    return en ? `Save ${money(price.was - price.now)}` : `Ahorras ${money(price.was - price.now)}`;
  };

  const catalogHref = (product = '') => `/catalog?lang=${en ? 'en' : 'es'}&gate=skip${product ? `&product=${encodeURIComponent(product)}` : ''}`;
  const onShop = (target) => track('cta_click', { dealId: deal?.id, lang, target });

  // The cart is the catalog's own (see useSharedCart), so what is added here
  // is in the cart at checkout. Only deal products count toward the minimum.
  const dealKeys = new Set((deal?.product_names || []).map(nameKey));
  const dealUnits = cart.reduce((sum, item) => sum + (dealKeys.has(nameKey(item.product)) ? Number(item.qty) || 0 : 0), 0);
  const cartUnits = cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const unitsToGo = bulk ? Math.max(0, minUnits - dealUnits) : 0;
  const overMax = bulk && maxUnits > 0 && dealUnits > maxUnits;
  const progressPct = bulk && minUnits > 0 ? Math.min(100, Math.round((dealUnits / minUnits) * 100)) : 100;
  const checkoutHref = `/catalog?lang=${en ? 'en' : 'es'}&gate=skip&deal=week&cart=open`;

  const changeQty = (row, qty) => {
    const ok = setQty(row, qty);
    if (!ok) {
      setStockNotice(en
        ? `Only ${row.inventory_count} of ${row.product} in stock.`
        : `Solo hay ${row.inventory_count} de ${row.product} en inventario.`);
      return;
    }
    setStockNotice('');
  };
  const addFirst = (row) => {
    changeQty(row, 1);
    onShop(`add:${row.product}`);
  };
  const scrollToProducts = (target) => {
    onShop(target);
    document.getElementById('dow-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Which offer the cart has earned so far — the same chooser checkout uses,
  // for the progress line only; the checkout recalculates everything.
  const offerChoice = offersDeal
    ? chooseDealOffer(deal.offers, cart.map((item) => {
      const row = products.find((product) => nameKey(product.product) === nameKey(item.product));
      return {
        product: item.product,
        qty: item.qty,
        unitPrice: priceNumber(row?.price_usd ?? item.price_usd ?? item.priceUsd),
        inventoryCount: row?.inventory_count ?? item.inventoryCount ?? null,
      };
    }), {
      volumePct: getVolumeDiscountPct(cart.reduce((sum, item) => sum + (isBacWater(item.product) ? 0 : Number(item.qty) || 0), 0)),
    })
    : null;
  const offerEarned = offerChoice && (offerChoice.kind === 'mix' || offerChoice.kind === 'bundle');

  const progressText = offersDeal
    ? dealOfferCartMessage(offerChoice, deal, lang)
    : !bulk
    ? (en ? 'Deal prices apply at checkout.' : 'Los precios de oferta se aplican al pagar.')
    : overMax
      ? (en ? `The deal price is for up to ${maxUnits} vials. Remove ${dealUnits - maxUnits} to keep it.` : `El precio de oferta es para hasta ${maxUnits} viales. Quita ${dealUnits - maxUnits} para mantenerlo.`)
      : unitsToGo > 0
        ? (en ? `Add ${unitsToGo} more deal ${unitsToGo === 1 ? 'vial' : 'vials'} to unlock ${pct}% off` : `Agrega ${unitsToGo} ${unitsToGo === 1 ? 'vial' : 'viales'} más de la oferta para el ${pct}% de descuento`)
        : (en ? `${pct}% off unlocked — applied at checkout` : `${pct}% de descuento activado — se aplica al pagar`);

  const rules = !deal ? [] : offersDeal
    ? dealOfferRuleSummaries(deal.offers, lang)
    : bulk
    ? [
      en ? `Choose ${minUnits} or more vials from the products on this page, in any combination.` : `Elige ${minUnits} o más viales de los productos de esta página, en cualquier combinación.`,
      en ? `The ${pct}% discount applies automatically at checkout, on the selected vials only. No code needed.` : `El ${pct}% de descuento se aplica automáticamente al pagar, solo en los viales seleccionados. Sin código.`,
      ...(maxUnits ? [en ? `Up to ${maxUnits} vials per order at this price.` : `Hasta ${maxUnits} viales por pedido a este precio.`] : []),
      en ? 'Does not combine with promo codes or automatic volume discounts.' : 'No se combina con códigos promocionales ni descuentos automáticos por volumen.',
    ]
    : [
      en ? 'The prices below already include the discount. No code needed.' : 'Los precios de abajo ya incluyen el descuento. Sin código.',
      en ? 'Discounts do not stack with promo codes.' : 'Los descuentos no se acumulan con códigos promocionales.',
    ];
  if (deal) {
    if (endsLabel) rules.push(en ? `Ends ${endsLabel} (Costa Rica time).` : `Termina el ${endsLabel} (hora de Costa Rica).`);
    rules.push(en ? 'Stock is limited. Quantities may be limited per customer.' : 'El inventario es limitado. Las cantidades pueden limitarse por cliente.');
  }

  // Version A talks in money throughout: the biggest per-vial saving on the
  // page. Falls back to the percentage only if no product has a price.
  const maxSaving = products.reduce((best, product) => {
    const price = priceFor(product);
    return price?.was ? Math.max(best, price.was - price.now) : best;
  }, 0);
  const offerHeadline = () => (en
    ? `${activeOffers.length} ${activeOffers.length === 1 ? 'way' : 'ways'} to save`
    : `${activeOffers.length} ${activeOffers.length === 1 ? 'forma' : 'formas'} de ahorrar`);

  const headline = !deal ? '' : offersDeal ? offerHeadline() : variant === 'b'
    ? (bulk ? (en ? 'Build your wholesale order' : 'Arma tu pedido mayorista') : (en ? 'This week\'s deal picks' : 'Las ofertas de esta semana'))
    : maxSaving > 0
      ? (bulk
        ? (en ? `Save up to ${money(maxSaving)} per vial when you buy ${minUnits}+` : `Ahorra hasta ${money(maxSaving)} por vial al comprar ${minUnits}+`)
        : (en ? `Save up to ${money(maxSaving)} on this week's picks` : `Ahorra hasta ${money(maxSaving)} en las ofertas de esta semana`))
    : (bulk
      ? (en ? `${pct}% off ${minUnits}+ vials` : `${pct}% de descuento en ${minUnits}+ viales`)
      : (en ? `${pct}% off this week's picks` : `${pct}% de descuento en las selecciones de esta semana`));

  const productGrid = (
    <section className={styles.section} aria-labelledby="dow-products">
      <div className={styles.sectionHead}>
        <h2 id="dow-products">{offersDeal ? (en ? 'Products in this week\'s offers' : 'Productos en las ofertas de esta semana') : bulk ? (en ? 'Mix and match from these products' : 'Combina entre estos productos') : (en ? 'Products on sale' : 'Productos en oferta')}</h2>
        {bulk && <p>{en ? `Prices shown apply when your order has ${minUnits}+ of these vials.` : `Los precios mostrados aplican cuando tu pedido tiene ${minUnits}+ de estos viales.`}</p>}
      </div>
      <div className={styles.grid}>
        {products.map((product) => {
          const price = priceFor(product);
          const soldOut = isSoldOut(product);
          return (
            <article key={product.product} className={styles.card}>
              <div className={styles.cardImage}>
                {product.image_url
                  ? <EvenProductImage src={product.image_url} alt={product.product} />
                  : <span aria-hidden="true"><Tag /></span>}
              </div>
              <div className={styles.cardBody}>
                <h3>{product.product}</h3>
                {price && (
                  <p className={styles.price}>
                    <strong>{money(price.now)}</strong>
                    {price.was && <s aria-label={en ? `was ${money(price.was)}` : `antes ${money(price.was)}`}>{money(price.was)}</s>}
                  </p>
                )}
                {savingLabel(price) && <span className={styles.saving}>{savingLabel(price)}</span>}
                {bulk && price && <span className={styles.priceNote}>{en ? `each, at ${minUnits}+ vials` : `c/u, con ${minUnits}+ viales`}</span>}
                {soldOut
                  ? <span className={styles.soldOut}>{en ? 'Sold out' : 'Agotado'}</span>
                  : qtyOf(product.product) > 0
                    ? (
                      <div className={styles.stepper} role="group" aria-label={en ? `Quantity of ${product.product}` : `Cantidad de ${product.product}`}>
                        <button type="button" onClick={() => changeQty(product, qtyOf(product.product) - 1)} aria-label={en ? 'One less' : 'Uno menos'}><Minus aria-hidden="true" /></button>
                        <span aria-live="polite">{qtyOf(product.product)} {en ? 'in cart' : 'en carrito'}</span>
                        <button type="button" onClick={() => changeQty(product, qtyOf(product.product) + 1)} aria-label={en ? 'One more' : 'Uno más'}><Plus aria-hidden="true" /></button>
                      </div>
                    )
                    : (
                      <button type="button" className={styles.productLink} onClick={() => addFirst(product)}>
                        {en ? 'Add to my order' : 'Agregar a mi pedido'}
                      </button>
                    )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );

  const rulesList = (
    <section className={styles.section} aria-labelledby="dow-rules">
      <div className={styles.sectionHead}><h2 id="dow-rules">{en ? 'How the deal works' : 'Cómo funciona la oferta'}</h2></div>
      <ul className={styles.rules}>
        {rules.map((rule, index) => (
          <li key={rule}>{index === rules.length - 1 ? <PackageCheck aria-hidden="true" /> : <Check aria-hidden="true" />}{rule}</li>
        ))}
      </ul>
    </section>
  );

  const limitedBadge = <p className={styles.badge}><PackageCheck aria-hidden="true" />{en ? 'Limited stock' : 'Inventario limitado'}</p>;
  const eyebrow = <p className={styles.eyebrow}><RefreshCw size={14} aria-hidden="true" />{en ? 'Deal of the Week' : 'Oferta de la Semana'}</p>;

  return (
    <div className="clone-home">
      <StorefrontHeader lang={lang} onLanguage={setLang} settings={landingSettings} />
      <main className={styles.main} data-variant={variant || undefined}>
        {!ready && (
          <section className={styles.hero}><p className={styles.loading}>{en ? 'Loading this week\'s deal…' : 'Cargando la oferta de la semana…'}</p></section>
        )}

        {ready && !deal && (
          <section className={styles.hero}>
            {eyebrow}
            <h1>{en ? 'A new deal is on its way' : 'Una nueva oferta viene en camino'}</h1>
            <p className={styles.lead}>{en ? 'This week\'s offer hasn\'t started yet. Check back soon, or browse the full catalog in the meantime.' : 'La oferta de esta semana aún no ha comenzado. Vuelve pronto o explora el catálogo completo mientras tanto.'}</p>
            <Link className={styles.cta} href={catalogHref()}>{en ? 'Browse the catalog' : 'Ver el catálogo'}</Link>
          </section>
        )}

        {ready && deal && variant === 'a' && (
          <>
            <section className={`${styles.hero} ${offersDeal ? styles.heroOffer : ''}`}>
              {eyebrow}
              <h1>{headline}</h1>
              {!offersDeal && <p className={styles.lead}>
                {bulk
                  ? (en ? `Mix and match any ${minUnits} or more vials from the ${productCount} products below. The discount applies automatically at checkout.` : `Combina ${minUnits} o más viales de los ${productCount} productos de abajo. El descuento se aplica automáticamente al pagar.`)
                  : (en ? 'The prices below are already marked down. No code needed.' : 'Los precios de abajo ya tienen el descuento. Sin código.')}
              </p>}
              {offersDeal ? (
                <div className={styles.offerGrid} aria-label={en ? 'This week\'s offers' : 'Ofertas de esta semana'}>
                  {heroOffers.map((offer) => (
                    <div className={styles.offerCard} key={offer.id}>
                      <strong>{offer.value}</strong>
                      <span>{offer.condition}</span>
                    </div>
                  ))}
                </div>
              ) : <div className={styles.facts}>
                {maxSaving > 0
                  ? <span><strong>{money(maxSaving)}</strong>{en ? 'max. saved per vial' : 'máx. de ahorro por vial'}</span>
                  : <span><strong>{pct}%</strong>{en ? 'off' : 'de descuento'}</span>}
                {bulk && <span><strong>{minUnits}+</strong>{en ? 'vials, mix & match' : 'viales combinables'}</span>}
                <span><strong>{productCount}</strong>{en ? 'products' : 'productos'}</span>
                {endsLabel && <span><strong><CalendarClock size={26} aria-hidden="true" /></strong>{en ? `Ends ${endsLabel}` : `Termina el ${endsLabel}`}</span>}
              </div>}
              {offersDeal ? (
                <div className={styles.dealMeta}>
                  <span><Check aria-hidden="true" />{en ? 'Best savings applied automatically' : 'El mejor ahorro se aplica automáticamente'}</span>
                  {endsLabel && <span><CalendarClock aria-hidden="true" />{en ? `Ends ${endsLabel}` : `Termina el ${endsLabel}`}</span>}
                  <span><PackageCheck aria-hidden="true" />{en ? 'Limited stock' : 'Inventario limitado'}</span>
                </div>
              ) : limitedBadge}
              <div><button type="button" className={styles.cta} onClick={() => scrollToProducts('hero')}>{en ? 'Shop the deal' : 'Comprar la oferta'}</button></div>
            </section>
            {productGrid}
            {rulesList}
          </>
        )}

        {ready && deal && variant === 'b' && (
          <>
            <section className={`${styles.hero} ${styles.heroCompact}`}>
              {eyebrow}
              <h1>{headline}</h1>
              <p className={styles.summaryLine}>
                {offersDeal && offerSummaries.map((summary, index) => <span key={`${summary}-${index}`}><Tag aria-hidden="true" />{summary}</span>)}
                {!offersDeal && <span><Tag aria-hidden="true" />{bulk ? (en ? `${pct}% off ${minUnits}+ vials` : `${pct}% desc. en ${minUnits}+ viales`) : (en ? `${pct}% off` : `${pct}% de descuento`)}</span>}
                <span><PackageCheck aria-hidden="true" />{en ? 'Limited stock' : 'Inventario limitado'}</span>
              </p>
              {timeLeft && !timeLeft.done && (
                <div className={styles.countdown} role="timer" aria-label={en ? 'Time left in this deal' : 'Tiempo restante de la oferta'}>
                  <span className={styles.countdownLabel}><CalendarClock aria-hidden="true" />{en ? 'Deal ends in' : 'La oferta termina en'}</span>
                  <span className={styles.countdownDigits}>
                    {[
                      [timeLeft.days, en ? 'days' : 'días'],
                      [pad2(timeLeft.hours), en ? 'hrs' : 'hrs'],
                      [pad2(timeLeft.minutes), en ? 'min' : 'min'],
                      [pad2(timeLeft.seconds), en ? 'sec' : 'seg'],
                    ].map(([value, unit]) => (
                      <span key={unit} className={styles.countdownUnit}><strong>{value}</strong>{unit}</span>
                    ))}
                  </span>
                </div>
              )}
              {timeLeft?.done && <p className={styles.countdownLabel}>{en ? 'This deal is ending now.' : 'Esta oferta está terminando.'}</p>}
              <button type="button" className={styles.cta} onClick={() => scrollToProducts('hero')}>{en ? 'Start my order' : 'Empezar mi pedido'}</button>
            </section>
            {productGrid}
            {rulesList}
          </>
        )}

        <section className={styles.checkBack} aria-labelledby="dow-check-back">
          <h2 id="dow-check-back"><RefreshCw aria-hidden="true" />{en ? 'A new deal every week' : 'Una oferta nueva cada semana'}</h2>
          <p>{en ? 'We update this page every week with a different offer. Bookmark it and check back to see what\'s new.' : 'Actualizamos esta página cada semana con una oferta diferente. Guárdala y vuelve para ver qué hay de nuevo.'}</p>
          <div className={styles.checkBackLinks}>
            <Link className={styles.secondaryLink} href={catalogHref()}>{en ? 'Browse the full catalog' : 'Ver el catálogo completo'}</Link>
            <Link className={styles.secondaryLink} href={`/bulk-discounts?lang=${en ? 'en' : 'es'}`}>{en ? 'Everyday volume pricing' : 'Precios por volumen de siempre'}</Link>
          </div>
        </section>

        <p className={styles.disclaimer}><ShieldCheck size={14} aria-hidden="true" /> {en ? 'All products are for research use only. Not for human or animal consumption.' : 'Todos los productos son solo para uso en investigación. No aptos para consumo humano ni animal.'}</p>
      </main>
      <StorefrontFooter lang={lang} settings={landingSettings} />
      {/* Once something is in the cart, the cart bar takes the bottom of the
          screen instead of the site's Catalog / Contact bar: one bar, one next
          step. Checkout opens the catalog's cart drawer, which is checkout. */}
      {cartUnits > 0 ? (
        <aside className={styles.cartBar} aria-label={en ? 'Your cart' : 'Tu carrito'}>
          {cartOpen && (
            <div className={styles.cartPanel} id="dow-cart-panel">
              <div className={styles.cartPanelHead}>
                <strong>{en ? 'Your cart' : 'Tu carrito'}</strong>
                <button type="button" onClick={() => setCartOpen(false)} aria-label={en ? 'Close cart' : 'Cerrar carrito'}><X aria-hidden="true" /></button>
              </div>
              <ul>
                {cart.map((item) => {
                  const row = products.find((product) => nameKey(product.product) === nameKey(item.product));
                  return (
                    <li key={item.product}>
                      <span className={styles.cartItemName}>
                        {item.product}
                        {!dealKeys.has(nameKey(item.product)) && <small>{en ? 'Not in this deal' : 'No incluido en la oferta'}</small>}
                      </span>
                      {row ? (
                        <span className={styles.stepper}>
                          <button type="button" onClick={() => changeQty(row, item.qty - 1)} aria-label={en ? 'One less' : 'Uno menos'}><Minus aria-hidden="true" /></button>
                          <span>{item.qty}</span>
                          <button type="button" onClick={() => changeQty(row, item.qty + 1)} aria-label={en ? 'One more' : 'Uno más'}><Plus aria-hidden="true" /></button>
                        </span>
                      ) : <span className={styles.cartQty}>× {item.qty}</span>}
                      <button type="button" className={styles.cartRemove} onClick={() => removeItem(item.product)} aria-label={en ? `Remove ${item.product}` : `Quitar ${item.product}`}><X aria-hidden="true" /></button>
                    </li>
                  );
                })}
              </ul>
              <p className={styles.cartNote}>{en ? 'Your final price, with every discount, is shown at checkout.' : 'El precio final, con todos los descuentos, se muestra al pagar.'}</p>
            </div>
          )}
          <div className={styles.cartBarMain}>
            <button
              type="button"
              className={styles.cartToggle}
              onClick={() => setCartOpen((open) => !open)}
              aria-expanded={cartOpen}
              aria-controls="dow-cart-panel"
            >
              <ShoppingCart aria-hidden="true" />
              <span>
                <strong>{en ? `${cartUnits} ${cartUnits === 1 ? 'vial' : 'vials'} in cart` : `${cartUnits} ${cartUnits === 1 ? 'vial' : 'viales'} en el carrito`}</strong>
                <span className={overMax ? styles.progressWarn : (offersDeal ? !offerEarned : unitsToGo > 0) ? styles.progressTodo : styles.progressDone}>{progressText}</span>
              </span>
            </button>
            {bulk && (
              <span className={styles.progressTrack} aria-hidden="true">
                <span style={{ width: `${progressPct}%` }} />
              </span>
            )}
            <Link className={styles.checkoutBtn} href={checkoutHref} onClick={() => onShop('checkout')}>
              {en ? 'Checkout' : 'Pagar'}
            </Link>
          </div>
          {stockNotice && <p className={styles.stockNotice} role="alert">{stockNotice}</p>}
        </aside>
      ) : (
        <MobileActionBar lang={lang} whatsappHref={`https://wa.me/${links.whatsappNumber}`} />
      )}
    </div>
  );
}
