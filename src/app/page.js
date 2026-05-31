"use client";

import React, { useState, useEffect } from 'react';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { buildWhatsAppLink, logWhatsAppSource } from '@/lib/whatsapp';
import {
  ArrowRight, ArrowUpRight, ShieldCheck, Truck, CreditCard, MessageCircle,
  Sun, Moon, ChevronDown, ChevronUp, Star, FlaskConical, Lock,
  Dna, Atom, Zap, Brain, Sparkles, CheckCircle, ExternalLink
} from 'lucide-react';

const T = {
  en: {
    nav_shop: 'Shop Now',
    badge: 'Verified Local Supplier · Costa Rica',
    hero_title: 'Buy Peptides in Costa Rica',
    hero_sub: 'Lab-Tested. High Purity. Fast Local Delivery.',
    hero_text: 'Your trusted local source for premium, research grade peptides. Verified quality, transparent pricing, and secure checkout.',
    hero_cta: 'Browse All Products',
    hero_cta2: 'WhatsApp Us',
    trust1: 'Verified Quality',
    trust2: 'Transparent Pricing',
    trust3: 'Local Reliability',
    features_title: 'Why Choose Peptides Costa Rica?',
    features_sub: 'We combine scientific rigor with local reliability to give you the best peptide purchasing experience.',
    f1_title: 'Lab-Tested & Certified',
    f1_desc: 'Every product comes with a Certificate of Analysis (COA) from independent third-party laboratories.',
    f2_title: 'Fast Local Delivery',
    f2_desc: 'Based in Costa Rica. Orders shipped within 24-48 hours across all provinces.',
    f3_title: 'Secure Payments',
    f3_desc: 'Pay securely via SINPE Móvil, card, or PayPal. All transactions are encrypted and PCI compliant.',
    f4_title: 'Expert Support',
    f4_desc: 'Our team is available on WhatsApp to answer questions about peptides, dosing, and reconstitution.',
    cats_title: 'Our Product Categories',
    cats_sub: 'Research-grade peptides across a wide range of therapeutic applications.',
    featured_title: 'Featured Products',
    featured_sub: 'Top-selling peptides with verified purity and competitive pricing.',
    featured_btn: 'View Details',
    in_stock: 'In Stock',
    out_stock: 'Out of Stock',
    test_title: 'What Our Customers Say',
    test_sub: 'Trusted by researchers and health professionals across Costa Rica.',
    faq_title: 'Frequently Asked Questions',
    faq_sub: 'Everything you need to know before placing your order.',
    faq_q1: 'Are your peptides research grade?',
    faq_a1: 'Yes. All peptides are HPLC-tested and come with a Certificate of Analysis (COA) from independent labs, guaranteeing ≥98% purity.',
    faq_q2: 'How do I pay?',
    faq_a2: 'We accept SINPE Móvil (CRC), credit/debit cards (Visa, Mastercard), and PayPal (USD). All payments are handled securely through our encrypted checkout.',
    faq_q3: 'How fast is delivery?',
    faq_a3: 'We ship within 24–48 hours of payment confirmation. Delivery to most areas of Costa Rica takes 1–3 business days.',
    faq_q4: 'Do you include reconstitution supplies?',
    faq_a4: 'Yes! We offer bacteriostatic water and syringes. Add them to your cart in the Reconstitution Supply category.',
    faq_q5: 'Can I order via WhatsApp?',
    faq_a5: 'Absolutely. Message us on WhatsApp (+506 8404-6973) and we will walk you through your order.',
    cta_title: 'Ready to Order?',
    cta_sub: 'Browse our full catalog of premium peptides and place your order securely today.',
    cta_btn: 'Shop the Catalog',
    cta_wa: 'Chat on WhatsApp',
    footer_desc: 'Peptides Costa Rica offers premium, research backed peptides with trusted quality and bulk savings.',
    footer_copy: 'All rights reserved. For research purposes only.',
  },
  es: {
    nav_shop: 'Comprar',
    badge: 'Proveedor Local Verificado · Costa Rica',
    hero_title: 'Compra Péptidos en Costa Rica',
    hero_sub: 'Testados en Laboratorio. Alta Pureza. Entrega Local Rápida.',
    hero_text: 'Tu fuente local de confianza para péptidos premium de grado investigación. Calidad verificada, precios transparentes y pago seguro.',
    hero_cta: 'Ver Todos los Productos',
    hero_cta2: 'Escríbenos por WhatsApp',
    trust1: 'Calidad Verificada',
    trust2: 'Precios Transparentes',
    trust3: 'Confiabilidad Local',
    features_title: '¿Por qué elegir Peptides Costa Rica?',
    features_sub: 'Combinamos rigor científico con confiabilidad local para darte la mejor experiencia de compra de péptidos.',
    f1_title: 'Certificados de Laboratorio',
    f1_desc: 'Cada producto incluye un Certificado de Análisis (COA) de laboratorios independientes.',
    f2_title: 'Entrega Local Rápida',
    f2_desc: 'Con base en Costa Rica. Pedidos enviados en 24–48 horas a todas las provincias.',
    f3_title: 'Pagos Seguros',
    f3_desc: 'Paga con SINPE Móvil, tarjeta o PayPal. Todas las transacciones son seguras y cifradas.',
    f4_title: 'Soporte Experto',
    f4_desc: 'Nuestro equipo está disponible en WhatsApp para responder dudas sobre péptidos, dosis y reconstitución.',
    cats_title: 'Nuestras Categorías',
    cats_sub: 'Péptidos de grado investigación para una amplia gama de aplicaciones terapéuticas.',
    featured_title: 'Productos Destacados',
    featured_sub: 'Los péptidos más vendidos con pureza verificada y precios competitivos.',
    featured_btn: 'Ver Detalles',
    in_stock: 'Disponible',
    out_stock: 'Agotado',
    test_title: 'Lo que dicen nuestros clientes',
    test_sub: 'La confianza de investigadores y profesionales de la salud en toda Costa Rica.',
    faq_title: 'Preguntas Frecuentes',
    faq_sub: 'Todo lo que necesitas saber antes de hacer tu pedido.',
    faq_q1: '¿Sus péptidos son de grado investigación?',
    faq_a1: 'Sí. Todos los péptidos son probados por HPLC y vienen con un Certificado de Análisis (COA) de laboratorios independientes, garantizando ≥98% de pureza.',
    faq_q2: '¿Cómo puedo pagar?',
    faq_a2: 'Aceptamos SINPE Móvil (CRC), tarjetas de crédito/débito (Visa, Mastercard) y PayPal (USD). Todos los pagos son procesados de forma segura.',
    faq_q3: '¿Qué tan rápido es el envío?',
    faq_a3: 'Enviamos en 24–48 horas tras la confirmación del pago. La entrega en la mayoría de provincias tarda 1–3 días hábiles.',
    faq_q4: '¿Incluyen suministros de reconstitución?',
    faq_a4: 'Sí. Ofrecemos agua bacteriostática y jeringas. Agrégalos al carrito en la categoría Suministros de Reconstitución.',
    faq_q5: '¿Puedo pedir por WhatsApp?',
    faq_a5: 'Por supuesto. Escríbenos al WhatsApp (+506 8404-6973) y te guiamos con tu pedido.',
    cta_title: '¿Listo para Ordenar?',
    cta_sub: 'Explora nuestro catálogo completo de péptidos premium y haz tu pedido de forma segura hoy.',
    cta_btn: 'Ver el Catálogo',
    cta_wa: 'Chatear en WhatsApp',
    footer_desc: 'Peptides Costa Rica ofrece péptidos premium respaldados por ciencia, con calidad garantizada y descuentos por volumen.',
    footer_copy: 'Todos los derechos reservados. Solo para fines de investigación.',
  }
};

