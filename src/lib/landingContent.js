import { bulkDealBannerText, tenPlusDiscountPct } from './bulkDeal.mjs';

export const DEFAULT_LANDING_PAGE_SETTINGS = {
  landingVersion: 'v2',
  bannerActive: true,
  get bannerTextEn() { return bulkDealBannerText('en'); },
  get bannerTextEs() { return bulkDealBannerText('es'); },
  topBarTextEn: '',
  topBarTextEs: '',
  heroKickerEn: 'PEPTIDES COSTA RICA',
  heroKickerEs: 'PEPTIDES COSTA RICA',
  heroTitleEn: 'Premium Peptides in Costa Rica',
  heroTitleEs: 'Péptidos premium en Costa Rica',
  heroSubEn: 'Your local source for premium, research-grade peptide products with reliable delivery.',
  heroSubEs: 'Tu fuente local de péptidos premium de grado investigación con entrega confiable.',
  heroTextEn: 'We combine verified quality, transparent pricing, and local Costa Rica logistics so ordering is clear from product selection to delivery.',
  heroTextEs: 'Combinamos calidad verificada, precios transparentes y logística local en Costa Rica para que ordenar sea claro de principio a fin.',
  heroImageUrl: '/catalog-promo-banner.webp',
  heroDropdownLabelEn: 'What are you looking for?',
  heroDropdownLabelEs: '¿Qué estás buscando?',
  heroDropdownPlaceholderEn: 'Choose a quick action',
  heroDropdownPlaceholderEs: 'Elige una acción rápida',
  heroDropdownOptions: [
    { labelEn: 'Shop by product', labelEs: 'Comprar por producto', href: '/catalog' },
    { labelEn: 'Shop by goal', labelEs: 'Comprar por objetivo', href: '/catalog' },
    { labelEn: 'View COA library', labelEs: 'Ver biblioteca COA', href: '/info-center#coa-library' },
    { labelEn: 'Contact Us', labelEs: 'Contáctenos', href: 'contact' },
  ],
  primaryCtaEn: 'Browse All Peptide Products',
  primaryCtaEs: 'Ver todos los productos',
  secondaryCtaEn: 'Contact Us',
  secondaryCtaEs: 'Contáctenos',
  catalogBannerActive: true,
  catalogBannerImageUrl: '/catalog-promo-banner.webp',
  catalogBannerUrl: '/catalog',
  catalogBannerAltEn: 'Peptides Costa Rica product vials',
  catalogBannerAltEs: 'Viales de Peptides Costa Rica',
  pressActive: true,
  pressCtaEn: 'Read the article',
  pressCtaEs: 'Leer el articulo',
  // Each outlet that has covered us. `logoUrl` is optional — an outlet without
  // one falls back to its name as a wordmark, so a new article can go live
  // before anyone has sourced the logo asset.
  pressItems: [
    {
      outlet: 'The Costa Rica News',
      logoUrl: '/costa-rica-news-logo.png',
      url: 'https://thecostaricanews.com/introducing-peptides-costa-rica-bringing-trusted-peptide-products-to-costa-rica/',
      titleEn: 'Peptides Costa Rica Was Featured In The Costa Rica News.',
      titleEs: 'Peptides Costa Rica fue destacado en The Costa Rica News.',
      quoteEn: '"the company we wished existed"',
      quoteEs: '"la empresa que queriamos que existiera"',
    },
    {
      outlet: 'The Tico Times',
      // Their masthead, saved locally rather than hotlinked: ticotimes.net sits
      // behind a firewall that refuses anything automated, so a remote <img>
      // would be a broken image on the customer's screen.
      logoUrl: '/tico-times-logo.png',
      url: 'https://ticotimes.net/2026/07/26/why-two-fitness-veterans-chose-costa-rica-to-launch-a-new-peptide-company-peptides-costa-rica',
      titleEn: 'Why Two Fitness Veterans Chose Costa Rica To Launch A Peptide Company.',
      titleEs: 'Por que dos veteranos del fitness eligieron Costa Rica para lanzar una empresa de peptidos.',
      quoteEn: '"Why Two Fitness Veterans Chose Costa Rica"',
      quoteEs: '"Por que eligieron Costa Rica"',
    },
  ],
  differenceTitleEn: 'We Do Things Differently',
  differenceTitleEs: 'Hacemos las cosas diferente',
  differenceTextEn: 'Clear pricing, bulk discounts, direct communication, and reliable local service inside Costa Rica.',
  differenceTextEs: 'Precios claros, descuentos por volumen, comunicación directa y servicio local confiable dentro de Costa Rica.',
  differenceCards: [
    {
      titleEn: 'No cross-border delays',
      titleEs: 'Sin demoras de aduana',
      textEn: 'Inventory is already in Costa Rica, reducing international shipping uncertainty.',
      textEs: 'El inventario ya está en Costa Rica, reduciendo la incertidumbre del envio internacional.',
    },
    {
      titleEn: 'Fast, safe online ordering',
      titleEs: 'Ordenes rápidas y seguras',
      textEn: 'A streamlined checkout and live chat support help customers order with confidence.',
      textEs: 'Un checkout simple y soporte por chat en vivo ayudan a ordenar con confianza.',
    },
    {
      titleEn: 'No hidden import fees',
      titleEs: 'Sin cargos ocultos de importación',
      textEn: 'Local coordination keeps the buying process predictable and straightforward.',
      textEs: 'La coordinación local mantiene el proceso claro y predecible.',
    },
    {
      titleEn: 'Clear access and professional service',
      titleEs: 'Acceso claro y servicio profesional',
      textEn: 'Product, COA, payment, and delivery questions are answered directly.',
      textEs: 'Respondemos directamente preguntas de producto, COA, pago y entrega.',
    },
  ],
  offerTitleEn: 'What We Offer',
  offerTitleEs: 'Qué ofrecemos',
  offerTextEn: 'Peptides are studied for specific effects in the body and researched for how they interact with signaling pathways.',
  offerTextEs: 'Los péptidos se estudian por efectos específicos en el cuerpo y por cómo interactúan con vías de señalización.',
  offerCards: [
    { titleEn: 'Metabolic & Weight Optimization', titleEs: 'Metabolismo y peso', textEn: 'Research areas include metabolism, appetite regulation, and energy balance.', textEs: 'Áreas de investigación incluyen metabolismo, apetito y balance energético.' },
    { titleEn: 'Recovery & Tissue Support', titleEs: 'Recuperación y tejidos', textEn: 'Popular for research around tissue repair, joint support, and recovery routines.', textEs: 'Usados en investigación sobre reparación de tejidos, soporte articular y recuperación.' },
    { titleEn: 'Cognitive Performance & Mental Clarity', titleEs: 'Cognición y claridad mental', textEn: 'Studied for brain signaling, focus, and mental sharpness research.', textEs: 'Estudiados para señalización cerebral, enfoque y claridad mental.' },
    { titleEn: 'Skin & Regenerative Applications', titleEs: 'Piel y regeneración', textEn: 'Often researched for skin repair, collagen, and healthy tissue support.', textEs: 'Investigados para reparación de piel, colágeno y soporte de tejidos.' },
    { titleEn: 'Energy & Mitochondrial Function', titleEs: 'Energía y función mitocondrial', textEn: 'Explored for endurance, recovery, and cellular energy efficiency.', textEs: 'Explorados para resistencia, recuperación y eficiencia energética celular.' },
    { titleEn: 'Hormonal & Endocrine Signaling', titleEs: 'Señalización hormonal', textEn: 'Used in research focused on hormone signaling and endocrine balance.', textEs: 'Usados en investigación de señalización hormonal y balance endocrino.' },
  ],
  audienceTitleEn: 'Who This Is For',
  audienceTitleEs: 'Para quién es',
  audienceTextEn: 'Customers exploring performance, recovery, wellness, longevity, and research-backed product access in Costa Rica.',
  audienceTextEs: 'Clientes explorando rendimiento, recuperación, bienestar, longevidad y acceso local a productos de investigación.',
  audienceItems: [
    { titleEn: 'Performance-driven people', titleEs: 'Personas orientadas al rendimiento', textEn: 'Athletes, trainers, and active customers who want reliable local access.', textEs: 'Atletas, entrenadores y clientes activos que buscan acceso local confiable.' },
    { titleEn: 'Wellness and longevity enthusiasts', titleEs: 'Bienestar y longevidad', textEn: 'Customers researching recovery, energy, healthy aging, and resilience.', textEs: 'Clientes investigando recuperación, energía, envejecimiento saludable y resiliencia.' },
    { titleEn: 'Recovery-focused clients', titleEs: 'Clientes enfocados en recuperación', textEn: 'People comparing options for tissue, joint, and training recovery research.', textEs: 'Personas comparando opciones para investigación de tejido, articulaciones y recuperación.' },
    { titleEn: 'High-performance professionals', titleEs: 'Profesionales de alto rendimiento', textEn: 'Busy customers who need clear information and fast local coordination.', textEs: 'Clientes ocupados que necesitan información clara y coordinación local rápida.' },
  ],
  proofTitleEn: 'Real People. Real Results.',
  proofTitleEs: 'Personas reales. Resultados reales.',
  proofTextEn: 'Customer experiences vary, but clear ordering, direct support, and reliable local access make the process easier.',
  proofTextEs: 'Las experiencias varían, pero ordenar claro, soporte directo y acceso local confiable hacen el proceso más fácil.',
  proofImageUrl: '/customer_transformation.webp',
  qualityTitleEn: 'Trusted Quality.',
  qualityTitleEs: 'Calidad confiable.',
  qualityTextEn: 'Products are offered with transparent information, local availability, and customer-first support.',
  qualityTextEs: 'Productos con información transparente, disponibilidad local y soporte enfocado en el cliente.',
  faqTitleEn: 'Frequently Asked Questions',
  faqTitleEs: 'Preguntas frecuentes',
  faqItems: [
    { qEn: 'Do you ship outside Costa Rica?', qEs: '¿Envían fuera de Costa Rica?', aEn: 'No. We currently serve customers within Costa Rica only.', aEs: 'No. Actualmente servimos solo a clientes dentro de Costa Rica.' },
    { qEn: 'Do you offer online checkout?', qEs: '¿Tienen checkout en línea?', aEn: 'Yes. You can order through the catalog checkout or contact us directly through live chat.', aEs: 'Sí. Puedes ordenar por el checkout del catálogo o contactarnos por chat en vivo.' },
    { qEn: 'What payment methods do you accept?', qEs: '¿Qué métodos de pago aceptan?', aEn: 'Available payment options are shown during checkout and confirmed by our team.', aEs: 'Las opciones de pago disponibles se muestran durante checkout y son confirmadas por nuestro equipo.' },
    { qEn: 'How quickly do you respond to inquiries?', qEs: '¿Qué tan rápido responden?', aEn: 'We aim to respond quickly during normal business hours, with live chat as the fastest channel.', aEs: 'Intentamos responder rápido en horario laboral, con el chat en vivo como canal principal.' },
  ],
  bulkTitleEn: 'Bulk Savings Program',
  bulkTitleEs: 'Programa de ahorro por volumen',
  // Mirrors getVolumeDiscountPct in src/lib/pricing.js — 5+ vials = 15%,
  // 10+ = 20%, counted across the whole cart. This used to say "of the same
  // product" and omit the 20% tier, which both understated the offer and
  // contradicted the promo banner ("puedes combinar diferentes productos")
  // running above it on the same page.
  get bulkTextEn() { return `Mix any products: buy 5 or more vials for 15% off, or 10 or more for ${tenPlusDiscountPct()}% off.`; },
  get bulkTextEs() { return `Combina los productos que quieras: 5 viales o más, 15% de descuento; 10 o más, ${tenPlusDiscountPct()}%.`; },
  bulkButtonEn: 'Contact Us',
  bulkButtonEs: 'Contáctenos',
  footerDescriptionEn: 'Peptides Costa Rica offers premium, research-backed peptides for weight loss, muscle growth, energy, recovery, and healthy aging with trusted quality and bulk savings across Costa Rica.',
  footerDescriptionEs: 'Peptides Costa Rica ofrece péptidos premium de investigación para peso, músculo, energía, recuperación y envejecimiento saludable con calidad confiable en Costa Rica.',
  legalNoticeEn: 'Products offered by Peptides Costa Rica are intended strictly for laboratory research use only. They are not approved or licensed by the FDA for the prevention, diagnosis, treatment, or cure of any disease. Information on this website is for educational purposes only and should not be considered medical or legal advice. Not for human or veterinary use.',
  legalNoticeEs: 'Los productos ofrecidos por Peptides Costa Rica son estrictamente para uso de investigación de laboratorio. No están aprobados para prevenir, diagnosticar, tratar o curar enfermedades. La información de este sitio es educativa y no constituye consejo médico o legal. No apto para uso humano o veterinario.',
  footerQuickLinks: [
    { labelEn: 'Home', labelEs: 'Inicio', href: '/' },
    { labelEn: 'About us', labelEs: 'Nosotros', href: '/about' },
    { labelEn: 'Bulk Discounts', labelEs: 'Descuentos por volumen', href: '/bulk-discounts' },
    { labelEn: 'FAQ', labelEs: 'Preguntas frecuentes', href: '/faq' },
    { labelEn: 'Blog', labelEs: 'Blog', href: '/blog' },
  ],
  footerCategoryLinks: [
    // These must match the category values stored on products, or the
    // ?category= deep link resolves to the unfiltered catalog.
    { labelEn: 'Weight Loss & Metabolism', labelEs: 'Perder peso y metabolismo', href: '/catalog?category=Weight%20Loss%20%26%20Metabolism' },
    { labelEn: 'Performance & Hormones', labelEs: 'Rendimiento y hormonas', href: '/catalog?category=Performance%20%26%20Hormones' },
    { labelEn: 'Anti-Aging & Longevity', labelEs: 'Antienvejecimiento y longevidad', href: '/catalog?category=Anti-Aging%20%26%20Longevity' },
    { labelEn: 'Recovery & Healing', labelEs: 'Recuperación y curación', href: '/catalog?category=Recovery%20%26%20Healing' },
    { labelEn: 'View All', labelEs: 'Ver todo', href: '/catalog' },
  ],
};

