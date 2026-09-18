"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CalendarClock, Check, PackageCheck, RefreshCw, ShieldCheck, Tag } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { usePublicPageContent } from '@/hooks/usePublicPageContent';
import { useDealPageExperiment } from '@/hooks/useDealPageExperiment';
import { dealMaxUnits, dealMinUnits, dealPricingMode } from '@/lib/dealOfWeek.mjs';
import { StorefrontFooter, StorefrontHeader } from '@/components/StorefrontChrome';
import MobileActionBar from '@/components/MobileActionBar';
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

const isSoldOut = (product) => String(product?.status || '').toLowerCase().includes('out of stock')
  || product?.inventory_count === 0;

export default function DealOfTheWeekPage() {
  const { lang, setLang, landingSettings } = usePublicPageContent('page_bulk_discounts');
  const { links } = useBusinessLinks();
  const { variant, track } = useDealPageExperiment();
  const [deal, setDeal] = useState(undefined);
  const [products, setProducts] = useState([]);
  const [rate, setRate] = useState(0);
  const viewRecorded = useRef(false);
  const en = lang === 'en';

  useEffect(() => {
    fetch('/api/deals/current', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => setDeal(data?.deal || null))
      .catch(() => setDeal(null));
    fetch('/api/exchange-rate', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (Number(data?.rate) > 0) setRate(Number(data.rate)); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const names = deal?.product_names || [];
    if (!names.length || !isSupabaseConfigured || !supabase) return;
    supabase
      .from('products')
      .select('product, price_usd, original_price_usd, image_url, status, inventory_count')
      .then(({ data }) => {
        const byName = new Map((data || []).map((row) => [nameKey(row.product), row]));
        setProducts(names.map((name) => byName.get(nameKey(name)) || { product: name }));
      });
  }, [deal]);

  useEffect(() => {
    if (!variant || !deal || viewRecorded.current) return;
    viewRecorded.current = true;
    track('view', { dealId: deal.id, lang });
  }, [variant, deal, track, lang]);

  const ready = Boolean(variant) && deal !== undefined;
  const pct = deal ? Math.round(Number(deal.discount_pct || 0) * 100) : 0;
  const bulk = dealPricingMode(deal) === 'bulk_threshold';
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
    if (bulk) return { now: shelf * (1 - pct / 100), was: shelf };
    const was = priceNumber(product.original_price_usd);
    return { now: shelf, was: was > shelf ? was : null };
  };

  const catalogHref = (product = '') => `/catalog?lang=${en ? 'en' : 'es'}&gate=skip${product ? `&product=${encodeURIComponent(product)}` : ''}`;
  const onShop = (target) => track('cta_click', { dealId: deal?.id, lang, target });

  const rules = !deal ? [] : bulk
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

  const headline = !deal ? '' : variant === 'b'
    ? (bulk ? (en ? 'Build your wholesale order' : 'Arma tu pedido mayorista') : (en ? 'This week\'s deal picks' : 'Las ofertas de esta semana'))
    : (bulk
      ? (en ? `${pct}% off ${minUnits}+ vials` : `${pct}% de descuento en ${minUnits}+ viales`)
      : (en ? `${pct}% off this week's picks` : `${pct}% de descuento en las selecciones de esta semana`));

  const productGrid = (
    <section className={styles.section} aria-labelledby="dow-products">
      <div className={styles.sectionHead}>
        <h2 id="dow-products">{bulk ? (en ? 'Mix and match from these products' : 'Combina entre estos productos') : (en ? 'Products on sale' : 'Productos en oferta')}</h2>
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
                  ? <img src={product.image_url} alt={product.product} loading="lazy" width="320" height="320" />
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
                {bulk && price && <span className={styles.priceNote}>{en ? `each, at ${minUnits}+ vials` : `c/u, con ${minUnits}+ viales`}</span>}
                {soldOut
                  ? <span className={styles.soldOut}>{en ? 'Sold out' : 'Agotado'}</span>
                  : (
                    <Link className={styles.productLink} href={catalogHref(product.product)} onClick={() => onShop(`product:${product.product}`)}>
                      {en ? 'Add to my order' : 'Agregar a mi pedido'}
                    </Link>
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
  const eyebrow = <p className={styles.eyebrow}><RefreshCw size={14} aria-hidden="true" />{en ? 'Deal of the Week · New offer every week' : 'Oferta de la Semana · Nueva oferta cada semana'}</p>;

  return (
    <div className="clone-home">
      <StorefrontHeader lang={lang} onLanguage={setLang} settings={landingSettings} />
      <main className={`${styles.main} ${variant === 'b' ? styles.variantB : styles.variantA}`}>
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
            <section className={styles.hero}>
              {eyebrow}
              <h1>{headline}</h1>
              <p className={styles.lead}>
                {bulk
                  ? (en ? `Mix and match any ${minUnits} or more vials from the ${productCount} products below. The discount applies automatically at checkout.` : `Combina ${minUnits} o más viales de los ${productCount} productos de abajo. El descuento se aplica automáticamente al pagar.`)
                  : (en ? 'The prices below are already marked down. No code needed.' : 'Los precios de abajo ya tienen el descuento. Sin código.')}
              </p>
              <div className={styles.facts}>
                <span><strong>{pct}%</strong>{en ? 'off' : 'de descuento'}</span>
                {bulk && <span><strong>{minUnits}+</strong>{en ? 'vials, mix & match' : 'viales combinables'}</span>}
                <span><strong>{productCount}</strong>{en ? 'products' : 'productos'}</span>
                {endsLabel && <span><strong><CalendarClock size={26} aria-hidden="true" /></strong>{en ? `Ends ${endsLabel}` : `Termina el ${endsLabel}`}</span>}
              </div>
              {limitedBadge}
              <div><Link className={styles.cta} href={catalogHref()} onClick={() => onShop('hero')}>{en ? 'Shop the deal' : 'Comprar la oferta'}</Link></div>
            </section>
            {rulesList}
            {productGrid}
          </>
        )}

        {ready && deal && variant === 'b' && (
          <>
            <section className={`${styles.hero} ${styles.heroCompact}`}>
              {eyebrow}
              <h1>{headline}</h1>
              <p className={styles.summaryLine}>
                <span><Tag aria-hidden="true" />{bulk ? (en ? `${pct}% off ${minUnits}+ vials` : `${pct}% desc. en ${minUnits}+ viales`) : (en ? `${pct}% off` : `${pct}% de descuento`)}</span>
                {endsLabel && <span><CalendarClock aria-hidden="true" />{en ? `Ends ${endsLabel}` : `Termina el ${endsLabel}`}</span>}
                <span><PackageCheck aria-hidden="true" />{en ? 'Limited stock' : 'Inventario limitado'}</span>
              </p>
              <Link className={styles.cta} href={catalogHref()} onClick={() => onShop('hero')}>{en ? 'Start my order' : 'Empezar mi pedido'}</Link>
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
      <MobileActionBar lang={lang} whatsappHref={`https://wa.me/${links.whatsappNumber}`} />
    </div>
  );
}
