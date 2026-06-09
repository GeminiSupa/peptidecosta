"use client";
import React, { useState, useEffect } from 'react';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { buildWhatsAppLink, logWhatsAppSource } from '@/lib/whatsapp';
import { ArrowRight, ArrowUpRight, ShieldCheck, Truck, MessageCircle, Sun, Moon, ChevronDown, ChevronUp, FlaskConical, Lock, Dna, Atom, Zap, Brain, Sparkles, CheckCircle, ExternalLink, Trophy, Users, MapPin, Tag, Target, Heart, Package, DollarSign } from 'lucide-react';

const T = {
  en: {
    nav_shop:'Shop',hero_title:'Buy Premium Research Peptides in Costa Rica',hero_sub:'Lab-tested peptides with fast local delivery, transparent quality standards, and WhatsApp support.',hero_cta:'Shop Peptides',hero_cta2:'Chat on WhatsApp',t1:'Lab-Tested',t2:'Local Delivery 24-48h',t3:'WhatsApp Support',tr1_t:'Lab-Tested Quality',tr1_d:'Every batch includes a Certificate of Analysis (COA) from independent third-party HPLC laboratories, guaranteeing ≥98% purity.',tr2_t:'Fast Local Delivery',tr2_d:'Orders dispatched within 24-48 hours to all provinces across Costa Rica.',tr3_t:'WhatsApp Support',tr3_d:'Easy ordering and customer support through WhatsApp — available in Spanish or English.',how_t:'How to Order',how_s:'Four simple steps to receive your research supplies.',cats_t:'Browse by Category',cats_s:'Research-grade peptides organized by application area.',feat_t:'Best-Selling Products',feat_s:'Top-requested peptides with verified purity and competitive pricing.',feat_btn:'View Product',in_stock:'In Stock',out_stock:'Out of Stock',res_t:'Customer Experience Highlights',res_s:'Feedback shared by our research community in Costa Rica.',res_disc:'Results may vary. Products are intended strictly for research use only and are not intended to diagnose, treat, cure, or prevent any disease.',faq_t:'Frequently Asked Questions',faq_s:'Everything you need to know before ordering.',faq_q1:'Are your peptides lab-tested?',faq_a1:'Yes. Every product comes with a Certificate of Analysis (COA) from independent third-party HPLC labs, guaranteeing ≥98% purity.',faq_q2:'How do I order?',faq_a2:'Browse our catalog, add items to your cart, and confirm via WhatsApp. We send payment details and dispatch within 24-48 hours.',faq_q3:'Do you deliver throughout Costa Rica?',faq_a3:'Yes. We ship to all provinces. Delivery takes 1–3 business days after payment confirmation.',faq_q4:'Can I contact you on WhatsApp?',faq_a4:'Absolutely. Message us at +506 8404-6973. We reply in both Spanish and English.',faq_q5:'Are products for research use only?',faq_a5:'Yes. All products are strictly for laboratory research. Not for human or veterinary consumption.',    cta_t:'Ready to Order?',cta_s:'Browse our full catalog of premium research peptides and place your order securely today.',cta_btn:'Shop Peptides',cta_wa:'Order via WhatsApp',f_desc:'Peptides Costa Rica offers premium, research-backed peptides with trusted quality and transparent documentation.',f_copy:'All rights reserved. For research purposes only. Not for human consumption.',
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
    nav_shop:'Tienda',hero_title:'Compra Péptidos de Investigación Premium en Costa Rica',hero_sub:'Péptidos probados en laboratorio con entrega local rápida, estándares de calidad transparentes y soporte por WhatsApp.',hero_cta:'Ver Catálogo',hero_cta2:'Ordenar por WhatsApp',t1:'Probado en Laboratorio',t2:'Entrega Local 24-48h',t3:'Soporte WhatsApp',tr1_t:'Calidad Certificada',tr1_d:'Cada lote incluye un Certificado de Análisis (COA) de laboratorios HPLC independientes, garantizando ≥98% de pureza.',tr2_t:'Entrega Local Rápida',tr2_d:'Pedidos despachados en 24-48 horas a todas las provincias de Costa Rica.',tr3_t:'Soporte por WhatsApp',tr3_d:'Pedidos y soporte al cliente vía WhatsApp — disponible en español o inglés.',how_t:'Cómo Ordenar',how_s:'Cuatro pasos simples para recibir tus suministros de investigación.',cats_t:'Explorar por Categoría',cats_s:'Péptidos de grado investigación organizados por área de aplicación.',feat_t:'Productos Más Vendidos',feat_s:'Los péptidos más solicitados con pureza verificada y precios competitivos.',feat_btn:'Ver Producto',in_stock:'Disponible',out_stock:'Agotado',res_t:'Experiencias de Clientes',res_s:'Comentarios compartidos por nuestra comunidad de investigación en Costa Rica.',res_disc:'Los resultados pueden variar. Los productos son estrictamente para uso de investigación y no están destinados a diagnosticar, tratar o prevenir enfermedades.',faq_t:'Preguntas Frecuentes',faq_s:'Todo lo que necesitas saber antes de ordenar.',faq_q1:'¿Sus péptidos están probados en laboratorio?',faq_a1:'Sí. Cada producto incluye un COA de laboratorios HPLC independientes, garantizando ≥98% de pureza.',faq_q2:'¿Cómo ordeno?',faq_a2:'Navega el catálogo, agrega al carrito y confirma por WhatsApp. Te enviamos los detalles de pago y despachamos en 24-48 horas.',faq_q3:'¿Hacen entrega en toda Costa Rica?',faq_a3:'Sí. Enviamos a todas las provincias. La entrega toma 1-3 días hábiles tras confirmar el pago.',faq_q4:'¿Puedo contactarlos por WhatsApp?',faq_a4:'Claro. Escríbenos al +506 8404-6973. Respondemos en español e inglés.',faq_q5:'¿Estos productos son solo para investigación?',faq_a5:'Sí. Todos los productos son estrictamente para investigación de laboratorio. No aptos para consumo humano ni veterinario.',    cta_t:'¿Listo para Ordenar?',cta_s:'Explora nuestro catálogo completo de péptidos de investigación y haz tu pedido hoy.',cta_btn:'Ver Catálogo',cta_wa:'Ordenar por WhatsApp',f_desc:'Peptides Costa Rica ofrece péptidos premium para investigación, con calidad garantizada y documentación transparente.',f_copy:'Todos los derechos reservados. Uso exclusivo de investigación. No apto para consumo humano.',
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
  const [theme, setTheme] = useState('light');
  const [lang, setLang] = useState('es');
  const [openFaq, setOpenFaq] = useState(0);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [scrolled, setScrolled] = useState(false);
  const [cmsSettings, setCmsSettings] = useState(null);

  const t = T[lang];

  const handleWA = (src) => {
    logWhatsAppSource(src);
    if (typeof window !== 'undefined') localStorage.setItem('whatsapp_source', src);
    window.open(buildWhatsAppLink('50684046973'), '_blank');
  };

  useEffect(() => {
    const sv = localStorage.getItem('theme') || 'light';
    const sl = localStorage.getItem('lang') || 'es';
    setTheme(sv); setLang(sl);
    document.documentElement.setAttribute('data-theme', sv);
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!isSupabaseConfigured || !supabase) return;
      const { data } = await supabase.from('products').select('product,price_usd,price_crc,original_price_usd,original_price_crc,status,image_url,category,emoji').eq('status','In Stock').order('priority',{ascending:true}).limit(4);
      if (data) setFeaturedProducts(data);
      const { data: s } = await supabase.from('site_settings').select('value').eq('id','landing_page').single();
      if (s?.value) setCmsSettings(s.value);
    };
    load();
  }, []);

  const handleTheme = (v) => { setTheme(v); localStorage.setItem('theme',v); document.documentElement.setAttribute('data-theme',v); };
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

  const founders = [
    { icon:<Trophy size={26} strokeWidth={1.8}/>,name:t.sean_t,role:t.sean_role,desc:t.sean_d,accent:'#c8530c' },
    { icon:<Target size={26} strokeWidth={1.8}/>,name:t.joey_t,role:t.joey_role,desc:t.joey_d,accent:'#002766' },
  ];

  const storyProblems = [t.story_problem_1,t.story_problem_2,t.story_problem_3,t.story_problem_4];

  const localValues = [
    { icon:<DollarSign size={22} strokeWidth={2}/>,label:t.story_val_1 },
    { icon:<MessageCircle size={22} strokeWidth={2}/>,label:t.story_val_2 },
    { icon:<Truck size={22} strokeWidth={2}/>,label:t.story_val_3 },
    { icon:<CheckCircle size={22} strokeWidth={2}/>,label:t.story_val_4 },
  ];

  return (
    <div className="landing-layout min-h-screen">
      {cmsSettings?.bannerActive && (
        <div style={{background:'#38bdf8',color:'#050b18',textAlign:'center',padding:'8px 16px',fontSize:'0.85rem',fontWeight:'bold'}}>
          {lang==='en'?cmsSettings.bannerTextEn:cmsSettings.bannerTextEs}
        </div>
      )}

      {/* HEADER */}
      <header className={`lp-header${scrolled?' lp-header--scrolled':''}`}>
        <div className="lp-header-inner">
          <Link href="/" className="lp-logo">
            <img src="/logo.png" alt="Peptides Costa Rica" className="logo-img-custom" style={{maxHeight:'34px',width:'auto',borderRadius:'4px'}}/>
          </Link>
          <nav className="lp-nav">
            <Link href={`/catalog?lang=${lang}`}>{lang==='en'?'Catalog':'Catálogo'}</Link>
            <a href="#our-story">{lang==='en'?'Our Story':'Nuestra Historia'}</a>
            <Link href={`/about?lang=${lang}`}>{lang==='en'?'About Us':'Sobre Nosotros'}</Link>
            <Link href={`/blog?lang=${lang}`}>Blog</Link>
            <Link href={`/contact?lang=${lang}`}>{lang==='en'?'Contact':'Contacto'}</Link>
            <Link href="/admin" style={{display:'flex',alignItems:'center',gap:'4px',opacity:0.4,fontSize:'0.8rem',fontWeight:'600',color:'var(--text-muted)'}} title="Admin"><Lock size={12}/> Admin</Link>
          </nav>
          <div className="lp-header-actions">
            <div className="lp-controls">
              <div className="theme-toggle">
                <button onClick={()=>handleTheme('light')} className={theme==='light'?'active':''} title="Light"><Sun size={14} strokeWidth={2.5}/></button>
                <button onClick={()=>handleTheme('dark')} className={theme==='dark'?'active':''} title="Dark"><Moon size={14} strokeWidth={2.5}/></button>
              </div>
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
          <div className="lp-hero-bg-image" style={{position:'absolute',inset:0,backgroundImage:'url(/peptide_molecular_3d.png)',backgroundSize:'cover',backgroundPosition:'center',opacity:0.07,zIndex:0}}/>
          <div className="lp-hero-glow" style={{zIndex:1}}/>
          <div className="container lp-hero-grid" style={{position:'relative',zIndex:2}}>
            <div className="lp-hero-text-block">
              <div className="hero-badge">{lang==='en'?'Verified Local Supplier · Costa Rica':'Proveedor Local Verificado · Costa Rica'}</div>
              <h1 className="hero-title">{t.hero_title}</h1>
              <p style={{fontSize:'1.1rem',lineHeight:1.7,color:'var(--text-muted)',marginBottom:'32px',maxWidth:'520px'}}>{t.hero_sub}</p>
              <div className="hero-actions" style={{display:'flex',flexWrap:'wrap',gap:'14px',alignItems:'center'}}>
                <Link href={`/catalog?lang=${lang}`} className="btn-hero-primary" style={{flex:'1 1 auto',minWidth:'max-content',textAlign:'center',justifyContent:'center'}}>
                  {t.hero_cta} <ArrowUpRight size={18}/>
                </Link>
                <button onClick={()=>handleWA('homepage')} style={{backgroundColor:'#25D366',color:'white',border:'none',borderRadius:'25px',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',padding:'12px 24px',fontWeight:'700',fontSize:'0.95rem',cursor:'pointer',boxShadow:'0 4px 14px rgba(37,211,102,0.35)',transition:'all 0.25s ease',flex:'1 1 auto',minWidth:'max-content'}}>
                  <WaIcon/> {t.hero_cta2}
                </button>
              </div>
              <div className="hero-features-row" style={{marginTop:'28px'}}>
                <span><CheckCircle size={14} color="#4ade80"/> {t.t1}</span>
                <span><CheckCircle size={14} color="#4ade80"/> {t.t2}</span>
                <span><CheckCircle size={14} color="#4ade80"/> {t.t3}</span>
              </div>
            </div>
            <div className="lp-hero-visual-block">
              <div className="lp-hero-image-glow"/>
              <img src="https://peptidescostarica.net/wp-content/uploads/2026/04/Untitled-design-5-1.png" alt="Peptides Costa Rica" className="lp-hero-main-img" style={{width:'100%',height:'auto',objectFit:'contain',position:'relative',zIndex:10,borderRadius:'16px'}}/>
            </div>
          </div>
        </section>

        {/* TRUST CARDS */}
        <section style={{background:'var(--bg-main)',padding:'56px 20px',borderBottom:'1px solid var(--border)'}}>
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

        {/* OUR STORY */}
        <section className="lp-story-section" id="our-story">
          <div className="container">
            <div className="lp-story-intro">
              <span className="lp-about-badge">{t.story_badge}</span>
              <h2 className="lp-about-heading">{t.story_t}</h2>
              <p className="lp-story-lead">{t.story_intro}</p>
            </div>

            <div className="lp-about-cards-grid lp-story-origin-grid">
              <div className="lp-about-card lp-about-card--image">
                <img src="/science_lab_about.png" alt={t.story_origin_t} className="lp-about-card-img"/>
                <div className="lp-about-card-overlay">
                  <h3>{t.story_origin_t}</h3>
                  <p>{t.story_origin_d}</p>
                </div>
              </div>
              <div className="lp-about-card lp-about-card--links">
                <div className="lp-about-card-content">
                  <h3>{t.story_why_t}</h3>
                  <p>{t.story_why_d}</p>
                  <div className="lp-about-quick-links">
                    <Link href={`/catalog?lang=${lang}`} className="lp-about-link-item">
                      {t.story_shop_btn} <ArrowRight size={16}/>
                    </Link>
                    <Link href="/bulk-discounts" className="lp-about-link-item">
                      {t.story_bulk_btn} <ArrowRight size={16}/>
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="lp-founders-grid">
              {founders.map((f,i)=>(
                <article key={i} className="lp-founder-card">
                  <div className="lp-founder-icon" style={{'--founder-accent':f.accent}}>{f.icon}</div>
                  <div className="lp-founder-body">
                    <span className="lp-founder-role">{f.role}</span>
                    <h3 className="lp-founder-name">{f.name}</h3>
                    <p className="lp-founder-desc">{f.desc}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="lp-story-split">
              <div className="lp-story-block">
                <div className="lp-story-block-icon"><Users size={24} strokeWidth={1.8}/></div>
                <h3>{t.story_problem_t}</h3>
                <p>{t.story_problem_d}</p>
                <ul className="lp-story-problems">
                  {storyProblems.map((item,i)=>(
                    <li key={i}><CheckCircle size={16}/> {item}</li>
                  ))}
                </ul>
              </div>
              <div className="lp-story-block lp-story-block--accent">
                <div className="lp-story-block-icon"><MapPin size={24} strokeWidth={1.8}/></div>
                <h3>{t.story_local_t}</h3>
                <p>{t.story_local_s}</p>
                <div className="lp-local-values-grid">
                  {localValues.map((v,i)=>(
                    <div key={i} className="lp-local-value-card">
                      <span className="lp-local-value-icon">{v.icon}</span>
                      <span>{v.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lp-story-philosophy">
              <div className="lp-story-philosophy-item">
                <Heart size={22} strokeWidth={1.8} className="lp-story-phil-icon"/>
                <div>
                  <h4>{t.story_tools_t}</h4>
                  <p>{t.story_tools_d}</p>
                </div>
              </div>
              <div className="lp-story-philosophy-item">
                <Sparkles size={22} strokeWidth={1.8} className="lp-story-phil-icon"/>
                <div>
                  <h4>{t.story_ahead_t}</h4>
                  <p>{t.story_ahead_d}</p>
                </div>
              </div>
            </div>

            <div className="lp-bulk-banner">
              <div className="lp-bulk-banner-icon"><Package size={28} strokeWidth={1.6}/></div>
              <div className="lp-bulk-banner-text">
                <span className="lp-bulk-banner-tag"><Tag size={14}/> {lang==='en'?'BULK SAVINGS':'AHORRO POR VOLUMEN'}</span>
                <h3>{t.story_bulk_t}</h3>
                <p>{t.story_bulk_d}</p>
              </div>
              <div className="lp-bulk-banner-actions">
                <Link href="/bulk-discounts" className="lp-bulk-banner-btn">{t.story_bulk_btn} <ArrowUpRight size={16}/></Link>
                <Link href={`/catalog?lang=${lang}`} className="lp-bulk-banner-btn lp-bulk-banner-btn--outline">{t.story_shop_btn}</Link>
              </div>
            </div>
          </div>
        </section>

        {/* HOW TO ORDER */}
        <section style={{background:'var(--bg-secondary)',padding:'64px 20px'}}>
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

        {/* BEST-SELLING PRODUCTS */}
        {featuredProducts.length>0&&(
          <section className="lp-section lp-featured-section">
            <div className="container">
              <div className="lp-section-header">
                <h2>{t.feat_t}</h2>
                <p>{t.feat_s}</p>
              </div>
              <div className="lp-products-grid">
                {featuredProducts.map((p,i)=>(
                  <div key={i} className="lp-product-card">
                    {p.original_price_usd&&p.original_price_usd!==p.price_usd&&<div className="sale-badge">{lang==='en'?'SALE':'OFERTA'}</div>}
                    {p.image_url?<img src={p.image_url} alt={p.product} className="lp-product-img"/>:<div className="lp-product-img-placeholder"><FlaskConical size={40} strokeWidth={1.5}/></div>}
                    <div className="lp-product-body">
                      <span className={`lp-stock-badge${p.status?.toLowerCase()==='in stock'?' in-stock':' out-stock'}`}>
                        {p.status?.toLowerCase()==='in stock'?t.in_stock:t.out_stock}
                      </span>
                      <h4>{p.product}</h4>
                      <div className="lp-product-price">
                        {p.original_price_usd&&p.original_price_usd!==p.price_usd?(
                          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                            <span className="price-original">{lang==='en'?p.original_price_usd:p.original_price_crc||p.original_price_usd}</span>
                            <span className="price-sale">{lang==='en'?p.price_usd:p.price_crc||p.price_usd}</span>
                          </div>
                        ):(lang==='en'?p.price_usd:p.price_crc||p.price_usd)}
                      </div>
                      <div style={{display:'flex',gap:'8px',marginTop:'12px',flexWrap:'wrap'}}>
                        <Link href={`/catalog?product=${encodeURIComponent(p.product)}&lang=${lang}`} className="lp-product-btn" style={{flex:'1',textAlign:'center',justifyContent:'center',background:'var(--primary)',color:'white',padding:'9px 12px',borderRadius:'10px',textDecoration:'none',fontWeight:'700',fontSize:'0.8rem',display:'flex',alignItems:'center',gap:'4px'}}>
                          {t.feat_btn} <ArrowUpRight size={13}/>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{textAlign:'center',marginTop:'40px'}}>
                <Link href={`/catalog?lang=${lang}`} className="btn-outline">
                  {lang==='en'?'View All Products':'Ver Todos los Productos'} <ExternalLink size={15} style={{marginLeft:6,display:'inline'}}/>
                </Link>
              </div>
            </div>
          </section>
        )}

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
              <img src="/customer_transformation.png" alt={lang==='en'?'Customer experience with Peptides Costa Rica':'Experiencias de clientes con Péptidos Costa Rica'} style={{width:'100%',display:'block',height:'auto',maxHeight:'420px',objectFit:'cover',objectPosition:'center top'}} onError={(e)=>{e.target.parentElement.parentElement.parentElement.style.display='none';}}/>
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

        {/* CTA BANNER */}
        <section className="lp-cta-section">
          <div className="lp-cta-glow"/>
          <div className="container lp-cta-content">
            <h2>{t.cta_t}</h2>
            <p>{t.cta_s}</p>
            <div className="lp-cta-actions">
              <Link href={`/catalog?lang=${lang}`} className="lp-cta-primary">{t.cta_btn} <ArrowUpRight size={18}/></Link>
              <button onClick={()=>handleWA('cta')} className="lp-cta-secondary" style={{cursor:'pointer',border:'none'}}>
                <WaIcon/> {t.cta_wa}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="footer" style={{marginTop:0}}>
        <div className="container">
          <img src="/logo.png" alt="Logo" style={{height:'36px',marginBottom:'16px',opacity:0.95,borderRadius:'8px'}}/>
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
                <a href="#our-story" className="footer-col-link">{lang==='en'?'Our Story':'Nuestra Historia'}</a>
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
    </div>
  );
}