/** Array fields fall back whole rather than being partially overwritten. */
const LANDING_LIST_KEYS = [
  'differenceCards', 'offerCards', 'audienceItems', 'faqItems',
  'heroDropdownOptions', 'footerQuickLinks', 'footerCategoryLinks', 'pressItems',
];

/**
 * Carry a pre-v2 row forward instead of discarding it.
 *
 * The old gate kept only the three banner fields and threw the rest away, so
 * copy an admin had saved and believed was live silently never rendered. Any
 * saved key that still exists in the v2 schema is preserved; keys the redesign
 * dropped are ignored, which is what the version gate was protecting against.
 */
function migrateLegacyLandingSettings(value = {}) {
  const migrated = {};
  for (const [key, saved] of Object.entries(value || {})) {
    if (key === 'landingVersion') continue;
    if (!(key in DEFAULT_LANDING_PAGE_SETTINGS)) continue;
    if (saved === null || saved === undefined || saved === '') continue;
    if (Array.isArray(saved) && !saved.length) continue;
    migrated[key] = saved;
  }
  return migrated;
}

export function mergeLandingPageSettings(value = {}) {
  const source = value?.landingVersion === 'v2'
    ? (value || {})
    : migrateLegacyLandingSettings(value);

  const merged = { ...DEFAULT_LANDING_PAGE_SETTINGS, ...source, landingVersion: 'v2' };

  for (const key of LANDING_LIST_KEYS) {
    merged[key] = Array.isArray(source[key]) && source[key].length
      ? source[key]
      : DEFAULT_LANDING_PAGE_SETTINGS[key];
  }

  return merged;
}

