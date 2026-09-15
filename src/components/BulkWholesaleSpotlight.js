"use client";

import Link from 'next/link';
import { useBulkWholesaleCampaign } from '@/hooks/useBulkWholesaleCampaign';
import styles from './BulkWholesaleSpotlight.module.css';

export default function BulkWholesaleSpotlight({ lang = 'es' }) {
  const campaign = useBulkWholesaleCampaign();
  if (!campaign.active) return null;

  const en = lang === 'en';
  return (
    <section className={styles.spotlight} aria-label={en ? 'Bulk wholesale promotion' : 'Promoción mayorista'}>
      <div>
        <p className={styles.eyebrow}>{en ? 'Limited inventory event' : 'Evento de inventario limitado'}</p>
        <h2>{en ? `${campaign.discountPct}% off ${campaign.minUnits}+ selected vials` : `${campaign.discountPct}% de descuento en ${campaign.minUnits}+ viales seleccionados`}</h2>
        <p>
          {en
            ? `Mix and match across ${campaign.products.length} selected products. One bulk price—no discount stacking.`
            : `Combina entre ${campaign.products.length} productos seleccionados. Un solo precio mayorista, sin acumular descuentos.`}
        </p>
      </div>
      <Link className={styles.action} href={`/bulk-discounts?lang=${en ? 'en' : 'es'}`}>
        {en ? 'See the wholesale offer' : 'Ver la oferta mayorista'}
      </Link>
    </section>
  );
}
