"use client";

import { safeLocalStorage as localStorage } from '@/lib/storage';
import costaricaData from '@/lib/costarica.json';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import Papa from 'papaparse';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { 
  ShoppingBag, X, Search, SlidersHorizontal,
  List, Grid, Sparkles, Phone, FileText, 
  Plus, Minus, Trash2, Check, AlertCircle, ArrowLeft,
  Dna, FlaskConical, Syringe, TestTubes, Atom, 
  Brain, Shield, Moon, Sun, Flame, Zap, Droplets, Microscope, Star,
  CreditCard, Smartphone, MessageCircle, Lock, Share2
} from 'lucide-react';

// const WHATSAPP_NUMBER = '50684046973'; // Replaced with useBusinessLinks()
const FALLBACK_EXCHANGE_RATE = 454.48;
const FREE_SHIPPING_USD_THRESHOLD = 200;
const FLAT_SHIPPING_CRC = 2500;

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

export default function CatalogPage() {
  const { links } = useBusinessLinks();
  const router = useRouter();
  
  // Theme, Lang, Currency States
  const [theme, setTheme] = useState('light');
  const [lang, setLang] = useState('es');
  const [currency, setCurrency] = useState('CRC');
  
  // Products Data States
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDbBacked, setIsDbBacked] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(FALLBACK_EXCHANGE_RATE);

  // Search & Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [priceFilter, setPriceFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('pop');
  const [inStockOnly, setInStockOnly] = useState(true);
  const [viewMode, setViewMode] = useState('list'); // 'list', 'grid'

  // Cart & Modals States
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [addedProductId, setAddedProductId] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [howToOrderOpen, setHowToOrderOpen] = useState(false);
  const [flyingItems, setFlyingItems] = useState([]);
  const [toasts, setToasts] = useState([]);

  // Checkout inputs
  const [customerName, setCustomerName] = useState('');
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
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [cartAnimating, setCartAnimating] = useState(false);
  const [sessionId, setSessionId] = useState('');

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
  const [gateInput, setGateInput] = useState('');
  const [gateSubmitting, setGateSubmitting] = useState(false);
  const [gateError, setGateError] = useState('');

  // PayPal States
  const [paypalReady, setPaypalReady] = useState(false);
  const paypalButtonRef = useRef(null);
  const paypalRendered = useRef(false);

  // Tilopay State
  const [tilopaySubmitting, setTilopaySubmitting] = useState(false);

  // Contact Modal States
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactFormName, setContactFormName] = useState('');
  const [contactFormEmail, setContactFormEmail] = useState('');
  const [contactFormSubject, setContactFormSubject] = useState('');
  const [contactFormMessage, setContactFormMessage] = useState('');
  const [contactFormLoading, setContactFormLoading] = useState(false);
  const [contactFormSuccess, setContactFormSuccess] = useState(false);
  const [contactFormError, setContactFormError] = useState('');
  
  // Ref to hold latest checkout data for PayPal callbacks without re-rendering
  const checkoutDataRef = useRef({ cart, currency: 'CRC', exchangeRate: FALLBACK_EXCHANGE_RATE, customerName, customerPhone, customerEmail, shippingAddress, lang: 'en', sessionId, customerMetadata, promoData });

  useEffect(() => {
    checkoutDataRef.current = { cart, currency, exchangeRate, customerName, customerPhone, customerEmail, shippingAddress, lang, sessionId, customerMetadata, promoData };
  }, [cart, currency, exchangeRate, customerName, customerPhone, customerEmail, shippingAddress, lang, sessionId, customerMetadata, promoData]);

  // Check Access Gate Status
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasAccess = localStorage.getItem('catalog_access_granted') === 'true';
      setGateAccessGranted(hasAccess);
      setGateLoading(false);
    }
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
          p.product.toLowerCase() === decodedParam.toLowerCase() || 
          p.id === decodedParam
        );
        if (matchingProduct) {
          setSelectedProduct(matchingProduct);
          // Optional: clear the url param so refreshing doesn't keep opening it if they closed it
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search.replace(/&?product=[^&]+/, ''));
        }
      }
    }
  }, [products]);

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

        await supabase.from('catalog_leads').insert([{
          contact_method: isEmail ? 'email' : 'whatsapp',
          contact_value: gateInput.trim(),
          language: lang,
          ip_address: ip,
          city: city,
          region: region,
          country: country,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
          referrer: referrer
        }]);
      }
      
      // Grant access regardless of DB success to not block users if offline
      localStorage.setItem('catalog_access_granted', 'true');
      localStorage.setItem('catalog_lead_contact', gateInput.trim());
      setGateAccessGranted(true);
    } catch (err) {
      console.error('Error saving lead:', err);
      // Still grant access to prevent bad UX on error
      localStorage.setItem('catalog_access_granted', 'true');
      localStorage.setItem('catalog_lead_contact', gateInput.trim());
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
      const ref = document.referrer;

      if (utmSource) localStorage.setItem('lead_utm_source', utmSource);
      if (utmMedium) localStorage.setItem('lead_utm_medium', utmMedium);
      if (utmCampaign) localStorage.setItem('lead_utm_campaign', utmCampaign);
      if (ref && !ref.includes(window.location.hostname)) {
        localStorage.setItem('lead_referrer', ref);
      }
    }

    // URL overrides
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get('lang');
    const currencyParam = urlParams.get('currency');

    let initialLang = localStorage.getItem('lang') || 'es';
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
    localStorage.setItem('lang', initialLang);

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
      try { setCart(JSON.parse(savedCart)); } catch(e) {}
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
      setCustomerPhone(savedPhone);
    } else if (leadContact && !leadContact.includes('@')) {
      setCustomerPhone(leadContact);
    }

    if (savedEmail) {
      setCustomerEmail(savedEmail);
    } else if (leadContact && leadContact.includes('@')) {
      setCustomerEmail(leadContact);
    }

    // Bypass gate if they already have access granted or have contact info or admin preview URL param
    const adminPreview = urlParams.get('admin_preview') === 'true';
    const hasAccess = localStorage.getItem('catalog_access_granted') === 'true';
    if (hasAccess || savedPhone || savedEmail || leadContact || savedName || adminPreview) {
      setGateAccessGranted(true);
      localStorage.setItem('catalog_access_granted', 'true');
    }

    // Parse sales_agent query parameter and save to localStorage
    const agentParam = urlParams.get('sales_agent');
    if (agentParam) {
      localStorage.setItem('checkout_sales_agent', agentParam);
    }

    // Parse recover_session query parameter and load abandoned cart details
    const recoverSession = urlParams.get('recover_session');
    if (recoverSession && isSupabaseConfigured && supabase) {
      const loadRecoveredCart = async () => {
        try {
          const { data, error } = await supabase
            .from('abandoned_carts')
            .select('*')
            .eq('session_id', recoverSession)
            .single();
          
          if (!error && data) {
            if (data.cart_data && Array.isArray(data.cart_data) && data.cart_data.length > 0) {
              setCart(data.cart_data);
              localStorage.setItem('cart', JSON.stringify(data.cart_data));
            }
            
            if (data.customer_name) {
              setCustomerName(data.customer_name);
              localStorage.setItem('checkout_customer_name', data.customer_name);
            }
            if (data.customer_phone) {
              setCustomerPhone(data.customer_phone);
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
    if (agentParam || recoverSession) {
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          const cleanUrl = window.location.pathname + window.location.search
            .replace(/&?recover_session=[^&]+/, '')
            .replace(/&?sales_agent=[^&]+/, '')
            .replace(/\?$/, '')
            .replace(/\?&/, '?');
          window.history.replaceState({}, document.title, cleanUrl);
        }
      }, 1200);
    }


    // Check for Tilopay redirect params
    const paymentParam = urlParams.get('payment');
    if (paymentParam === 'success' || urlParams.get('code') === '1') {
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

  // Telemetry: Sync visitor session details to Supabase when session and metadata are ready
  useEffect(() => {
    if (!sessionId || !customerMetadata || !isSupabaseConfigured || !supabase) return;

    const logVisitorSession = async () => {
      try {
        const { city, region, country } = customerMetadata.location_data || {};
        
        // Try to fetch current accumulated duration in this session from localStorage (robust heartbeat recovery)
        const localDuration = parseInt(localStorage.getItem(`catalog_dur_${sessionId}`) || '0', 10);

        // Upsert visitor session row
        await supabase.from('visitor_sessions').upsert({
          session_id: sessionId,
          city: city || 'Unknown',
          region: region || 'Unknown',
          country: country || 'Unknown',
          ip_address: customerMetadata.ip_address || 'Unknown',
          device_info: customerMetadata.device_info || 'Unknown',
          catalog_duration: localDuration,
          last_active: new Date().toISOString()
        }, { onConflict: 'session_id' });
      } catch (err) {
        console.warn('Telemetry visitor session sync warning:', err);
      }
    };

    logVisitorSession();
  }, [sessionId, customerMetadata]);

  // Telemetry: Heartbeat to track how long they keep catalog open
  useEffect(() => {
    if (!sessionId || !isSupabaseConfigured || !supabase) return;

    // Start a 15-second heartbeat
    const intervalId = setInterval(async () => {
      // 1. Increment local session duration
      const currentDur = parseInt(localStorage.getItem(`catalog_dur_${sessionId}`) || '0', 10) + 15;
      localStorage.setItem(`catalog_dur_${sessionId}`, currentDur.toString());

      // 2. Sync to Supabase
      try {
        await supabase
          .from('visitor_sessions')
          .update({
            catalog_duration: currentDur,
            last_active: new Date().toISOString()
          })
          .eq('session_id', sessionId);
      } catch (err) {
        console.warn('Telemetry heartbeat sync warning:', err);
      }
    }, 15000);

    return () => clearInterval(intervalId);
  }, [sessionId]);

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
      const cached = localStorage.getItem('exchangeRate_USDCRC');
      const cachedTime = localStorage.getItem('exchangeRate_USDCRC_time');
      if (cached && cachedTime && (Date.now() - parseInt(cachedTime)) < 3600000) {
        setExchangeRate(parseFloat(cached));
        return;
      }
      const res = await fetch('/api/exchange-rate');
      const data = await res.json();
      if (data.rate) {
        const rate = data.rate;
        setExchangeRate(rate);
        localStorage.setItem('exchangeRate_USDCRC', rate.toString());
        localStorage.setItem('exchangeRate_USDCRC_time', Date.now().toString());
      }
    } catch (err) {
      console.error('Live exchange rate fetch failed, using fallback:', err);
    }
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

  // Load PayPal JS SDK
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    if (!clientId || document.getElementById('paypal-sdk')) {
      if (window.paypal) setPaypalReady(true);
      return;
    }
    const script = document.createElement('script');
    script.id = 'paypal-sdk';
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&locale=${lang === 'en' ? 'en' : 'es'}_CR`;
    script.async = true;
    script.onload = () => setPaypalReady(true);
    script.onerror = () => console.error('Failed to load PayPal SDK');
    document.head.appendChild(script);
  }, []);

  // Sync cart to localStorage and Supabase abandoned_carts (only while cart has items)
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));

    if (sessionId && isSupabaseConfigured && supabase) {
      const timeoutId = setTimeout(async () => {
        try {
          if (cart.length === 0) {
            localStorage.removeItem('had_items');
            await supabase.from('abandoned_carts').delete().eq('session_id', sessionId);
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

          await supabase.from('abandoned_carts').upsert({
            session_id: sessionId,
            cart_data: cart,
            customer_name: customerName || null,
            customer_phone: resolvedPhone || null,
            customer_email: resolvedEmail || null,
            ip_address: customerMetadata?.ip_address || null,
            location_data: customerMetadata?.location_data || null,
            device_info: customerMetadata?.device_info || null,
            last_updated: new Date().toISOString(),
            status: 'active',
            lang: lang || 'es',
            currency: currency || 'CRC'
          }, { onConflict: 'session_id' });
        } catch (err) {
          console.error('Failed to sync abandoned cart:', err);
        }
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [cart, customerName, customerPhone, customerEmail, sessionId, customerMetadata, lang, currency]);

  // Load Catalog Data (Supabase or CSV fallback)
  const loadCatalogData = async () => {
    setLoading(true);
    let loadedProducts = [];
    let dbConnected = false;

    // 1. Try Supabase
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('priority', { ascending: true });

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
              originalPriceUsd: isSaleActive ? item.original_price_usd : null,
              originalPriceCrc: isSaleActive ? item.original_price_crc : null,
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
        
        // Fetch Reviews
        const { data: revData } = await supabase
          .from('product_reviews')
          .select('*')
          .eq('status', 'Approved');
        if (revData) {
          setReviews(revData);
        }
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
  const isBacWater = (name) => {
    if (!name) return false;
    const nameLower = name.toLowerCase();
    return nameLower.includes('bac water') || nameLower.includes('bacteriostatic') || nameLower.includes('agua bacteriostática');
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

  const parsePrice = (priceStr) => {
    if (!priceStr) return 0;
    const clean = priceStr.replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 0;
  };

  const formatPriceVal = (val, cur) => {
    if (cur === 'USD') return `$${val}`;
    return `₡${Math.round(val).toLocaleString('en-US')}`;
  };

  const getPriceAsNumber = (prod, cur) => {
    if (cur === 'USD') {
      return parsePrice(prod.priceUsd);
    } else {
      if (prod.priceCrc) return parsePrice(prod.priceCrc);
      return Math.round(parsePrice(prod.priceUsd) * exchangeRate);
    }
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
    { en: 'Retatrutide', es: 'Retatrutide' },
    { en: 'Tirzepatide', es: 'Tirzepatide' },
    { en: 'Semaglutide', es: 'Semaglutide' },
    { en: 'Weight Loss', es: 'Pérdida de Peso' },
    { en: 'Recovery', es: 'Recuperación' }
  ];

  const getSearchSuggestions = () => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      return products.slice(0, 3);
    }
    return products.filter(p => 
      p.product.toLowerCase().includes(query) ||
      (p.category && p.category.toLowerCase().includes(query))
    ).slice(0, 5);
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
    const existing = cart.find(item => item.product === productObj.product);
    const newQty = existing ? existing.qty + 1 : 1;

    if (productObj.inventoryCount !== null && newQty > productObj.inventoryCount) {
      alert(lang === 'en' ? `Only ${productObj.inventoryCount} units available in stock.` : `Solo ${productObj.inventoryCount} unidades disponibles en inventario.`);
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
      isInStock(p.status) && 
      cartCategories.has(p.category)
    );
    
    // If not enough, add other in-stock products
    if (suggestions.length < 3) {
      const more = products.filter(p => 
        !cartProductNames.has(p.product) && 
        isInStock(p.status) && 
        !cartCategories.has(p.category)
      );
      suggestions = [...suggestions, ...more];
    }
    
    return suggestions.slice(0, 3);
  };

  const updateCartQty = (productName, change) => {
    setCart(cart.map(item => {
      if (item.product === productName) {
        const newQty = item.qty + change;
        if (change > 0 && item.inventoryCount !== null && newQty > item.inventoryCount) {
          alert(lang === 'en' ? `Only ${item.inventoryCount} units available in stock.` : `Solo ${item.inventoryCount} unidades disponibles en inventario.`);
          return item; // Max stock reached
        }
        return newQty > 0 ? { ...item, qty: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const removeFromCart = (productName) => {
    setCart(cart.filter(item => item.product !== productName));
  };

  // Calculate Cart Subtotal (before discount)
  const getCartTotal = () => {
    return cart.reduce((acc, item) => {
      const price = getPriceAsNumber(item, currency);
      return acc + (price * item.qty);
    }, 0);
  };

  // Volume discount tiers: 5+ vials = 15%, 10+ vials = 20%
  const getCartVialCount = (cartItems) => {
    return (cartItems || cart).reduce((sum, item) => sum + item.qty, 0);
  };

  const getVolumeDiscountPct = (vialCount) => {
    if (vialCount >= 10) return 20;
    if (vialCount >= 5) return 15;
    return 0;
  };

  const getDiscountedTotal = () => {
    const subtotal = getCartTotal();
    const vials = getCartVialCount();
    const pct = getVolumeDiscountPct(vials);
    if (pct > 0) return Math.round(subtotal * (1 - pct / 100));
    return subtotal;
  };

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
    
    let targetTotal = getCartTotal();
    
    if (promoData.is_flash_sale && promoData.target_product) {
      const targets = promoData.target_product.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      targetTotal = cart
        .filter(item => targets.some(t => item.product.toLowerCase().includes(t)))
        .reduce((sum, item) => sum + (currency === 'USD' ? item.priceUsd : item.priceCrc) * item.qty, 0);
    }
    
    const vials = getCartVialCount();
    const volumePct = getVolumeDiscountPct(vials);
    if (volumePct > 0) {
      targetTotal = targetTotal * (1 - volumePct / 100);
    }
    
    return currency === 'USD' ? parseFloat((targetTotal * promoData.discount_pct).toFixed(2)) : Math.round(targetTotal * promoData.discount_pct);
  };

  const getFinalTotal = () => {
    const items = getDiscountedTotal();
    const promo = getPromoDiscountAmount();
    return (items - promo) + getShippingFee();
  };

  const handleApplyPromo = async () => {
    if (!promoCodeInput) return;
    setPromoLoading(true);
    setPromoError('');
    try {
      const res = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCodeInput }),
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

  const saveOrderToDatabase = async (orderRow) => {
    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: orderRow, sessionId: sessionId || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('Order save failed:', data.error || res.statusText);
        return { ok: false, error: data.error || res.statusText };
      }
      if (data.ok && sessionId) {
        const newSid = 'session_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('cart_session_id', newSid);
        setSessionId(newSid);
      }
      return { ok: true, id: data.id };
    } catch (err) {
      console.error('Order save request failed:', err);
      return { ok: false, error: err.message || 'Network error' };
    }
  };

  const sendOrderNotification = async (orderPayload) => {
    try {
      const res = await fetch('/api/order-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('Order notification failed:', data.error || res.statusText);
      }
    } catch (err) {
      console.error('Order notification request failed:', err);
    }
  };

  const startTilopayCheckout = async (method) => {
    if (tilopaySubmitting || cart.length === 0) return;

    if (!customerName || !customerEmail || !customerPhone || !shippingAddress || !customerIdNumber) {
      return;
    }

    setTilopaySubmitting(true);

    const orderNum = `${method === 'sinpe' ? 'SPCR' : 'TPCR'}-${Date.now().toString(36).toUpperCase()}`;
    const totalVal = getFinalTotal();
    const tilopayCurrency = method === 'sinpe' ? 'CRC' : currency;
    const tilopayAmount = method === 'sinpe' && currency === 'USD'
      ? Math.round(totalVal * exchangeRate)
      : totalVal;
    const totalUsd = currency === 'USD' ? totalVal : Math.round(totalVal / exchangeRate);
    const totalCrc = currency === 'CRC' ? totalVal : Math.round(totalVal * exchangeRate);
    const shippingCosts = getShippingCostFields(currency, exchangeRate, getShippingFee());
    const orderItems = cart.map(item => ({
      product: item.product,
      qty: item.qty,
      price: getPriceAsNumber(item, currency),
    }));

    const tilopaySave = await saveOrderToDatabase({
      order_number: orderNum,
      customer_name: customerName,
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
      payment_method: method === 'sinpe' ? 'sinpe' : 'tilopay',
      status: method === 'sinpe' ? 'Pending - SINPE Tilopay' : 'Pending - Card',
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

    if (!tilopaySave.ok) {
      setTilopaySubmitting(false);
      alert(lang === 'en'
        ? 'Could not save your order. Please try again or contact us on WhatsApp.'
        : 'No se pudo guardar su pedido. Por favor intente de nuevo o contáctenos por WhatsApp.');
      return;
    }

    await sendOrderNotification({
      orderNumber: orderNum,
      customerName,
      customerPhone,
      customerEmail,
      shippingAddress,
      customerIdType,
      customerIdNumber,
      items: orderItems,
      total: totalVal,
      totalUsd,
      totalCrc,
      subtotal: getCartTotal(),
      volumeDiscount: getCartTotal() - getDiscountedTotal(),
      promoDiscount: getPromoDiscountAmount(),
      shipping: getShippingFee(),
      currency,
      paymentMethod: method === 'sinpe' ? 'sinpe' : 'tilopay',
      status: method === 'sinpe' ? 'Pending - SINPE Tilopay' : 'Pending - Card',
      lang,
    });

    try {
      const res = await fetch('/api/tilopay/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: tilopayAmount,
          currency: tilopayCurrency,
          orderNumber: orderNum,
          customerName,
          customerPhone,
          customerEmail,
          shippingAddress,
          lang,
          paymentMethod: method,
          customerIdType,
          customerIdNumber,
        }),
      });

      const data = await res.json();

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }

      alert(lang === 'en'
        ? `${method === 'sinpe' ? 'SINPE' : 'Card'} payment setup failed: ${data.error || 'Unknown error'}`
        : `Error al configurar el pago ${method === 'sinpe' ? 'SINPE' : 'con tarjeta'}: ${data.error || 'Error desconocido'}`);
      setTilopaySubmitting(false);
    } catch (err) {
      console.error('Tilopay error:', err);
      alert(lang === 'en' ? 'Connection error. Please try again.' : 'Error de conexión. Intente de nuevo.');
      setTilopaySubmitting(false);
    }
  };

  // Checkout submit
  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (paymentMethod === 'tilopay' || paymentMethod === 'sinpe') {
      // Tilopay is handled by its own button below — should not reach here
      return;
    }
    if (!customerName || !customerPhone || !shippingAddress || !customerIdNumber || cart.length === 0) return;

    setOrderSubmitting(true);

    const orderNum = 'WPCR-' + Date.now().toString(36).toUpperCase();

    const subtotalVal = getCartTotal();
    const totalVal = getFinalTotal();
    const vialCount = getCartVialCount();
    const discountPct = getVolumeDiscountPct(vialCount);
    const orderItems = cart.map(item => ({
      product: item.product,
      qty: item.qty,
      price: getPriceAsNumber(item, currency)
    }));
    const totalUsd = currency === 'USD' ? totalVal : Math.round(totalVal / exchangeRate);
    const totalCrc = currency === 'CRC' ? totalVal : Math.round(totalVal * exchangeRate);
    const shippingCosts = getShippingCostFields(currency, exchangeRate, getShippingFee());

    const whatsappSource = typeof window !== 'undefined' ? localStorage.getItem('whatsapp_source') : null;

    const saveResult = await saveOrderToDatabase({
      order_number: orderNum,
      customer_name: customerName,
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
      alert(lang === 'en'
        ? 'Could not save your order. Please try again or contact us on WhatsApp.'
        : 'No se pudo guardar su pedido. Por favor intente de nuevo o contáctenos por WhatsApp.');
      return;
    }

    await sendOrderNotification({
      orderNumber: orderNum,
      customerName,
      customerPhone,
      customerEmail,
      shippingAddress,
      customerIdType,
      customerIdNumber,
      items: orderItems,
      total: totalVal,
      totalUsd,
      totalCrc,
      subtotal: getCartTotal(),
      volumeDiscount: getCartTotal() - getDiscountedTotal(),
      promoDiscount: getPromoDiscountAmount(),
      shipping: getShippingFee(),
      currency,
      paymentMethod,
      status: 'Pending',
      lang,
    });

    // 2. Open WhatsApp Receipt
    const receiptHeader = lang === 'en' 
      ? `*PEPTIDES COSTA RICA — NEW ORDER*`
      : `*PÉPTIDOS COSTA RICA — NUEVA ORDEN*`;
      
    const idTypeName = customerIdType === '1' ? 'National ID' : customerIdType === '6' ? 'DIMEX' : customerIdType === '5' ? 'Passport' : customerIdType === '2' ? 'Corporate ID' : customerIdType;
    const idTypeNameEs = customerIdType === '1' ? 'Cédula física' : customerIdType === '6' ? 'DIMEX' : customerIdType === '5' ? 'Pasaporte' : customerIdType === '2' ? 'Cédula jurídica' : customerIdType;
    const receiptDetails = lang === 'en'
      ? `\n\n*Customer Details:*\n• Name: ${customerName}\n• ID: ${customerIdNumber} (${idTypeName})\n• Phone: ${customerPhone}\n• Address: ${shippingAddress}\n\n*Ordered Items:*`
      : `\n\n*Detalles del Cliente:*\n• Nombre: ${customerName}\n• Identificación: ${customerIdNumber} (${idTypeNameEs})\n• Teléfono: ${customerPhone}\n• Dirección: ${shippingAddress}\n\n*Artículos Pedidos:*`;

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
    if (paymentMethod === 'paypal') {
      const usdTotal = currency === 'USD' ? totalVal : Math.round(totalVal / exchangeRate);
      instructionsText = lang === 'en'
        ? `\n\n*Payment Method: PayPal (Friends & Family)*\n_We will provide you with our current PayPal account details for the $${usdTotal} USD transfer shortly._\n\n_Once transferred, we will verify your payment and dispatch immediately._`
        : `\n\n*Método de Pago: PayPal (Amigos y Familiares)*\n_En breve le brindaremos los detalles de nuestra cuenta actual de PayPal para la transferencia de $${usdTotal} USD._\n\n_Verificaremos su pago y despacharemos de inmediato._`;
    } else if (paymentMethod === 'sinpe') {
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
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
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
    router.push(`/thank-you?lang=${lang}`);
  };

  // Render PayPal Buttons into the container
  const renderPayPalButtons = useCallback(() => {
    if (!paypalReady || !window.paypal || !paypalButtonRef.current || paypalRendered.current) return;
    
    paypalRendered.current = true;

    window.paypal.Buttons({
      style: {
        layout: 'vertical',
        color: 'gold',
        shape: 'rect',
        label: 'paypal',
        height: 45,
      },
      createOrder: async () => {
        const { cart: currentCart, currency: cur, exchangeRate: rate, customerName: cName, customerPhone: cPhone, customerEmail: cEmail, shippingAddress: sAddress, lang: cLang } = checkoutDataRef.current;
        const subtotalVal = currentCart.reduce((sum, item) => {
          let p = item.priceCrc;
          if (cur === 'USD' && item.priceUsd) p = item.priceUsd;
          if (typeof p === 'string') p = parseFloat(p.replace(/[^0-9.]/g, ''));
          return sum + (p * item.qty);
        }, 0);
        
        const vials = getCartVialCount(currentCart);
        const pct = getVolumeDiscountPct(vials);
        const itemsTotal = pct > 0 ? Math.round(subtotalVal * (1 - pct / 100)) : subtotalVal;
        const itemsTotalUsd = cur === 'USD' ? itemsTotal : (itemsTotal / rate);
        
        let shippingFee = 0;
        if (itemsTotalUsd < 200) {
          shippingFee = cur === 'USD' ? parseFloat((FLAT_SHIPPING_CRC / rate).toFixed(2)) : FLAT_SHIPPING_CRC;
        }
        const totalVal = itemsTotal + shippingFee;
        const usdTotal = cur === 'USD' ? totalVal : Math.round(totalVal / rate);
        const orderItems = currentCart.map(item => {
          let p = item.priceCrc;
          if (cur === 'USD' && item.priceUsd) p = item.priceUsd;
          if (typeof p === 'string') p = parseFloat(p.replace(/[^0-9.]/g, ''));
          return {
            product: item.product,
            qty: item.qty,
            price: p
          };
        });

        try {
          const res = await fetch('/api/paypal/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              totalUsd: usdTotal,
              items: orderItems,
              customerName: cName,
              customerPhone: cPhone,
              customerEmail: cEmail
            }),
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          return data.id;
        } catch (err) {
          console.error('PayPal create order failed:', err);
          alert((cLang === 'en' ? 'Failed to create PayPal order: ' : 'Error al crear la orden de PayPal: ') + err.message);
        }
      },
      onApprove: async (data) => {
        const { cart: currentCart, currency: cur, exchangeRate: rate, customerName: cName, customerPhone: cPhone, customerEmail: cEmail, shippingAddress: sAddress, lang: cLang, sessionId: sid, customerMetadata } = checkoutDataRef.current;
        
        const subtotalVal = currentCart.reduce((sum, item) => {
          let p = item.priceCrc;
          if (cur === 'USD' && item.priceUsd) p = item.priceUsd;
          if (typeof p === 'string') p = parseFloat(p.replace(/[^0-9.]/g, ''));
          return sum + (p * item.qty);
        }, 0);
        
        const vials = getCartVialCount(currentCart);
        const pct = getVolumeDiscountPct(vials);
        const itemsTotal = pct > 0 ? Math.round(subtotalVal * (1 - pct / 100)) : subtotalVal;
        
        const pData = checkoutDataRef.current.promoData;
        let targetTotalForPromo = itemsTotal;
        if (pData?.valid && pData.is_flash_sale && pData.target_product) {
          const rawTargetSum = currentCart
            .filter(item => item.product.toLowerCase().includes(pData.target_product.toLowerCase()))
            .reduce((sum, item) => {
              let p = item.priceCrc;
              if (cur === 'USD' && item.priceUsd) p = item.priceUsd;
              if (typeof p === 'string') p = parseFloat(p.replace(/[^0-9.]/g, ''));
              return sum + (p * item.qty);
            }, 0);
          targetTotalForPromo = pct > 0 ? Math.round(rawTargetSum * (1 - pct / 100)) : rawTargetSum;
        }
        const promoDiscount = pData?.valid ? (cur === 'USD' ? parseFloat((targetTotalForPromo * pData.discount_pct).toFixed(2)) : Math.round(targetTotalForPromo * pData.discount_pct)) : 0;

        const itemsTotalUsd = cur === 'USD' ? itemsTotal : (itemsTotal / rate);
        let shippingFee = 0;
        if (itemsTotalUsd < 200) {
          shippingFee = cur === 'USD' ? parseFloat((FLAT_SHIPPING_CRC / rate).toFixed(2)) : FLAT_SHIPPING_CRC;
        }
        const totalVal = (itemsTotal - promoDiscount) + shippingFee;
        const usdTotal = cur === 'USD' ? totalVal : Math.round(totalVal / rate);
        const paypalShippingUsd = cur === 'USD' ? shippingFee : shippingFee / rate;
        const orderItems = currentCart.map(item => {
          let p = item.priceCrc;
          if (cur === 'USD' && item.priceUsd) p = item.priceUsd;
          if (typeof p === 'string') p = parseFloat(p.replace(/[^0-9.]/g, ''));
          return {
            product: item.product,
            qty: item.qty,
            price: p
          };
        });

        try {
          setOrderSubmitting(true);
          const res = await fetch('/api/paypal/capture-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderID: data.orderID }),
          });
          const captureData = await res.json();

          if (captureData.status === 'COMPLETED') {
            const paypalOrderNum = `PPCR-${data.orderID || captureData.id || Date.now().toString(36).toUpperCase()}`;

            const ppWaSource = typeof window !== 'undefined' ? localStorage.getItem('whatsapp_source') : null;
            const paypalSave = await fetch('/api/orders/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                order: {
                  order_number: paypalOrderNum,
                  customer_name: cName || 'PayPal Customer',
                  customer_phone: cPhone || '',
                  shipping_address: sAddress || '',
                  customer_id_type: customerIdType,
                  customer_id_number: customerIdNumber,
                  items: orderItems,
                  total_usd: usdTotal,
                  total_crc: Math.round(usdTotal * rate),
                  shipping_cost_usd: Number(paypalShippingUsd.toFixed(2)),
                  shipping_cost_crc: Math.round(paypalShippingUsd * rate),
                  currency: 'USD',
                  payment_method: 'paypal',
                  status: 'Paid',
                  customer_email: cEmail || null,
                  ip_address: customerMetadata?.ip_address || null,
                  location_data: customerMetadata?.location_data || null,
                  device_info: customerMetadata?.device_info || null,
                  whatsapp_source: ppWaSource || null,
                  sales_agent: typeof window !== 'undefined' ? localStorage.getItem('checkout_sales_agent') : null,
                  promo_code: pData?.valid ? pData.code : null,
                  discount_amount_usd: pData?.valid ? (cur === 'USD' ? promoDiscount : parseFloat((promoDiscount / rate).toFixed(2))) : 0,
                  discount_amount_crc: pData?.valid ? (cur === 'CRC' ? promoDiscount : Math.round(promoDiscount * rate)) : 0,
                  affiliate_id: pData?.valid ? pData.affiliate_id : null,
                  affiliate_commission_usd: pData?.valid ? parseFloat(((usdTotal - (cur === 'USD' ? shippingFee : shippingFee/rate)) * pData.commission_rate).toFixed(2)) : 0,
                  affiliate_commission_crc: pData?.valid ? Math.round(((cur === 'CRC' ? (totalVal - shippingFee) : (totalVal - shippingFee) * rate)) * pData.commission_rate) : 0,
                },
                sessionId: sid || null,
              }),
            });
            const paypalSaveData = await paypalSave.json().catch(() => ({}));
            if (!paypalSave.ok) {
              console.error('Failed to log PayPal order:', paypalSaveData.error);
            } else if (sid) {
              const newSid = 'session_' + Math.random().toString(36).substring(2, 15);
              localStorage.setItem('cart_session_id', newSid);
              setSessionId(newSid);
            }

            await sendOrderNotification({
              orderNumber: paypalOrderNum,
              customerName: cName || 'PayPal Customer',
              customerPhone: cPhone || '',
              customerEmail: cEmail || '',
              shippingAddress: sAddress || '',
              customerIdType,
              customerIdNumber,
              items: orderItems,
              total: usdTotal,
              totalUsd: usdTotal,
              totalCrc: Math.round(usdTotal * rate),
              subtotal: cur === 'USD' ? itemsBeforeShip : itemsBeforeShip / rate,
              volumeDiscount: cur === 'USD' ? volDiscount : volDiscount / rate,
              promoDiscount: cur === 'USD' ? promoDiscount : promoDiscount / rate,
              shipping: cur === 'USD' ? shippingFee : shippingFee / rate,
              currency: 'USD',
              paymentMethod: 'paypal',
              status: 'Paid',
              lang: cLang,
            });

            setOrderSubmitting(false);
            setCart([]);
            setCustomerName('');
            setCustomerPhone('');
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
              localStorage.removeItem('checkout_customer_id_type');
              localStorage.removeItem('checkout_customer_id_number');
            }
            
            // Redirect to the thank-you conversion page
            router.push(`/thank-you?lang=${cLang}`);
          } else {
            setOrderSubmitting(false);
            alert(cLang === 'en' ? 'Payment was not completed. Please try again.' : 'El pago no se completó. Intente de nuevo.');
          }
        } catch (err) {
          setOrderSubmitting(false);
          console.error('PayPal capture failed:', err);
          alert(cLang === 'en' ? 'Payment processing failed. Please try again.' : 'Error al procesar el pago. Intente de nuevo.');
        }
      },
      onCancel: () => {
        console.log('PayPal payment cancelled by user');
      },
      onError: (err) => {
        console.error('PayPal button error:', err);
      }
    }).render(paypalButtonRef.current);
  }, [paypalReady]);

  // Re-render PayPal buttons when relevant state changes
  useEffect(() => {
    const hasDetails = customerName && customerPhone && shippingAddress;
    if (!hasDetails) {
      paypalRendered.current = false;
      return;
    }

    if (paymentMethod === 'paypal' && paypalReady && paypalButtonRef.current && cart.length > 0 && !paypalRendered.current) {
      renderPayPalButtons();
    }
  }, [paymentMethod, paypalReady, cart.length, renderPayPalButtons, customerName, customerPhone, shippingAddress]);

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

  // Categories
  const categoriesList = ['all', ...Array.from(new Set(products.map(p => p.category))).filter(Boolean).sort()];

  // Filtering + Sorting Logic
  let filteredProducts = products.filter(p => {
    // 1. Search Query
    const nameMatch = (p.product || '').toLowerCase().includes(searchQuery.toLowerCase());
    const catMatch = (p.category || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (!nameMatch && !catMatch) return false;

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

  // Sorting — always put in-stock items first, out-of-stock at bottom
  if (sortOrder === 'pop') {
    filteredProducts = [...filteredProducts].sort((a, b) => {
      const stockA = isInStock(a.status);
      const stockB = isInStock(b.status);
      if (stockA && !stockB) return -1;
      if (!stockA && stockB) return 1;
      return 0;
    });
  } else {
    // Price sort, but still group in-stock first
    filteredProducts = [...filteredProducts].sort((a, b) => {
      const stockA = isInStock(a.status);
      const stockB = isInStock(b.status);
      if (stockA && !stockB) return -1;
      if (!stockA && stockB) return 1;
      const priceA = getPriceAsNumber(a, currency);
      const priceB = getPriceAsNumber(b, currency);
      return sortOrder === 'lowToHigh' ? priceA - priceB : priceB - priceA;
    });
  }

  const renderOrderSummary = ({ showHeading = false, compact = false } = {}) => {
    const shipFee = getShippingFee();
    const isFreeShip = qualifiesForFreeShipping();
    const hasVolumeDiscount = getVolumeDiscountPct(getCartVialCount()) > 0;
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
    <div id="app" className="min-h-screen" suppressHydrationWarning>
      <Script id="google-tag-manager" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','GTM-M2GVDQ44');`}
      </Script>
      {/* Global Promo Banner */}
      <div className="promo-banner-global">
        <div className="promo-banner-ticker">
          <div className="promo-banner-track">
            <div className="promo-banner-text">
              <Sparkles size={14} className="promo-icon" />
              <span>
                {lang === 'en'
                  ? "Volume Discount: Buy 5+ vials get 15% off, buy 10+ vials get 20% off! Mix & match allowed. • 🚚 FREE SHIPPING ON ORDERS OVER $200!"
                  : "Descuento por Volumen: ¡Compra 5+ viales y recibe 15% de descuento, compra 10+ viales y recibe 20%! Puedes combinar diferentes productos. • 🚚 ¡ENVÍO GRATIS EN PEDIDOS SUPERIORES A $200!"
                }
              </span>
            </div>
            <div className="promo-banner-text">
              <Sparkles size={14} className="promo-icon" />
              <span>
                {lang === 'en'
                  ? "Volume Discount: Buy 5+ vials get 15% off, buy 10+ vials get 20% off! Mix & match allowed. • 🚚 FREE SHIPPING ON ORDERS OVER $200!"
                  : "Descuento por Volumen: ¡Compra 5+ viales y recibe 15% de descuento, compra 10+ viales y recibe 20%! Puedes combinar diferentes productos. • 🚚 ¡ENVÍO GRATIS EN PEDIDOS SUPERIORES A $200!"
                }
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* Static Top Header Section */}
      <header className="header-top-section">
        <div className="header-top container">
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-main)', textDecoration: 'none', fontWeight: 'bold', marginRight: 'auto' }}>
            <ArrowLeft size={16} />
            {lang === 'en' ? 'Back' : 'Volver'}
          </Link>
          <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', textDecoration: 'none', fontWeight: '700', fontSize: '0.72rem', opacity: 0.4, letterSpacing: '0.05em', marginRight: '8px' }} title="Admin Dashboard">
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
              EN
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

        <div className="header-content container">
          <a href="/" className="logo">
            <img 
              src="/logo.png" 
              alt="Peptides Costa Rica Logo" 
              className="logo-img-custom"
            />
          </a>

          {/* Trust Seals */}
          <div className="trust-badges-container">
            <a href={links.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="trust-badge google-maps">
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
            
            <a href="https://www.trustpilot.com/review/peptidescostarica.net" target="_blank" rel="noopener noreferrer" className="trust-badge">
              <div className="tp-star-box">
                <Star size={10} fill="#fff" color="#fff" />
              </div>
              <div className="trust-text">
                <span className="trust-score">Trustpilot</span>
                <span className="trust-desc">
                  5.0 <Star size={8} fill="#00b67a" color="#00b67a" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#00b67a" color="#00b67a" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#00b67a" color="#00b67a" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#00b67a" color="#00b67a" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#00b67a" color="#00b67a" style={{display: 'inline', margin: '0 1px'}}/>
                </span>
              </div>
            </a>

            <a href="https://www.facebook.com/Peptidescostaricaresearch/reviews" target="_blank" rel="noopener noreferrer" className="trust-badge">
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
        </div>
      </header>

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
                                  <img src={match.imageUrl} alt={match.product} />
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
            <button 
              onClick={() => setIsCartOpen(true)}
              className={`filter-btn nav-cart-btn ${cartAnimating ? 'cart-animating' : ''}`}
              title="Cart"
              style={{ position: 'relative' }}
            >
              <ShoppingBag size={18} />
              {cart.length > 0 && (
                <span className="nav-cart-badge" style={{ position: 'absolute', top: '-5px', right: '-5px', background: 'var(--accent)', color: 'white', fontSize: '0.6rem', padding: '2px 5px', borderRadius: '10px', fontWeight: 'bold' }}>
                  {cart.reduce((a, b) => a + b.qty, 0)}
                </span>
              )}
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

        <nav className="category-nav">
          <div className="category-scroll container">
            {categoriesList.map(cat => (
              <button 
                key={cat}
                className={`cat-chip ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat === 'all' 
                  ? (lang === 'en' ? 'All Products' : 'Todos los Productos')
                  : translateCategory(cat)
                }
              </button>
            ))}
          </div>
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
        </div>
        {gateLoading ? (
          <div className="loader">
            <div className="sync-spinner" style={{ marginBottom: '16px' }}></div>
            <div>{lang === 'en' ? 'Syncing catalog...' : 'Sincronizando catálogo...'}</div>
          </div>
        ) : !gateAccessGranted ? (
          <div className="access-gate-overlay" style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh', 
            background: theme === 'dark' ? 'rgba(5, 11, 24, 0.8)' : 'rgba(244, 246, 249, 0.8)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px'
          }}>
            <div className="access-gate-card" style={{
              background: 'var(--bg-card)', padding: '0', borderRadius: '24px',
              boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)',
              maxWidth: '480px', width: '100%', textAlign: 'center', overflow: 'hidden'
            }}>
              <div style={{ padding: '24px 24px 32px 24px' }}>
              <img src="/logo.png" alt="Peptides Costa Rica Logo" style={{ height: '40px', margin: '0 auto 16px auto', display: 'block', borderRadius: '8px' }} />
              <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: 'var(--text-main)', marginBottom: '8px' }}>
                {lang === 'en' ? 'Exclusive Catalog Access' : 'Acceso Exclusivo al Catálogo'}
              </h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.5 }}>
                {lang === 'en' 
                  ? 'Please provide your WhatsApp number or email address to view our premium peptide catalog and current pricing.' 
                  : 'Por favor, ingrese su número de WhatsApp o correo electrónico para ver nuestro catálogo premium y precios actuales.'}
              </p>
              <form onSubmit={handleGateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input 
                  type="text" 
                  placeholder={lang === 'en' ? 'WhatsApp Number or Email' : 'WhatsApp o Correo Electrónico'}
                  value={gateInput}
                  onChange={(e) => setGateInput(e.target.value)}
                  style={{ 
                    width: '100%', padding: '14px', borderRadius: '12px', 
                    border: '1px solid var(--border)', background: 'var(--bg-secondary)', 
                    color: 'var(--text-main)', fontSize: '1rem', outline: 'none'
                  }}
                  required
                />
                {gateError && <div style={{ color: '#ef4444', fontSize: '0.8rem', fontWeight: 'bold' }}>{gateError}</div>}
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

        {!gateLoading && gateAccessGranted && (
          <div style={{ opacity: 1, pointerEvents: 'auto', transition: 'opacity 0.3s' }}>
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
          {/* Catalog Promotional Banner */}
          <div style={{
            width: '100%', marginBottom: '24px', borderRadius: '16px', overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)', cursor: 'pointer', position: 'relative'
          }}
            onClick={() => window.open('https://peptidescostarica.net', '_blank')}
          >
            <img
              src="https://peptidescostarica.net/wp-content/uploads/2026/04/Untitled-design-5-1.png"
              alt={lang === 'en' ? 'Peptides Costa Rica – Premium Peptide Research Supplies' : 'Péptidos Costa Rica – Suministros de Investigación Premium'}
              style={{
                width: '100%',
                display: 'block',
                height: 'auto',
                maxHeight: '220px',
                objectFit: 'cover',
                objectPosition: 'center'
              }}
              onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.style.display = 'none'; }}
            />
          </div>
          <div className={`product-grid ${viewMode}-view`}>
            {filteredProducts.map((p, idx) => {
              const isBac = isBacWater(p.product);
              const inStock = isBac || isInStock(p.status);
              const comingSoon = isComingSoon(p.status) && !isBac;
              const cardClass = inStock ? 'product-card' : 'product-card card-out-of-stock';
              
              const pMain = currency === 'USD' ? p.priceUsd : p.priceCrc;
              const pSub = currency === 'USD' ? p.priceCrc : p.priceUsd;

              return (
                <div 
                  key={idx} 
                  className={cardClass}
                  onClick={() => handleProductClick(p)}
                >
                  <div className="product-image">
                    {p.imageUrl ? (
                      <img 
                        src={p.imageUrl} 
                        alt={p.product} 
                      />
                    ) : getCategoryIcon(p.category)}
                    {!inStock && !comingSoon && (
                      <div className="out-of-stock-overlay">
                        <span>{lang === 'en' ? 'OUT OF STOCK' : 'AGOTADO'}</span>
                      </div>
                    )}
                    {inStock && p.originalPriceUsd && p.originalPriceUsd !== p.priceUsd && (
                      <div className="sale-badge" style={{ position: 'absolute', top: '10px', right: '10px', background: '#ef4444', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', zIndex: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                        {(() => {
                          const original = typeof p.originalPriceUsd === 'string' ? parseFloat(p.originalPriceUsd.replace(/[^0-9.]/g, '')) : p.originalPriceUsd;
                          const current = typeof p.priceUsd === 'string' ? parseFloat(p.priceUsd.replace(/[^0-9.]/g, '')) : p.priceUsd;
                          if (original && current && original > current) {
                            const pct = Math.round((1 - (current / original)) * 100);
                            return `-${pct}%`;
                          }
                          return lang === 'en' ? 'SALE' : 'OFERTA';
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="product-info">
                    <div className="product-category">{translateCategory(p.category)}</div>
                    <h3 className="product-name">{p.product}</h3>
                    <div className="product-rating-slot">
                      {renderRatingSummary(p.product)}
                    </div>
                    <div className="product-pricing">
                      {isBac ? (
                        <div className="bac-free-price">
                          <span>{lang === 'en' ? 'FREE' : 'GRATIS'}</span>
                          <small>{lang === 'en' ? 'included' : 'incluido'}</small>
                        </div>
                      ) : p.originalPriceUsd && p.originalPriceUsd !== p.priceUsd ? (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                          <span className="price-main" style={{ color: '#ef4444' }}>{pMain}</span>
                          <span style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: '0.8rem', fontWeight: '500' }}>
                            {currency === 'USD' ? p.originalPriceUsd : p.originalPriceCrc}
                          </span>
                        </div>
                      ) : (
                        <span className="price-main">{pMain}</span>
                      )}
                      {!isBac && pSub && <span className="price-sub">{pSub}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <div className={`stock-badge ${isBac ? 'stock-in' : inStock ? 'stock-in' : comingSoon ? 'stock-soon' : 'stock-out'}`} style={{ position: 'relative', top: 'auto', right: 'auto', margin: 0 }}>
                        <span>
                          {isBac ? (lang === 'en' ? 'Included' : 'Incluido') : translateStatus(p.status)}
                        </span>
                      </div>
                      {inStock && p.inventoryCount !== null && p.inventoryCount <= (p.lowStockThreshold || 5) && p.inventoryCount > 0 && (
                        <div style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '0.6rem', fontWeight: '800', border: '1px solid rgba(239, 68, 68, 0.2)', textTransform: 'uppercase' }}>
                          {lang === 'en' ? `Only ${p.inventoryCount} left!` : `¡Solo quedan ${p.inventoryCount}!`}
                        </div>
                      )}
                    </div>

                    <div className="product-actions">
                      {isBac ? (
                        <div className="complimentary-note">
                          <span className="complimentary-note__title">
                            {lang === 'en' ? 'Added with each order' : 'Incluido en cada pedido'}
                          </span>
                          <span className="complimentary-note__text">
                            {lang === 'en' ? 'No cart action needed.' : 'No necesita agregarlo.'}
                          </span>
                        </div>
                      ) : inStock ? (
                        (() => {
                          const cartItem = cart.find(item => item.product === p.product);
                          if (cartItem) {
                            return (
                              <div className="inline-qty-selector" onClick={(e) => e.stopPropagation()}>
                                <button 
                                  className="qty-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateCartQty(p.product, -1);
                                  }}
                                  title="Decrease quantity"
                                >
                                  <Minus size={16} />
                                </button>
                                <span className="qty-val">{cartItem.qty}</span>
                                <button 
                                  className="qty-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateCartQty(p.product, 1);
                                  }}
                                  title="Increase quantity"
                                >
                                  <Plus size={16} />
                                </button>
                              </div>
                            );
                          }
                          return (
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
                          );
                        })()
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


      {/* Floating Cart FAB & Mobile Bottom Bar */}
      <style>{`
        @keyframes cart-badge-pop {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.3); opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes cart-fab-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.55); }
          70%  { box-shadow: 0 0 0 14px rgba(34,197,94,0); }
          100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
        }
        
        /* Default mobile view: bottom bar if items exist, otherwise floating right */
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
          justify-content: flex-end;
        }

        .cart-container-wrapper.has-items {
          justify-content: center;
          background: linear-gradient(to top, var(--bg-main) 50%, transparent);
        }

        .cart-fab-sticky {
          pointer-events: all;
          background: linear-gradient(135deg, #22c55e, #16a34a);
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
          transition: transform 0.2s cubic-bezier(.34,1.56,.64,1), box-shadow 0.2s;
        }

        .cart-fab-sticky:active { transform: scale(0.97); }

        .cart-fab-btn {
          pointer-events: all;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 6px 24px rgba(34,197,94,0.45);
          transition: transform 0.18s cubic-bezier(.34,1.56,.64,1), box-shadow 0.2s;
          position: relative;
        }
        
        .cart-fab-btn.empty-anim {
          animation: cart-fab-pulse 2.5s ease-in-out infinite;
        }

        .cart-fab-btn:active { transform: scale(0.94); }
        
        .cart-fab-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          background: #ef4444;
          color: #fff;
          font-size: 0.72rem;
          font-weight: 800;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #fff;
          animation: cart-badge-pop 0.35s cubic-bezier(.34,1.56,.64,1);
        }

        @media (min-width: 900px) {
          .cart-container-wrapper {
            bottom: 24px;
            right: 24px;
            left: auto;
            width: auto;
            padding: 0;
            background: none !important;
          }
          .cart-fab-sticky {
            width: 66px;
            height: 66px;
            border-radius: 50%;
            padding: 0;
            justify-content: center;
            gap: 0;
          }
          .cart-fab-sticky > div:first-child span,
          .cart-fab-sticky > div:nth-child(2) {
            display: none !important;
          }
          .cart-fab-sticky:hover {
            transform: translateY(-2px) scale(1.03);
            box-shadow: 0 6px 24px rgba(34,197,94,0.55);
          }
          .cart-fab-btn { width: 66px; height: 66px; }
          .cart-fab-btn:hover {
            transform: scale(1.1);
            box-shadow: 0 8px 32px rgba(34,197,94,0.6);
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
                  {cart.reduce((s, i) => s + i.qty, 0)} {lang === 'en' ? (cart.reduce((s, i) => s + i.qty, 0) === 1 ? 'item' : 'items') : (cart.reduce((s, i) => s + i.qty, 0) === 1 ? 'artículo' : 'artículos')}
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
              id="floating-cart-btn"
              className="cart-fab-btn empty-anim"
              onClick={() => setIsCartOpen(true)}
              aria-label={lang === 'en' ? 'Open cart' : 'Abrir carrito'}
              title={lang === 'en' ? 'Cart' : 'Carrito'}
            >
              <ShoppingBag size={26} color="#fff" />
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
                    <img src={item.imageUrl} alt={item.product} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
            <h4 className="cart-suggestions-title">
              {lang === 'en' ? '✨ You might also like' : '✨ También te puede interesar'}
            </h4>
            <div className="cart-suggestions-scroll">
              {getSuggestions().map((sug, idx) => (
                <div key={idx} className="suggestion-card" onClick={() => {
                  addToCart(sug);
                }}>
                  <div className="suggestion-icon">
                    {sug.imageUrl ? (
                      <img src={sug.imageUrl} alt={sug.product} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
                    ) : getCategoryIcon(sug.category, 20)}
                  </div>
                  <div className="suggestion-info">
                    <span className="suggestion-name">{sug.product}</span>
                    <span className="suggestion-price">{currency === 'USD' ? sug.priceUsd : sug.priceCrc}</span>
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
            {getVolumeDiscountPct(getCartVialCount()) > 0 && (
              <div style={{ background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(16, 185, 129, 0.1))', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '12px', padding: '10px 14px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.1rem' }}>🏷️</span>
                  <div>
                    <div style={{ color: theme === 'dark' ? '#4ade80' : '#15803d', fontWeight: '700', fontSize: '0.8rem' }}>
                      {lang === 'en'
                        ? `Volume Discount: ${getVolumeDiscountPct(getCartVialCount())}% OFF`
                        : `Desc. por Volumen: ${getVolumeDiscountPct(getCartVialCount())}% DESC.`}
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

            {/* Next tier hint */}
            {getCartVialCount() >= 1 && getCartVialCount() < 5 && (
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 12px', marginBottom: '8px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: '700' }}>
                {lang === 'en'
                  ? `🔥 Add ${5 - getCartVialCount()} more vial${5 - getCartVialCount() > 1 ? 's' : ''} for 15% OFF!`
                  : `🔥 ¡Añade ${5 - getCartVialCount()} vial${5 - getCartVialCount() > 1 ? 'es' : ''} más para 15% DESC.!`}
              </div>
            )}
            {getCartVialCount() >= 5 && getCartVialCount() < 10 && (
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 12px', marginBottom: '8px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: '700' }}>
                {lang === 'en'
                  ? `🔥 Add ${10 - getCartVialCount()} more vial${10 - getCartVialCount() > 1 ? 's' : ''} to unlock 20% OFF!`
                  : `🔥 ¡Añade ${10 - getCartVialCount()} vial${10 - getCartVialCount() > 1 ? 'es' : ''} más para desbloquear 20% DESC.!`}
              </div>
            )}

            {/* Promo Code UI */}
            <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="checkout-input"
                  placeholder={lang === 'en' ? 'Promo Code' : 'Código Promocional'}
                  value={promoCodeInput}
                  onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                  style={{ flex: 1, textTransform: 'uppercase', marginBottom: 0 }}
                  disabled={promoData?.valid}
                />
                {!promoData?.valid ? (
                  <button
                    type="button"
                    onClick={handleApplyPromo}
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

            {renderOrderSummary()}

            <form id="checkout-form-main" onSubmit={handleCheckoutSubmit} className="checkout-form" style={{ paddingBottom: '80px' }}>
              
              <div className="checkout-step-header">
                <span className="checkout-step-number">1</span>
                <h3>{lang === 'en' ? 'Contact & Shipping' : 'Contacto y Envío'}</h3>
              </div>
              <input 
                type="text" 
                className="checkout-input" 
                placeholder={lang === 'en' ? "Your Full Name" : "Su Nombre Completo"}
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <input 
                type="email" 
                className="checkout-input" 
                placeholder={lang === 'en' ? "Email Address" : "Correo Electrónico"}
                required
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
              <input 
                type="tel" 
                className="checkout-input" 
                placeholder={lang === 'en' ? "WhatsApp Phone Number" : "Número de WhatsApp"}
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', width: '100%', marginBottom: '12px' }}>
                <div>
                  <select
                    className="checkout-input"
                    value={customerIdType}
                    onChange={(e) => setCustomerIdType(e.target.value)}
                    style={{ appearance: 'auto', width: '100%' }}
                    aria-label={lang === 'en' ? 'Identification type' : 'Tipo de identificación'}
                  >
                    <option value="1">{lang === 'en' ? 'National ID' : 'Cédula física'}</option>
                    <option value="6">DIMEX</option>
                    <option value="5">{lang === 'en' ? 'Passport' : 'Pasaporte'}</option>
                    <option value="2">{lang === 'en' ? 'Corporate ID' : 'Cédula jurídica'}</option>
                  </select>
                </div>
                <div>
                  <input
                    type="text"
                    className="checkout-input"
                    placeholder={lang === 'en' ? 'ID Number' : 'Número de Identificación'}
                    required
                    value={customerIdNumber}
                    onChange={(e) => setCustomerIdNumber(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Structured Address Builder for Costa Rica */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)' }}>
                      {lang === 'en' ? 'Province' : 'Provincia'} *
                    </label>
                    <select
                      className="checkout-input"
                      value={shippingProvince}
                      onChange={(e) => {
                        setShippingProvince(e.target.value);
                        setShippingCanton('');
                        setShippingDistrict('');
                      }}
                      required
                      style={{ cursor: 'pointer' }}
                    >
                      <option value="">-- {lang === 'en' ? 'Select Province' : 'Seleccionar Provincia'} --</option>
                      {Object.values(costaricaData.provincias).map((prov) => (
                        <option key={prov.nombre} value={prov.nombre}>{prov.nombre}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)' }}>
                      {lang === 'en' ? 'Canton' : 'Cantón'} *
                    </label>
                    <select
                      className="checkout-input"
                      value={shippingCanton}
                      onChange={(e) => {
                        setShippingCanton(e.target.value);
                        setShippingDistrict('');
                      }}
                      disabled={!shippingProvince}
                      required
                      style={{ cursor: 'pointer' }}
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
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)' }}>
                      {lang === 'en' ? 'District' : 'Distrito'} *
                    </label>
                    <select
                      className="checkout-input"
                      value={shippingDistrict}
                      onChange={(e) => setShippingDistrict(e.target.value)}
                      disabled={!shippingCanton}
                      required
                      style={{ cursor: 'pointer' }}
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
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)' }}>
                      {lang === 'en' ? 'Postal Code (Optional)' : 'Código Postal (Opcional)'}
                    </label>
                    <input
                      type="text"
                      className="checkout-input"
                      placeholder="e.g. 10201"
                      value={shippingZip}
                      onChange={(e) => setShippingZip(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)' }}>
                    {lang === 'en' ? 'Detailed Address (landmarks, street details, etc.)' : 'Dirección detallada (señas exactas, calle, casa)'} *
                  </label>
                  <textarea
                    className="checkout-input"
                    rows={4}
                    style={{ resize: 'vertical' }}
                    placeholder={lang === 'en' ? 'e.g. 200m North of the catholic church, white house with black gate' : 'ej. 200m Norte de la iglesia católica, casa blanca con portón negro'}
                    value={shippingDetailedAddress}
                    onChange={(e) => setShippingDetailedAddress(e.target.value)}
                    required
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
                  /* SINPE and Card (Tilopay) hidden until production account is activated
                  {
                    value: 'sinpe',
                    icon: <Smartphone size={18} />,
                    iconColor: '#f97316', // Orange
                    title: lang === 'en' ? 'SINPE Móvil' : 'SINPE Móvil',
                    detail: lang === 'en' ? 'Secure Tilopay checkout' : 'Pago seguro con Tilopay',
                  },
                  {
                    value: 'tilopay',
                    icon: <CreditCard size={18} />,
                    iconColor: '#0ea5e9', // Blue
                    title: lang === 'en' ? 'Card' : 'Tarjeta',
                    detail: lang === 'en' ? 'Credit or debit' : 'Crédito o débito',
                  },
                  */
                  {
                    value: 'whatsapp',
                    icon: <MessageCircle size={18} />,
                    iconColor: '#22c55e', // Green
                    title: lang === 'en' ? 'WhatsApp' : 'WhatsApp',
                    detail: lang === 'en' ? 'Coordinate manually' : 'Coordinar manualmente',
                  },
                  {
                    value: 'paypal',
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797H9.603c-.536 0-.99.394-1.073.926L7.076 21.337Z" fill="#253B80"/><path d="M20.16 7.035c-.01.058-.02.117-.032.177-1.071 5.497-4.74 7.398-9.426 7.398H8.847a1.16 1.16 0 0 0-1.146.98l-.94 5.967-.266 1.69a.61.61 0 0 0 .603.707h4.24c.468 0 .866-.34.94-.802l.038-.198.745-4.724.048-.26a.948.948 0 0 1 .937-.803h.59c3.827 0 6.822-1.554 7.7-6.05.367-1.878.177-3.446-.793-4.548a3.78 3.78 0 0 0-1.083-.834Z" fill="#179BD7"/><path d="M19.064 6.59a8.321 8.321 0 0 0-1.024-.227 12.99 12.99 0 0 0-2.063-.15h-6.25a.94.94 0 0 0-.932.795L7.684 14.01l-.033.21a1.16 1.16 0 0 1 1.146-.98h1.855c4.686 0 8.355-1.902 9.426-7.399.032-.163.06-.322.083-.477a5.58 5.58 0 0 0-1.097-.473Z" fill="#222D65"/></svg>,
                    iconColor: undefined,
                    title: 'PayPal',
                    detail: lang === 'en' ? 'PayPal or Credit/Debit Card' : 'PayPal o Tarjeta Débito/Crédito',
                  },
                ].map(method => (
                  <button
                    key={method.value}
                    type="button"
                    role="radio"
                    aria-checked={paymentMethod === method.value}
                    className={`payment-method-card ${paymentMethod === method.value ? 'active' : ''}`}
                    onClick={() => setPaymentMethod(method.value)}
                  >
                    <span className="payment-method-icon" style={method.iconColor ? { color: method.iconColor } : {}}>{method.icon}</span>
                    <span>
                      <strong>{method.title}</strong>
                      <small>{method.detail}</small>
                    </span>
                  </button>
                ))}
              </div>
              {renderPaymentTotalNotice()}
              {paymentMethod === 'paypal' ? (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ padding: '16px', background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', borderRadius: '12px', textAlign: 'center', fontSize: '0.95rem', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 'bold' }}>
                      {lang === 'en' ? '⚠️ PayPal Checkout Maintenance' : '⚠️ Mantenimiento de PayPal'}
                    </h4>
                    <p style={{ margin: '0 0 16px 0', lineHeight: '1.5' }}>
                      {lang === 'en' 
                        ? 'Our automated PayPal system is temporarily unavailable. We are currently only accepting PayPal payments via the "Friends and Family" option.' 
                        : 'Nuestro sistema automatizado de PayPal está temporalmente inactivo. Actualmente solo aceptamos pagos de PayPal mediante la opción "Amigos y Familiares".'}
                    </p>
                    <button
                      type="submit"
                      className="whatsapp-btn"
                      disabled={orderSubmitting || cart.length === 0}
                      style={{ width: '100%' }}
                    >
                      {orderSubmitting ? (
                        <>
                          <div className="sync-spinner" style={{ width: '16px', height: '16px' }}></div>
                          {lang === 'en' ? 'Processing...' : 'Procesando...'}
                        </>
                      ) : (
                        <>
                          <MessageCircle size={18} />
                          {lang === 'en' ? 'Order via WhatsApp for PayPal Details' : 'Pedir por WhatsApp para Detalles'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : paymentMethod === 'tilopay' || paymentMethod === 'sinpe' ? (
                <div className="tilopay-payment-panel">
                  {(!customerName || !customerEmail || !customerPhone || !shippingAddress || !customerIdNumber) ? (
                    <div style={{ padding: '12px', background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', borderRadius: '12px', textAlign: 'center', fontSize: '0.9rem', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
                      {lang === 'en' ? 'Please enter your contact, shipping, and ID details to proceed.' : 'Ingrese sus datos de contacto, envío y número de identificación para continuar.'}
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={tilopaySubmitting || cart.length === 0}
                      onClick={() => startTilopayCheckout(paymentMethod)}
                      className={`tilopay-btn ${paymentMethod === 'sinpe' ? 'sinpe' : ''}`}
                    >
                      {tilopaySubmitting ? (
                        <>
                          <div className="sync-spinner" style={{ width: '16px', height: '16px' }}></div>
                          {lang === 'en' ? 'Redirecting to payment...' : 'Redirigiendo al pago...'}
                        </>
                      ) : (
                        <>
                          {paymentMethod === 'sinpe' ? <Smartphone size={18} /> : <CreditCard size={18} />}
                          {paymentMethod === 'sinpe'
                            ? (lang === 'en'
                              ? `Pay ${formatPriceVal(currency === 'CRC' ? getFinalTotal() : Math.round(getFinalTotal() * exchangeRate), 'CRC')} via SINPE`
                              : `Pagar ${formatPriceVal(currency === 'CRC' ? getFinalTotal() : Math.round(getFinalTotal() * exchangeRate), 'CRC')} vía SINPE`)
                            : (lang === 'en' ? `Pay ${formatPriceVal(getFinalTotal(), currency)} by Card` : `Pagar ${formatPriceVal(getFinalTotal(), currency)} con Tarjeta`)}
                        </>
                      )}
                    </button>
                  )}
                  <p className="tilopay-caption">
                    {paymentMethod === 'sinpe'
                      ? (lang === 'en'
                        ? 'Tilopay will show the exact SINPE number, CRC amount, and reference code.'
                        : 'Tilopay mostrará el número SINPE, monto exacto en CRC y código de referencia.')
                      : (lang === 'en'
                        ? 'Secure checkout powered by Tilopay · Visa, Mastercard & more'
                        : 'Pago seguro con Tilopay · Visa, Mastercard y más')}
                  </p>
                </div>
              ) : (
                <div className="cart-sticky-submit">
                  <button 
                    type="submit" 
                    form="checkout-form-main"
                    className="whatsapp-btn"
                    disabled={orderSubmitting}
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
        <div className="modal active" onClick={closeProductModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal" onClick={closeProductModal}>&times;</button>
            
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
                <div className="product-image" style={{ width: '120px', height: '120px', fontSize: '60px' }}>
                  {selectedProduct.imageUrl ? (
                    <img 
                      src={selectedProduct.imageUrl} 
                      alt={selectedProduct.product} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '20px' }} 
                    />
                  ) : getCategoryIcon(selectedProduct.category, 56)}
                </div>
              </div>
              <div className="product-category" style={{ color: 'var(--text-primary)', paddingRight: 0 }}>
                {translateCategory(selectedProduct.category)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <h2 style={{ fontSize: '1.5rem', color: 'var(--text-main)', fontWeight: '800', margin: 0 }}>
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
            
            <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '16px', marginBottom: '24px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignProps: 'center', marginProps: '4px' }}>
                <span style={{ fontWeight: '700', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {lang === 'en' ? 'PRICE' : 'PRECIO'}
                </span>
                <span style={{ fontSize: '1.4rem', color: 'var(--text-primary)', fontWeight: '700' }}>
                  {currency === 'USD' ? selectedProduct.priceUsd : selectedProduct.priceCrc}
                </span>
              </div>
              {selectedProduct.discount && (
                <div style={{ color: 'var(--text-main)', fontWeight: '800', fontSize: '0.85rem', textAlign: 'right', marginTop: '6px' }}>
                  ✨ {translateDiscount(selectedProduct.discount, lang)}
                </div>
              )}
            </div>

            {((lang === 'en' && selectedProduct.descriptionEn) || (lang === 'es' && selectedProduct.descriptionEs)) && (
              <div style={{ marginBottom: '24px', lineHeight: '1.6', fontSize: '0.88rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', paddingBottom: '20px', whiteSpace: 'pre-line' }}>
                {lang === 'en' ? selectedProduct.descriptionEn : selectedProduct.descriptionEs}
              </div>
            )}

            <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                {lang === 'en' ? 'Status' : 'Estado'}
              </span>
              <div className={`stock-badge ${isBacWater(selectedProduct.product) || isInStock(selectedProduct.status) ? 'stock-in' : isComingSoon(selectedProduct.status) ? 'stock-soon' : 'stock-out'}`} style={{ position: 'static' }}>
                {isBacWater(selectedProduct.product) ? (lang === 'en' ? 'In Stock (Free)' : 'Disponible (Gratis)') : translateStatus(selectedProduct.status)}
              </div>
              {isInStock(selectedProduct.status) && selectedProduct.inventoryCount !== null && selectedProduct.inventoryCount <= (selectedProduct.lowStockThreshold || 5) && selectedProduct.inventoryCount > 0 && (
                <div className="stock-badge stock-soon" style={{ position: 'static', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  {lang === 'en' ? `Only ${selectedProduct.inventoryCount} left in stock!` : `¡Solo quedan ${selectedProduct.inventoryCount} en inventario!`}
                </div>
              )}
            </div>

            {selectedProduct.coa && selectedProduct.coa !== '—' && selectedProduct.coa !== '' && (
              <a 
                href={selectedProduct.coa.startsWith('http') ? selectedProduct.coa : '#'} 
                target="_blank" 
                rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--text-primary)', fontWeight: '800', marginBottom: '24px', textDecoration: 'none', fontSize: '0.85rem' }}
              >
                <FileText size={16} />
                {lang === 'en' ? 'View Certificate of Analysis' : 'Ver Certificado de Análisis'}
              </a>
            )}

            {isBacWater(selectedProduct.product) ? (
              <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '12px', border: '1px solid rgba(56, 189, 248, 0.2)', fontSize: '0.85rem', color: '#38bdf8', textAlign: 'center', lineHeight: '1.5' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🎁</div>
                <strong style={{ display: 'block', marginBottom: '4px', fontSize: '0.95rem' }}>{lang === 'en' ? 'Complimentary With Every Order' : 'De Cortesía con Cada Pedido'}</strong>
                <p style={{ margin: 0, color: '#e0f2fe' }}>
                  {lang === 'en' 
                    ? 'We provide complimentary BAC water with every order as our gift to you. No need to add it to your cart!' 
                    : 'Proporcionamos agua BAC de cortesía con cada pedido como nuestro regalo. ¡No es necesario añadirla al carrito!'}
                </p>
              </div>
            ) : isInStock(selectedProduct.status) && (
              <button 
                className="whatsapp-btn" 
                style={{ border: 'none', cursor: 'pointer' }}
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
                  className="btn-outline" 
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
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
                      <div className="star-rating-input">
                        {[1, 2, 3, 4, 5].map(star => (
                          <button 
                            type="button" 
                            key={star} 
                            onClick={() => setReviewRating(star)}
                          >
                            <Star size={24} fill={star <= reviewRating ? '#fbbf24' : 'transparent'} color="#fbbf24" strokeWidth={1.5} />
                          </button>
                        ))}
                      </div>
                      <input 
                        type="text" 
                        className="review-input" 
                        placeholder={lang === 'en' ? 'Your Name' : 'Su Nombre'} 
                        value={reviewName}
                        onChange={e => setReviewName(e.target.value)}
                        required
                      />
                      <textarea 
                        className="review-textarea" 
                        placeholder={lang === 'en' ? 'Share your experience...' : 'Comparta su experiencia...'}
                        value={reviewComment}
                        onChange={e => setReviewComment(e.target.value)}
                        required
                      />
                      <button 
                        type="submit" 
                        className="whatsapp-btn" 
                        style={{ border: 'none', padding: '10px' }}
                        disabled={reviewSubmitting}
                      >
                        {reviewSubmitting ? <div className="sync-spinner" style={{ width: '16px', height: '16px' }}></div> : (lang === 'en' ? 'Submit Review' : 'Enviar Reseña')}
                      </button>
                    </>
                  )}
                </form>
              )}

              {reviews.filter(r => r.product_name === selectedProduct.product).length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', margin: '20px 0' }}>
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
              href={`https://wa.me/${links.whatsappNumber}`} 
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
            <a href={`https://wa.me/${links.whatsappNumber}`} target="_blank" rel="noreferrer" onClick={(e) => {
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
    </div>
  );
}