const CATEGORIES = [
  { icon: <Atom size={28} strokeWidth={1.8} />, en: 'Weight Loss & Metabolism', es: 'Pérdida de Peso y Metabolismo' },
  { icon: <Dna size={28} strokeWidth={1.8} />, en: 'Recovery & Healing', es: 'Recuperación y Curación' },
  { icon: <Brain size={28} strokeWidth={1.8} />, en: 'Cognitive & Mood', es: 'Cognitivo y Estado de Ánimo' },
  { icon: <Zap size={28} strokeWidth={1.8} />, en: 'Performance & Hormones', es: 'Rendimiento y Hormonas' },
  { icon: <Sparkles size={28} strokeWidth={1.8} />, en: 'Anti-Aging & Longevity', es: 'Antienvejecimiento y Longevidad' },
  { icon: <FlaskConical size={28} strokeWidth={1.8} />, en: 'Reconstitution Supply', es: 'Suministros de Reconstitución' },
];

const TESTIMONIALS = [
  { name: 'Carlos M.', location: 'San José', rating: 5, text_en: 'Best quality peptides I\'ve found in Costa Rica. Fast delivery and the COA documentation gave me full confidence.', text_es: 'La mejor calidad de péptidos que he encontrado en Costa Rica. Entrega rápida y el COA me dio total confianza.' },
  { name: 'Ana R.', location: 'Heredia', rating: 5, text_en: 'Amazing service. I ordered BPC-157 and it arrived the next day. The WhatsApp support is really helpful for beginners.', text_es: 'Servicio increíble. Pedí BPC-157 y llegó al día siguiente. El soporte por WhatsApp es muy útil para principiantes.' },
  { name: 'Rodrigo V.', location: 'Cartago', rating: 5, text_en: 'Transparent pricing, secure SINPE payment, and the products are exactly as described. Highly recommended.', text_es: 'Precios transparentes, pago seguro por SINPE y los productos son exactamente como se describen. Muy recomendado.' },
];

