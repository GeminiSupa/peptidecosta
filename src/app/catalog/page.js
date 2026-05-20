"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { 
  ShoppingBag, X, Search, Settings, 
  List, Grid, Sparkles, Phone, FileText, 
  Plus, Minus, Trash2, Check, AlertCircle, ArrowLeft,
  Dna, FlaskConical, Syringe, TestTubes, Atom, 
  Brain, Shield, Moon, Sun, Flame, Zap, Droplets, Microscope, Star
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
  
  if (targetLang === 'en') {
    let result = s.replace(/compra\s+(\d+)\+\s+viales,\s+(\d+)%\s+de\s+descuento/i, 'Buy $1+ vials, get $2% off');
    result = result.replace(/compra\s+(\d+)\+\s+viales,\s+obtenga\s+(\d+)%\s+de\s+descuento/i, 'Buy $1+ vials, get $2% off');
    return result;
  } 
  
  if (targetLang === 'es') {
    let result = s.replace(/buy\s+(\d+)\+\s+vials,\s+get\s+(\d+)%\s+off/i, 'Compra $1+ viales, $2% de descuento');
    return result;
  }
  
  return str;
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
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [howToOrderOpen, setHowToOrderOpen] = useState(false);

  // Checkout inputs
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
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

  // Local storage & URL params setup on mount
  useEffect(() => {
    // URL overrides
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get('lang');
    const currencyParam = urlParams.get('currency');

    let initialLang = 'es';
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

    // Load Data
    loadCatalogData();

    // Fetch live exchange rate
    fetchLiveExchangeRate();
  }, []);

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
              last_updated: new Date().toISOString(),
              status: 'active'
            }, { onConflict: 'session_id' });
          } catch (err) {
            console.error('Failed to sync abandoned cart:', err);
          }
        }
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [cart, customerName, customerPhone, sessionId]);

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

  // Calculate Cart Total
  const getCartTotal = () => {
    return cart.reduce((acc, item) => {
      const price = getPriceAsNumber(item, currency);
      return acc + (price * item.qty);
    }, 0);
  };

  // Checkout submit
  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (!customerName || !customerPhone || cart.length === 0) return;

    setOrderSubmitting(true);

    const totalVal = getCartTotal();
    const orderItems = cart.map(item => ({
      product: item.product,
      qty: item.qty,
      price: getPriceAsNumber(item, currency)
    }));

    let dbSuccess = false;

    // 1. Submit to Supabase if connected
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('orders')
          .insert({
            customer_name: customerName,
            customer_phone: customerPhone,
            items: orderItems,
            total_usd: currency === 'USD' ? totalVal : Math.round(totalVal / exchangeRate),
            total_crc: currency === 'CRC' ? totalVal : Math.round(totalVal * exchangeRate),
            currency: currency,
            payment_method: paymentMethod,
            status: 'Pending'
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

    // 2. Open WhatsApp Receipt
    const receiptHeader = lang === 'en' 
      ? `*PEPTIDES COSTA RICA — NEW ORDER*`
      : `*PÉPTIDOS COSTA RICA — NUEVA ORDEN*`;
      
    const receiptDetails = lang === 'en'
      ? `\n\n*Customer Details:*\n• Name: ${customerName}\n• Phone: ${customerPhone}\n\n*Ordered Items:*`
      : `\n\n*Detalles del Cliente:*\n• Nombre: ${customerName}\n• Teléfono: ${customerPhone}\n\n*Artículos Pedidos:*`;

    const itemReceipts = cart.map(item => {
      const p = getPriceAsNumber(item, currency);
      return `\n• ${item.product} (x${item.qty}) — ${formatPriceVal(p * item.qty, currency)}`;
    }).join('');

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

    const fullMessage = encodeURIComponent(`${receiptHeader}${receiptDetails}${itemReceipts}${totalReceipt}${instructionsText}`);
    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${fullMessage}`;

    // Open WhatsApp
    window.open(whatsappUrl, '_blank');

    setOrderSubmitting(false);
    setOrderSuccess(true);
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');

    setTimeout(() => {
      setOrderSuccess(false);
      setIsCartOpen(false);
    }, 4000);
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
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-main)', textDecoration: 'none', fontWeight: 'bold' }}>
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
      <main className="main container">
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
                  onClick={() => setSelectedProduct(p)}
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
                  </div>
                  <div className="product-info">
                    <div className="product-category">{translateCategory(p.category)}</div>
                    <h3 className="product-name">{p.product}</h3>
                    {renderRatingSummary(p.product)}
                    <div className="product-pricing">
                      <span className="price-main">{pMain}</span>
                      {pSub && <span className="price-sub">{pSub}</span>}
                    </div>
                    {p.discount && <div className="discount-badge">{p.discount}</div>}
                    <div className={`stock-badge ${inStock ? 'stock-in' : comingSoon ? 'stock-soon' : 'stock-out'}`}>
                      {translateStatus(p.status)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>



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
                  <button className="suggestion-add-btn" title={lang === 'en' ? 'Add' : 'Añadir'}>
                    <Plus size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {cart.length > 0 && !orderSuccess && (
          <div className="cart-footer">
            <div className="cart-total-row">
              <span className="cart-total-label">{lang === 'en' ? 'SUBTOTAL DUE' : 'SUBTOTAL A PAGAR'}</span>
              <span className="cart-total-val">{formatPriceVal(getCartTotal(), currency)}</span>
            </div>

            <form onSubmit={handleCheckoutSubmit} className="checkout-form">
              <input 
                type="text" 
                className="checkout-input" 
                placeholder={lang === 'en' ? "Your Full Name" : "Su Nombre Completo"}
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <input 
                type="tel" 
                className="checkout-input" 
                placeholder={lang === 'en' ? "WhatsApp Phone Number" : "Número de WhatsApp"}
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
              <select
                className="checkout-input"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{ appearance: 'auto' }}
              >
                <option value="whatsapp">{lang === 'en' ? 'Pay via WhatsApp Coordination' : 'Pago vía Coordinación por WhatsApp'}</option>
                <option value="sinpe">{lang === 'en' ? 'Pay via SINPE Móvil' : 'Pago vía SINPE Móvil'}</option>
                <option value="paypal">{lang === 'en' ? 'Pay via PayPal' : 'Pago vía PayPal'}</option>
              </select>
              <button 
                type="submit" 
                className="whatsapp-btn"
                disabled={orderSubmitting}
              >
                {orderSubmitting ? (
                  <div className="sync-spinner" style={{ width: '16px', height: '16px' }}></div>
                ) : (
                  lang === 'en' ? 'Submit Order to WhatsApp' : 'Enviar Pedido por WhatsApp'
                )}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="modal active" onClick={() => setSelectedProduct(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setSelectedProduct(null)}>&times;</button>
            
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
              href={`https://wa.me/${WHATSAPP_NUMBER}`} 
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
            <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noreferrer">
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
