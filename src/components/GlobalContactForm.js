'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import ContactLeadModal from '@/components/ContactLeadModal';
import { CONTACT_FORM_EVENT } from '@/lib/contactForm';

// One dialog for the whole storefront, opened by the openContactForm() event.
// Kept out of /admin and /embed for the same reason as the chat widget.
export default function GlobalContactForm() {
  const pathname = usePathname();
  const [source, setSource] = useState('');
  const [lang, setLang] = useState('es');

  const hidden = pathname?.startsWith('/admin') || pathname?.startsWith('/embed');

  useEffect(() => {
    if (hidden) return undefined;
    const onOpen = (event) => {
      // Language is read at open time rather than held in state, so the dialog
      // always matches whatever the visitor has the site set to right now.
      try { setLang(window.localStorage.getItem('lang') === 'en' ? 'en' : 'es'); } catch { setLang('es'); }
      setSource(event.detail?.source || 'contact_form');
    };
    window.addEventListener(CONTACT_FORM_EVENT, onOpen);
    return () => window.removeEventListener(CONTACT_FORM_EVENT, onOpen);
  }, [hidden]);

  if (hidden) return null;

  return (
    <ContactLeadModal
      open={Boolean(source)}
      onClose={() => setSource('')}
      lang={lang}
      source={source}
    />
  );
}
