"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { buildWhatsAppLink, logWhatsAppSource } from '@/lib/whatsapp';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { ArrowRight, ArrowUpRight, Truck, MessageCircle, ChevronDown, ChevronUp, FlaskConical, Lock, Dna, Atom, Zap, Brain, Sparkles, CheckCircle, ExternalLink, Menu, X } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import NewsletterSignup from '@/components/NewsletterSignup';
import PromoTicker from '@/components/PromoTicker';
import TrustFlowBand from '@/components/TrustFlowBand';
import MobileActionBar from '@/components/MobileActionBar';
import './landing.css';

const T = {
  en: {
    nav_shop:'Shop',hero_title:'Research peptides, already in Costa Rica.',hero_sub:'See the batch documentation, know the price, and order locally without international customs delays.',hero_cta:'Shop Now',hero_cta2:'Talk to Expert',t1:'COAs available',t2:'Local delivery',t3:'Real human support',tr1_t:'See the documentation',tr1_d:'Review the available Certificate of Analysis before you decide what to order.',tr2_t:'Skip international customs',tr2_d:'Stock is already in Costa Rica, with delivery coordinated locally.',tr3_t:'Talk to a real person',tr3_d:'Joey and Sean answer questions directly in Spanish or English.',how_t:'From catalog to delivery',how_s:'A straightforward local ordering process.',cats_t:'Browse by Category',cats_s:'Research-grade peptides organized by application area.',feat_t:'Best sellers',feat_s:'Frequently requested products from our local inventory.',feat_btn:'See Details',in_stock:'In Stock',out_stock:'Out of Stock',res_t:'Customer Experience Highlights',res_s:'Feedback shared by our research community in Costa Rica.',res_disc:'Results may vary. Products are intended strictly for research use only and are not intended to diagnose, treat, cure, or prevent any disease.',faq_t:'Frequently Asked Questions',faq_s:'The practical details before you order.',faq_q1:'Are your peptides lab-tested?',faq_a1:'Yes. Every product comes with a Certificate of Analysis (COA) from independent third-party HPLC labs, guaranteeing ≥98% purity.',faq_q2:'How do I order?',faq_a2:'Browse our catalog, add items to your cart, and confirm via WhatsApp. We send payment details and dispatch within 24-48 hours.',faq_q3:'Do you deliver throughout Costa Rica?',faq_a3:'Yes. We ship to all provinces. Delivery takes 1–3 business days after payment confirmation.',faq_q4:'Can I contact you on WhatsApp?',faq_a4:'Absolutely. Message us at +506 8404-6973. We reply in both Spanish and English.',faq_q5:'Are products for research use only?',faq_a5:'Yes. All products are strictly for laboratory research. Not for human or veterinary consumption.',    cta_t:'Ready to order?',cta_s:'Browse 300+ research products with current Costa Rica stock and batch details.',cta_btn:'See Inventory',cta_wa:'WhatsApp Us',f_desc:'Research peptides stocked locally in Costa Rica, with clear documentation and direct support.',f_copy:'All rights reserved. For research purposes only. Not for human consumption.',
    story_badge:'OUR STORY',story_t:'Built on Real Experience in Costa Rica',story_intro:'Peptides Costa Rica was founded by two longtime friends and training partners with deep roots in combat sports and high-performance training. Our business began not in an office, but in gyms, fight camps, and recovery rooms — after years of pushing ourselves to the limit.',
    story_origin_t:'From the Fight World to Peptides Costa Rica',story_origin_d:'More than 15 years ago, Joey Webster and Sean McCully moved from California to Costa Rica searching for a better lifestyle. They soon found a shared mission: helping others perform better, recover faster, and stay healthy for the long term.',
    sean_t:'Sean McCully',sean_role:'Combat Sports Pioneer',sean_d:'World champion in Muay Thai and kickboxing, early MMA pioneer, and founder of LA Boxing. Today he runs McCully\'s Fight Club in Costa Rica, coaching fighters at every level. Decades of competitive fighting shaped his vision for recovery and performance.',
    joey_t:'Joey Webster',joey_role:'Wrestling Champion & Fighter',joey_d:'California State Wrestling Championships record-holder for fastest pin. After moving to Costa Rica, Joey trained in boxing, Muay Thai, and MMA. Despite multiple surgeries, he returned to the ring within a year — winning with a first-round knockout.',
    story_why_t:'Why Peptides Became Part of Our Journey',story_why_d:'Years of training taught us that recovery matters just as much as performance. Combat sports put enormous stress on the body. As we kept training and got older, we became more interested in tools that support recovery, resilience, and long-term performance.',
    story_problem_t:'Why We Started Peptides Costa Rica',story_problem_d:'Getting peptides in Costa Rica wasn\'t easy. Most people relied on international suppliers — leading to shipping delays, customs complications, unclear sourcing, and limited communication. We built a better local option.',
    story_problem_1:'Shipping delays',story_problem_2:'Customs complications',story_problem_3:'Unclear sourcing',story_problem_4:'Limited communication',
    story_local_t:'A Local Business for Costa Rica',story_local_s:'We serve customers exclusively within Costa Rica — with clear pricing, direct communication, and reliable local delivery.',
    story_val_1:'Clear pricing',story_val_2:'Direct communication',story_val_3:'Local delivery coordination',story_val_4:'Confirmed product availability',
    story_tools_t:'The Tools We Use Ourselves',story_tools_d:'Everything we offer comes from the world we know best: training, recovery, and performance. We focus on clear communication, reliable access, and honest information — without overpromising.',
    story_ahead_t:'Looking Ahead',story_ahead_d:'As more people in Costa Rica explore performance, recovery, and longevity, we\'re committed to staying a reliable local source built on transparency, consistency, and direct communication.',
    story_bulk_t:'Bulk Savings Program',story_bulk_d:'Purchase five or more vials of the same product to receive 15% off. No confusing levels or hidden rules — simple and easy to understand.',story_bulk_btn:'Learn About Bulk Savings',story_shop_btn:'Browse All Products',
  },
  es: {
    nav_shop:'Tienda',hero_title:'Péptidos de investigación, ya en Costa Rica.',hero_sub:'Consulta la documentación del lote, conoce el precio y ordena localmente sin demoras de aduana internacional.',hero_cta:'Comprar ahora',hero_cta2:'Hablar con experto',t1:'COAs disponibles',t2:'Entrega local',t3:'Atención humana',tr1_t:'Consulta la documentación',tr1_d:'Revisa el Certificado de Análisis disponible antes de decidir qué ordenar.',tr2_t:'Evita la aduana internacional',tr2_d:'El inventario ya está en Costa Rica y coordinamos la entrega localmente.',tr3_t:'Habla con una persona',tr3_d:'Joey y Sean responden tus preguntas directamente en español o inglés.',how_t:'Del catálogo a la entrega',how_s:'Un proceso local, claro y directo.',cats_t:'Explorar por Categoría',cats_s:'Péptidos de grado investigación organizados por área de aplicación.',feat_t:'Los más solicitados',feat_s:'Productos pedidos con frecuencia de nuestro inventario local.',feat_btn:'Ver detalles',in_stock:'Disponible',out_stock:'Agotado',res_t:'Experiencias de Clientes',res_s:'Comentarios compartidos por nuestra comunidad de investigación en Costa Rica.',res_disc:'Los resultados pueden variar. Los productos son estrictamente para uso de investigación y no están destinados a diagnosticar, tratar o prevenir enfermedades.',faq_t:'Preguntas Frecuentes',faq_s:'Los detalles prácticos antes de ordenar.',faq_q1:'¿Sus péptidos están probados en laboratorio?',faq_a1:'Sí. Cada producto incluye un COA de laboratorios HPLC independientes, garantizando ≥98% de pureza.',faq_q2:'¿Cómo ordeno?',faq_a2:'Navega el catálogo, agrega al carrito y confirma por WhatsApp. Te enviamos los detalles de pago y despachamos en 24-48 horas.',faq_q3:'¿Hacen entrega en toda Costa Rica?',faq_a3:'Sí. Enviamos a todas las provincias. La entrega toma 1-3 días hábiles tras confirmar el pago.',faq_q4:'¿Puedo contactarlos por WhatsApp?',faq_a4:'Claro. Escríbenos al +506 8404-6973. Respondemos en español e inglés.',faq_q5:'¿Estos productos son solo para investigación?',faq_a5:'Sí. Todos los productos son estrictamente para investigación de laboratorio. No aptos para consumo humano ni veterinario.',    cta_t:'¿Listo para ordenar?',cta_s:'Explora más de 300 productos de investigación con inventario local y detalles de lote.',cta_btn:'Ver inventario',cta_wa:'Escríbenos',f_desc:'Péptidos de investigación disponibles localmente en Costa Rica, con documentación clara y atención directa.',f_copy:'Todos los derechos reservados. Uso exclusivo de investigación. No apto para consumo humano.',
    story_badge:'NUESTRA HISTORIA',story_t:'Construido con Experiencia Real en Costa Rica',story_intro:'Peptides Costa Rica fue fundado por dos amigos y compañeros de entrenamiento con profundas raíces en deportes de combate y entrenamiento de alto rendimiento. Nuestro negocio comenzó no en una oficina, sino en gimnasios, campamentos de pelea y salas de recuperación.',
    story_origin_t:'Del Mundo del Combate a Peptides Costa Rica',story_origin_d:'Hace más de 15 años, Joey Webster y Sean McCully se mudaron de California a Costa Rica buscando un mejor estilo de vida. Pronto encontraron una misión compartida: ayudar a otros a rendir mejor, recuperarse más rápido y mantenerse saludables a largo plazo.',
    sean_t:'Sean McCully',sean_role:'Pionero en Deportes de Combate',sean_d:'Campeón mundial de Muay Thai y kickboxing, pionero del MMA temprano y fundador de LA Boxing. Hoy dirige McCully\'s Fight Club en Costa Rica, entrenando peleadores de todos los niveles. Décadas de experiencia competitiva moldearon su visión de recuperación y rendimiento.',
    joey_t:'Joey Webster',joey_role:'Campeón de Lucha & Peleador',joey_d:'Récord de pin más rápido en el Campeonato Estatal de Lucha de California. Tras mudarse a Costa Rica, entrenó boxeo, Muay Thai y MMA. A pesar de múltiples cirugías, regresó al ring en menos de un año — ganando por nocaut en el primer round.',
    story_why_t:'Por Qué los Péptidos Forman Parte de Nuestro Camino',story_why_d:'Años de entrenamiento nos enseñaron que la recuperación importa tanto como el rendimiento. Los deportes de combate someten al cuerpo a un estrés enorme. Con el tiempo, nos interesamos más en herramientas que apoyen la recuperación, la resiliencia y el rendimiento a largo plazo.',
    story_problem_t:'Por Qué Creamos Peptides Costa Rica',story_problem_d:'Obtener péptidos en Costa Rica no era fácil. La mayoría dependía de proveedores internacionales — con demoras de envío, complicaciones aduanales, origen poco claro y comunicación limitada. Creamos una mejor opción local.',
    story_problem_1:'Demoras de envío',story_problem_2:'Complicaciones aduanales',story_problem_3:'Origen poco claro',story_problem_4:'Comunicación limitada',
    story_local_t:'Un Negocio Local para Costa Rica',story_local_s:'Servimos exclusivamente a clientes dentro de Costa Rica — con precios claros, comunicación directa y entrega local confiable.',
    story_val_1:'Precios claros',story_val_2:'Comunicación directa',story_val_3:'Coordinación de entrega local',story_val_4:'Disponibilidad confirmada',
    story_tools_t:'Las Herramientas que Usamos Nosotros',story_tools_d:'Todo lo que ofrecemos proviene del mundo que mejor conocemos: entrenamiento, recuperación y rendimiento. Nos enfocamos en comunicación clara, acceso confiable e información honesta — sin promesas exageradas.',
    story_ahead_t:'Mirando al Futuro',story_ahead_d:'A medida que más personas en Costa Rica exploran el rendimiento, la recuperación y la longevidad, nos comprometemos a seguir siendo una fuente local confiable basada en transparencia, consistencia y comunicación directa.',
    story_bulk_t:'Programa de Ahorro por Volumen',story_bulk_d:'Compra cinco o más viales del mismo producto y recibe 15% de descuento. Sin niveles confusos ni reglas ocultas — simple y fácil de entender.',story_bulk_btn:'Ver Descuentos por Volumen',story_shop_btn:'Ver Todos los Productos',
  }
};

