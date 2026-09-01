'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { safeLocalStorage as localStorage } from '@/lib/storage';
import { formatPrice } from '@/lib/money.mjs';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import {
  EXIT_INTENT_MIN_BROWSE_MS,
  EXIT_INTENT_STORAGE_KEY,
  formatCountdown,
  isOfferLive,
  offerRemainingMs,
  previewSavings,
  shouldOfferExitIntent,
} from '@/lib/exitIntentOffer.mjs';

/**
 * The last-chance discount, shown to a first-time shopper who is leaving with a
 * cart.
 *
 * Deliberately not a second access gate. It appears once, it can always be
 * closed, and it offers something rather than asking for something — the
 * catalog's other overlay is a lead ask, and the two must never be on screen
 * together.
 *
 * The rules it obeys live in lib/exitIntentOffer.mjs; what is here is the
 * detection, the clock and the markup.
 */

const TEXT = {
  es: {
    heading: (pct) => `¡Espera! Obtené un ${pct}% EXTRA de descuento`,
    body: (pct, minutes) => `Completá tu pedido en los próximos ${minutes} minutos y recibí un ${pct}% de descuento adicional.`,
    stacks: 'Se suma al descuento por volumen y a las ofertas del catálogo que ya tenés en el carrito.',
    savings: (amount) => `Ahorrás ${amount}`,
    codeLabel: 'Código',
    cta: (pct) => `OBTENER ${pct}% EXTRA`,
    applied: '✓ Descuento aplicado a tu carrito',
    expiresIn: 'Tu oferta vence en',
    expired: 'La oferta venció. El precio volvió a su valor normal.',
    footnote: 'Oferta especial por tiempo limitado, solo para tu primera compra.',
    close: 'Cerrar',
    whatsapp: '¿Tenés dudas? Escribinos por WhatsApp',
    whatsappMessage: '¡Hola! Tengo una consulta sobre mi pedido.',
  },
  en: {
    heading: (pct) => `Wait! Get an EXTRA ${pct}% off`,
    body: (pct, minutes) => `Finish your order in the next ${minutes} minutes and get an extra ${pct}% off.`,
    stacks: 'It adds to the volume discount and the catalog offers already in your cart.',
    savings: (amount) => `You save ${amount}`,
    codeLabel: 'Code',
    cta: (pct) => `GET ${pct}% EXTRA OFF`,
    applied: '✓ Discount applied to your cart',
    expiresIn: 'Your offer expires in',
    expired: 'The offer expired. Your total is back to its normal price.',
    footnote: 'Limited-time offer, first purchase only.',
    close: 'Close',
    whatsapp: 'Questions? Message us on WhatsApp',
    whatsappMessage: 'Hi! I have a question about my order.',
  },
};

