"use client";

import { safeLocalStorage as localStorage, safeSessionStorage } from '@/lib/storage';
import costaricaData from '@/lib/costarica.json';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { buildWhatsAppLink, cleanPhoneNumber, logWhatsAppSource } from '@/lib/whatsapp';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { getFacebookReviewUrl, getTrustpilotReviewUrl } from '@/lib/businessLinks';
import { useTrustpilotRating } from '@/hooks/useTrustpilotRating';
import { getPromoBadgeForProduct } from '@/lib/promoBadge.mjs';
import { countPromoEligibleUnits, checkUnitLimits, unitLimitsMessage, effectiveVolumeDiscountPct, replacesVolumeDiscount } from '@/lib/promoEligibility.mjs';
import { tenPlusDiscountPct, STANDARD_FIVE_PLUS_PCT } from '@/lib/bulkDeal.mjs';
import {
  PHONE_COUNTRIES,
  DEFAULT_PHONE_COUNTRY,
  findPhoneCountry,
  toE164,
  splitE164,
  isValidE164,
} from '@/lib/phoneFormat.mjs';
import {
  isBacWater,
  isSellableBacWater,
  bacUnitPrice,
  summarizeBacWater,
  applyBacAwareDiscount,
  buildBacAwareOrderItems,
  checkBacOnlyMinimum,
  bacOnlyMinimumMessage,
  BAC_WATER_ONLY_MIN_UNITS,
  BAC_WATER_10ML_ONLY_MIN_UNITS,
  getBacWaterSizeMl,
} from '@/lib/bacWater.mjs';
import { shouldScheduleWaReprompt, WA_REPROMPT_DELAY_MS } from '@/lib/waReprompt.mjs';
import { shouldScheduleAccessGate, CATALOG_GATE_DELAY_MS } from '@/lib/catalogGate.mjs';
import { formatPrice as formatPriceVal, roundToCents } from '@/lib/money.mjs';
import { GCR_STORAGE_KEY, buildReviewOptInRecord } from '@/lib/googleCustomerReviews.mjs';
import {
  identityMessage,
  normalizeCustomerName,
  validateCustomerName,
} from '@/lib/checkoutIdentity.mjs';
import { 
  ShoppingBag, X, Search, SlidersHorizontal,
  List, Grid, Sparkles, Phone, FileText, 
  Plus, Minus, Trash2, Check, CheckCircle, AlertCircle, ArrowLeft,
  ChevronLeft, ChevronRight,
  Dna, FlaskConical, Syringe, TestTubes, Atom,
  Brain, Shield, Moon, Sun, Flame, Zap, Droplets, Microscope, Star,
  CreditCard, MessageCircle, Lock, Share2, User
} from 'lucide-react';
import { getCustomerSupabase } from '@/lib/customerSupabase';
import { useCustomerSession } from '@/hooks/useCustomerSession';
import { buildReorderLines, mergeReorderIntoCart, reorderNoticeMessage } from '@/lib/reorderCart.mjs';
import { takeReorder } from '@/lib/reorderHandoff';
import PressBand from '@/components/PressBand';
import { CatalogPromoBanner } from '@/components/StorefrontChrome';
import ExitIntentOffer from '@/components/catalog/ExitIntentOffer';
import { mergeLandingPageSettings } from '@/lib/landingContent';
import {
  readCatalogParams,
  resolveCategoryParam,
  productMatchesCatalogSearch,
  rankCatalogSearchResults,
  compareBySaleAndStock,
} from '@/lib/catalogFilters.mjs';
import { cardCheckoutMessage } from '@/lib/cardCheckoutMessages.mjs';
import { areCardPaymentsPausedForClient } from '@/lib/cardPaymentsPaused.mjs';
// Band-checked before this page will price anything in it: a rate handed back
// by the API is still a number from off this machine.
import { isPlausibleRate } from '@/lib/pricing';
import { tooManyAttemptsMessage, tooManyAttemptsTitle } from '@/lib/checkoutRateLimits.mjs';

// const WHATSAPP_NUMBER = '50684046973'; // Replaced with useBusinessLinks()
const FALLBACK_EXCHANGE_RATE = 454.48;
const FREE_SHIPPING_USD_THRESHOLD = 200;
const FLAT_SHIPPING_CRC = 2500;
// The maintenance pause, read at module scope. Kept separate from
// CARD_CHECKOUT_ENABLED below because the two mean different things to a
// customer: "not built yet" (Coming soon) versus "temporarily broken, we are
// sorry". CARD_CHECKOUT_AVAILABLE is what the checkout keys on, so either
// switch alone is enough to take the card option away.
const CARD_PAYMENTS_PAUSED = areCardPaymentsPausedForClient();
const CARD_CHECKOUT_ENABLED = process.env.NEXT_PUBLIC_ENABLE_CARD_CHECKOUT === 'true';
const CARD_CHECKOUT_AVAILABLE = CARD_CHECKOUT_ENABLED && !CARD_PAYMENTS_PAUSED;
// 'live' hides the sandbox/test labels. Keep unset (sandbox) until the LIVE
// Shield Hub Pay credentials are in place, then set NEXT_PUBLIC_CARD_CHECKOUT_MODE=live.
const CARD_CHECKOUT_LIVE = process.env.NEXT_PUBLIC_CARD_CHECKOUT_MODE === 'live';
const GATE_BYPASS_VALUES = new Set(['1', 'true', 'yes', 'skip', 'bypass']);
const USER_SELECTED_LANG_KEY = 'lang_user_selected';

const CATEGORY_TRANSLATIONS = {
  'Weight Loss & Metabolism': 'Pérdida de peso y metabolismo',
  'Exercise Mimetic & Metabolic Modulator': 'Exercise Mimetic & Metabolic Modulator',
  'Recovery & Healing': 'Recuperación y curación',
  'Anti-Inflammatory': 'Antiinflamatorio',
  'Performance & Hormones': 'Rendimiento y hormonas',
  'Anti-Aging & Longevity': 'Antienvejecimiento y longevidad',
  'Immune System Modulation': 'Modulación del sistema inmunitario',
  'Cognitive & Mood': 'Cognitivo y estado de ánimo',
  'Sleep': 'Dormir',
  'Sexual Health': 'Salud sexual',
  'Tanning & Sexual Function': 'Bronceado y función sexual',
  'Skin & Hair': 'Piel y cabello',
  'Immune & Antioxidant': 'Sistema inmunitario y antioxidante',
  'Reconstitution Supply': 'Suministro de reconstitución'
};

const isWeightLossCategory = (catText) => {
  const normalized = String(catText || '').toLowerCase();
  return (
    normalized.includes('weight loss') ||
    normalized.includes('perder peso') ||
    normalized.includes('perdida de peso') ||
    normalized.includes('pérdida de peso')
  );
};

const STATUS_TRANSLATIONS = {
  es: {
    'in stock': 'Disponible',
    'out of stock': 'Agotado',
    'coming soon': 'Próximamente'
  },
  en: {
    'in stock': 'In Stock',
    'out of stock': 'Out of Stock',
    'coming soon': 'Coming Soon'
  }
};

const getEmojiForCategory = (cat) => {
  const c = (cat || '').toLowerCase();
  if (c.includes('weight') || c.includes('peso')) return '⚖️';
  if (c.includes('sleep') || c.includes('sueño')) return '🌙';
  if (c.includes('sexual')) return '🔥';
  if (c.includes('skin') || c.includes('piel')) return '✨';
  if (c.includes('immune') || c.includes('inmune')) return '🛡️';
  if (c.includes('supply') || c.includes('suministro')) return '💧';
  if (c.includes('brain') || c.includes('cerebro')) return '🧠';
  if (c.includes('muscle') || c.includes('músculo')) return '💪';
  return '🧪';
};

const translateDiscount = (str, targetLang) => {
  if (!str) return '';
  const s = str.trim();
  
  // Extract the quantity and percentage numbers using regex
  const match = s.match(/(\d+).*?(\d+)%/);
  if (match) {
    const qty = match[1];
    const pct = match[2];
    if (targetLang === 'en') {
      return `Buy ${qty}+ vials, get ${pct}% off`;
    } else {
      return `Compra ${qty}+ viales, ${pct}% de desc.`;
    }
  }
  
  // Fallback for strings that don't match standard patterns
  if (targetLang === 'en') {
    let result = s.replace(/compra/i, 'Buy');
    result = result.replace(/descuento/i, 'off');
    result = result.replace(/viales/i, 'vials');
    return result;
  }
  
  return s;
};

// Get high-quality, category/product-specific Costa Rica peptide vial image fallback
const getProductFallbackImage = (productName, category) => {
  const nameLower = (productName || '').toLowerCase();
  const catLower = (category || '').toLowerCase();

  // Reconstitution/water
  if (nameLower.includes('bac water') || nameLower.includes('bacteriostatic')) {
    return '/modern_3d_vial_hero.png';
  }

  // Stacks, blends, or combinations
  if (
    nameLower.includes('blend') || 
    nameLower.includes('stack') || 
    nameLower.includes('+') || 
    nameLower.includes('wolverine') ||
    nameLower.includes('group')
  ) {
    return productName.length % 2 === 0 ? '/vials_group_costarica.png' : '/modern_3d_vials_group.png';
  }

  // Categories mapping
  if (catLower.includes('weight') || catLower.includes('peso') || catLower.includes('metabol')) {
    return '/vial_costarica_hero.png';
  }
  if (catLower.includes('recovery') || catLower.includes('healing') || catLower.includes('curación')) {
    return '/hero_peptide_vial.png';
  }
  if (catLower.includes('performance') || catLower.includes('hormon') || catLower.includes('rendimiento')) {
    return '/modern_3d_vial_hero.png';
  }
  if (catLower.includes('aging') || catLower.includes('longevity') || catLower.includes('longevidad')) {
    return '/vial_costarica_hero.png';
  }
  if (catLower.includes('cognitive') || catLower.includes('mood') || catLower.includes('cognitivo')) {
    return '/hero_peptide_vial.png';
  }
  if (catLower.includes('skin') || catLower.includes('hair') || catLower.includes('piel') || catLower.includes('cabello')) {
    return '/modern_3d_vial_hero.png';
  }

  // Fallbacks
  if (productName.length % 3 === 0) {
    return '/vial_costarica_hero.png';
  } else if (productName.length % 3 === 1) {
    return '/modern_3d_vial_hero.png';
  } else {
    return '/hero_peptide_vial.png';
  }
};

// Costa Rica Provinces and Cantons dataset
const COSTA_RICA_TERRITORY = {
  'San José': [
    'San José', 'Escazú', 'Desamparados', 'Puriscal', 'Tarrazú', 'Aserrí', 'Mora', 
    'Goicoechea', 'Santa Ana', 'Alajuelita', 'Vázquez de Coronado', 'Acosta', 
    'Tibás', 'Moravia', 'Montes de Oca', 'Turrubares', 'Dota', 'Curridabat', 
    'Pérez Zeledón', 'León Cortés Castro'
  ],
  'Alajuela': [
    'Alajuela', 'San Ramón', 'Grecia', 'San Mateo', 'Atenas', 'Naranjo', 'Palmares', 
    'Poás', 'Orotina', 'San Carlos', 'Zarcero', 'Sarchí', 'Upala', 'Los Chiles', 
    'Guatuso', 'Río Cuarto'
  ],
  'Cartago': [
    'Cartago', 'Paraíso', 'La Unión', 'Jiménez', 'Turrialba', 'Alvarado', 'Oreamuno', 'El Guarco'
  ],
  'Heredia': [
    'Heredia', 'Barva', 'Santo Domingo', 'Santa Bárbara', 'San Rafael', 'San Isidro', 
    'Belén', 'Flores', 'San Pablo', 'Sarapiquí'
  ],
  'Guanacaste': [
    'Liberia', 'Nicoya', 'Santa Cruz', 'Bagaces', 'Carrillo', 'Cañas', 'Abangares', 
    'Tilarán', 'Nandayure', 'La Cruz', 'Hojancha'
  ],
  'Puntarenas': [
    'Puntarenas', 'Esparza', 'Buenos Aires', 'Montes de Oro', 'Osa', 'Quepos', 
    'Golfito', 'Coto Brus', 'Parrita', 'Corredores', 'Garabito', 'Monteverde', 'Puerto Jiménez'
  ],
  'Limón': [
    'Limón', 'Pococí', 'Siquirres', 'Talamanca', 'Matina', 'Guácimo'
  ]
};

/**
 * The message under an invalid checkout field.
 *
 * role="alert" so it is announced the moment validation fails rather than only
 * on the next focus, and the icon so the state survives greyscale and the
 * ~8% of men with red-green colour blindness.
 */