export const PUBLIC_PAGE_SETTING_IDS = [
  'page_info_center',
  'page_affiliate_program',
  'page_blog',
  'page_about',
  'page_faq',
  'page_bulk_discounts',
  'page_coa_database',
  'page_service_locations',
  'page_contact',
];

export const DEFAULT_PUBLIC_PAGE_SETTINGS = {
  page_info_center: {
    pageVersion: 'v1',
    heroKickerEn: 'Resource library',
    heroKickerEs: 'Biblioteca de recursos',
    heroTitleEn: 'The Peptide Info Center',
    heroTitleEs: 'Centro de información de péptidos',
    heroTextEn: 'Clear, simple answers about peptides, reconstitution, dosing questions, storage, and product comparisons.',
    heroTextEs: 'Respuestas claras sobre péptidos, reconstitución, preguntas de dosificación, almacenamiento y comparaciones.',
    searchPlaceholderEn: 'Search articles, peptides, or questions...',
    searchPlaceholderEs: 'Buscar artículos, péptidos o preguntas...',
    quickLinks: [
      { labelEn: 'How to reconstitute', labelEs: 'Cómo reconstituir', href: '/blog/how-to-reconstitute-peptides' },
      { labelEn: 'Dosing & injection guide', labelEs: 'Guía de dosificación', href: '/blog/dosing-injection-basics' },
      { labelEn: 'Storing peptides', labelEs: 'Almacenar péptidos', href: '/blog/storing-peptides-safely' },
      { labelEn: 'Retatrutide guide', labelEs: 'Guía de Retatrutide', href: '/blog/what-is-retatrutide' },
    ],
    startTitleEn: 'Start here',
    startTitleEs: 'Empieza aquí',
    steps: [
      { titleEn: 'How to reconstitute peptides', titleEs: 'Cómo reconstituir péptidos', textEn: 'Mix bacteriostatic water with your vial step by step.', textEs: 'Mezcla agua bacteriostática con tu vial paso a paso.' },
      { titleEn: 'Dosing & injection basics', titleEs: 'Bases de dosificación e inyección', textEn: 'How much to take, where to draw, and where to inject.', textEs: 'Cuánto tomar, dónde cargar y dónde aplicar.' },
      { titleEn: 'Storage & handling', titleEs: 'Almacenamiento y manejo', textEn: 'Keep products stable in Costa Rica climate.', textEs: 'Mantén productos estables en el clima de Costa Rica.' },
      { titleEn: 'Choosing your first peptide', titleEs: 'Elegir tu primer péptido', textEn: 'Match goals to the right compound.', textEs: 'Relaciona tus objetivos con el compuesto correcto.' },
    ],
    topics: [
      { titleEn: 'Foundations', titleEs: 'Fundamentos', textEn: 'The basics: what peptides are and how they work.', textEs: 'Lo básico: qué son los péptidos y cómo funcionan.' },
      { titleEn: 'Getting started', titleEs: 'Para empezar', textEn: 'Practical guides for buyers and new users.', textEs: 'Guías prácticas para compradores y usuarios nuevos.' },
      { titleEn: 'Healing & recovery', titleEs: 'Recuperación', textEn: 'BPC-157, TB-500, and tissue-repair peptides.', textEs: 'BPC-157, TB-500 y péptidos de reparación.' },
      { titleEn: 'Metabolic & weight', titleEs: 'Metabolismo y peso', textEn: 'Retatrutide, MOTS-C, and metabolic research.', textEs: 'Retatrutide, MOTS-C e investigación metabólica.' },
      { titleEn: 'Growth hormone & anti-aging', titleEs: 'GH y anti-aging', textEn: 'Sermorelin, CJC-1295, Tesamorelin, NAD+.', textEs: 'Sermorelin, CJC-1295, Tesamorelin, NAD+.' },
      { titleEn: 'Safety & side effects', titleEs: 'Seguridad y efectos', textEn: 'What research says about risk and tolerability.', textEs: 'Lo que dice la investigación sobre riesgos y tolerancia.' },
    ],
    coaTitleEn: 'COA Library',
    coaTitleEs: 'Biblioteca COA',
    coaTextEn: 'Placeholder COA links are ready for your real PDF or lab report URLs.',
    coaTextEs: 'Enlaces COA de ejemplo listos para reemplazar por PDFs o reportes reales.',
    coaLinks: [
      { labelEn: 'BPC-157 COA', labelEs: 'COA BPC-157', href: '/catalog' },
      { labelEn: 'Retatrutide COA', labelEs: 'COA Retatrutide', href: '/catalog' },
      { labelEn: 'GHK-Cu COA', labelEs: 'COA GHK-Cu', href: '/catalog' },
    ],
    ctaTitleEn: "Can't find what you're looking for?",
    ctaTitleEs: '¿No encuentras lo que buscas?',
    ctaTextEn: 'Our team is happy to help with product or dosing questions over a call.',
    ctaTextEs: 'Nuestro equipo puede ayudar con preguntas de productos o dosificación.',
  },
  page_affiliate_program: {
    pageVersion: 'v1',
    heroKickerEn: 'Partner with us',
    heroKickerEs: 'Colabora con nosotros',
    heroTitleEn: 'Earn by recommending the peptides you already trust',
    heroTitleEs: 'Gana recomendando los péptidos que ya recomiendas',
    heroTextEn: 'Our affiliate program is built for professionals and customer advocates who want a clear local supply partner.',
    heroTextEs: 'Nuestro programa de afiliados es para profesionales y referentes que quieren un proveedor local claro.',
    heroImageUrl: '/science_lab_about.webp',
    primaryButtonEn: 'Apply to Partner',
    primaryButtonEs: 'Aplicar',
    secondaryButtonEn: 'Contact Us',
    secondaryButtonEs: 'Contáctenos',
    audienceTitleEn: 'Who This Program Is For',
    audienceTitleEs: 'Para quién es este programa',
    audienceCards: [
      { titleEn: 'Health Clinics', titleEs: 'Clínicas', textEn: 'Wellness, integrative, longevity, and recovery clinics.', textEs: 'Clínicas de bienestar, longevidad y recuperación.' },
      { titleEn: 'Doctors & Practitioners', titleEs: 'Doctores y profesionales', textEn: 'Physicians and providers who need trusted local products.', textEs: 'Profesionales que necesitan productos locales confiables.' },
      { titleEn: 'Gyms & Trainers', titleEs: 'Gimnasios y entrenadores', textEn: 'Performance coaches and recovery specialists.', textEs: 'Coaches de rendimiento y especialistas en recuperación.' },
      { titleEn: 'Health Influencers', titleEs: 'Influencers de salud', textEn: 'Creators who educate customers responsibly.', textEs: 'Creadores que educan clientes de forma responsable.' },
    ],
    benefitsTitleEn: 'What You Get as a Partner',
    benefitsTitleEs: 'Qué recibes como partner',
    benefits: [
      { titleEn: 'Competitive commissions', titleEs: 'Comisiones competitivas', textEn: 'Earn for qualified referrals and repeat orders.', textEs: 'Gana por referidos calificados y órdenes repetidas.' },
      { titleEn: 'Reliable local supply', titleEs: 'Suministro local confiable', textEn: 'Products are already coordinated in Costa Rica.', textEs: 'Productos coordinados localmente en Costa Rica.' },
      { titleEn: 'Educational resources', titleEs: 'Recursos educativos', textEn: 'Support materials help customers make informed decisions.', textEs: 'Materiales de soporte para decisiones informadas.' },
      { titleEn: 'Personalized promo codes', titleEs: 'Códigos personalizados', textEn: 'Give your audience a clear way to order.', textEs: 'Da a tu audiencia una forma clara de ordenar.' },
    ],
    faqTitleEn: 'Common Questions',
    faqTitleEs: 'Preguntas comunes',
    faqItems: [
      { qEn: 'Do I need to stock products myself?', qEs: '¿Debo tener inventario?', aEn: 'No. Refer customers to us directly and we coordinate locally.', aEs: 'No. Refiere clientes y nosotros coordinamos localmente.' },
      { qEn: 'How are commissions paid?', qEs: '¿Cómo se pagan comisiones?', aEn: 'We agree on the structure before launch and track qualified referrals.', aEs: 'Acordamos la estructura antes de iniciar y damos seguimiento a referidos.' },
      { qEn: 'Is there a minimum commitment?', qEs: '¿Hay compromiso mínimo?', aEn: 'No. The program can scale with your audience or client base.', aEs: 'No. El programa puede crecer con tu audiencia o clientes.' },
    ],
    talkTitleEn: "Let's Talk",
    talkTitleEs: 'Hablemos',
    talkTextEn: 'Send us your details and we will start the conversation.',
    talkTextEs: 'Déjenos sus datos y comenzamos la conversación.',
  },
  page_blog: {
    pageVersion: 'v1',
    heroKickerEn: 'Info center',
    heroKickerEs: 'Centro de información',
    heroTitleEn: 'Peptide research, explained clearly.',
    heroTitleEs: 'Investigación de péptidos, explicada claramente.',
    heroTextEn: 'Evidence-minded articles, practical guides, and company updates from Peptides Costa Rica.',
    heroTextEs: 'Artículos basados en evidencia, guías prácticas y novedades de Peptides Costa Rica.',
    articleCtaTitleEn: 'Research-grade products, available locally.',
    articleCtaTitleEs: 'Productos de investigación, disponibles localmente.',
    articleCtaTextEn: 'Browse transparent product information and current availability in our Costa Rica catalog.',
    articleCtaTextEs: 'Consulta información transparente y disponibilidad actual en nuestro catálogo de Costa Rica.',
    articleCtaButtonEn: 'View products',
    articleCtaButtonEs: 'Ver productos',
    fallbackPosts: [
      {
        id: 'fallback-1',
        slug: 'how-to-reconstitute-peptides',
        title_en: 'How to reconstitute peptides',
        title_es: 'Cómo reconstituir péptidos',
        excerpt_en: 'A simple starter guide for mixing bacteriostatic water with peptide vials.',
        excerpt_es: 'Una guía simple para mezclar agua bacteriostática con viales de péptidos.',
        content_en: 'This placeholder article is ready to replace from the dashboard. Add your full reconstitution guide here, including product-specific cautions, storage notes, and support instructions.',
        content_es: 'Este artículo de ejemplo está listo para reemplazarse desde el dashboard. Agrega aquí tu guía completa de reconstitución, incluyendo precauciones por producto, almacenamiento e instrucciones de soporte.',
        image_url: '/catalog-promo-banner.webp',
        created_at: '2026-07-20T12:00:00.000Z',
      },
      {
        id: 'fallback-2',
        slug: 'peptide-delivery-costa-rica',
        title_en: 'Peptide delivery in Costa Rica',
        title_es: 'Entrega de péptidos en Costa Rica',
        excerpt_en: 'Availability, payment, and ordering basics for local customers.',
        excerpt_es: 'Disponibilidad, pago y conceptos básicos para clientes locales.',
        content_en: 'Use this placeholder to explain delivery areas, payment confirmation, and how customers can coordinate orders through the catalog or WhatsApp.',
        content_es: 'Usa este espacio para explicar zonas de entrega, confirmación de pago y cómo los clientes pueden coordinar pedidos desde el catálogo o WhatsApp.',
        image_url: '/vials_group_costarica.png',
        created_at: '2026-07-18T12:00:00.000Z',
      },
      {
        id: 'fallback-3',
        slug: 'what-is-retatrutide',
        title_en: 'What is Retatrutide?',
        title_es: '¿Qué es Retatrutide?',
        excerpt_en: 'A plain-language overview of one of the most requested research compounds.',
        excerpt_es: 'Un resumen claro de uno de los compuestos de investigación más solicitados.',
        content_en: 'Replace this placeholder with a careful educational article, including research context, common questions, and links to product availability or COA documents.',
        content_es: 'Reemplaza este ejemplo con un artículo educativo cuidadoso, incluyendo contexto de investigación, preguntas comunes y enlaces a disponibilidad o documentos COA.',
        image_url: '/hero_peptide_vial.png',
        created_at: '2026-07-17T12:00:00.000Z',
      },
    ],
  },
  page_about: {
    pageVersion: 'v2',
    heroKickerEn: 'OUR STORY',
    heroKickerEs: 'NUESTRA HISTORIA',
    heroTitleEn: 'Founded by longtime friends and training partners.',
    heroTitleEs: 'Fundado por amigos y compañeros de entrenamiento de muchos años.',
    heroTextEn: 'Peptides Costa Rica was founded by Joey Webster and Sean McCully. Originally from California, both made Costa Rica their home and built lasting connections through sport and business.',
    heroTextEs: 'Peptides Costa Rica fue fundado por Joey Webster y Sean McCully. Originarios de California, ambos hicieron de Costa Rica su hogar y construyeron conexiones duraderas a través del deporte y los negocios.',
    backgroundTitleEn: 'A Shared Background',
    backgroundTitleEs: 'Un Antecedente Compartido',
    backgroundTextEn: 'Combat sports brought Joey and Sean together. Their shared experience helped shape the way they approach business: with discipline, commitment, and an emphasis on relationships.',
    backgroundTextEs: 'Los deportes de combate unieron a Joey y Sean. Su experiencia compartida ayudó a dar forma a cómo abordan los negocios: con disciplina, compromiso y énfasis en las relaciones.',
    startedTitleEn: 'Why We Started',
    startedTitleEs: 'Por Qué Empezamos',
    startedTextEn: 'We saw an opportunity to make local ordering more straightforward. Peptides Costa Rica was established with a focus on clear product information, transparent pricing, direct communication, and coordinated delivery within Costa Rica.',
    startedTextEs: 'Vimos la oportunidad de hacer que los pedidos locales fueran más sencillos. Peptides Costa Rica se estableció con un enfoque en información clara del producto, precios transparentes, comunicación directa y entrega coordinada dentro de Costa Rica.',
    approachTitleEn: 'Our Approach',
    approachTitleEs: 'Nuestro Enfoque',
    approachTextEn: 'We want customers to understand what they are ordering and what to expect. Our team can help with product availability, available documentation, delivery questions, and order updates.\n\nEach listing should clearly explain the supplied material and its intended use. We do not provide personal dosing, administration, or treatment recommendations.',
    approachTextEs: 'Queremos que los clientes entiendan qué están pidiendo y qué esperar. Nuestro equipo puede ayudar con disponibilidad de productos, documentación, preguntas de entrega y actualizaciones de pedidos.\n\nCada listado debe explicar claramente el material suministrado y su uso previsto. No brindamos recomendaciones personales de dosificación, administración o tratamiento.',
    aheadTitleEn: 'Looking Ahead',
    aheadTitleEs: 'Mirando al Futuro',
    aheadTextEn: 'As we grow, our focus remains on accurate information, dependable service, and responsive communication with our customers in Costa Rica.',
    aheadTextEs: 'A medida que crecemos, nuestro enfoque sigue siendo la información precisa, el servicio confiable y la comunicación ágil con nuestros clientes en Costa Rica.',
    ctaTitleEn: 'See what is currently available.',
    ctaTitleEs: 'Mira lo que está disponible ahora.',
    ctaTextEn: 'Browse the catalog or send us a message if you want to ask something first.',
    ctaTextEs: 'Explora el catálogo o escríbenos si prefieres preguntar algo primero.',
    ctaButtonEn: 'View the catalog',
    ctaButtonEs: 'Ver el catálogo',
    contactButtonEn: 'Contact Us',
    contactButtonEs: 'Contáctenos',
  },
  page_faq: {
    pageVersion: 'v1',
    heroTitleEn: 'Frequently Asked Questions',
    heroTitleEs: 'Preguntas Frecuentes',
    // {{whatsapp}} in an answer is replaced with the business WhatsApp number.
    faqItems: [
      {
        qEn: 'Are your peptides research grade?',
        qEs: '¿Sus péptidos son de grado investigación?',
        aEn: 'Yes. All peptides are HPLC-tested and come with a Certificate of Analysis (COA) from independent labs, guaranteeing ≥98% purity.',
        aEs: 'Sí. Todos los péptidos son probados por HPLC y vienen con un Certificado de Análisis (COA) de laboratorios independientes, garantizando ≥98% de pureza.',
      },
      {
        qEn: 'How do I pay?',
        qEs: '¿Cómo puedo pagar?',
        aEn: 'We accept SINPE Móvil (CRC) and credit/debit cards (Visa, Mastercard). All payments are handled securely through our encrypted checkout.',
        aEs: 'Aceptamos SINPE Móvil (CRC) y tarjetas de crédito/débito (Visa, Mastercard). Todos los pagos son procesados de forma segura.',
      },
      {
        qEn: 'How fast is delivery?',
        qEs: '¿Qué tan rápido es el envío?',
        aEn: 'We ship within 24–48 hours of payment confirmation. Delivery to most areas of Costa Rica takes 1–3 business days.',
        aEs: 'Enviamos en 24–48 horas tras la confirmación del pago. La entrega en la mayoría de provincias tarda 1–3 días hábiles.',
      },
      {
        qEn: 'Do you include reconstitution supplies?',
        qEs: '¿Incluyen suministros de reconstitución?',
        aEn: 'Yes! Every peptide you buy includes a free 3ml vial of bacteriostatic water. Need extra vials? Add them to your cart for $10 each. You can also find syringes in the Reconstitution Supply category.',
        aEs: 'Sí. Cada péptido que compre incluye un vial de 3ml de agua bacteriostática gratis. ¿Necesita viales adicionales? Agréguelos al carrito por $10 cada uno. También puede encontrar jeringas en la categoría Suministros de Reconstitución.',
      },
      {
        qEn: 'Can I order with help from your team?',
        qEs: '¿Puedo pedir con ayuda de su equipo?',
        aEn: 'Absolutely. Start a live chat or use the Contact Us form and we will walk you through your order.',
        aEs: 'Por supuesto. Inicie un chat en vivo o use el formulario Contáctenos y le guiamos con su pedido.',
      },
    ],
    ctaTitleEn: 'Still have questions?',
    ctaTitleEs: '¿Aún tienes preguntas?',
    ctaTextEn: 'Our support team is ready to help you.',
    ctaTextEs: 'Nuestro equipo de soporte está listo para ayudarte.',
    ctaButtonEn: 'Contact Us',
    ctaButtonEs: 'Contáctanos',
  },
  page_bulk_discounts: {
    pageVersion: 'v1',
    heroTitleEn: 'Bulk Discounts',
    heroTitleEs: 'Descuentos por Volumen',
    heroTextEn: 'Save more when you buy in larger quantities for your research needs.',
    heroTextEs: 'Ahorra más al comprar en grandes cantidades para tus necesidades de investigación.',
    // Percentages must match getVolumeDiscountPct in src/lib/pricing.js, which
    // is what the cart actually charges: 5+ = 15%, 10+ = 20%. These read 10%
    // and 15% — the page selling the volume programme advertised five points
    // less than the checkout applies, on both tiers.
    get tiers() { return [
      { labelEn: '5+ Vials', labelEs: '5+ Viales', valueEn: '15% OFF', valueEs: '15% DESC.', textEn: 'Automatic discount at checkout.', textEs: 'Descuento automático en caja.' },
      { labelEn: '10+ Vials', labelEs: '10+ Viales', valueEn: `${tenPlusDiscountPct()}% OFF`, valueEs: `${tenPlusDiscountPct()}% DESC.`, textEn: 'Best value for active researchers.', textEs: 'Mejor valor para investigadores activos.' },
      { labelEn: '25+ Vials', labelEs: '25+ Viales', valueEn: 'Contact Us', valueEs: 'Contáctanos', textEn: 'Custom wholesale pricing available.', textEs: 'Precios mayoristas personalizados.' },
    ]; },
    // Index of the tier rendered with the highlighted/scaled treatment.
    featuredTierIndex: 1,
    termsTitleEn: 'Wholesale Terms',
    termsTitleEs: 'Términos Mayoristas',
    terms: [
      { labelEn: 'Discounts apply automatically in the catalog cart when thresholds are met.', labelEs: 'Los descuentos se aplican automáticamente en el carrito del catálogo.' },
      { labelEn: 'You can mix and match different peptides to reach the required vial count.', labelEs: 'Puedes combinar diferentes péptidos para alcanzar la cantidad requerida.' },
      { labelEn: 'All bulk orders still include a free BAC water vial per peptide and priority local shipping.', labelEs: 'Todos los pedidos al por mayor incluyen un vial de agua BAC gratis por péptido y envío local prioritario.' },
    ],
    ctaButtonEn: 'Start Shopping',
    ctaButtonEs: 'Comenzar a Comprar',
  },
  page_coa_database: {
    pageVersion: 'v1',
    heroTitleEn: 'COA Database',
    heroTitleEs: 'Base de Datos COA',
    heroTextEn: 'Transparency is our priority. Every peptide we distribute comes with an independent, third-party Certificate of Analysis (COA) guaranteeing ≥98% purity.',
    heroTextEs: 'La transparencia es nuestra prioridad. Cada péptido que distribuimos incluye un Certificado de Análisis (COA) independiente que garantiza ≥98% de pureza.',
    howTitleEn: 'How to view lab results',
    howTitleEs: 'Cómo ver los resultados de laboratorio',
    points: [
      { titleEn: 'Integrated in the Catalog', titleEs: 'Integrado en el Catálogo', textEn: 'We have moved all COA documents directly to the product pages for easier access.', textEs: 'Hemos movido todos los documentos COA directamente a las páginas de producto para un acceso más fácil.' },
      { titleEn: 'View PDF Instantly', titleEs: 'Ver PDF Instantáneamente', textEn: 'Simply open any product in our catalog and click the "View COA" button to download or inspect the PDF certificate.', textEs: 'Simplemente abre cualquier producto en nuestro catálogo y haz clic en el botón "Ver COA" para inspeccionar el certificado PDF.' },
    ],
    ctaButtonEn: 'Browse Products & View COAs',
    ctaButtonEs: 'Explorar Productos y Ver COAs',
  },
  page_service_locations: {
    pageVersion: 'v1',
    heroTitleEn: 'Our Service Locations',
    heroTitleEs: 'Nuestras Ubicaciones de Servicio',
    heroTextEn: 'We proudly serve customers exclusively within Costa Rica, ensuring fast, reliable, and secure delivery directly to your door.',
    heroTextEs: 'Atendemos con orgullo a clientes exclusivamente dentro de Costa Rica, garantizando entregas rápidas, confiables y seguras directamente en su puerta.',
    coverageTitleEn: 'Nationwide Coverage',
    coverageTitleEs: 'Cobertura Nacional',
    provinces: [
      { labelEn: 'San José', labelEs: 'San José' },
      { labelEn: 'Alajuela', labelEs: 'Alajuela' },
      { labelEn: 'Cartago', labelEs: 'Cartago' },
      { labelEn: 'Heredia', labelEs: 'Heredia' },
      { labelEn: 'Guanacaste', labelEs: 'Guanacaste' },
      { labelEn: 'Puntarenas', labelEs: 'Puntarenas' },
      { labelEn: 'Limón', labelEs: 'Limón' },
    ],
    courierTextEn: 'We use trusted local couriers like Correos de Costa Rica and Moovin to ensure your research peptides arrive safely within 24 to 48 hours, depending on your province.',
    courierTextEs: 'Utilizamos mensajeros locales de confianza como Correos de Costa Rica y Moovin para garantizar que sus péptidos de investigación lleguen de manera segura dentro de 24 a 48 horas, dependiendo de su provincia.',
    ctaButtonEn: 'Browse the catalog',
    ctaButtonEs: 'Ver el catálogo',
  },
  page_contact: {
    pageVersion: 'v1',
    heroKickerEn: 'DIRECT SUPPORT',
    heroKickerEs: 'SOPORTE DIRECTO',
    heroTitleEn: 'Contact Peptides Costa Rica',
    heroTitleEs: 'Contacta Peptides Costa Rica',
    heroTextEn: 'Ask about current availability, COA documentation, local delivery, or an existing order. We respond in English or Spanish.',
    heroTextEs: 'Pregunta por disponibilidad, documentación COA, entrega local o un pedido existente. Respondemos en español o inglés.',
    heroPoints: [
      { labelEn: 'Real human support', labelEs: 'Atención humana' },
      { labelEn: 'Local Costa Rica delivery', labelEs: 'Entrega local en Costa Rica' },
      { labelEn: 'COA questions welcome', labelEs: 'Consultas COA bienvenidas' },
    ],
    successTitleEn: 'Message Sent!',
    successTitleEs: '¡Mensaje Enviado!',
    successTextEn: 'Thank you for reaching out. Our team will review your message and reply to your email shortly.',
    successTextEs: 'Gracias por comunicarte. Nuestro equipo revisará tu mensaje y responderá a tu correo pronto.',
    successButtonEn: 'Send Another Message',
    successButtonEs: 'Enviar Otro Mensaje',
    methodsKickerEn: 'FAST OPTIONS',
    methodsKickerEs: 'OPCIONES RÁPIDAS',
    methodsTitleEn: 'Reach us directly',
    methodsTitleEs: 'Contáctanos directamente',
    whatsappTextEn: 'Fastest response time. Available for support and ordering.',
    whatsappTextEs: 'Respuesta más rápida. Disponible para soporte y pedidos.',
    whatsappButtonEn: 'Contact Us',
    whatsappButtonEs: 'Contáctenos',
    emailTextEn: 'For bulk inquiries or general questions.',
    emailTextEs: 'Para consultas por volumen o preguntas generales.',
    emailButtonEn: 'Email Us',
    emailButtonEs: 'Enviar Email',
  },
};

export function mergePublicPageSettings(pageId, value = {}) {
  const defaults = DEFAULT_PUBLIC_PAGE_SETTINGS[pageId] || {};
  if (value?.pageVersion !== defaults.pageVersion) return defaults;
  const merged = { ...defaults, ...(value || {}) };
  // Any default that is a list falls back whole rather than being partially
  // overwritten, so a saved page missing a list keeps the shipped one.
  for (const [key, fallback] of Object.entries(defaults)) {
    if (!Array.isArray(fallback)) continue;
    merged[key] = Array.isArray(value?.[key]) && value[key].length ? value[key] : fallback;
  }
  return merged;
}

export function mergeAllPublicPageSettings(records = {}) {
  return Object.fromEntries(
    PUBLIC_PAGE_SETTING_IDS.map((id) => [id, mergePublicPageSettings(id, records[id])])
  );
}