const CATS = [
  { icon:<Atom size={24} strokeWidth={1.8}/>,en:'Metabolic Research',es:'Investigación Metabólica',den:'Peptides studied for metabolic regulation and weight management.',des:'Péptidos para regulación metabólica y manejo de peso.' },
  { icon:<Dna size={24} strokeWidth={1.8}/>,en:'Tissue Repair',es:'Reparación de Tejidos',den:'Research peptides for recovery and tissue regeneration studies.',des:'Péptidos para estudios de recuperación y regeneración de tejidos.' },
  { icon:<Brain size={24} strokeWidth={1.8}/>,en:'Cognitive Research',es:'Investigación Cognitiva',den:'Peptides explored in neurological and cognitive function research.',des:'Péptidos para investigación neurológica y función cognitiva.' },
  { icon:<Zap size={24} strokeWidth={1.8}/>,en:'Hormonal Profiling',es:'Perfil Hormonal',den:'Compounds used in hormonal and endocrine system research.',des:'Compuestos para investigación del sistema hormonal y endocrino.' },
  { icon:<Sparkles size={24} strokeWidth={1.8}/>,en:'Cellular Longevity',es:'Longevidad Celular',den:'Peptides studied for cellular health and longevity applications.',des:'Péptidos para salud celular y aplicaciones de longevidad.' },
  { icon:<FlaskConical size={24} strokeWidth={1.8}/>,en:'Laboratory Supplies',es:'Insumos de Laboratorio',den:'Bacteriostatic water, syringes, and essential lab accessories.',des:'Agua bacteriostática, jeringas y accesorios esenciales de laboratorio.' },
];

const WaIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{flexShrink:0}}>
    <path d="M12.031 2a9.992 9.992 0 0 0-8.675 14.901L2 22l5.256-1.378A9.972 9.972 0 0 0 12.03 22c5.523 0 10-4.477 10-10S17.554 2 12.03 2Zm5.535 14.288c-.247.697-1.218 1.282-1.687 1.332-.469.052-.937.28-3.007-.582-2.483-1.034-4.045-3.565-4.168-3.73-.124-.165-1.007-1.34-1.007-2.555 0-1.217.638-1.815.865-2.062.227-.247.495-.309.66-.309.165 0 .33.003.475.01.155.007.361-.059.567.433.206.495.701 1.71.763 1.834.062.124.103.268.02.433-.082.165-.124.268-.247.412-.124.144-.262.32-.375.43-.124.124-.253.258-.108.505.144.248.643 1.056 1.382 1.713.953.847 1.753 1.109 2.001 1.233.247.124.392.103.536-.062.144-.165.619-.722.784-.969.165-.247.33-.206.557-.124.227.082 1.443.68 1.691.804.247.124.412.185.474.289.062.103.062.597-.186 1.294Z"/>
  </svg>
);

export default function LandingPage() {
  const [lang, setLang] = useState('es');
  const [openFaq, setOpenFaq] = useState(0);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cmsSettings, setCmsSettings] = useState(null);
  const prefersReducedMotion = useReducedMotion();

  const t = T[lang];

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  const { links } = useBusinessLinks();

  const handleWA = (src) => {
    logWhatsAppSource(src);
    if (typeof window !== 'undefined') localStorage.setItem('whatsapp_source', src);
    window.open(buildWhatsAppLink(links.whatsappNumber), '_blank');
  };

  useEffect(() => {
    const sv = localStorage.getItem('theme') || 'light';
    const sl = localStorage.getItem('lang') || 'es';
    const frame = requestAnimationFrame(() => setLang(sl));
    document.documentElement.setAttribute('data-theme', sv);
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); };
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') closeMobileMenu(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen, closeMobileMenu]);

  useEffect(() => {
    const load = async () => {
      if (!isSupabaseConfigured || !supabase) return;
      const { data } = await supabase.from('products').select('product,price_usd,price_crc,original_price_usd,original_price_crc,status,image_url,category,emoji').eq('status','In Stock').order('priority',{ascending:true}).limit(4);
      if (data) setFeaturedProducts(data);
      const { data: s } = await supabase.from('site_settings').select('value').eq('id','landing_page').single();
      if (s?.value) {
        let finalSettings = { ...s.value };
        if (finalSettings.linkedPromoCode && finalSettings.bannerActive) {
          try {
            const { data: promo } = await supabase.from('promo_codes').select('valid_until, is_active').eq('code', finalSettings.linkedPromoCode.toUpperCase()).single();
            if (promo) {
              if (promo.valid_until && new Date(promo.valid_until) < new Date()) {
                finalSettings.bannerActive = false;
              } else if (!promo.is_active) {
                finalSettings.bannerActive = false;
              }
            } else {
              // Promo code doesn't exist or was deleted, optionally hide banner or keep as is. Hiding is safer.
              finalSettings.bannerActive = false;
            }
          } catch(e) {
            console.error('Failed to verify linked promo code expiration:', e);
          }
        }
        setCmsSettings(finalSettings);
      }
    };
    load();
  }, []);

  const handleLang = (v) => { setLang(v); localStorage.setItem('lang',v); };

  const faqs = [
    { q:t.faq_q1,a:t.faq_a1 },{ q:t.faq_q2,a:t.faq_a2 },{ q:t.faq_q3,a:t.faq_a3 },
    { q:t.faq_q4,a:t.faq_a4 },{ q:t.faq_q5,a:t.faq_a5 },
  ];

  const steps = [
    { n:'1',en:'Choose Product',es:'Elige tu Producto',den:'Browse our verified research peptide catalog.',des:'Navega nuestro catálogo de péptidos verificados.' },
    { n:'2',en:'Add to Cart',es:'Agrega al Carrito',den:'Select products and review your order.',des:'Selecciona productos y revisa tu pedido.' },
    { n:'3',en:'Confirm via WhatsApp',es:'Confirma por WhatsApp',den:'Send us your order for secure payment details.',des:'Envíanos tu pedido para procesar el pago.' },
    { n:'4',en:'Local Delivery',es:'Entrega Local',den:'Fast 24-48h delivery anywhere in Costa Rica.',des:'Entrega rápida 24-48h en toda Costa Rica.' },
  ];

  const trustCards = [
    { icon:<FlaskConical size={30} strokeWidth={1.6}/>,t:t.tr1_t,d:t.tr1_d },
    { icon:<Truck size={30} strokeWidth={1.6}/>,t:t.tr2_t,d:t.tr2_d },
    { icon:<MessageCircle size={30} strokeWidth={1.6}/>,t:t.tr3_t,d:t.tr3_d },
  ];

  const quickStartSteps = [
    {
      icon:<FlaskConical size={20} strokeWidth={1.8}/>,
      t:lang==='en'?'Pick from live stock':'Elige del inventario',
      d:lang==='en'?'Open the catalog and see currently available research products.':'Abre el catálogo y revisa productos de investigación disponibles.'
    },
    {
      icon:<CheckCircle size={20} strokeWidth={1.8}/>,
      t:lang==='en'?'Review batch details':'Revisa el lote',
      d:lang==='en'?'Check pricing, availability, and COA information before ordering.':'Consulta precio, disponibilidad e información COA antes de ordenar.'
    },
    {
      icon:<Truck size={20} strokeWidth={1.8}/>,
      t:lang==='en'?'Coordinate locally':'Coordina localmente',
      d:lang==='en'?'Confirm through WhatsApp and arrange delivery inside Costa Rica.':'Confirma por WhatsApp y coordina entrega dentro de Costa Rica.'
    },
  ];

  const localAdvantages = [
    {
      icon:<Truck size={24} strokeWidth={1.8}/>,
      t:lang==='en'?'No customs delay':'Sin demora de aduana',
      d:lang==='en'?'Inventory is already in Costa Rica, so orders do not depend on international customs timing.':'El inventario ya está en Costa Rica, así que los pedidos no dependen de tiempos de aduana internacional.'
    },
    {
      icon:<FlaskConical size={24} strokeWidth={1.8}/>,
      t:lang==='en'?'Local Costa Rica stock':'Inventario local',
      d:lang==='en'?'The catalog is built around products we can coordinate locally, not vague overseas availability.':'El catálogo se basa en productos que podemos coordinar localmente, no en disponibilidad vaga del exterior.'
    },
    {
      icon:<MessageCircle size={24} strokeWidth={1.8}/>,
      t:lang==='en'?'Direct bilingual support':'Soporte bilingüe directo',
      d:lang==='en'?'Ask product, COA, payment, and delivery questions before placing an order.':'Pregunta sobre productos, COA, pago y entrega antes de ordenar.'
    },
    {
      icon:<CheckCircle size={24} strokeWidth={1.8}/>,
      t:lang==='en'?'COA documentation':'Documentación COA',
      d:lang==='en'?'Batch information is part of the buying flow so customers can verify details first.':'La información de lote forma parte del flujo de compra para verificar detalles primero.'
    },
  ];

  return (
    <div className="landing-layout min-h-screen">
      <PromoTicker
        active={cmsSettings?.bannerActive}
        text={lang==='en' ? cmsSettings?.bannerTextEn : cmsSettings?.bannerTextEs}
      />

      {/* HEADER */}
      <header className={`lp-header${scrolled?' lp-header--scrolled':''}`}>
        <div className="lp-header-inner">
          <Link href="/" className="lp-logo" onClick={closeMobileMenu}>
            <img src="/logo.webp" alt="Peptides Costa Rica" className="logo-img-custom" loading="eager"/>
          </Link>
          <button
            type="button"
            className="lp-menu-btn"
            aria-label={mobileMenuOpen ? (lang==='en'?'Close menu':'Cerrar menú') : (lang==='en'?'Open menu':'Abrir menú')}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X size={20} strokeWidth={2.2}/> : <Menu size={20} strokeWidth={2.2}/>}
          </button>
          <button
            type="button"
            className={`lp-mobile-nav-backdrop${mobileMenuOpen ? ' is-open' : ''}`}
            aria-label={lang==='en'?'Close menu':'Cerrar menú'}
            onClick={closeMobileMenu}
            tabIndex={mobileMenuOpen ? 0 : -1}
          />
          <nav className={`lp-nav${mobileMenuOpen ? ' is-open' : ''}`}>
            <Link href={`/catalog?lang=${lang}`} onClick={closeMobileMenu}>{lang==='en'?'Catalog':'Catálogo'}</Link>
            <Link href={`/about?lang=${lang}`} onClick={closeMobileMenu}>{lang==='en'?'About Us':'Sobre Nosotros'}</Link>
            <Link href={`/blog?lang=${lang}`} onClick={closeMobileMenu}>Blog</Link>
            <Link href={`/contact?lang=${lang}`} onClick={closeMobileMenu}>{lang==='en'?'Contact':'Contacto'}</Link>
            <Link href="/admin" onClick={closeMobileMenu} style={{display:'flex',alignItems:'center',gap:'4px',opacity:0.4,fontSize:'0.8rem',fontWeight:'600',color:'var(--text-muted)'}} title="Admin"><Lock size={12}/> Admin</Link>
          </nav>
          <div className="lp-header-actions">
            <div className="lp-controls">
              <div className="lang-selector">
                <button onClick={()=>handleLang('es')} className={lang==='es'?'active':''}>ES</button>
                <button onClick={()=>handleLang('en')} className={lang==='en'?'active':''}>EN</button>
              </div>
            </div>
            <Link href={`/catalog?lang=${lang}`} className="lp-nav-cta">{t.nav_shop} <ArrowRight size={15}/></Link>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="lp-hero" style={{position:'relative',overflow:'hidden'}}>
          <div className="lp-hero-bg-image" style={{position:'absolute',inset:0,backgroundImage:'url(/peptide_molecular_3d.webp)',backgroundSize:'cover',backgroundPosition:'center',opacity:0.07,zIndex:0}}/>
          <div className="lp-hero-glow" style={{zIndex:1}}/>
          <div className="container lp-hero-grid" style={{position:'relative',zIndex:2}}>
            <motion.div 
              initial={prefersReducedMotion ? false : { opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.8, ease: "easeOut" }}
              className="lp-hero-text-block"
            >
              <div className="hero-badge">{lang==='en'?'Stocked locally · Costa Rica':'Inventario local · Costa Rica'}</div>
              <h1 className="hero-title">{t.hero_title}</h1>
              <p className="hero-sub">{t.hero_sub}</p>
              <div className="hero-actions">
                <Link href={`/catalog?lang=${lang}`} className="btn-hero-primary">
                  {t.hero_cta} <ArrowUpRight size={18}/>
                </Link>
                <button type="button" onClick={()=>handleWA('homepage')} className="btn-hero-wa">
                  <WaIcon/> {t.hero_cta2}
                </button>
              </div>
              <div className="hero-features-row">
                <span><CheckCircle size={14} color="#4ade80"/> {t.t1}</span>
                <span><CheckCircle size={14} color="#4ade80"/> {t.t2}</span>
                <span><CheckCircle size={14} color="#4ade80"/> {t.t3}</span>
              </div>
            </motion.div>
            <motion.div 
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.8, delay: prefersReducedMotion ? 0 : 0.2, ease: "easeOut" }}
              className="lp-hero-visual-block"
            >
              <div className="lp-hero-image-glow"/>
              <img src="/catalog-promo-banner.webp" alt="Peptides Costa Rica" className="lp-hero-main-img" width={900} height={400} fetchPriority="high" decoding="async"/>
            </motion.div>
          </div>
        </section>

        {/* BEST-SELLING PRODUCTS */}
        {featuredProducts.length>0&&(
          <section className="lp-section lp-featured-section lp-featured-section--early">
            <div className="container">
              <div className="lp-section-header lp-section-header--split">
                <div>
                  <span className="lp-section-eyebrow">{lang==='en'?'LIVE LOCAL STOCK':'INVENTARIO LOCAL'}</span>
                  <h2>{t.feat_t}</h2>
                  <p>{t.feat_s}</p>
                </div>
                <Link href={`/catalog?lang=${lang}`} className="btn-outline lp-header-link">
                  {lang==='en'?'Browse Products':'Ver productos'} <ExternalLink size={15}/>
                </Link>
              </div>
              <div className="lp-products-grid lp-products-grid--featured">
                {featuredProducts.map((p,i)=>(
                  <div key={i} className="lp-product-card">
                    {p.original_price_usd&&p.original_price_usd!==p.price_usd&&<div className="sale-badge">{lang==='en'?'SALE':'OFERTA'}</div>}
                    <div className="lp-product-image-stage">
                      {p.image_url?<img src={p.image_url} alt={p.product} className="lp-product-img" loading="lazy" decoding="async"/>:<div className="lp-product-img-placeholder"><FlaskConical size={40} strokeWidth={1.5}/></div>}
                    </div>
                    <div className="lp-product-body">
                      <span className={`lp-stock-badge${p.status?.toLowerCase()==='in stock'?' in-stock':' out-stock'}`}>
                        {p.status?.toLowerCase()==='in stock'?t.in_stock:t.out_stock}
                      </span>
                      <h4>{p.product}</h4>
                      <div className="lp-product-price">
                        {p.original_price_usd&&p.original_price_usd!==p.price_usd?(
                          <div className="lp-price-stack">
                            <span className="price-original">{lang==='en'?p.original_price_usd:p.original_price_crc||p.original_price_usd}</span>
                            <span className="price-sale">{lang==='en'?p.price_usd:p.price_crc||p.price_usd}</span>
                          </div>
                        ):(lang==='en'?p.price_usd:p.price_crc||p.price_usd)}
                      </div>
                      <Link href={`/catalog?product=${encodeURIComponent(p.product)}&lang=${lang}`} className="lp-product-btn">
                        {t.feat_btn} <ArrowUpRight size={15}/>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <TrustFlowBand lang={lang} />

        <section className="lp-quick-start" aria-labelledby="quick-start-title">
          <div className="container lp-quick-start-inner">
            <div className="lp-quick-start-copy">
              <span className="lp-quick-start-kicker">{lang==='en'?'START WITH CONFIDENCE':'EMPIEZA CON CONFIANZA'}</span>
              <h2 id="quick-start-title">{lang==='en'?'Current stock, clear details, local coordination.':'Inventario actual, detalles claros y coordinación local.'}</h2>
              <p>{lang==='en'
                ? 'See what is available, review the batch information, and talk with a real person before arranging delivery.'
                : 'Consulta qué está disponible, revisa la información del lote y habla con una persona antes de coordinar la entrega.'}</p>
              <div className="lp-quick-start-actions">
                <Link href={`/catalog?lang=${lang}`} className="lp-quick-start-primary" aria-label={lang==='en'?'Open the product catalog':'Abrir el catálogo de productos'}>
                  {lang==='en'?'Browse Products':'Ver productos'} <ArrowUpRight size={17}/>
                </Link>
                <button type="button" onClick={()=>handleWA('quick_start')} className="lp-quick-start-secondary" aria-label={lang==='en'?'Ask us on WhatsApp':'Preguntar por WhatsApp'}>
                  <WaIcon/> {lang==='en'?'Ask on WhatsApp':'Preguntar'}
                </button>
              </div>
            </div>
            <div className="lp-quick-start-steps">
              {quickStartSteps.map((step,i)=>(
                <div key={i} className="lp-quick-start-step">
                  <div className="lp-quick-start-number">{i+1}</div>
                  <div className="lp-quick-start-icon">{step.icon}</div>
                  <div>
                    <h3>{step.t}</h3>
                    <p>{step.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-local-advantage" aria-labelledby="local-advantage-title">
          <div className="container lp-local-advantage-grid">
            <div className="lp-local-advantage-copy">
              <span>{lang==='en'?'LOCAL ADVANTAGE':'VENTAJA LOCAL'}</span>
              <h2 id="local-advantage-title">{lang==='en'?'Built around Costa Rica logistics.':'Creado para la logística de Costa Rica.'}</h2>
              <p>{lang==='en'
                ? 'The best customer experience is practical: clear stock, clear documentation, direct answers, and local coordination.'
                : 'La mejor experiencia es práctica: inventario claro, documentación clara, respuestas directas y coordinación local.'}</p>
            </div>
            <div className="lp-local-advantage-list">
              {localAdvantages.map((item)=>(
                <article key={item.t} className="lp-local-advantage-card">
                  {item.icon}
                  <h3>{item.t}</h3>
                  <p>{item.d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* TRUST CARDS */}
        <section className="lp-trust-section">
          <div className="container">
            <div className="lp-trust-grid">
              {trustCards.map((c,i)=>(
                <div key={i} className="lp-trust-card">
                  <div className="lp-trust-icon">{c.icon}</div>
                  <div>
                    <h3 className="lp-trust-title">{c.t}</h3>
                    <p className="lp-trust-desc">{c.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SHORT FOUNDER NOTE */}
        <section className="lp-founder-note">
          <div className="container lp-founder-note-inner">
            <p className="lp-founder-note-kicker">{lang==='en'?'WHY WE BUILT THIS':'POR QUÉ CREAMOS ESTO'}</p>
            <h2>{lang==='en'?'We got tired of waiting on international suppliers.':'Nos cansamos de depender de proveedores internacionales.'}</h2>
            <p>{lang==='en'
              ? 'After years in Costa Rica’s fight and training community, Joey Webster and Sean McCully wanted a simpler local option: visible stock, clear batch documentation, and someone nearby who answers the phone.'
              : 'Después de años en la comunidad de combate y entrenamiento de Costa Rica, Joey Webster y Sean McCully querían una opción local más simple: inventario visible, documentación clara de cada lote y alguien cercano que responda.'}</p>
            <Link href={`/about?lang=${lang}`} className="lp-founder-note-link">
              {lang==='en'?'Read Joey and Sean’s story':'Conoce la historia de Joey y Sean'} <ArrowRight size={16}/>
            </Link>
          </div>
        </section>

        {/* HOW TO ORDER */}
        <section className="lp-how-section">
          <div className="container">
            <div className="lp-section-header">
              <h2>{t.how_t}</h2>
              <p>{t.how_s}</p>
            </div>
            <div className="lp-steps-grid">
              {steps.map((s,i)=>(
                <div key={i} className="lp-step-card">
                  <div className="lp-step-number">{s.n}</div>
                  <h3>{lang==='en'?s.en:s.es}</h3>
                  <p>{lang==='en'?s.den:s.des}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CATEGORIES */}
        <section className="lp-section lp-cats-section">
          <div className="container">
            <div className="lp-section-header">
              <h2>{t.cats_t}</h2>
              <p>{t.cats_s}</p>
            </div>
            <div className="lp-cats-grid">
              {CATS.map((c,i)=>(
                <Link key={i} href={`/catalog?category=${encodeURIComponent(c.en)}&lang=${lang}`} className="lp-cat-card" style={{flexDirection:'column',alignItems:'flex-start',gap:'12px',padding:'24px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'12px',width:'100%'}}>
                    <div className="lp-cat-icon">{c.icon}</div>
                    <span style={{fontWeight:'800',fontSize:'0.95rem'}}>{lang==='en'?c.en:c.es}</span>
                    <ArrowRight size={15} className="lp-cat-arrow" style={{marginLeft:'auto'}}/>
                  </div>
                  <p style={{fontSize:'0.82rem',color:'var(--text-muted)',lineHeight:1.5,margin:0}}>{lang==='en'?c.den:c.des}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* CUSTOMER EXPERIENCE */}
        <section className="lp-section" style={{background:'var(--bg-secondary)'}}>
          <div className="container" style={{maxWidth:'860px',margin:'0 auto'}}>
            <div className="lp-section-header">
              <h2>{t.res_t}</h2>
              <p>{t.res_s}</p>
            </div>
            <div style={{borderRadius:'20px',overflow:'hidden',boxShadow:'0 8px 40px rgba(0,0,0,0.1)',position:'relative',marginTop:'32px'}}>
              <img src="/customer_transformation.webp" alt={lang==='en'?'Customer experience with Peptides Costa Rica':'Experiencias de clientes con Péptidos Costa Rica'} width={800} height={330} loading="lazy" decoding="async" style={{width:'100%',display:'block',height:'auto',maxHeight:'420px',objectFit:'cover',objectPosition:'center top'}} onError={(e)=>{e.target.parentElement.parentElement.parentElement.style.display='none';}}/>
              <div style={{position:'absolute',top:'16px',left:'16px',background:'linear-gradient(135deg,#22c55e,#16a34a)',color:'#fff',fontSize:'0.78rem',fontWeight:'800',padding:'6px 16px',borderRadius:'24px',letterSpacing:'0.04em',textTransform:'uppercase',boxShadow:'0 4px 14px rgba(34,197,94,0.4)'}}>
                {lang==='en'?'✓ Verified Results':'✓ Resultados Verificados'}
              </div>
            </div>
            <p style={{marginTop:'20px',fontSize:'0.78rem',color:'var(--text-muted)',lineHeight:1.6,textAlign:'center',fontStyle:'italic'}}>
              {t.res_disc}
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="lp-section lp-faq-section" id="faq">
          <div className="container lp-faq-grid-layout">
            <div className="lp-faq-help-card">
              <span className="lp-faq-tag">{lang==='en'?'HELP CENTER':'CENTRO DE AYUDA'}</span>
              <h2>{lang==='en'?'Need Help?':'¿Necesitas Ayuda?'}</h2>
              <p>{lang==='en'?'Our team is available on WhatsApp and email to answer all your questions.':'Nuestro equipo está disponible en WhatsApp y correo para responder todas tus preguntas.'}</p>
              <div className="lp-faq-contact-actions">
                <button onClick={()=>handleWA('faq')} className="lp-faq-btn-wa">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12.031 2a9.992 9.992 0 0 0-8.675 14.901L2 22l5.256-1.378A9.972 9.972 0 0 0 12.03 22c5.523 0 10-4.477 10-10S17.554 2 12.03 2Z"/></svg>
                  {lang==='en'?'Chat on WhatsApp':'Chatear por WhatsApp'}
                </button>
                <a href="mailto:info@peptidescostarica.net" className="lp-faq-btn-email">{lang==='en'?'Send an Email':'Enviar un Correo'}</a>
              </div>
            </div>
            <div className="lp-faq-accordion-block">
              <div className="lp-section-header-left">
                <h2>{t.faq_t}</h2>
                <p>{t.faq_s}</p>
              </div>
              <div className="lp-faq-list">
                {faqs.map((faq,i)=>(
                  <div key={i} className={`lp-faq-item${openFaq===i?' open':''}`}>
                    <button className="lp-faq-question" onClick={()=>setOpenFaq(openFaq===i?null:i)}>
                      <span>{faq.q}</span>
                      {openFaq===i?<ChevronUp size={18}/>:<ChevronDown size={18}/>}
                    </button>
                    <div className="lp-faq-answer"><p>{faq.a}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA BANNER & NEWSLETTER */}
        <section className="lp-cta-section">
          <div className="lp-cta-glow"/>
          <div className="container lp-cta-content">
            <h2>{t.cta_t}</h2>
            <p>{t.cta_s}</p>
            <div className="lp-cta-actions">
              <Link href={`/catalog?lang=${lang}`} className="lp-cta-primary">{t.cta_btn} <ArrowUpRight size={18}/></Link>
              <button onClick={()=>handleWA('cta')} className="lp-cta-secondary" style={{cursor:'pointer'}} aria-label={lang==='en'?'Ask us on WhatsApp':'Preguntar por WhatsApp'}>
                <WaIcon/> {t.cta_wa}
              </button>
            </div>
          </div>

          <div className="container mt-16 pt-16 border-t border-white/10 relative z-10" style={{maxWidth: '800px'}}>
            <NewsletterSignup lang={lang} />
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="footer" style={{marginTop:0}}>
        <div className="container">
          <div className="lp-footer-cta">
            <div>
              <span>{lang==='en'?'READY TO ORDER?':'¿LISTO PARA ORDENAR?'}</span>
              <h2>{lang==='en'?'Browse 300+ research peptides':'Explora más de 300 péptidos de investigación'}</h2>
            </div>
            <div className="lp-footer-cta-actions">
              <Link href={`/catalog?lang=${lang}`} className="lp-footer-shop">
                {lang==='en'?'Shop Now':'Comprar ahora'} <ArrowUpRight size={17}/>
              </Link>
              <button type="button" onClick={()=>handleWA('footer')} className="lp-footer-wa">
                <WaIcon/> {lang==='en'?'WhatsApp Us':'WhatsApp'}
              </button>
            </div>
          </div>
          <img src="/logo.webp" alt="Logo" style={{height:'36px',marginBottom:'16px',opacity:0.95,borderRadius:'8px'}} loading="lazy"/>
          <p>{t.f_desc}</p>
          <div className="footer-links-grid" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'32px',textAlign:'left',margin:'40px 0'}}>
            <div>
              <h4 style={{color:'var(--text-main)',marginBottom:'16px',fontSize:'1rem'}}>{lang==='en'?'Shop':'Comprar'}</h4>
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                <Link href={`/catalog?lang=${lang}`} className="footer-col-link">{lang==='en'?'Shop Catalog':'Catálogo'}</Link>
                <Link href="/bulk-discounts" className="footer-col-link">{lang==='en'?'Bulk Discounts':'Descuentos Mayoristas'}</Link>
              </div>
            </div>
            <div>
              <h4 style={{color:'var(--text-main)',marginBottom:'16px',fontSize:'1rem'}}>{lang==='en'?'Information':'Información'}</h4>
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                <Link href={`/about?lang=${lang}`} className="footer-col-link">{lang==='en'?'Our Story':'Nuestra Historia'}</Link>
                <Link href="/about" className="footer-col-link">{lang==='en'?'About Us':'Nosotros'}</Link>
                <Link href="/faq" className="footer-col-link">{lang==='en'?'FAQ':'Preguntas Frecuentes'}</Link>
                <Link href="/coa-database" className="footer-col-link">{lang==='en'?'COA Database':'Base de Datos COA'}</Link>
                <Link href="/blog" className="footer-col-link">Blog</Link>
              </div>
            </div>
            <div>
              <h4 style={{color:'var(--text-main)',marginBottom:'16px',fontSize:'1rem'}}>{lang==='en'?'Support':'Soporte'}</h4>
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                <Link href="/contact" className="footer-col-link">{lang==='en'?'Contact':'Contacto'}</Link>
                <Link href="/our-service-locations" className="footer-col-link">{lang==='en'?'Service Locations':'Ubicaciones'}</Link>
              </div>
            </div>
            <div>
              <h4 style={{color:'var(--text-main)',marginBottom:'16px',fontSize:'1rem'}}>Legal</h4>
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                <Link href="/shipping-policy" className="footer-col-link">{lang==='en'?'Shipping Policy':'Políticas de Envío'}</Link>
                <Link href="/return-refund-policy" className="footer-col-link">{lang==='en'?'Returns':'Devoluciones'}</Link>
                <Link href="/privacy-policy" className="footer-col-link">{lang==='en'?'Privacy Policy':'Privacidad'}</Link>
              </div>
            </div>
          </div>
          <div style={{fontSize:'0.75rem',color:'var(--text-muted)',borderTop:'1px solid var(--border)',paddingTop:'16px',marginBottom:'12px',lineHeight:1.6}}>
            <strong>Legal Notice:</strong> Products offered by Peptides Costa Rica are intended strictly for laboratory research use only. Not approved for the prevention, diagnosis, treatment, or cure of any disease. Not for human or veterinary use.
          </div>
          <div style={{fontSize:'0.75rem',color:'var(--text-muted)',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'8px'}}>
            <span>© {new Date().getFullYear()} Peptides Costa Rica. {t.f_copy}</span>
            <Link href="/admin" style={{display:'inline-flex',alignItems:'center',gap:'4px',color:'var(--text-muted)',opacity:0.4,fontSize:'0.7rem',fontWeight:'700',textDecoration:'none'}} title="Admin"><Lock size={10}/> ADMIN</Link>
          </div>
        </div>
      </footer>

      <MobileActionBar lang={lang} onWhatsapp={()=>handleWA('mobile_sticky')} />
    </div>
  );
}
