"use client";

import Link from 'next/link';
import { ArrowRight, ClipboardList, FileCheck2, MessageCircle, Truck } from 'lucide-react';

const COPY = {
  en: {
    eyebrow: 'LOCAL ORDER FLOW',
    title: 'Browse, verify, ask, then coordinate locally.',
    steps: [
      ['Browse catalog', 'See current Costa Rica stock and live CRC pricing.'],
      ['Check COA', 'Review available batch documentation before ordering.'],
      ['Ask on WhatsApp', 'Talk with a real person in English or Spanish.'],
      ['Local delivery', 'Coordinate delivery inside Costa Rica without customs delays.'],
    ],
    catalog: 'Open catalog',
    coa: 'COA database',
  },
  es: {
    eyebrow: 'FLUJO LOCAL',
    title: 'Explora, verifica, pregunta y coordina localmente.',
    steps: [
      ['Ver catálogo', 'Consulta inventario en Costa Rica y precios CRC en vivo.'],
      ['Revisar COA', 'Consulta documentación de lote disponible antes de ordenar.'],
      ['Preguntar por WhatsApp', 'Habla con una persona real en español o inglés.'],
      ['Entrega local', 'Coordina entrega en Costa Rica sin demoras de aduana.'],
    ],
    catalog: 'Abrir catálogo',
    coa: 'Base COA',
  },
};

const icons = [ClipboardList, FileCheck2, MessageCircle, Truck];

export default function TrustFlowBand({ lang = 'en', compact = false }) {
  const t = COPY[lang] || COPY.en;

  return (
    <section className={`trust-flow-band${compact ? ' trust-flow-band--compact' : ''}`} aria-labelledby="trust-flow-title">
      <div className="container trust-flow-inner">
        <div className="trust-flow-head">
          <span>{t.eyebrow}</span>
          <h2 id="trust-flow-title">{t.title}</h2>
        </div>
        <div className="trust-flow-steps">
          {t.steps.map(([title, text], index) => {
            const Icon = icons[index];
            return (
              <article className="trust-flow-step" key={title}>
                <span className="trust-flow-number">{String(index + 1).padStart(2, '0')}</span>
                <div className="trust-flow-icon"><Icon size={19} strokeWidth={1.9} /></div>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            );
          })}
        </div>
        <div className="trust-flow-actions">
          <Link href={`/catalog?lang=${lang}`} className="trust-flow-primary">{t.catalog} <ArrowRight size={15} /></Link>
          <Link href={`/coa-database?lang=${lang}`} className="trust-flow-secondary">{t.coa} <ArrowRight size={15} /></Link>
        </div>
      </div>
    </section>
  );
}
