"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, MessageCircle } from 'lucide-react';
import { openContactForm } from '@/lib/contactForm';

// The second action used to be a wa.me link. Every company WhatsApp number was
// banned, so those links went nowhere from every public page that renders this
// bar; it now opens the Contáctenos lead form instead.
//
// `whatsappHref` and `onWhatsapp` are still accepted so the ten pages passing
// them keep working without edits, but they are no longer used to build a
// WhatsApp link. `onContact` lets a page capture the click itself (the landing
// page does, to tag the lead source).
export default function MobileActionBar({ lang = 'en', onContact, source = 'mobile_sticky' }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 260);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const catalogText = lang === 'en' ? 'Catalog' : 'Catálogo';
  const contactLabel = lang === 'en' ? 'Contact Us' : 'Contáctenos';

  return (
    <div className={`lp-mobile-actions${visible ? ' is-visible' : ''}`} aria-label={lang === 'en' ? 'Quick actions' : 'Acciones rápidas'}>
      <Link href={`/catalog?lang=${lang}`} className="lp-mobile-action lp-mobile-action--catalog" aria-label={lang === 'en' ? 'Open catalog' : 'Abrir catálogo'}>
        {catalogText} <ArrowUpRight size={15} />
      </Link>
      <button
        type="button"
        onClick={() => (onContact ? onContact() : openContactForm(source))}
        className="lp-mobile-action lp-mobile-action--wa"
        aria-label={contactLabel}
      >
        <MessageCircle size={16} /> {contactLabel}
      </button>
    </div>
  );
}