function readStoredOffer() {
  try {
    const raw = localStorage.getItem(EXIT_INTENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeOffer(offer) {
  try {
    localStorage.setItem(EXIT_INTENT_STORAGE_KEY, JSON.stringify(offer));
  } catch {
    // A browser refusing storage costs the customer a resumed countdown after a
    // refresh, nothing more. The code itself lives in the database.
  }
}

export default function ExitIntentOffer({
  lang = 'es',
  currency = 'CRC',
  sessionId = '',
  customerEmail = '',
  customerPhone = '',
  cartItemCount = 0,
  discountableSubtotal = 0,
  volumePct = 0,
  cartTotalUsd = 0,
  hasPromoApplied = false,
  gateVisible = false,
  checkoutBusy = false,
  appliedCode = null,
  onApply,
  onExpire,
  whatsappNumber = '',
}) {
  const [offer, setOffer] = useState(null);
  const [visible, setVisible] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);

  // A visitor who has already had their offer — spent, lapsed, or refused by
  // the server — never gets asked again. Held in a ref as well as storage so
  // the running page stops trying without waiting for a re-read.
  const spentRef = useRef(false);
  const mountedAtRef = useRef(Date.now());
  const requestingRef = useRef(false);
  const backTrapRef = useRef(false);
  // The clock keeps ticking past zero; the handover to the cart happens once.
  const expiredRef = useRef(false);
  // Held in a ref, not a dependency: the catalog re-renders on every cart
  // change, and a fresh callback identity each time would restart the
  // countdown's interval before it ever completed a tick.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const t = TEXT[lang === 'en' ? 'en' : 'es'];

  // The exit listeners are attached once but fire much later, so they must read
  // the conditions as they are at that moment rather than the ones that
  // happened to be true when the page mounted.
  const conditionsRef = useRef({ cartItemCount, hasPromoApplied, gateVisible, checkoutBusy });
  useEffect(() => {
    conditionsRef.current = { cartItemCount, hasPromoApplied, gateVisible, checkoutBusy };
  }, [cartItemCount, hasPromoApplied, gateVisible, checkoutBusy]);

  // Resume anything already minted for this browser.
  useEffect(() => {
    const stored = readStoredOffer();
    if (!stored) return;
    if (isOfferLive(stored)) {
      setOffer(stored);
      setRemainingMs(offerRemainingMs(stored));
    } else {
      // It ran out while they were away. That was the offer.
      spentRef.current = true;
    }
  }, []);

  const requestOffer = useCallback(async () => {
    if (requestingRef.current) return null;
    requestingRef.current = true;
    try {
      const res = await fetch('/api/promo/exit-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          email: customerEmail,
          phone: customerPhone,
          cartTotalUsd,
        }),
      });
      const data = await res.json();
      if (!data?.eligible || !data?.code) {
        // Not eligible is a permanent answer for this visitor — a prior order
        // or a code they already had. Asking again on the next mouse flick
        // would be pure noise.
        spentRef.current = true;
        return null;
      }

      const minted = {
        code: data.code,
        discountPct: Number(data.discountPct),
        expiresAt: data.expiresAt,
        // The server's clock minus this device's, so the countdown on screen
        // and the deadline the order endpoint enforces are the same moment.
        skewMs: Date.parse(data.serverNow) - Date.now(),
      };
      storeOffer(minted);
      return minted;
    } catch {
      return null;
    } finally {
      requestingRef.current = false;
    }
  }, [sessionId, customerEmail, customerPhone, cartTotalUsd]);

  const trigger = useCallback(async () => {
    if (spentRef.current) return;
    const eligible = shouldOfferExitIntent({
      ...conditionsRef.current,
      offerSpent: spentRef.current,
      msOnPage: Date.now() - mountedAtRef.current,
    });
    if (!eligible) return;

    const existing = offer && isOfferLive(offer) ? offer : await requestOffer();
    if (!existing) return;

    setOffer(existing);
    setRemainingMs(offerRemainingMs(existing));
    setVisible(true);
  }, [offer, requestOffer]);

  // Exit detection.
  //
  // Two different gestures, because "leaving" is not the same act on a phone as
  // on a desktop. A pointer thrown at the address bar has no mobile equivalent,
  // and a catalog whose traffic is mostly phones would otherwise never fire.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (spentRef.current) return undefined;

    const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;

    const onMouseOut = (event) => {
      // Only the top edge, and only when the pointer actually left the document
      // — relatedTarget is null on the way out of the window, and set when it
      // merely crossed into another element.
      if (event.clientY >= 50 || event.relatedTarget !== null) return;
      trigger();
    };

    const onPopState = () => {
      trigger();
    };

    const onVisibility = () => {
      // Firing while the tab is hidden shows the popup to nobody and spends the
      // one chance we get; this waits until they are looking again.
      if (document.visibilityState === 'visible') trigger();
    };

    if (coarsePointer) {
      // The back-button trap: one extra history entry, so the first back press
      // lands here instead of leaving. Armed once and never re-armed, so a
      // customer who genuinely wants to go back is delayed by one press, not
      // held on the page.
      if (!backTrapRef.current) {
        backTrapRef.current = true;
        try {
          window.history.pushState({ exitIntentGuard: true }, '');
        } catch {
          // Some in-app browsers refuse pushState. Visibility still covers them.
        }
      }
      window.addEventListener('popstate', onPopState);
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        window.removeEventListener('popstate', onPopState);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }

    document.addEventListener('mouseout', onMouseOut);
    return () => document.removeEventListener('mouseout', onMouseOut);
  }, [trigger]);

  // The clock. Runs whenever an offer exists, not only while the popup is open,
  // so a code applied to the cart still expires on screen after it is dismissed.
  useEffect(() => {
    if (!offer) return undefined;

    const tick = () => {
      const left = offerRemainingMs(offer);
      setRemainingMs(left);
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        spentRef.current = true;
        // Take the dead code back out of the cart. Leaving it there would let
        // the customer reach the payment button with a discount the order
        // endpoint is about to reject — the total on screen would be a price
        // they cannot actually pay.
        onExpireRef.current?.(offer.code);
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offer]);

  // The customer removed the code by hand, or the cart stopped qualifying.
  useEffect(() => {
    if (applied && appliedCode !== offer?.code) setApplied(false);
  }, [applied, appliedCode, offer]);

  const handleApply = async () => {
    if (!offer || applying) return;
    setApplying(true);
    try {
      await onApply?.(offer.code);
      setApplied(true);
    } finally {
      setApplying(false);
    }
  };

  if (!visible || !offer) return null;

  const pct = Math.round(offer.discountPct * 100);
  // The time actually left, not the window it started with: on a resumed
  // offer those differ, and the sentence has to match the clock beneath it.
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const expired = remainingMs <= 0;
  const savings = previewSavings({
    discountableSubtotal,
    volumePct,
    discountPct: offer.discountPct,
    currency,
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.heading(pct)}
      onClick={() => setVisible(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(8px)',
        // Above the cart drawer (1101) and the access gate, below nothing else
        // the catalog puts on screen.
        zIndex: 12000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'exitOfferFade 0.25s ease-out forwards',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          borderTop: '6px solid #d21f24',
          borderRadius: '16px',
          padding: '26px 22px 24px',
          maxWidth: '380px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
          position: 'relative',
          textAlign: 'center',
          color: 'var(--text-main)',
          animation: 'exitOfferRise 0.45s cubic-bezier(0.175,0.885,0.32,1.275) forwards',
        }}
      >
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label={t.close}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            border: 'none',
            background: 'var(--bg-secondary)',
            color: 'var(--text-muted)',
            fontSize: '20px',
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          &times;
        </button>

        {expired ? (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '10px' }}>⌛</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: '0 0 18px' }}>
              {t.expired}
            </p>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 10px', paddingRight: '18px' }}>
              {t.heading(pct)}
            </h2>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 12px' }}>
              {t.body(pct, minutes)}
            </p>

            {savings > 0 && (
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#16a34a', margin: '0 0 10px' }}>
                {t.savings(formatPrice(savings, currency))}
              </div>
            )}

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45, margin: '0 0 16px' }}>
              {t.stacks}
            </p>

            <div
              style={{
                border: '1px dashed rgba(210,31,36,0.4)',
                background: 'rgba(210,31,36,0.06)',
                borderRadius: '10px',
                padding: '10px',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t.codeLabel}
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '0.08em', color: '#d21f24' }}>
                {offer.code}
              </div>
            </div>

            {applied ? (
              <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(22,163,74,0.1)', color: '#16a34a', fontWeight: 700, fontSize: '0.9rem' }}>
                {t.applied}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleApply}
                disabled={applying}
                style={{
                  width: '100%',
                  padding: '13px 20px',
                  border: 'none',
                  borderRadius: '10px',
                  background: '#ff6b00',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: applying ? 'wait' : 'pointer',
                  boxShadow: '0 4px 10px rgba(255,107,0,0.3)',
                }}
              >
                {t.cta(pct)}
              </button>
            )}

            <div style={{ marginTop: '14px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
              ⏱ {t.expiresIn} <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCountdown(remainingMs)}</span>
            </div>

            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '10px 0 0' }}>
              {t.footnote}
            </p>
          </>
        )}

        {/* Not everyone leaving wants a discount; some have a question and no
            way to ask it. The old exit popup offered this and it should not be
            lost — a WhatsApp conversation recovers a sale a coupon cannot. */}
        {whatsappNumber && (
          <a
            href={buildWhatsAppLink(whatsappNumber, t.whatsappMessage)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              marginTop: '16px',
              color: '#22c55e',
              fontSize: '0.82rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {t.whatsapp}
          </a>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes exitOfferFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes exitOfferRise {
          from { opacity: 0; transform: translateY(40px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      ` }} />
    </div>
  );
}