function FieldError({ name, message }) {
  if (!message) return null;
  return (
    <div id={`error-${name}`} className="field-error" role="alert">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

/**
 * The visible label for a checkout control.
 *
 * htmlFor is required rather than optional on purpose: a label that is not tied
 * to a control is decoration, and this form previously shipped six fields whose
 * only name was a placeholder — which disappears the moment anyone types, so
 * the field is unnamed exactly when a validation error sends the user back to
 * re-read it.
 */
function CheckoutLabel({ htmlFor, children, required = false }) {
  return (
    <label htmlFor={htmlFor} className="checkout-label">
      {children}
      {required && <span className="checkout-required" aria-hidden="true">*</span>}
    </label>
  );
}

/**
 * Spread onto an input to wire it to its FieldError. Keeping the two in one
 * helper is what stops a field from looking invalid without being announced
 * as invalid, which is how the first version of this drifted.
 */
const invalidProps = (name, formErrors) => ({
  'aria-invalid': formErrors[name] ? 'true' : undefined,
  'aria-describedby': formErrors[name] ? `error-${name}` : undefined,
});

/**
 * Rows in the BAC water breakdown: a description on the left, money on the
 * right. Product names are long ("Agua Bacteriostática 10ml") and the panel is
 * narrow on a phone, so the label has to be the part that gives — it wraps and
 * may break mid-word, while the amount keeps its full width on one line.
 * Without `minWidth: 0` a flex child refuses to shrink below its content and
 * the price is pushed out of the panel instead.
 */
const bacBreakdownRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: '8px',
};

const bacBreakdownLabelStyle = {
  minWidth: 0,
  flex: '1 1 auto',
  overflowWrap: 'anywhere',
};

const bacBreakdownAmountStyle = {
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

export default function CatalogPage() {
  const { links } = useBusinessLinks();
  const { rating: liveTrustpilotRating } = useTrustpilotRating();
  const router = useRouter();
  
  // Theme, Lang, Currency States
  const [theme, setTheme] = useState('light');
  const [lang, setLang] = useState('es');
  const [currency, setCurrency] = useState('CRC');
  
  // Products Data States
  const [products, setProducts] = useState([]);
  const [promoBadges, setPromoBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDbBacked, setIsDbBacked] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(FALLBACK_EXCHANGE_RATE);
  const [exchangeRateUpdatedAt, setExchangeRateUpdatedAt] = useState(null);
  const [hiddenProducts, setHiddenProducts] = useState([]); // product names hidden from catalog by admin (not deleted)

  // Search & Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef(null);
  const categoryScrollRef = useRef(null);
  const suggestionsScrollRef = useRef(null);
  const autoPromoAppliedRef = useRef(false);
  const [catArrows, setCatArrows] = useState({ left: false, right: false });
  const [sugArrows, setSugArrows] = useState({ left: false, right: false });
  const [activeCategory, setActiveCategory] = useState('all');
  // A ?category= value held until products load, so it can be resolved against
  // the real category names rather than trusted verbatim.
  const [pendingCategory, setPendingCategory] = useState(null);
  const [landingSettings, setLandingSettings] = useState(() => mergeLandingPageSettings());
  const [showFilters, setShowFilters] = useState(false);
  const [priceFilter, setPriceFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('pop');
  const [inStockOnly, setInStockOnly] = useState(true);
  const [viewMode, setViewMode] = useState('list'); // 'list', 'grid'

  // Cart & Modals States
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  // Customer accounts: the session drives checkout prefill and stamps new
  // orders with an owner; the notice reports anything a reorder could not carry.
  const { session: customerSession, accessToken: customerAccessToken } = useCustomerSession();
  const [reorderNotice, setReorderNotice] = useState('');
  const [addedProductId, setAddedProductId] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [howToOrderOpen, setHowToOrderOpen] = useState(false);
  const [flyingItems, setFlyingItems] = useState([]);
  const [toasts, setToasts] = useState([]);

  // Checkout inputs
  const [customerName, setCustomerName] = useState('');
  // The phone box is two controls: a country and the national digits. Everything
  // downstream still reads `customerPhone`, which is kept as the composed E.164
  // number so the order, the WhatsApp send and the CRM all agree on one format.
  const [customerPhoneCountry, setCustomerPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [customerPhoneNational, setCustomerPhoneNational] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerMetadata, setCustomerMetadata] = useState(null);
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingProvince, setShippingProvince] = useState('');
  const [shippingCanton, setShippingCanton] = useState('');
  const [shippingDistrict, setShippingDistrict] = useState('');
  const [shippingDetailedAddress, setShippingDetailedAddress] = useState('');
  const [shippingZip, setShippingZip] = useState('');

  // Promo Code State
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoData, setPromoData] = useState(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [customerIdType, setCustomerIdType] = useState('1');
  const [customerIdNumber, setCustomerIdNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('whatsapp');
  const [cardDetails, setCardDetails] = useState({
    holder: '',
    number: '',
    expiry: '',
    cvv: '',
  });
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  // Why the order could not be placed, in words the customer can act on.
  // { title, detail } — see failCheckout().
  const [checkoutError, setCheckoutError] = useState(null);
  // The one cart line that just hit its stock ceiling. { product, available }
  // — see flagStockLimit(). One at a time: it is a response to a tap, not a
  // standing list of everything that happens to be short.
  const [stockNotice, setStockNotice] = useState(null);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [cartAnimating, setCartAnimating] = useState(false);
  const [sessionId, setSessionId] = useState('');

  const cartItemCount = cart.reduce((total, item) => total + item.qty, 0);

  const openCatalogWhatsApp = () => {
    logWhatsAppSource('catalog_sticky_cta', lang);
    localStorage.setItem('whatsapp_source', 'catalog_sticky_cta');
    window.open(buildWhatsAppLink(links.whatsappNumber, null, lang), '_blank', 'noopener,noreferrer');
  };

  // Reviews States
  const [reviews, setReviews] = useState([]);
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const [reviewName, setReviewName] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  // Access Gate States
  const [gateAccessGranted, setGateAccessGranted] = useState(false); // Default false for security, updated in useEffect
  const [gateLoading, setGateLoading] = useState(true);
  const [gateVisible, setGateVisible] = useState(false); // New visitors see products for 15s before the gate appears.
  // A skip button appears in the gate's corner a few seconds after it opens, so
  // a visitor who does not want to hand over contact details can still browse
  // rather than typing a junk number just to get past it.
  const [gateCloseVisible, setGateCloseVisible] = useState(false);
  const [gateInput, setGateInput] = useState('');
  const [gateSubmitting, setGateSubmitting] = useState(false);
  const [gateError, setGateError] = useState('');
  // Unchecked by default. Consent that arrives pre-ticked, bundled with the
  // only way to see prices, is not freely given — and it poisons list quality,
  // because everyone who just wanted the catalog lands on the marketing list.
  const [gateConsent, setGateConsent] = useState(false);

  // Second-chance WhatsApp opt-in re-prompt (for visitors who unlocked the
  // catalog but did NOT opt in). Shown at most once / 3 days, stops after 2 dismissals.
  const [showWaReprompt, setShowWaReprompt]           = useState(false);
  const [waRepromptPhone, setWaRepromptPhone]         = useState('');
  const [waRepromptSubmitting, setWaRepromptSubmitting] = useState(false);
  const [waRepromptDone, setWaRepromptDone]           = useState(false);

  // Card Payment State
  const [cardSubmitting, setCardSubmitting] = useState(false);
  // Set when trying again cannot help, and in the `unconfirmed` case would be
  // actively harmful: every attempt builds a NEW order number, and the
  // double-charge lock only guards a single one.
  const [cardRetryBlocked, setCardRetryBlocked] = useState(false);
  // Synchronous double-submit guard. The `cardSubmitting` state guard updates too
  // late to stop a fast second click, so a ref blocks re-entry the instant the
  // handler fires — repeated charge attempts are what trip the gateway's
  // "attempts allowed" limit and can double-charge the customer.
  const cardSubmitLockRef = useRef(false);

  // Contact Modal States
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactFormName, setContactFormName] = useState('');
  const [contactFormEmail, setContactFormEmail] = useState('');
  const [contactFormSubject, setContactFormSubject] = useState('');
  const [contactFormMessage, setContactFormMessage] = useState('');
  const [contactFormLoading, setContactFormLoading] = useState(false);
  const [contactFormSuccess, setContactFormSuccess] = useState(false);
  const [contactFormError, setContactFormError] = useState('');
  
  // The country picker and the digits box are the inputs; `customerPhone` is
  // derived from them, never typed into directly.
  useEffect(() => {
    setCustomerPhone(toE164(customerPhoneNational, customerPhoneCountry));
  }, [customerPhoneNational, customerPhoneCountry]);

  /**
   * Load a stored or recovered number back into the two controls. Numbers saved
   * before the country picker existed are bare Costa Rica digits, which
   * `splitE164` reads as such.
   */
  const applyStoredPhone = useCallback((stored) => {
    const { countryCode, nationalNumber } = splitE164(stored);
    setCustomerPhoneCountry(countryCode);
    setCustomerPhoneNational(nationalNumber);
  }, []);

  const phoneLooksValid = !customerPhone || isValidE164(customerPhone, customerPhoneCountry);

  /**
   * Hand the confirmation page what Google Customer Reviews needs to ask for a
   * review: order number, email, and a delivery estimate.
   *
   * Written here rather than read off the URL on arrival, because this is the
   * only moment all of it exists together. Two of the three ways a customer
   * reaches /thank-you carry no order number, and the WhatsApp flow clears the
   * saved email before it redirects. Session storage rather than a query string
   * so an email address never enters a URL, and rather than localStorage so it
   * expires with the tab.
   */
  const stashReviewOptIn = (orderNumber) => {
    try {
      safeSessionStorage.setItem(GCR_STORAGE_KEY, JSON.stringify(buildReviewOptInRecord({
        orderId: orderNumber,
        email: customerEmail,
      })));
    } catch {
      // A missing review prompt is not a reason to interrupt a paid order.
    }
  };

  // Let new visitors see the populated catalog before asking for contact info.
  //
  // Never over an open cart. The gate is a lead ask; someone in the drawer is
  // a customer trying to pay, and the overlay sits on top of it (z-index 9999
  // against the drawer's 1101), burying the total and the checkout button.
  // Opening the cart takes the gate down and stops the clock; closing it
  // starts the wait over, so the ask is deferred rather than spent.
  //
  // And never over anyone holding a cart at all, drawer open or not. Deferring
  // only while the drawer was open meant a visitor who added a vial and closed
  // it to keep shopping was gated fifteen seconds later anyway — which was the
  // whole point of the exemption, missed by a click.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hasAccess = localStorage.getItem('catalog_access_granted') === 'true';
    setGateAccessGranted(hasAccess);
    setGateLoading(false);

    // The other order of events: the cart fills while the gate is already up.
    // The reorder, stock-limit and recovered-cart flows all open the drawer
    // without a click, and a returning visitor's saved cart is read out of
    // localStorage a moment after mount — after this effect has already run
    // once on an empty one.
    if (isCartOpen || cartItemCount > 0) setGateVisible(false);

    if (!shouldScheduleAccessGate({ hasAccess, catalogLoading: loading, isCartOpen, cartItemCount })) return;

    const timer = setTimeout(() => setGateVisible(true), CATALOG_GATE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loading, isCartOpen, cartItemCount]);

  // Reveal the gate's skip button 5s after it opens, and hide it again whenever
  // the gate is not on screen so a re-shown gate always starts without one.
  useEffect(() => {
    const gateOpen = !gateAccessGranted && gateVisible && !gateLoading;
    if (!gateOpen) {
      setGateCloseVisible(false);
      return undefined;
    }
    const timer = setTimeout(() => setGateCloseVisible(true), 5000);
    return () => clearTimeout(timer);
  }, [gateAccessGranted, gateVisible, gateLoading]);

  // Let someone into the catalog without handing over contact details. Grants
  // the same access the bypass link does, so they are not asked again on this
  // device — the point is to stop junk numbers, not to nag.
  const dismissGate = () => {
    try { localStorage.setItem('catalog_access_granted', 'true'); } catch {}
    setGateAccessGranted(true);
    setGateVisible(false);
  };

  // Second-chance WhatsApp opt-in re-prompt: for visitors who unlocked the
  // catalog but never opted in. Fires once (after 15s), at most once / 3 days,
  // and stops entirely after 2 dismissals so it never becomes a nuisance.
  //
  // Never while the cart is open. The prompt is a marketing ask; the open
  // drawer is a customer trying to pay, and the card lands squarely over the
  // total and the submit button. The timer does not start while the drawer is
  // open and restarts when it closes, so the ask is delayed rather than spent:
  // lastShown is stamped when the card actually appears, and a prompt that was
  // never shown must not burn its three-day slot.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let state = { lastShown: 0, dismisses: 0 };
    try { state = { ...state, ...JSON.parse(localStorage.getItem('wa_optin_prompt') || '{}') }; } catch {}

    const allowed = shouldScheduleWaReprompt({
      hasAccess: localStorage.getItem('catalog_access_granted') === 'true',
      optedIn: localStorage.getItem('wa_opted_in') === 'true',
      isCartOpen,
      state,
    });
    if (!allowed) return;

    const stored = localStorage.getItem('catalog_lead_contact') || '';
    if (stored && !stored.includes('@')) setWaRepromptPhone(stored);

    const timer = setTimeout(() => {
      setShowWaReprompt(true);
      localStorage.setItem('wa_optin_prompt', JSON.stringify({ ...state, lastShown: Date.now() }));
    }, WA_REPROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isCartOpen]);

  // The other order of events: the card is already up when the cart is opened.
  // It steps aside without counting a dismissal, because the customer did not
  // dismiss it — they went to check out.
  useEffect(() => {
    if (isCartOpen) setShowWaReprompt(false);
  }, [isCartOpen]);

  const handleWaRepromptSubmit = async (e) => {
    e.preventDefault();
    const clean = cleanPhoneNumber((waRepromptPhone || '').trim());
    if (!clean || clean.length < 8) return;
    setWaRepromptSubmitting(true);
    try {
      await fetch('/api/leads/optin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean, language: lang }),
      }).catch(() => {});
      localStorage.setItem('wa_opted_in', 'true');
      setWaRepromptDone(true);
      setTimeout(() => setShowWaReprompt(false), 2500);
    } finally {
      setWaRepromptSubmitting(false);
    }
  };

  const dismissWaReprompt = () => {
    setShowWaReprompt(false);
    let s = {};
    try { s = JSON.parse(localStorage.getItem('wa_optin_prompt') || '{}'); } catch {}
    localStorage.setItem('wa_optin_prompt', JSON.stringify({ lastShown: Date.now(), dismisses: (s.dismisses || 0) + 1 }));
  };

  // Load Site Settings for Banner
  useEffect(() => {
    async function loadSettings() {
      if (!isSupabaseConfigured || !supabase) return;
      try {
        // Both rows live in the same table, so one round trip fetches both.
        // Read separately they were awaited back to back, and the second wait
        // (hidden products) held up the banner for no reason.
        const { data: settingsRows } = await supabase
          .from('site_settings')
          .select('id, value')
          .in('id', ['landing_page', 'hidden_products']);

        const rows = Array.isArray(settingsRows) ? settingsRows : [];
        setLandingSettings(mergeLandingPageSettings(rows.find((row) => row.id === 'landing_page')?.value));

        // Products the admin hid from the catalog (hidden, not deleted).
        const names = rows.find((row) => row.id === 'hidden_products')?.value?.names;
        if (Array.isArray(names)) setHiddenProducts(names);
      } catch (err) {
        console.error('Error loading site settings:', err);
      }
    }
    loadSettings();
  }, []);

  const closeSearch = useCallback(() => {
    setSearchFocused(false);
    document.getElementById('searchInput')?.blur();
  }, []);

  // Close search on outside tap/click, Escape, or scroll (mobile-friendly)
  useEffect(() => {
    if (!searchFocused) return;

    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        closeSearch();
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') closeSearch();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [searchFocused, closeSearch]);

  // Handle 'product' URL parameter linking
  useEffect(() => {
    if (products.length > 0 && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const productParam = urlParams.get('product');
      if (productParam) {
        const decodedParam = decodeURIComponent(productParam);
        const matchingProduct = products.find(p =>
          !hiddenProducts.includes(p.product) &&
          (p.product.toLowerCase() === decodedParam.toLowerCase() ||
          p.id === decodedParam)
        );
        if (matchingProduct) {
          setSelectedProduct(matchingProduct);
          // Optional: clear the url param so refreshing doesn't keep opening it if they closed it
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search.replace(/&?product=[^&]+/, ''));
        }
      }
    }
  }, [products]);

  // Category bar: show/enable horizontal scroll arrows on desktop based on scroll position
  const updateCatArrows = useCallback(() => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCatArrows({
      left: scrollLeft > 4,
      right: scrollLeft + clientWidth < scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    const el = categoryScrollRef.current;
    if (!el) return;
    updateCatArrows();
    el.addEventListener('scroll', updateCatArrows, { passive: true });
    window.addEventListener('resize', updateCatArrows);
    return () => {
      el.removeEventListener('scroll', updateCatArrows);
      window.removeEventListener('resize', updateCatArrows);
    };
  }, [updateCatArrows, products, activeCategory]);

  const scrollCategories = (dir) => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const start = el.scrollLeft;
    const dist = dir * 260;
    const duration = 260;
    let startTime = null;
    const step = (ts) => {
      if (startTime === null) startTime = ts;
      const p = Math.min((ts - startTime) / duration, 1);
      const ease = 0.5 - Math.cos(p * Math.PI) / 2; // easeInOutSine
      el.scrollLeft = start + dist * ease;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  // "You might also like" carousel: same arrow behaviour as the category bar.
  const updateSugArrows = useCallback(() => {
    const el = suggestionsScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setSugArrows({
      left: scrollLeft > 4,
      right: scrollLeft + clientWidth < scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    const el = suggestionsScrollRef.current;
    if (!el) return;
    updateSugArrows();
    el.addEventListener('scroll', updateSugArrows, { passive: true });
    window.addEventListener('resize', updateSugArrows);
    return () => {
      el.removeEventListener('scroll', updateSugArrows);
      window.removeEventListener('resize', updateSugArrows);
    };
  }, [updateSugArrows, cart, products]);

  const scrollSuggestions = (dir) => {
    const el = suggestionsScrollRef.current;
    if (!el) return;
    const start = el.scrollLeft;
    const dist = dir * 200;
    const duration = 260;
    let startTime = null;
    const step = (ts) => {
      if (startTime === null) startTime = ts;
      const p = Math.min((ts - startTime) / duration, 1);
      const ease = 0.5 - Math.cos(p * Math.PI) / 2; // easeInOutSine
      el.scrollLeft = start + dist * ease;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    setContactFormError('');
    if (!contactFormName.trim() || !contactFormEmail.trim() || !contactFormMessage.trim()) {
      setContactFormError(lang === 'en' ? 'Please fill in all required fields.' : 'Por favor completa todos los campos requeridos.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactFormEmail.trim())) {
      setContactFormError(lang === 'en' ? 'Please enter a valid email address.' : 'Por favor ingresa un correo electrónico válido.');
      return;
    }

    setContactFormLoading(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: contactFormName.trim(), 
          email: contactFormEmail.trim(), 
          subject: contactFormSubject.trim() || null, 
          message: contactFormMessage.trim() 
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setContactFormSuccess(true);
        setContactFormName(''); setContactFormEmail(''); setContactFormSubject(''); setContactFormMessage('');
      } else {
        setContactFormError(data.error || (lang === 'en' ? 'Failed to send message.' : 'Error al enviar mensaje.'));
      }
    } catch(err) {
      setContactFormError(lang === 'en' ? 'Connection error.' : 'Error de conexión.');
    } finally {
      setContactFormLoading(false);
    }
  };

  const handleGateSubmit = async (e) => {
    e.preventDefault();
    setGateError('');
    
    if (!gateInput || gateInput.length < 5) {
      setGateError(lang === 'en' ? 'Please enter a valid phone number or email.' : 'Ingrese un número o correo válido.');
      return;
    }

    setGateSubmitting(true);
    
    try {
      const isEmail = gateInput.includes('@');
      
      if (isSupabaseConfigured) {
        const utmSource = localStorage.getItem('lead_utm_source') || null;
        const utmMedium = localStorage.getItem('lead_utm_medium') || null;
        const utmCampaign = localStorage.getItem('lead_utm_campaign') || null;
        const referrer = localStorage.getItem('lead_referrer') || null;

        let ip = customerMetadata?.ip_address || null;
        let city = customerMetadata?.location_data?.city || null;
        let region = customerMetadata?.location_data?.region || null;
        let country = customerMetadata?.location_data?.country || null;

        // Fallback: If metadata is not loaded yet (e.g. quick form submission or adblocker delay), fetch it on-the-fly
        if (!ip) {
          try {
            // Attempt 1: ipapi.co
            let res = await fetch('https://ipapi.co/json/').catch(() => null);
            if (res && res.ok) {
              const data = await res.json();
              ip = data.ip || null;
              city = data.city || null;
              region = data.region || null;
              country = data.country_name || null;
            }
            
            // Attempt 2: db-ip.com as backup (HTTPS & Free)
            if (!ip) {
              res = await fetch('https://api.db-ip.com/v2/free/self').catch(() => null);
              if (res && res.ok) {
                const data = await res.json();
                ip = data.ipAddress || null;
                city = data.city || null;
                region = data.stateProv || null;
                country = data.countryName || null;
              }
            }

            // Attempt 3: ipify.org (raw IP backup)
            if (!ip) {
              res = await fetch('https://api.ipify.org?format=json').catch(() => null);
              if (res && res.ok) {
                const data = await res.json();
                ip = data.ip || null;
              }
            }
          } catch (e) {
            console.warn("Failed to fetch IP fallback on submit:", e);
          }
        }

        // Format WhatsApp numbers if applicable
        const cleanContact = isEmail ? gateInput.trim() : cleanPhoneNumber(gateInput.trim());

        await fetch('/api/leads/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_method: isEmail ? 'email' : 'whatsapp',
            contact_value: cleanContact,
            whatsapp_consent: gateConsent,
            language: lang,
            ip_address: ip,
            city: city,
            region: region,
            country: country,
            utm_source: utmSource,
            utm_medium: utmMedium,
            utm_campaign: utmCampaign,
            referrer: referrer
          })
        }).catch(err => console.warn('Lead capture fetch error:', err));
      }
      
      // Grant access regardless of DB success to not block users if offline
      const finalContact = isEmail ? gateInput.trim() : cleanPhoneNumber(gateInput.trim());
      localStorage.setItem('catalog_access_granted', 'true');
      localStorage.setItem('catalog_lead_contact', finalContact);
      if (gateConsent) localStorage.setItem('wa_opted_in', 'true'); // never re-prompt opted-in users
      setGateAccessGranted(true);
    } catch (err) {
      console.error('Error saving lead:', err);
      const fallbackContact = gateInput.includes('@') ? gateInput.trim() : cleanPhoneNumber(gateInput.trim());
      localStorage.setItem('catalog_access_granted', 'true');
      localStorage.setItem('catalog_lead_contact', fallbackContact);
      setGateAccessGranted(true);
    } finally {
      setGateSubmitting(false);
    }
  };

  // Local storage & URL params setup on mount
  useEffect(() => {
    // Capture Referral and UTM Campaign parameters
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const utmSource = urlParams.get('utm_source');
      const utmMedium = urlParams.get('utm_medium');
      const utmCampaign = urlParams.get('utm_campaign');
      const referralParam = urlParams.get('referral') || urlParams.get('affiliate') || urlParams.get('ref');
      const ref = document.referrer;

      if (utmSource) localStorage.setItem('lead_utm_source', utmSource);
      if (utmMedium) localStorage.setItem('lead_utm_medium', utmMedium);
      if (utmCampaign) localStorage.setItem('lead_utm_campaign', utmCampaign);
      if (ref && !ref.includes(window.location.hostname)) {
        localStorage.setItem('lead_referrer', ref);
      }
      if (referralParam) localStorage.setItem('lead_referrer', `affiliate:${referralParam}`);

      // Record the landing so QR codes and referral links have a scan count to
      // sit alongside the orders they produce. Fire-and-forget: analytics must
      // never delay or break the catalog. Server-side de-duplication means a
      // reload cannot inflate the number.
      const scanAgent = urlParams.get('sales_agent');
      const scanPromo = urlParams.get('promo_code') || urlParams.get('promo');
      if (scanAgent || scanPromo || referralParam) {
        const seenKey = 'referral_scan_logged';
        const alreadyLogged = localStorage.getItem(seenKey);
        fetch('/api/referral-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            salesAgent: scanAgent,
            promoCode: scanPromo,
            referral: referralParam,
            utmSource, utmMedium, utmCampaign,
            sessionId: localStorage.getItem('cart_session_id'),
            isFirstVisit: !alreadyLogged,
          }),
        }).then(() => localStorage.setItem(seenKey, '1')).catch(() => {});
      }
    }

    // URL overrides
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get('lang');
    const currencyParam = urlParams.get('currency');

    // Deep links from the site header search box and the category links in the
    // nav, footer and landing page.
    const deepLink = readCatalogParams(window.location.search);
    if (deepLink.search) setSearchQuery(deepLink.search);
    if (deepLink.category) setPendingCategory(deepLink.category);

    const hasUserSelectedLang = localStorage.getItem(USER_SELECTED_LANG_KEY) === 'true';
    let initialLang = hasUserSelectedLang ? localStorage.getItem('lang') || 'es' : 'es';
    let initialCurrency = 'CRC';

    if (langParam === 'en') {
      initialLang = 'en';
      initialCurrency = 'USD';
    } else if (langParam === 'es') {
      initialLang = 'es';
      initialCurrency = 'CRC';
    }

    if (currencyParam?.toUpperCase() === 'USD') initialCurrency = 'USD';
    if (currencyParam?.toUpperCase() === 'CRC') initialCurrency = 'CRC';

    setLang(initialLang);
    setCurrency(initialCurrency);
    if (!langParam) {
      localStorage.setItem('lang', initialLang);
    }

    // Theme loaded from localStorage
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Viewmode loaded from localStorage
    const savedView = localStorage.getItem('viewMode') || 'list';
    setViewMode(savedView === 'compact' ? 'list' : savedView);

    // Cart loaded from localStorage
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
      // Drop BAC sizes that are no longer sold. A stale cart may still carry
      // the legacy 2ml listing, which must not reach checkout.
      try {
        const parsed = JSON.parse(savedCart);
        setCart(Array.isArray(parsed)
          ? parsed.filter((item) => !isBacWater(item?.product) || isSellableBacWater(item.product))
          : parsed);
      } catch(e) {}
    }

    // Session ID loaded from localStorage
    let sid = localStorage.getItem('cart_session_id');
    if (!sid) {
      sid = 'session_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('cart_session_id', sid);
    }
    setSessionId(sid);

    // Load customer checkout details from localStorage if they filled them out previously
    const savedName = localStorage.getItem('checkout_customer_name') || '';
    const savedPhone = localStorage.getItem('checkout_customer_phone') || '';
    const savedEmail = localStorage.getItem('checkout_customer_email') || '';
    const savedAddress = localStorage.getItem('checkout_shipping_address') || '';
    const leadContact = localStorage.getItem('catalog_lead_contact') || '';
    const savedIdType = localStorage.getItem('checkout_customer_id_type') || '1';
    const savedIdNumber = localStorage.getItem('checkout_customer_id_number') || '';

    // Load structured address fields
    const savedProvince = localStorage.getItem('checkout_shipping_province') || '';
    const savedCanton = localStorage.getItem('checkout_shipping_canton') || '';
    const savedDistrict = localStorage.getItem('checkout_shipping_district') || '';
    const savedDetailed = localStorage.getItem('checkout_shipping_detailed') || '';
    const savedZip = localStorage.getItem('checkout_shipping_zip') || '';

    if (savedName) setCustomerName(savedName);
    if (savedIdType) setCustomerIdType(savedIdType);
    if (savedIdNumber) setCustomerIdNumber(savedIdNumber);
    if (savedAddress) setShippingAddress(savedAddress);

    // Fallback: If savedAddress exists but savedProvince is empty, treat the whole savedAddress as detailed address
    if (savedProvince) {
      setShippingProvince(savedProvince);
      setShippingCanton(savedCanton);
      setShippingDistrict(savedDistrict);
      setShippingDetailedAddress(savedDetailed);
      setShippingZip(savedZip);
    } else if (savedAddress) {
      setShippingDetailedAddress(savedAddress);
    }

    // Pre-fill phone and email dynamically from either saved checkout info or gate input
    if (savedPhone) {
      applyStoredPhone(savedPhone);
    } else if (leadContact && !leadContact.includes('@')) {
      applyStoredPhone(leadContact);
    }

    if (savedEmail) {
      setCustomerEmail(savedEmail);
    } else if (leadContact && leadContact.includes('@')) {
      setCustomerEmail(leadContact);
    }

    // Bypass gate if they already have access granted or have contact info or admin preview URL param
    const adminPreview = urlParams.get('admin_preview') === 'true';
    const gateBypassParam = urlParams.get('gate') || urlParams.get('catalog_gate') || urlParams.get('lead_gate');
    const skipLeadGate = GATE_BYPASS_VALUES.has(String(gateBypassParam || '').trim().toLowerCase());
    const hasAccess = localStorage.getItem('catalog_access_granted') === 'true';
    if (hasAccess || savedPhone || savedEmail || leadContact || savedName || adminPreview || skipLeadGate) {
      setGateAccessGranted(true);
      setGateVisible(false);
      localStorage.setItem('catalog_access_granted', 'true');
    }

    // Parse sales_agent query parameter and save to localStorage
    const agentParam = urlParams.get('sales_agent');
    if (agentParam) {
      localStorage.setItem('checkout_sales_agent', agentParam);
    }

    // Parse recover_session query parameter and load abandoned cart details
    const recoverSession = urlParams.get('recover_session');
    if (recoverSession) {
      const loadRecoveredCart = async () => {
        try {
          // Reads the cart through the server rather than the anon key, so the
          // ledger of every shopper's contact details is no longer browser-readable.
          const res = await fetch('/api/cart/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'recover', sessionId: recoverSession }),
          });
          const { cart: data } = await res.json().catch(() => ({}));

          if (res.ok && data) {
            if (data.cart_data && Array.isArray(data.cart_data) && data.cart_data.length > 0) {
              setCart(data.cart_data);
              localStorage.setItem('cart', JSON.stringify(data.cart_data));
            }
            
            if (data.customer_name) {
              setCustomerName(data.customer_name);
              localStorage.setItem('checkout_customer_name', data.customer_name);
            }
            if (data.customer_phone) {
              applyStoredPhone(data.customer_phone);
              localStorage.setItem('checkout_customer_phone', data.customer_phone);
              localStorage.setItem('catalog_lead_contact', data.customer_phone);
            }
            if (data.customer_email) {
              setCustomerEmail(data.customer_email);
              localStorage.setItem('checkout_customer_email', data.customer_email);
              localStorage.setItem('catalog_lead_contact', data.customer_email);
            }
            
            // Grant catalog access automatically
            setGateAccessGranted(true);
            localStorage.setItem('catalog_access_granted', 'true');
            
            // Save the session_id so future changes update this same record
            setSessionId(recoverSession);
            localStorage.setItem('cart_session_id', recoverSession);
            
            console.log("Successfully recovered cart session:", recoverSession);
          }
        } catch (err) {
          console.error("Failed to recover cart:", err);
        }
      };
      loadRecoveredCart();
    }

    // Clean up URL parameters if present to keep the address bar clean
    if (agentParam || recoverSession || skipLeadGate) {
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          const cleanUrl = window.location.pathname + window.location.search
            .replace(/&?recover_session=[^&]+/, '')
            .replace(/&?sales_agent=[^&]+/, '')
            .replace(/&?gate=[^&]+/, '')
            .replace(/&?catalog_gate=[^&]+/, '')
            .replace(/&?lead_gate=[^&]+/, '')
            .replace(/\?$/, '')
            .replace(/\?&/, '?');
          window.history.replaceState({}, document.title, cleanUrl);
        }
      }, 1200);
    }


    // Check for card payment redirect params
    const paymentParam = urlParams.get('payment');
    if (paymentParam === 'success' || urlParams.get('code') === '1') {
      if (sid) localStorage.setItem('checkout_completed_session_id', sid);
      setCart([]); // Clear cart on success
      localStorage.removeItem('cart');
      // Clean up URL and redirect to thank-you conversion page
      window.history.replaceState({}, document.title, window.location.pathname);
      window.location.href = `/thank-you?lang=${initialLang}`;
    } else if (paymentParam === 'cancel') {
      alert(initialLang === 'en' ? 'Payment was cancelled.' : 'El pago fue cancelado.');
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }


    // Background Data Collection
    const fetchMetadata = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/').catch(() => null);
        if (!res || !res.ok) return; // Silently exit if blocked by adblocker
        
        const data = await res.json();
        
        let device = 'Unknown';
        if (typeof window !== 'undefined') {
          device = window.navigator.userAgent;
        }

        setCustomerMetadata({
          ip_address: data.ip || 'Unknown',
          location_data: {
            city: data.city || 'Unknown',
            region: data.region || 'Unknown',
            country: data.country_name || 'Unknown'
          },
          device_info: device
        });
        localStorage.setItem('pcr_analytics_location', JSON.stringify({
          city: data.city || 'Unknown',
          region: data.region || 'Unknown',
          country: data.country_name || 'Unknown',
        }));
      } catch (err) {
        // Silently ignore to prevent Next.js error overlay from popping up due to browser extensions
      }
    };
    fetchMetadata();

    // Load Data
    loadCatalogData();

    // Fetch live exchange rate
    fetchLiveExchangeRate();
  }, []);

  // Synchronize flat shippingAddress string with structured input fields
  useEffect(() => {
    const parts = [];
    if (shippingDetailedAddress && shippingDetailedAddress.trim()) {
      parts.push(shippingDetailedAddress.trim());
    }
    
    const locationLine = [shippingDistrict, shippingCanton, shippingProvince]
      .map(s => (s || '').trim())
      .filter(Boolean)
      .join(', ');
    if (locationLine) {
      parts.push(locationLine);
    }
    
    if (shippingZip && shippingZip.trim()) {
      parts.push(shippingZip.trim());
    }
    
    setShippingAddress(parts.join('\n'));
  }, [shippingProvince, shippingCanton, shippingDistrict, shippingDetailedAddress, shippingZip]);

  // Persist checkout details to localStorage as they type, to auto-prefill on future visits
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (customerName) localStorage.setItem('checkout_customer_name', customerName);
      if (customerPhone) {
        localStorage.setItem('checkout_customer_phone', customerPhone);
        localStorage.setItem('catalog_access_granted', 'true');
      }
      if (customerEmail) {
        localStorage.setItem('checkout_customer_email', customerEmail);
        localStorage.setItem('catalog_access_granted', 'true');
      }
      if (shippingAddress) localStorage.setItem('checkout_shipping_address', shippingAddress);
      
      // Save structured address fields
      if (shippingProvince) localStorage.setItem('checkout_shipping_province', shippingProvince);
      if (shippingCanton) localStorage.setItem('checkout_shipping_canton', shippingCanton);
      if (shippingDistrict) localStorage.setItem('checkout_shipping_district', shippingDistrict);
      if (shippingDetailedAddress) localStorage.setItem('checkout_shipping_detailed', shippingDetailedAddress);
      if (shippingZip) localStorage.setItem('checkout_shipping_zip', shippingZip);

      // Save ID details
      if (customerIdType) localStorage.setItem('checkout_customer_id_type', customerIdType);
      if (customerIdNumber) localStorage.setItem('checkout_customer_id_number', customerIdNumber);
    }
  }, [customerName, customerPhone, customerEmail, shippingAddress, shippingProvince, shippingCanton, shippingDistrict, shippingDetailedAddress, shippingZip, customerIdType, customerIdNumber]);

  // Signed-in customers: fill the checkout from their saved profile and default
  // address. Only blank fields are touched, so whatever the customer has already
  // typed on this visit — or a different address they entered deliberately —
  // always wins over the stored one.
  useEffect(() => {
    if (!customerSession?.user) return;

    let active = true;

    const prefill = async () => {
      const client = getCustomerSupabase();
      if (!client) return;

      const [{ data: profile }, { data: address }] = await Promise.all([
        client.from('customer_profiles').select('display_name, phone').eq('user_id', customerSession.user.id).maybeSingle(),
        client.from('customer_addresses').select('*').eq('is_default', true).maybeSingle(),
      ]);

      if (!active) return;

      setCustomerEmail((current) => current || customerSession.user.email || '');
      if (profile?.display_name) setCustomerName((current) => current || profile.display_name);
      if (profile?.phone) setCustomerPhone((current) => current || profile.phone);

      if (address) {
        if (address.recipient_name) setCustomerName((current) => current || address.recipient_name);
        if (address.phone) setCustomerPhone((current) => current || address.phone);
        if (address.province) {
          setShippingProvince((current) => {
            if (current) return current;
            // Canton and district only make sense under the province they were
            // saved with, so they travel together or not at all.
            setShippingCanton(address.canton || '');
            setShippingDistrict(address.district || '');
            return address.province;
          });
        }
        if (address.detailed_address) setShippingDetailedAddress((current) => current || address.detailed_address);
        if (address.postal_code) setShippingZip((current) => current || address.postal_code);
      }
    };

    prefill().catch(() => {
      // A prefill that fails just leaves the form blank — never block checkout.
    });

    return () => { active = false; };
  }, [customerSession]);

  // "Order again" from the account area. The account pages stash only product
  // names and quantities; every price, discount, shipping fee and BAC-water
  // entitlement is computed here from the live catalog, so a reorder is charged
  // exactly what a hand-built cart would be.
  useEffect(() => {
    if (products.length === 0) return;

    const pending = takeReorder();
    if (!pending) return;

    const { lines, unavailable, missing } = buildReorderLines(pending.items, products);
    if (lines.length > 0) {
      setCart((current) => {
        const merged = mergeReorderIntoCart(current, lines);
        try {
          localStorage.setItem('cart', JSON.stringify(merged));
        } catch {
          // Storage full or blocked — the in-memory cart still holds.
        }
        return merged;
      });
      setIsCartOpen(true);
    }

    const notice = reorderNoticeMessage({ unavailable, missing }, lang);
    if (notice) setReorderNotice(notice);
    else if (lines.length === 0) {
      setReorderNotice(lang === 'en'
        ? 'None of those items are available right now.'
        : 'Ninguno de esos productos está disponible en este momento.');
    }
  }, [products, lang]);

  // Visitor sessions and heartbeats now go through the server-side first-party
  // tracker mounted in app/layout. That route captures the trustworthy request
  // IP and lets visitor_sessions deny anonymous browser writes and reads.

  // Telemetry: Storefront Mobile Click tracker for Heatmaps
  useEffect(() => {
    const handleDocumentClick = (e) => {
      // Check if user is in mobile viewport view
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      if (!isMobile) return;

      // Identify click target recursively
      let currentEl = e.target;
      let targetName = '';
      
      // Traverse up to find meaningful target tags/elements
      while (currentEl && currentEl !== document.body) {
        if (currentEl.getAttribute && currentEl.getAttribute('data-heatmap-name')) {
          targetName = currentEl.getAttribute('data-heatmap-name');
          break;
        }
        if (currentEl.tagName === 'BUTTON') {
          targetName = currentEl.innerText?.trim().substring(0, 30) || 'Button';
          break;
        }
        if (currentEl.tagName === 'A') {
          targetName = `Link: ${currentEl.innerText?.trim().substring(0, 30) || 'Anchor'}`;
          break;
        }
        if (currentEl.id) {
          targetName = `#${currentEl.id}`;
          break;
        }
        currentEl = currentEl.parentElement;
      }

      if (!targetName && e.target) {
        targetName = e.target.tagName?.toLowerCase() || 'div';
      }

      // Convert coordinates to relative percentages
      const xPct = Math.round((e.clientX / window.innerWidth) * 100);
      const yPct = Math.round((e.clientY / window.innerHeight) * 100);

      // Post payload to analytics route
      fetch('/api/analytics/clicks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          element_name: targetName || 'Generic Area',
          x_pct: xPct,
          y_pct: yPct,
          path: window.location.pathname,
          is_mobile: true
        })
      }).catch(() => {});
    };

    document.addEventListener('click', handleDocumentClick, { passive: true });
    return () => document.removeEventListener('click', handleDocumentClick);
  }, []);

  // Telemetry product view logging has been moved to handleProductClick


  // Live currency exchange rate fetch
  const fetchLiveExchangeRate = async () => {
    try {
      const res = await fetch('/api/exchange-rate');
      const data = await res.json();
      // res.ok matters here. The route answers a failure with HTTP 500 and a
      // hardcoded rate in the body, and this used to read the body without
      // looking at the status — so a broken feed quietly put this page on a
      // number the server was not using, and every colón order from it was
      // refused for a total that could not be made to match.
      if (res.ok && isPlausibleRate(data.rate)) {
        const rate = Number(data.rate);
        const now = data.updatedAt ? Date.parse(data.updatedAt) : Date.now();
        setExchangeRate(rate);
        setExchangeRateUpdatedAt(now);
        localStorage.setItem('exchangeRate_USDCRC', rate.toString());
        localStorage.setItem('exchangeRate_USDCRC_time', now.toString());
        return;
      }
      // Answered, but with nothing worth pricing in. Same treatment as no
      // answer at all — the branch that did nothing here left the page on the
      // constant in this file, which is the one number the server is certain
      // not to be using.
      console.error('Live exchange rate unusable, falling back to cache:', res.status, data?.rate);
      useCachedExchangeRate();
    } catch (err) {
      console.error('Live exchange rate fetch failed, using fallback:', err);
      useCachedExchangeRate();
    }
  };

  /**
   * Last rate this browser saw, when the API cannot give us one now.
   *
   * Better than the compiled-in constant and still not authoritative: the
   * server may well be on a different number. That disagreement no longer
   * strands the customer, because a repricing refusal now carries the server's
   * own rate and the checkout adopts it. See saveOrderToDatabase.
   */
  const useCachedExchangeRate = () => {
    try {
      const cached = localStorage.getItem('exchangeRate_USDCRC');
      const cachedTime = localStorage.getItem('exchangeRate_USDCRC_time');
      if (cached && cachedTime && isPlausibleRate(cached)) {
        setExchangeRate(parseFloat(cached));
        setExchangeRateUpdatedAt(parseInt(cachedTime, 10));
        return;
      }
    } catch {
      // Storage blocked (private browsing).
    }
    setExchangeRateUpdatedAt(Date.now());
  };

  // Supabase Realtime subscription — live sync when admin changes prices/stock/products
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const channel = supabase
      .channel('catalog-products-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        (payload) => {
          console.log('Catalog realtime update:', payload.eventType);
          loadCatalogData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Sync cart to localStorage and, via /api/cart/track, to abandoned_carts
  // (only while the cart has items and the shopper is contactable)
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));

    if (sessionId && !orderSubmitting) {
      const timeoutId = setTimeout(async () => {
        // Cart tracking now runs through the service-role API. The browser no
        // longer holds write access to abandoned_carts, so it cannot read or
        // wipe other shoppers' rows.
        const trackCart = (payload) => fetch('/api/cart/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, ...payload }),
        });

        try {
          if (localStorage.getItem('checkout_completed_session_id') === sessionId) {
            await trackCart({ action: 'clear' });
            return;
          }

          if (cart.length === 0) {
            localStorage.removeItem('had_items');
            await trackCart({ action: 'clear' });
            return;
          }

          localStorage.setItem('had_items', 'true');
          const leadContact = localStorage.getItem('catalog_lead_contact');
          const isEmail = leadContact && leadContact.includes('@');
          const resolvedEmail = customerEmail || (isEmail ? leadContact : null);
          const resolvedPhone = customerPhone || (leadContact && !isEmail ? leadContact : null);

          // Only track abandoned carts when we can identify/contact the shopper
          if (!customerName && !resolvedPhone && !resolvedEmail) {
            return;
          }

          await trackCart({
            action: 'save',
            cart,
            customerName: customerName || null,
            customerPhone: resolvedPhone || null,
            customerEmail: resolvedEmail || null,
            // The server overrides ip_address and device_info from the request
            // headers; this is sent for the geolocation lookup it cannot repeat.
            metadata: customerMetadata || null,
            lang: lang || 'es',
            currency: currency || 'CRC',
          });
        } catch (err) {
          console.error('Failed to sync abandoned cart:', err);
        }
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [cart, customerName, customerPhone, customerEmail, sessionId, customerMetadata, lang, currency, orderSubmitting]);

  // Load Catalog Data (Supabase or CSV fallback)
  const loadCatalogData = async () => {
    setLoading(true);
    let loadedProducts = [];
    let dbConnected = false;

    // 1. Try Supabase
    if (isSupabaseConfigured && supabase) {
      try {
        // Products, reviews and the badge promos do not depend on each other, so
        // they go out together. Awaited one after another they cost the sum of
        // all three (~3.2s measured) and the shopper stared at "Syncing
        // catalog..." for the whole of it; in parallel the wait is just the
        // slowest single query.
        //
        // Reviews and sale badges are decoration; products are the page. A
        // rejection inside Promise.all would skip the mapping below, leaving
        // loadedProducts empty and dropping the shopper onto the CSV fallback
        // catalogue over a failed reviews call. So the two optional queries
        // resolve to empty instead of rejecting, and only products can trigger
        // the fallback — exactly as when they were awaited one at a time.
        const optional = (query) => Promise.resolve(query).then((res) => res, () => ({ data: null }));

        const [
          { data, error },
          { data: revData },
          { data: badgePromos },
        ] = await Promise.all([
          supabase
            .from('products')
            .select('*')
            .order('priority', { ascending: true }),
          optional(supabase
            .from('product_reviews')
            .select('*')
            .eq('status', 'Approved')),
          // Promo codes opted in to showing a sale ribbon. Hidden codes are
          // excluded in the query as well as in isBadgeEligible — a private code
          // must never reach the public catalog, so it is filtered twice.
          optional(supabase
            .from('promo_codes')
            .select('code, discount_pct, is_active, hidden, show_sale_badge, badge_style, badge_text, badge_text_es, target_product, valid_from, valid_until, usage_limit, usage_count')
            .eq('show_sale_badge', true)
            .eq('is_active', true)
            .eq('hidden', false)),
        ]);

        if (error) {
          console.error("❌ SUPABASE CATALOG PRODUCTS ERROR:", error);
          setIsDbBacked(false);
        } else {
          console.log("✅ SUPABASE CATALOG PRODUCTS LOADED:", data?.length, "rows");
        }

        if (!error && data && data.length > 0) {
          const now = new Date();
          loadedProducts = data.map(item => {
            const isSaleActive = item.discount && 
              (!item.sale_start_time || new Date(item.sale_start_time) <= now) &&
              (!item.sale_end_time || new Date(item.sale_end_time) >= now);

            return {
              product: item.product,
              category: item.category,
              priceUsd: item.price_usd,
              priceCrc: item.price_crc,
              originalPriceUsd: isSaleActive ? (String(item.original_price_usd || '').trim() || null) : null,
              originalPriceCrc: isSaleActive ? (String(item.original_price_crc || '').trim() || null) : null,
              discount: isSaleActive ? item.discount : null,
              status: item.inventory_count === 0 ? 'Out of Stock' : item.status,
              inventoryCount: item.inventory_count !== undefined ? item.inventory_count : null,
              lowStockThreshold: item.low_stock_threshold !== undefined ? item.low_stock_threshold : 5,
              coa: item.coa,
              imageUrl: item.image_url || getProductFallbackImage(item.product, item.category),
              descriptionEn: item.description_en || '',
              descriptionEs: item.description_es || '',
              emoji: item.emoji || getEmojiForCategory(item.category)
            };
          });
          dbConnected = true;
          setIsDbBacked(true);
        }
        
        if (revData) {
          setReviews(revData);
        }
        setPromoBadges(badgePromos || []);
      } catch (err) {
        console.error("Supabase load error, falling back to local spreadsheet CSV...", err);
        setIsDbBacked(false);
      }
    }

    // 2. CSV Fallback
    if (loadedProducts.length === 0) {
      try {
        const response = await fetch('/master_sheet.csv');
        const csvText = await response.text();
        
        Papa.parse(csvText, {
          header: false,
          skipEmptyLines: true,
          complete: (results) => {
            const lines = results.data;
            // find product header index
            const headerIndex = lines.findIndex(l => l.some(cell => cell && cell.toLowerCase().includes('product')));
            
            if (headerIndex !== -1) {
              const headers = lines[headerIndex].map(h => h.toLowerCase().trim());
              const dataLines = lines.slice(headerIndex + 1);

              const parsed = dataLines
                .filter(line => line[0])
                .map((line, idx) => {
                  const p = {};
                  headers.forEach((h, i) => {
                    const key = h.replace(/\s+/g, '');
                    if (key.includes('product') || key.includes('producto')) p.product = line[i];
                    else if (key.includes('category') || key.includes('categoría')) p.category = line[i];
                    else if (key.includes('price') || key.includes('precio')) p.priceUsd = line[i];
                    else if (key.includes('status') || key.includes('estado')) p.status = line[i];
                    else if (key.includes('discount(en)') || key.includes('descuento(en)')) p.bulkDiscountEn = line[i];
                    else if (key.includes('discount(es)') || key.includes('descuento(es)')) p.bulkDiscountEs = line[i];
                    else if (key.includes('coa')) p.coa = line[i];
                    else if (key.includes('image') || key.includes('imagen')) p.imageUrl = line[i];
                  });

                  // Parse numerical usd
                  const cleanUsdStr = p.priceUsd || '';
                  const usdNum = parseFloat(cleanUsdStr.replace(/[^0-9.]/g, '')) || 0;
                  const calculatedCrc = Math.round(usdNum * exchangeRate);

                  return {
                    product: p.product,
                    category: p.category,
                    priceUsd: cleanUsdStr,
                    priceCrc: calculatedCrc > 0 ? `₡${calculatedCrc.toLocaleString('en-US')}` : '',
                    originalPriceUsd: '',
                    originalPriceCrc: '',
                    discount: p.bulkDiscountEs || p.bulkDiscountEn || '',
                    status: p.status || 'In Stock',
                    coa: p.coa || '',
                    imageUrl: p.imageUrl || getProductFallbackImage(p.product, p.category),
                    descriptionEn: '',
                    descriptionEs: '',
                    emoji: getEmojiForCategory(p.category || '')
                  };
                });

              setProducts(parsed);
            }
          }
        });
      } catch (err) {
        console.error("Local CSV fallback error:", err);
      }
    } else {
      setProducts(loadedProducts);
    }

    setLoading(false);
  };

  // Resolve a ?category= deep link once products are in, matching
  // case-insensitively so links survive casing drift. An unrecognised category
  // falls back to the full catalog rather than an empty page.
  useEffect(() => {
    if (!pendingCategory || !products.length) return;
    setActiveCategory(resolveCategoryParam(products, pendingCategory));
    setPendingCategory(null);
  }, [pendingCategory, products]);

  // Science/peptide themed icon for each category (no pills!)
  const getCategoryIcon = (cat, size = 28) => {
    const c = (cat || '').toLowerCase();
    const props = { size, className: 'category-icon', strokeWidth: 1.8 };
    if (c.includes('weight') || c.includes('peso') || c.includes('metaboli')) return <Atom {...props} />;
    if (c.includes('exercise') || c.includes('mimetic')) return <Zap {...props} />;
    if (c.includes('recovery') || c.includes('healing') || c.includes('recuper')) return <Dna {...props} />;
    if (c.includes('anti-inflam') || c.includes('antiinflam')) return <Shield {...props} />;
    if (c.includes('performance') || c.includes('hormon') || c.includes('rendimiento')) return <Syringe {...props} />;
    if (c.includes('aging') || c.includes('longevity') || c.includes('envejecimiento')) return <TestTubes {...props} />;
    if (c.includes('immune') || c.includes('inmune') || c.includes('antioxidant')) return <Microscope {...props} />;
    if (c.includes('cognitive') || c.includes('mood') || c.includes('cognitivo')) return <Brain {...props} />;
    if (c.includes('sleep') || c.includes('dormir') || c.includes('sueño')) return <Moon {...props} />;
    if (c.includes('sexual') || c.includes('tanning') || c.includes('bronceado')) return <Flame {...props} />;
    if (c.includes('skin') || c.includes('hair') || c.includes('piel') || c.includes('cabello')) return <Sparkles {...props} />;
    if (c.includes('supply') || c.includes('suministro') || c.includes('reconstitution')) return <FlaskConical {...props} />;
    return <FlaskConical {...props} />;
  };
  // Helper stock check
  const isInStock = (statusText) => {
    const s = (statusText || '').toLowerCase().trim();
    return s === 'in stock' || s === 'disponible';
  };

  const isComingSoon = (statusText) => {
    const s = (statusText || '').toLowerCase().trim();
    return s === 'coming soon' || s === 'próximamente';
  };

  const translateStatus = (statusText) => {
    const s = (statusText || '').toLowerCase().trim();
    if (s === 'in stock' || s === 'disponible') return STATUS_TRANSLATIONS[lang]['in stock'];
    if (s === 'out of stock' || s === 'agotado') return STATUS_TRANSLATIONS[lang]['out of stock'];
    if (s === 'coming soon' || s === 'próximamente') return STATUS_TRANSLATIONS[lang]['coming soon'];
    return statusText;
  };

  /**
   * The units-on-hand line the payment processor asked to see on every product.
   *
   * The count was always in the data and was only ever surfaced as an urgency
   * badge below the low-stock threshold, which meant 57 of 73 products showed
   * nothing at all. The processor wants the number present, not the warning.
   *
   * Returns null rather than a zero line when there is no count to show: a
   * product nobody has counted yet (11 of them) must not claim "0 available",
   * which reads as sold out, and an out-of-stock product already says so in its
   * own badge. Below the threshold the red urgency badge is still the one that
   * speaks, so this stays quiet and does not repeat the number beside it.
   */
  const stockUnitsLabel = (product) => {
    if (!product) return null;
    const count = product.inventoryCount;
    if (count === null || count === undefined || !Number.isFinite(Number(count))) return null;
    const units = Number(count);
    if (units <= 0) return null;
    if (units <= (product.lowStockThreshold || 5)) return null;
    return lang === 'en' ? `${units} in stock` : `${units} disponibles`;
  };

  const translateCategory = (catText) => {
    if (!catText) return '';
    
    // Auto-translation for custom categories using the slash format (e.g., "Hair Growth / Crecimiento del cabello")
    if (catText.includes('/')) {
      const parts = catText.split('/').map(p => p.trim());
      if (parts.length >= 2) {
        return lang === 'en' ? parts[0] : parts[1];
      }
    }

    if (lang === 'es' && CATEGORY_TRANSLATIONS[catText]) {
      return CATEGORY_TRANSLATIONS[catText];
    }
    return catText;
  };

  const getCategoryChipLabel = (catText) => {
    if (isWeightLossCategory(catText)) {
      return lang === 'en' ? 'Weight Loss' : 'Perder Peso';
    }
    return translateCategory(catText);
  };

  const parsePrice = (priceStr) => {
    if (!priceStr) return 0;
    const clean = priceStr.replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 0;
  };

  const getPriceAsNumber = (prod, cur, rate = exchangeRate) => {
    // BAC has size-specific fallback prices for giveaway-era product rows.
    if (isBacWater(prod.product)) {
      return bacUnitPrice(cur, rate, parsePrice(prod.priceUsd), prod.product);
    }
    if (cur === 'USD') {
      return parsePrice(prod.priceUsd);
    } else {
      return Math.round(parsePrice(prod.priceUsd) * rate);
    }
  };

  const getPriceLabel = (prod, cur, rate = exchangeRate) => (
    formatPriceVal(getPriceAsNumber(prod, cur, rate), cur)
  );

  const getOriginalPriceLabel = (prod, cur, rate = exchangeRate) => {
    const originalUsd = parsePrice(prod.originalPriceUsd);
    if (!originalUsd) return '';
    return cur === 'USD'
      ? formatPriceVal(originalUsd, 'USD')
      : formatPriceVal(Math.round(originalUsd * rate), 'CRC');
  };

  const renderRatingSummary = (productName) => {
    const prodReviews = reviews.filter(r => r.product_name === productName);
    if (prodReviews.length === 0) return null;
    const avg = prodReviews.reduce((sum, r) => sum + r.rating, 0) / prodReviews.length;
    return (
      <div className="product-rating-summary">
        <Star size={12} fill="#fbbf24" color="#fbbf24" />
        <span style={{ fontWeight: 600 }}>{avg.toFixed(1)}</span>
        <span>({prodReviews.length})</span>
      </div>
    );
  };

  const popularTerms = [
    { en: 'GLP-1', es: 'GLP-1' },
    { en: 'Tirzepatide', es: 'Tirzepatide' },
    { en: 'Semaglutide', es: 'Semaglutide' },
    { en: 'Weight Loss', es: 'Pérdida de Peso' },
    { en: 'Recovery', es: 'Recuperación' }
  ];

  /**
   * Whether a product may appear anywhere a customer can buy from.
   *
   * There are three separate lists — the grid, the search dropdown and the cart
   * suggestions — and each used to apply its own filters. Only the grid knew
   * which BAC sizes are sold, so legacy listings could stay hidden from the
   * shelf while still being offered in search and recommended inside the cart.
   */
  const isListableProduct = (p) => {
    if (!p?.product) return false;
    if (hiddenProducts.includes(p.product)) return false;
    if (isBacWater(p.product) && !isSellableBacWater(p.product)) return false;
    return true;
  };

  const getSearchSuggestions = () => {
    const query = searchQuery.trim();
    const visible = products.filter(isListableProduct);
    if (!query) {
      return visible.slice(0, 3);
    }
    // Ten, because that is the largest single product family (GLP-1 has
    // ten sizes, Tirzepatide seven). At five, searching a family name hid the
    // largest sizes and made them look unavailable. The dropdown caps its own
    // height and scrolls, so a longer list does not grow the panel.
    return rankCatalogSearchResults(visible, query, { limit: 10 });
  };

  const handlePopularTermClick = (term) => {
    setSearchQuery(term);
    setSearchFocused(true);
    document.getElementById('searchInput')?.focus();
  };

  // Active toggles
  const handleLangToggle = (selectedLang) => {
    setLang(selectedLang);
    setCurrency(selectedLang === 'en' ? 'USD' : 'CRC');
    localStorage.setItem('lang', selectedLang);
    localStorage.setItem(USER_SELECTED_LANG_KEY, 'true');
  };

  const handleThemeToggle = (selectedTheme) => {
    setTheme(selectedTheme);
    localStorage.setItem('theme', selectedTheme);
    document.documentElement.setAttribute('data-theme', selectedTheme);
  };

  const handleViewToggle = () => {
    const nextView = viewMode === 'list' ? 'grid' : 'list';
    setViewMode(nextView);
    localStorage.setItem('viewMode', nextView);
  };

  // Cart operations
  const addToCart = (productObj) => {
    // Last line of defence. Filtering the three product lists is what a customer
    // sees, but a stale tab, a recovered cart or a saved localStorage cart can
    // still carry a BAC size that is not for sale.
    if (isBacWater(productObj?.product) && !isSellableBacWater(productObj.product)) {
      console.warn('[catalog] Refused a BAC size that is not for sale:', productObj?.product);
      return;
    }

    const existing = cart.find(item => item.product === productObj.product);
    const newQty = existing ? existing.qty + 1 : 1;

    if (productObj.inventoryCount !== null && newQty > productObj.inventoryCount) {
      flagStockLimit(productObj.product, productObj.inventoryCount);
      return;
    }

    if (existing) {
      setCart(cart.map(item => 
        item.product === productObj.product 
          ? { ...item, qty: newQty }
          : item
      ));
    } else {
      setCart([...cart, { ...productObj, qty: 1 }]);
    }
    setSelectedProduct(null);
    setIsCartOpen(true);

    // Trigger cart bounce animation
    setCartAnimating(true);
    setTimeout(() => setCartAnimating(false), 800);
  };

  const handleProductClick = async (product) => {
    setSelectedProduct(product);
    
    // Silently track behavioral product view
    if (isSupabaseConfigured) {
      const contact = localStorage.getItem('catalog_lead_contact');
      try {
        // Fire and forget, storing both session (for telemetry) and contact (for Leads CRM)
        supabase.from('product_views').insert([{
          session_id: sessionId || null,
          contact_value: contact || null,
          product_id: product.id || product.product, // fallback to name if no id
          product_name: product.product
        }]).then(({ error, data }) => {
          if (error) {
            console.error('SUPABASE INSERT ERROR:', error);
          } else {
            console.log('SUPABASE INSERT SUCCESS:', data);
          }
        });
      } catch (e) {
        // ignore tracking errors
      }
    }
  };

  const handleShareProduct = (e, product) => {
    if (e) e.stopPropagation();
    const url = `${window.location.origin}/catalog?product=${encodeURIComponent(product.product)}`;
    if (navigator.share) {
      navigator.share({
        title: product.product,
        url: url
      }).catch((err) => {
        if (err.name !== 'AbortError') console.error('Share error:', err);
      });
    } else {
      navigator.clipboard.writeText(url);
      alert(lang === 'en' ? 'Link copied to clipboard!' : '¡Enlace copiado al portapapeles!');
    }
  };

  const closeProductModal = () => {
    setSelectedProduct(null);
  };

  const addToCartWithAnimation = (e, productData) => {
    e.stopPropagation(); // Prevent modal from opening
    addToCart(productData);
    setAddedProductId(productData.product);
    setTimeout(() => setAddedProductId(null), 600); // Reset animation state

    // 1. Calculate Coordinates for Flying Vial
    const button = e.currentTarget;
    let startRect = button.getBoundingClientRect(); // fallback to button pos
    
    const card = button.closest('.product-card') || button.closest('.suggested-product-row');
    if (card) {
      const img = card.querySelector('img');
      if (img) {
        startRect = img.getBoundingClientRect();
      }
    }

    const cartBtn = document.getElementById('floating-cart-btn') || document.querySelector('.nav-cart-btn');
    let endRect = { left: window.innerWidth - 60, top: window.innerHeight - 60, width: 50, height: 50 };
    if (cartBtn) {
      endRect = cartBtn.getBoundingClientRect();
    }

    const startX = startRect.left + startRect.width / 2;
    const startY = startRect.top + startRect.height / 2;
    const endX = endRect.left + endRect.width / 2;
    const endY = endRect.top + endRect.height / 2;

    const id = Date.now() + Math.random();
    setFlyingItems(prev => [...prev, {
      id,
      imageSrc: productData.imageUrl || '/catalog/peptides_2.png', // Fallback to default vial
      startX,
      startY,
      endX,
      endY
    }]);

    // Remove flying item after animation (800ms)
    setTimeout(() => {
      setFlyingItems(prev => prev.filter(item => item.id !== id));
    }, 800);

    // 2. Add Premium Toast Notification
    const toastId = Date.now() + Math.random();
    setToasts(prev => [...prev, { id: toastId, productName: productData.product }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toastId));
    }, 3000);
  };

  // Get product suggestions based on cart items (Amazon-style)
  const getSuggestions = () => {
    if (cart.length === 0 || products.length === 0) return [];
    const cartProductNames = new Set(cart.map(c => c.product));
    const cartCategories = new Set(cart.map(c => c.category).filter(Boolean));
    
    // Find in-stock products from same categories, not already in cart
    let suggestions = products.filter(p =>
      !cartProductNames.has(p.product) &&
      isListableProduct(p) &&
      isInStock(p.status) &&
      cartCategories.has(p.category)
    );

    // If not enough, add other in-stock products
    if (suggestions.length < 3) {
      const more = products.filter(p =>
        !cartProductNames.has(p.product) &&
        isListableProduct(p) &&
        isInStock(p.status) &&
        !cartCategories.has(p.category)
      );
      suggestions = [...suggestions, ...more];
    }
    
    return suggestions.slice(0, 3);
  };

  const updateCartQty = (productName, change) => {
    let hitLimit = null;

    const next = cart.map(item => {
      if (item.product === productName) {
        const newQty = item.qty + change;
        if (change > 0 && item.inventoryCount !== null && newQty > item.inventoryCount) {
          // Recorded rather than announced from in here: this runs inside the
          // map that builds the next cart, and setting state mid-render is how
          // you get React warning about updating during a render.
          hitLimit = item.inventoryCount;
          return item; // Max stock reached
        }
        return newQty > 0 ? { ...item, qty: newQty } : null;
      }
      return item;
    }).filter(Boolean);

    setCart(next);

    if (hitLimit !== null) {
      flagStockLimit(productName, hitLimit);
    } else if (stockNotice?.product === productName) {
      // They went the other way, or removed the line. The ceiling no longer
      // applies, so the message about it should not linger.
      setStockNotice(null);
    }
  };

  const removeFromCart = (productName) => {
    setCart(cart.filter(item => item.product !== productName));
  };

  // BAC water is priced by its own rules — a free vial per peptide, a flat
  // charge beyond that, and no part in the volume discount — so every money
  // helper below splits the cart rather than summing it flat.
  const getBacSummary = (cartItems, cur = currency, rate = exchangeRate) =>
    summarizeBacWater(cartItems || cart, cur, rate);

  // Subtotal of everything the volume discount is allowed to touch (i.e. the
  // cart minus BAC water).
  const getDiscountableSubtotal = (cartItems, cur = currency, rate = exchangeRate) =>
    (cartItems || cart).reduce((acc, item) => {
      if (isBacWater(item.product)) return acc;
      return acc + (getPriceAsNumber(item, cur, rate) * item.qty);
    }, 0);

  // Calculate Cart Subtotal (before discount), BAC charge included
  const getCartTotal = (cartItems, cur = currency, rate = exchangeRate) =>
    getDiscountableSubtotal(cartItems, cur, rate) + getBacSummary(cartItems, cur, rate).charge;

  // Volume discount tiers: 5+ vials = 15%, 10+ vials = the rate in
  // src/lib/bulkDeal.mjs (raised while a bulk deal runs, back to 20% after).
  // BAC water vials are excluded — they never move the customer up a tier.
  const getCartVialCount = (cartItems) => getBacSummary(cartItems).discountUnits;

  // Units that count toward a promo's minimum. A code naming target products
  // counts only those, so padding the basket with items it does not discount
  // no longer unlocks it. An untargeted code keeps reading the whole cart.
  const getPromoUnitCount = (promo) => (
    String(promo?.target_product || '').trim()
      ? countPromoEligibleUnits(promo, cart)
      : getCartVialCount()
  );

  // Must stay identical to getVolumeDiscountPct in src/lib/pricing.js, which
  // is what the server re-charges on; both now read the same module.
  const getVolumeDiscountPct = (vialCount) => {
    if (vialCount >= 10) return tenPlusDiscountPct();
    if (vialCount >= 5) return STANDARD_FIVE_PLUS_PCT;
    return 0;
  };

  // Order lines as the customer, the database and the packing list should see
  // them — a BAC cart line resolved into its billed and gifted parts.
  const buildOrderItems = (cartItems, cur = currency, rate = exchangeRate) =>
    buildBacAwareOrderItems(cartItems || cart, {
      currency: cur,
      exchangeRate: rate,
      priceOf: (item) => getPriceAsNumber(item, cur, rate),
      lang,
    });

  // A bulk promo (one with a unit minimum) replaces the automatic volume
  // discount instead of stacking with it, so the percentage on the code is the
  // percentage the customer actually gets. Single source of truth - every
  // checkout path reads this rather than getVolumeDiscountPct directly.
  const getEffectiveVolumePct = () =>
    effectiveVolumeDiscountPct(promoData?.valid ? promoData : null, getVolumeDiscountPct(getCartVialCount()));

  // True when an applied code has taken the volume tiers off the table.
  const volumeTierHintSuppressed = Boolean(promoData?.valid && replacesVolumeDiscount(promoData));

  // The discount lands on the non-BAC subtotal only; the BAC charge is added
  // back afterwards at face value.
  const getDiscountedTotal = () =>
    applyBacAwareDiscount(
      getDiscountableSubtotal(),
      getBacSummary().charge,
      getEffectiveVolumePct(),
    ).itemsTotal;

  const getShippingFee = () => {
    if (cart.length === 0) return 0;
    const itemsTotal = getDiscountedTotal();
    const itemsTotalUsd = currency === 'USD' ? itemsTotal : (itemsTotal / exchangeRate);
    if (itemsTotalUsd < FREE_SHIPPING_USD_THRESHOLD) {
      if (currency === 'CRC') {
        return FLAT_SHIPPING_CRC;
      }
      return parseFloat((FLAT_SHIPPING_CRC / exchangeRate).toFixed(2));
    }
    return 0;
  };

  const getItemsTotalBeforeShipping = () => getDiscountedTotal() - getPromoDiscountAmount();

  const qualifiesForFreeShipping = () => {
    if (cart.length === 0) return false;
    const itemsTotalUsd = currency === 'USD'
      ? getDiscountedTotal()
      : (getDiscountedTotal() / exchangeRate);
    return itemsTotalUsd >= FREE_SHIPPING_USD_THRESHOLD;
  };

  const getAmountToFreeShipping = () => {
    const itemsTotalUsd = currency === 'USD'
      ? getDiscountedTotal()
      : (getDiscountedTotal() / exchangeRate);
    const remainingUsd = FREE_SHIPPING_USD_THRESHOLD - itemsTotalUsd;
    return currency === 'USD'
      ? parseFloat(remainingUsd.toFixed(2))
      : Math.ceil(remainingUsd * exchangeRate);
  };

  const getFreeShippingThresholdLabel = () => {
    if (currency === 'USD') return '$200';
    return formatPriceVal(Math.round(FREE_SHIPPING_USD_THRESHOLD * exchangeRate), 'CRC');
  };

  const getPromoDiscountAmount = () => {
    if (!promoData || !promoData.valid) return 0;
    
    // The BAC charge is excluded from every promo base — it is a flat side
    // charge, not discountable merchandise.
    let targetTotal = getDiscountableSubtotal();

    if (promoData.is_flash_sale && promoData.target_product) {
      const targets = promoData.target_product.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      targetTotal = cart
        .filter(item => !isBacWater(item.product) && targets.some(t => item.product.toLowerCase().includes(t)))
        .reduce((sum, item) => sum + getPriceAsNumber(item, currency) * item.qty, 0);
    }
    
    const volumePct = getEffectiveVolumePct();
    if (volumePct > 0) {
      targetTotal = targetTotal * (1 - volumePct / 100);
    }

    return currency === 'USD' ? parseFloat((targetTotal * promoData.discount_pct).toFixed(2)) : Math.round(targetTotal * promoData.discount_pct);
  };

  const getFinalTotal = () => {
    const items = getDiscountedTotal();
    const promo = getPromoDiscountAmount();
    const total = (items - promo) + getShippingFee();
    // Rounded at the source, not just where it is printed. This value is also
    // saved as the order total and handed to the card gateway, and a sum of
    // dollar amounts that carries fifteen decimal places is simply wrong
    // before anyone displays it. Colones are already whole numbers.
    return currency === 'USD' ? roundToCents(total) : total;
  };

  const handleApplyPromo = async (codeOverride = null) => {
    // Only a string can be a code. A click event slipping in here stringified
    // to "[object Object]", overwrote the input, and failed validation - which
    // read as "my promo codes are broken" during a live sale.
    if (codeOverride && typeof codeOverride !== 'string') codeOverride = null;
    const codeToApply = String(codeOverride || promoCodeInput || '').trim().toUpperCase();
    if (!codeToApply) return;
    setPromoCodeInput(codeToApply);
    setPromoLoading(true);
    setPromoError('');
    try {
      const res = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: codeToApply,
          unitCount: getCartVialCount(),
          // The server needs the lines to count a targeted code, because which
          // products count depends on the code it has just looked up.
          items: cart.map((item) => ({ product: item.product, qty: item.qty })),
          lang,
        }),
      });
      const data = await res.json();
      if (data.valid) {
        if (data.is_flash_sale && data.target_product) {
          const targets = data.target_product.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
          const hasTargetItem = cart.some(item => targets.some(t => item.product.toLowerCase().includes(t)));
          if (!hasTargetItem) {
            setPromoData(null);
            setPromoError(lang === 'en' ? `This promo requires ${data.target_product} in your cart.` : `Este código requiere ${data.target_product} en el carrito.`);
            setPromoLoading(false);
            return;
          }
        }
        setPromoData(data);
        setPromoError('');
      } else {
        setPromoData(null);
        setPromoError(data.error || (lang === 'en' ? 'Invalid code' : 'Código inválido'));
      }
    } catch (err) {
      setPromoError(lang === 'en' ? 'Validation error' : 'Error de validación');
    }
    setPromoLoading(false);
  };

  // The exit-intent offer hands its code to the ordinary promo path rather than
  // applying a discount of its own. It IS an ordinary promo code, and a private
  // route into the cart would be a second place where a discount lands without
  // the target-product and unit checks running.
  const handleExitOfferApply = async (code) => {
    await handleApplyPromo(code);
    // Open the drawer so the customer sees the new total. An offer accepted
    // with no visible change to the price is an offer they will not believe.
    setIsCartOpen(true);
  };

  // The twenty minutes ran out with the code still applied. Take it back out
  // here: leaving it would walk the customer to the payment button holding a
  // total api/orders/create is about to refuse, and the failure would land at
  // the single worst moment in the whole checkout.
  const handleExitOfferExpire = (code) => {
    if (!promoData?.valid || promoData.code !== code) return;
    setPromoData(null);
    setPromoCodeInput('');
    setPromoError(lang === 'en'
      ? 'Your extra discount expired and was removed from the cart.'
      : 'Tu descuento extra venció y se quitó del carrito.');
  };

  // A cart can stop qualifying after the code was accepted — someone applies a
  // 20-unit code then removes items, or applies a 4-unit-cap code then adds
  // six more. Without this the discount would silently survive, so both unit
  // limits have to be re-checked whenever the cart changes.
  useEffect(() => {
    if (!promoData?.valid) return;
    const check = checkUnitLimits(promoData, getPromoUnitCount(promoData));
    if (check.ok) return;
    setPromoData(null);
    setPromoError(unitLimitsMessage(promoData, check.unitCount, lang));
  }, [cart, promoData, lang]);

  useEffect(() => {
    if (autoPromoAppliedRef.current || typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const promoParam = urlParams.get('promo_code') || urlParams.get('promo') || urlParams.get('coupon') || urlParams.get('discount');
    if (!promoParam) return;

    autoPromoAppliedRef.current = true;
    handleApplyPromo(promoParam);
  }, []);

  const getStoredAttribution = () => {
    try {
      const attr = JSON.parse(localStorage.getItem('costa_attribution') || '{}');
      return attr.expires > Date.now() ? attr : {};
    } catch {
      return {};
    }
  };

  const applyStoredAttribution = (orderRow) => {
    const attribution = getStoredAttribution();
    if (attribution.journey_id) {
      return {
        ...orderRow,
        journey_id: attribution.journey_id,
        journey_enrollment_id: attribution.journey_enrollment_id || null,
        journey_step_id: attribution.journey_step_id || null,
      };
    }
    if (attribution.campaign_id) {
      return { ...orderRow, campaign_id: attribution.campaign_id };
    }
    return orderRow;
  };

  /**
   * Bring the cart into line with what the server just said it costs.
   *
   * Returns the server's own total for this cart, so the caller can decide
   * whether the customer has to be told about it.
   */
  const adoptServerPricing = (data) => {
    if (isPlausibleRate(data?.exchangeRate)) {
      setExchangeRate(Number(data.exchangeRate));
      setExchangeRateUpdatedAt(Date.now());
      try {
        localStorage.setItem('exchangeRate_USDCRC', String(data.exchangeRate));
        localStorage.setItem('exchangeRate_USDCRC_time', String(Date.now()));
      } catch {
        // Storage blocked (private browsing). The rate still applies to this
        // page, it just will not survive a reload.
      }
    }

    if (Array.isArray(data?.pricing?.products)) {
      const currentByName = new Map(data.pricing.products.map((product) => [product.product, product]));
      setProducts((current) => current.map((product) => (
        currentByName.has(product.product)
          ? { ...product, ...currentByName.get(product.product) }
          : product
      )));
      setCart((current) => current.map((item) => (
        currentByName.has(item.product)
          ? { ...item, ...currentByName.get(item.product) }
          : item
      )));
    }

    const total = Number(data?.pricing?.total);
    return Number.isFinite(total) ? total : null;
  };

  /**
   * Post one order to the API.
   *
   * `repriceRetriesLeft` exists because of a checkout that could not be
   * completed at all. Colón totals are compared to the exact colón, and the
   * page reads the USD/CRC rate once on load and never again — so once the
   * server's hourly refresh moved the rate, the total this page posted could
   * never match the total the server computed. The old code answered that by
   * telling the customer to press the button again and merging the unchanged
   * dollar price back into her cart, which changed nothing: the same request
   * failed the same way every time, and after five presses the abuse limiter
   * locked her out of the shop for a day.
   *
   * So a repricing refusal is now something this function handles rather than
   * something the customer is asked to solve. It takes the server's rate,
   * re-posts at the server's own total, and only interrupts her if that total
   * is HIGHER than the one she agreed to — nobody is charged more than the
   * figure on the button without being shown it first.
   */
  const saveOrderToDatabase = async (orderRow, { repriceRetriesLeft = 1 } = {}) => {
    try {
      const orderPayload = applyStoredAttribution(orderRow);

      // A signed-in customer's session travels with the order so the server can
      // stamp its owner. The id itself is never sent from here — the API derives
      // it from this token, so a tampered payload cannot claim someone else's
      // account. Guests send no header and check out exactly as before.
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(customerAccessToken ? { Authorization: `Bearer ${customerAccessToken}` } : {}),
        },
        body: JSON.stringify({ order: orderPayload, sessionId: sessionId || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.errorCode === 'price_changed') {
          const serverTotal = adoptServerPricing(data);
          const shownTotal = orderRow.currency === 'USD'
            ? Number(orderRow.total_usd || 0)
            : Number(orderRow.total_crc || 0);

          // Same price or cheaper: she loses nothing, so finish the order she
          // already asked for rather than making her press the button again to
          // agree to a number she will not even notice changing.
          if (serverTotal !== null && repriceRetriesLeft > 0 && serverTotal <= shownTotal) {
            return saveOrderToDatabase(
              {
                ...orderRow,
                total_usd: data.pricing.totalUsd,
                total_crc: data.pricing.totalCrc,
              },
              { repriceRetriesLeft: repriceRetriesLeft - 1 },
            );
          }
        }
        console.error('Order save failed:', data.error || res.statusText);
        return { ok: false, error: data.error || res.statusText, errorCode: data.errorCode || null };
      }
      if (data.ok && sessionId) {
        const newSid = 'session_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('cart_session_id', newSid);
        setSessionId(newSid);
      }
      return { ok: true, id: data.id, paymentToken: data.paymentToken || null };
    } catch (err) {
      console.error('Order save request failed:', err);
      return { ok: false, error: err.message || 'Network error' };
    }
  };

  // Put the problem on screen and in focus.
  //
  // A blocking error the customer cannot see is the same as no error at all:
  // they press the button again and nothing happens. Every checkout stop uses
  // this, so a rule enforced in a handler reads the same as a required field.
  const revealField = (name) => {
    setTimeout(() => {
      const el = document.getElementById(`field-${name}`);
      if (!el) return;
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      // Centred rather than 'start': the checkout has a sticky header above
      // and a sticky submit bar below, and either will happily cover a field
      // parked at the edge of a phone viewport.
      el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      el.focus({ preventScroll: true });
    }, 100);
  };

  /**
   * Stop the checkout and say why, on the page, where the customer is looking.
   *
   * alert() did neither well. It states the problem and then disappears, over
   * a page with nothing marked — so a customer who dismissed it was back at a
   * button that appeared to do nothing, with no way to re-read what went
   * wrong. Worse on a phone, where the dialog can be missed entirely.
   *
   * Every message here has to survive the same test: it says what happened,
   * and it says what to do next. "Error 500" says neither.
   */
  /**
   * Close the gateway's sentence so ours can start.
   *
   * Shield Hub Pay returns "Card brand not allowed" with no full stop, and
   * joining that to our own line produced "Card brand not allowed Nothing has
   * been charged." on screen — one run-on sentence out of two.
   */
  const endSentence = (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return '';
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  };

  const failCheckout = (title, detail) => {
    setCheckoutError({ title, detail });
    revealField('checkoutError');
  };

  /**
   * Turn a refused save into something worth reading.
   *
   * The server states, in the customer's own language, exactly why it said no:
   * the promo code expired, the product sold out, the daily limit is reached.
   * All of that used to be discarded in favour of one sentence that fitted none
   * of them — "we could not save your order, press the button again" — which at
   * best said nothing and at worst was wrong. A customer stopped by the abuse
   * limiter was being told to do the one thing that kept her stopped.
   *
   * So the server's sentence is the message unless there is genuinely no
   * server sentence to show, which now only happens when the request never
   * arrived at all.
   */
  const checkoutFailureNotice = (result, { cardCheckout = false } = {}) => {
    const serverMessage = String(result?.error || '').trim();

    if (result?.errorCode === 'too_many_attempts') {
      return { title: tooManyAttemptsTitle(lang), detail: serverMessage || tooManyAttemptsMessage(lang) };
    }

    if (result?.errorCode === 'price_changed') {
      return {
        title: lang === 'en' ? 'Your total has changed' : 'Su total cambió',
        detail: serverMessage,
      };
    }

    // Nothing left our side, and on a card checkout that is the question the
    // customer is actually asking.
    const reassurance = cardCheckout
      ? (lang === 'en'
        ? 'Your card has not been charged.'
        : 'No se ha realizado ningún cargo a su tarjeta.')
      : (lang === 'en'
        ? 'Nothing has been sent yet and your cart is untouched.'
        : 'Todavía no se ha enviado nada y su carrito sigue igual.');

    const fallback = lang === 'en'
      ? 'Please try again, or message us on WhatsApp.'
      : 'Inténtelo de nuevo o escríbanos por WhatsApp.';

    return {
      title: lang === 'en' ? 'We could not save your order' : 'No pudimos guardar su pedido',
      detail: `${reassurance} ${serverMessage || fallback}`,
    };
  };

  /**
   * Say that a product has run out, against the line it is about.
   *
   * The alert() this replaces gave a number with nothing to attach it to —
   * "Only 3 units available" while the tap that caused it silently did
   * nothing, and on a phone the dialog could be dismissed before it was read.
   * Showing it on the cart line answers the question the customer actually
   * has, which is not "how many are there" but "then how many do I have?"
   *
   * The cart is opened first when it is closed: the message lives in there,
   * and a notice nobody can see is the alert() problem over again.
   */
  const flagStockLimit = (product, available) => {
    setStockNotice({ product, available });
    setIsCartOpen(true);
    revealField('stock');
  };

  const validateForm = () => {
    const errors = {};
    // Presence alone let real junk through — a single letter, a held-down key,
    // a phone number in the name box — and every one of those becomes a sales
    // rep chasing an order they cannot address. The shared rules still allow a
    // Costa Rican company named after its own cédula jurídica.
    const nameCheck = validateCustomerName(customerName);
    if (!nameCheck.ok) errors.customerName = identityMessage(nameCheck.reason, lang);
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!customerEmail.trim()) {
      errors.customerEmail = lang === 'en' ? 'Email address is required.' : 'El correo electrónico es requerido.';
    } else if (!emailRegex.test(customerEmail)) {
      errors.customerEmail = lang === 'en' ? 'Please enter a valid email address.' : 'Por favor ingrese un correo electrónico válido.';
    }

    if (!customerPhoneNational.trim()) {
      errors.customerPhone = lang === 'en' ? 'WhatsApp number is required.' : 'El número de WhatsApp es requerido.';
    } else if (!phoneLooksValid) {
      errors.customerPhone = lang === 'en' ? `Invalid number for ${findPhoneCountry(customerPhoneCountry).name}.` : `Número inválido para ${findPhoneCountry(customerPhoneCountry).name}.`;
    }

    if (!customerIdNumber.trim()) {
      errors.customerIdNumber = lang === 'en' ? 'ID number is required.' : 'El número de identificación es requerido.';
    }

    if (!shippingProvince || !shippingCanton || !shippingDistrict || !shippingDetailedAddress.trim()) {
      errors.shippingAddress = lang === 'en' ? 'Please complete your full shipping address.' : 'Por favor complete su dirección de envío completa.';
    }

    if (paymentMethod === 'card') {
      const cleanNumber = cardDetails.number.replace(/\D/g, '');
      const cleanCvv = cardDetails.cvv.replace(/\D/g, '');

      if (!cardDetails.holder.trim()) errors.cardHolder = lang === 'en' ? 'Cardholder name is required.' : 'El nombre del titular es requerido.';

      if (!cleanNumber) {
        errors.cardNumber = lang === 'en' ? 'Card number is required.' : 'El número de tarjeta es requerido.';
      } else if (cleanNumber.length < 12) {
        errors.cardNumber = lang === 'en' ? 'Please enter a complete card number.' : 'Por favor ingrese el número completo de la tarjeta.';
      }

      if (!cardDetails.expiry.trim()) {
        errors.cardExpiry = lang === 'en' ? 'Expiration date is required.' : 'La fecha de expiración es requerida.';
      } else if (!/^\d{2}\/\d{2}$/.test(cardDetails.expiry)) {
        errors.cardExpiry = lang === 'en' ? 'Use the MM/YY format.' : 'Use el formato MM/AA.';
      }

      if (!cleanCvv) {
        errors.cardCvv = lang === 'en' ? 'CVV is required.' : 'El CVV es requerido.';
      } else if (cleanCvv.length < 3) {
        errors.cardCvv = lang === 'en' ? 'CVV must be at least 3 digits.' : 'El CVV debe tener al menos 3 dígitos.';
      }
    }

    setFormErrors(errors);

    // Keys are inserted in DOM order above, so the first one is the first
    // problem on the page.
    const firstError = Object.keys(errors)[0];
    if (firstError) {
      revealField(firstError);
      return false;
    }
    return true;
  };

  const startCardCheckout = async () => {
    if (cardSubmitLockRef.current || cardSubmitting || cart.length === 0) return;

    // Belt and braces. The card tile is disabled during a pause so this should
    // be unreachable, but saveOrderToDatabase runs before the charge does — an
    // order row written for a payment the API will refuse is a support ticket
    // nobody needs, so stop here rather than one step later.
    if (CARD_PAYMENTS_PAUSED) {
      setCheckoutError({
        title: lang === 'en'
          ? 'Card payments are temporarily paused'
          : 'Los pagos con tarjeta están pausados temporalmente',
        detail: cardCheckoutMessage('paused', lang).message,
      });
      return;
    }

    // Clear the last failure before trying again, so a banner left on screen
    // always describes this attempt and never the previous one.
    setCheckoutError(null);
    if (!validateForm()) return;

    if (checkBacOnlyMinimum(cart).blocked) {
      // The rule already has a red banner in the cart; the customer just could
      // not see it from the submit button. Taking them to it beats an alert(),
      // which says what is wrong and then leaves them on the same screen with
      // nothing marked.
      revealField('bacMinimum');
      return;
    }

    const cleanCardNumber = cardDetails.number.replace(/\D/g, '');
    const cleanCvv = cardDetails.cvv.replace(/\D/g, '');

    cardSubmitLockRef.current = true;
    setCardSubmitting(true);

    const orderNum = `CARD-${Date.now().toString(36).toUpperCase()}`;
    const totalVal = getFinalTotal();
    const cardCurrency = 'USD';
    const cardAmount = currency === 'USD' ? totalVal : Number((totalVal / exchangeRate).toFixed(2));
    const totalUsd = currency === 'USD' ? totalVal : Math.round(totalVal / exchangeRate);
    const totalCrc = currency === 'CRC' ? totalVal : Math.round(totalVal * exchangeRate);
    const shippingCosts = getShippingCostFields(currency, exchangeRate, getShippingFee());
    const orderItems = buildOrderItems(cart);

    // Saved exactly as the alert, the invoice and the courier label will show
    // it: validateForm has already accepted the name, so this only strips the
    // stray spaces a phone keyboard adds.
    const cleanName = normalizeCustomerName(customerName);

    const cardSave = await saveOrderToDatabase({
      order_number: orderNum,
      customer_name: cleanName,
      customer_phone: customerPhone,
      customer_email: customerEmail || null,
      shipping_address: shippingAddress,
      customer_id_type: customerIdType,
      customer_id_number: customerIdNumber,
      items: orderItems,
      total_usd: currency === 'USD' ? totalVal : Math.round(totalVal / exchangeRate),
      total_crc: currency === 'CRC' ? totalVal : Math.round(totalVal * exchangeRate),
      ...shippingCosts,
      currency,
      payment_method: 'card',
      status: 'Pending - Card',
      ip_address: customerMetadata?.ip_address || null,
      location_data: customerMetadata?.location_data || null,
      device_info: customerMetadata?.device_info || null,
      sales_agent: typeof window !== 'undefined' ? localStorage.getItem('checkout_sales_agent') : null,
      promo_code: promoData?.valid ? promoData.code : null,
      discount_amount_usd: promoData?.valid ? (currency === 'USD' ? getPromoDiscountAmount() : parseFloat((getPromoDiscountAmount() / exchangeRate).toFixed(2))) : 0,
      discount_amount_crc: promoData?.valid ? (currency === 'CRC' ? getPromoDiscountAmount() : Math.round(getPromoDiscountAmount() * exchangeRate)) : 0,
      affiliate_id: promoData?.valid ? promoData.affiliate_id : null,
      affiliate_commission_usd: promoData?.valid ? parseFloat(((totalUsd - (currency === 'USD' ? getShippingFee() : getShippingFee()/exchangeRate)) * promoData.commission_rate).toFixed(2)) : 0,
      affiliate_commission_crc: promoData?.valid ? Math.round(((currency === 'CRC' ? (totalVal - getShippingFee()) : (totalVal - getShippingFee()) * exchangeRate)) * promoData.commission_rate) : 0,
    });

    if (!cardSave.ok) {
      setCardSubmitting(false);
      cardSubmitLockRef.current = false;
      // Nothing was charged — worth saying, because "could not save your
      // order" on a card checkout otherwise reads as "did my card go through?"
      const notice = checkoutFailureNotice(cardSave, { cardCheckout: true });
      failCheckout(notice.title, notice.detail);
      return;
    }

    try {
      const res = await fetch('/api/shieldhubpay/process-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: cardAmount,
          currency: cardCurrency,
          orderNumber: orderNum,
          paymentToken: cardSave.paymentToken,
          customerName: cleanName,
          customerPhone,
          customerEmail,
          shippingAddress,
          lang,
          paymentMethod: 'card',
          customerIdType,
          customerIdNumber,
          customerIp: customerMetadata?.ip_address || null,
          card: {
            holder: cardDetails.holder,
            number: cardDetails.number,
            expiry: cardDetails.expiry,
            cvv: cardDetails.cvv,
          },
        }),
      });

      const data = await res.json();

      // No mail is sent from here any more.
      //
      // This page used to post the customer's receipt itself, once it had read
      // the charge result. Three things went wrong with that. On a 3DS
      // redirect the tab left for the bank straight after mailing "awaiting
      // confirmation", and nothing ever sent the real answer. When the request
      // failed or timed out, a charge that had actually cleared was mailed as
      // "Declined". And any customer who closed the tab got nothing at all.
      //
      // /api/shieldhubpay/process-card now sends it, from the status it wrote
      // to the order — and /api/shieldhubpay/webhook sends it for the 3DS
      // answers that arrive after this page is gone.
      if (data.paymentUrl) {
        // Stashed before leaving for the bank: the customer comes back to
        // /thank-you with no order number in the URL, and session storage
        // survives the round trip in this tab.
        stashReviewOptIn(orderNum);
        window.location.href = data.paymentUrl;
        return;
      }

      if (data.ok) {
        if (sessionId) localStorage.setItem('checkout_completed_session_id', sessionId);
        setCart([]);
        localStorage.removeItem('cart');
        stashReviewOptIn(orderNum);
        window.location.href = `/thank-you?lang=${lang}&order=${encodeURIComponent(orderNum)}`;
        return;
      }

      // Two different things arrive here.
      //
      // A gateway decline carries the bank's own wording — "insufficient
      // funds", "Card brand not allowed" — which is the one useful detail and
      // is kept verbatim; the sentence after it is ours. Everything else is a
      // checkout stop the server has already phrased for the customer, and
      // adding "try another card" to those would contradict them.
      //
      // No "above" or "below" in either. The notice is placed by the layout,
      // not by this string, and it read "check the card details above" while
      // sitting directly above those very fields.
      const isGatewayDecline = !data.errorCode || data.errorCode === 'declined';
      failCheckout(
        data.errorCode === 'unconfirmed'
          ? (lang === 'en' ? 'We could not confirm your payment' : 'No pudimos confirmar su pago')
          : data.errorCode === 'already_paid'
            ? (lang === 'en' ? 'This order is already paid' : 'Este pedido ya fue pagado')
            : (lang === 'en' ? 'The card payment did not go through' : 'El pago con tarjeta no se completó'),
        isGatewayDecline
          ? [
            endSentence(data.error) || (lang === 'en' ? 'The bank did not give a reason.' : 'El banco no dio un motivo.'),
            lang === 'en'
              ? 'Nothing has been charged. Check your card details, try another card, or message us on WhatsApp to pay a different way.'
              : 'No se ha realizado ningún cargo. Revise los datos de su tarjeta, pruebe con otra, o escríbanos por WhatsApp para pagar de otra forma.',
          ].join(' ')
          : data.error,
      );

      if (data.retryable === false) {
        // Leave the button locked. `cardSubmitting` is not reused for this:
        // it renders a spinner, and a spinner would say "still working" when
        // the answer is "stop and talk to us".
        setCardRetryBlocked(true);
      }
      setCardSubmitting(false);
      cardSubmitLockRef.current = false;
    } catch (err) {
      console.error('Card payment error:', err);
      // "Nothing has been charged" was a guess here too. A request that fails
      // in the browser usually never arrived, but a charge whose response was
      // lost on the way back looks exactly the same from this side.
      failCheckout(
        lang === 'en' ? 'We could not reach the payment service' : 'No pudimos conectar con el servicio de pago',
        lang === 'en'
          ? 'Check your internet connection and press the button again. If you have already seen a charge from us, do not try again — message us on WhatsApp and we will finish your order.'
          : 'Revise su conexión a internet y presione el botón de nuevo. Si ya vio un cargo de nuestra parte, no lo intente de nuevo — escríbanos por WhatsApp y completamos su pedido.',
      );
      setCardSubmitting(false);
      cardSubmitLockRef.current = false;
    }
  };

  // Checkout submit
  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (paymentMethod === 'card') {
      // Card payment is handled by its own button below — should not reach here
      return;
    }
    if (cart.length === 0) return;
    // As in startCardCheckout: a banner on screen must describe this attempt.
    setCheckoutError(null);
    if (!validateForm()) return;
    if (checkBacOnlyMinimum(cart).blocked) {
      // The rule already has a red banner in the cart; the customer just could
      // not see it from the submit button. Taking them to it beats an alert(),
      // which says what is wrong and then leaves them on the same screen with
      // nothing marked.
      revealField('bacMinimum');
      return;
    }

    setOrderSubmitting(true);

    const orderNum = 'WPCR-' + Date.now().toString(36).toUpperCase();

    const subtotalVal = getCartTotal();
    const totalVal = getFinalTotal();
    const vialCount = getCartVialCount();
    const discountPct = getEffectiveVolumePct();
    const orderItems = buildOrderItems(cart);
    const totalUsd = currency === 'USD' ? totalVal : Math.round(totalVal / exchangeRate);
    const totalCrc = currency === 'CRC' ? totalVal : Math.round(totalVal * exchangeRate);
    const shippingCosts = getShippingCostFields(currency, exchangeRate, getShippingFee());

    const whatsappSource = typeof window !== 'undefined' ? localStorage.getItem('whatsapp_source') : null;

    // Saved exactly as the alert, the invoice and the courier label will show
    // it: validateForm has already accepted the name, so this only strips the
    // stray spaces a phone keyboard adds.
    const cleanName = normalizeCustomerName(customerName);

    const saveResult = await saveOrderToDatabase({
      order_number: orderNum,
      customer_name: cleanName,
      customer_phone: customerPhone,
      customer_email: customerEmail || null,
      shipping_address: shippingAddress,
      customer_id_type: customerIdType,
      customer_id_number: customerIdNumber,
      items: orderItems,
      total_usd: currency === 'USD' ? totalVal : Math.round(totalVal / exchangeRate),
      total_crc: currency === 'CRC' ? totalVal : Math.round(totalVal * exchangeRate),
      ...shippingCosts,
      currency: currency,
      payment_method: paymentMethod,
      status: 'Pending',
      ip_address: customerMetadata?.ip_address || null,
      location_data: customerMetadata?.location_data || null,
      device_info: customerMetadata?.device_info || null,
      whatsapp_source: whatsappSource || null,
      sales_agent: typeof window !== 'undefined' ? localStorage.getItem('checkout_sales_agent') : null,
      promo_code: promoData?.valid ? promoData.code : null,
      discount_amount_usd: promoData?.valid ? (currency === 'USD' ? getPromoDiscountAmount() : parseFloat((getPromoDiscountAmount() / exchangeRate).toFixed(2))) : 0,
      discount_amount_crc: promoData?.valid ? (currency === 'CRC' ? getPromoDiscountAmount() : Math.round(getPromoDiscountAmount() * exchangeRate)) : 0,
      affiliate_id: promoData?.valid ? promoData.affiliate_id : null,
      affiliate_commission_usd: promoData?.valid ? parseFloat(((totalUsd - (currency === 'USD' ? getShippingFee() : getShippingFee()/exchangeRate)) * promoData.commission_rate).toFixed(2)) : 0,
      affiliate_commission_crc: promoData?.valid ? Math.round(((currency === 'CRC' ? (totalVal - getShippingFee()) : (totalVal - getShippingFee()) * exchangeRate)) * promoData.commission_rate) : 0,
    });

    if (!saveResult.ok) {
      setOrderSubmitting(false);
      const notice = checkoutFailureNotice(saveResult);
      failCheckout(notice.title, notice.detail);
      return;
    }

    // 2. Open WhatsApp Receipt
    const receiptHeader = lang === 'en' 
      ? `*PEPTIDES COSTA RICA — NEW ORDER*`
      : `*PÉPTIDOS COSTA RICA — NUEVA ORDEN*`;
      
    const idTypeName = customerIdType === '1' ? 'National ID' : customerIdType === '6' ? 'DIMEX' : customerIdType === '5' ? 'Passport' : customerIdType === '2' ? 'Corporate ID' : customerIdType;
    const idTypeNameEs = customerIdType === '1' ? 'Cédula física' : customerIdType === '6' ? 'DIMEX' : customerIdType === '5' ? 'Pasaporte' : customerIdType === '2' ? 'Cédula jurídica' : customerIdType;
    const receiptDetails = lang === 'en'
      ? `\n\n*Customer Details:*\n• Name: ${cleanName}\n• ID: ${customerIdNumber} (${idTypeName})\n• Phone: ${customerPhone}\n• Address: ${shippingAddress}\n\n*Ordered Items:*`
      : `\n\n*Detalles del Cliente:*\n• Nombre: ${cleanName}\n• Identificación: ${customerIdNumber} (${idTypeNameEs})\n• Teléfono: ${customerPhone}\n• Dirección: ${shippingAddress}\n\n*Artículos Pedidos:*`;

    const itemReceipts = cart.map(item => {
      const p = getPriceAsNumber(item, currency);
      return `\n• ${item.product} (x${item.qty}) — ${formatPriceVal(p * item.qty, currency)}`;
    }).join('');

    const discountReceipt = discountPct > 0
      ? (lang === 'en'
        ? `\n\n🏷️ *VOLUME DISCOUNT (${vialCount} vials): ${discountPct}% OFF*\n_Subtotal: ${formatPriceVal(subtotalVal, currency)}_`
        : `\n\n🏷️ *DESCUENTO POR VOLUMEN (${vialCount} viales): ${discountPct}% DESC.*\n_Subtotal: ${formatPriceVal(subtotalVal, currency)}_`)
      : '';

    const shipFee = getShippingFee();
    const shippingReceipt = shipFee > 0
      ? (lang === 'en'
        ? `\n\n🚚 *SHIPPING:* *${formatPriceVal(shipFee, currency)}*`
        : `\n\n🚚 *ENVÍO:* *${formatPriceVal(shipFee, currency)}*`)
      : (lang === 'en'
        ? `\n\n🚚 *SHIPPING:* *FREE* — We've got shipping covered on orders over ${getFreeShippingThresholdLabel()}!`
        : `\n\n🚚 *ENVÍO:* *GRATIS* — ¡Nosotros cubrimos el envío en pedidos superiores a ${getFreeShippingThresholdLabel()}!`);

    const totalReceipt = lang === 'en'
      ? `\n\n*TOTAL DUE:* *${formatPriceVal(totalVal, currency)}*`
      : `\n\n*TOTAL A PAGAR:* *${formatPriceVal(totalVal, currency)}*`;

    let instructionsText = '';
    if (paymentMethod === 'sinpe') {
      const crcTotal = currency === 'CRC' ? totalVal : Math.round(totalVal * exchangeRate);
      instructionsText = lang === 'en'
        ? `\n\n*Payment Method: SINPE Móvil*\n_Please send ₡${crcTotal.toLocaleString('en-US')} CRC via SINPE to:_\n👉 *+506 7264-9160*\n\n_Please send the screenshot of the transfer to verify and coordinate dispatch._`
        : `\n\n*Método de Pago: SINPE Móvil*\n_Por favor envíe ₡${crcTotal.toLocaleString('en-US')} CRC por SINPE a:_\n👉 *+506 7264-9160*\n\n_Por favor envíe el comprobante por aquí para verificar y coordinar el despacho._`;
    } else {
      instructionsText = lang === 'en'
        ? `\n\n*Payment Method: WhatsApp Coordination*\n_Thank you for your order! We will verify stock availability and coordinate dispatch and payment details immediately._`
        : `\n\n*Método de Pago: Coordinación por WhatsApp*\n_¡Muchas gracias por su orden! Verificaremos disponibilidad y coordinaremos el despacho y pago de inmediato._`;
    }

    const fullMessage = `${receiptHeader}${receiptDetails}${itemReceipts}${discountReceipt}${shippingReceipt}${totalReceipt}${instructionsText}`;
    const whatsappUrl = buildWhatsAppLink(links.whatsappNumber, fullMessage);

    // Open WhatsApp
    window.open(whatsappUrl, '_blank');

    setOrderSubmitting(false);
    if (sessionId) localStorage.setItem('checkout_completed_session_id', sessionId);
    setCart([]);
    setCustomerName('');
    setCustomerPhoneNational('');
    setCustomerPhoneCountry(DEFAULT_PHONE_COUNTRY);
    setCustomerEmail('');
    setShippingAddress('');
    setCustomerIdNumber('');
    setShippingProvince('');
    setShippingCanton('');
    setShippingDistrict('');
    setShippingDetailedAddress('');
    setShippingZip('');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('checkout_customer_name');
      localStorage.removeItem('checkout_customer_phone');
      localStorage.removeItem('checkout_customer_email');
      localStorage.removeItem('checkout_shipping_address');
      localStorage.removeItem('checkout_shipping_province');
      localStorage.removeItem('checkout_shipping_canton');
      localStorage.removeItem('checkout_shipping_district');
      localStorage.removeItem('checkout_shipping_detailed');
      localStorage.removeItem('checkout_shipping_zip');
    }

    // Redirect to the thank-you conversion page
    stashReviewOptIn(orderNum);
    router.push(`/thank-you?lang=${lang}`);
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!reviewName || !reviewComment) return;
    
    setReviewSubmitting(true);
    
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('product_reviews')
          .insert({
            product_name: selectedProduct.product,
            customer_name: reviewName,
            rating: reviewRating,
            comment: reviewComment,
            status: 'Pending'
          });
          
        if (!error) {
          setReviewSuccess(true);
          setReviewName('');
          setReviewComment('');
          setReviewRating(5);
          setTimeout(() => {
            setReviewSuccess(false);
            setReviewFormOpen(false);
          }, 3000);
        }
      } catch (err) {
        console.error("Failed to submit review:", err);
      }
    }
    setReviewSubmitting(false);
  };

  // Categories (exclude categories that only exist on admin-hidden products)
  const sortedCategories = Array.from(new Set(products.filter(p => !hiddenProducts.includes(p.product)).map(p => p.category))).filter(Boolean).sort();
  const weightLossCategory = sortedCategories.find(isWeightLossCategory);
  const categoriesList = [
    'all',
    ...(weightLossCategory ? [weightLossCategory] : []),
    ...sortedCategories.filter(cat => cat !== weightLossCategory),
  ];

  // Filtering + Sorting Logic
  const baseFilteredProducts = products.filter(p => {
    // 0. Admin-hidden rows, and BAC sizes that are not sold. Shared with the
    // search dropdown and the cart suggestions so the three lists cannot drift.
    if (!isListableProduct(p)) return false;
    // 1. Search Query
    if (!productMatchesCatalogSearch(p, searchQuery)) return false;

    // 2. Category Bubble Filter
    if (activeCategory !== 'all' && p.category !== activeCategory) return false;

    // 3. Stock Toggle
    if (inStockOnly && !isInStock(p.status) && !isBacWater(p.product)) return false;

    // 4. Price range filters
    if (priceFilter !== 'all') {
      const priceVal = getPriceAsNumber(p, currency);
      if (currency === 'USD') {
        if (priceFilter === 'low' && priceVal >= 100) return false;
        if (priceFilter === 'mid' && (priceVal < 100 || priceVal > 200)) return false;
        if (priceFilter === 'high' && priceVal <= 200) return false;
      } else {
        if (priceFilter === 'low' && priceVal >= 55000) return false;
        if (priceFilter === 'mid' && (priceVal < 55000 || priceVal > 110000)) return false;
        if (priceFilter === 'high' && priceVal <= 110000) return false;
      }
    }

    return true;
  });

  // Sorting — on-sale in-stock items first, then the rest of the in-stock
  // items, out-of-stock at the bottom. The banding is shared with the tests in
  // tests/catalog-filters.test.mjs; only the tie-break inside a band differs
  // between the sort modes.
  //
  // "On sale" deliberately covers both ways a card can end up wearing the
  // ribbon: a genuine markdown (which is what Deal of the Week creates) and an
  // advertised promo code. Anything showing a struck-through price sorts up,
  // so the shelf order matches what the customer can see.
  const sortPredicates = {
    isInStock: (p) => isBacWater(p.product) || isInStock(p.status),
    isOnSale: (p) => {
      if (isBacWater(p.product)) return false;
      const original = parsePrice(p.originalPriceUsd);
      const current = parsePrice(p.priceUsd);
      if (original > 0 && current > 0 && original > current) return true;
      return Boolean(getPromoBadgeForProduct(promoBadges, p.product, lang));
    },
  };

  let filteredProducts;
  if (sortOrder === 'pop') {
    filteredProducts = [...baseFilteredProducts].sort(
      (a, b) => compareBySaleAndStock(a, b, sortPredicates)
    );
  } else {
    // Price sort, but still banded by sale and stock first
    filteredProducts = [...baseFilteredProducts].sort((a, b) => {
      const banded = compareBySaleAndStock(a, b, sortPredicates);
      if (banded !== 0) return banded;
      const priceA = getPriceAsNumber(a, currency);
      const priceB = getPriceAsNumber(b, currency);
      return sortOrder === 'lowToHigh' ? priceA - priceB : priceB - priceA;
    });
  }

  const renderOrderSummary = ({ showHeading = false, compact = false } = {}) => {
    const shipFee = getShippingFee();
    const isFreeShip = qualifiesForFreeShipping();
    const hasVolumeDiscount = getEffectiveVolumePct() > 0;
    const hasPromoDiscount = promoData?.valid;
    const itemsBeforeShipping = getItemsTotalBeforeShipping();

    return (
      <div className={`cart-order-summary${compact ? ' cart-order-summary--compact' : ''}`}>
        {showHeading && (
          <h4 className="cart-order-summary-title">
            {lang === 'en' ? 'Order Summary' : 'Resumen del Pedido'}
          </h4>
        )}

        <div className="cart-total-row" style={{ opacity: hasVolumeDiscount ? 0.6 : 1, marginBottom: compact ? '8px' : undefined }}>
          <span className="cart-total-label">{lang === 'en' ? 'SUBTOTAL' : 'SUBTOTAL'}</span>
          <span
            className="cart-total-val"
            style={hasVolumeDiscount ? { textDecoration: 'line-through', fontSize: '0.9rem' } : { fontSize: compact ? '1rem' : undefined }}
          >
            {formatPriceVal(getCartTotal(), currency)}
          </span>
        </div>

        {hasVolumeDiscount && (
          <div className="cart-total-row" style={{ marginBottom: compact ? '6px' : '8px' }}>
            <span className="cart-total-label" style={{ color: theme === 'dark' ? '#4ade80' : '#15803d' }}>
              {lang === 'en' ? 'VOLUME DISCOUNT' : 'DESC. VOLUMEN'}
            </span>
            <span className="cart-total-val" style={{ color: theme === 'dark' ? '#4ade80' : '#15803d', fontSize: compact ? '1rem' : undefined }}>
              -{formatPriceVal(getCartTotal() - getDiscountedTotal(), currency)}
            </span>
          </div>
        )}

        {hasPromoDiscount && (
          <div className="cart-total-row" style={{ marginBottom: compact ? '6px' : '8px' }}>
            <span className="cart-total-label" style={{ color: '#38bdf8' }}>
              {lang === 'en' ? 'PROMO DISCOUNT' : 'DESCUENTO PROMO'}
            </span>
            <span className="cart-total-val" style={{ color: '#38bdf8', fontSize: compact ? '1rem' : undefined }}>
              -{formatPriceVal(getPromoDiscountAmount(), currency)}
            </span>
          </div>
        )}

        {(hasVolumeDiscount || hasPromoDiscount) && (
          <div className="cart-total-row" style={{ marginBottom: compact ? '6px' : '8px' }}>
            <span className="cart-total-label">{lang === 'en' ? 'ITEMS TOTAL' : 'TOTAL ARTÍCULOS'}</span>
            <span className="cart-total-val" style={{ fontSize: compact ? '1rem' : undefined }}>
              {formatPriceVal(itemsBeforeShipping, currency)}
            </span>
          </div>
        )}

        {isFreeShip ? (
          <div className="cart-free-shipping-banner">
            <span className="cart-free-shipping-icon">🚚</span>
            <div>
              <div className="cart-free-shipping-title">
                {lang === 'en' ? 'Free Shipping' : 'Envío Gratis'}
              </div>
              <div className="cart-free-shipping-detail">
                {lang === 'en'
                  ? `We've got shipping covered on orders over ${getFreeShippingThresholdLabel()}!`
                  : `¡Nosotros cubrimos el envío en pedidos superiores a ${getFreeShippingThresholdLabel()}!`}
              </div>
            </div>
            <span className="cart-free-shipping-badge">{lang === 'en' ? 'FREE' : 'GRATIS'}</span>
          </div>
        ) : (
          <>
            <div className="cart-total-row" style={{ marginBottom: compact ? '6px' : '8px' }}>
              <span className="cart-total-label">{lang === 'en' ? 'SHIPPING' : 'ENVÍO'}</span>
              <span className="cart-total-val" style={{ fontSize: compact ? '1rem' : undefined }}>
                {formatPriceVal(shipFee, currency)}
              </span>
            </div>
            <div className="cart-shipping-hint">
              {lang === 'en'
                ? `Add ${formatPriceVal(getAmountToFreeShipping(), currency)} more for free shipping (orders over ${getFreeShippingThresholdLabel()})`
                : `Añade ${formatPriceVal(getAmountToFreeShipping(), currency)} más para envío gratis (pedidos superiores a ${getFreeShippingThresholdLabel()})`}
            </div>
          </>
        )}

        <div className="cart-total-row cart-order-summary-total">
          <span className="cart-total-label" style={{ fontWeight: '800' }}>
            {lang === 'en' ? 'TOTAL DUE' : 'TOTAL A PAGAR'}
          </span>
          <span
            className="cart-total-val"
            style={{ color: theme === 'dark' ? '#4ade80' : '#15803d', fontWeight: '800' }}
          >
            {formatPriceVal(getFinalTotal(), currency)}
          </span>
        </div>
      </div>
    );
  };

  const renderPaymentTotalNotice = () => {
    const shipFee = getShippingFee();
    const finalTotal = getFinalTotal();

    return (
      <div className="payment-total-notice" aria-live="polite">
        <div>
          <span className="payment-total-notice-label">
            {lang === 'en' ? 'You will pay' : 'Usted pagará'}
          </span>
          <strong>{formatPriceVal(finalTotal, currency)}</strong>
        </div>
        <span className="payment-total-notice-detail">
          {shipFee > 0
            ? (lang === 'en'
              ? `Includes ${formatPriceVal(shipFee, currency)} shipping`
              : `Incluye ${formatPriceVal(shipFee, currency)} de envío`)
            : (lang === 'en' ? 'Shipping is free on this order' : 'El envío es gratis en este pedido')}
        </span>
      </div>
    );
  };

  const getShippingCostFields = (orderCurrency = currency, rate = exchangeRate, shippingValue = getShippingFee()) => {
    const shippingUsd = orderCurrency === 'USD'
      ? Number(shippingValue.toFixed(2))
      : Number((shippingValue / rate).toFixed(2));
    const shippingCrc = orderCurrency === 'CRC'
      ? Math.round(shippingValue)
      : Math.round(shippingValue * rate);

    return {
      shipping_cost_usd: shippingUsd,
      shipping_cost_crc: shippingCrc,
    };
  };

  return (
    <div id="app" className="catalog-page-shell min-h-screen" suppressHydrationWarning>
      <CatalogPromoBanner lang={lang} settings={landingSettings} forceActive mode="ticker" />
      {/* Utility controls stay in normal flow above the persistent brand row. */}
      <header className="header-top-section">
        <div className="header-top container">
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-main)', textDecoration: 'none', fontWeight: 'bold', marginRight: 'auto' }}>
            <ArrowLeft size={16} />
            {lang === 'en' ? 'Back' : 'Volver'}
          </Link>
          <div className="header-controls">
            <Link
              href="/account"
              className="admin-link"
              title={lang === 'en' ? 'My Account' : 'Mi Cuenta'}
            >
              <User size={11} /> {lang === 'en' ? 'MY ACCOUNT' : 'MI CUENTA'}
            </Link>
            <Link href="/admin" className="admin-link" title="Admin Dashboard">
              <Lock size={11} /> ADMIN
            </Link>
            <div className="theme-toggle">
              <button
                onClick={() => handleThemeToggle('light')}
                className={theme === 'light' ? 'active' : ''}
                title="Light Mode"
              >
                <Sun size={14} strokeWidth={2.5} />
              </button>
              <button
                onClick={() => handleThemeToggle('dark')}
                className={theme === 'dark' ? 'active' : ''}
                title="Dark Mode"
              >
                <Moon size={14} strokeWidth={2.5} />
              </button>
            </div>
            <div className="lang-selector">
              <button
                onClick={() => handleLangToggle('en')}
                className={lang === 'en' ? 'active' : ''}
              >
                ENG
              </button>
              <button
                onClick={() => handleLangToggle('es')}
                className={lang === 'es' ? 'active' : ''}
              >
                ES
              </button>
            </div>
            <div className="currency-selector">
              <button
                onClick={() => setCurrency('USD')}
                className={currency === 'USD' ? 'active' : ''}
              >
                USD
              </button>
              <button
                onClick={() => setCurrency('CRC')}
                className={currency === 'CRC' ? 'active' : ''}
              >
                CRC
              </button>
            </div>
          </div>
        </div>

      </header>

      <div className="catalog-brand-sticky">
        <div className="catalog-brand-row container">
          <Link href="/" className="logo logo--emblem">
            <img
              src="/logo.webp"
              alt="Peptides Costa Rica Logo"
              className="logo-emblem"
            />
          </Link>

          <button
            type="button"
            className={`catalog-header-cart ${cartAnimating ? 'cart-animating' : ''}`}
            onClick={() => setIsCartOpen(true)}
            aria-label={lang === 'en'
              ? `Open cart, ${cartItemCount} ${cartItemCount === 1 ? 'item' : 'items'}`
              : `Abrir carrito, ${cartItemCount} ${cartItemCount === 1 ? 'artículo' : 'artículos'}`}
          >
            <ShoppingBag size={24} strokeWidth={2.4} aria-hidden="true" />
            {cartItemCount > 0 && <span className="catalog-header-cart-badge">{cartItemCount}</span>}
          </button>
        </div>
      </div>

      <section className="catalog-proof-section">
        <div className="header-content container">
          <div className="header-proof-column">
            {/* Trust Seals */}
            <div className="trust-badges-container">
              <a href={links.googleReviewUrl || links.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="trust-badge google-maps">
                <svg viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <div className="trust-text">
                  <span className="trust-score">Google</span>
                  <span className="trust-desc">
                    5.0 <Star size={8} fill="#FBBC05" color="#FBBC05" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#FBBC05" color="#FBBC05" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#FBBC05" color="#FBBC05" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#FBBC05" color="#FBBC05" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#FBBC05" color="#FBBC05" style={{display: 'inline', margin: '0 1px'}}/>
                  </span>
                </div>
              </a>
              
              <a
                href={getTrustpilotReviewUrl(lang, links)}
                target="_blank"
                rel="noopener noreferrer"
                className="trust-badge"
                aria-label={`Trustpilot rating ${liveTrustpilotRating} out of 5`}
              >
                <div className="tp-star-box">
                  <Star size={10} fill="#fff" color="#fff" />
                </div>
                <div className="trust-text">
                  <span className="trust-score">Trustpilot</span>
                  <span className="trust-desc">
                    {liveTrustpilotRating} <Star size={8} fill="#00b67a" color="#00b67a" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#00b67a" color="#00b67a" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#00b67a" color="#00b67a" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#00b67a" color="#00b67a" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#00b67a" color="#00b67a" style={{display: 'inline', margin: '0 1px'}}/>
                  </span>
                </div>
              </a>

              <a href={getFacebookReviewUrl(links)} target="_blank" rel="noopener noreferrer" className="trust-badge">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="#1877F2" xmlns="http://www.w3.org/2000/svg">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                <div className="trust-text">
                  <span className="trust-score">Facebook</span>
                  <span className="trust-desc">
                    5.0 <Star size={8} fill="#1877F2" color="#1877F2" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#1877F2" color="#1877F2" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#1877F2" color="#1877F2" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#1877F2" color="#1877F2" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#1877F2" color="#1877F2" style={{display: 'inline', margin: '0 1px'}}/>
                  </span>
                </div>
              </a>
            </div>

            {/* Press feature band — outlets come from the CMS (site_settings.landing_page) */}
            <PressBand lang={lang} settings={landingSettings} variant="catalog" />
          </div>
        </div>
      </section>

      {/* Compact Sticky Bottom Controls Section */}
      <div className="header-sticky-section">
        <div className="search-bar container">
          <div className="search-row">
            <div className="search-input-wrapper" ref={searchRef}>
              <span className="search-icon"><Search size={18} /></span>
              <input 
                type="text" 
                id="searchInput" 
                placeholder={lang === 'en' ? "Search products..." : "Buscar productos..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
              />
              {searchFocused && (
                <>
                <div
                  className="search-overlay-backdrop"
                  onClick={closeSearch}
                  onTouchEnd={(e) => { e.preventDefault(); closeSearch(); }}
                  aria-hidden="true"
                />
                <div className="search-suggestions-dropdown" onClick={(e) => e.stopPropagation()}>
                  <div className="search-dropdown-header">
                    <span className="search-dropdown-title">
                      {lang === 'en' ? 'Search' : 'Buscar'}
                    </span>
                    <button
                      type="button"
                      className="search-close-btn"
                      onClick={closeSearch}
                      aria-label={lang === 'en' ? 'Close search' : 'Cerrar búsqueda'}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="suggestions-section">
                    <span className="section-title">
                      {lang === 'en' ? 'Popular Searches' : 'Búsquedas Populares'}
                    </span>
                    <div className="popular-tags">
                      {popularTerms.map((term, idx) => {
                        const label = lang === 'en' ? term.en : term.es;
                        return (
                          <button 
                            key={idx} 
                            type="button" 
                            className="popular-tag"
                            onClick={() => handlePopularTermClick(label)}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="suggestions-section">
                    <span className="section-title">
                      {searchQuery.trim() 
                        ? (lang === 'en' ? 'Products Matches' : 'Productos Coincidentes') 
                        : (lang === 'en' ? 'Suggested Peptides' : 'Péptidos Sugeridos')
                      }
                    </span>
                    <div className="suggested-products">
                      {getSearchSuggestions().length === 0 ? (
                        <div className="no-matches-msg">
                          {lang === 'en' ? 'No products found.' : 'No se encontraron productos.'}
                        </div>
                      ) : (
                        getSearchSuggestions().map((match, idx) => {
                          const formattedPrice = formatPriceVal(getPriceAsNumber(match, currency), currency);
                          const isBac = isBacWater(match.product);
                          const inStock = isBac || isInStock(match.status);
                          const cartItem = cart.find(item => item.product === match.product);

                          return (
                            <div 
                              key={idx} 
                              className="suggested-product-row"
                              onMouseDown={(e) => e.preventDefault()}
                              onTouchEnd={(e) => {
                                // e.preventDefault() prevents the ghost click, but we want to allow scrolling if they dragged.
                                // React handles scrolling vs tap reasonably well on onTouchEnd if not prevented, 
                                // but if we want to ensure it fires instead of getting swallowed:
                                handleProductClick(match);
                                closeSearch();
                              }}
                              onClick={() => {
                                handleProductClick(match);
                                closeSearch();
                              }}
                            >
                              <div className="suggested-product-img">
                                {match.imageUrl ? (
                                  <img src={match.imageUrl} alt={match.product} loading="lazy" decoding="async" />
                                ) : (
                                  getCategoryIcon(match.category, 20)
                                )}
                              </div>
                              <div className="suggested-product-info">
                                <span className="suggested-product-name">{match.product}</span>
                                <span className="suggested-product-cat">{translateCategory(match.category)}</span>
                              </div>
                              <div className="suggested-product-price">
                                {formattedPrice}
                              </div>
                              {inStock && (
                                <button
                                  type="button"
                                  className={`suggested-quick-add-btn ${cartItem ? 'added' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (cartItem) {
                                      setIsCartOpen(true);
                                    } else {
                                      addToCart(match);
                                    }
                                  }}
                                  title={cartItem ? (lang === 'en' ? 'In Cart' : 'En el Carrito') : (lang === 'en' ? 'Add' : 'Agregar')}
                                >
                                  {cartItem ? <Check size={14} /> : <Plus size={14} />}
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
                </>
              )}
            </div>
            <button onClick={handleViewToggle} className="filter-btn" title={viewMode === 'list' ? (lang === 'en' ? 'Grid View' : 'Vista Cuadrícula') : (lang === 'en' ? 'List View' : 'Vista Lista')}>
              {viewMode === 'list' ? <Grid size={18} /> : <List size={18} />}
            </button>
            <button 
              onClick={() => setShowFilters(!showFilters)} 
              className={`filter-btn ${showFilters ? 'active' : ''}`} 
              title={lang === 'en' ? 'Filters' : 'Filtros'}
            >
              <SlidersHorizontal size={18} />
            </button>
          </div>

          <div className={`filter-panel ${showFilters ? 'active' : ''}`}>
            <div className="filter-group">
              <label>{lang === 'en' ? 'Price Range' : 'Rango de Precio'}</label>
              <select value={priceFilter} onChange={(e) => setPriceFilter(e.target.value)}>
                <option value="all">{lang === 'en' ? 'Any Price' : 'Cualquier precio'}</option>
                <option value="low">{lang === 'en' ? 'Economic' : 'Económicos'}</option>
                <option value="mid">{lang === 'en' ? 'Mid-Range' : 'Gama Media'}</option>
                <option value="high">{lang === 'en' ? 'Premium' : 'Premium'}</option>
              </select>
            </div>
            <div className="filter-group">
              <label>{lang === 'en' ? 'Sort Order' : 'Ordenar Por'}</label>
              <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                <option value="pop">{lang === 'en' ? 'Most Popular' : 'Más populares'}</option>
                <option value="lowToHigh">{lang === 'en' ? 'Price: Low to High' : 'Precio: Bajo a Alto'}</option>
                <option value="highToLow">{lang === 'en' ? 'Price: High to Low' : 'Precio: Alto a Bajo'}</option>
              </select>
            </div>
            <div className="filter-group toggle-group">
              <label>{lang === 'en' ? 'In Stock Only' : 'Solo disponibles'}</label>
              <input 
                type="checkbox" 
                checked={inStockOnly} 
                onChange={(e) => setInStockOnly(e.target.checked)} 
              />
            </div>
          </div>
        </div>

        {reorderNotice ? (
          <div
            className="container"
            role="status"
            style={{
              margin: '10px auto',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-main)',
              fontSize: '0.88rem',
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{reorderNotice}</span>
            <button
              type="button"
              onClick={() => setReorderNotice('')}
              aria-label={lang === 'en' ? 'Dismiss' : 'Cerrar'}
              style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              <X size={16} />
            </button>
          </div>
        ) : null}

        <nav className="category-nav container">
          <button
            type="button"
            className="cat-scroll-arrow"
            onClick={() => scrollCategories(-1)}
            disabled={!catArrows.left}
            aria-label={lang === 'en' ? 'Scroll categories left' : 'Desplazar categorías a la izquierda'}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="category-scroll" ref={categoryScrollRef}>
            {categoriesList.map(cat => (
              <button
                key={cat}
                className={`cat-chip ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat === 'all'
                  ? (lang === 'en' ? 'All Products' : 'Todos los Productos')
                  : getCategoryChipLabel(cat)
                }
              </button>
            ))}
          </div>
          <button
            type="button"
            className="cat-scroll-arrow"
            onClick={() => scrollCategories(1)}
            disabled={!catArrows.right}
            aria-label={lang === 'en' ? 'Scroll categories right' : 'Desplazar categorías a la derecha'}
          >
            <ChevronRight size={18} />
          </button>
        </nav>
      </div>

      {/* Main Catalog View */}
      <main className="main container" style={{ position: 'relative', minHeight: '60vh' }}>
        <div className="catalog-seo-header">
          <h1 className="catalog-seo-title">
            {lang === 'en' ? 'Peptide Catalog Costa Rica' : 'Catálogo de Péptidos en Costa Rica'}
          </h1>
          <p className="catalog-seo-sub">
            {lang === 'en'
              ? 'Browse available peptides, prices, and real-time availability.'
              : 'Explora péptidos disponibles, precios y disponibilidad en tiempo real.'}
          </p>
          <button
            type="button"
            className="catalog-hero-promo"
            onClick={() => window.open('https://peptidescostarica.net', '_blank', 'noopener,noreferrer')}
            aria-label={lang === 'en' ? 'Open Peptides Costa Rica website' : 'Abrir sitio de Peptides Costa Rica'}
          >
            <img
              src="/catalog-promo-banner.webp"
              alt={lang === 'en' ? 'Peptides Costa Rica product vials' : 'Viales de Peptides Costa Rica'}
            />
          </button>
        </div>
        {gateLoading ? (
          <div className="loader">
            <div className="sync-spinner" style={{ marginBottom: '16px' }}></div>
            <div>{lang === 'en' ? 'Syncing catalog...' : 'Sincronizando catálogo...'}</div>
          </div>
        ) : !gateAccessGranted && gateVisible ? (
          <div
            className="access-gate-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={lang === 'en' ? 'Exclusive Catalog Access' : 'Acceso Exclusivo al Catálogo'}
            style={{
              position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh',
              background: theme === 'dark' ? 'rgba(5, 11, 24, 0.8)' : 'rgba(244, 246, 249, 0.8)',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '20px'
            }}
          >
            <div className="access-gate-card" style={{
              background: 'var(--bg-card)', padding: '0', borderRadius: '24px',
              boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)',
              maxWidth: '480px', width: '100%', textAlign: 'center', overflow: 'hidden',
              position: 'relative'
            }}>

              {gateCloseVisible && (
                <button
                  type="button"
                  onClick={dismissGate}
                  aria-label={lang === 'en' ? 'Close and browse without signing up' : 'Cerrar y ver el catálogo sin registrarme'}
                  title={lang === 'en' ? 'Continue without signing up' : 'Continuar sin registrarme'}
                  style={{
                    position: 'absolute', top: '12px', right: '12px', zIndex: 1,
                    width: '30px', height: '30px', borderRadius: '50%', border: 'none',
                    background: 'var(--bg-secondary)', color: 'var(--text-muted)',
                    fontSize: '20px', lineHeight: 1, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'fadeIn 0.3s ease',
                  }}
                >
                  &times;
                </button>
              )}

              <div style={{ padding: '24px 24px 32px 24px' }}>
              <img src="/logo.png" alt="Peptides Costa Rica Logo" style={{ height: '40px', margin: '0 auto 16px auto', display: 'block', borderRadius: '8px' }} />
              <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: 'var(--text-main)', marginBottom: '8px' }}>
                {lang === 'en' ? 'Exclusive Catalog Access' : 'Acceso Exclusivo al Catálogo'}
              </h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.5 }}>
                {lang === 'en' 
                  ? 'Add your real WhatsApp number or email to view our premium catalog.' 
                  : 'Agrega tu número de WhatsApp o correo electrónico real para ver nuestro catálogo premium.'}
              </p>
              <form onSubmit={handleGateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input 
                  type="text" 
                  placeholder={lang === 'en' ? 'WhatsApp (e.g. +1... or +506...) or Email' : 'WhatsApp (ej. +506... o +1...) o Correo'}
                  value={gateInput}
                  onChange={(e) => setGateInput(e.target.value)}
                  style={{ 
                    width: '100%', padding: '14px', borderRadius: '12px', 
                    border: '1px solid var(--border)', background: 'var(--bg-secondary)', 
                    color: 'var(--text-main)', fontSize: '1rem', outline: 'none'
                  }}
                  required
                />
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '-4px', textAlign: 'left', paddingLeft: '4px', lineHeight: 1.4 }}>
                  {lang === 'en' 
                    ? 'Tip: Use + and your country code (e.g., +1 for US, +506 for CR) to ensure you receive the WhatsApp promo code.' 
                    : 'Nota: Usa + y tu código de país (ej. +506 para CR, +1 para US) para asegurar que recibas el código en WhatsApp.'}
                </div>
                {gateError && <div style={{ color: '#ef4444', fontSize: '0.8rem', fontWeight: 'bold' }}>{gateError}</div>}
                <label style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  fontSize: '0.85rem', color: 'var(--text-main)', textAlign: 'left',
                  cursor: 'pointer', lineHeight: 1.45,
                  background: 'rgba(37, 211, 102, 0.08)',
                  border: `1px solid ${gateConsent ? 'rgba(37,211,102,0.6)' : 'rgba(37,211,102,0.25)'}`,
                  borderRadius: '12px', padding: '12px 14px', transition: 'border-color 0.2s',
                }}>
                  <input
                    type="checkbox"
                    checked={gateConsent}
                    onChange={(e) => setGateConsent(e.target.checked)}
                    style={{ marginTop: '2px', flexShrink: 0, width: '18px', height: '18px', accentColor: '#25D366' }}
                  />
                  <span>
                    <span style={{ fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                      {lang === 'en'
                        ? 'Send me promotions, sales, and new-stock alerts'
                        : 'Envíenme promociones, ofertas y avisos de nuevo stock'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {lang === 'en'
                        ? 'By checking this box, you consent to receive marketing updates by WhatsApp or email from Peptides Costa Rica. Reply STOP or unsubscribe anytime.'
                        : 'Al marcar esta casilla, acepta recibir novedades de marketing por WhatsApp o correo de Peptides Costa Rica. Responda BAJA o cancele la suscripción cuando quiera.'}
                    </span>
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={gateSubmitting}
                  className="whatsapp-btn"
                  style={{ padding: '14px', fontSize: '1rem', border: 'none', borderRadius: '12px', marginTop: '8px' }}
                >
                  {gateSubmitting ? (
                    <div className="sync-spinner" style={{ width: '18px', height: '18px' }}></div>
                  ) : (
                    lang === 'en' ? 'Unlock Catalog' : 'Desbloquear Catálogo'
                  )}
                </button>

              </form>
              </div>
            </div>
          </div>
        ) : null}

        {!gateLoading && (
          <div
            aria-hidden={!gateAccessGranted && gateVisible}
            style={{
              opacity: 1,
              pointerEvents: !gateAccessGranted && gateVisible ? 'none' : 'auto',
              filter: !gateAccessGranted && gateVisible ? 'blur(8px)' : 'none',
              transition: 'filter 0.3s',
            }}
          >
          {loading ? (
          <div className="loader">
            <div className="sync-spinner" style={{ marginBottom: '16px' }}></div>
            <div>{lang === 'en' ? 'Syncing catalog...' : 'Sincronizando catálogo...'}</div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="loader">
            {lang === 'en' ? 'No products matching filters.' : 'No se encontraron productos.'}
          </div>
        ) : (
          <>
          <div className={`product-grid ${viewMode}-view`}>
            {filteredProducts.map((p, idx) => {
              const isBac = isBacWater(p.product);
              const isTenMlBac = isBac && getBacWaterSizeMl(p.product) === 10;
              const inStock = isBac || isInStock(p.status);
              const comingSoon = isComingSoon(p.status) && !isBac;
              const cardClass = inStock ? 'product-card' : 'product-card card-out-of-stock';
              
              const pMain = getPriceLabel(p, currency);
              const pSub = currency === 'USD' ? getPriceLabel(p, 'CRC') : getPriceLabel(p, 'USD');

              // Promo-driven sale pricing: when an advertised (badged) promo
              // targets this product and there is no genuine product-level
              // markdown, the card shows the shelf price struck through and
              // the after-code price as the main price — the ribbon already
              // names the code that unlocks it.
              const cardOriginalUsd = parsePrice(p.originalPriceUsd);
              const cardPriceUsd = parsePrice(p.priceUsd);
              const hasRealMarkdown = cardOriginalUsd > 0 && cardPriceUsd > 0 && cardOriginalUsd > cardPriceUsd;
              const promoSale = !isBac && inStock && !hasRealMarkdown
                ? getPromoBadgeForProduct(promoBadges, p.product, lang)
                : null;
              const promoPct = promoSale && promoSale.discountPct > 0 ? promoSale.discountPct : 0;
              const promoPriceLabel = (cur) => {
                const value = getPriceAsNumber(p, cur) * (1 - promoPct / 100);
                return formatPriceVal(cur === 'USD' ? (Number.isInteger(value) ? value : Number(value.toFixed(2))) : Math.round(value), cur);
              };

              return (
                <div 
                  key={idx} 
                  className={cardClass}
                  onClick={() => handleProductClick(p)}
                >
                  <div className="product-image">
                    {p.imageUrl ? (
                      // Only the first row is worth fetching up front. The rest
                      // load as they are scrolled to: the full grid is ~8.8MB of
                      // Supabase egress and most visitors never reach the bottom.
                      <img
                        src={p.imageUrl}
                        alt={p.product}
                        loading={idx < 4 ? 'eager' : 'lazy'}
                        decoding="async"
                      />
                    ) : getCategoryIcon(p.category)}
                    {!inStock && !comingSoon && (
                      <div className="out-of-stock-overlay">
                        <span>{lang === 'en' ? 'OUT OF STOCK' : 'AGOTADO'}</span>
                      </div>
                    )}
                    {inStock && p.inventoryCount !== null && p.inventoryCount <= (p.lowStockThreshold || 5) && p.inventoryCount > 0 && (
                      <div style={{ position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', background: '#ef4444', color: '#fff', padding: '4px 12px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: '800', boxShadow: '0 4px 10px rgba(239, 68, 68, 0.4)', zIndex: 3, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {lang === 'en' ? `🔥 Only ${p.inventoryCount} left!` : `🔥 ¡Solo quedan ${p.inventoryCount}!`}
                      </div>
                    )}
                    {inStock && (() => {
                      // A product-level sale wins: its price has genuinely dropped,
                      // so reporting the gap is accurate. A promo ribbon only
                      // applies when there is no real markdown to show.
                      let text = null;
                      if (p.originalPriceUsd && p.originalPriceUsd !== p.priceUsd) {
                        const original = typeof p.originalPriceUsd === 'string' ? parseFloat(p.originalPriceUsd.replace(/[^0-9.]/g, '')) : p.originalPriceUsd;
                        const current = typeof p.priceUsd === 'string' ? parseFloat(p.priceUsd.replace(/[^0-9.]/g, '')) : p.priceUsd;
                        // Only a genuine markdown earns the product ribbon. An
                        // original equal to (or below) the price - e.g. both set
                        // to 150 by mistake - used to fall back to a bare
                        // "Oferta" that meant nothing; now it falls through to
                        // any promo ribbon instead.
                        if (original && current && original > current) {
                          text = lang === 'en' ? `Save ${Math.round((1 - (current / original)) * 100)}%` : `Ahorra ${Math.round((1 - (current / original)) * 100)}%`;
                        }
                      }
                      if (!text) {
                        text = getPromoBadgeForProduct(promoBadges, p.product, lang)?.text || null;
                      }
                      if (!text) return null;

                      // The label is SVG scaled uniformly to the ribbon: the
                      // viewBox is sized to the text, and the height cap stops
                      // short labels from scaling up. Long text shrinks to fit,
                      // short text stays natural - it can never stretch wide.
                      const label = text.toUpperCase();
                      const vbWidth = Math.max(56, Math.round(label.length * 7.4) + 8);
                      return (
                        <div className="sale-badge">
                          <span aria-label={text}>
                            <svg viewBox={`0 0 ${vbWidth} 14`} preserveAspectRatio="xMidYMid meet" aria-hidden="true"
                                 style={{ display: 'block', width: '100%', height: '0.8rem', margin: '0 auto' }}>
                              <text x={vbWidth / 2} y="11" textAnchor="middle"
                                    style={{ fill: '#ffffff', fontSize: '11px', fontWeight: 800, letterSpacing: '0.3px' }}>
                                {label}
                              </text>
                            </svg>
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="product-info">
                    <div className="product-category">{translateCategory(p.category)}</div>
                    <h3 className="product-name">{p.product}</h3>
                    <div className="product-rating-slot">
                      {renderRatingSummary(p.product)}
                    </div>
                    <div className="product-pricing">
                      {isBac ? (
                        // Both sizes are priced per vial; only the minimum differs.
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                          <span className="price-main">{pMain}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '700' }}>
                            {lang === 'en' ? 'each' : 'c/u'}
                          </span>
                        </div>
                      ) : p.originalPriceUsd && p.originalPriceUsd !== p.priceUsd ? (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                          <span className="price-main" style={{ color: '#ef4444' }}>{pMain}</span>
                          <span style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: '0.8rem', fontWeight: '500' }}>
                            {getOriginalPriceLabel(p, currency)}
                          </span>
                        </div>
                      ) : promoPct > 0 ? (
                        // Identical styling to the product-level markdown
                        // branch above, so promo sales and Products-tab sales
                        // look the same on the shelf.
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                          <span className="price-main" style={{ color: '#ef4444' }}>{promoPriceLabel(currency)}</span>
                          <span style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: '0.8rem', fontWeight: '500' }}>
                            {pMain}
                          </span>
                        </div>
                      ) : (
                        <span className="price-main">{pMain}</span>
                      )}
                      {/* The BAC notes are sentences, not prices — flexBasis puts them
                          on their own full-width line under the price instead of
                          letting them fight the price for the card's width. */}
                      {isTenMlBac
                        ? <span className="price-sub" style={{ color: '#0284c7', fontWeight: '700', flexBasis: '100%' }}>
                            {lang === 'en'
                              ? `Water-only: ${BAC_WATER_10ML_ONLY_MIN_UNITS} vial minimum`
                              : `Solo agua: mínimo ${BAC_WATER_10ML_ONLY_MIN_UNITS} viales`}
                          </span>
                        : isBac
                        ? <span className="price-sub" style={{ color: '#16a34a', flexBasis: '100%' }}>{lang === 'en' ? '1 free with every peptide' : '1 gratis con cada péptido'}</span>
                        : pSub && <span className="price-sub">{promoPct > 0 ? promoPriceLabel(currency === 'USD' ? 'CRC' : 'USD') : pSub}</span>}
                    </div>
                    <div className="stock-badges-slot" style={{ display: 'flex', gap: '8px', justifyContent: viewMode === 'grid' ? 'center' : 'flex-start', marginBottom: '8px' }}>
                      <div className={`stock-badge ${isBac ? 'stock-in' : inStock ? 'stock-in' : comingSoon ? 'stock-soon' : 'stock-out'}`} style={{ position: 'relative', top: 'auto', right: 'auto', margin: 0, height: 'fit-content' }}>
                        <span>
                          {translateStatus(p.status)}
                        </span>
                      </div>
                      {inStock && stockUnitsLabel(p) && (
                        <div className="stock-units-badge">
                          <span>{stockUnitsLabel(p)}</span>
                        </div>
                      )}
                    </div>
                    <div className="product-actions">
                      {inStock ? (
                        // The card always shows the Add button; quantity is
                        // adjusted inside the cart only. addToCart already
                        // increments (and enforces stock) when the item is
                        // in the cart, so repeat clicks just add one more.
                        <button
                          className={`add-to-cart-btn ${addedProductId === p.product ? 'added' : ''}`}
                          onClick={(e) => addToCartWithAnimation(e, p)}
                        >
                          {addedProductId === p.product
                            ? <Check size={16} />
                            : <Plus size={16} />
                          }
                          <span>
                            {addedProductId === p.product
                              ? (lang === 'en' ? 'Added' : 'Añadido')
                              : (lang === 'en' ? 'Add To Cart' : 'Agregar')
                            }
                          </span>
                        </button>
                      ) : (
                        <button className="add-to-cart-btn out-of-stock-btn" disabled>
                          <span>{lang === 'en' ? 'Out of Stock' : 'Agotado'}</span>
                        </button>
                      )}
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
        </div>
      )}
      </main>

      {/* Customer Transformation Footer Banner */}
      {gateAccessGranted && (
        <section style={{
          background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border)',
          padding: '64px 20px'
        }}>
          <div className="container" style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <span style={{
                display: 'inline-block',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: 'white',
                fontSize: '0.75rem',
                fontWeight: '800',
                padding: '5px 14px',
                borderRadius: '24px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '14px',
                boxShadow: '0 2px 10px rgba(34,197,94,0.25)'
              }}>
                {lang === 'en' ? '✓ Verified Results' : '✓ Resultados Verificados'}
              </span>
              <h2 style={{
                fontSize: '1.7rem',
                fontWeight: '900',
                color: 'var(--text-main)',
                margin: '0 0 10px 0',
                lineHeight: '1.25'
              }}>
                {lang === 'en' ? 'Customer Experience Highlights' : 'Experiencias de Clientes'}
              </h2>
              <p style={{
                fontSize: '0.92rem',
                color: 'var(--text-muted)',
                lineHeight: '1.6',
                maxWidth: '560px',
                margin: '0 auto'
              }}>
                {lang === 'en'
                  ? 'Feedback shared by our research community in Costa Rica.'
                  : 'Comentarios compartidos por nuestra comunidad de investigación en Costa Rica.'}
              </p>
            </div>

            <div style={{ borderRadius: '20px', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.12)', position: 'relative' }}>
              <img
                src="/customer_transformation.png"
                alt={lang === 'en' ? 'Customer experience with Peptides Costa Rica' : 'Experiencias de clientes con Péptidos Costa Rica'}
                style={{ width: '100%', display: 'block', height: 'auto', maxHeight: '440px', objectFit: 'cover', objectPosition: 'center top' }}
                onError={(e) => { e.target.parentElement.parentElement.parentElement.style.display = 'none'; }}
              />
              <div style={{
                position: 'absolute', top: '16px', left: '16px',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: '#fff', fontSize: '0.78rem', fontWeight: '800',
                padding: '6px 16px', borderRadius: '24px',
                letterSpacing: '0.04em', textTransform: 'uppercase',
                boxShadow: '0 4px 14px rgba(34,197,94,0.4)'
              }}>
                {lang === 'en' ? '✓ Verified Results' : '✓ Resultados Verificados'}
              </div>
            </div>

            <p style={{
              marginTop: '20px',
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              lineHeight: '1.6',
              textAlign: 'center',
              fontStyle: 'italic'
            }}>
              {lang === 'en'
                ? 'Results may vary. Products are intended strictly for research use only and are not intended to diagnose, treat, cure, or prevent any disease.'
                : 'Los resultados pueden variar. Los productos son estrictamente para uso de investigación y no están destinados a diagnosticar, tratar o prevenir enfermedades.'}
            </p>
          </div>
        </section>
      )}


      {/* One bottom action at a time: WhatsApp for an empty cart, checkout once
          the customer adds an item. Both reserve page space and never cover copy. */}
      <style>{`
        @keyframes cart-badge-pop {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.3); opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }

        .cart-container-wrapper {
          position: fixed;
          z-index: 900;
          pointer-events: none;
          bottom: 0;
          left: 0;
          width: 100%;
          padding: 16px;
          padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
          display: flex;
          justify-content: center;
          background: linear-gradient(to top, var(--bg-main) 52%, transparent);
        }

        .cart-fab-sticky,
        .catalog-whatsapp-sticky {
          pointer-events: all;
          color: #fff;
          border: none;
          border-radius: 14px;
          padding: 16px 20px;
          font-size: 1.05rem;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 8px 30px rgba(34,197,94,0.4);
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          max-width: 560px;
          transition: transform 0.2s cubic-bezier(.34,1.56,.64,1), box-shadow 0.2s;
        }

        .cart-fab-sticky {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          box-shadow: 0 8px 30px rgba(34,197,94,0.4);
        }

        .catalog-whatsapp-sticky {
          justify-content: center;
          gap: 12px;
          background: linear-gradient(135deg, #f36a00, #d95300);
          box-shadow: 0 8px 30px rgba(217,83,0,0.34);
        }

        .catalog-whatsapp-sticky-icon {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #20c76a;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
        }

        .cart-fab-sticky:active,
        .catalog-whatsapp-sticky:active { transform: scale(0.97); }

        @media (min-width: 900px) {
          .cart-container-wrapper {
            bottom: 24px;
            padding-bottom: 0;
          }
        }
      `}</style>

      <div className={`cart-container-wrapper ${cart.length > 0 ? 'has-items' : ''}`}>
        {!isCartOpen && (
          cart.length > 0 ? (
            <button
              id="floating-checkout-btn"
              className="cart-fab-sticky"
              onClick={() => setIsCartOpen(true)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShoppingBag size={20} />
                <span>
                  {cartItemCount} {lang === 'en' ? (cartItemCount === 1 ? 'item' : 'items') : (cartItemCount === 1 ? 'artículo' : 'artículos')}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.85rem', opacity: 0.9, fontWeight: 600 }}>{lang === 'en' ? 'View Cart' : 'Ver Carrito'}</span>
                  <span>{formatPriceVal(getFinalTotal(), currency)}</span>
                </div>
                {!qualifiesForFreeShipping() && (
                  <span style={{ fontSize: '0.68rem', opacity: 0.85, fontWeight: 600 }}>
                    {lang === 'en'
                      ? `incl. ${formatPriceVal(getShippingFee(), currency)} shipping`
                      : `incl. ${formatPriceVal(getShippingFee(), currency)} de envío`}
                  </span>
                )}
              </div>
            </button>
          ) : (
            <button
              id="catalog-whatsapp-btn"
              className="catalog-whatsapp-sticky"
              onClick={openCatalogWhatsApp}
            >
              <span className="catalog-whatsapp-sticky-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
                  <path d="M9.4 8.3c.3 2.4 1.9 4 4.3 4.3" />
                </svg>
              </span>
              <span>{lang === 'en' ? 'Order on WhatsApp' : 'Ordenar por WhatsApp'}</span>
            </button>
          )
        )}
      </div>

      {/* Cart Drawer Overlay */}
      <div 
        className={`cart-drawer-overlay ${isCartOpen ? 'active' : ''}`}
        onClick={() => setIsCartOpen(false)}
      ></div>

      {/* Cart Drawer */}
      <div className={`cart-drawer ${isCartOpen ? 'active' : ''}`}>
        <div className="cart-header">
          <h2>{lang === 'en' ? 'Shopping Cart' : 'Carrito de Compras'}</h2>
          <button className="cart-close-btn" onClick={() => setIsCartOpen(false)}>
            <X size={24} />
          </button>
        </div>

        <div className="cart-body">
          <div className="cart-items-container">
          {orderSuccess ? (
            <div style={{ textAlign: 'center', padding: '40px 10px', color: '#4ade80' }}>
              <Check size={48} style={{ margin: '0 auto 16px auto', display: 'block' }} />
              <h3 style={{ fontWeight: 800, marginBottom: '8px' }}>
                {lang === 'en' ? 'Order Logged!' : '¡Orden Registrada!'}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {lang === 'en' 
                  ? 'We have recorded your order and opened WhatsApp for final delivery coordination.'
                  : 'Hemos registrado su orden y abierto WhatsApp para coordinar los detalles de entrega.'}
              </p>
            </div>
          ) : cart.length === 0 ? (
            <div className="cart-empty-msg">
              <ShoppingBag size={32} style={{ margin: '0 auto 16px auto', opacity: 0.3, display: 'block' }} />
              {lang === 'en' ? 'Your cart is empty.' : 'Su carrito está vacío.'}
            </div>
          ) : (
            cart.map(item => (
              <div key={item.product} className="cart-item">
                <div className="cart-item-img">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.product} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : getCategoryIcon(item.category, 22)}
                </div>
                <div className="cart-item-details">
                  <h4 className="cart-item-name">{item.product}</h4>
                  <div className="cart-item-price">
                    {formatPriceVal(getPriceAsNumber(item, currency) * item.qty, currency)}
                  </div>
                  <div className="cart-item-qty">
                    <button className="cart-qty-btn" onClick={() => updateCartQty(item.product, -1)}><Minus size={12} /></button>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{item.qty}</span>
                    <button className="cart-qty-btn" onClick={() => updateCartQty(item.product, 1)}><Plus size={12} /></button>
                  </div>
                  {stockNotice?.product === item.product && (
                    <p id="field-stock" role="alert" tabIndex={-1} className="cart-item-stock-note">
                      {lang === 'en'
                        ? `Only ${stockNotice.available} left in stock — that is all we can send you right now.`
                        : `Solo quedan ${stockNotice.available} en inventario — es todo lo que podemos enviarle por ahora.`}
                    </p>
                  )}
                </div>
                <button className="cart-item-remove" onClick={() => removeFromCart(item.product)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Suggestions Section */}
        {cart.length > 0 && getSuggestions().length > 0 && !orderSuccess && (
          <div className="cart-suggestions">
            <div className="cart-suggestions-head">
              <h4 className="cart-suggestions-title">
                {lang === 'en' ? '✨ You might also like' : '✨ También te puede interesar'}
              </h4>
              {(sugArrows.left || sugArrows.right) && (
                <div className="cart-suggestions-nav">
                  <button
                    type="button"
                    className="sug-scroll-arrow"
                    onClick={() => scrollSuggestions(-1)}
                    disabled={!sugArrows.left}
                    aria-label={lang === 'en' ? 'Scroll suggestions left' : 'Desplazar sugerencias a la izquierda'}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    type="button"
                    className="sug-scroll-arrow"
                    onClick={() => scrollSuggestions(1)}
                    disabled={!sugArrows.right}
                    aria-label={lang === 'en' ? 'Scroll suggestions right' : 'Desplazar sugerencias a la derecha'}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              )}
            </div>
            <div className="cart-suggestions-scroll" ref={suggestionsScrollRef}>
              {getSuggestions().map((sug, idx) => (
                <div key={idx} className="suggestion-card" onClick={() => {
                  addToCart(sug);
                }}>
                  <div className="suggestion-icon">
                    {sug.imageUrl ? (
                      <img src={sug.imageUrl} alt={sug.product} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
                    ) : getCategoryIcon(sug.category, 20)}
                  </div>
                  <div className="suggestion-info">
                    <span className="suggestion-name">{sug.product}</span>
                    <span className="suggestion-price">{getPriceLabel(sug, currency)}</span>
                  </div>
                  <button className="suggestion-add-btn" title={lang === 'en' ? 'Add To Cart' : 'Añadir'}>
                    <Plus size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {cart.length > 0 && !orderSuccess && (
          <div className="cart-footer">
            {/* Volume discount banner */}
            {getEffectiveVolumePct() > 0 && (
              <div style={{ background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(16, 185, 129, 0.1))', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '12px', padding: '10px 14px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.1rem' }}>🏷️</span>
                  <div>
                    <div style={{ color: theme === 'dark' ? '#4ade80' : '#15803d', fontWeight: '700', fontSize: '0.8rem' }}>
                      {lang === 'en'
                        ? `Volume Discount: ${getEffectiveVolumePct()}% OFF`
                        : `Desc. por Volumen: ${getEffectiveVolumePct()}% DESC.`}
                    </div>
                    <div style={{ color: theme === 'dark' ? '#86efac' : '#166534', fontSize: '0.7rem', marginTop: '2px' }}>
                      {lang === 'en'
                        ? `${getCartVialCount()} vials in cart`
                        : `${getCartVialCount()} viales en carrito`}
                    </div>
                  </div>
                </div>
                <span style={{ color: theme === 'dark' ? '#4ade80' : '#15803d', fontWeight: '700', fontSize: '0.85rem' }}>-{formatPriceVal(getCartTotal() - getDiscountedTotal(), currency)}</span>
              </div>
            )}

            {/* Next tier hint.
                Hidden while a code that REPLACES the volume discount is applied
                — promising "add 5 more for 35% off" is a promise the cart then
                refuses to keep, because effectiveVolumeDiscountPct has already
                zeroed that tier in favour of the code. */}
            {!volumeTierHintSuppressed && getCartVialCount() >= 1 && getCartVialCount() < 5 && (
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 12px', marginBottom: '8px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: '700' }}>
                {lang === 'en'
                  ? `🔥 Add ${5 - getCartVialCount()} more vial${5 - getCartVialCount() > 1 ? 's' : ''} for 15% OFF!`
                  : `🔥 ¡Añade ${5 - getCartVialCount()} vial${5 - getCartVialCount() > 1 ? 'es' : ''} más para 15% DESC.!`}
              </div>
            )}
            {!volumeTierHintSuppressed && getCartVialCount() >= 5 && getCartVialCount() < 10 && (
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 12px', marginBottom: '8px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: '700' }}>
                {lang === 'en'
                  ? `🔥 Add ${10 - getCartVialCount()} more vial${10 - getCartVialCount() > 1 ? 's' : ''} to unlock ${tenPlusDiscountPct()}% OFF!`
                  : `🔥 ¡Añade ${10 - getCartVialCount()} vial${10 - getCartVialCount() > 1 ? 'es' : ''} más para desbloquear ${tenPlusDiscountPct()}% DESC.!`}
              </div>
            )}

            {/* BAC water breakdown — the free gift always shows so the customer
                sees it even when they add no paid water; billed extras follow. */}
            {(getBacSummary().freeUnits > 0 || getBacSummary().bacUnits > 0) && (
              <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '10px', padding: '8px 12px', marginBottom: '8px', fontSize: '0.75rem', color: theme === 'dark' ? '#7dd3fc' : '#0369a1', fontWeight: '600' }}>
                {getBacSummary().freeUnits > 0 && (
                  <div style={bacBreakdownRowStyle}>
                    <span style={bacBreakdownLabelStyle}>🎁 {lang === 'en'
                      ? `Free bacteriostatic water: ${getBacSummary().freeLines.map((l) => `${l.qty} × ${l.sizeMl}ml`).join(' + ')}`
                      : `Agua bacteriostática gratis: ${getBacSummary().freeLines.map((l) => `${l.qty} × ${l.sizeMl}ml`).join(' + ')}`}</span>
                    <span style={{ ...bacBreakdownAmountStyle, color: theme === 'dark' ? '#4ade80' : '#15803d', fontWeight: 800 }}>{lang === 'en' ? 'FREE' : 'GRATIS'}</span>
                  </div>
                )}
                {getBacSummary().paidLines.map((line, index) => (
                  <div
                    key={`${line.product}-${index}`}
                    style={{ ...bacBreakdownRowStyle, marginTop: getBacSummary().freeUnits > 0 || index > 0 ? '4px' : 0 }}
                  >
                    <span style={bacBreakdownLabelStyle}>
                      {`${line.qty} × ${line.product}`}
                      <span style={{ opacity: 0.8, whiteSpace: 'nowrap' }}>
                        {` (${formatPriceVal(line.unitPrice, currency)} ${lang === 'en' ? 'ea' : 'c/u'})`}
                      </span>
                    </span>
                    <span style={bacBreakdownAmountStyle}>{formatPriceVal(line.charge, currency)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Water-only orders have a floor */}
            {checkBacOnlyMinimum(cart).blocked && (
              <div
                id="field-bacMinimum"
                role="alert"
                tabIndex={-1}
                style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '8px 12px', marginBottom: '8px', textAlign: 'center', fontSize: '0.75rem', color: '#f87171', fontWeight: '700', outline: 'none' }}
              >
                {bacOnlyMinimumMessage(cart, lang)}
              </div>
            )}

            {/* Promo Code UI */}
            <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <CheckoutLabel htmlFor="field-promoCode">
                {lang === 'en' ? 'Promo code' : 'Código promocional'}
              </CheckoutLabel>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="field-promoCode"
                  type="text"
                  className="checkout-input"
                  autoComplete="off"
                  placeholder="WELCOME10"
                  value={promoCodeInput}
                  onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                  style={{ flex: 1, textTransform: 'uppercase', marginBottom: 0 }}
                  disabled={promoData?.valid}
                />
                {!promoData?.valid ? (
                  <button
                    type="button"
                    onClick={() => handleApplyPromo()}
                    disabled={promoLoading || !promoCodeInput}
                    style={{
                      background: promoCodeInput && !promoLoading ? '#38bdf8' : '#334155',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '0 16px',
                      fontWeight: '600',
                      cursor: promoCodeInput && !promoLoading ? 'pointer' : 'not-allowed',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {promoLoading ? (
                      <div className="sync-spinner" style={{ width: '16px', height: '16px' }}></div>
                    ) : (lang === 'en' ? 'Apply' : 'Aplicar')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setPromoData(null); setPromoCodeInput(''); }}
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: '12px',
                      padding: '0 16px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    {lang === 'en' ? 'Remove' : 'Quitar'}
                  </button>
                )}
              </div>
              {promoError && (
                <div style={{ color: '#ef4444', fontSize: '0.8rem', paddingLeft: '4px' }}>{promoError}</div>
              )}
              {promoData?.valid && (
                <div style={{ color: '#4ade80', fontSize: '0.8rem', paddingLeft: '4px', fontWeight: '600' }}>
                  {lang === 'en' ? `Code applied: ${promoData.discount_pct * 100}% off` : `Código aplicado: ${promoData.discount_pct * 100}% de descuento`}
                </div>
              )}
            </div>

            {/* noValidate is deliberate: native constraint validation runs before
                the submit event, so without it the browser's own bubble preempts
                validateForm() and none of the inline field errors ever render. */}
            <form id="checkout-form-main" noValidate onSubmit={handleCheckoutSubmit} className="checkout-form" style={{ paddingBottom: '80px' }}>
              
              <div className="checkout-step-header">
                <span className="checkout-step-number">1</span>
                <h3>{lang === 'en' ? 'Contact & Shipping' : 'Contacto y Envío'}</h3>
              </div>
              <div>
                <CheckoutLabel htmlFor="field-customerName" required>
                  {lang === 'en' ? 'Full name' : 'Nombre completo'}
                </CheckoutLabel>
                {/* Spacing is tidied on blur, never while typing: a field
                    that reacts to the first letter is the mistake the phone
                    input below already documents. */}
                <input
                  id="field-customerName"
                  type="text"
                  className="checkout-input"
                  autoComplete="name"
                  placeholder={lang === 'en' ? 'e.g. Ana Rodríguez' : 'ej. Ana Rodríguez'}
                  required
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    if (formErrors.customerName) setFormErrors(prev => ({ ...prev, customerName: null }));
                  }}
                  onBlur={(e) => setCustomerName(normalizeCustomerName(e.target.value))}
                  {...invalidProps('customerName', formErrors)}
                />
                <FieldError name="customerName" message={formErrors.customerName} />
              </div>

              <div>
                <CheckoutLabel htmlFor="field-customerEmail" required>
                  {lang === 'en' ? 'Email address' : 'Correo electrónico'}
                </CheckoutLabel>
                <input
                  id="field-customerEmail"
                  type="email"
                  className="checkout-input"
                  autoComplete="email"
                  inputMode="email"
                  placeholder={lang === 'en' ? 'e.g. ana@correo.com' : 'ej. ana@correo.com'}
                  required
                  value={customerEmail}
                  onChange={(e) => {
                    setCustomerEmail(e.target.value);
                    if (formErrors.customerEmail) setFormErrors(prev => ({ ...prev, customerEmail: null }));
                  }}
                  {...invalidProps('customerEmail', formErrors)}
                />
                <FieldError name="customerEmail" message={formErrors.customerEmail} />
              </div>
              <div>
                <div className="checkout-phone-row">
                  <div>
                    <CheckoutLabel htmlFor="field-customerPhoneCountry">
                      {lang === 'en' ? 'Country code' : 'Código de país'}
                    </CheckoutLabel>
                    <select
                      id="field-customerPhoneCountry"
                      className="checkout-input checkout-phone-country"
                      autoComplete="tel-country-code"
                      value={customerPhoneCountry}
                      onChange={(e) => setCustomerPhoneCountry(e.target.value)}
                      style={{ appearance: 'auto' }}
                    >
                      {PHONE_COUNTRIES.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.flag} +{country.dial} {country.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* Deliberately not driven by phoneLooksValid: that turned the
                      field red on the first digit typed, before anyone had a
                      chance to finish. It goes red on submit and clears on the
                      next keystroke. */}
                  <div>
                    <CheckoutLabel htmlFor="field-customerPhone" required>
                      {lang === 'en' ? 'WhatsApp number' : 'Número de WhatsApp'}
                    </CheckoutLabel>
                    <input
                      id="field-customerPhone"
                      type="tel"
                      className="checkout-input checkout-phone-number"
                      autoComplete="tel-national"
                      inputMode="tel"
                      placeholder={lang === 'en' ? 'e.g. 8404 6973' : 'ej. 8404 6973'}
                      required
                      value={customerPhoneNational}
                      onChange={(e) => {
                        setCustomerPhoneNational(e.target.value);
                        if (formErrors.customerPhone) setFormErrors(prev => ({ ...prev, customerPhone: null }));
                      }}
                      {...invalidProps('customerPhone', formErrors)}
                    />
                  </div>
                </div>
                <FieldError name="customerPhone" message={formErrors.customerPhone} />
              </div>

              <div className="checkout-id-grid">
                <div>
                  <CheckoutLabel htmlFor="field-customerIdType">
                    {lang === 'en' ? 'ID type' : 'Tipo de identificación'}
                  </CheckoutLabel>
                  <select
                    id="field-customerIdType"
                    className="checkout-input"
                    /* No standard autofill token covers a CR document type, and
                       leaving it unset lets Chrome guess it is a country field. */
                    autoComplete="off"
                    value={customerIdType}
                    onChange={(e) => setCustomerIdType(e.target.value)}
                    style={{ appearance: 'auto', width: '100%' }}
                  >
                    <option value="1">{lang === 'en' ? 'National ID' : 'Cédula física'}</option>
                    <option value="6">DIMEX</option>
                    <option value="5">{lang === 'en' ? 'Passport' : 'Pasaporte'}</option>
                    <option value="2">{lang === 'en' ? 'Corporate ID' : 'Cédula jurídica'}</option>
                  </select>
                </div>
                <div>
                  <CheckoutLabel htmlFor="field-customerIdNumber" required>
                    {lang === 'en' ? 'ID number' : 'Número de identificación'}
                  </CheckoutLabel>
                  {/* Passports are alphanumeric; every other CR document type is
                      digits only, so the numeric keypad is only safe while a
                      passport is not the selected type. */}
                  <input
                    id="field-customerIdNumber"
                    type="text"
                    className="checkout-input"
                    inputMode={customerIdType === '5' ? 'text' : 'numeric'}
                    autoComplete="off"
                    placeholder={customerIdType === '5'
                      ? (lang === 'en' ? 'e.g. C01X23456' : 'ej. C01X23456')
                      : (lang === 'en' ? 'e.g. 1 0234 0567' : 'ej. 1 0234 0567')}
                    required
                    value={customerIdNumber}
                    onChange={(e) => {
                      setCustomerIdNumber(e.target.value);
                      if (formErrors.customerIdNumber) setFormErrors(prev => ({ ...prev, customerIdNumber: null }));
                    }}
                    style={{ width: '100%' }}
                    {...invalidProps('customerIdNumber', formErrors)}
                  />
                  <FieldError name="customerIdNumber" message={formErrors.customerIdNumber} />
                </div>
              </div>

              {/* Structured Address Builder for Costa Rica */}
              {/* tabIndex -1 so validateForm's focus() actually lands here — a
                  plain div is not focusable and the call would be a no-op. */}
              <div
                id="field-shippingAddress"
                tabIndex={-1}
                className={formErrors.shippingAddress ? 'checkout-fieldset--invalid' : undefined}
                style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}
              >
                <FieldError name="shippingAddress" message={formErrors.shippingAddress} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div>
                    <CheckoutLabel htmlFor="field-shippingProvince" required>
                      {lang === 'en' ? 'Province' : 'Provincia'}
                    </CheckoutLabel>
                    <select
                      id="field-shippingProvince"
                      className="checkout-input"
                      autoComplete="address-level1"
                      value={shippingProvince}
                      onChange={(e) => {
                        setShippingProvince(e.target.value);
                        setShippingCanton('');
                        setShippingDistrict('');
                        if (formErrors.shippingAddress) setFormErrors(prev => ({ ...prev, shippingAddress: null }));
                      }}
                      required
                      style={{ cursor: 'pointer' }}
                      {...invalidProps('shippingAddress', formErrors)}
                    >
                      <option value="">-- {lang === 'en' ? 'Select Province' : 'Seleccionar Provincia'} --</option>
                      {Object.values(costaricaData.provincias).map((prov) => (
                        <option key={prov.nombre} value={prov.nombre}>{prov.nombre}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <CheckoutLabel htmlFor="field-shippingCanton" required>
                      {lang === 'en' ? 'Canton' : 'Cantón'}
                    </CheckoutLabel>
                    <select
                      id="field-shippingCanton"
                      className="checkout-input"
                      autoComplete="address-level2"
                      value={shippingCanton}
                      onChange={(e) => {
                        setShippingCanton(e.target.value);
                        setShippingDistrict('');
                        if (formErrors.shippingAddress) setFormErrors(prev => ({ ...prev, shippingAddress: null }));
                      }}
                      disabled={!shippingProvince}
                      required
                      style={{ cursor: 'pointer' }}
                      {...invalidProps('shippingAddress', formErrors)}
                    >
                      <option value="">-- {lang === 'en' ? 'Select Canton' : 'Seleccionar Cantón'} --</option>
                      {shippingProvince && Object.values(
                        Object.values(costaricaData.provincias).find(p => p.nombre === shippingProvince)?.cantones || {}
                      ).map((cant) => (
                        <option key={cant.nombre} value={cant.nombre}>{cant.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div>
                    <CheckoutLabel htmlFor="field-shippingDistrict" required>
                      {lang === 'en' ? 'District' : 'Distrito'}
                    </CheckoutLabel>
                    <select
                      id="field-shippingDistrict"
                      className="checkout-input"
                      autoComplete="address-level3"
                      value={shippingDistrict}
                      onChange={(e) => {
                        setShippingDistrict(e.target.value);
                        if (formErrors.shippingAddress) setFormErrors(prev => ({ ...prev, shippingAddress: null }));
                      }}
                      disabled={!shippingCanton}
                      required
                      style={{ cursor: 'pointer' }}
                      {...invalidProps('shippingAddress', formErrors)}
                    >
                      <option value="">-- {lang === 'en' ? 'Select District' : 'Seleccionar Distrito'} --</option>
                      {shippingCanton && Object.values(
                        Object.values(
                          Object.values(costaricaData.provincias).find(p => p.nombre === shippingProvince)?.cantones || {}
                        ).find(c => c.nombre === shippingCanton)?.distritos || {}
                      ).map((dist) => (
                        <option key={dist} value={dist}>{dist}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <CheckoutLabel htmlFor="field-shippingZip">
                      {lang === 'en' ? 'Postal code (optional)' : 'Código postal (opcional)'}
                    </CheckoutLabel>
                    <input
                      id="field-shippingZip"
                      type="text"
                      className="checkout-input"
                      autoComplete="postal-code"
                      inputMode="numeric"
                      placeholder={lang === 'en' ? 'e.g. 10201' : 'ej. 10201'}
                      value={shippingZip}
                      onChange={(e) => setShippingZip(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <CheckoutLabel htmlFor="field-shippingDetailedAddress" required>
                    {lang === 'en' ? 'Detailed address (landmarks, street details, etc.)' : 'Dirección detallada (señas exactas, calle, casa)'}
                  </CheckoutLabel>
                  <textarea
                    id="field-shippingDetailedAddress"
                    className="checkout-input"
                    autoComplete="street-address"
                    rows={4}
                    style={{ resize: 'vertical' }}
                    placeholder={lang === 'en' ? 'e.g. 200m North of the catholic church, white house with black gate' : 'ej. 200m Norte de la iglesia católica, casa blanca con portón negro'}
                    value={shippingDetailedAddress}
                    onChange={(e) => {
                      setShippingDetailedAddress(e.target.value);
                      if (formErrors.shippingAddress) setFormErrors(prev => ({ ...prev, shippingAddress: null }));
                    }}
                    required
                    {...invalidProps('shippingAddress', formErrors)}
                  />
                </div>
              </div>

              {renderOrderSummary({ showHeading: true, compact: true })}

              <div className="checkout-step-header" style={{ marginTop: '24px' }}>
                <span className="checkout-step-number">2</span>
                <h3>{lang === 'en' ? 'Payment Method' : 'Método de Pago'}</h3>
              </div>
              <div className="payment-method-grid" role="radiogroup" aria-label={lang === 'en' ? 'Payment method' : 'Método de pago'}>
                {[
                  {
                    value: 'whatsapp',
                    icon: <MessageCircle size={18} />,
                    iconColor: '#22c55e', // Green
                    title: lang === 'en' ? 'WhatsApp' : 'WhatsApp',
                    detail: lang === 'en' ? 'Coordinate manually' : 'Coordinar manualmente',
                  },
                  {
                    value: 'card',
                    icon: <CreditCard size={18} />,
                    iconColor: '#0ea5e9', // Blue
                    title: lang === 'en' ? 'Card' : 'Tarjeta',
                    detail: CARD_PAYMENTS_PAUSED
                      ? (lang === 'en' ? 'Temporarily unavailable' : 'No disponible temporalmente')
                      : (CARD_CHECKOUT_ENABLED
                        ? (CARD_CHECKOUT_LIVE
                          ? (lang === 'en' ? 'Visa / Mastercard' : 'Visa / Mastercard')
                          : (lang === 'en' ? 'Sandbox test mode' : 'Modo de prueba sandbox'))
                        : (lang === 'en' ? 'Coming soon' : 'Próximamente')),
                    badge: CARD_PAYMENTS_PAUSED
                      ? (lang === 'en' ? 'Maintenance' : 'Mantenimiento')
                      : (CARD_CHECKOUT_ENABLED
                        ? (CARD_CHECKOUT_LIVE ? null : (lang === 'en' ? 'Test' : 'Prueba'))
                        : (lang === 'en' ? 'Soon' : 'Pronto')),
                    disabled: !CARD_CHECKOUT_AVAILABLE,
                  },
                ].map(method => (
                  <button
                    key={method.value}
                    type="button"
                    role="radio"
                    aria-checked={paymentMethod === method.value}
                    aria-disabled={method.disabled || undefined}
                    disabled={method.disabled}
                    className={`payment-method-card ${paymentMethod === method.value ? 'active' : ''} ${method.disabled ? 'disabled' : ''}`}
                    onClick={() => !method.disabled && setPaymentMethod(method.value)}
                  >
                    <span className="payment-method-icon" style={method.iconColor ? { color: method.iconColor } : {}}>{method.icon}</span>
                    <span className="payment-method-copy">
                      <strong>{method.title}</strong>
                      <small>{method.detail}</small>
                    </span>
                    {method.badge && (
                      <span className="payment-method-status-badge">{method.badge}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* The apology, said where the customer is looking when they
                  find the card option greyed out. A disabled tile with a
                  "Maintenance" badge tells them something is wrong but not
                  that we know, that their card is safe, or what to do
                  instead — so all three are said here in plain words. */}
              {CARD_PAYMENTS_PAUSED && (
                <div className="card-paused-notice" role="status">
                  <span aria-hidden="true">🔧</span>
                  <div>
                    <strong>
                      {lang === 'en'
                        ? 'Card payments are temporarily paused'
                        : 'Los pagos con tarjeta están pausados temporalmente'}
                    </strong>
                    <p>{cardCheckoutMessage('paused', lang).message}</p>
                  </div>
                </div>
              )}

              {renderPaymentTotalNotice()}

              {/* Anything that stopped the order, said on the page.
                  Sits directly above the submit button because that is where
                  the customer is looking when it appears, and revealField()
                  brings them here from wherever they happen to be scrolled. */}
              {checkoutError && (
                <div
                  id="field-checkoutError"
                  role="alert"
                  tabIndex={-1}
                  className="checkout-blocking-error"
                >
                  <span aria-hidden="true">⚠️</span>
                  <div>
                    <strong>{checkoutError.title}</strong>
                    <p>{checkoutError.detail}</p>
                  </div>
                </div>
              )}

              {paymentMethod === 'card' && CARD_CHECKOUT_AVAILABLE ? (
                <div className="card-payment-panel">
                  <div className="card-payment-fields">
                    <div>
                      <CheckoutLabel htmlFor="field-cardHolder" required>
                        {lang === 'en' ? 'Name on card' : 'Nombre en la tarjeta'}
                      </CheckoutLabel>
                      <input
                        id="field-cardHolder"
                        type="text"
                        className="checkout-input"
                        autoComplete="cc-name"
                        placeholder={lang === 'en' ? 'e.g. ANA RODRIGUEZ' : 'ej. ANA RODRIGUEZ'}
                        value={cardDetails.holder}
                        onChange={(e) => {
                          setCardDetails(prev => ({ ...prev, holder: e.target.value }));
                          if (formErrors.cardHolder) setFormErrors(prev => ({ ...prev, cardHolder: null }));
                        }}
                        {...invalidProps('cardHolder', formErrors)}
                      />
                      <FieldError name="cardHolder" message={formErrors.cardHolder} />
                    </div>
                    <div>
                      <CheckoutLabel htmlFor="field-cardNumber" required>
                        {lang === 'en' ? 'Card number' : 'Número de tarjeta'}
                      </CheckoutLabel>
                      <input
                        id="field-cardNumber"
                        type="text"
                        inputMode="numeric"
                        className="checkout-input"
                        autoComplete="cc-number"
                        placeholder="1234 5678 9012 3456"
                        value={cardDetails.number}
                        onChange={(e) => {
                          setCardDetails(prev => ({ ...prev, number: e.target.value.replace(/[^\d\s]/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').trim().slice(0, 23) }));
                          if (formErrors.cardNumber) setFormErrors(prev => ({ ...prev, cardNumber: null }));
                        }}
                        {...invalidProps('cardNumber', formErrors)}
                      />
                      <FieldError name="cardNumber" message={formErrors.cardNumber} />
                    </div>
                    {/* .card-payment-fields__row is a grid, and collapses to one
                        column under 768px — the children size themselves. */}
                    <div className="card-payment-fields__row">
                      <div>
                        <CheckoutLabel htmlFor="field-cardExpiry" required>
                          {lang === 'en' ? 'Expiry date' : 'Fecha de vencimiento'}
                        </CheckoutLabel>
                        <input
                          id="field-cardExpiry"
                          type="text"
                          inputMode="numeric"
                          className="checkout-input"
                          autoComplete="cc-exp"
                          placeholder={lang === 'en' ? 'MM/YY' : 'MM/AA'}
                          value={cardDetails.expiry}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                            const expiry = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
                            setCardDetails(prev => ({ ...prev, expiry }));
                            if (formErrors.cardExpiry) setFormErrors(prev => ({ ...prev, cardExpiry: null }));
                          }}
                          {...invalidProps('cardExpiry', formErrors)}
                        />
                        <FieldError name="cardExpiry" message={formErrors.cardExpiry} />
                      </div>
                      <div>
                        <CheckoutLabel htmlFor="field-cardCvv" required>
                          {lang === 'en' ? 'Security code (CVV)' : 'Código de seguridad (CVV)'}
                        </CheckoutLabel>
                        <input
                          id="field-cardCvv"
                          type="password"
                          inputMode="numeric"
                          className="checkout-input"
                          autoComplete="cc-csc"
                          placeholder={lang === 'en' ? '3 digits' : '3 dígitos'}
                          value={cardDetails.cvv}
                          onChange={(e) => {
                            setCardDetails(prev => ({ ...prev, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }));
                            if (formErrors.cardCvv) setFormErrors(prev => ({ ...prev, cardCvv: null }));
                          }}
                          {...invalidProps('cardCvv', formErrors)}
                        />
                        <FieldError name="cardCvv" message={formErrors.cardCvv} />
                      </div>
                    </div>
                    <p className="card-payment-security-note">
                      {lang === 'en'
                        ? 'Card details are sent securely to Shield Hub Pay and are not stored by Costa Peptides.'
                        : 'Los datos de la tarjeta se envían de forma segura a Shield Hub Pay y no se almacenan en Costa Peptides.'}
                    </p>
                  </div>
                  <p className="card-payment-fee-note">
                    <strong>{lang === 'en' ? 'Note:' : 'Nota:'}</strong>{' '}
                    {lang === 'en'
                      ? 'Your bank may add a small international transaction fee (about 1–3%) to card payments. This fee comes from your bank, not from us.'
                      : 'Tu banco podría añadir una pequeña comisión por transacción internacional (alrededor de 1–3%) a los pagos con tarjeta. Esta comisión la cobra tu banco, no nosotros.'}
                  </p>
                  <div className="card-payment-statement-notice">
                    <span className="card-payment-statement-notice__icon">🏦</span>
                    <div>
                      <strong className="card-payment-statement-notice__heading">
                        {lang === 'en' ? 'What you will see on your statement:' : 'Lo que verás en tu estado de cuenta:'}
                      </strong>
                      <ul className="card-payment-statement-notice__list">
                        <li>
                          {lang === 'en'
                            ? <>The charge is processed through a <strong>Mexican bank</strong> with a USD conversion — this is normal and expected.</>                            
                            : <>El cargo se procesa a través de un <strong>banco mexicano</strong> con conversión a USD — esto es normal y esperado.</>}
                        </li>
                        <li>
                          {lang === 'en'
                            ? <>It will appear on your statement as <strong>&ldquo;SOF IA&rdquo;</strong> (our payment processor&apos;s name). Do <strong>not</strong> dispute this charge — it is us.</>
                            : <>Aparecerá en tu estado de cuenta como <strong>&ldquo;SOF IA&rdquo;</strong> (el nombre de nuestro procesador de pagos). <strong>No</strong> disputes este cargo — somos nosotros.</>}
                        </li>
                      </ul>
                    </div>
                  </div>
                  {/* Always render the button. Hiding it behind a "fill in your
                      details" notice made the customer hunt for the missing field
                      themselves; validateForm now names it and scrolls to it. */}
                  <button
                    type="button"
                    disabled={cardSubmitting || cardRetryBlocked || cart.length === 0 || checkBacOnlyMinimum(cart).blocked}
                    onClick={startCardCheckout}
                    className="card-payment-btn"
                  >
                    {cardRetryBlocked ? (
                      <>
                        <MessageCircle size={18} />
                        {lang === 'en' ? 'Message us on WhatsApp' : 'Escríbanos por WhatsApp'}
                      </>
                    ) : cardSubmitting ? (
                      <>
                        <div className="sync-spinner" style={{ width: '16px', height: '16px' }}></div>
                        {lang === 'en' ? 'Redirecting to payment...' : 'Redirigiendo al pago...'}
                      </>
                    ) : (
                      <>
                        <CreditCard size={18} />
                        {lang === 'en' ? `Pay ${formatPriceVal(getFinalTotal(), currency)} by Card` : `Pagar ${formatPriceVal(getFinalTotal(), currency)} con Tarjeta`}
                      </>
                    )}
                  </button>
                  <p className="card-payment-caption">
                    {CARD_CHECKOUT_LIVE
                      ? (lang === 'en'
                        ? 'Secure Visa / Mastercard checkout powered by Shield Hub Pay'
                        : 'Pago seguro con Visa / Mastercard mediante Shield Hub Pay')
                      : (lang === 'en'
                        ? 'Secure card checkout powered by Shield Hub Pay sandbox'
                        : 'Pago seguro con tarjeta mediante Shield Hub Pay sandbox')}
                  </p>
                  {currency === 'CRC' && (
                    <p className="card-payment-caption">
                      {lang === 'en'
                        ? 'Card payments are processed in US dollars.'
                        : 'Los pagos con tarjeta se procesan en dólares estadounidenses.'}
                    </p>
                  )}
                </div>
              ) : (
                <div className="cart-sticky-submit">
                  <button
                    type="submit"
                    form="checkout-form-main"
                    className="whatsapp-btn"
                    disabled={orderSubmitting || checkBacOnlyMinimum(cart).blocked}
                    style={{ width: '100%', padding: '16px', fontSize: '1.05rem', boxShadow: '0 -4px 20px rgba(0,0,0,0.1)' }}
                  >
                    {orderSubmitting ? (
                      <div className="sync-spinner" style={{ width: '16px', height: '16px' }}></div>
                    ) : (
                      lang === 'en'
                        ? `Submit Order - ${formatPriceVal(getFinalTotal(), currency)}`
                        : `Enviar Pedido - ${formatPriceVal(getFinalTotal(), currency)}`
                    )}
                  </button>
                </div>
              )}
            </form>
          </div>
        )}
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="modal active product-detail-overlay" onClick={closeProductModal}>
          <div className="modal-content product-detail-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="product-detail-title">
            <button className="close-modal product-detail-close" onClick={closeProductModal} aria-label={lang === 'en' ? 'Close product details' : 'Cerrar detalles del producto'}><X size={20} /></button>
            
            <div className="product-detail-hero">
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
                <div className="product-image" style={{ width: '120px', height: '120px', fontSize: '60px' }}>
                  {selectedProduct.imageUrl ? (
                    <img
                      src={selectedProduct.imageUrl}
                      alt={selectedProduct.product}
                      decoding="async"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '20px' }}
                    />
                  ) : getCategoryIcon(selectedProduct.category, 56)}
                </div>
              </div>
              <div className="product-category" style={{ color: 'var(--text-primary)', paddingRight: 0 }}>
                {translateCategory(selectedProduct.category)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <h2 id="product-detail-title" style={{ fontSize: '1.5rem', color: 'var(--text-main)', fontWeight: '800', margin: 0 }}>
                  {selectedProduct.product}
                </h2>
                <button 
                  onClick={(e) => handleShareProduct(e, selectedProduct)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Share Product"
                >
                  <Share2 size={18} />
                </button>
              </div>
            </div>
            
            <div className="product-detail-price">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignProps: 'center', marginProps: '4px' }}>
                <span style={{ fontWeight: '700', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {lang === 'en' ? 'PRICE' : 'PRECIO'}
                </span>
                {(() => {
                  // Same promo-sale pricing rule as the product cards: struck
                  // shelf price + after-code price when a badged promo targets
                  // this product and there is no real product-level markdown.
                  const originalUsd = parsePrice(selectedProduct.originalPriceUsd);
                  const priceUsd = parsePrice(selectedProduct.priceUsd);
                  const hasRealMarkdown = originalUsd > 0 && priceUsd > 0 && originalUsd > priceUsd;
                  const promoSale = !hasRealMarkdown && !isBacWater(selectedProduct.product) && isInStock(selectedProduct.status)
                    ? getPromoBadgeForProduct(promoBadges, selectedProduct.product, lang)
                    : null;
                  const pct = promoSale && promoSale.discountPct > 0 ? promoSale.discountPct : 0;
                  if (pct <= 0) {
                    return (
                      <span style={{ fontSize: '1.4rem', color: 'var(--text-primary)', fontWeight: '700' }}>
                        {getPriceLabel(selectedProduct, currency)}
                      </span>
                    );
                  }
                  const value = getPriceAsNumber(selectedProduct, currency) * (1 - pct / 100);
                  const discounted = formatPriceVal(currency === 'USD' ? (Number.isInteger(value) ? value : Number(value.toFixed(2))) : Math.round(value), currency);
                  return (
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontSize: '1.4rem', color: '#ef4444', fontWeight: '700' }}>{discounted}</span>
                      <span style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: '0.95rem', fontWeight: '600' }}>
                        {getPriceLabel(selectedProduct, currency)}
                      </span>
                    </span>
                  );
                })()}
              </div>
              {selectedProduct.discount && (
                <div style={{ color: 'var(--text-main)', fontWeight: '800', fontSize: '0.85rem', textAlign: 'right', marginTop: '6px' }}>
                  ✨ {translateDiscount(selectedProduct.discount, lang)}
                </div>
              )}
            </div>

            {((lang === 'en' && selectedProduct.descriptionEn) || (lang === 'es' && selectedProduct.descriptionEs)) && (
              <div className="product-detail-description">
                {lang === 'en' ? selectedProduct.descriptionEn : selectedProduct.descriptionEs}
              </div>
            )}

            <div className="product-detail-status">
              <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                {lang === 'en' ? 'Status' : 'Estado'}
              </span>
              <div className={`stock-badge ${isBacWater(selectedProduct.product) || isInStock(selectedProduct.status) ? 'stock-in' : isComingSoon(selectedProduct.status) ? 'stock-soon' : 'stock-out'}`} style={{ position: 'static' }}>
                {isBacWater(selectedProduct.product) ? (lang === 'en' ? 'In Stock' : 'Disponible') : translateStatus(selectedProduct.status)}
              </div>
              {isInStock(selectedProduct.status) && selectedProduct.inventoryCount !== null && selectedProduct.inventoryCount <= (selectedProduct.lowStockThreshold || 5) && selectedProduct.inventoryCount > 0 && (
                <div className="stock-badge stock-soon" style={{ position: 'static', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  {lang === 'en' ? `Only ${selectedProduct.inventoryCount} left in stock!` : `¡Solo quedan ${selectedProduct.inventoryCount} en inventario!`}
                </div>
              )}
              {isInStock(selectedProduct.status) && stockUnitsLabel(selectedProduct) && (
                <div className="stock-units-badge">
                  <span>{stockUnitsLabel(selectedProduct)}</span>
                </div>
              )}
            </div>

            {selectedProduct.coa && selectedProduct.coa !== '—' && selectedProduct.coa !== '' && (
              <a 
                href={selectedProduct.coa.startsWith('http') ? selectedProduct.coa : '#'} 
                target="_blank" 
                rel="noreferrer"
                className="product-detail-coa"
              >
                <FileText size={16} />
                {lang === 'en' ? 'View Certificate of Analysis' : 'Ver Certificado de Análisis'}
              </a>
            )}

            {isBacWater(selectedProduct.product) ? (
              <>
                <div style={{ marginBottom: '16px', padding: '16px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '12px', border: '1px solid rgba(56, 189, 248, 0.2)', fontSize: '0.85rem', color: '#38bdf8', textAlign: 'center', lineHeight: '1.5', overflowWrap: 'anywhere' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{getBacWaterSizeMl(selectedProduct.product) === 10 ? '💧' : '🎁'}</div>
                  <strong style={{ display: 'block', marginBottom: '4px', fontSize: '0.95rem' }}>
                    {getBacWaterSizeMl(selectedProduct.product) === 10
                      ? (lang === 'en'
                        ? `${getPriceLabel(selectedProduct, currency)} per vial`
                        : `${getPriceLabel(selectedProduct, currency)} por vial`)
                      : (lang === 'en' ? 'One Free With Every Peptide' : 'Una Gratis con Cada Péptido')}
                  </strong>
                  <p style={{ margin: 0, color: '#e0f2fe' }}>
                    {getBacWaterSizeMl(selectedProduct.product) === 10
                      ? (lang === 'en'
                        ? `Water-only orders start at ${BAC_WATER_10ML_ONLY_MIN_UNITS} vials. Add any peptide and that minimum goes away — and your peptide still comes with a free 3ml vial.`
                        : `Los pedidos de solo agua empiezan en ${BAC_WATER_10ML_ONLY_MIN_UNITS} viales. Agregá cualquier péptido y ese mínimo desaparece — y tu péptido igual incluye un vial de 3ml gratis.`)
                      : (lang === 'en'
                        ? `Every peptide you buy includes a free 3ml vial. Need more? Extra 3ml vials are ${getPriceLabel(selectedProduct, currency)} each. Water-only 3ml orders start at ${BAC_WATER_ONLY_MIN_UNITS} vials.`
                        : `Cada péptido que compres incluye un vial de 3ml gratis. ¿Necesitás más? Los viales adicionales de 3ml cuestan ${getPriceLabel(selectedProduct, currency)} cada uno. Los pedidos de solo agua de 3ml empiezan en ${BAC_WATER_ONLY_MIN_UNITS} viales.`)}
                  </p>
                </div>
                <button
                  className="whatsapp-btn product-detail-cart-button"
                  onClick={() => addToCart(selectedProduct)}
                >
                  {lang === 'en' ? 'Add to Cart' : 'Añadir al Carrito'}
                </button>
              </>
            ) : isInStock(selectedProduct.status) && (
              <button 
                className="whatsapp-btn product-detail-cart-button"
                onClick={() => addToCart(selectedProduct)}
              >
                {lang === 'en' ? 'Add to Cart' : 'Añadir al Carrito'}
              </button>
            )}

            {/* REVIEWS SECTION */}
            <div className="reviews-section">
              <div className="reviews-header">
                <h3>{lang === 'en' ? 'Customer Reviews' : 'Reseñas de Clientes'}</h3>
                <button 
                  className="review-toggle-button"
                  onClick={() => setReviewFormOpen(!reviewFormOpen)}
                >
                  {reviewFormOpen ? (lang === 'en' ? 'Cancel' : 'Cancelar') : (lang === 'en' ? 'Write a Review' : 'Escribir Reseña')}
                </button>
              </div>

              {reviewFormOpen && (
                <form className="write-review-form" onSubmit={handleReviewSubmit}>
                  {reviewSuccess ? (
                    <div style={{ textAlign: 'center', color: '#4ade80', padding: '10px 0' }}>
                      <Check size={32} style={{ margin: '0 auto 8px auto' }} />
                      <p style={{ fontWeight: 'bold' }}>{lang === 'en' ? 'Review submitted for approval!' : '¡Reseña enviada para aprobación!'}</p>
                    </div>
                  ) : (
                    <>
                      <div className="review-rating-field">
                        <span className="review-field-label">{lang === 'en' ? 'Your rating' : 'Su calificación'}</span>
                        <div className="star-rating-input" role="radiogroup" aria-label={lang === 'en' ? 'Review rating' : 'Calificación de la reseña'}>
                          {[1, 2, 3, 4, 5].map(star => (
                            <button
                              type="button"
                              key={star}
                              onClick={() => setReviewRating(star)}
                              role="radio"
                              aria-checked={star === reviewRating}
                              aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
                            >
                              <Star size={26} fill={star <= reviewRating ? '#fbbf24' : 'transparent'} color="#fbbf24" strokeWidth={1.5} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="review-field">
                        <span className="review-field-label">{lang === 'en' ? 'Your name' : 'Su nombre'}</span>
                        <input
                          type="text"
                          className="review-input"
                          placeholder={lang === 'en' ? 'Enter your name' : 'Ingrese su nombre'}
                          value={reviewName}
                          onChange={e => setReviewName(e.target.value)}
                          required
                        />
                      </label>
                      <label className="review-field">
                        <span className="review-field-label">{lang === 'en' ? 'Your review' : 'Su reseña'}</span>
                        <textarea
                          className="review-textarea"
                          placeholder={lang === 'en' ? 'What was your experience?' : '¿Cómo fue su experiencia?'}
                          value={reviewComment}
                          onChange={e => setReviewComment(e.target.value)}
                          required
                        />
                      </label>
                      <button 
                        type="submit" 
                        className="review-submit-button"
                        disabled={reviewSubmitting}
                      >
                        {reviewSubmitting ? <div className="sync-spinner" style={{ width: '16px', height: '16px' }}></div> : (lang === 'en' ? 'Submit Review' : 'Enviar Reseña')}
                      </button>
                    </>
                  )}
                </form>
              )}

              {reviews.filter(r => r.product_name === selectedProduct.product).length === 0 ? (
                <p className="reviews-empty-state">
                  {lang === 'en' ? 'No reviews yet. Be the first!' : 'Aún no hay reseñas. ¡Sé el primero!'}
                </p>
              ) : (
                <div className="reviews-list">
                  {reviews.filter(r => r.product_name === selectedProduct.product).map(r => (
                    <div key={r.id} className="review-card">
                      <div className="review-header">
                        <span className="review-author">{r.customer_name}</span>
                        <span className="review-date" data-nosnippet>{new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="review-rating">
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star key={star} size={12} fill={star <= r.rating ? '#fbbf24' : 'transparent'} color="#fbbf24" />
                        ))}
                      </div>
                      <p className="review-comment">{r.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
          </div>
        </div>
      )}

      {/* How to Order Modal */}
      {howToOrderOpen && (
        <div className="modal active" onClick={() => setHowToOrderOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setHowToOrderOpen(false)}>&times;</button>
            <h2 style={{ marginBottom: '20px', color: 'var(--text-primary)', fontSize: '1.5rem', fontWeight: '900' }}>
              {lang === 'en' ? 'How to Order' : 'Cómo Ordenar'}
            </h2>
            <div className="instructions-content" style={{ lineHeight: '1.6', color: 'var(--text-main)', fontSize: '0.95rem' }}>
              {lang === 'en' ? (
                <>
                  <p style={{ marginBottom: '12px' }}>Ordering premium peptides is simple and secure. Follow these steps:</p>
                  <ol style={{ paddingLeft: '20px', marginBottom: '16px' }}>
                    <li style={{ marginBottom: '8px' }}>Add desired products and quantities to your shopping cart.</li>
                    <li style={{ marginBottom: '8px' }}>Open your cart, enter your Name and WhatsApp phone number.</li>
                    <li style={{ marginBottom: '8px' }}>Submit your order. It automatically formats an invoice receipt and launches WhatsApp to chat directly with our specialists.</li>
                  </ol>
                  <p>Our Costa Rica coordination desk will coordinate stock confirmation, payment options (Sinpe Móvil or cash-on-delivery), and home dispatch coordinates.</p>
                </>
              ) : (
                <>
                  <p style={{ marginBottom: '12px' }}>Comprar péptidos premium es muy simple y seguro. Siga estos pasos:</p>
                  <ol style={{ paddingLeft: '20px', marginBottom: '16px' }}>
                    <li style={{ marginBottom: '8px' }}>Añada los productos y cantidades deseadas a su Carrito.</li>
                    <li style={{ marginBottom: '8px' }}>Abra el Carrito de compras, ingrese su Nombre y número de WhatsApp.</li>
                    <li style={{ marginBottom: '8px' }}>Envíe el pedido. Se registrará la orden y se abrirá WhatsApp con el recibo detallado para coordinar directamente.</li>
                  </ol>
                  <p>Nuestra mesa de ayuda coordinará la confirmación del stock, los métodos de pago (Sinpe Móvil o efectivo contra entrega) y los datos de envío a su domicilio.</p>
                </>
              )}
            </div>
            <a 
              href={buildWhatsAppLink(links.whatsappNumber, lang === 'en' ? 'Hi! I have a question about my order.' : '¡Hola! Tengo algunas preguntas.')}
              target="_blank" 
              rel="noreferrer"
              className="whatsapp-btn" 
              onClick={(e) => {
                e.preventDefault();
                window.open(buildWhatsAppLink(links.whatsappNumber, lang === 'en' ? 'Hi! I have a question about my order.' : '¡Hola! Tengo algunas preguntas.'), '_blank');
              }}
              style={{ marginTop: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Phone size={16} />
              {lang === 'en' ? 'Chat with Support' : 'Chatear con Soporte'}
            </a>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <p>&copy; 2026 Peptides Costa Rica. {lang === 'en' ? 'High-quality research peptides.' : 'Péptidos de investigación de alta calidad.'}</p>
          <div className="footer-links">
            <a href="#" onClick={(e) => { e.preventDefault(); setHowToOrderOpen(true); }}>
              {lang === 'en' ? 'How to Order' : 'Cómo Ordenar'}
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); setContactModalOpen(true); setContactFormSuccess(false); }}>
              {lang === 'en' ? 'Contact Us' : 'Contáctanos'}
            </a>
            <a href={buildWhatsAppLink(links.whatsappNumber, lang === 'en' ? 'Hi! I have a question about my order.' : '¡Hola! Tengo algunas preguntas.')} target="_blank" rel="noreferrer" onClick={(e) => {
              e.preventDefault();
              window.open(buildWhatsAppLink(links.whatsappNumber, lang === 'en' ? 'Hi! I have a question about my order.' : '¡Hola! Tengo algunas preguntas.'), '_blank');
            }}>
              {lang === 'en' ? 'Contact WhatsApp' : 'Contactar WhatsApp'}
            </a>
            <a href="/admin" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: '500' }}>
              {lang === 'en' ? 'Admin Portal' : 'Portal de Admin'}
            </a>
          </div>
        </div>
      </footer>

      {/* Contact Modal */}
      {contactModalOpen && (
        <div className="modal active" onClick={() => setContactModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <button className="close-modal" onClick={() => setContactModalOpen(false)}>
              &times;
            </button>
            <div className="modal-header">
              <h2 className="modal-title" style={{ marginBottom: '20px', color: 'var(--text-primary)', fontSize: '1.5rem', fontWeight: '900' }}>
                {lang === 'en' ? 'Contact Us' : 'Contáctanos'}
              </h2>
            </div>
            <div className="modal-body">
              {contactFormSuccess ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <CheckCircle size={32} />
                  </div>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '12px' }}>
                    {lang === 'en' ? 'Message Sent!' : '¡Mensaje Enviado!'}
                  </h3>
                  <p style={{ color: 'var(--text-muted)' }}>
                    {lang === 'en' ? 'Our team will review your inquiry and reply to your email shortly.' : 'Nuestro equipo revisará tu consulta y responderá a tu correo pronto.'}
                  </p>
                  <button className="btn-hero-primary" style={{ marginTop: '24px', width: '100%' }} onClick={() => setContactModalOpen(false)}>
                    {lang === 'en' ? 'Close' : 'Cerrar'}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '600' }}>
                      {lang === 'en' ? 'Full Name' : 'Nombre Completo'} *
                    </label>
                    <input 
                      type="text" value={contactFormName} onChange={(e) => setContactFormName(e.target.value)} required
                      style={{ width: '100%', padding: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-main)', fontSize: '14px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '600' }}>
                      {lang === 'en' ? 'Email Address' : 'Correo Electrónico'} *
                    </label>
                    <input 
                      type="email" value={contactFormEmail} onChange={(e) => setContactFormEmail(e.target.value)} required
                      style={{ width: '100%', padding: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-main)', fontSize: '14px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '600' }}>
                      {lang === 'en' ? 'Subject (Optional)' : 'Asunto (Opcional)'}
                    </label>
                    <input 
                      type="text" value={contactFormSubject} onChange={(e) => setContactFormSubject(e.target.value)}
                      style={{ width: '100%', padding: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-main)', fontSize: '14px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '600' }}>
                      {lang === 'en' ? 'Your Message' : 'Tu Mensaje'} *
                    </label>
                    <textarea 
                      value={contactFormMessage} onChange={(e) => setContactFormMessage(e.target.value)} required rows={4}
                      style={{ width: '100%', padding: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-main)', fontSize: '14px', resize: 'vertical' }}
                    />
                  </div>
                  
                  {contactFormError && (
                    <div style={{ color: '#ef4444', fontSize: '13px', fontWeight: '500' }}>{contactFormError}</div>
                  )}

                  <button type="submit" disabled={contactFormLoading} className="btn-hero-primary" style={{ width: '100%', marginTop: '8px' }}>
                    {contactFormLoading 
                      ? (lang === 'en' ? 'Sending...' : 'Enviando...') 
                      : (lang === 'en' ? 'Send Message' : 'Enviar Mensaje')}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Animation Overlays */}
      {flyingItems.map(item => (
        <img 
          key={item.id}
          src={item.imageSrc}
          className="flying-vial"
          style={{
            '--start-x': `${item.startX}px`,
            '--start-y': `${item.startY}px`,
            '--end-x': `${item.endX}px`,
            '--end-y': `${item.endY}px`
          }}
          alt=""
        />
      ))}

      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="premium-toast">
            <Check size={16} />
            <span>
              {lang === 'en' ? `Added ` : `Añadido `}
              <strong>{t.productName}</strong>
              {lang === 'en' ? ` to cart.` : ` al carrito.`}
            </span>
          </div>
        ))}
      </div>

      {/* Last-chance discount for a first-time shopper leaving with a cart.
          Unlike the access gate above it never blocks the catalog: it offers
          something, it can always be closed, and it is shown once per visitor. */}
      <ExitIntentOffer
        lang={lang}
        currency={currency}
        sessionId={sessionId}
        customerEmail={customerEmail}
        customerPhone={customerPhone}
        cartItemCount={cartItemCount}
        discountableSubtotal={getDiscountableSubtotal()}
        volumePct={getEffectiveVolumePct()}
        cartTotalUsd={currency === 'USD'
          ? getDiscountableSubtotal()
          : getDiscountableSubtotal() / exchangeRate}
        hasPromoApplied={Boolean(promoData?.valid)}
        gateVisible={!gateAccessGranted && gateVisible}
        checkoutBusy={orderSubmitting || orderSuccess}
        appliedCode={promoData?.valid ? promoData.code : null}
        onApply={handleExitOfferApply}
        onExpire={handleExitOfferExpire}
        whatsappNumber={links.whatsappNumber}
      />

      {/* Second-chance WhatsApp opt-in re-prompt (dismissible, not a full gate) */}
      {showWaReprompt && (
        <div style={{
          position: 'fixed', bottom: '18px', right: '18px', zIndex: 9998,
          maxWidth: '340px', width: 'calc(100% - 36px)',
          background: 'var(--bg-card)', border: '1px solid rgba(37,211,102,0.35)',
          borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
          padding: '16px', animation: 'fadeIn 0.3s ease',
        }}>
          <button
            onClick={dismissWaReprompt}
            aria-label="Close"
            style={{ position: 'absolute', top: '8px', right: '10px', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}
          >
            &times;
          </button>

          {waRepromptDone ? (
            <div style={{ textAlign: 'center', padding: '8px 4px' }}>
              <div style={{ fontSize: '1.6rem', marginBottom: '6px' }}>✅</div>
              <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>
                {lang === 'en' ? "You're in! We'll message you on WhatsApp." : '¡Listo! Le escribiremos por WhatsApp.'}
              </div>
            </div>
          ) : (
            <form onSubmit={handleWaRepromptSubmit}>
              <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.95rem', marginBottom: '2px', paddingRight: '18px' }}>
                {lang === 'en' ? '📲 Get exclusive deals on WhatsApp' : '📲 Reciba ofertas exclusivas por WhatsApp'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.4 }}>
                {lang === 'en'
                  ? 'Deals & new-stock alerts only — no spam. Reply STOP anytime.'
                  : 'Solo ofertas y avisos de stock, sin spam. Responda BAJA cuando quiera.'}
              </div>
              <input
                type="tel"
                value={waRepromptPhone}
                onChange={(e) => setWaRepromptPhone(e.target.value)}
                placeholder={lang === 'en' ? 'WhatsApp number (+506…)' : 'Número WhatsApp (+506…)'}
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-main)', fontSize: '0.9rem', outline: 'none', marginBottom: '8px' }}
              />
              <button
                type="submit"
                disabled={waRepromptSubmitting}
                className="whatsapp-btn"
                style={{ width: '100%', padding: '10px', border: 'none', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700 }}
              >
                {waRepromptSubmitting
                  ? (lang === 'en' ? 'Saving…' : 'Guardando…')
                  : (lang === 'en' ? 'Yes, keep me posted' : 'Sí, manténganme informado')}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
