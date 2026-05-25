"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { 
  ShoppingBag, X, Search, Settings, 
  List, Grid, Sparkles, Phone, FileText, 
  Plus, Minus, Trash2, Check, AlertCircle, ArrowLeft,
  Dna, FlaskConical, Syringe, TestTubes, Atom, 
  Brain, Shield, Moon, Sun, Flame, Zap, Droplets, Microscope, Star,
  CreditCard, Smartphone, MessageCircle, Lock
} from 'lucide-react';

const WHATSAPP_NUMBER = '50684046973';
const FALLBACK_EXCHANGE_RATE = 454.48;

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

export default function CatalogPage() {
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
  const [activeCategory, setActiveCategory] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [priceFilter, setPriceFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('pop');
  const [inStockOnly, setInStockOnly] = useState(true);
  const [viewMode, setViewMode] = useState('list'); // 'list', 'compact', 'grid'

  // Cart & Modals States
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [addedProductId, setAddedProductId] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [howToOrderOpen, setHowToOrderOpen] = useState(false);

  // Checkout inputs
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerMetadata, setCustomerMetadata] = useState(null);
  const [shippingAddress, setShippingAddress] = useState('');
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
  const [gateAccessGranted, setGateAccessGranted] = useState(true); // Default true for SSR, updated in useEffect
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
  
  // Ref to hold latest checkout data for PayPal callbacks without re-rendering
  const checkoutDataRef = useRef({ cart, currency: 'CRC', exchangeRate: FALLBACK_EXCHANGE_RATE, customerName, customerPhone, customerEmail, shippingAddress, lang: 'en', sessionId, customerMetadata });

  useEffect(() => {
    checkoutDataRef.current = { cart, currency, exchangeRate, customerName, customerPhone, customerEmail, shippingAddress, lang, sessionId, customerMetadata };
  }, [cart, currency, exchangeRate, customerName, customerPhone, customerEmail, shippingAddress, lang, sessionId, customerMetadata]);

  // Check Access Gate Status
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasAccess = localStorage.getItem('catalog_access_granted') === 'true';
      setGateAccessGranted(hasAccess);
      setGateLoading(false);
    }
  }, []);

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
    setViewMode(savedView);

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

    // Check for Tilopay redirect params
    const paymentParam = urlParams.get('payment');
    if (paymentParam === 'success' || urlParams.get('code') === '1') {
      alert(initialLang === 'en' ? 'Payment Successful! Thank you for your order.' : '¡Pago exitoso! Gracias por su orden.');
      setCart([]); // Clear cart on success
      localStorage.removeItem('cart');
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
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
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      const data = await res.json();
      if (data.rates && data.rates.CRC) {
        const rate = data.rates.CRC;
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
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
    script.async = true;
    script.onload = () => setPaypalReady(true);
    script.onerror = () => console.error('Failed to load PayPal SDK');
    document.head.appendChild(script);
  }, []);

  // Sync cart to localStorage and Supabase
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
    
    if (sessionId && isSupabaseConfigured && supabase) {
      const timeoutId = setTimeout(async () => {
        if (cart.length > 0 || localStorage.getItem('had_items')) {
          if (cart.length > 0) localStorage.setItem('had_items', 'true');
          try {
            await supabase.from('abandoned_carts').upsert({
              session_id: sessionId,
              cart_data: cart,
              customer_name: customerName || null,
              customer_phone: customerPhone || null,
              customer_email: customerEmail || null,
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

        if (!error && data && data.length > 0) {
          loadedProducts = data.map(item => ({
            product: item.product,
            category: item.category,
            priceUsd: item.price_usd,
            priceCrc: item.price_crc,
            originalPriceUsd: item.original_price_usd,
            originalPriceCrc: item.original_price_crc,
            discount: item.discount,
            status: item.status,
            coa: item.coa,
            imageUrl: item.image_url,
            descriptionEn: item.description_en || '',
            descriptionEs: item.description_es || '',
            emoji: item.emoji || getEmojiForCategory(item.category)
          }));
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
                    imageUrl: p.imageUrl || '',
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
    let nextView = 'list';
    if (viewMode === 'list') nextView = 'compact';
    else if (viewMode === 'compact') nextView = 'grid';
    setViewMode(nextView);
    localStorage.setItem('viewMode', nextView);
  };

  // Cart operations
  const addToCart = (productObj) => {
    const existing = cart.find(item => item.product === productObj.product);
    if (existing) {
      setCart(cart.map(item => 
        item.product === productObj.product 
          ? { ...item, qty: item.qty + 1 }
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

  const closeProductModal = () => {
    setSelectedProduct(null);
  };

  const addToCartWithAnimation = (e, productData) => {
    e.stopPropagation(); // Prevent modal from opening
    addToCart(productData);
    setAddedProductId(productData.product);
    setTimeout(() => setAddedProductId(null), 600); // Reset animation state
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

    const requiresSinpeId = method === 'sinpe';
    if (!customerName || !customerEmail || !customerPhone || !shippingAddress || (requiresSinpeId && !customerIdNumber)) {
      return;
    }

    setTilopaySubmitting(true);

    const orderNum = `${method === 'sinpe' ? 'SPCR' : 'TPCR'}-${Date.now().toString(36).toUpperCase()}`;
    const totalVal = getDiscountedTotal();
    const tilopayCurrency = method === 'sinpe' ? 'CRC' : currency;
    const tilopayAmount = method === 'sinpe' && currency === 'USD'
      ? Math.round(totalVal * exchangeRate)
      : totalVal;
    const totalUsd = currency === 'USD' ? totalVal : Math.round(totalVal / exchangeRate);
    const totalCrc = currency === 'CRC' ? totalVal : Math.round(totalVal * exchangeRate);
    const orderItems = cart.map(item => ({
      product: item.product,
      qty: item.qty,
      price: getPriceAsNumber(item, currency),
    }));

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('orders').insert({
          order_number: orderNum,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail || null,
          shipping_address: shippingAddress,
          items: orderItems,
          total_usd: currency === 'USD' ? totalVal : Math.round(totalVal / exchangeRate),
          total_crc: currency === 'CRC' ? totalVal : Math.round(totalVal * exchangeRate),
          currency,
          payment_method: method === 'sinpe' ? 'sinpe' : 'tilopay',
          status: method === 'sinpe' ? 'Pending - SINPE Tilopay' : 'Pending - Card',
          ip_address: customerMetadata?.ip_address || null,
          location_data: customerMetadata?.location_data || null,
          device_info: customerMetadata?.device_info || null,
        });
      } catch (err) {
        console.error('Order pre-log failed:', err);
      }
    }

    await sendOrderNotification({
      orderNumber: orderNum,
      customerName,
      customerPhone,
      customerEmail,
      shippingAddress,
      items: orderItems,
      total: totalVal,
      totalUsd,
      totalCrc,
      currency,
      paymentMethod: method === 'sinpe' ? 'sinpe' : 'tilopay',
      status: method === 'sinpe' ? 'Pending - SINPE Tilopay' : 'Pending - Card',
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
    if (paymentMethod === 'paypal') return; // PayPal is handled by its own buttons
    if (paymentMethod === 'tilopay' || paymentMethod === 'sinpe') {
      // Tilopay is handled by its own button below — should not reach here
      return;
    }
    if (!customerName || !customerPhone || !shippingAddress || cart.length === 0) return;

    setOrderSubmitting(true);

    const orderNum = 'WPCR-' + Date.now().toString(36).toUpperCase();

    const subtotalVal = getCartTotal();
    const totalVal = getDiscountedTotal();
    const vialCount = getCartVialCount();
    const discountPct = getVolumeDiscountPct(vialCount);
    const orderItems = cart.map(item => ({
      product: item.product,
      qty: item.qty,
      price: getPriceAsNumber(item, currency)
    }));
    const totalUsd = currency === 'USD' ? totalVal : Math.round(totalVal / exchangeRate);
    const totalCrc = currency === 'CRC' ? totalVal : Math.round(totalVal * exchangeRate);

    let dbSuccess = false;

    // 1. Submit to Supabase if connected
    const whatsappSource = typeof window !== 'undefined' ? localStorage.getItem('whatsapp_source') : null;
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('orders')
          .insert({
            order_number: orderNum,
            customer_name: customerName,
            customer_phone: customerPhone,
            customer_email: customerEmail || null,
            shipping_address: shippingAddress,
            items: orderItems,
            total_usd: currency === 'USD' ? totalVal : Math.round(totalVal / exchangeRate),
            total_crc: currency === 'CRC' ? totalVal : Math.round(totalVal * exchangeRate),
            currency: currency,
            payment_method: paymentMethod,
            status: 'Pending',
            ip_address: customerMetadata?.ip_address || null,
            location_data: customerMetadata?.location_data || null,
            device_info: customerMetadata?.device_info || null,
            whatsapp_source: whatsappSource || null,
          });

        if (!error) {
          dbSuccess = true;
          if (sessionId) {
            await supabase.from('abandoned_carts').update({ status: 'converted' }).eq('session_id', sessionId);
            const newSid = 'session_' + Math.random().toString(36).substring(2, 15);
            localStorage.setItem('cart_session_id', newSid);
            setSessionId(newSid);
          }
        }
      } catch (err) {
        console.error("Order logging failed to Supabase:", err);
      }
    }

    await sendOrderNotification({
      orderNumber: orderNum,
      customerName,
      customerPhone,
      customerEmail,
      shippingAddress,
      items: orderItems,
      total: totalVal,
      totalUsd,
      totalCrc,
      currency,
      paymentMethod,
      status: 'Pending',
    });

    // 2. Open WhatsApp Receipt
    const receiptHeader = lang === 'en' 
      ? `*PEPTIDES COSTA RICA — NEW ORDER*`
      : `*PÉPTIDOS COSTA RICA — NUEVA ORDEN*`;
      
    const receiptDetails = lang === 'en'
      ? `\n\n*Customer Details:*\n• Name: ${customerName}\n• Phone: ${customerPhone}\n• Address: ${shippingAddress}\n\n*Ordered Items:*`
      : `\n\n*Detalles del Cliente:*\n• Nombre: ${customerName}\n• Teléfono: ${customerPhone}\n• Dirección: ${shippingAddress}\n\n*Artículos Pedidos:*`;

    const itemReceipts = cart.map(item => {
      const p = getPriceAsNumber(item, currency);
      return `\n• ${item.product} (x${item.qty}) — ${formatPriceVal(p * item.qty, currency)}`;
    }).join('');

    const discountReceipt = discountPct > 0
      ? (lang === 'en'
        ? `\n\n🏷️ *VOLUME DISCOUNT (${vialCount} vials): ${discountPct}% OFF*\n_Subtotal: ${formatPriceVal(subtotalVal, currency)}_`
        : `\n\n🏷️ *DESCUENTO POR VOLUMEN (${vialCount} viales): ${discountPct}% DESC.*\n_Subtotal: ${formatPriceVal(subtotalVal, currency)}_`)
      : '';

    const totalReceipt = lang === 'en'
      ? `\n\n*TOTAL DUE:* *${formatPriceVal(totalVal, currency)}*`
      : `\n\n*TOTAL A PAGAR:* *${formatPriceVal(totalVal, currency)}*`;

    let instructionsText = '';
    if (paymentMethod === 'paypal') {
      const usdTotal = currency === 'USD' ? totalVal : Math.round(totalVal / exchangeRate);
      instructionsText = lang === 'en'
        ? `\n\n*Payment Method: PayPal*\n_Please send $${usdTotal} USD via PayPal to:_\n👉 *jgw899@gmail.com*\n\n_We will verify your payment and coordinate dispatch details immediately._`
        : `\n\n*Método de Pago: PayPal*\n_Por favor envíe $${usdTotal} USD vía PayPal a:_\n👉 *jgw899@gmail.com*\n\n_Verificaremos su pago y coordinaremos el despacho de inmediato._`;
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

    const fullMessage = encodeURIComponent(`${receiptHeader}${receiptDetails}${itemReceipts}${discountReceipt}${totalReceipt}${instructionsText}`);
    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${fullMessage}`;

    // Open WhatsApp
    window.open(whatsappUrl, '_blank');

    setOrderSubmitting(false);
    setOrderSuccess(true);
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setShippingAddress('');
    setCustomerIdNumber('');

    setTimeout(() => {
      setOrderSuccess(false);
      setIsCartOpen(false);
    }, 4000);
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
        const totalVal = pct > 0 ? Math.round(subtotalVal * (1 - pct / 100)) : subtotalVal;
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
        const totalVal = pct > 0 ? Math.round(subtotalVal * (1 - pct / 100)) : subtotalVal;
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
          setOrderSubmitting(true);
          const res = await fetch('/api/paypal/capture-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderID: data.orderID }),
          });
          const captureData = await res.json();

          if (captureData.status === 'COMPLETED') {
            const paypalOrderNum = `PPCR-${data.orderID || captureData.id || Date.now().toString(36).toUpperCase()}`;

            // Save order to Supabase as Paid
            const ppWaSource = typeof window !== 'undefined' ? localStorage.getItem('whatsapp_source') : null;
            if (isSupabaseConfigured && supabase) {
              try {
                await supabase.from('orders').insert({
                  order_number: paypalOrderNum,
                  customer_name: cName || 'PayPal Customer',
                  customer_phone: cPhone || '',
                  shipping_address: sAddress || '',
                  items: orderItems,
                  total_usd: usdTotal,
                  total_crc: Math.round(usdTotal * rate),
                  currency: 'USD',
                  payment_method: 'paypal',
                  status: 'Paid',
                  customer_email: cEmail || null,
                  ip_address: customerMetadata?.ip_address || null,
                  location_data: customerMetadata?.location_data || null,
                  device_info: customerMetadata?.device_info || null,
                  whatsapp_source: ppWaSource || null,
                });

                if (sid) {
                  await supabase.from('abandoned_carts').update({ status: 'converted' }).eq('session_id', sid);
                  const newSid = 'session_' + Math.random().toString(36).substring(2, 15);
                  localStorage.setItem('cart_session_id', newSid);
                  setSessionId(newSid);
                }
              } catch (err) {
                console.error('Failed to log PayPal order to Supabase:', err);
              }
            }

            await sendOrderNotification({
              orderNumber: paypalOrderNum,
              customerName: cName || 'PayPal Customer',
              customerPhone: cPhone || '',
              customerEmail: cEmail || '',
              shippingAddress: sAddress || '',
              items: orderItems,
              total: usdTotal,
              totalUsd: usdTotal,
              totalCrc: Math.round(usdTotal * rate),
              currency: 'USD',
              paymentMethod: 'paypal',
              status: 'Paid',
            });

            setOrderSubmitting(false);
            setOrderSuccess(true);
            setCart([]);
            setCustomerName('');
            setCustomerPhone('');
            setCustomerEmail('');
            setShippingAddress('');
            setCustomerIdNumber('');
            setTimeout(() => {
              setOrderSuccess(false);
              setIsCartOpen(false);
            }, 4000);
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
    if (inStockOnly && !isInStock(p.status)) return false;

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

  return (
    <div id="app" className="min-h-screen" suppressHydrationWarning>
      {/* Static Top Header Section */}
      <header className="header-top-section">
        <div className="header-top container">
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-main)', textDecoration: 'none', fontWeight: 'bold', marginRight: 'auto' }}>
            <ArrowLeft size={16} />
            {lang === 'en' ? 'Back' : 'Volver'}
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

        <div className="header-content container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <a href="/" className="logo" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <img 
              src="/logo.png" 
              alt="Peptides Costa Rica Logo" 
              className="logo-img-custom"
              style={{ maxHeight: '70px', width: 'auto', objectFit: 'contain', borderRadius: '12px', boxShadow: '0 2px 16px rgba(0,0,0,0.15)' }}
            />
          </a>

          {/* Trust Seals */}
          <div className="trust-badges-container">
            <a href="https://maps.app.goo.gl/RtDYM6HJz1Qwdkip7" target="_blank" rel="noopener noreferrer" className="trust-badge google-maps">
              <svg viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <div className="trust-text">
                <span className="trust-score">Google Reviews</span>
                <span className="trust-desc">
                  5.0 <Star size={8} fill="#FBBC05" color="#FBBC05" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#FBBC05" color="#FBBC05" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#FBBC05" color="#FBBC05" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#FBBC05" color="#FBBC05" style={{display: 'inline', margin: '0 1px'}}/><Star size={8} fill="#FBBC05" color="#FBBC05" style={{display: 'inline', margin: '0 1px'}}/>
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
            <div className="search-input-wrapper">
              <span className="search-icon"><Search size={18} /></span>
              <input 
                type="text" 
                id="searchInput" 
                placeholder={lang === 'en' ? "Search products..." : "Buscar productos..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button onClick={handleViewToggle} className="filter-btn" title="Toggle Layout">
              {viewMode === 'list' && <List size={18} />}
              {viewMode === 'compact' && <Grid size={18} />}
              {viewMode === 'grid' && <Sparkles size={18} />}
            </button>
            <button 
              onClick={() => setShowFilters(!showFilters)} 
              className={`filter-btn ${showFilters ? 'active' : ''}`} 
              title="Filters"
            >
              <Settings size={18} />
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
        {gateLoading ? null : !gateAccessGranted ? (
          <div className="access-gate-overlay" style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh', 
            background: theme === 'dark' ? 'rgba(5, 11, 24, 0.8)' : 'rgba(244, 246, 249, 0.8)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px'
          }}>
            <div className="access-gate-card" style={{
              background: 'var(--bg-card)', padding: '32px 24px', borderRadius: '24px',
              boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)',
              maxWidth: '400px', width: '100%', textAlign: 'center'
            }}>
              <img src="/logo.png" alt="Peptides Costa Rica Logo" style={{ height: '48px', margin: '0 auto 20px auto', display: 'block', borderRadius: '8px' }} />
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
        ) : null}

        <div style={{ opacity: (!gateLoading && !gateAccessGranted) ? 0.3 : 1, pointerEvents: (!gateLoading && !gateAccessGranted) ? 'none' : 'auto', transition: 'opacity 0.3s' }}>
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
          <div className={`product-grid ${viewMode}-view`}>
            {filteredProducts.map((p, idx) => {
              const inStock = isInStock(p.status);
              const comingSoon = isComingSoon(p.status);
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
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} 
                      />
                    ) : getCategoryIcon(p.category)}
                    {!inStock && !comingSoon && (
                      <div className="out-of-stock-overlay">
                        <span>{lang === 'en' ? 'OUT OF STOCK' : 'AGOTADO'}</span>
                      </div>
                    )}
                    {inStock && p.originalPriceUsd && p.originalPriceUsd !== p.priceUsd && (
                      <div className="sale-badge" style={{ position: 'absolute', top: '10px', right: '10px', background: '#ef4444', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', zIndex: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                        {lang === 'en' ? 'SALE' : 'OFERTA'}
                      </div>
                    )}
                  </div>
                  <div className="product-info">
                    <div className="product-category">{translateCategory(p.category)}</div>
                    <h3 className="product-name">{p.product}</h3>
                    {renderRatingSummary(p.product)}
                    <div className="product-pricing">
                      {p.originalPriceUsd && p.originalPriceUsd !== p.priceUsd ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="price-main" style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: '1.1rem' }}>
                            {currency === 'USD' ? p.originalPriceUsd : p.originalPriceCrc}
                          </span>
                          <span className="price-main" style={{ color: '#ef4444' }}>{pMain}</span>
                        </div>
                      ) : (
                        <span className="price-main">{pMain}</span>
                      )}
                      {pSub && <span className="price-sub">{pSub}</span>}
                    </div>
                    {p.discount && <div className="discount-badge">{translateDiscount(p.discount, lang)}</div>}
                    <div className="product-actions" style={{ marginTop: '10px', position: 'relative' }}>
                      {inStock ? (
                        <button 
                          className={`add-to-cart-btn ${addedProductId === p.product ? 'added' : ''}`}
                          onClick={(e) => addToCartWithAnimation(e, p)}
                        >
                          {addedProductId === p.product 
                            ? <Check size={16} /> 
                            : <Plus size={16} />
                          }
                          {addedProductId === p.product 
                            ? (lang === 'en' ? 'Added' : 'Añadido') 
                            : (lang === 'en' ? 'Add To Cart' : 'Agregar al Carrito')
                          }
                        </button>
                      ) : (
                        <button className="add-to-cart-btn out-of-stock-btn" disabled>
                          {lang === 'en' ? 'Out of Stock' : 'Agotado'}
                        </button>
                      )}
                    </div>
                    <div className={`stock-badge ${inStock ? 'stock-in' : comingSoon ? 'stock-soon' : 'stock-out'}`}>
                      {translateStatus(p.status)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </main>


      {/* ─── Floating Cart FAB & Mobile Bottom Bar ─────────────────────────────────────── */}
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
            bottom: 32px;
            right: 32px;
            left: auto;
            width: auto;
            padding: 0;
            background: none !important;
          }
          .cart-fab-sticky {
            border-radius: 28px;
            width: auto;
            padding: 12px 24px;
            font-size: 0.95rem;
            gap: 12px;
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem', opacity: 0.9, fontWeight: 600 }}>{lang === 'en' ? 'View Cart' : 'Ver Carrito'}</span>
                <span>{formatPriceVal(getDiscountedTotal(), currency)}</span>
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
            {/* Subtotal row */}
            <div className="cart-total-row" style={{ opacity: getVolumeDiscountPct(getCartVialCount()) > 0 ? 0.6 : 1 }}>
              <span className="cart-total-label">{lang === 'en' ? 'SUBTOTAL' : 'SUBTOTAL'}</span>
              <span className="cart-total-val" style={getVolumeDiscountPct(getCartVialCount()) > 0 ? { textDecoration: 'line-through', fontSize: '0.9rem' } : {}}>{formatPriceVal(getCartTotal(), currency)}</span>
            </div>

            {/* Volume discount banner */}
            {getVolumeDiscountPct(getCartVialCount()) > 0 && (
              <div style={{ background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(16, 185, 129, 0.1))', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '12px', padding: '10px 14px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.1rem' }}>🏷️</span>
                  <div>
                    <div style={{ color: '#4ade80', fontWeight: '800', fontSize: '0.8rem' }}>
                      {lang === 'en'
                        ? `Volume Discount: ${getVolumeDiscountPct(getCartVialCount())}% OFF`
                        : `Desc. por Volumen: ${getVolumeDiscountPct(getCartVialCount())}% DESC.`}
                    </div>
                    <div style={{ color: '#86efac', fontSize: '0.7rem', marginTop: '2px' }}>
                      {lang === 'en'
                        ? `${getCartVialCount()} vials in cart`
                        : `${getCartVialCount()} viales en carrito`}
                    </div>
                  </div>
                </div>
                <span style={{ color: '#4ade80', fontWeight: '900', fontSize: '0.85rem' }}>-{formatPriceVal(getCartTotal() - getDiscountedTotal(), currency)}</span>
              </div>
            )}

            {/* Next tier hint */}
            {getCartVialCount() >= 1 && getCartVialCount() < 5 && (
              <div style={{ background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.15)', borderRadius: '10px', padding: '8px 12px', marginBottom: '8px', textAlign: 'center', fontSize: '0.75rem', color: '#fbbf24' }}>
                {lang === 'en'
                  ? `🔥 Add ${5 - getCartVialCount()} more vial${5 - getCartVialCount() > 1 ? 's' : ''} for 15% OFF!`
                  : `🔥 ¡Añade ${5 - getCartVialCount()} vial${5 - getCartVialCount() > 1 ? 'es' : ''} más para 15% DESC.!`}
              </div>
            )}
            {getCartVialCount() >= 5 && getCartVialCount() < 10 && (
              <div style={{ background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.15)', borderRadius: '10px', padding: '8px 12px', marginBottom: '8px', textAlign: 'center', fontSize: '0.75rem', color: '#fbbf24' }}>
                {lang === 'en'
                  ? `🔥 Add ${10 - getCartVialCount()} more vial${10 - getCartVialCount() > 1 ? 's' : ''} to unlock 20% OFF!`
                  : `🔥 ¡Añade ${10 - getCartVialCount()} vial${10 - getCartVialCount() > 1 ? 'es' : ''} más para desbloquear 20% DESC.!`}
              </div>
            )}

            {/* Final total row */}
            <div className="cart-total-row" style={{ marginBottom: '4px' }}>
              <span className="cart-total-label" style={{ fontWeight: '900' }}>{lang === 'en' ? 'TOTAL DUE' : 'TOTAL A PAGAR'}</span>
              <span className="cart-total-val" style={{ color: getVolumeDiscountPct(getCartVialCount()) > 0 ? '#4ade80' : undefined }}>{formatPriceVal(getDiscountedTotal(), currency)}</span>
            </div>

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
              <textarea 
                className="checkout-input" 
                placeholder={lang === 'en' ? "Full shipping address:\n\nName\nID / Passport\nProvince, Canton, District\nAddress\nZip code\nPhone" : "Dirección completa de envio:\n\nNombre\nCédula\nProvincia, Cantón, Distrito\nDirección\nCódigo postal\nTeléfono"}
                required
                rows={8}
                style={{ resize: 'vertical' }}
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
              />

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
                    icon: <CreditCard size={18} />,
                    iconColor: '#3b82f6', // Blue for PayPal
                    title: 'PayPal',
                    detail: lang === 'en' ? 'Pay in USD' : 'Pagar en USD',
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
              {paymentMethod === 'sinpe' && (
                <div className="sinpe-id-grid">
                  <select
                    className="checkout-input"
                    value={customerIdType}
                    onChange={(e) => setCustomerIdType(e.target.value)}
                    style={{ appearance: 'auto' }}
                    aria-label={lang === 'en' ? 'Identification type' : 'Tipo de identificación'}
                  >
                    <option value="1">{lang === 'en' ? 'Costa Rican ID' : 'Cédula física'}</option>
                    <option value="6">DIMEX</option>
                    <option value="5">{lang === 'en' ? 'Passport / Foreign ID' : 'Pasaporte / extranjero'}</option>
                    <option value="2">{lang === 'en' ? 'Company ID' : 'Cédula jurídica'}</option>
                  </select>
                  <input
                    type="text"
                    className="checkout-input"
                    placeholder={lang === 'en' ? 'ID number for SINPE' : 'Identificación para SINPE'}
                    required={paymentMethod === 'sinpe'}
                    value={customerIdNumber}
                    onChange={(e) => setCustomerIdNumber(e.target.value)}
                  />
                </div>
              )}
              {paymentMethod === 'paypal' ? (
                <div style={{ marginTop: '16px' }}>
                  {(!customerName || !customerPhone || !shippingAddress) ? (
                    <div style={{ padding: '12px', background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', borderRadius: '12px', textAlign: 'center', fontSize: '0.9rem', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
                      {lang === 'en' ? 'Please enter your name, phone number, and shipping address above to enable PayPal checkout.' : 'Por favor ingrese su nombre, teléfono y dirección de envío arriba para habilitar el pago con PayPal.'}
                    </div>
                  ) : (
                    <div ref={paypalButtonRef} style={{ minHeight: '45px' }}></div>
                  )}
                  {orderSubmitting && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '12px', color: '#94a3b8' }}>
                      <div className="sync-spinner" style={{ width: '16px', height: '16px' }}></div>
                      {lang === 'en' ? 'Processing payment...' : 'Procesando pago...'}
                    </div>
                  )}
                </div>
              ) : paymentMethod === 'tilopay' || paymentMethod === 'sinpe' ? (
                <div className="tilopay-payment-panel">
                  {(!customerName || !customerEmail || !customerPhone || !shippingAddress || (paymentMethod === 'sinpe' && !customerIdNumber)) ? (
                    <div style={{ padding: '12px', background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', borderRadius: '12px', textAlign: 'center', fontSize: '0.9rem', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
                      {paymentMethod === 'sinpe'
                        ? (lang === 'en' ? 'Please enter your contact, shipping, and ID details to continue with SINPE Móvil.' : 'Ingrese sus datos de contacto, envío e identificación para continuar con SINPE Móvil.')
                        : (lang === 'en' ? 'Please enter your full name, email, phone, and shipping address above to pay by card.' : 'Ingrese su nombre, correo, teléfono y dirección de envío para pagar con tarjeta.')}
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
                              ? `Pay ${formatPriceVal(currency === 'CRC' ? getDiscountedTotal() : Math.round(getDiscountedTotal() * exchangeRate), 'CRC')} via SINPE`
                              : `Pagar ${formatPriceVal(currency === 'CRC' ? getDiscountedTotal() : Math.round(getDiscountedTotal() * exchangeRate), 'CRC')} vía SINPE`)
                            : (lang === 'en' ? `Pay ${formatPriceVal(getDiscountedTotal(), currency)} by Card` : `Pagar ${formatPriceVal(getDiscountedTotal(), currency)} con Tarjeta`)}
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
                      lang === 'en' ? 'Submit Order to WhatsApp' : 'Enviar Pedido por WhatsApp'
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
              <h2 style={{ fontSize: '1.5rem', color: 'var(--text-main)', fontWeight: '800', paddingRight: 0 }}>
                {selectedProduct.product}
              </h2>
            </div>
            
            <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '16px', marginBottom: '24px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignProps: 'center', marginProps: '4px' }}>
                <span style={{ fontWeight: '700', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {lang === 'en' ? 'PRICE' : 'PRECIO'}
                </span>
                <span style={{ fontSize: '1.4rem', fontValue: '900', color: 'var(--text-primary)', fontWeight: '900' }}>
                  {currency === 'USD' ? selectedProduct.priceUsd : selectedProduct.priceCrc}
                </span>
              </div>
              {selectedProduct.discount && (
                <div style={{ color: 'var(--accent)', fontWeight: '800', fontSize: '0.85rem', textAlign: 'right', marginTop: '6px' }}>
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
              <div className={`stock-badge ${isInStock(selectedProduct.status) ? 'stock-in' : isComingSoon(selectedProduct.status) ? 'stock-soon' : 'stock-out'}`} style={{ position: 'static' }}>
                {translateStatus(selectedProduct.status)}
              </div>
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

            {isInStock(selectedProduct.status) && (
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
                        <span className="review-date">{new Date(r.created_at).toLocaleDateString()}</span>
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
              href={`https://wa.me/${WHATSAPP_NUMBER}?text=${lang === 'en' ? 'Hi!%20I%20have%20a%20question%20about%20my%20order.' : '%C2%A1Hola!%20Tengo%20algunas%20preguntas.'}`} 
              target="_blank" 
              rel="noreferrer"
              className="whatsapp-btn" 
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
            <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${lang === 'en' ? 'Hi!%20I%20have%20a%20question%20about%20my%20order.' : '%C2%A1Hola!%20Tengo%20algunas%20preguntas.'}`} target="_blank" rel="noreferrer">
              {lang === 'en' ? 'Contact WhatsApp' : 'Contactar WhatsApp'}
            </a>
            <a href="/admin" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: '500' }}>
              {lang === 'en' ? 'Admin Portal' : 'Portal de Admin'}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
