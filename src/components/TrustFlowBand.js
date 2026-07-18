"use client";

import Link from 'next/link';
import { ArrowRight, ClipboardList, FileCheck2, MessageCircle, Truck } from 'lucide-react';

const COPY = {
  en: {
    eyebrow: 'LOCAL ORDER FLOW',
    title: 'A simpler way to order in Costa Rica.',
    intro: 'Start with live stock and batch details, then coordinate directly with our team.',
    steps: [
      ['Choose', 'Browse current local stock with live CRC pricing.'],
      ['Verify', 'Review COA and batch details before you order.'],
      ['Confirm', 'Ask questions and confirm through WhatsApp.'],
      ['Receive', 'Coordinate Costa Rica delivery without customs delays.'],
    ],
    catalog: 'Open catalog',
    coa: 'COA database',
  },
  es: {
    eyebrow: 'FLUJO LOCAL',
    title: 'Ordenar en Costa Rica, sin vueltas.',
    intro: 'Empieza con inventario real y detalles de lote, luego coordina directo con nuestro equipo.',
    steps: [
      ['Elige', 'Revisa stock local y precios CRC actualizados.'],
      ['Verifica', 'Consulta COA y detalles del lote antes de ordenar.'],
      ['Confirma', 'Haz preguntas y confirma por WhatsApp.'],
      ['Recibe', 'Coordina entrega en Costa Rica sin aduana.'],
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
          <p>{t.intro}</p>
          <div className="trust-flow-actions">
            <Link href={`/catalog?lang=${lang}`} className="trust-flow-primary">{t.catalog} <ArrowRight size={15} /></Link>
            <Link href={`/coa-database?lang=${lang}`} className="trust-flow-secondary">{t.coa} <ArrowRight size={15} /></Link>
          </div>
        </div>
        <div className="trust-flow-steps">
          {t.steps.map(([title, text], index) => {
            const Icon = icons[index];
            return (
              <article className="trust-flow-step" key={title}>
                <span className="trust-flow-number">{String(index + 1).padStart(2, '0')}</span>
                <div className="trust-flow-icon"><Icon size={19} strokeWidth={1.9} /></div>
                <div className="trust-flow-copy">
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