export default function LandingPage() {
  const [theme, setTheme] = useState('light');
  const [lang, setLang] = useState('es');
  const [openFaq, setOpenFaq] = useState(null);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [scrolled, setScrolled] = useState(false);

  // Click handler for WhatsApp links – logs source and stores it for checkout
  /** @param {string} src */
const handleWhatsAppClick = (src) => {
    logWhatsAppSource(src);
    if (typeof window !== 'undefined') {
      localStorage.setItem('whatsapp_source', src);
    }
  };
  const [cmsSettings, setCmsSettings] = useState(null);

  const t = { ...T[lang] };
  if (cmsSettings) {
    if (lang === 'en') {
      if (cmsSettings.heroTitleEn) t.hero_title = cmsSettings.heroTitleEn;
      if (cmsSettings.heroSubEn) t.hero_sub = cmsSettings.heroSubEn;
      if (cmsSettings.heroTextEn) t.hero_text = cmsSettings.heroTextEn;
    } else {
      if (cmsSettings.heroTitleEs) t.hero_title = cmsSettings.heroTitleEs;
      if (cmsSettings.heroSubEs) t.hero_sub = cmsSettings.heroSubEs;
      if (cmsSettings.heroTextEs) t.hero_text = cmsSettings.heroTextEs;
    }
  }

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const savedLang = localStorage.getItem('lang') || 'es';
    setTheme(savedTheme);
    setLang(savedLang);
    document.documentElement.setAttribute('data-theme', savedTheme);

    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const loadFeatured = async () => {
      if (!isSupabaseConfigured || !supabase) return;
      const { data: prodData } = await supabase
        .from('products')
        .select('product, price_usd, price_crc, original_price_usd, original_price_crc, status, image_url, category, emoji')
        .eq('status', 'In Stock')
        .order('priority', { ascending: true })
        .limit(4);
      if (prodData) setFeaturedProducts(prodData);

      const { data: settingsData } = await supabase.from('site_settings').select('value').eq('id', 'landing_page').single();
      if (settingsData && settingsData.value) {
        setCmsSettings(settingsData.value);
      }
    };
    loadFeatured();
  }, []);

  const handleTheme = (t) => {
    setTheme(t);
    localStorage.setItem('theme', t);
    document.documentElement.setAttribute('data-theme', t);
  };

  const handleLang = (l) => {
    setLang(l);
    localStorage.setItem('lang', l);
  };

  const faqs = [
    { q: t.faq_q1, a: t.faq_a1 },
    { q: t.faq_q2, a: t.faq_a2 },
    { q: t.faq_q3, a: t.faq_a3 },
    { q: t.faq_q4, a: t.faq_a4 },
    { q: t.faq_q5, a: t.faq_a5 },
  ];

  return (
    <div className="landing-layout min-h-screen">
      {cmsSettings && cmsSettings.bannerActive && (
        <div style={{ background: '#38bdf8', color: '#050b18', textAlign: 'center', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 'bold' }}>
          {lang === 'en' ? cmsSettings.bannerTextEn : cmsSettings.bannerTextEs}
        </div>
      )}

      {/* ── HEADER ────────────────────────────────────────── */}
      <header className={`lp-header${scrolled ? ' lp-header--scrolled' : ''}`} style={cmsSettings?.bannerActive ? { top: scrolled ? '0' : 'auto' } : {}}>
        <div className="lp-header-inner">
          <Link href="/" className="lp-logo">
            <img src="/logo.png" alt="Peptides Costa Rica" className="logo-img-custom" style={{ maxHeight: '34px', width: 'auto', borderRadius: '4px' }} />
          </Link>

          <nav className="lp-nav">
            <Link href={`/catalog?lang=${lang}`}>{lang === 'en' ? 'Catalog' : 'Catálogo'}</Link>
            <Link href={`/blog?lang=${lang}`}>{lang === 'en' ? 'Blog' : 'Blog'}</Link>
            <a href="#contacto">{lang === 'en' ? 'Contact' : 'Contacto'}</a>
          </nav>

          <div className="lp-header-actions">
            <div className="lp-controls">
              <div className="theme-toggle">
                <button onClick={() => handleTheme('light')} className={theme === 'light' ? 'active' : ''} title="Light"><Sun size={14} strokeWidth={2.5} /></button>
                <button onClick={() => handleTheme('dark')} className={theme === 'dark' ? 'active' : ''} title="Dark"><Moon size={14} strokeWidth={2.5} /></button>
              </div>
              <div className="lang-selector">
                <button onClick={() => handleLang('es')} className={lang === 'es' ? 'active' : ''}>ES</button>
                <button onClick={() => handleLang('en')} className={lang === 'en' ? 'active' : ''}>EN</button>
              </div>
            </div>
            <Link href={`/catalog?lang=${lang}`} className="lp-nav-cta">
              {t.nav_shop} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </header>

      <main>

        {/* ── HERO ──────────────────────────────────────────── */}
        <section className="lp-hero" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="lp-hero-bg-image" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundImage: 'url(/peptide_molecular_3d.png)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.15, zIndex: 0 }} />
          <div className="lp-hero-glow" style={{ zIndex: 1 }} />
          <div className="container lp-hero-grid" style={{ position: 'relative', zIndex: 2 }}>
            <div className="lp-hero-text-block">
              <div className="hero-badge">{t.badge}</div>
              <h1 className="hero-title">{t.hero_title}</h1>
              <p className="lp-hero-sub">{t.hero_sub}</p>
              <p className="hero-text">{t.hero_text}</p>

              <div className="hero-actions">
                <Link href={`/catalog?lang=${lang}`} className="btn-hero-primary">
                  {t.hero_cta} <ArrowUpRight size={18} />
                </Link>
                <a 
          className="lp-hero-btn-secondary lp-wa-btn-main"
          href="https://wa.me/50684046973"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            handleWhatsAppClick('homepage');
            window.open(buildWhatsAppLink('50684046973'), '_blank');
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="12" fill="#25D366" />
            <path fillRule="evenodd" clipRule="evenodd" d="M12.022 17.502c1.025 0 2.02-.276 2.894-.799l2.072.544-.553-2.021a5.459 5.459 0 0 0 .848-2.909c0-3.023-2.46-5.483-5.483-5.483-3.024 0-5.484 2.46-5.484 5.483 0 1.293.45 2.507 1.22 3.477l-.547 2.003 2.051-.537a5.46 5.46 0 0 0 2.482.642Z" fill="white" />
          </svg>
          {t.hero_cta2}
        </a>
                  


  
              </div>

              <div className="hero-features-row">
                <span><CheckCircle size={14} color="#4ade80" /> {t.trust1}</span>
                <span><CheckCircle size={14} color="#4ade80" /> {t.trust2}</span>
                <span><CheckCircle size={14} color="#4ade80" /> {t.trust3}</span>
              </div>
            </div>

            <div className="lp-hero-visual-block">
              <div className="lp-hero-image-glow" />
              <img src="/vial_costarica_hero.png" alt="Peptides Costa Rica Vial" className="lp-hero-main-img" style={{ mixBlendMode: 'multiply' }} />

              <div className="lp-floating-badge" style={{ backdropFilter: 'blur(12px)', background: 'rgba(255, 255, 255, 0.1)' }}>
                <div className="lp-badge-icon">
                  <FlaskConical size={18} />
                </div>
                <div className="lp-badge-text">
                  <span className="lp-badge-title">{lang === 'en' ? 'Purity ≥98% Certified' : 'Pureza ≥98% Certificada'}</span>
                  <span className="lp-badge-desc">{lang === 'en' ? 'Rigorous HPLC third-party testing' : 'Pruebas rigurosas de laboratorio independiente'}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── ABOUT US ─────────────────────────────────────── */}
        <section className="lp-section lp-about-section">
          <div className="container">
            <div className="lp-about-intro">
              <span className="lp-about-badge">{lang === 'en' ? 'ABOUT US' : 'SOBRE NOSOTROS'}</span>
              <h2 className="lp-about-heading">
                {lang === 'en' ? 'Welcome to Peptides Costa Rica your trusted source for premium-quality, ' : 'Bienvenidos a Peptides Costa Rica su fuente de confianza para péptidos de calidad premium y '}
                <span className="lp-highlight">{lang === 'en' ? 'lab-tested peptides.' : 'pureza certificada.'}</span>
              </h2>
            </div>

            <div className="lp-about-cards-grid">
              {/* Card 1: Scientist/Lab Image */}
              <div className="lp-about-card lp-about-card--image">
                <img src="/vials_group_costarica.png" alt="Peptides Costa Rica Group" className="lp-about-card-img" style={{ mixBlendMode: 'multiply', width: '100%', height: 'auto' }} />
                <div className="lp-about-card-overlay glassmorphism-overlay">
                  <h3>{lang === 'en' ? 'Trust, Transparency, Results' : 'Confianza, Transparencia, Resultados'}</h3>
                  <p>{lang === 'en' ? 'Rigorous verification of every single batch we supply.' : 'Verificación rigurosa de cada lote que distribuimos.'}</p>
                </div>
              </div>

              {/* Card 2: Quick Links / Category Selector */}
              <div className="lp-about-card lp-about-card--links">
                <div className="lp-about-card-content">
                  <h3>{lang === 'en' ? 'Premium Research Catalog' : 'Catálogo de Investigación Premium'}</h3>
                  <p>{lang === 'en' ? 'Discover our specialized peptides categorized by research target.' : 'Descubra nuestros péptidos especializados clasificados por objetivo de investigación.'}</p>

                  <div className="lp-about-quick-links">
                    <Link href={`/catalog?category=Weight+Loss+%26+Metabolism&lang=${lang}`} className="lp-about-link-item">
                      <span>{lang === 'en' ? 'Weight Loss & Metabolism' : 'Pérdida de Peso y Metabolismo'}</span>
                      <ArrowRight size={16} />
                    </Link>
                    <Link href={`/catalog?category=Recovery+%26+Healing&lang=${lang}`} className="lp-about-link-item">
                      <span>{lang === 'en' ? 'Recovery & Healing' : 'Recuperación y Curación'}</span>
                      <ArrowRight size={16} />
                    </Link>
                    <Link href={`/catalog?category=Anti-Aging+%26+Longevity&lang=${lang}`} className="lp-about-link-item">
                      <span>{lang === 'en' ? 'Anti-Aging & Longevity' : 'Antienvejecimiento y Longevidad'}</span>
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURES ─────────────────────────────────────── */}
        <section className="lp-section lp-features-section">
          <div className="container">
            <div className="lp-section-header">
              <h2>{t.features_title}</h2>
              <p>{t.features_sub}</p>
            </div>
            <div className="lp-features-grid">
              {[
                { icon: <ShieldCheck size={30} />, title: t.f1_title, desc: t.f1_desc, color: '#C8530C' },
                { icon: <Truck size={30} />, title: t.f2_title, desc: t.f2_desc, color: '#002766' },
                { icon: <Lock size={30} />, title: t.f3_title, desc: t.f3_desc, color: '#002766' },
                { icon: <MessageCircle size={30} />, title: t.f4_title, desc: t.f4_desc, color: '#C8530C' },
              ].map((f, i) => (
                <div key={i} className="lp-feature-card">
                  <div className="lp-feature-icon" style={{ color: f.color }}>{f.icon}</div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CATEGORIES ───────────────────────────────────── */}
        <section className="lp-section lp-cats-section">
          <div className="container">
            <div className="lp-section-header">
              <h2>{t.cats_title}</h2>
              <p>{t.cats_sub}</p>
            </div>
            <div className="lp-cats-grid">
              {CATEGORIES.map((c, i) => (
                <Link
                  key={i}
                  href={`/catalog?category=${encodeURIComponent(c.en)}&lang=${lang}`}
                  className="lp-cat-card"
                >
                  <div className="lp-cat-icon">{c.icon}</div>
                  <span>{lang === 'en' ? c.en : c.es}</span>
                  <ArrowRight size={16} className="lp-cat-arrow" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── FEATURED PRODUCTS ─────────────────────────────── */}
        {featuredProducts.length > 0 && (
          <section className="lp-section lp-featured-section">
            <div className="container">
              <div className="lp-section-header">
                <h2>{t.featured_title}</h2>
                <p>{t.featured_sub}</p>
              </div>
              <div className="lp-products-grid">
                {featuredProducts.map((p, i) => (
                  <div key={i} className="lp-product-card">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.product} className="lp-product-img" />
                    ) : (
                      <div className="lp-product-img-placeholder">
                        <FlaskConical size={40} strokeWidth={1.5} />
                      </div>
                    )}
                    <div className="lp-product-body">
                      {p.original_price_usd && p.original_price_usd !== p.price_usd && (
                        <div className="sale-badge">
                          {lang === 'en' ? 'SALE' : 'OFERTA'}
                        </div>
                      )}
                      <span className={`lp-stock-badge${p.status?.toLowerCase() === 'in stock' ? ' in-stock' : ' out-stock'}`}>
                        {p.status?.toLowerCase() === 'in stock' ? t.in_stock : t.out_stock}
                      </span>
                      <h4>{p.product}</h4>
                      <div className="lp-product-price">
                        {p.original_price_usd && p.original_price_usd !== p.price_usd ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="price-original">
                              {lang === 'en' ? p.original_price_usd : p.original_price_crc || p.original_price_usd}
                            </span>
                            <span className="price-sale">{lang === 'en' ? p.price_usd : p.price_crc || p.price_usd}</span>
                          </div>
                        ) : (
                          lang === 'en' ? p.price_usd : p.price_crc || p.price_usd
                        )}
                      </div>
                      <Link href={`/catalog?product=${encodeURIComponent(p.product)}&lang=${lang}`} className="lp-product-btn">
                        {t.featured_btn} <ArrowUpRight size={14} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'center', marginTop: '40px' }}>
                <Link href={`/catalog?lang=${lang}`} className="btn-outline">
                  {lang === 'en' ? 'View All Products' : 'Ver Todos los Productos'} <ExternalLink size={15} style={{ marginLeft: 6, display: 'inline' }} />
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* ── TESTIMONIALS ─────────────────────────────────── */}
        <section className="lp-section lp-testimonials-section">
          <div className="container">
            <div className="lp-section-header">
              <h2>{t.test_title}</h2>
              <p>{t.test_sub}</p>
            </div>
            <div className="lp-testimonials-grid">
              {TESTIMONIALS.map((t2, i) => (
                <div key={i} className="lp-testimonial-card">
                  <div className="lp-stars">{'★'.repeat(t2.rating)}</div>
                  <p className="lp-testimonial-text">"{lang === 'en' ? t2.text_en : t2.text_es}"</p>
                  <div className="lp-reviewer">
                    <div className="lp-reviewer-avatar">{t2.name[0]}</div>
                    <div>
                      <div className="lp-reviewer-name">{t2.name}</div>
                      <div className="lp-reviewer-loc">{t2.location}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────── */}
        <section className="lp-section lp-faq-section" id="contacto">
          <div className="container lp-faq-grid-layout">
            <div className="lp-faq-help-card">
              <span className="lp-faq-tag">{lang === 'en' ? 'HELP CENTER' : 'CENTRO DE AYUDA'}</span>
              <h2>{lang === 'en' ? 'Need Help?' : '¿Necesita Ayuda?'}</h2>
              <p>{lang === 'en' ? 'Our customer support team is available on WhatsApp and Email to answer all your questions about peptides, shipping, or payments.' : 'Nuestro equipo de soporte está disponible en WhatsApp y correo para responder sus dudas sobre péptidos, envíos o pagos.'}</p>

              <div className="lp-faq-contact-actions">
                <a 
                  href="https://wa.me/50684046973" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="lp-faq-btn-wa"
                  onClick={(e) => {
                    e.preventDefault();
                    window.open(buildWhatsAppLink('50684046973', lang === 'en' ? 'Chat on WhatsApp' : 'Chatear por WhatsApp'), '_blank');
                  }}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M12.031 2a9.992 9.992 0 0 0-8.675 14.901L2 22l5.256-1.378A9.972 9.972 0 0 0 12.03 22c5.523 0 10-4.477 10-10S17.554 2 12.03 2Zm5.535 14.288c-.247.697-1.218 1.282-1.687 1.332-.469.052-.937.28-3.007-.582-2.483-1.034-4.045-3.565-4.168-3.73-.124-.165-1.007-1.34-1.007-2.555 0-1.217.638-1.815.865-2.062.227-.247.495-.309.66-.309.165 0 .33.003.475.01.155.007.361-.059.567.433.206.495.701 1.71.763 1.834.062.124.103.268.02.433-.082.165-.124.268-.247.412-.124.144-.262.32-.375.43-.124.124-.253.258-.108.505.144.248.643 1.056 1.382 1.713.953.847 1.753 1.109 2.001 1.233.247.124.392.103.536-.062.144-.165.619-.722.784-.969.165-.247.33-.206.557-.124.227.082 1.443.68 1.691.804.247.124.412.185.474.289.062.103.062.597-.186 1.294Z" />
                  </svg>
                  {lang === 'en' ? 'Chat on WhatsApp' : 'Chatear por WhatsApp'}
                </a>
                <a href="mailto:info@peptidescostarica.net" className="lp-faq-btn-email">
                  {lang === 'en' ? 'Send an Email' : 'Enviar un Correo'}
                </a>
              </div>
            </div>

            <div className="lp-faq-accordion-block">
              <div className="lp-section-header-left">
                <h2>{t.faq_title}</h2>
                <p>{t.faq_sub}</p>
              </div>
              <div className="lp-faq-list">
                {faqs.map((faq, i) => (
                  <div key={i} className={`lp-faq-item${openFaq === i ? ' open' : ''}`}>
                    <button
                      className="lp-faq-question"
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    >
                      <span>{faq.q}</span>
                      {openFaq === i ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                    <div className="lp-faq-answer">
                      <p>{faq.a}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA BANNER ───────────────────────────────────── */}
        <section className="lp-cta-section">
          <div className="lp-cta-glow" />
          <div className="container lp-cta-content">
            <h2>{t.cta_title}</h2>
            <p>{t.cta_sub}</p>
            <div className="lp-cta-actions">
              <Link href={`/catalog?lang=${lang}`} className="lp-cta-primary">
                {t.cta_btn} <ArrowUpRight size={18} />
              </Link>
              <a
                href="https://wa.me/50684046973"
                target="_blank"
                rel="noopener noreferrer"
                className="lp-cta-secondary"
                onClick={(e) => {
                  e.preventDefault();
                  window.open(buildWhatsAppLink('50684046973'), '_blank');
                }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style={{ marginRight: 6 }}>
                  <path d="M12.031 2a9.992 9.992 0 0 0-8.675 14.901L2 22l5.256-1.378A9.972 9.972 0 0 0 12.03 22c5.523 0 10-4.477 10-10S17.554 2 12.03 2Z" />
                </svg>
                {t.cta_wa}
              </a>
            </div>
          </div>
        </section>

      </main>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer className="footer" style={{ marginTop: 0 }}>
        <div className="container">
          <img src="/logo.png" alt="Logo" style={{ height: '36px', marginBottom: '16px', opacity: 0.95, borderRadius: '8px' }} />
          <p>{t.footer_desc}</p>
          <div className="footer-links" style={{ marginBottom: '24px' }}>
            <Link href={`/catalog?lang=${lang}`}>{lang === 'en' ? 'Shop Catalog' : 'Catálogo'}</Link>
            <a href="mailto:info@peptidescostarica.net">info@peptidescostarica.net</a>
            <a href="tel:+50684046973">CR: +506 8404-6973</a>
            <Link href="/admin" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: '500' }}>
              {lang === 'en' ? 'Admin Portal' : 'Portal de Admin'}
            </Link>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} Peptides Costa Rica. {t.footer_copy}
          </div>
        </div>
      </footer>

    </div>
  );
}
