import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Users, ShoppingCart, Clock, 
  MapPin, Eye, DollarSign, Award, Target,
  RefreshCw, BarChart2, Calendar, ShieldAlert,
  Smartphone, Monitor, ChevronRight, ChevronDown, Zap, AlertTriangle, Play, HelpCircle, CreditCard, MessageCircle, Upload, Sparkles, Brain,
  Dna, Atom, Phone, Mail
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import ExportModal from './ExportModal';
import { adminFetch } from '@/lib/adminApi';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar } from 'recharts';
import { FALLBACK_EXCHANGE_RATE } from '@/lib/pricing';
import {
  acquisitionChannelRows,
  campaignPerformanceRows,
  isPendingAnalyticsOrder,
  isSuccessfulAnalyticsOrder,
  revenueTrendRows,
} from '@/lib/analyticsDashboard.mjs';

export default function AnalyticsDashboard({ orders: parentOrders = [], abandonedCarts: parentCarts = [], products: parentProducts = [], onNavigate }) {
  const [explainerTopic, setExplainerTopic] = useState(null);

  const EXPLAINER_DATA = {
    active_users: {
      title: "🟢 Active Visitors on Catalog",
      concept: "Visitantes Activos en Catálogo",
      description: "The number of real customers currently browsing your catalog page this very second. We detect them through a secure 'heartbeat' signal that their browser sends to our server every 15 seconds to report that they are online and engaged.",
      spanish: "El número de clientes reales que están navegando en tu catálogo en este mismo segundo. Los detectamos a través de una señal segura de 'latido' (heartbeat) que su navegador envía cada 15 segundos para reportar que están en línea y activos."
    },
    revenue: {
      title: "💵 Total Sales (Revenue)",
      concept: "Ventas Totales (Ingresos)",
      description: "This is your gross income from all successfully completed and paid orders. It shows your business performance in both US Dollars ($) and Costa Rican Colones (₡). This doesn't include pending or cancelled orders.",
      spanish: "Este es el ingreso bruto de todos los pedidos pagados y completados con éxito. Muestra el rendimiento de tu negocio tanto en dólares ($) como en colones costarricenses (₡). No incluye pedidos pendientes o cancelados."
    },
    aov: {
      title: "📈 Average Order Value (AOV)",
      concept: "Valor Promedio del Pedido (AOV)",
      description: "The average amount of money a customer spends when they make a purchase on your store (Revenue divided by number of successful orders). A higher Average Order Value means customers are buying more products per checkout, which dramatically boosts profit margins!",
      spanish: "La cantidad promedio de dinero que gasta un cliente cuando compra en tu tienda (Ingresos divididos por el número de pedidos exitosos). ¡Un valor de pedido promedio más alto significa que los clientes comran más productos por compra, lo que aumenta enormemente las ganancias!"
    },
    conversion_rate: {
      title: "🎯 Store Conversion Rate",
      concept: "Tasa de Conversión de la Tienda",
      description: "The percentage of website visitors who ended up buying something. For example, if 100 people visit your site and 2 people complete a checkout, your conversion rate is 2%. Standard e-commerce conversion rates range between 1.5% and 3%. High numbers indicate great pricing and highly trustable branding!",
      spanish: "El porcentaje de visitantes de la web que terminaron comprando algo. Por ejemplo, si 100 personas visitan tu sitio y 2 completan una compra, tu tasa de conversión es del 2%. Las tasas normales de comercio electrónico oscilan entre 1.5% y 3%. ¡Las tasas altas indican precios excelentes y una marca muy confiable!"
    },
    abandoned_carts: {
      title: "🛒 Abandoned Shopping Carts",
      concept: "Carritos de Compra Abandonados",
      description: "These are shopping carts created by visitors who added peptides to their cart but left the website before finishing their checkout. Think of it like a customer leaving a physical cart full of groceries in a supermarket aisle. In online sales, these are high-intent leads that can be recovered with a quick follow-up message!",
      spanish: "Estos son carritos de compras creados por visitantes que agregaron péptidos a su carrito pero abandonaron el sitio web antes de finalizar el pago. Piensa en ello como un cliente que deja un carrito lleno de compras en un pasillo de supermercado. En las ventas en línea, ¡estos son clientes de alto interés que pueden recuperarse con un recordatorio rápido!"
    },
    recovery_rate: {
      title: "🔄 Cart Recovery Rate",
      concept: "Tasa de Recuperación de Carritos",
      description: "The percentage of abandoned shopping carts that you successfully rescued (meaning the customer returned and purchased their items) after sending them WhatsApp or email recovery reminders. Rescuing abandoned carts is the easiest way to immediately increase your revenue!",
      spanish: "El porcentaje de carritos de compras abandonados que rescataste con éxito (es decir, el cliente regresó y compró sus artículos) después de enviarles recordatorios de WhatsApp o correo electrónico. ¡Rescatar carritos abandonados es la forma más fácil de aumentar tus ingresos de inmediato!"
    },
    potential_revenue: {
      title: "💎 Potential Recoverable Value",
      concept: "Valor Potencial Recuperable",
      description: "The total monetary value of all items currently sitting inside active abandoned shopping carts. This represents 'almost captured' money. Sending recovery messages to these customers helps you capture these sales and claim this revenue!",
      spanish: "El valor monetario total de todos los artículos que se encuentran actualmente dentro de los carritos de compras abandonados activos. Esto representa dinero 'casi capturado'. ¡Enviar mensajes de recuperación a estos clientes te ayuda a capturar estas ventas y reclamar estos ingresos!"
    },
    open_time: {
      title: "⏱️ Average Catalog View Time",
      concept: "Tiempo Promedio de Vista del Catálogo",
      description: "The average duration (in minutes and seconds) a visitor spends reading through your peptide products list. A higher view time (e.g. over 2 minutes) means customers are highly engaged, reading the clinical descriptions, and actively considering a purchase!",
      spanish: "La duración promedio (en minutos y segundos) que pasa un visitante leyendo tu lista de productos de péptidos. ¡Un mayor tiempo de visualización (por ejemplo, más de 2 minutos) significa que los clientes están muy interesados, leyendo las descripciones clínicas y considerando activamente una compra!"
    },
    device_breakdown: {
      title: "📱 Device Usage (Mobile vs. Desktop)",
      concept: "Uso de Dispositivos (Móvil vs. Escritorio)",
      description: "This tells you whether your visitors are accessing your catalog on smartphones (Mobile) or laptops/desktop computers (Desktop). Over 85% of modern traffic in Costa Rica comes from mobile, which is why having an outstanding mobile storefront visualizer is critical!",
      spanish: "Esto te indica si tus visitantes acceden a tu catálogo desde teléfonos inteligentes (Móvil) o desde computadoras portátiles/de escritorio (Escritorio). Más del 85% del tráfico moderno proviene de dispositivos móviles, por lo que es vital que el escaparate móvil funcione a la perfección."
    },
    clicks_feed: {
      title: "⚡ Live Telemetry Clicks Feed",
      concept: "Canal de Clicks de Telemetría en Vivo",
      description: "A chronological live stream showing exactly what buttons or links visitors are clicking on your storefront in real time. For example, if a user clicks 'Ver Certificado de Análisis', it means they are looking at the lab purity sheet for that peptide product, displaying extreme buyer interest!",
      spanish: "Una transmisión cronológica en vivo que muestra exactamente qué botones o enlaces están pulsando los visitantes en tu tienda en tiempo real. Por ejemplo, si un usuario hace click en 'Ver Certificado de Análisis', significa que está mirando el reporte de pureza de laboratorio, mostrando un interés de compra extremo."
    },
    heatmap: {
      title: "🔥 Smartphone Click Heatmap Visualizer",
      concept: "Visualizador de Mapa de Calor de Clicks",
      description: "A color-coded visual map showing where visitors tap most on your storefront preview screen. Hotter areas (red, orange) indicate high click activity (like buy buttons or image sliders), while green/blue areas represent occasional clicks. It shows you exactly what products draw the most customer eyeballs!",
      spanish: "Un mapa visual codificado por colores que muestra dónde pulsan más los visitantes en la pantalla de vista previa de tu tienda. Las áreas más cálidas (rojo, naranja) indican una alta actividad de clicks (como botones de compra o galerías de imágenes), mientras que las áreas verdes/azules representan clicks ocasionales. ¡Te muestra exactamente qué productos atraen la atención del cliente!"
    },
    geo_insights: {
      title: "📍 Customer Locations (Top Cities)",
      concept: "Ubicaciones de Clientes (Ciudades Principales)",
      description: "Shows which cities in Costa Rica (like San José, Alajuela, Heredia, or Escazú) your visitors are accessing your site from. You can use this geographical data to offer free shipping promos or target specific local marketing campaigns!",
      spanish: "Muestra desde qué ciudades de Costa Rica (como San José, Alajuela, Heredia o Escazú) acceden los visitantes a tu sitio. ¡Puedes usar estos datos geográficos para ofrecer promociones de envío gratis o dirigir campañas de marketing local específicas!"
    }
  };

  const renderExplainerTrigger = (topic) => {
    return (
      <span 
        onClick={(e) => {
          e.stopPropagation();
          setExplainerTopic(topic);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: 'rgba(56, 189, 248, 0.12)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          color: '#38bdf8',
          fontSize: '0.75rem',
          fontWeight: 'bold',
          cursor: 'pointer',
          zIndex: 10,
          transition: 'all 0.2s',
          marginLeft: '6px'
        }}
        title="What does this mean? / ¿Qué significa esto?"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(56, 189, 248, 0.25)';
          e.currentTarget.style.transform = 'scale(1.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(56, 189, 248, 0.12)';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        💡
      </span>
    );
  };

  const [timeRange, setTimeRange] = useState('all');
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [showProductFunnel, setShowProductFunnel] = useState(false);
  const [expandedMetric, setExpandedMetric] = useState(null); // 'revenue'|'aov'|'carts'|'conversion'

  const [showGuideTip, setShowGuideTip] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  
  // 🧬 AI Sales Recommender Simulator States
  const [selectedSimPeptide, setSelectedSimPeptide] = useState('Retatrutide 10mg');
  const [projectedViewsMultiplier, setProjectedViewsMultiplier] = useState(1.5);
  
  // AI Insights States
  const [aiInsightText, setAiInsightText] = useState('');
  const [generatingAiInsights, setGeneratingAiInsights] = useState(false);

  useEffect(() => {
    if (generatingAiInsights || aiInsightText) setShowAiPanel(true);
  }, [generatingAiInsights, aiInsightText]);

  const generateAiInsights = async () => {
    setGeneratingAiInsights(true);
    setAiInsightText('');
    try {
      const prompt = `You are the chief e-commerce financial analyst at Peptides Costa Rica.
Analyze the following store metrics and provide a comprehensive executive e-commerce audit report:
- Gross Revenue: $${totalRevenueUsd.toFixed(2)} (CRC ${totalRevenueCrc.toLocaleString()})
- Total Paid Orders: ${successfulOrders.length}
- Average Order Value (AOV): $${aovUsd.toFixed(2)}
- Conversion Rate: ${orderConversionRate.toFixed(2)}% (visitors: ${uniqueVisitorCount}, paid orders: ${successfulOrders.length})
- Abandoned Cart Rate: ${cartAbandonmentRate.toFixed(2)}% (active abandoned: ${activeAbandonedCarts.length})
- Potential Recoverable Revenue from Carts: $${potentialAbandonedRevenueUsd.toFixed(2)}
- Average Catalog Engagement: ${formatDuration(averageDurationSeconds)}
- Top Selling Products: ${productMetrics.slice(0, 3).map(p => `${p.name} (${p.purchases} sales, ${p.views} views, ${p.conversion.toFixed(1)}% conv)`).join(', ')}
- Zero Click / Cold Products: ${coldPeptides.map(p => `${p.name} (${p.views} views)`).join(', ')}

Please provide the analysis in BOTH English and Spanish. 
Format it as two clear, consecutive sections:
"🇬🇧 ENGLISH EXECUTIVE REPORT"
and
"🇪🇸 REPORTE EJECUTIVO EN ESPAÑOL"

For each language section, include:
1. **Performance Verdict** (1 bold sentence grading the setup).
2. **Key Positive Discoveries** (2-3 bullet points).
3. **Severe Leaks & Bottlenecks** (2-3 bullet points).
4. **Actionable Recommendations** (3-4 bullet points).

Keep your tone highly professional, precise, data-driven, and empowering. Format with clean Markdown (bold text, bullet points). Do not write any greetings or preambles, just start directly with the English header.`;

      const res = await adminFetch('/api/ai', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'chat',
          prompt
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAiInsightText(data.text);
      } else {
        alert('Failed to generate insights: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to generate insights: ' + err.message);
    } finally {
      setGeneratingAiInsights(false);
    }
  };

  // Database analytics state
  const [dbSessions, setDbSessions] = useState([]);
  const [dbProductViews, setDbProductViews] = useState([]);
  const [dbOrders, setDbOrders] = useState([]);
  const [dbCarts, setDbCarts] = useState([]);
  const [dbCampaigns, setDbCampaigns] = useState([]);
  const [dbClickEvents, setDbClickEvents] = useState([]);
  const [dbAnalyticsEvents, setDbAnalyticsEvents] = useState([]);
  const [analyticsMeta, setAnalyticsMeta] = useState(null);
  const [analyticsErrors, setAnalyticsErrors] = useState([]);
  const [campaignError, setCampaignError] = useState('');

  // Heatmap UI States
  const heatmapViewMode = 'live';
  const [heatmapIntentFilter, setHeatmapIntentFilter] = useState('all'); // 'all' | 'intent'
  const [showHeatmapMock, setShowHeatmapMock] = useState(false);
  
  // Real-time counter of updates
  const [refreshKey, setRefreshKey] = useState(0);

  // Export Modal States
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  // Load live DB analytics data
  useEffect(() => {
    const fetchDbAnalytics = async () => {
      setLoading(true);
      let liveConnected = false;

      try {
        const response = await adminFetch(`/api/admin/analytics-dashboard?range=${encodeURIComponent(timeRange)}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Analytics data request failed.');

        const data = payload.data || {};
        setDbSessions(data.sessions || []);
        setDbProductViews(data.productViews || []);
        setDbOrders(data.orders || []);
        setDbCarts(data.carts || []);
        setDbClickEvents(data.clicks || []);
        setDbAnalyticsEvents(data.events || []);
        setDbCampaigns(data.campaigns || []);
        setAnalyticsMeta({
          counts: payload.counts || {},
          sampled: payload.sampled || [],
          sampleLimit: payload.sampleLimit || 1000,
          range: payload.range || timeRange,
        });
        const sourceErrors = payload.errors || [];
        setAnalyticsErrors(sourceErrors.filter((error) => error.source !== 'campaigns'));
        setCampaignError(sourceErrors.find((error) => error.source === 'campaigns')?.message || '');
        liveConnected = Object.values(payload.counts || {}).some((count) => Number(count || 0) > 0);
      } catch (err) {
        console.error('Database analytics fetch failed:', err);
        setAnalyticsMeta(null);
        setAnalyticsErrors([{ source: 'dashboard', message: err.message }]);
        setDbCampaigns([]);
        setCampaignError(err.message);
      }

      setIsLive(liveConnected);
      setLoading(false);
    };

    fetchDbAnalytics();
  }, [refreshKey, timeRange]);

  const getProcessedData = () => {
    const rawOrders = analyticsMeta ? dbOrders : (parentOrders.length > 0 ? parentOrders : dbOrders);
    const rawCarts = analyticsMeta ? dbCarts : (parentCarts.length > 0 ? parentCarts : dbCarts);
    const rawSessions = dbSessions;
    const rawViews = dbProductViews;
    const rawClicks = dbClickEvents;

    // Filter by Time Range
    const now = new Date();
    const filterByTime = (item) => {
      const timestamp = item.last_active || item.created_at;
      if (!timestamp) return true;
      const date = new Date(timestamp);
      const diffMs = now - date;

      if (timeRange === '24h') return diffMs <= 24 * 3600000;
      if (timeRange === '7d') return diffMs <= 7 * 24 * 3600000;
      if (timeRange === '30d') return diffMs <= 30 * 24 * 3600000;
      return true; // all time
    };

    return {
      orders: rawOrders.filter(filterByTime),
      carts: rawCarts.filter(filterByTime),
      sessions: rawSessions.filter(filterByTime),
      productViews: rawViews.filter(filterByTime),
      clicks: rawClicks.filter(filterByTime)
    };
  };

  const { orders, carts, sessions, productViews, clicks } = getProcessedData();

  // Calculate currently active live users (heartbeat within last 45 seconds)
  const activeThreshold = new Date(Date.now() - 45000);
  const activeLiveSessions = dbSessions
    .filter((session) => session.last_active && new Date(session.last_active) >= activeThreshold)
    .sort((left, right) => new Date(right.last_active) - new Date(left.last_active));
  const activeLiveUsers = activeLiveSessions.length;
  const knownActiveUsers = activeLiveSessions.filter((session) => session.known_customer).length;
  const activeDomains = new Set(activeLiveSessions.map((session) => session.hostname).filter(Boolean)).size;

  const livePageCounts = Object.entries(activeLiveSessions.reduce((counts, session) => {
    const label = `${session.hostname || 'catalog'}${session.current_path || '/catalog'}`;
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {})).sort((left, right) => right[1] - left[1]).slice(0, 8);

  const liveSourceCounts = Object.entries(activeLiveSessions.reduce((counts, session) => {
    const source = session.last_touch_source || session.utm_source || 'direct';
    counts[source] = (counts[source] || 0) + 1;
    return counts;
  }, {})).sort((left, right) => right[1] - left[1]).slice(0, 6);

  const journeyEvents = dbAnalyticsEvents.filter((event) => {
    if (!event.created_at) return true;
    const age = Date.now() - new Date(event.created_at).getTime();
    if (timeRange === '24h') return age <= 24 * 3600000;
    if (timeRange === '7d') return age <= 7 * 24 * 3600000;
    if (timeRange === '30d') return age <= 30 * 24 * 3600000;
    return true;
  });

  // -------------------------------------------------------------
  // CALCULATE FINANCIAL STATISTICS
  // -------------------------------------------------------------
  
  // Successful orders (Paid, Completed, Order Complete)
  const successfulOrders = orders.filter(isSuccessfulAnalyticsOrder);
  
  const totalRevenueUsd = successfulOrders.reduce((sum, o) => sum + (parseFloat(o.total_usd) || 0), 0);
  const totalRevenueCrc = successfulOrders.reduce((sum, o) => sum + (parseFloat(o.total_crc) || 0), 0);

  // Average Order Value (AOV)
  const aovUsd = successfulOrders.length > 0 ? (totalRevenueUsd / successfulOrders.length) : 0;
  const aovCrc = successfulOrders.length > 0 ? (totalRevenueCrc / successfulOrders.length) : 0;

  // Pipeline (Pending orders)
  const pendingOrders = orders.filter(isPendingAnalyticsOrder);
  const pipelineUsd = pendingOrders.reduce((sum, o) => sum + (parseFloat(o.total_usd) || 0), 0);
  const pipelineCrc = pendingOrders.reduce((sum, o) => sum + (parseFloat(o.total_crc) || 0), 0);

  // -------------------------------------------------------------
  // CALCULATE CONVERSION AND CUSTOMER STATS
  // -------------------------------------------------------------

  // Placed Orders / Total Visitor Sessions
  const uniqueVisitorCount = Number(analyticsMeta?.counts?.sessions ?? sessions.length);
  const orderConversionRate = uniqueVisitorCount > 0
    ? Math.min((successfulOrders.length / uniqueVisitorCount) * 100, 100)
    : 0;

  // Abandoned Carts stats
  const activeAbandonedCarts = carts.filter(c => c.status === 'active');
  const convertedCarts = carts.filter(c => c.status === 'converted');
  const totalTrackedCarts = Math.max(activeAbandonedCarts.length + convertedCarts.length, 1);
  
  const cartAbandonmentRate = (activeAbandonedCarts.length / totalTrackedCarts) * 100;
  const cartRecoveryRate = (convertedCarts.length / totalTrackedCarts) * 100;

  // Potential Revenue (Abandoned Carts Value)
  const calculateCartValue = (cartItems) => {
    if (!Array.isArray(cartItems)) return 0;
    return cartItems.reduce((acc, item) => {
      const price = parseFloat((item.price_usd || item.priceUsd || '0').replace(/[^0-9.]/g, '')) || 0;
      return acc + (price * (item.qty || 1));
    }, 0);
  };

  const potentialAbandonedRevenueUsd = activeAbandonedCarts.reduce((sum, c) => sum + calculateCartValue(c.cart_data), 0);
  const potentialAbandonedRevenueCrc = Math.round(potentialAbandonedRevenueUsd * FALLBACK_EXCHANGE_RATE);

  // Average Catalog duration (Page Open time)
  const durationSessions = sessions.filter(s => s.catalog_duration > 0);
  const averageDurationSeconds = durationSessions.length > 0
    ? (durationSessions.reduce((sum, s) => sum + s.catalog_duration, 0) / durationSessions.length)
    : 0;

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  // Device Breakdown (Mobile vs Desktop)
  const mobileCount = sessions.filter(s => {
    const ua = (s.device_info || '').toLowerCase();
    return ua.includes('mobi') || ua.includes('android') || ua.includes('iphone');
  }).length;
  const desktopCount = Math.max(sessions.length - mobileCount, 0);
  const mobilePct = sessions.length > 0 ? (mobileCount / sessions.length) * 100 : 0;
  const desktopPct = sessions.length > 0 ? (desktopCount / sessions.length) * 100 : 0;

  // -------------------------------------------------------------
  // CUSTOMER GEOGRAPHIC INSIGHTS (CITIES)
  // -------------------------------------------------------------

  // Top Cities by Visitor Traffic
  const visitorCityCounts = {};
  sessions.forEach(s => {
    const city = s.city || 'Unknown';
    if (city !== 'Unknown') {
      visitorCityCounts[city] = (visitorCityCounts[city] || 0) + 1;
    }
  });

  const sortedVisitorCities = Object.entries(visitorCityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const maxVisitorCount = sortedVisitorCities.length > 0 ? Math.max(...sortedVisitorCities.map(c => c[1])) : 1;

  // Top Cities by Placed Orders
  const orderCityCounts = {};
  const getOrderAttributionSource = (order) => {
    if (order.whatsapp_source) return `WhatsApp: ${order.whatsapp_source}`;
    if (order.campaign_id) return 'Marketing Studio campaigns';
    if (order.journey_id) return 'Marketing journeys';
    if (String(order.source || '').toLowerCase() === 'admin_manual') return 'Admin manual';
    if (String(order.source || '').toLowerCase() === 'woocommerce') return 'WooCommerce';
    return 'Catalog / organic';
  };

  orders.forEach(o => {
    // Check inside location_data JSON or parse address
    let city = 'Unknown';
    if (o.location_data && o.location_data.city) {
      city = o.location_data.city;
    } else if (typeof o.shipping_address === 'string') {
      // Basic heuristic: check if address mentions common cities
      const addr = o.shipping_address.toLowerCase();
      if (addr.includes('escazu') || addr.includes('escazú')) city = 'Escazú';
      else if (addr.includes('santa ana')) city = 'Santa Ana';
      else if (addr.includes('sabanilla') || addr.includes('san jose') || addr.includes('san josé') || addr.includes('san pedro')) city = 'San José';
      else if (addr.includes('heredia')) city = 'Heredia';
      else if (addr.includes('alajuela')) city = 'Alajuela';
      else if (addr.includes('cartago')) city = 'Cartago';
      else if (addr.includes('liberia')) city = 'Liberia';
      else if (addr.includes('jaco') || addr.includes('jacó')) city = 'Jacó';
    }

    if (city !== 'Unknown') {
      orderCityCounts[city] = (orderCityCounts[city] || 0) + 1;
    }
  });

  const sortedOrderCities = Object.entries(orderCityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const maxOrderCount = sortedOrderCities.length > 0 ? Math.max(...sortedOrderCities.map(c => c[1])) : 1;

  // -------------------------------------------------------------
  // PRODUCT VIEW METRICS & VIEW-TO-PURCHASE CONVERSIONS
  // -------------------------------------------------------------
  const productViewCounts = {};
  productViews.forEach(v => {
    const pName = v.product_name || 'Unknown';
    productViewCounts[pName] = (productViewCounts[pName] || 0) + 1;
  });

  // Calculate product purchases (how many times they were bought)
  const productPurchaseCounts = {};
  orders.forEach(o => {
    if (Array.isArray(o.items)) {
      o.items.forEach(i => {
        const pName = i.product;
        if (pName) {
          productPurchaseCounts[pName] = (productPurchaseCounts[pName] || 0) + (i.qty || 1);
        }
      });
    }
  });

  // Compile list of store product names to track zero-click items
  const allStoreProductNames = parentProducts && parentProducts.length > 0
    ? parentProducts.map(p => p.product)
    : ['Tirzepatide 10mg', 'Semaglutide 5mg', 'Retatrutide 10mg', 'BPC-157 5mg', 'TB-500 5mg', 'Ipamorelin 5mg', 'CJC-1295 5mg', 'AOD-9604 5mg'];

  // MergeViews and Purchases, including zero-click products
  const allProductNames = Array.from(new Set([
    ...allStoreProductNames,
    ...Object.keys(productViewCounts),
    ...Object.keys(productPurchaseCounts)
  ])).filter(name => name !== 'Unknown' && name);

  const productMetrics = allProductNames.map(name => {
    const views = productViewCounts[name] || 0;
    const purchases = productPurchaseCounts[name] || 0;
    // Conversion rate: purchases / views (capped at 100% just in case of stale views)
    const conversion = views > 0 ? Math.min((purchases / views) * 100, 100) : 0;
    
    return { name, views, purchases, conversion };
  }).sort((a, b) => b.views - a.views);

  const maxProductViews = productMetrics.length > 0 ? Math.max(...productMetrics.map(p => p.views)) : 1;

  // -------------------------------------------------------------
  // ADVANCED ANALYSIS: HOT & COLD PEPTIDES & PAYMENT METHODS
  // -------------------------------------------------------------
  
  // Hot Peptides = Top 3 Clicked (only those with > 0 clicks to keep it accurate!)
  const hotPeptides = productMetrics.filter(p => p.views > 0).slice(0, 3);
  
  // Exclude hotPeptides from coldPeptides calculation to prevent duplication/overlap
  const remainingForCold = productMetrics.filter(p => !hotPeptides.some(hp => hp.name === p.name));
  
  // Cold Peptides = Bottom 3 Clicked (sorted ascending so 0-click products come first!)
  const coldPeptides = remainingForCold
    .sort((a, b) => a.views - b.views)
    .slice(0, 3);

  // 🧬 AI Sales Recommender Simulator calculations
  const activeSimPeptideObj = productMetrics.find(p => p.name === selectedSimPeptide) || {
    name: selectedSimPeptide,
    views: 12,
    purchases: 1,
    conversion: 8.3
  };

  const getPeptideBasePrice = (name) => {
    const n = name.toLowerCase();
    if (n.includes('tirzepatide')) return 145;
    if (n.includes('semaglutide')) return 95;
    if (n.includes('retatrutide')) return 120;
    if (n.includes('bpc-157') || n.includes('bpc157')) return 95;
    if (n.includes('tb-500') || n.includes('tb500')) return 95;
    if (n.includes('aod-9604') || n.includes('aod9604')) return 110;
    return 100;
  };

  const simBasePrice = getPeptideBasePrice(selectedSimPeptide);
  const currentViews = Math.max(activeSimPeptideObj.views, 1);
  const currentConversion = activeSimPeptideObj.conversion || 5.0; 
  const simulatedViews = Math.round(currentViews * projectedViewsMultiplier);
  const simulatedPurchases = Math.round(simulatedViews * (currentConversion / 100));
  
  const currentRevenue = activeSimPeptideObj.purchases * simBasePrice;
  const projectedRevenue = simulatedPurchases * simBasePrice;
  const netLift = Math.max(projectedRevenue - currentRevenue, 0);

  const getSimulatedHook = (name) => {
    const n = name.toLowerCase();
    if (n.includes('retatrutide')) {
      return {
        title: "🧬 Retatrutide Triple Agonist Hook",
        desc: "Highlight triple-action receptor clinical breakthroughs (GLP-1, GIP, GCGR) to attract high-tier longevity researchers looking for advanced metabolic efficiency solutions.",
        badge: "Highest Premium Margin",
        color: "#fbbf24",
        hookText: "🔥 Scientific Tip: Highlight triple agonist synergy in WhatsApp check-ins. It converts 40% faster than generic weight-loss hooks!"
      };
    }
    if (n.includes('tirzepatide')) {
      return {
        title: "💎 Tirzepatide Premium Dual-Agonist Hook",
        desc: "Promote certified purity >99% and dual GLP-1/GIP receptor pathways. Address stock availability immediately as this is your top traffic-generating peptide.",
        badge: "Top Volume Driver",
        color: "#34d399",
        hookText: "⚡ Action: Send a WhatsApp broadcast noting 'Fresh certified batch of Tirzepatide with verified lab sheets now in stock' to capture the 14% cart drop-offs!"
      };
    }
    if (n.includes('semaglutide')) {
      return {
        title: "🥗 Semaglutide Classic Metabolic Hook",
        desc: "Address cost-conscious researchers looking for stable, well-documented protocols. Offer a 'Starter Kit bundle' combining Semaglutide with BPC-157 to increase AOV by 25%.",
        badge: "Highest Brand Loyalty",
        color: "#38bdf8",
        hookText: "💡 Bundle Idea: Suggest combining Semaglutide + BPC-157 in email drafts to speed up training recovery while optimizing metabolic research!"
      };
    }
    if (n.includes('bpc-157') || n.includes('bpc157')) {
      return {
        title: "🩹 BPC-157 Rapid Tissue Healing Hook",
        desc: "Focus on gastric protection and cellular repair. Highlight that it is ideal for rapid joint/tendon research acceleration.",
        badge: "Top Cross-Seller",
        color: "#a78bfa",
        hookText: "🧪 Cross-Sell Strategy: BPC-157 has a 45% natural cross-sell rate with sports recovery peptides. Suggest it as an add-on during checkout!"
      };
    }
    return {
      title: "🔬 Specialized Clinical Peptide Hook",
      desc: "Promote certified clinical purity sheets and certified cold-chain shipping throughout Costa Rica to build high technical trust.",
      badge: "Niche Research",
      color: "#94a3b8",
      hookText: "📡 Trust Builder: Include a direct download link to the COA (Certificate of Analysis) in outreach messages to overcome security doubts."
    };
  };

  const simHook = getSimulatedHook(selectedSimPeptide);

  const normalizePaymentMethod = (method) => {
    const value = String(method || 'whatsapp').trim().toLowerCase();
    if (value === 'tilopay' || value === 'tilo pay' || value === 'shieldhubpay' || value === 'shield hub pay') return 'card';
    return value || 'whatsapp';
  };

  const getPaymentMethodLabel = (method) => {
    if (method === 'sinpe') return 'SINPE Móvil';
    if (method === 'card') return 'Credit Card';
    if (method === 'whatsapp') return 'WhatsApp';
    if (method === 'paypal') return 'PayPal';
    return method.toUpperCase();
  };

  // Payment channels and Source metrics
  const paymentBreakdown = {};
  const orderSourceBreakdown = {};
  
  orders.forEach(o => {
    const method = normalizePaymentMethod(o.payment_method);
    if (!paymentBreakdown[method]) {
      paymentBreakdown[method] = { count: 0, revenue: 0 };
    }
    paymentBreakdown[method].count += 1;
    if (o.status?.toLowerCase() === 'paid' || o.status?.toLowerCase() === 'completed' || o.status?.toLowerCase() === 'order complete') {
      paymentBreakdown[method].revenue += (parseFloat(o.total_usd) || 0);
    }
    
    // Order attribution sources. This includes WhatsApp when it was recorded,
    // without falsely labeling every unattributed order as WhatsApp traffic.
    const source = getOrderAttributionSource(o);
    if (!orderSourceBreakdown[source]) {
      orderSourceBreakdown[source] = { count: 0, revenue: 0 };
    }
    orderSourceBreakdown[source].count += 1;
    if (o.status?.toLowerCase() === 'paid' || o.status?.toLowerCase() === 'completed' || o.status?.toLowerCase() === 'order complete') {
      orderSourceBreakdown[source].revenue += (parseFloat(o.total_usd) || 0);
    }
  });

  const maxPaymentCount = Object.keys(paymentBreakdown).length > 0 
    ? Math.max(...Object.values(paymentBreakdown).map(p => p.count)) 
    : 1;

  const maxSourceCount = Object.keys(orderSourceBreakdown).length > 0
    ? Math.max(...Object.values(orderSourceBreakdown).map(s => s.count))
    : 1;

  // -------------------------------------------------------------
  // RECHARTS VISUAL DATA
  // -------------------------------------------------------------
  const revenueChartData = revenueTrendRows(successfulOrders).map((row) => ({
    ...row,
    name: new Date(`${row.key}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(timeRange === 'all' ? { year: '2-digit' } : {}),
    }),
  }));

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];
  const pieChartData = productMetrics.slice(0, 5).map((p, index) => ({
    name: p.name,
    value: p.purchases,
    color: COLORS[index % COLORS.length]
  }));

  // --- NEW MARKETING ANALYTICS ---
  // 1. Email Campaign Performance
  const campaignChartData = campaignPerformanceRows(dbCampaigns, timeRange);

  // 2. UTM Source/Traffic Channels
  const trafficChartData = acquisitionChannelRows(journeyEvents).map((entry, index) => ({
    ...entry,
    color: COLORS[index % COLORS.length]
  }));

  // 3. Cart Abandonment Funnel
  const totalSessions = Number(analyticsMeta?.counts?.sessions ?? sessions.length);
  const totalViews = Number(analyticsMeta?.counts?.productViews ?? productViews.length);
  const totalCarts = Number(analyticsMeta?.counts?.carts ?? carts.length);
  const totalCheckouts = successfulOrders.length;
  const funnelChartData = [
    { name: 'Sessions', value: totalSessions, fill: '#38bdf8' },
    { name: 'Product interest', value: totalViews, fill: '#8b5cf6' },
    { name: 'Carts', value: totalCarts, fill: '#f59e0b' },
    { name: 'Paid orders', value: totalCheckouts, fill: '#10b981' }
  ];
  const totalJourneyEvents = Number(analyticsMeta?.counts?.events ?? journeyEvents.length);
  const sampledSourceLabels = (analyticsMeta?.sampled || []).map((source) => ({
    sessions: 'sessions',
    productViews: 'product views',
    orders: 'orders',
    carts: 'carts',
    clicks: 'mobile clicks',
    events: 'journey events',
  }[source] || source));

  const handleExport = (format) => {
    setExportLoading(true);
    setTimeout(() => {
      try {
        const filename = `peptidescr-analytics-${new Date().toISOString().slice(0, 10)}`;

        if (format === 'csv') {
          const headers = [ 'Product', 'Views', 'Purchases', 'Conversion Rate (%)' ];
          const dataRows = productMetrics.map(p => [p.name, p.views, p.purchases, p.conversion.toFixed(1)]);
          const csvContent = [headers, ...dataRows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
          const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a'); link.href = url; link.download = `${filename}.csv`;
          document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
        } else if (format === 'xlsx') {
          const headers = [ 'Product', 'Views', 'Purchases', 'Conversion Rate (%)' ];
          const dataRows = productMetrics.map(p => [p.name, p.views, p.purchases, p.conversion.toFixed(1)]);
          const worksheetData = [headers, ...dataRows];
          const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
          const wscols = headers.map(h => ({ wch: Math.max(15, h.length + 2) }));
          worksheet['!cols'] = wscols;
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Product Metrics');
          XLSX.writeFile(workbook, `${filename}.xlsx`);
        } else if (format === 'pdf') {
          const doc = new jsPDF('portrait');
          doc.setFontSize(22);
          doc.text('Analytics Executive Summary', 14, 20);
          doc.setFontSize(10);
          doc.text(`Generated on: ${new Date().toLocaleString()} | Range: ${timeRange.toUpperCase()}`, 14, 28);
          
          doc.setFontSize(14);
          doc.text('Key Performance Indicators', 14, 40);
          doc.setFontSize(11);
          doc.text(`Gross Revenue: $${totalRevenueUsd.toFixed(2)} (CRC ${totalRevenueCrc.toLocaleString()})`, 14, 50);
          doc.text(`Average Order Value (AOV): $${aovUsd.toFixed(2)}`, 14, 58);
          doc.text(`Conversion Rate: ${orderConversionRate.toFixed(1)}%`, 14, 66);
          doc.text(`Total Orders: ${successfulOrders.length}`, 14, 74);
          doc.text(`Total Visitors: ${uniqueVisitorCount}`, 14, 82);

          doc.setFontSize(14);
          doc.text('Top Products (By Views)', 14, 100);
          const pHeaders = [['Product Name', 'Views', 'Purchases', 'Conversion']];
          const pData = productMetrics.slice(0, 10).map(p => [p.name, p.views, p.purchases, `${p.conversion.toFixed(1)}%`]);
          doc.autoTable({
            head: pHeaders,
            body: pData,
            startY: 105,
            styles: { fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: [14, 22, 38], textColor: 255 },
          });

          doc.save(`${filename}.pdf`);
        }
      } finally {
        setExportLoading(false);
        setShowExportModal(false);
      }
    }, 500);
  };

  // -------------------------------------------------------------
  // MOBILE HEATMAP UTILITIES & DATA PARSING
  // -------------------------------------------------------------
  
  // Resolve coordinates for visual clusters over the mock mobile catalog elements
  const getMockCoords = (elementName) => {
    const el = (elementName || '').toLowerCase();
    
    if (el.includes('whatsapp')) {
      return { x: 86, y: 91 };
    }
    if (el.includes('bpc-157') || el.includes('bpc157')) {
      return { x: 50, y: 61 };
    }
    if (el.includes('semaglutide') || el.includes('sema')) {
      return { x: 50, y: 85 };
    }
    if (el.includes('search') || el.includes('#search')) {
      return { x: 35, y: 8 };
    }
    if (el.includes('recuper')) {
      return { x: 25, y: 35 };
    }
    if (el.includes('peso') || el.includes('metabol')) {
      return { x: 65, y: 35 };
    }
    if (el.includes('cart') || el.includes('carrito')) {
      return { x: 88, y: 8 };
    }
    
    return null;
  };

  const getHeatmapSource = () => clicks;

  const getRankedTargets = () => {
    const raw = getHeatmapSource();
    const map = {};
    
    raw.forEach(c => {
      const name = c.element_name || 'Generic Area';
      map[name] = (map[name] || 0) + 1;
    });

    const list = Object.entries(map).map(([name, count]) => ({ name, count }));
    list.sort((a, b) => b.count - a.count);
    return list.slice(0, 5);
  };

  const getLatestClicks = () => {
    const raw = [...getHeatmapSource()];
    raw.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    return raw.slice(0, 4).map(c => {
      const diffMin = Math.round((new Date() - new Date(c.created_at)) / 60000);
      let timeStr = 'just now';
      if (diffMin > 0 && diffMin < 60) {
        timeStr = `${diffMin}m ago`;
      } else if (diffMin >= 60) {
        timeStr = `${Math.round(diffMin / 60)}h ago`;
      }
      return {
        element_name: c.element_name || 'Generic click',
        timeStr
      };
    });
  };

  const getAddCartShare = () => {
    const list = getRankedTargets();
    const total = list.reduce((s, t) => s + t.count, 0);
    if (total === 0) return 0;
    
    const cartClicks = list
      .filter(t => t.name.toLowerCase().includes('carrito') || t.name.toLowerCase().includes('cart'))
      .reduce((s, t) => s + t.count, 0);
      
    return Math.round((cartClicks / total) * 100);
  };

  const getWhatsAppShare = () => {
    const list = getRankedTargets();
    const total = list.reduce((s, t) => s + t.count, 0);
    if (total === 0) return 0;
    
    const waClicks = list
      .filter(t => t.name.toLowerCase().includes('whatsapp'))
      .reduce((s, t) => s + t.count, 0);
      
    return Math.round((waClicks / total) * 100);
  };

  const renderHeatmapDots = () => {
    const source = getHeatmapSource();
    const clusters = {};
    
    source.forEach(c => {
      let x = c.x_pct;
      let y = c.y_pct;
      const elName = c.element_name || '';
      
      if (heatmapIntentFilter === 'intent') {
        const lower = elName.toLowerCase();
        const isIntent = lower.includes('carrito') || lower.includes('cart') || lower.includes('whatsapp');
        if (!isIntent) return;
      }

      if (heatmapIntentFilter === 'active') {
        // Filter to very recent active clicks (within the last 15 minutes)
        const date = new Date(c.created_at || Date.now());
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
        if (date < fifteenMinsAgo) return;
      }

      const resolved = getMockCoords(elName);
      if (resolved) {
        x = resolved.x;
        y = resolved.y;
      }
      
      if (x === undefined || y === undefined) return;
      
      const key = `${x}_${y}`;
      if (!clusters[key]) {
        clusters[key] = { x, y, count: 0, target: elName };
      }
      clusters[key].count += 1;
    });

    const maxCount = Math.max(...Object.values(clusters).map(cl => cl.count), 1);

    return Object.entries(clusters).map(([key, cl]) => {
      const ratio = cl.count / maxCount;
      let bg = 'radial-gradient(circle, rgba(52, 211, 153, 0.85) 0%, rgba(52, 211, 153, 0.3) 50%, transparent 100%)';
      
      if (ratio > 0.6) {
        bg = 'radial-gradient(circle, rgba(239, 68, 68, 0.9) 0%, rgba(245, 158, 11, 0.5) 40%, rgba(52, 211, 153, 0.1) 70%, transparent 100%)';
      } else if (ratio > 0.35) {
        bg = 'radial-gradient(circle, rgba(245, 158, 11, 0.85) 0%, rgba(251, 191, 36, 0.4) 40%, rgba(52, 211, 153, 0.1) 70%, transparent 100%)';
      } else if (ratio > 0.15) {
        bg = 'radial-gradient(circle, rgba(251, 191, 36, 0.85) 0%, rgba(52, 211, 153, 0.3) 55%, transparent 100%)';
      }

      const wiggleX = (parseInt(key.split('_')[0]) % 3 - 1) * 1.5;
      const wiggleY = (parseInt(key.split('_')[1]) % 3 - 1) * 1.5;
      const leftPct = cl.x + wiggleX;
      const topPct = cl.y + wiggleY;

      const size = 30 + Math.min(ratio * 30, 25);

      return (
        <div 
          className="heatmap-dot"
          key={key}
          style={{
            position: 'absolute',
            left: `${leftPct}%`,
            top: `${topPct}%`,
            width: `${size}px`,
            height: `${size}px`,
            transform: 'translate(-50%, -50%)',
            background: bg,
            borderRadius: '50%',
            pointerEvents: 'auto',
            cursor: 'pointer',
            zIndex: 100
          }}
          title={`${cl.target}: ${cl.count} clicks`}
        />
      );
    });
  };

  return (
    <div className="analytics-dashboard-container">
      {/* CSS Styling scoped for Analytics Dashboard */}
      <style jsx>{`
        .analytics-dashboard-container {
          color: #f8fafc;
          font-family: inherit;
          line-height: 1.5;
        }

        /* Mode Badges & Banner */
        /* ─── Mobile-first base ─────────────────────────── */
        .analytics-header-banner {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          margin-bottom: 20px;
          gap: 12px;
        }

        @media (min-width: 640px) {
          .analytics-header-banner {
            gap: 14px;
            margin-bottom: 24px;
          }

          .analytics-header-top {
            align-items: center;
          }

          .analytics-header-controls {
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            width: 100%;
          }
        }
        
        .mode-status-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8rem;
          padding: 6px 12px;
          border-radius: 9999px;
          font-weight: 500;
        }
        
        .mode-live {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
          color: #34d399;
        }

        .active-pulse-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 8px #10b981;
          animation: activePulse 1.8s infinite alternate ease-in-out;
        }

        @keyframes activePulse {
          0% { transform: scale(0.8); opacity: 0.6; box-shadow: 0 0 4px #10b981; }
          100% { transform: scale(1.3); opacity: 1; box-shadow: 0 0 12px #10b981; }
        }

        .mode-simulated {
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.2);
          color: #fbbf24;
        }

        .time-filter-bar {
          display: flex;
          gap: 2px;
          background: rgba(15, 23, 42, 0.6);
          padding: 3px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .time-filter-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 0.75rem;
          padding: 5px 9px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s ease;
          -webkit-tap-highlight-color: transparent;
        }

        @media (min-width: 640px) {
          .time-filter-btn { font-size: 0.8rem; padding: 6px 12px; }
        }

        .time-filter-btn:hover { color: #f8fafc; }

        .time-filter-btn.active {
          background: #0ea5e9;
          color: white;
          box-shadow: 0 4px 12px rgba(14, 165, 233, 0.25);
        }

        .analytics-title {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
          color: #f8fafc;
        }

        .analytics-subtitle {
          margin: 4px 0 0;
          font-size: 0.8rem;
          color: #94a3b8;
        }

        .analytics-header-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          width: 100%;
        }

        .analytics-header-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }

        .analytics-header-controls {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
        }

        .analytics-time-filter-bar {
          width: 100%;
        }

        .analytics-time-filter-bar .time-filter-bar {
          display: flex;
          width: 100%;
        }

        .analytics-time-filter-bar .time-filter-btn {
          flex: 1;
          text-align: center;
          padding: 8px 6px;
          min-height: 36px;
        }

        .analytics-header-status {
          font-size: 0.78rem;
          color: #64748b;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          width: 100%;
        }

        .analytics-status-live {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #34d399;
          font-weight: 600;
        }

        @media (min-width: 640px) {
          .analytics-header-controls {
            flex-direction: row;
            align-items: center;
            justify-content: flex-end;
            width: auto;
          }

          .analytics-time-filter-bar { width: auto; }

          .analytics-time-filter-bar .time-filter-btn {
            flex: none;
            padding: 6px 12px;
            min-height: auto;
          }
        }

        .analytics-tools-section {
          margin-top: 24px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .analytics-collapsible-card {
          background: rgba(14, 22, 38, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          overflow: hidden;
        }

        .analytics-collapsible-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          width: 100%;
          padding: 14px 16px;
          background: transparent;
          border: none;
          color: #f8fafc;
          cursor: pointer;
          text-align: left;
          -webkit-tap-highlight-color: transparent;
        }

        .analytics-collapsible-trigger:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .analytics-collapsible-trigger-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.9rem;
          font-weight: 700;
        }

        .analytics-collapsible-trigger-sub {
          font-size: 0.72rem;
          color: #64748b;
          font-weight: 500;
          margin-top: 2px;
        }

        .analytics-collapsible-chevron {
          flex-shrink: 0;
          color: #64748b;
          transition: transform 0.2s ease;
        }

        .analytics-collapsible-chevron.open {
          transform: rotate(180deg);
        }

        .analytics-collapsible-body {
          padding: 0 16px 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.04);
        }

        .analytics-guide-tip {
          font-size: 0.82rem;
          color: #94a3b8;
          line-height: 1.5;
          margin: 12px 0 0;
        }

        /* ─── Mobile Click Heatmap CSS Mockup ───────────── */
        .phone-mockup-frame {
          width: 270px;
          height: 480px;
          background: #090d16;
          border: 9px solid #1e293b;
          border-radius: 34px;
          position: relative;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6), inset 0 2px 4px rgba(255, 255, 255, 0.15);
          margin: 0 auto;
          overflow: hidden;
        }

        .phone-notch {
          width: 90px;
          height: 14px;
          background: #1e293b;
          border-radius: 0 0 10px 10px;
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          z-index: 50;
        }

        .phone-glare {
          position: absolute;
          top: 0;
          left: -80px;
          width: 120px;
          height: 100%;
          background: linear-gradient(to right, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.03) 50%, rgba(255, 255, 255, 0) 100%);
          transform: skewX(-20deg);
          pointer-events: none;
          z-index: 45;
        }

        .phone-screen-viewport {
          width: 100%;
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          position: relative;
          padding-top: 14px;
          scrollbar-width: none; /* Hide scrollbars */
        }
        .phone-screen-viewport::-webkit-scrollbar {
          display: none;
        }

        /* Mock Catalog Storefront Content styling */
        .mock-storefront-wrapper {
          color: #e2e8f0;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 11px;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          background: #020617;
          min-height: 520px;
        }

        .mock-store-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 8px;
          background: #0f172a;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.03);
        }

        .mock-logo {
          font-weight: 700;
          color: #34d399;
          font-size: 0.75rem;
        }

        .mock-cart-badge {
          background: rgba(255, 255, 255, 0.05);
          padding: 3px 5px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 3px;
        }

        .mock-cart-count {
          color: #34d399;
          font-weight: 700;
        }

        .mock-store-hero {
          text-align: center;
          padding: 10px 6px;
          background: linear-gradient(135deg, #0b1528 0%, #031c15 100%);
          border-radius: 10px;
          border: 1px solid rgba(16, 185, 129, 0.1);
        }

        .mock-store-hero h1 {
          font-size: 0.85rem;
          font-weight: 800;
          color: #fff;
          margin: 0 0 4px;
        }

        .mock-store-hero p {
          font-size: 0.6rem;
          color: #94a3b8;
          margin: 0 0 6px;
          line-height: 1.3;
        }

        .mock-search-bar {
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.05);
          color: #64748b;
          font-size: 0.6rem;
          padding: 5px;
          border-radius: 6px;
          text-align: left;
        }

        .mock-store-categories {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .mock-store-categories::-webkit-scrollbar {
          display: none;
        }

        .mock-cat-tab {
          padding: 3px 6px;
          border-radius: 6px;
          background: #0f172a;
          color: #64748b;
          white-space: nowrap;
          font-size: 0.6rem;
          font-weight: 500;
        }

        .mock-cat-tab.active {
          background: rgba(52, 211, 153, 0.1);
          color: #34d399;
          border: 1px solid rgba(52, 211, 153, 0.2);
        }

        .mock-products-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .mock-product-card {
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.02);
          border-radius: 10px;
          padding: 8px;
          position: relative;
        }

        .mock-prod-img-box {
          height: 40px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 6px;
        }

        .mock-prod-img-box.healing-theme {
          background: linear-gradient(135deg, rgba(52, 211, 153, 0.1) 0%, rgba(5, 150, 105, 0.03) 100%);
        }

        .mock-prod-img-box.metabolism-theme {
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.1) 0%, rgba(2, 132, 199, 0.03) 100%);
        }

        .mock-product-card h3 {
          font-size: 0.72rem;
          margin: 0 0 2px;
          color: #fff;
          font-weight: 700;
        }

        .mock-prod-tag {
          font-size: 0.58rem;
          color: #94a3b8;
          margin-bottom: 4px;
        }

        .mock-prod-price {
          font-size: 0.72rem;
          color: #fff;
          font-weight: 700;
          margin-bottom: 6px;
        }

        .mock-add-cart-btn {
          width: 100%;
          padding: 5px;
          border-radius: 6px;
          border: none;
          color: #fff;
          font-weight: 700;
          font-size: 0.6rem;
          cursor: pointer;
        }

        .btn-healing {
          background: #10b981;
        }

        .btn-metabolism {
          background: #0ea5e9;
        }

        .mock-footer {
          text-align: center;
          font-size: 0.58rem;
          color: #475569;
          margin-top: 12px;
          padding-top: 8px;
          border-top: 1px solid rgba(255,255,255,0.02);
        }

        .mock-whatsapp-widget {
          position: absolute;
          bottom: 10px;
          right: 10px;
          width: 28px;
          height: 28px;
          background: #25D366;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 3px 8px rgba(37,211,102,0.3);
          z-index: 90;
        }

        /* Pulsing microanimation for heatmap dots */
        @keyframes pulseHeatmap {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 0.95; }
          50% { transform: translate(-50%, -50%) scale(1.08); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 0.95; }
        }

        .heatmap-dot {
          animation: pulseHeatmap 3s infinite ease-in-out;
          transition: all 0.2s ease;
        }

        .heatmap-dot:hover {
          transform: translate(-50%, -50%) scale(1.25) !important;
          box-shadow: 0 0 16px rgba(255,255,255,0.4);
          z-index: 1000 !important;
        }

        /* ─── KPI metric cards ──────────────────────────── */
        .metrics-grid-4 {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          margin-bottom: 20px;
          align-items: flex-start;
        }

        @media (min-width: 640px) {
          .metrics-grid-4 {
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
            align-items: flex-start;
          }
        }

        .metric-card {
          background: linear-gradient(135deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.9) 100%);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 16px;
          backdrop-filter: blur(8px);
          position: relative;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
        }

        @media (min-width: 640px) {
          .metric-card { padding: 22px; }
        }

        .metric-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px 0 rgba(0, 0, 0, 0.45);
        }

        /* Color accent borders & glowing backdrops */
        .metric-green { border-color: rgba(52, 211, 153, 0.2); }
        .metric-green:hover { border-color: rgba(52, 211, 153, 0.4); }
        .metric-green::after {
          content: '';
          position: absolute;
          top: -20px;
          right: -20px;
          width: 90px;
          height: 90px;
          background: radial-gradient(circle, rgba(52, 211, 153, 0.15) 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
        }

        .metric-blue { border-color: rgba(56, 189, 248, 0.2); }
        .metric-blue:hover { border-color: rgba(56, 189, 248, 0.4); }
        .metric-blue::after {
          content: '';
          position: absolute;
          top: -20px;
          right: -20px;
          width: 90px;
          height: 90px;
          background: radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
        }

        .metric-purple { border-color: rgba(167, 139, 250, 0.2); }
        .metric-purple:hover { border-color: rgba(167, 139, 250, 0.4); }
        .metric-purple::after {
          content: '';
          position: absolute;
          top: -20px;
          right: -20px;
          width: 90px;
          height: 90px;
          background: radial-gradient(circle, rgba(167, 139, 250, 0.15) 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
        }

        .metric-amber { border-color: rgba(250, 204, 21, 0.2); }
        .metric-amber:hover { border-color: rgba(250, 204, 21, 0.4); }
        .metric-amber::after {
          content: '';
          position: absolute;
          top: -20px;
          right: -20px;
          width: 90px;
          height: 90px;
          background: radial-gradient(circle, rgba(250, 204, 21, 0.15) 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
        }

        /* Metric card expanded detail panel */
        .metric-card-detail {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid rgba(255,255,255,0.05);
          display: flex;
          flex-direction: column;
          gap: 6px;
          animation: accordionFadeIn 0.2s ease;
        }

        .metric-detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.75rem;
          color: #94a3b8;
          gap: 8px;
        }

        .metric-detail-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          min-width: 0;
        }

        .metric-detail-val {
          font-weight: 600;
          color: #e2e8f0;
          flex-shrink: 0;
        }

        .metric-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: #cbd5e1;
          font-size: 0.8rem;
          font-weight: 600;
          margin-bottom: 12px;
        }

        .metric-icon-box {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          transition: all 0.3s;
        }

        .icon-blue { 
          background: rgba(56, 189, 248, 0.12); 
          border: 1px solid rgba(56, 189, 248, 0.25);
          color: #38bdf8; 
          box-shadow: 0 0 15px rgba(56, 189, 248, 0.2);
        }
        .icon-purple { 
          background: rgba(167, 139, 250, 0.12); 
          border: 1px solid rgba(167, 139, 250, 0.25);
          color: #a78bfa; 
          box-shadow: 0 0 15px rgba(167, 139, 250, 0.2);
        }
        .icon-green { 
          background: rgba(52, 211, 153, 0.12); 
          border: 1px solid rgba(52, 211, 153, 0.25);
          color: #34d399; 
          box-shadow: 0 0 15px rgba(52, 211, 153, 0.2);
        }
        .icon-amber { 
          background: rgba(250, 204, 21, 0.12); 
          border: 1px solid rgba(250, 204, 21, 0.25);
          color: #facc15; 
          box-shadow: 0 0 15px rgba(250, 204, 21, 0.2);
        }

        .metric-value-primary {
          font-size: 1.3rem;
          font-weight: 700;
          color: #f8fafc;
          letter-spacing: -0.5px;
          line-height: 1.2;
        }

        @media (min-width: 640px) {
          .metric-value-primary { font-size: 1.6rem; }
        }

        .metric-value-secondary {
          font-size: 0.78rem;
          color: #94a3b8;
          margin-top: 4px;
        }

        @media (min-width: 640px) {
          .metric-value-secondary { font-size: 0.85rem; }
        }

        /* ─── 2-column panels (mobile: stacked) ───────── */
        .analytics-double-panel {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }

        @media (min-width: 900px) {
          .analytics-double-panel {
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 24px;
          }
        }

        .dashboard-section-card {
          background: rgba(30, 41, 59, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 14px;
          padding: 16px;
          backdrop-filter: blur(10px);
        }

        @media (min-width: 640px) {
          .dashboard-section-card { padding: 24px; border-radius: 16px; }
        }

        .section-card-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: #f1f5f9;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        @media (min-width: 640px) {
          .section-card-title { font-size: 1rem; margin-bottom: 20px; }
        }

        /* Custom Visual Horizontal Bar Chart */
        .bar-chart-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .bar-chart-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .bar-row-label-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.8rem;
          color: #e2e8f0;
        }

        .bar-row-value {
          font-weight: 600;
          color: #38bdf8;
        }

        .bar-track {
          height: 8px;
          background: rgba(15, 23, 42, 0.6);
          border-radius: 999px;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          border-radius: 999px;
          transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .fill-cyan { background: linear-gradient(90deg, #0ea5e9, #38bdf8); }
        .fill-purple { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }
        .fill-emerald { background: linear-gradient(90deg, #059669, #34d399); }
        .fill-amber { background: linear-gradient(90deg, #d97706, #facc15); }
        .fill-red { background: linear-gradient(90deg, #dc2626, #f87171); }

        /* ─── Behavior stats (always 2-col — small enough) */
        .behavior-stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 16px;
        }

        @media (min-width: 640px) {
          .behavior-stats-grid { gap: 16px; margin-bottom: 20px; }
        }

        .behavior-box {
          background: rgba(15, 23, 42, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.03);
          border-radius: 10px;
          padding: 12px 10px;
          text-align: center;
        }

        @media (min-width: 640px) {
          .behavior-box { padding: 16px; border-radius: 12px; }
        }

        .behavior-box-title {
          font-size: 0.68rem;
          color: #94a3b8;
          margin-bottom: 4px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        @media (min-width: 640px) {
          .behavior-box-title { font-size: 0.75rem; }
        }

        .behavior-box-value {
          font-size: 1.1rem;
          font-weight: 700;
          color: #f1f5f9;
        }

        @media (min-width: 640px) {
          .behavior-box-value { font-size: 1.25rem; }
        }

        /* Device indicator */
        .device-indicator-container {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 12px;
          font-size: 0.78rem;
          background: rgba(15, 23, 42, 0.3);
          padding: 10px 12px;
          border-radius: 8px;
          flex-wrap: wrap;
        }

        /* Compact product accordion rows */
        .product-accordion-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .product-accordion-row {
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(15, 23, 42, 0.4);
          overflow: hidden;
          transition: border-color 0.2s ease;
        }

        .product-accordion-row.expanded {
          border-color: rgba(56, 189, 248, 0.2);
          background: rgba(15, 23, 42, 0.65);
        }

        .product-accordion-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 11px 14px;
          cursor: pointer;
          gap: 10px;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
        }

        .product-accordion-trigger:hover {
          background: rgba(255, 255, 255, 0.02);
        }

        .product-accordion-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          min-width: 0;
        }

        .product-rank-dot {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: rgba(56, 189, 248, 0.1);
          color: #38bdf8;
          font-size: 0.68rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .product-accordion-name {
          font-size: 0.85rem;
          font-weight: 600;
          color: #e2e8f0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .product-accordion-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .views-chip {
          font-size: 0.72rem;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 999px;
          white-space: nowrap;
        }

        .views-chip-active {
          background: rgba(56, 189, 248, 0.1);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.15);
        }

        .views-chip-zero {
          background: rgba(100, 116, 139, 0.1);
          color: #64748b;
          border: 1px solid rgba(100, 116, 139, 0.1);
        }

        .accordion-chevron {
          color: #475569;
          transition: transform 0.25s ease;
          flex-shrink: 0;
        }

        .accordion-chevron.open {
          transform: rotate(180deg);
          color: #38bdf8;
        }

        .product-accordion-body {
          padding: 0 14px 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          animation: accordionFadeIn 0.2s ease;
        }

        @keyframes accordionFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .product-stats-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .product-stat-chip {
          font-size: 0.75rem;
          padding: 3px 9px;
          border-radius: 6px;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.05);
          color: #94a3b8;
        }

        .badge-conversion {
          background: rgba(16, 185, 129, 0.1);
          color: #34d399;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 3px 9px;
          border-radius: 6px;
          border: 1px solid rgba(16, 185, 129, 0.15);
        }

        /* ─── Hot & Cold grid (mobile: stacked) ────────── */
        .interest-split-container {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }

        @media (min-width: 600px) {
          .interest-split-container { grid-template-columns: 1fr 1fr; gap: 16px; }
        }

        .interest-segment-box {
          background: rgba(15, 23, 42, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          padding: 16px;
        }

        .interest-segment-header {
          font-size: 0.85rem;
          font-weight: 700;
          margin-bottom: 14px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .interest-segment-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 12px;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.02);
        }

        .interest-segment-item:last-child {
          margin-bottom: 0;
          padding-bottom: 0;
          border-bottom: none;
        }

        .interest-item-header {
          display: flex;
          justify-content: space-between;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .interest-item-footer {
          display: flex;
          justify-content: space-between;
          font-size: 0.72rem;
          color: #94a3b8;
        }

        /* ─── Sales funnel ────────────────────────────── */
        .funnel-container {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .funnel-stage {
          background: rgba(15, 23, 42, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.03);
          border-radius: 8px;
          padding: 9px 12px;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
        }

        .funnel-stage-progress {
          position: absolute;
          left: 0;
          top: 0;
          height: 100%;
          background: rgba(14, 165, 233, 0.05);
          z-index: 1;
        }

        .funnel-stage-content {
          display: flex;
          justify-content: space-between;
          width: 100%;
          z-index: 2;
          font-size: 0.78rem;
        }

        /* ─── Funnel + Payment inner sub-grid ───────────── */
        .funnel-payment-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
        }

        @media (min-width: 640px) {
          .funnel-payment-grid { grid-template-columns: 1fr 1.1fr; }
        }

        /* ─── Geo sub-grid ───────────────────────────────── */
        .geo-cities-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
        }

        @media (min-width: 480px) {
          .geo-cities-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      {/* 1. Header */}
      <div className="analytics-header-banner">
        <div className="analytics-header-top">
          <div>
            <h3 className="analytics-title">Analytics</h3>
            <p className="analytics-subtitle">Sales, traffic, and catalog behavior</p>
          </div>
          <div className="analytics-header-actions">
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() => setRefreshKey((k) => k + 1)}
              title="Refresh analytics data"
            >
              <RefreshCw size={14} className={loading ? 'sync-spinner' : ''} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() => setShowExportModal(true)}
              title="Export analytics report"
            >
              <Upload size={14} />
              <span>Export</span>
            </button>
          </div>
        </div>

        <div className="analytics-header-controls">
          <div className="analytics-time-filter-bar">
            <div className="time-filter-bar">
              <button
                type="button"
                className={`time-filter-btn ${timeRange === '24h' ? 'active' : ''}`}
                onClick={() => setTimeRange('24h')}
              >
                Today
              </button>
              <button
                type="button"
                className={`time-filter-btn ${timeRange === '7d' ? 'active' : ''}`}
                onClick={() => setTimeRange('7d')}
              >
                7 days
              </button>
              <button
                type="button"
                className={`time-filter-btn ${timeRange === '30d' ? 'active' : ''}`}
                onClick={() => setTimeRange('30d')}
              >
                30 days
              </button>
              <button
                type="button"
                className={`time-filter-btn ${timeRange === 'all' ? 'active' : ''}`}
                onClick={() => setTimeRange('all')}
              >
                All time
              </button>
            </div>
          </div>
        </div>

        <div className="analytics-drilldown-grid">
          <button type="button" onClick={() => onNavigate?.('orders')}>
            <BarChart2 size={15} />
            <span>Dashboard analytics</span>
            <small>Revenue, orders, and checkout health</small>
          </button>
          <button type="button" onClick={() => onNavigate?.('marketing')}>
            <Target size={15} />
            <span>Marketing attribution</span>
            <small>Campaigns, journeys, and source performance</small>
          </button>
          <button type="button" onClick={() => onNavigate?.('carts')}>
            <ShoppingCart size={15} />
            <span>Cart recovery records</span>
            <small>Open the recoverable carts behind this KPI</small>
          </button>
        </div>

        <div className="analytics-header-status">
          <span className="analytics-status-live">
            {isLive && <span className="active-pulse-dot" />}
            {activeLiveUsers} across tracked sites now
          </span>
          <span>·</span>
          <span>{loading ? 'Refreshing…' : analyticsErrors.length > 0 ? 'Partial data' : isLive ? 'Live data' : 'No tracked data in this range'}</span>
        </div>
      </div>

      {analyticsErrors.length > 0 && (
        <div role="alert" style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.28)', borderRadius: 10, color: '#fecaca', padding: '10px 13px', marginBottom: 12, fontSize: '.78rem' }}>
          Some analytics sources could not be loaded: {analyticsErrors.map((error) => error.source).join(', ')}. Refresh to try again.
        </div>
      )}
      {sampledSourceLabels.length > 0 && (
        <div style={{ background: 'rgba(56,189,248,.07)', border: '1px solid rgba(56,189,248,.2)', borderRadius: 10, color: '#bae6fd', padding: '10px 13px', marginBottom: 12, fontSize: '.78rem' }}>
          Database row totals are exact. Detailed breakdowns use the latest available records for {sampledSourceLabels.join(', ')}.
        </div>
      )}

      {/* Cross-domain live visitor journeys */}
      <section style={{ background: '#0e1626', border: '1px solid rgba(56,189,248,.2)', borderRadius: 14, padding: 18, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ color: '#38bdf8', fontSize: '.7rem', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }}>Live visitor journeys</div>
            <h3 style={{ margin: '4px 0', fontSize: '1rem', color: '#f8fafc' }}>Who is on which page, and how they arrived</h3>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '.78rem' }}>First-party heartbeat data across every domain using the shared tracker.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[['Active', activeLiveUsers], ['Known customers', knownActiveUsers], ['Domains', activeDomains], ['Journey events', totalJourneyEvents]].map(([label, value]) => (
              <div key={label} style={{ background: '#172237', borderRadius: 9, padding: '8px 11px', minWidth: 90 }}>
                <div style={{ color: '#f8fafc', fontWeight: 900, fontSize: '1rem' }}>{value}</div>
                <div style={{ color: '#64748b', fontSize: '.66rem' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {activeLiveSessions.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '.8rem', padding: '18px 0' }}>No visitor heartbeat in the last 45 seconds.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.76rem' }}>
              <thead>
                <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                  <th style={{ padding: '8px 6px' }}>Visitor</th><th style={{ padding: '8px 6px' }}>Current page</th><th style={{ padding: '8px 6px' }}>Source</th><th style={{ padding: '8px 6px' }}>Cart</th><th style={{ padding: '8px 6px' }}>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {activeLiveSessions.slice(0, 20).map((session) => (
                  <tr key={session.session_id} style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                    <td style={{ padding: '9px 6px', color: session.known_customer ? '#86efac' : '#cbd5e1', fontWeight: 700 }}>{session.known_customer ? 'Known customer' : 'Anonymous'}</td>
                    <td style={{ padding: '9px 6px', color: '#f8fafc', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.hostname || 'catalog'}{session.current_path || '/catalog'}</td>
                    <td style={{ padding: '9px 6px', color: '#cbd5e1' }}>{session.last_touch_source || session.utm_source || 'direct'}{session.utm_campaign ? ` · ${session.utm_campaign}` : ''}</td>
                    <td style={{ padding: '9px 6px', color: Number(session.cart_items) > 0 ? '#fbbf24' : '#64748b' }}>{Number(session.cart_items) || 0} item(s)</td>
                    <td style={{ padding: '9px 6px', color: '#94a3b8' }}>{new Date(session.last_active).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, marginTop: 14 }}>
          <div style={{ background: '#172237', borderRadius: 10, padding: 12 }}>
            <strong style={{ color: '#f8fafc', fontSize: '.8rem' }}>Live pages</strong>
            {livePageCounts.map(([page, count]) => <div key={page} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: '#94a3b8', fontSize: '.72rem', marginTop: 7 }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page}</span><b style={{ color: '#38bdf8' }}>{count}</b></div>)}
          </div>
          <div style={{ background: '#172237', borderRadius: 10, padding: 12 }}>
            <strong style={{ color: '#f8fafc', fontSize: '.8rem' }}>Live acquisition sources</strong>
            {liveSourceCounts.map(([source, count]) => <div key={source} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: '#94a3b8', fontSize: '.72rem', marginTop: 7 }}><span>{source}</span><b style={{ color: '#34d399' }}>{count}</b></div>)}
          </div>
        </div>
      </section>

      {/* 2. Top Metrics */}
      <div className="metrics-grid-4">

        {/* Metric 1: Gross Revenue — drill-down: top paid orders */}
        <div
          className="metric-card metric-green"
          onClick={() => setExpandedMetric(expandedMetric === 'revenue' ? null : 'revenue')}
        >
          <div className="metric-header">
            <span>Gross Revenue (Realized) {renderExplainerTrigger('revenue')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="metric-icon-box icon-green"><DollarSign size={16} /></div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transition: 'transform 0.2s', transform: expandedMetric === 'revenue' ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
          <div className="metric-value-primary">
            ${totalRevenueUsd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div className="metric-value-secondary">
            ₡{totalRevenueCrc.toLocaleString('en-US')} • {successfulOrders.length} Paid orders
          </div>
          {expandedMetric === 'revenue' && (
            <div className="metric-card-detail">
              {successfulOrders.length === 0
                ? <span style={{ fontSize: '0.875rem', color: '#64748b' }}>No paid orders yet.</span>
                : successfulOrders.slice(0, 5).map(o => (
                  <div className="metric-detail-row" key={o.id}>
                    <span className="metric-detail-name">{o.customer_name || 'Customer'}</span>
                    <span className="metric-detail-val">${parseFloat(o.total_usd || 0).toFixed(0)}</span>
                  </div>
                ))
              }
              {successfulOrders.length > 5 && (
                <span style={{ fontSize: '0.75rem', color: '#475569' }}>+{successfulOrders.length - 5} more orders</span>
              )}
            </div>
          )}
        </div>

        {/* Metric 2: AOV — drill-down: individual order values */}
        <div
          className="metric-card metric-blue"
          onClick={() => setExpandedMetric(expandedMetric === 'aov' ? null : 'aov')}
        >
          <div className="metric-header">
            <span>Average Order Value (AOV) {renderExplainerTrigger('aov')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="metric-icon-box icon-blue"><TrendingUp size={16} /></div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transition: 'transform 0.2s', transform: expandedMetric === 'aov' ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
          <div className="metric-value-primary">
            ${aovUsd.toFixed(2)}
          </div>
          <div className="metric-value-secondary">
            ₡{Math.round(aovCrc).toLocaleString('en-US')} average spend
          </div>
          {expandedMetric === 'aov' && (
            <div className="metric-card-detail">
              {successfulOrders.length === 0
                ? <span style={{ fontSize: '0.875rem', color: '#64748b' }}>No orders to show.</span>
                : [...successfulOrders]
                    .sort((a, b) => parseFloat(b.total_usd) - parseFloat(a.total_usd))
                    .slice(0, 5)
                    .map(o => {
                      const val = parseFloat(o.total_usd || 0);
                      const pct = aovUsd > 0 ? Math.min((val / (aovUsd * 2)) * 100, 100) : 0;
                      return (
                        <div key={o.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div className="metric-detail-row">
                            <span className="metric-detail-name">{o.customer_name || 'Customer'}</span>
                            <span className="metric-detail-val" style={{ color: val >= aovUsd ? '#34d399' : '#f59e0b' }}>
                              ${val.toFixed(0)}
                            </span>
                          </div>
                          <div className="bar-track" style={{ height: '3px' }}>
                            <div className="bar-fill fill-cyan" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })
              }
            </div>
          )}
        </div>

        {/* Metric 3: Abandoned Carts — drill-down: open carts list */}
        <div
          className="metric-card metric-amber"
          onClick={() => setExpandedMetric(expandedMetric === 'carts' ? null : 'carts')}
        >
          <div className="metric-header">
            <span>Abandoned Carts Value {renderExplainerTrigger('abandoned_carts')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="metric-icon-box icon-amber"><ShoppingCart size={16} /></div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transition: 'transform 0.2s', transform: expandedMetric === 'carts' ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
          <div className="metric-value-primary">
            ${potentialAbandonedRevenueUsd.toLocaleString('en-US')}
          </div>
          <div className="metric-value-secondary">
            ₡{potentialAbandonedRevenueCrc.toLocaleString('en-US')} • {activeAbandonedCarts.length} carts open
          </div>
          {expandedMetric === 'carts' && (
            <div className="metric-card-detail">
              {activeAbandonedCarts.length === 0
                ? <span style={{ fontSize: '0.875rem', color: '#64748b' }}>No open abandoned carts.</span>
                : activeAbandonedCarts.slice(0, 5).map(c => {
                    const val = calculateCartValue(c.cart_data);
                    const product = Array.isArray(c.cart_data) && c.cart_data[0]?.product;
                    return (
                      <div className="metric-detail-row" key={c.id}>
                        <span className="metric-detail-name">{product || 'Unknown item'}</span>
                        <span className="metric-detail-val" style={{ color: '#f59e0b' }}>${val.toFixed(0)}</span>
                      </div>
                    );
                  })
              }
              {activeAbandonedCarts.length > 5 && (
                <span style={{ fontSize: '0.75rem', color: '#475569' }}>+{activeAbandonedCarts.length - 5} more carts</span>
              )}
            </div>
          )}
        </div>

        {/* Metric 4: Conversion Rate — drill-down: mini funnel */}
        <div
          className="metric-card metric-purple"
          onClick={() => setExpandedMetric(expandedMetric === 'conversion' ? null : 'conversion')}
        >
          <div className="metric-header">
            <span>Visitor Conversion Rate {renderExplainerTrigger('conversion_rate')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="metric-icon-box icon-purple"><Target size={16} /></div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transition: 'transform 0.2s', transform: expandedMetric === 'conversion' ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
          <div className="metric-value-primary">
            {orderConversionRate.toFixed(1)}%
          </div>
          <div className="metric-value-secondary">
            {successfulOrders.length} paid orders / {uniqueVisitorCount} traffic sessions
          </div>
          {expandedMetric === 'conversion' && (
            <div className="metric-card-detail">
              {[
                { label: 'Sessions', val: uniqueVisitorCount, color: '#38bdf8' },
                { label: 'Product Views', val: totalViews, color: '#a78bfa' },
                { label: 'Carts', val: totalCarts, color: '#f59e0b' },
                { label: 'Paid Orders', val: successfulOrders.length, color: '#34d399' },
              ].map(step => (
                <div key={step.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div className="metric-detail-row">
                    <span className="metric-detail-name">{step.label}</span>
                    <span className="metric-detail-val" style={{ color: step.color }}>{step.val}</span>
                  </div>
                  <div className="bar-track" style={{ height: '3px' }}>
                    <div className="bar-fill" style={{
                      width: `${uniqueVisitorCount > 0 ? Math.min((step.val / uniqueVisitorCount) * 100, 100) : 0}%`,
                      background: step.color,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* 3. Leaks & funnel: product interest, conversion funnel, payments */}
      <div className="analytics-double-panel">
        
        {/* PANEL A: Hot vs Cold Product Clicks */}
        <div className="dashboard-section-card">
          <div className="section-card-title">
            <Zap size={16} style={{ color: '#fbbf24' }} />
            <span>Product interest (hot vs. cold)</span>
          </div>

          {productMetrics.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '1rem' }}>
              No product clicks logged.
            </div>
          ) : (
            <div className="interest-split-container">
              
              {/* Hot Interest Box */}
              <div className="interest-segment-box" style={{ borderLeft: '3px solid #10b981' }}>
                <div className="interest-segment-header" style={{ color: '#34d399' }}>
                  <TrendingUp size={14} />
                  <span>Hot Demand (Most Clicks)</span>
                </div>
                
                {hotPeptides.map(p => {
                  const clickPct = maxProductViews > 0 ? (p.views / maxProductViews) * 100 : 0;
                  return (
                    <div className="interest-segment-item" key={p.name}>
                      <div className="interest-item-header">
                        <span style={{ color: '#e2e8f0' }}>{p.name}</span>
                        <span style={{ color: '#34d399' }}>{p.views} clicks</span>
                      </div>
                      <div className="bar-track" style={{ height: '5px' }}>
                        <div className="bar-fill fill-emerald" style={{ width: `${clickPct}%` }}></div>
                      </div>
                      <div className="interest-item-footer">
                        <span>Conv: {p.conversion.toFixed(0)}%</span>
                        <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Status: High Demand</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Cold / Rare Interest Box */}
              <div className="interest-segment-box" style={{ borderLeft: '3px solid #ef4444' }}>
                <div className="interest-segment-header" style={{ color: '#f87171' }}>
                  <AlertTriangle size={14} />
                  <span>Rare Clicks (Low Interest)</span>
                </div>
                
                {coldPeptides.map(p => {
                  const clickPct = maxProductViews > 0 ? (p.views / maxProductViews) * 100 : 0;
                  return (
                    <div className="interest-segment-item" key={p.name}>
                      <div className="interest-item-header">
                        <span style={{ color: '#e2e8f0' }}>{p.name}</span>
                        <span style={{ color: '#f87171' }}>{p.views} clicks</span>
                      </div>
                      <div className="bar-track" style={{ height: '5px' }}>
                        <div className="bar-fill fill-red" style={{ width: `${Math.max(clickPct, 4)}%` }}></div>
                      </div>
                      <div className="interest-item-footer">
                        <span>Conv: {p.conversion.toFixed(0)}%</span>
                        <span style={{ color: '#fb923c', fontSize: '0.75rem' }}>Needs Promo</span>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}
        </div>

        {/* PANEL B: Sales Conversion Funnel & Payment Preference */}
        <div className="dashboard-section-card">
          <div className="section-card-title">
            <Target size={16} style={{ color: '#a78bfa' }} />
            <span>Funnel & payments</span>
          </div>

          <div className="funnel-payment-grid">
            
            {/* Sales Conversion Funnel */}
            <div>
              <p style={{ fontSize: '0.875rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px', fontWeight: 600 }}>
                E-Commerce Funnel
              </p>
              
              <div className="funnel-container">
                <div className="funnel-stage">
                  <div className="funnel-stage-progress" style={{ width: '100%' }}></div>
                  <div className="funnel-stage-content">
                    <span>1. Traffic (Sessions)</span>
                    <strong>{uniqueVisitorCount}</strong>
                  </div>
                </div>
                <div className="funnel-stage">
                  <div className="funnel-stage-progress" style={{ width: `${uniqueVisitorCount > 0 ? Math.min((totalViews / uniqueVisitorCount) * 100, 100) : 0}%` }}></div>
                  <div className="funnel-stage-content">
                    <span>2. Product clicks</span>
                    <strong>{totalViews}</strong>
                  </div>
                </div>
                <div className="funnel-stage">
                  <div className="funnel-stage-progress" style={{ width: `${uniqueVisitorCount > 0 ? Math.min((totalCarts / uniqueVisitorCount) * 100, 100) : 0}%` }}></div>
                  <div className="funnel-stage-content">
                    <span>3. Carts Created</span>
                    <strong>{totalCarts}</strong>
                  </div>
                </div>
                <div className="funnel-stage">
                  <div className="funnel-stage-progress" style={{ width: `${orderConversionRate}%` }}></div>
                  <div className="funnel-stage-content" style={{ color: '#34d399' }}>
                    <span>4. Paid Orders</span>
                    <strong>{successfulOrders.length}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Method Channels */}
            <div>
              <p style={{ fontSize: '0.875rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px', fontWeight: 600 }}>
                Orders Payment Channels
              </p>

              {Object.keys(paymentBreakdown).length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.875rem', padding: '10px 0' }}>No payment distribution data.</div>
              ) : (
                <div className="bar-chart-list">
                  {Object.entries(paymentBreakdown).map(([method, data]) => {
                    const pct = (data.count / maxPaymentCount) * 100;
                    
                    let cleanMethodName = getPaymentMethodLabel(method);
                    let icon = null;
                    let color = '#a78bfa'; // default purple
                    
                    if (method === 'sinpe') {
                      icon = <Smartphone size={14} />;
                      color = '#f97316'; // Orange
                    } else if (method === 'card') {
                      icon = <CreditCard size={14} />;
                      color = '#0ea5e9'; // Blue
                    } else if (method === 'whatsapp') {
                      icon = <MessageCircle size={14} />;
                      color = '#22c55e'; // Green
                    }

                    return (
                      <div className="bar-chart-row" key={method}>
                        <div className="bar-row-label-row">
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: color, display: 'flex', alignItems: 'center' }}>{icon}</span>
                            {cleanMethodName}
                          </span>
                          <span className="bar-row-value" style={{ color: color }}>
                            {data.count} orders (${Math.round(data.revenue)})
                          </span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${pct}%`, background: color }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Order Source Channels */}
            <div>
              <p style={{ fontSize: '0.875rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px', fontWeight: 600 }}>
                Order Attribution Sources
              </p>

              {Object.keys(orderSourceBreakdown).length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.875rem', padding: '10px 0' }}>No source attribution data.</div>
              ) : (
                <div className="bar-chart-list">
                  {Object.entries(orderSourceBreakdown)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([source, data]) => {
                    const pct = (data.count / maxSourceCount) * 100;
                    const color = '#34d399';
                    
                    return (
                      <div className="bar-chart-row" key={source}>
                        <div className="bar-row-label-row">
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: color, display: 'flex', alignItems: 'center' }}><Target size={14} /></span>
                            <span style={{ textTransform: 'capitalize' }}>{source}</span>
                          </span>
                          <span className="bar-row-value" style={{ color: color }}>
                            {data.count} orders (${Math.round(data.revenue)})
                          </span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${pct}%`, background: color }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* ------------------------------------------------------------- */}
      {/* MARKETING & ACQUISITION FUNNEL SECTION */}
      {/* ------------------------------------------------------------- */}
      <div className="analytics-double-panel">
        
        {/* Email Campaign Performance */}
        <div className="dashboard-section-card" style={{ overflowX: 'auto' }}>
          <div className="section-card-title">
            <Mail size={16} style={{ color: '#ec4899' }} />
            <span>Email Marketing Performance</span>
          </div>
          <div style={{ width: '100%', minWidth: '400px', height: '260px' }}>
            {campaignChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={campaignChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <RechartsTooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: '#fff' }}
                  />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                  <Bar dataKey="openRate" name="Open Rate %" fill="#ec4899" radius={[4, 4, 0, 0]} barSize={30} />
                  <Bar dataKey="clickRate" name="Click Rate %" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div role={campaignError ? 'alert' : undefined} style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: campaignError ? '#fca5a5' : '#64748b', fontSize: '0.85rem', textAlign: 'center', padding: 20 }}>
                {campaignError
                  ? `Could not load campaign analytics: ${campaignError}`
                  : dbCampaigns.length > 0
                    ? 'No sent campaigns in the selected date range.'
                    : 'No email campaigns have been created yet.'}
              </div>
            )}
          </div>
          {campaignChartData.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 10 }}>
              {campaignChartData.map((campaign) => (
                <span key={campaign.id} title={campaign.name} style={{ color: '#94a3b8', fontSize: '.7rem' }}>
                  <strong style={{ color: '#e2e8f0' }}>{campaign.name}</strong>: {campaign.sends.toLocaleString()} sent · {campaign.uniqueOpens.toLocaleString()} unique opens · {campaign.uniqueClicks.toLocaleString()} unique clicks{campaign.exact ? '' : ' (estimated)'}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Traffic Channels & Funnel */}
        <div className="dashboard-section-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ flex: 1 }}>
            <div className="section-card-title">
              <Target size={16} style={{ color: '#0ea5e9' }} />
              <span>Conversion Funnel (Current Range)</span>
            </div>
            <div style={{ width: '100%', height: '140px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelChartData} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 'bold' }} width={80} />
                  <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.02)' }} contentStyle={{ borderRadius: '8px', border: '1px solid #334155', background: '#0f172a' }} />
                  <Bar dataKey="value" name="Count" radius={[0, 4, 4, 0]} barSize={24}>
                    {funnelChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ flex: 1, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px' }}>
            <div className="section-card-title">
              <MapPin size={16} style={{ color: '#facc15' }} />
              <span>Tracked Acquisition Sources</span>
            </div>
            <div style={{ width: '100%', height: '160px', display: 'flex', alignItems: 'center' }}>
               {trafficChartData.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                     <Pie data={trafficChartData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2} dataKey="value" stroke="none">
                       {trafficChartData.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={entry.color} />
                       ))}
                     </Pie>
                     <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', background: '#0f172a', color: '#fff', fontSize: '12px' }} />
                     <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                   </PieChart>
                 </ResponsiveContainer>
               ) : (
                 <div style={{ width: '100%', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>No tracked UTM or referral visitors in this range.</div>
               )}
            </div>
          </div>

        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* RECHARTS VISUAL ANALYTICS SECTION */}
      {/* ------------------------------------------------------------- */}
      <div className="analytics-double-panel" style={{ marginTop: '20px', marginBottom: '20px' }}>
        {/* Revenue Line Chart */}
        <div className="dashboard-section-card">
          <div className="section-card-title">
            <TrendingUp size={16} style={{ color: '#3b82f6' }} />
            <span>Revenue Trends (Daily Sales USD)</span>
          </div>
          <div style={{ width: '100%', height: '300px', marginTop: '10px' }}>
            {revenueChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={revenueChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(value) => `$${value}`} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: '#fff' }}
                    formatter={(value) => [`$${value.toFixed(2)}`, 'Revenue (USD)']}
                  />
                  <Line type="monotone" dataKey="revenueUsd" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#0f172a' }} activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2, fill: '#fff' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                <p>Not enough daily data</p>
              </div>
            )}
          </div>
        </div>

        {/* Top Products Pie Chart */}
        <div className="dashboard-section-card">
          <div className="section-card-title">
            <Target size={16} style={{ color: '#ec4899' }} />
            <span>Top Products By Quantity Sold</span>
          </div>
          <div style={{ width: '100%', height: '300px', marginTop: '10px' }}>
            {pieChartData.filter(d => d.value > 0).length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieChartData.filter(d => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    labelLine={false}
                    label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, value }) => {
                      const RADIAN = Math.PI / 180;
                      const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
                      const x = cx + radius * Math.cos(-midAngle * RADIAN);
                      const y = cy + radius * Math.sin(-midAngle * RADIAN);
                      if (percent < 0.04) return null; // Hide if too small
                      return (
                        <text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="central" fontSize="10px" fontWeight="bold" style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.5)' }}>
                          {value} ({(percent * 100).toFixed(0)}%)
                        </text>
                      );
                    }}
                  >
                    {pieChartData.filter(d => d.value > 0).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: '#fff' }}
                    formatter={(value) => [`${value} units`, 'Sold']}
                  />
                  <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '12px', color: '#cbd5e1' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                <p>No sales data available</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Double Panel: Geographical Analytics vs Visitor Behavior */}
      <div className="analytics-double-panel">
        
        {/* PANEL A: Geography (Top Cities) */}
        <div className="dashboard-section-card">
          <div className="section-card-title">
            <MapPin size={16} style={{ color: '#0ea5e9' }} />
            <span>Geographic Distribution (Costa Rica Demographics) {renderExplainerTrigger('geo_insights')}</span>
          </div>

          <div className="geo-cities-grid">
            {/* Visitors Traffic Cities */}
            <div>
              <p style={{ fontSize: '0.875rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px', fontWeight: 600 }}>
                Top Cities by Traffic
              </p>
              {sortedVisitorCities.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.875rem', padding: '10px 0' }}>No geolocation traffic logged yet.</div>
              ) : (
                <div className="bar-chart-list">
                  {sortedVisitorCities.map(([city, count]) => {
                    const pct = (count / maxVisitorCount) * 100;
                    return (
                      <div className="bar-chart-row" key={city}>
                        <div className="bar-row-label-row">
                          <span>{city}</span>
                          <span className="bar-row-value">{count} views</span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill fill-cyan" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Placed Orders Cities */}
            <div>
              <p style={{ fontSize: '0.875rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px', fontWeight: 600 }}>
                Top Cities by Orders
              </p>
              {sortedOrderCities.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.875rem', padding: '10px 0' }}>No customer orders placed yet.</div>
              ) : (
                <div className="bar-chart-list">
                  {sortedOrderCities.map(([city, count]) => {
                    const pct = (count / maxOrderCount) * 100;
                    return (
                      <div className="bar-chart-row" key={city}>
                        <div className="bar-row-label-row">
                          <span>{city}</span>
                          <span className="bar-row-value" style={{ color: '#34d399' }}>{count} orders</span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill fill-emerald" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PANEL B: User Behavior & Telemetry Durations */}
        <div className="dashboard-section-card">
          <div className="section-card-title">
            <Clock size={16} style={{ color: '#a78bfa' }} />
            <span>Storefront Telemetry & Engagement Stats {renderExplainerTrigger('open_time')}</span>
          </div>

          <div className="behavior-stats-grid">
            <div className="behavior-box">
              <div className="behavior-box-title">Catalog Open Duration</div>
              <div className="behavior-box-value" style={{ color: '#a78bfa' }}>
                {formatDuration(averageDurationSeconds)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Average browsing time</div>
            </div>

            <div className="behavior-box">
              <div className="behavior-box-title">Cart Abandonment</div>
              <div className="behavior-box-value" style={{ color: '#f59e0b' }}>
                {cartAbandonmentRate.toFixed(0)}%
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Active abandoned carts</div>
            </div>

            <div className="behavior-box">
              <div className="behavior-box-title">Cart Recovery Rate</div>
              <div className="behavior-box-value" style={{ color: '#10b981' }}>
                {cartRecoveryRate.toFixed(0)}%
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Converted back from carts</div>
            </div>

            <div className="behavior-box">
              <div className="behavior-box-title">Order Dispatch Pipeline</div>
              <div className="behavior-box-value" style={{ color: '#38bdf8' }}>
                ₡{pipelineCrc.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>{pendingOrders.length} orders Pending</div>
            </div>
          </div>

          {/* Device & OS statistics */}
          <p style={{ fontSize: '0.875rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', fontWeight: 600 }}>
            Traffic Device Segment {renderExplainerTrigger('device_breakdown')}
          </p>
          <div className="device-indicator-container">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
              <Smartphone size={14} style={{ color: '#38bdf8' }} />
              <span>Mobile ({mobilePct.toFixed(0)}%)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
              <Monitor size={14} style={{ color: '#a78bfa' }} />
              <span>Desktop ({desktopPct.toFixed(0)}%)</span>
            </div>
          </div>
        </div>

      </div>

      {/* SECTION 3.2: Mobile Viewport Click Heatmap Visualizer */}
      <div 
        className="analytics-double-panel" 
        style={{ 
          marginTop: '20px', 
          gridTemplateColumns: showHeatmapMock ? undefined : '1fr' 
        }}
      >
        
        {/* PANEL B: Top Click Targets & Analytics */}
        <div className="dashboard-section-card">
          <div className="section-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={16} style={{ color: '#38bdf8' }} />
              <span>Top Mobile Clicks & Analytics Feed</span>
            </div>

            {/* Mock Toggle Button */}
            <button
              onClick={() => setShowHeatmapMock(prev => !prev)}
              className="admin-btn"
              style={{
                padding: '6px 12px',
                fontSize: '0.75rem',
                borderRadius: '6px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                border: '1px solid rgba(0, 212, 255, 0.3)',
                background: showHeatmapMock ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                color: showHeatmapMock ? '#00D4FF' : '#cbd5e1',
                boxShadow: showHeatmapMock ? '0 0 8px rgba(0, 212, 255, 0.2)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              <Smartphone size={14} />
              {showHeatmapMock ? '🙈 Hide Device Visualizer' : '📱 Toggle Device Visualizer'}
            </button>
          </div>

          {/* Targets List */}
          <div className="top-targets-container">
            <h4 style={{ fontSize: '0.875rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 600, letterSpacing: '0.5px' }}>
              Ranking by Target Density
            </h4>
            
            {getRankedTargets().length === 0 ? (
              <div style={{ color: '#64748b', fontSize: '0.875rem', padding: '10px 0' }}>No telemetry click data found in selected time range.</div>
            ) : (
              <div className="bar-chart-list">
                {getRankedTargets().map((target, idx) => {
                  const maxVal = Math.max(...getRankedTargets().map(t => t.count));
                  const pct = maxVal > 0 ? (target.count / maxVal) * 100 : 0;
                  return (
                    <div className="bar-chart-row" key={target.name}>
                      <div className="bar-row-label-row">
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                          <span style={{ color: '#64748b', marginRight: '6px' }}>#{idx+1}</span>
                          {target.name}
                        </span>
                        <span className="bar-row-value" style={{ color: '#38bdf8', fontSize: '0.875rem' }}>{target.count} clicks</span>
                      </div>
                      <div className="bar-track" style={{ background: 'rgba(255,255,255,0.05)', height: '6px', borderRadius: '3px' }}>
                        <div className="bar-fill fill-sky" style={{ width: `${pct}%`, background: '#38bdf8', height: '100%', borderRadius: '3px' }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Micro stats banner */}
          <div className="micro-stats-banner" style={{ marginTop: '20px', padding: '14px', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.02)' }}>
            <h4 style={{ fontSize: '0.875rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '8px' }}>🚀 Heatmap Telemetry Insights</h4>
            <ul style={{ paddingLeft: '16px', margin: 0, fontSize: '0.875rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>
                <strong style={{ color: '#34d399' }}>Purchase Friction Alert:</strong> Add to Cart actions make up <strong style={{ color: '#fff' }}>{getAddCartShare()}%</strong> of all mobile storefront clicks. This indicates incredibly high conversion intent.
              </li>
              <li>
                <strong style={{ color: '#a78bfa' }}>Support Engagement:</strong> Over <strong style={{ color: '#fff' }}>{getWhatsAppShare()}%</strong> of mobile visitors rely on the quick WhatsApp button, correlating with high custom research cycles inquiries.
              </li>
            </ul>
          </div>

          {/* Live stream ticker */}
          <div className="live-stream-ticker" style={{ marginTop: '20px' }}>
            <h4 style={{ fontSize: '0.875rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 600, letterSpacing: '0.5px' }}>
              Live Telemetry Clicks Feed {renderExplainerTrigger('clicks_feed')}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {getLatestClicks().map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(30,41,59,0.3)', border: '1px solid rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', display: 'inline-block' }}></span>
                    <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{c.element_name}</span>
                  </div>
                  <span style={{ color: '#64748b' }}>{c.timeStr}</span>
                </div>
              ))}
              {getLatestClicks().length === 0 && (
                <div style={{ color: '#64748b', fontSize: '0.875rem', fontStyle: 'italic' }}>Waiting for storefront mobile interactions...</div>
              )}
            </div>
          </div>
        </div>

        {/* PANEL A: Interactive Smartphone Heatmap */}
        {showHeatmapMock && (
          <div className="dashboard-section-card phone-heatmap-section">
            <div className="section-card-title" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Smartphone size={16} style={{ color: '#34d399' }} />
                <span>Mobile Click Heatmap Overlay {renderExplainerTrigger('heatmap')}</span>
              </div>
              
              {/* Toggles */}
              <div className="heatmap-control-pills">
                <div
                  className="heatmap-pill-btn active"
                  style={{
                    background: '#10b981',
                    color: '#fff',
                    border: 'none',
                    fontSize: '0.875rem',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: clicks.length === 0 ? '#64748b' : '#34d399',
                    boxShadow: clicks.length === 0 ? 'none' : '0 0 6px #34d399',
                    display: 'inline-block',
                  }}></span>
                  Live: {activeLiveUsers} Active · {clicks.length} clicks
                </div>
              </div>
            </div>

            <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '16px', marginTop: '-10px' }}>
              {clicks.length === 0
                ? 'No mobile click telemetry recorded yet for this period. Data appears here as visitors interact with the catalog.'
                : `${activeLiveUsers} active visitor session(s) in the last 45 seconds. Showing ${clicks.length} recorded mobile click(s).`}
            </p>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', alignSelf: 'center', fontWeight: 500 }}>Filter Clicks:</span>
              <button 
                type="button"
                className={`heatmap-filter-btn ${heatmapIntentFilter === 'all' ? 'active' : ''}`}
                onClick={() => setHeatmapIntentFilter('all')}
                style={{
                  background: heatmapIntentFilter === 'all' ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: heatmapIntentFilter === 'all' ? '#fff' : '#64748b',
                  border: '1px solid rgba(255,255,255,0.05)',
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                All Clicks
              </button>
              <button 
                type="button"
                className={`heatmap-filter-btn ${heatmapIntentFilter === 'intent' ? 'active' : ''}`}
                onClick={() => setHeatmapIntentFilter('intent')}
                style={{
                  background: heatmapIntentFilter === 'intent' ? 'rgba(52,211,153,0.1)' : 'transparent',
                  color: heatmapIntentFilter === 'intent' ? '#34d399' : '#64748b',
                  border: '1px solid rgba(52,211,153,0.2)',
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
              >
                <Sparkles size={10} />
                High Intent
              </button>
              <button 
                type="button"
                className={`heatmap-filter-btn ${heatmapIntentFilter === 'active' ? 'active' : ''}`}
                onClick={() => setHeatmapIntentFilter('active')}
                style={{
                  background: heatmapIntentFilter === 'active' ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                  color: heatmapIntentFilter === 'active' ? '#38bdf8' : '#64748b',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  marginLeft: '4px'
                }}
              >
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#38bdf8',
                  boxShadow: '0 0 6px #38bdf8',
                  display: 'inline-block'
                }}></span>
                Active Clicks
              </button>
            </div>

            {/* Smartphone bezel mockup */}
            <div className="phone-mockup-frame">
              <div className="phone-notch"></div>
              <div className="phone-glare"></div>
              
              {/* Scrollable screen viewport */}
              <div className="phone-screen-viewport" style={{ overflow: 'hidden', padding: 0 }}>
                
                {/* Mock Browser Address Bar */}
                <div className="mock-browser-address-bar" style={{
                  background: '#1e293b',
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                  gap: '6px',
                  zIndex: 48,
                  userSelect: 'none',
                  position: 'absolute',
                  top: '14px', // Below notch
                  left: 0,
                  right: 0
                }}>
                  <span style={{ fontSize: '0.75rem', color: '#10b981' }}>🔒</span>
                  <span style={{ fontWeight: 500, letterSpacing: '0.3px', color: '#cbd5e1' }}>peptidescostarica.net/catalog</span>
                </div>
                
                {/* Actual Storefront Viewport using Iframe */}
                <div style={{ 
                  position: 'absolute', 
                  top: '40px', // Below notch & address bar
                  left: 0, 
                  right: 0, 
                  bottom: 0, 
                  overflow: 'hidden'
                }}>
                  {showHeatmapMock && (
                    <iframe 
                      src="/catalog?admin_preview=true" 
                      title="Live Catalog Telemetry Preview"
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        pointerEvents: 'auto',
                        background: '#020617'
                      }}
                    />
                  )}
                  
                  {/* Interactive Heatmap Dots Layer */}
                  {renderHeatmapDots()}
                </div>

              </div>
            </div>
          </div>
        )}

      </div>

      {/* 4. Product Conversion & Funnel Panel — collapsible section */}
      <div className="dashboard-section-card" style={{ marginBottom: '16px' }}>

        {/* Section toggle header — always visible */}
        <div
          className="section-card-title"
          style={{ marginBottom: showProductFunnel ? '14px' : 0, cursor: 'pointer', userSelect: 'none', WebkitTapHighlightColor: 'transparent' }}
          onClick={() => { setShowProductFunnel(v => !v); setExpandedProduct(null); }}
          role="button"
          aria-expanded={showProductFunnel}
        >
          <Award size={16} style={{ color: '#facc15' }} />
          <span>All products</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#475569', fontWeight: 400, whiteSpace: 'nowrap' }}>
            {productMetrics.length} peptides
          </span>
          <svg
            width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="#475569" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ transition: 'transform 0.25s ease', transform: showProductFunnel ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        {/* Collapsible body */}
        {showProductFunnel && (
          productMetrics.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '1rem' }}>
              No product views or orders logged in this time range.
            </div>
          ) : (
            <div className="product-accordion-list">
              {productMetrics.map((p, idx) => {
                const isOpen = expandedProduct === p.name;
                const viewPct = maxProductViews > 0 ? (p.views / maxProductViews) * 100 : 0;
                return (
                  <div
                    key={p.name}
                    className={`product-accordion-row${isOpen ? ' expanded' : ''}`}
                  >
                    <div
                      className="product-accordion-trigger"
                      onClick={() => setExpandedProduct(isOpen ? null : p.name)}
                      role="button"
                      aria-expanded={isOpen}
                    >
                      <div className="product-accordion-left">
                        <div className="product-rank-dot">#{idx + 1}</div>
                        <span className="product-accordion-name">{p.name}</span>
                      </div>
                      <div className="product-accordion-right">
                        <span className={`views-chip ${p.views > 0 ? 'views-chip-active' : 'views-chip-zero'}`}>
                          {p.views > 0 ? `${p.views} clicks` : 'No views'}
                        </span>
                        {p.purchases > 0 && (
                          <span className="badge-conversion" style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                            {p.conversion.toFixed(0)}%
                          </span>
                        )}
                        <svg
                          className={`accordion-chevron${isOpen ? ' open' : ''}`}
                          width="14" height="14" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2.5"
                          strokeLinecap="round" strokeLinejoin="round"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="product-accordion-body">
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginBottom: '5px' }}>
                            <span>Interest level</span>
                            <span>{p.views} / {maxProductViews} max clicks</span>
                          </div>
                          <div className="bar-track" style={{ height: '6px' }}>
                            <div
                              className="bar-fill fill-cyan"
                              style={{ width: `${Math.max(viewPct, p.views > 0 ? 3 : 0)}%` }}
                            />
                          </div>
                        </div>
                        <div className="product-stats-row">
                          <span className="product-stat-chip">
                            👁 {p.views} storefront views
                          </span>
                          <span className="product-stat-chip" style={{ color: p.purchases > 0 ? '#34d399' : '#64748b' }}>
                            🧪 {p.purchases} vials sold
                          </span>
                          {p.purchases > 0 ? (
                            <span className="badge-conversion">
                              {p.conversion.toFixed(1)}% view-to-sale
                            </span>
                          ) : (
                            <span className="product-stat-chip" style={{ color: '#f59e0b', borderColor: 'rgba(245,158,11,0.15)' }}>
                              ⚠ 0% conversion — needs action
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
      
      {/* Tools — collapsed by default */}
      <div className="analytics-tools-section">

        <div className="analytics-collapsible-card">
          <button
            type="button"
            className="analytics-collapsible-trigger"
            onClick={() => setShowRecommendations((v) => !v)}
            aria-expanded={showRecommendations}
          >
            <div>
              <div className="analytics-collapsible-trigger-title">
                <BarChart2 size={16} style={{ color: '#38bdf8' }} />
                Recommendations
              </div>
              <div className="analytics-collapsible-trigger-sub">Cart recovery, product promos, payment & geo tips</div>
            </div>
            <ChevronDown size={16} className={`analytics-collapsible-chevron${showRecommendations ? ' open' : ''}`} />
          </button>
          {showRecommendations && (
            <div className="analytics-collapsible-body">
              <ul style={{ margin: '12px 0 0', paddingLeft: '18px', fontSize: '0.875rem', color: '#cbd5e1', lineHeight: '1.6' }}>
                <li style={{ marginBottom: '8px' }}>
                  <strong>Abandoned Cart Re-engagement</strong>: There are currently <strong style={{ color: '#f59e0b' }}>{activeAbandonedCarts.length} active abandoned carts</strong> representing a potential <strong style={{ color: '#fbbf24' }}>${potentialAbandonedRevenueUsd}</strong> in recoverable revenue. Since anonymous visitors don't leave a contact number, focus on <strong>on-site recovery tactics</strong>: activate an exit-intent popup offering a small discount (e.g. <em>"Still thinking? Get 5% off today"</em>), add a persistent sticky banner on the catalog, or run Instagram/Facebook retargeting ads at visitors who browsed without buying. For any <strong>named leads</strong> in the Carts tab who voluntarily submitted their info via WhatsApp checkout, those you <em>can</em> follow up with directly.
                </li>
                {hotPeptides.length > 0 && (
                  <li style={{ marginBottom: '8px' }}>
                    <strong>Maximize Hot Product Traffic (🔥 High Clicks)</strong>: Your top performing interest peptide is <strong style={{ color: '#34d399' }}>{hotPeptides[0]?.name}</strong> with <strong style={{ color: '#0ea5e9' }}>{hotPeptides[0]?.views} clicks</strong>! Since this captures major customer attention, we advise offering a prominent volume deal (e.g. <i>"Buy 3 vials, get 1 free"</i>) or securing your official laboratory COA scan link right at the top of its detail description to eliminate shopping friction and push conversion beyond the current <strong style={{ color: '#34d399' }}>{hotPeptides[0]?.conversion.toFixed(0)}%</strong> level.
                  </li>
                )}
                {coldPeptides.length > 0 && (
                  <li style={{ marginBottom: '8px' }}>
                    <strong>Boost Rare Click Products (❄️ Low Views)</strong>: Your peptide product <strong style={{ color: '#f87171' }}>{coldPeptides[0]?.name}</strong> is currently experiencing rare traction with only <strong style={{ color: '#f87171' }}>{coldPeptides[0]?.views} clicks</strong>. This indicates low storefront exposure. To revive sales, we suggest:
                    <ul style={{ paddingLeft: '14px', marginTop: '4px', listStyleType: 'circle' }}>
                      <li>Featuring it in a promotional banner on your homepage.</li>
                      <li>Structuring a customized research package deal (e.g. <i>"Tissue Healing Pack: BPC-157 + {coldPeptides[0]?.name}"</i>) to inherit clicks from high-demand items.</li>
                      <li>Polishing its Spanish description to answer local athlete concerns.</li>
                    </ul>
                  </li>
                )}
                {Object.keys(paymentBreakdown).length > 0 && (
                  <li style={{ marginBottom: '8px' }}>
                    <strong>Optimize Checkout Payment Channels</strong>: {(() => {
                      const topPayment = Object.entries(paymentBreakdown).sort((a,b) => b[1].count - a[1].count)[0];
                      const topMethodName = getPaymentMethodLabel(topPayment[0]);
                      return (
                        <span>
                          Your customers highly prefer using <strong>{topMethodName}</strong> ({topPayment[1].count} orders). Keep this payment pathway completely friction-free! If manual WhatsApp ordering or SINPE verification load becomes too high, guide customers to use automated credit card processing to secure instant checkout.
                        </span>
                      );
                    })()}
                  </li>
                )}
                <li>
                  <strong>Geographical Targeting</strong>: {sortedVisitorCities.length > 0 ? (
                    <span>
                      Your traffic is heavily centered in <strong>{sortedVisitorCities[0]?.[0]}</strong>. Coordinating with local couriers (e.g., Mensajería) in this region allows you to advertise <strong>"Same-Day Delivery"</strong>, which is the #1 conversion catalyst in Costa Rica.
                    </span>
                  ) : (
                    "Identify where your traffic is coming from and run localized social ads (in Escazu, Santa Ana, or San Jose) with fast SINPE payment checkout to capture local demands."
                  )}
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="analytics-collapsible-card">
          <button
            type="button"
            className="analytics-collapsible-trigger"
            onClick={() => setShowAiPanel((v) => !v)}
            aria-expanded={showAiPanel}
          >
            <div>
              <div className="analytics-collapsible-trigger-title">
                <Brain size={16} style={{ color: '#38bdf8' }} />
                AI summary
              </div>
              <div className="analytics-collapsible-trigger-sub">Run a store audit with Gemini</div>
            </div>
            <ChevronDown size={16} className={`analytics-collapsible-chevron${showAiPanel ? ' open' : ''}`} />
          </button>
          {showAiPanel && (
            <div className="analytics-collapsible-body">
              {generatingAiInsights ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '12px' }}>
                  <div className="sync-spinner" style={{ color: '#38bdf8' }}><Brain size={24} /></div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#f8fafc' }}>Analyzing store metrics…</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Revenue, conversion, carts, and product performance</div>
                  </div>
                </div>
              ) : aiInsightText ? (
                <div style={{ paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary"
                      onClick={() => setAiInsightText('')}
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                    >
                      Clear
                    </button>
                  </div>
                  <div
                    style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}
                    dangerouslySetInnerHTML={{
                      __html: aiInsightText
                        .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #38bdf8">$1</strong>')
                        .replace(/^- (.*)$/gm, '<li style="margin-left: 12px; margin-bottom: 6px; list-style-type: square">$1</li>')
                    }}
                  />
                </div>
              ) : (
                <div style={{ paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                    Get an executive summary of sales performance, bottlenecks, and recommended actions.
                  </p>
                  <button type="button" className="admin-btn admin-btn-primary" onClick={generateAiInsights} style={{ alignSelf: 'flex-start' }}>
                    <Sparkles size={14} /> Analyze
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="analytics-collapsible-card">
          <button
            type="button"
            className="analytics-collapsible-trigger"
            onClick={() => setShowSimulator((v) => !v)}
            aria-expanded={showSimulator}
          >
            <div>
              <div className="analytics-collapsible-trigger-title">
                <Atom size={16} style={{ color: '#38bdf8' }} />
                What-if planner
              </div>
              <div className="analytics-collapsible-trigger-sub">Estimates only — not live data</div>
            </div>
            <ChevronDown size={16} className={`analytics-collapsible-chevron${showSimulator ? ' open' : ''}`} />
          </button>
          {showSimulator && (
            <div className="analytics-collapsible-body">
              <p style={{ margin: '12px 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                Select a peptide and adjust traffic to see projected orders and revenue.
              </p>
              <div className="geo-cities-grid" style={{ alignItems: 'start', marginTop: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'row', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1', minWidth: '180px' }}>
                      <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '6px', fontWeight: 'bold', textTransform: 'uppercase' }}>Select Peptide</label>
                      <select
                        value={selectedSimPeptide}
                        onChange={(e) => setSelectedSimPeptide(e.target.value)}
                        className="admin-select"
                        style={{ width: '100%' }}
                      >
                        {productMetrics.map(p => (
                          <option key={p.name} value={p.name}>{p.name} ({p.views} views)</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: '1', minWidth: '180px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <label style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Traffic projection</label>
                        <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 'bold' }}>{projectedViewsMultiplier}x</span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="5.0"
                        step="0.5"
                        value={projectedViewsMultiplier}
                        onChange={(e) => setProjectedViewsMultiplier(parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                    <div style={{ background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.02)', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase' }}>Projected views</span>
                      <strong style={{ fontSize: '1.25rem', color: '#38bdf8', display: 'block', margin: '4px 0' }}>{simulatedViews}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Current: {currentViews}</span>
                    </div>
                    <div style={{ background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.02)', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase' }}>Projected orders</span>
                      <strong style={{ fontSize: '1.25rem', color: '#34d399', display: 'block', margin: '4px 0' }}>{simulatedPurchases}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Rate: {currentConversion.toFixed(1)}%</span>
                    </div>
                    <div style={{ background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.02)', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase' }}>Projected revenue</span>
                      <strong style={{ fontSize: '1.25rem', color: '#facc15', display: 'block', margin: '4px 0' }}>${projectedRevenue.toLocaleString()}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Lift: +${netLift}</span>
                    </div>
                  </div>
                </div>
                <div style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#fff' }}>Sales blueprint</span>
                    <span style={{ fontSize: '0.75rem', background: 'rgba(167, 139, 250, 0.12)', border: '1px solid rgba(167, 139, 250, 0.25)', color: '#a78bfa', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>{simHook.badge}</span>
                  </div>
                  <h5 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: '#f8fafc', fontWeight: 'bold' }}>{simHook.title}</h5>
                  <p style={{ margin: '0 0 12px 0', fontSize: '0.875rem', color: '#94a3b8', lineHeight: '1.4' }}>{simHook.desc}</p>
                  <div style={{ background: 'rgba(167, 139, 250, 0.06)', border: '1px solid rgba(167, 139, 250, 0.15)', padding: '10px 12px', borderRadius: '8px', fontSize: '0.875rem', color: '#c084fc', lineHeight: '1.4', fontStyle: 'italic' }}>{simHook.hookText}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="analytics-collapsible-card">
          <button
            type="button"
            className="analytics-collapsible-trigger"
            onClick={() => setShowGuideTip((v) => !v)}
            aria-expanded={showGuideTip}
          >
            <div>
              <div className="analytics-collapsible-trigger-title">
                <HelpCircle size={16} style={{ color: '#38bdf8' }} />
                Metric help
              </div>
              <div className="analytics-collapsible-trigger-sub">Tap 💡 icons on cards for explanations</div>
            </div>
            <ChevronDown size={16} className={`analytics-collapsible-chevron${showGuideTip ? ' open' : ''}`} />
          </button>
          {showGuideTip && (
            <div className="analytics-collapsible-body">
              <p className="analytics-guide-tip">
                Not sure what a number means? Tap the 💡 icon next to any metric or section title for a plain-language explanation in English and Spanish.
              </p>
            </div>
          )}
        </div>

      </div>


      <ExportModal 
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Analytics Report"
        description="Download an executive summary PDF or raw product metrics (Excel/CSV)."
        loading={exportLoading}
        onExportCSV={() => handleExport('csv')}
        onExportXLSX={() => handleExport('xlsx')}
        onExportPDF={() => handleExport('pdf')}
      />

      {/* 💡 Layman Explainer Modal */}
      {explainerTopic && EXPLAINER_DATA[explainerTopic] && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(5, 8, 16, 0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            animation: 'fadeIn 0.25s ease-out'
          }}
          onClick={() => setExplainerTopic(null)}
        >
          <div 
            style={{
              background: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '24px',
              padding: '30px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              position: 'relative',
              textAlign: 'left',
              color: '#f8fafc'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Explainer Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
                  {EXPLAINER_DATA[explainerTopic].title}
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {EXPLAINER_DATA[explainerTopic].concept}
                </span>
              </div>
              <button 
                onClick={() => setExplainerTopic(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: 'none',
                  color: '#94a3b8',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '1.125rem',
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.color = '#94a3b8'; }}
              >
                ✕
              </button>
            </div>

            {/* Explainer Modal Body */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', lineHeight: 1.6 }}>
              {/* English Explanation */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                  🇬🇧 English Explanation
                </div>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#cbd5e1' }}>
                  {EXPLAINER_DATA[explainerTopic].description}
                </p>
              </div>

              {/* Spanish Explanation */}
              <div style={{ background: 'rgba(56, 189, 248, 0.02)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(56, 189, 248, 0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                  🇨🇷 Explicación Sencilla (Español)
                </div>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#e2e8f0' }}>
                  {EXPLAINER_DATA[explainerTopic].spanish}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setExplainerTopic(null)}
                style={{
                  background: '#38bdf8',
                  color: '#0f172a',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = 0.9}
                onMouseLeave={(e) => e.currentTarget.style.opacity = 1}
              >
                Got it! / ¡Entendido!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
