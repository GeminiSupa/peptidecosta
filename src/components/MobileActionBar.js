"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, MessageCircle } from 'lucide-react';

export default function MobileActionBar({ lang = 'en', whatsappHref, onWhatsapp }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 260);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const catalogText = lang === 'en' ? 'Catalog' : 'Catálogo';
  const whatsappLabel = lang === 'en' ? 'Ask us on WhatsApp' : 'Preguntar por WhatsApp';

  return (
    <div className={`lp-mobile-actions${visible ? ' is-visible' : ''}`} aria-label={lang === 'en' ? 'Quick actions' : 'Acciones rápidas'}>
      <Link href={`/catalog?lang=${lang}`} className="lp-mobile-action lp-mobile-action--catalog" aria-label={lang === 'en' ? 'Open catalog' : 'Abrir catálogo'}>
        {catalogText} <ArrowUpRight size={15} />
      </Link>
      {onWhatsapp ? (
        <button type="button" onClick={onWhatsapp} className="lp-mobile-action lp-mobile-action--wa" aria-label={whatsappLabel}>
          <MessageCircle size={16} /> WhatsApp
        </button>
      ) : (
        <a href={whatsappHref} className="lp-mobile-action lp-mobile-action--wa" target="_blank" rel="noopener noreferrer" aria-label={whatsappLabel}>
          <MessageCircle size={16} /> WhatsApp
        </a>
      )}
    </div>
  );
}
