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
  heroTitleEn: 'Why trust what you can test?',
  heroTitleEs: '¿Por qué confiar en lo que puedes verificar?',
  heroSubEn: 'Clear product identification, lot-specific documentation, and independent analytical testing where available.',
  heroSubEs: 'Identificación clara, documentación por lote y análisis independiente cuando está disponible.',
  heroTextEn: 'We keep the catalog practical: research-use materials, accessible documentation, local Costa Rica fulfillment, and responsive support.',
  heroTextEs: 'Mantenemos el catálogo práctico: materiales para investigación, documentación accesible, entrega local en Costa Rica y soporte directo.',
  heroImageUrl: '/catalog-promo-banner.webp',
  heroDropdownLabelEn: 'What are you looking for?',
  heroDropdownLabelEs: '¿Qué estás buscando?',
  heroDropdownPlaceholderEn: 'Choose a quick action',
  heroDropdownPlaceholderEs: 'Elige una acción rápida',
  heroDropdownOptions: [
    { labelEn: 'Shop research materials', labelEs: 'Comprar materiales de investigación', href: '/catalog' },
    { labelEn: 'Product Information', labelEs: 'Información del producto', href: '/info-center' },
    { labelEn: 'View COA library', labelEs: 'Ver biblioteca COA', href: '/info-center#coa-library' },
    { labelEn: 'Contact Us', labelEs: 'Contáctenos', href: 'contact' },
  ],
  primaryCtaEn: 'Shop Research Materials',
  primaryCtaEs: 'Comprar Materiales de Investigación',
  secondaryCtaEn: 'Search COA Database',
  secondaryCtaEs: 'Buscar Base COA',
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
  differenceTitleEn: 'Evidence Over Claims',
  differenceTitleEs: 'Evidencia antes que promesas',
  differenceTextEn: 'Anyone can print a purity number on a label. We focus on traceability, documentation, and support that helps researchers verify what they ordered.',
  differenceTextEs: 'Cualquiera puede imprimir un número de pureza en una etiqueta. Nos enfocamos en trazabilidad, documentación y soporte para verificar lo recibido.',
  differenceCards: [
    {
      titleEn: 'Lot-specific documentation',
      titleEs: 'Documentación por lote',
      textEn: 'Documentation should connect to the material ordered, not a generic product claim.',
      textEs: 'La documentación debe conectar con el material pedido, no con una afirmación genérica.',
    },
    {
      titleEn: 'Independent testing',
      titleEs: 'Pruebas independientes',
      textEn: 'Where available, third-party analytical reports are made accessible for review.',
      textEs: 'Cuando están disponibles, los reportes analíticos de terceros se hacen accesibles.',
    },
    {
      titleEn: 'Local fulfillment',
      titleEs: 'Despacho local',
      textEn: 'Orders are coordinated locally in Costa Rica with tracking information.',
      textEs: 'Los pedidos se coordinan localmente en Costa Rica con información de rastreo.',
    },
    {
      titleEn: 'Direct support',
      titleEs: 'Soporte directo',
      textEn: 'Ask about product identity, documentation, order status, or shipping before relying on a report.',
      textEs: 'Consulta identidad, documentación, estado de pedido o envío antes de confiar en un reporte.',
    },
  ],
  offerTitleEn: 'What We Offer',
  offerTitleEs: 'Qué ofrecemos',
  offerTextEn: 'We provide clear catalog access, verified specifications, and reliable local delivery.',
  offerTextEs: 'Ofrecemos acceso claro al catálogo, especificaciones verificadas y entrega local confiable.',
  offerCards: [
    { titleEn: 'Product Information', titleEs: 'Información del Producto', textEn: 'Clear descriptions of all supplied material and intended use.', textEs: 'Descripciones claras de todo el material suministrado y su uso previsto.' },
    { titleEn: 'Available Documentation', titleEs: 'Documentación Disponible', textEn: 'Independent third-party Certificates of Analysis for every batch.', textEs: 'Certificados de Análisis independientes para cada lote.' },
    { titleEn: 'Order Delivery', titleEs: 'Entrega de Pedidos', textEn: 'Fast, reliable local delivery inside Costa Rica.', textEs: 'Entrega local rápida y confiable dentro de Costa Rica.' },
    { titleEn: 'Customer Support', titleEs: 'Soporte al Cliente', textEn: 'Direct communication for availability and order updates.', textEs: 'Comunicación directa para disponibilidad y actualizaciones de pedidos.' },
  ],
  audienceTitleEn: 'Who This Is For',
  audienceTitleEs: 'Para quién es',
  audienceTextEn: 'Professionals and independent researchers who need clear information and reliable local supply.',
  audienceTextEs: 'Profesionales e investigadores independientes que necesitan información clara y suministro local confiable.',
  audienceItems: [
    { titleEn: 'Independent Researchers', titleEs: 'Investigadores Independientes', textEn: 'Access to verified products with clear third-party testing documentation.', textEs: 'Acceso a productos verificados con documentación clara de pruebas.' },
    { titleEn: 'Clinical Teams', titleEs: 'Equipos Clínicos', textEn: 'Reliable local inventory for continuous research and operational needs.', textEs: 'Inventario local confiable para investigación continua y necesidades operativas.' },
    { titleEn: 'Laboratory Staff', titleEs: 'Personal de Laboratorio', textEn: 'Transparent specifications and batch tracking for quality assurance.', textEs: 'Especificaciones transparentes y seguimiento de lotes para garantía de calidad.' },
    { titleEn: 'Professional Buyers', titleEs: 'Compradores Profesionales', textEn: 'Clear pricing, bulk options, and direct coordination in Costa Rica.', textEs: 'Precios claros, opciones por volumen y coordinación directa en Costa Rica.' },
  ],
  proofTitleEn: 'Genuine Reviews. Real Service.',
  proofTitleEs: 'Reseñas Genuinas. Servicio Real.',
  proofTextEn: 'We focus on dependable service, clear communication, and reliable local packaging and delivery.',
  proofTextEs: 'Nos enfocamos en un servicio confiable, comunicación clara y entrega local segura.',
  proofImageUrl: '/vials_group_costarica.png',
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
  footerDescriptionEn: 'Peptides Costa Rica offers premium, research-grade peptides with trusted quality and reliable local delivery across Costa Rica.',
  footerDescriptionEs: 'Peptides Costa Rica ofrece péptidos premium de grado investigación con calidad confiable y entrega local segura en Costa Rica.',
  legalNoticeEn: 'Products offered by Peptides Costa Rica are intended strictly for laboratory research use only. They are not approved or licensed by the FDA for the prevention, diagnosis, treatment, or cure of any disease. Information on this website is for educational purposes only and should not be considered medical or legal advice. Not for human or veterinary use.',
  legalNoticeEs: 'Los productos ofrecidos por Peptides Costa Rica son estrictamente para uso de investigación de laboratorio. No están aprobados para prevenir, diagnosticar, tratar o curar enfermedades. La información de este sitio es educativa y no constituye consejo médico o legal. No apto para uso humano o veterinario.',
  footerQuickLinks: [
    { labelEn: 'Home', labelEs: 'Inicio', href: '/' },
    { labelEn: 'About us', labelEs: 'Nosotros', href: '/about' },
    { labelEn: 'Deal of the Week', labelEs: 'Oferta de la Semana', href: '/deal-of-the-week' },
    { labelEn: 'Bulk Discounts', labelEs: 'Descuentos por volumen', href: '/bulk-discounts' },
    { labelEn: 'FAQ', labelEs: 'Preguntas frecuentes', href: '/faq' },
    { labelEn: 'Blog', labelEs: 'Blog', href: '/blog' },
  ],
  footerCategoryLinks: [
    // These are compound names, not categories, so they deep-link through
    // ?search= — which matches the product name — and not ?category=, which is
    // resolved against the category values actually stored on products and
    // falls back to the unfiltered catalog when nothing matches. Every one of
    // these links pointed at ?category= and silently showed the whole catalog.
    //
    // Linking by compound rather than by category is also the safer shape for
    // the card processor: a compound name makes no claim about what the
    // product is for, where "Weight Loss & Metabolism" plainly does.
    { labelEn: 'BPC-157', labelEs: 'BPC-157', href: '/catalog?search=BPC-157' },
    { labelEn: 'CJC-1295', labelEs: 'CJC-1295', href: '/catalog?search=CJC-1295' },
    { labelEn: 'GHK-Cu', labelEs: 'GHK-Cu', href: '/catalog?search=GHK-Cu' },
    { labelEn: 'GLP-1', labelEs: 'GLP-1', href: '/catalog?search=GLP-1' },
    { labelEn: 'Semaglutide', labelEs: 'Semaglutide', href: '/catalog?search=Semaglutide' },
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
    pageVersion: 'v2',
    heroKickerEn: 'Knowledge Center',
    heroKickerEs: 'Centro de conocimiento',
    heroTitleEn: 'Research-material documentation, explained clearly.',
    heroTitleEs: 'Documentación de materiales de investigación, explicada claramente.',
    heroTextEn: 'Plain-language guides for reading COAs, understanding HPLC limits, matching lot numbers, and verifying documentation before beginning research.',
    heroTextEs: 'Guías claras para leer COA, entender los límites del HPLC, comparar lotes y verificar documentación antes de iniciar investigación.',
    searchPlaceholderEn: 'Search articles, peptides, or questions...',
    searchPlaceholderEs: 'Buscar artículos, péptidos o preguntas...',
    // Every link here must point at something that exists. The four that stood
    // here pointed at blog slugs that were never written, and all four returned
    // a blank page under a 200 — a dead end that reads as a broken site.
    //
    // The dosing and injection entry is gone on top of that: the About page
    // states "We do not provide personal dosing, administration, or treatment
    // recommendations", and an underwriter reading both pages finds the
    // contradiction immediately.
    quickLinks: [
      { labelEn: 'How to read a COA', labelEs: 'Cómo leer un COA', href: '/coa-database' },
      { labelEn: 'Certificates of analysis', labelEs: 'Certificados de análisis', href: '/coa-database' },
      { labelEn: 'Storage and handling basics', labelEs: 'Bases de almacenamiento y manejo', href: '/blog' },
      { labelEn: 'Frequently asked questions', labelEs: 'Preguntas frecuentes', href: '/faq' },
    ],
    startTitleEn: 'Start here',
    startTitleEs: 'Empieza aquí',
    steps: [
      { titleEn: 'Read the full COA', titleEs: 'Leer el COA completo', textEn: 'Confirm the product, lot number, laboratory, test date, method, and reported result.', textEs: 'Confirme producto, lote, laboratorio, fecha, método y resultado reportado.' },
      { titleEn: 'Understand the method', titleEs: 'Entender el método', textEn: 'HPLC is useful, but one purity number does not prove every property of a material.', textEs: 'HPLC es útil, pero un número de pureza no prueba todas las propiedades de un material.' },
      { titleEn: 'Match the lot', titleEs: 'Comparar el lote', textEn: 'The report should connect to the specific material received, not only the product name.', textEs: 'El reporte debe conectar con el material recibido, no solo con el nombre del producto.' },
      { titleEn: 'Ask before relying on it', titleEs: 'Preguntar antes de confiar', textEn: 'If documentation is missing, unclear, or mismatched, contact support before proceeding.', textEs: 'Si falta documentación, no está clara o no coincide, contacte soporte antes de proceder.' },
    ],
    topics: [
      { titleEn: 'Certificates of Analysis', titleEs: 'Certificados de Análisis', textEn: 'What a COA can document, what it cannot prove, and how to connect it to a lot.', textEs: 'Qué puede documentar un COA, qué no prueba y cómo conectarlo a un lote.' },
      { titleEn: 'HPLC limits', titleEs: 'Límites del HPLC', textEn: 'What chromatographic purity can and cannot tell you about a research material.', textEs: 'Qué puede y no puede decir la pureza cromatográfica sobre un material.' },
      { titleEn: 'Purity and identity', titleEs: 'Pureza e identidad', textEn: 'Purity, identity, concentration, and mass are related, but not interchangeable.', textEs: 'Pureza, identidad, concentración y masa se relacionan, pero no son lo mismo.' },
      { titleEn: 'Lot traceability', titleEs: 'Trazabilidad por lote', textEn: 'Why lot numbers are the link between physical material and analytical records.', textEs: 'Por qué los lotes conectan el material físico con registros analíticos.' },
      { titleEn: 'Independent testing', titleEs: 'Pruebas independientes', textEn: 'How third-party lab reports should be reviewed in context.', textEs: 'Cómo revisar reportes de laboratorios externos en contexto.' },
      { titleEn: 'Storage and handling', titleEs: 'Almacenamiento y manejo', textEn: 'General research-material handling principles and documentation checks.', textEs: 'Principios generales de manejo y verificación documental.' },
    ],
    coaTitleEn: 'COA Library',
    coaTitleEs: 'Biblioteca COA',
    coaTextEn: 'Before beginning research, compare the product and lot information on the material with the documentation available in the COA database or on the product page.',
    coaTextEs: 'Antes de iniciar investigación, compare la información del producto y lote con la documentación disponible en la base COA o en la página del producto.',
    coaLinks: [
      { labelEn: 'BPC-157 COA', labelEs: 'COA BPC-157', href: '/catalog' },
      { labelEn: 'GLP-1 COA', labelEs: 'COA GLP-1', href: '/catalog' },
      { labelEn: 'GHK-Cu COA', labelEs: 'COA GHK-Cu', href: '/catalog' },
    ],
    ctaTitleEn: "Can't find what you're looking for?",
    ctaTitleEs: '¿No encuentras lo que buscas?',
    ctaTextEn: 'Our team can help with availability, documentation, lot matching, or an order.',
    ctaTextEs: 'Nuestro equipo puede ayudar con disponibilidad, documentación, comparación de lote o un pedido.',
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
        slug: 'what-is-glp-1',
        title_en: 'What is GLP-1?',
        title_es: '¿Qué es GLP-1?',
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
    pageVersion: 'v3',
    heroKickerEn: 'ABOUT US',
    heroKickerEs: 'SOBRE NOSOTROS',
    heroTitleEn: 'Never trust what you can test.',
    heroTitleEs: 'Nunca confíes en lo que puedes verificar.',
    heroTextEn: 'Peptides Costa Rica supplies research peptides and laboratory reference materials with a simple operating principle: customers should know what is in the vial and how the documentation connects to the lot they ordered.',
    heroTextEs: 'Peptides Costa Rica suministra péptidos de investigación y materiales de referencia con un principio simple: el cliente debe saber qué hay en el vial y cómo la documentación conecta con el lote pedido.',
    backgroundTitleEn: 'Why Verification Matters',
    backgroundTitleEs: 'Por qué importa la verificación',
    backgroundTextEn: 'A purity number can be printed on any label. A professional-looking claim is not the same as evidence. Useful documentation should identify the product, the lot or sample, the laboratory, the test date, and the analytical method used.',
    backgroundTextEs: 'Un número de pureza puede imprimirse en cualquier etiqueta. Una afirmación profesional no es lo mismo que evidencia. La documentación útil debe identificar el producto, el lote o muestra, el laboratorio, la fecha de análisis y el método utilizado.',
    startedTitleEn: 'Why We Started',
    startedTitleEs: 'Por qué empezamos',
    startedTextEn: 'We saw the same problem researchers see everywhere: too many claims and too little proof. Peptides Costa Rica was built to make local ordering clearer through traceable products, accessible documentation, direct communication, and coordinated delivery inside Costa Rica.',
    startedTextEs: 'Vimos el mismo problema que encuentran muchos investigadores: demasiadas afirmaciones y poca evidencia. Peptides Costa Rica se creó para hacer más claro el pedido local mediante productos trazables, documentación accesible, comunicación directa y entrega coordinada dentro de Costa Rica.',
    approachTitleEn: 'Our Approach',
    approachTitleEs: 'Nuestro enfoque',
    approachTextEn: 'We prioritize evidence over hype and clarity over unsupported claims. Where independent analysis is available, we make the supporting documentation accessible so customers can review the product identity, lot information, laboratory, test date, and reported results.\n\nEach listing should clearly explain the supplied material and its intended research use. We do not provide personal dosing, administration, injection, treatment, or veterinary-use recommendations.',
    approachTextEs: 'Priorizamos la evidencia sobre la publicidad y la claridad sobre afirmaciones sin respaldo. Cuando hay análisis independiente disponible, hacemos accesible la documentación para revisar identidad del producto, lote, laboratorio, fecha de análisis y resultados reportados.\n\nCada listado debe explicar claramente el material suministrado y su uso previsto para investigación. No brindamos recomendaciones de dosis, administración, inyección, tratamiento ni uso veterinario.',
    aheadTitleEn: 'Operational Accountability',
    aheadTitleEs: 'Responsabilidad operativa',
    aheadTextEn: 'Our standards are practical: document lots, make verification easier, fulfill orders locally, and answer questions about identity, documentation, order status, or shipping before a customer has to guess.',
    aheadTextEs: 'Nuestros estándares son prácticos: documentar lotes, facilitar la verificación, despachar localmente y responder preguntas sobre identidad, documentación, estado del pedido o envío antes de que el cliente tenga que adivinar.',
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
    pageVersion: 'v2',
    heroTitleEn: 'Frequently Asked Questions',
    heroTitleEs: 'Preguntas Frecuentes',
    // {{whatsapp}} in an answer is replaced with the business WhatsApp number.
    faqItems: [
      {
        qEn: 'What does Peptides Costa Rica sell?',
        qEs: '¿Qué vende Peptides Costa Rica?',
        aEn: 'We supply research peptides and laboratory reference materials intended exclusively for laboratory, analytical, and research purposes. Products are not intended for human or veterinary use.',
        aEs: 'Suministramos péptidos de investigación y materiales de referencia destinados exclusivamente a fines de laboratorio, análisis e investigación. Los productos no son para uso humano ni veterinario.',
      },
      {
        qEn: 'Is Peptides Costa Rica a local supplier?',
        qEs: '¿Peptides Costa Rica es un proveedor local?',
        aEn: 'Yes. Orders are coordinated for customers in Costa Rica with local fulfillment unless otherwise stated on the website or during checkout.',
        aEs: 'Sí. Los pedidos se coordinan para clientes en Costa Rica con despacho local, salvo que el sitio o el checkout indiquen otra cosa.',
      },
      {
        qEn: 'Can I order research peptides online?',
        qEs: '¿Puedo pedir péptidos de investigación en línea?',
        aEn: 'Eligible research products can be ordered through the catalog subject to availability, shipping eligibility, legal restrictions, and our terms. Customers are responsible for ensuring purchase and intended research use comply with applicable requirements.',
        aEs: 'Los productos elegibles pueden pedirse por el catálogo según disponibilidad, elegibilidad de envío, restricciones legales y nuestros términos. El cliente es responsable de cumplir los requisitos aplicables para la compra y uso de investigación.',
      },
      {
        qEn: 'What documentation should I review?',
        qEs: '¿Qué documentación debo revisar?',
        aEn: 'Review the product information, available COA, lot or batch number, testing laboratory, test date, and reported results. If documentation is missing, unclear, or does not match what you received, contact support before relying on it.',
        aEs: 'Revise la información del producto, COA disponible, lote o batch, laboratorio, fecha de análisis y resultados reportados. Si falta documentación, no está clara o no coincide con lo recibido, contacte soporte antes de confiar en ella.',
      },
      {
        qEn: 'Can laboratories or organizations place larger orders?',
        qEs: '¿Laboratorios u organizaciones pueden hacer pedidos mayores?',
        aEn: 'Availability of larger research orders varies by product. Qualified purchasers can contact support with the product, quantity, organization information, and purchasing requirements.',
        aEs: 'La disponibilidad de pedidos mayores varía por producto. Compradores calificados pueden contactar soporte con producto, cantidad, información de la organización y requisitos de compra.',
      },
      {
        qEn: 'Can I request a product that is not listed?',
        qEs: '¿Puedo solicitar un producto que no aparece?',
        aEn: 'You may contact support with product requests. A request does not guarantee availability, but it helps us understand what research materials customers are looking for.',
        aEs: 'Puede contactar soporte con solicitudes de productos. Una solicitud no garantiza disponibilidad, pero nos ayuda a entender qué materiales de investigación buscan los clientes.',
      },
      {
        qEn: 'Do you provide dosing or reconstitution instructions?',
        qEs: '¿Brindan instrucciones de dosis o reconstitución?',
        aEn: 'No. Our products are sold for laboratory research only. We do not provide human dosing, administration, injection, treatment, or veterinary-use instructions.',
        aEs: 'No. Nuestros productos se venden solo para investigación de laboratorio. No brindamos instrucciones de dosis, administración, inyección, tratamiento ni uso veterinario.',
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
    pageVersion: 'v2',
    heroTitleEn: 'COA Database',
    heroTitleEs: 'Base de Datos COA',
    heroTextEn: 'A COA should be treated as analytical documentation, not a marketing claim. Start by confirming what was tested and whether the report connects to the lot in front of you.',
    heroTextEs: 'Un COA debe tratarse como documentación analítica, no como publicidad. Empiece confirmando qué fue analizado y si el reporte conecta con el lote recibido.',
    howTitleEn: 'How to verify documentation',
    howTitleEs: 'Cómo verificar documentación',
    points: [
      { titleEn: 'Match the product identity', titleEs: 'Compare la identidad del producto', textEn: 'Confirm that the compound or research material named on the COA matches the product being evaluated.', textEs: 'Confirme que el compuesto o material nombrado en el COA coincide con el producto evaluado.' },
      { titleEn: 'Match the lot number', titleEs: 'Compare el número de lote', textEn: 'A report tied to a different lot may not describe the specific material received.', textEs: 'Un reporte de otro lote puede no describir el material específico recibido.' },
      { titleEn: 'Review the laboratory and method', titleEs: 'Revise laboratorio y método', textEn: 'Look at who performed the analysis, when it was tested, and which analytical method was used.', textEs: 'Revise quién realizó el análisis, cuándo se analizó y qué método analítico se utilizó.' },
      { titleEn: 'Separate what was tested from what was not', titleEs: 'Separe lo analizado de lo no analizado', textEn: 'A chromatographic purity result does not by itself prove identity, concentration, sterility, stability, or suitability for a protocol.', textEs: 'Un resultado de pureza cromatográfica no prueba por sí solo identidad, concentración, esterilidad, estabilidad ni idoneidad para un protocolo.' },
    ],
    ctaButtonEn: 'Browse Products & View COAs',
    ctaButtonEs: 'Explorar Productos y Ver COA',
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
