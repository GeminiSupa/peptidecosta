import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { 
  TrendingUp, Users, ShoppingCart, Clock, 
  MapPin, Eye, DollarSign, Award, Target,
  RefreshCw, BarChart2, Calendar, ShieldAlert,
  Smartphone, Monitor, ChevronRight, Zap, AlertTriangle, Play, HelpCircle, CreditCard, MessageCircle, Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import ExportModal from './ExportModal';

export default function AnalyticsDashboard({ orders: parentOrders = [], abandonedCarts: parentCarts = [], products: parentProducts = [] }) {
  const [timeRange, setTimeRange] = useState('all');
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [showProductFunnel, setShowProductFunnel] = useState(true);
  const [expandedMetric, setExpandedMetric] = useState(null); // 'revenue'|'aov'|'carts'|'conversion'
  
  // Database analytics state
  const [dbSessions, setDbSessions] = useState([]);
  const [dbProductViews, setDbProductViews] = useState([]);
  const [dbOrders, setDbOrders] = useState([]);
  const [dbCarts, setDbCarts] = useState([]);
  
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

      if (isSupabaseConfigured && supabase) {
        try {
          // 1. Fetch sessions
          const { data: sessions, error: sErr } = await supabase
            .from('visitor_sessions')
            .select('*')
            .order('created_at', { ascending: false });
          
          // 2. Fetch product views
          const { data: views, error: vErr } = await supabase
            .from('product_views')
            .select('*')
            .order('created_at', { ascending: false });

          // 3. Fetch latest orders
          const { data: oData, error: oErr } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });

          // 4. Fetch latest abandoned carts
          const { data: cData, error: cErr } = await supabase
            .from('abandoned_carts')
            .select('*')
            .order('created_at', { ascending: false });

          if (!sErr && sessions) setDbSessions(sessions);
          if (!vErr && views) setDbProductViews(views);
          if (!oErr && oData) setDbOrders(oData);
          if (!cErr && cData) setDbCarts(cData);

          // If we successfully fetched at least some data, set as live database mode
          if (!sErr && sessions && sessions.length > 0) {
            liveConnected = true;
          } else if (oData && oData.length > 0) {
            liveConnected = true; // Orders are populated
          }
        } catch (err) {
          console.error("Database analytics fetch failed, using simulation mode fallback:", err);
        }
      }

      setIsLive(liveConnected);
      setLoading(false);
    };

    fetchDbAnalytics();
  }, [refreshKey]);

  // Fallback Simulation Data (when DB is empty or during local run)
  const getSimulatedData = () => {
    // Generate realistic analytics logs based on current date
    const now = new Date();
    
    // Simulate orders
    const simOrders = [
      { id: '1', customer_name: 'Mateo Vargas', total_usd: 145, total_crc: 65900, status: 'Completed', payment_method: 'tilopay', location_data: { city: 'Escazú' }, created_at: new Date(now - 3 * 3600000).toISOString(), items: [{ product: 'Tirzepatide 10mg', qty: 1 }] },
      { id: '2', customer_name: 'Elena Rojas', total_usd: 250, total_crc: 113500, status: 'Paid', payment_method: 'sinpe', location_data: { city: 'San José' }, created_at: new Date(now - 12 * 3600000).toISOString(), items: [{ product: 'Semaglutide 5mg', qty: 2 }] },
      { id: '3', customer_name: 'John Doe', total_usd: 95, total_crc: 43100, status: 'Completed', payment_method: 'paypal', location_data: { city: 'Santa Ana' }, created_at: new Date(now - 28 * 3600000).toISOString(), items: [{ product: 'BPC-157 5mg', qty: 1 }] },
      { id: '4', customer_name: 'Sofía Castro', total_usd: 380, total_crc: 172700, status: 'Pending', payment_method: 'whatsapp', location_data: { city: 'Heredia' }, created_at: new Date(now - 36 * 3600000).toISOString(), items: [{ product: 'Tirzepatide 10mg', qty: 2 }, { product: 'TB-500 5mg', qty: 1 }] },
      { id: '5', customer_name: 'Andrés Mora', total_usd: 120, total_crc: 54500, status: 'Completed', payment_method: 'whatsapp', location_data: { city: 'Alajuela' }, created_at: new Date(now - 55 * 3600000).toISOString(), items: [{ product: 'Retatrutide 10mg', qty: 1 }] },
      { id: '6', customer_name: 'Lucía Méndez', total_usd: 190, total_crc: 86300, status: 'Cancelled', payment_method: 'tilopay', location_data: { city: 'Cartago' }, created_at: new Date(now - 90 * 3600000).toISOString(), items: [{ product: 'Semaglutide 5mg', qty: 1 }] },
      { id: '7', customer_name: 'William Smith', total_usd: 280, total_crc: 127200, status: 'Completed', payment_method: 'paypal', location_data: { city: 'Liberia' }, created_at: new Date(now - 120 * 3600000).toISOString(), items: [{ product: 'Tirzepatide 10mg', qty: 2 }] },
      { id: '8', customer_name: 'Daniel Jiménez', total_usd: 145, total_crc: 65900, status: 'Paid', payment_method: 'sinpe', location_data: { city: 'San José' }, created_at: new Date(now - 145 * 3600000).toISOString(), items: [{ product: 'Tirzepatide 10mg', qty: 1 }] }
    ];

    // Simulate carts
    const simCarts = [
      { id: 'c1', customer_name: 'Alejandro G.', status: 'active', cart_data: [{ product: 'Semaglutide 5mg', qty: 1, price_usd: '95' }], location_data: { city: 'San José' }, created_at: new Date(now - 2 * 3600000).toISOString() },
      { id: 'c2', customer_name: 'Gabriela S.', status: 'active', cart_data: [{ product: 'Tirzepatide 10mg', qty: 2, price_usd: '145' }], location_data: { city: 'Escazú' }, created_at: new Date(now - 5 * 3600000).toISOString() },
      { id: 'c3', customer_name: 'Roberto D.', status: 'converted', cart_data: [{ product: 'Retatrutide 10mg', qty: 1, price_usd: '120' }], location_data: { city: 'Santa Ana' }, created_at: new Date(now - 10 * 3600000).toISOString() },
      { id: 'c4', customer_name: 'Mariana K.', status: 'active', cart_data: [{ product: 'BPC-157 5mg', qty: 1, price_usd: '95' }], location_data: { city: 'Heredia' }, created_at: new Date(now - 25 * 3600000).toISOString() },
      { id: 'c5', customer_name: 'Thomas P.', status: 'converted', cart_data: [{ product: 'Tirzepatide 10mg', qty: 1, price_usd: '145' }], location_data: { city: 'Liberia' }, created_at: new Date(now - 48 * 3600000).toISOString() },
      { id: 'c6', customer_name: 'Valeria R.', status: 'active', cart_data: [{ product: 'Semaglutide 5mg', qty: 1, price_usd: '95' }], location_data: { city: 'Alajuela' }, created_at: new Date(now - 72 * 3600000).toISOString() }
    ];

    // Simulate visitor sessions
    const simSessions = [
      { session_id: 's1', city: 'San José', region: 'San José', country: 'Costa Rica', catalog_duration: 380, device_info: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', created_at: new Date(now - 1 * 3600000).toISOString() },
      { session_id: 's2', city: 'Escazú', region: 'San José', country: 'Costa Rica', catalog_duration: 180, device_info: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', created_at: new Date(now - 2 * 3600000).toISOString() },
      { session_id: 's3', city: 'Santa Ana', region: 'San José', country: 'Costa Rica', catalog_duration: 490, device_info: 'Mozilla/5.0 (Linux; Android 10; K)', created_at: new Date(now - 5 * 3600000).toISOString() },
      { session_id: 's4', city: 'San José', region: 'San José', country: 'Costa Rica', catalog_duration: 90, device_info: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)', created_at: new Date(now - 8 * 3600000).toISOString() },
      { session_id: 's5', city: 'Heredia', region: 'Heredia', country: 'Costa Rica', catalog_duration: 250, device_info: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)', created_at: new Date(now - 12 * 3600000).toISOString() },
      { session_id: 's6', city: 'Alajuela', region: 'Alajuela', country: 'Costa Rica', catalog_duration: 120, device_info: 'Mozilla/5.0 (Linux; Android 13; SM-A536B)', created_at: new Date(now - 18 * 3600000).toISOString() },
      { session_id: 's7', city: 'Cartago', region: 'Cartago', country: 'Costa Rica', catalog_duration: 200, device_info: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', created_at: new Date(now - 30 * 3600000).toISOString() },
      { session_id: 's8', city: 'Liberia', region: 'Guanacaste', country: 'Costa Rica', catalog_duration: 610, device_info: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', created_at: new Date(now - 45 * 3600000).toISOString() },
      { session_id: 's9', city: 'San José', region: 'San José', country: 'Costa Rica', catalog_duration: 220, device_info: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X)', created_at: new Date(now - 60 * 3600000).toISOString() },
      { session_id: 's10', city: 'Escazú', region: 'San José', country: 'Costa Rica', catalog_duration: 410, device_info: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', created_at: new Date(now - 80 * 3600000).toISOString() }
    ];

    // Simulate product views
    const simViews = [
      { product_name: 'Tirzepatide 10mg', created_at: new Date(now - 1 * 3600000).toISOString() },
      { product_name: 'Semaglutide 5mg', created_at: new Date(now - 2 * 3600000).toISOString() },
      { product_name: 'Tirzepatide 10mg', created_at: new Date(now - 3 * 3600000).toISOString() },
      { product_name: 'BPC-157 5mg', created_at: new Date(now - 4 * 3600000).toISOString() },
      { product_name: 'Retatrutide 10mg', created_at: new Date(now - 5 * 3600000).toISOString() },
      { product_name: 'Tirzepatide 10mg', created_at: new Date(now - 6 * 3600000).toISOString() },
      { product_name: 'TB-500 5mg', created_at: new Date(now - 8 * 3600000).toISOString() },
      { product_name: 'Semaglutide 5mg', created_at: new Date(now - 10 * 3600000).toISOString() },
      { product_name: 'Tirzepatide 10mg', created_at: new Date(now - 12 * 3600000).toISOString() },
      { product_name: 'Semaglutide 5mg', created_at: new Date(now - 15 * 3600000).toISOString() },
      { product_name: 'BPC-157 5mg', created_at: new Date(now - 20 * 3600000).toISOString() },
      { product_name: 'Retatrutide 10mg', created_at: new Date(now - 25 * 3600000).toISOString() },
      { product_name: 'Tirzepatide 10mg', created_at: new Date(now - 30 * 3600000).toISOString() },
      { product_name: 'TB-500 5mg', created_at: new Date(now - 35 * 3600000).toISOString() },
      { product_name: 'BPC-157 5mg', created_at: new Date(now - 40 * 3600000).toISOString() }
    ];

    return { simOrders, simCarts, simSessions, simViews };
  };

  // Compile active data source based on whether we are in Live or Simulated mode
  const getProcessedData = () => {
    let rawOrders = [];
    let rawCarts = [];
    let rawSessions = [];
    let rawViews = [];

    const useLive = isLive || isSupabaseConfigured;

    if (useLive) {
      rawOrders = parentOrders.length > 0 ? parentOrders : dbOrders;
      rawCarts = parentCarts.length > 0 ? parentCarts : dbCarts;
      rawSessions = dbSessions;
      rawViews = dbProductViews;
    } else {
      const sim = getSimulatedData();
      // Supplement with whatever parent state has if it is non-empty
      rawOrders = parentOrders.length > 0 ? parentOrders : sim.simOrders;
      rawCarts = parentCarts.length > 0 ? parentCarts : sim.simCarts;
      rawSessions = dbSessions.length > 0 ? dbSessions : sim.simSessions;
      rawViews = dbProductViews.length > 0 ? dbProductViews : sim.simViews;
    }

    // Filter by Time Range
    const now = new Date();
    const filterByTime = (item) => {
      if (!item.created_at) return true;
      const date = new Date(item.created_at);
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
      productViews: rawViews.filter(filterByTime)
    };
  };

  const { orders, carts, sessions, productViews } = getProcessedData();

  // -------------------------------------------------------------
  // CALCULATE FINANCIAL STATISTICS
  // -------------------------------------------------------------
  
  // Successful orders (Paid, Completed, Order Complete)
  const successfulOrders = orders.filter(o => 
    o.status?.toLowerCase() === 'paid' || o.status?.toLowerCase() === 'completed' || o.status?.toLowerCase() === 'order complete'
  );
  
  const totalRevenueUsd = successfulOrders.reduce((sum, o) => sum + (parseFloat(o.total_usd) || 0), 0);
  const totalRevenueCrc = successfulOrders.reduce((sum, o) => sum + (parseFloat(o.total_crc) || 0), 0);

  // Average Order Value (AOV)
  const aovUsd = successfulOrders.length > 0 ? (totalRevenueUsd / successfulOrders.length) : 0;
  const aovCrc = successfulOrders.length > 0 ? (totalRevenueCrc / successfulOrders.length) : 0;

  // Pipeline (Pending orders)
  const pendingOrders = orders.filter(o => o.status?.toLowerCase() === 'pending');
  const pipelineUsd = pendingOrders.reduce((sum, o) => sum + (parseFloat(o.total_usd) || 0), 0);
  const pipelineCrc = pendingOrders.reduce((sum, o) => sum + (parseFloat(o.total_crc) || 0), 0);

  // -------------------------------------------------------------
  // CALCULATE CONVERSION AND CUSTOMER STATS
  // -------------------------------------------------------------

  // Placed Orders / Total Visitor Sessions
  const uniqueVisitorCount = Math.max(sessions.length, 1);
  const orderConversionRate = (orders.length / uniqueVisitorCount) * 100;

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
  const potentialAbandonedRevenueCrc = Math.round(potentialAbandonedRevenueUsd * 454.48); // Simulated exchange rate fallback

  // Average Catalog duration (Page Open time)
  const durationSessions = sessions.filter(s => s.catalog_duration > 0);
  const averageDurationSeconds = durationSessions.length > 0
    ? (durationSessions.reduce((sum, s) => sum + s.catalog_duration, 0) / durationSessions.length)
    : 180; // default 3 mins if empty

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
  const mobilePct = sessions.length > 0 ? (mobileCount / sessions.length) * 100 : 60;
  const desktopPct = sessions.length > 0 ? (desktopCount / sessions.length) * 100 : 40;

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

  // Payment channels and Source metrics
  const paymentBreakdown = {};
  const whatsappSourceBreakdown = {};
  
  orders.forEach(o => {
    const method = o.payment_method || 'whatsapp';
    if (!paymentBreakdown[method]) {
      paymentBreakdown[method] = { count: 0, revenue: 0 };
    }
    paymentBreakdown[method].count += 1;
    if (o.status?.toLowerCase() === 'paid' || o.status?.toLowerCase() === 'completed' || o.status?.toLowerCase() === 'order complete') {
      paymentBreakdown[method].revenue += (parseFloat(o.total_usd) || 0);
    }
    
    // WhatsApp sources
    const source = o.whatsapp_source || 'organic';
    if (!whatsappSourceBreakdown[source]) {
      whatsappSourceBreakdown[source] = { count: 0, revenue: 0 };
    }
    whatsappSourceBreakdown[source].count += 1;
    if (o.status?.toLowerCase() === 'paid' || o.status?.toLowerCase() === 'completed' || o.status?.toLowerCase() === 'order complete') {
      whatsappSourceBreakdown[source].revenue += (parseFloat(o.total_usd) || 0);
    }
  });

  const maxPaymentCount = Object.keys(paymentBreakdown).length > 0 
    ? Math.max(...Object.values(paymentBreakdown).map(p => p.count)) 
    : 1;

  const maxSourceCount = Object.keys(whatsappSourceBreakdown).length > 0 
    ? Math.max(...Object.values(whatsappSourceBreakdown).map(s => s.count)) 
    : 1;

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
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            gap: 16px;
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

        /* ─── KPI metric cards ──────────────────────────── */
        .metrics-grid-4 {
          display: grid;
          grid-template-columns: 1fr 1fr;
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
          background: rgba(30, 41, 59, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 14px;
          backdrop-filter: blur(10px);
          position: relative;
          overflow: hidden;
          transition: transform 0.2s ease, border-color 0.2s ease;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
        }

        @media (min-width: 640px) {
          .metric-card { padding: 20px; }
        }

        .metric-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.1);
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

        .metric-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 4px;
          height: 100%;
        }

        .metric-blue::before { background: #38bdf8; }
        .metric-purple::before { background: #a78bfa; }
        .metric-green::before { background: #34d399; }
        .metric-amber::before { background: #facc15; }

        .metric-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: #94a3b8;
          font-size: 0.85rem;
          margin-bottom: 12px;
        }

        .metric-icon-box {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
        }

        .icon-blue { background: rgba(56, 189, 248, 0.1); color: #38bdf8; }
        .icon-purple { background: rgba(167, 139, 250, 0.1); color: #a78bfa; }
        .icon-green { background: rgba(52, 211, 153, 0.1); color: #34d399; }
        .icon-amber { background: rgba(250, 204, 21, 0.1); color: #facc15; }

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

      {/* 1. Dashboard Controls & Header */}
      <div className="analytics-header-banner">
        <div>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Analytics & Market Research Dashboard</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
            Real-time insight on visitor telemetry, page heartbeat open times, and sales performance.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Live vs Simulation indicator */}
          <div className={`mode-status-indicator ${isSupabaseConfigured || isLive ? 'mode-live' : 'mode-simulated'}`}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor', boxShadow: '0 0 8px currentColor' }}></div>
            <span>{isSupabaseConfigured || isLive ? 'Live Supabase Data' : 'Sandbox Simulation Mode'}</span>
          </div>

          <button 
            className="admin-btn" 
            style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
            onClick={() => setRefreshKey(k => k + 1)}
            title="Refresh database data"
          >
            <RefreshCw size={12} className={loading ? 'sync-spinner' : ''} />
            <span>Sync</span>
          </button>

          <button
            className="admin-btn"
            style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)' }}
            onClick={() => setShowExportModal(true)}
            title="Export analytics report"
          >
            <Upload size={12} />
            <span className="hide-on-mobile">Export</span>
          </button>

          <div className="time-filter-bar">
            <button 
              className={`time-filter-btn ${timeRange === '24h' ? 'active' : ''}`}
              onClick={() => setTimeRange('24h')}
            >
              24H
            </button>
            <button 
              className={`time-filter-btn ${timeRange === '7d' ? 'active' : ''}`}
              onClick={() => setTimeRange('7d')}
            >
              7D
            </button>
            <button 
              className={`time-filter-btn ${timeRange === '30d' ? 'active' : ''}`}
              onClick={() => setTimeRange('30d')}
            >
              30D
            </button>
            <button 
              className={`time-filter-btn ${timeRange === 'all' ? 'active' : ''}`}
              onClick={() => setTimeRange('all')}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {/* 2. Top Metrics Section */}
      <div className="metrics-grid-4">

        {/* Metric 1: Gross Revenue — drill-down: top paid orders */}
        <div
          className="metric-card metric-green"
          onClick={() => setExpandedMetric(expandedMetric === 'revenue' ? null : 'revenue')}
        >
          <div className="metric-header">
            <span>Gross Revenue (Realized)</span>
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
                ? <span style={{ fontSize: '0.75rem', color: '#64748b' }}>No paid orders yet.</span>
                : successfulOrders.slice(0, 5).map(o => (
                  <div className="metric-detail-row" key={o.id}>
                    <span className="metric-detail-name">{o.customer_name || 'Customer'}</span>
                    <span className="metric-detail-val">${parseFloat(o.total_usd || 0).toFixed(0)}</span>
                  </div>
                ))
              }
              {successfulOrders.length > 5 && (
                <span style={{ fontSize: '0.7rem', color: '#475569' }}>+{successfulOrders.length - 5} more orders</span>
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
            <span>Average Order Value (AOV)</span>
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
                ? <span style={{ fontSize: '0.75rem', color: '#64748b' }}>No orders to show.</span>
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
            <span>Abandoned Carts Value</span>
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
                ? <span style={{ fontSize: '0.75rem', color: '#64748b' }}>No open abandoned carts.</span>
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
                <span style={{ fontSize: '0.7rem', color: '#475569' }}>+{activeAbandonedCarts.length - 5} more carts</span>
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
            <span>Visitor Conversion Rate</span>
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
            {orders.length} orders / {uniqueVisitorCount} traffic sessions
          </div>
          {expandedMetric === 'conversion' && (
            <div className="metric-card-detail">
              {[
                { label: 'Sessions', val: uniqueVisitorCount, color: '#38bdf8' },
                { label: 'Product Views', val: productViews.length, color: '#a78bfa' },
                { label: 'Carts', val: carts.length, color: '#f59e0b' },
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

      {/* 3. Double Panel: Geographical Analytics vs Visitor Behavior */}
      <div className="analytics-double-panel">
        
        {/* PANEL A: Geography (Top Cities) */}
        <div className="dashboard-section-card">
          <div className="section-card-title">
            <MapPin size={16} style={{ color: '#0ea5e9' }} />
            <span>Geographic Distribution (Costa Rica Demographics)</span>
          </div>

          <div className="geo-cities-grid">
            {/* Visitors Traffic Cities */}
            <div>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px', fontWeight: 600 }}>
                Top Cities by Traffic
              </p>
              {sortedVisitorCities.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '10px 0' }}>No geolocation traffic logged yet.</div>
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
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px', fontWeight: 600 }}>
                Top Cities by Orders
              </p>
              {sortedOrderCities.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '10px 0' }}>No customer orders placed yet.</div>
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
            <span>Storefront Telemetry & Engagement Stats</span>
          </div>

          <div className="behavior-stats-grid">
            <div className="behavior-box">
              <div className="behavior-box-title">Catalog Open Duration</div>
              <div className="behavior-box-value" style={{ color: '#a78bfa' }}>
                {formatDuration(averageDurationSeconds)}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>Average browsing time</div>
            </div>

            <div className="behavior-box">
              <div className="behavior-box-title">Cart Abandonment</div>
              <div className="behavior-box-value" style={{ color: '#f59e0b' }}>
                {cartAbandonmentRate.toFixed(0)}%
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>Active abandoned carts</div>
            </div>

            <div className="behavior-box">
              <div className="behavior-box-title">Cart Recovery Rate</div>
              <div className="behavior-box-value" style={{ color: '#10b981' }}>
                {cartRecoveryRate.toFixed(0)}%
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>Converted back from carts</div>
            </div>

            <div className="behavior-box">
              <div className="behavior-box-title">Order Dispatch Pipeline</div>
              <div className="behavior-box-value" style={{ color: '#38bdf8' }}>
                ₡{pipelineCrc.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>{pendingOrders.length} orders Pending</div>
            </div>
          </div>

          {/* Device & OS statistics */}
          <p style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', fontWeight: 600 }}>
            Traffic Device Segment
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

      {/* NEW SECTION 3.5: Hot vs Cold Product Engagement & Sales Funnel + Payment Methods */}
      <div className="analytics-double-panel">
        
        {/* PANEL A: Hot vs Cold Product Clicks */}
        <div className="dashboard-section-card">
          <div className="section-card-title">
            <Zap size={16} style={{ color: '#fbbf24' }} />
            <span>Product Interest Mapping (High Clicks vs. Rare Clicks)</span>
          </div>

          {productMetrics.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '0.85rem' }}>
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
                        <span style={{ color: '#64748b', fontSize: '0.65rem' }}>Status: High Demand</span>
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
                        <span style={{ color: '#fb923c', fontSize: '0.65rem' }}>Needs Promo</span>
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
            <span>Interactive Funnel & Orders Payment Methods</span>
          </div>

          <div className="funnel-payment-grid">
            
            {/* Sales Conversion Funnel */}
            <div>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px', fontWeight: 600 }}>
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
                  <div className="funnel-stage-progress" style={{ width: `${Math.min((productViews.length / uniqueVisitorCount) * 100, 100)}%` }}></div>
                  <div className="funnel-stage-content">
                    <span>2. Views (Peptide Clicks)</span>
                    <strong>{productViews.length}</strong>
                  </div>
                </div>
                <div className="funnel-stage">
                  <div className="funnel-stage-progress" style={{ width: `${Math.min((carts.length / uniqueVisitorCount) * 100, 100)}%` }}></div>
                  <div className="funnel-stage-content">
                    <span>3. Carts Created</span>
                    <strong>{carts.length}</strong>
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
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px', fontWeight: 600 }}>
                Orders Payment Channels
              </p>

              {Object.keys(paymentBreakdown).length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '10px 0' }}>No payment distribution data.</div>
              ) : (
                <div className="bar-chart-list">
                  {Object.entries(paymentBreakdown).map(([method, data]) => {
                    const pct = (data.count / maxPaymentCount) * 100;
                    
                    let cleanMethodName = method.toUpperCase();
                    let icon = null;
                    let color = '#a78bfa'; // default purple
                    
                    if (method === 'sinpe') {
                      cleanMethodName = 'SINPE Móvil';
                      icon = <Smartphone size={14} />;
                      color = '#f97316'; // Orange
                    } else if (method === 'tilopay') {
                      cleanMethodName = 'Credit Card';
                      icon = <CreditCard size={14} />;
                      color = '#0ea5e9'; // Blue
                    } else if (method === 'whatsapp') {
                      cleanMethodName = 'WhatsApp';
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

            {/* WhatsApp Source Channels */}
            <div>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px', fontWeight: 600 }}>
                WhatsApp Attribution Sources
              </p>

              {Object.keys(whatsappSourceBreakdown).length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '10px 0' }}>No source attribution data.</div>
              ) : (
                <div className="bar-chart-list">
                  {Object.entries(whatsappSourceBreakdown)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([source, data]) => {
                    const pct = (data.count / maxSourceCount) * 100;
                    const color = '#34d399'; // Green theme for WhatsApp
                    
                    return (
                      <div className="bar-chart-row" key={source}>
                        <div className="bar-row-label-row">
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: color, display: 'flex', alignItems: 'center' }}><MessageCircle size={14} /></span>
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
          <span>Product Performance &amp; View-to-Purchase Funnel</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#475569', fontWeight: 400, whiteSpace: 'nowrap' }}>
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
            <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '0.85rem' }}>
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
                          <span className="badge-conversion" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
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
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b', marginBottom: '5px' }}>
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
      
      {/* 5. Suggestions for Market Research and Management Statistics */}
      <div className="dashboard-section-card" style={{ border: '1px solid rgba(14, 165, 233, 0.15)', background: 'rgba(14, 165, 233, 0.02)' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ background: 'rgba(14, 165, 233, 0.1)', color: '#38bdf8', padding: '10px', borderRadius: '10px', flexShrink: 0 }}>
            <BarChart2 size={20} />
          </div>
          <div>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', fontWeight: 600, color: '#38bdf8' }}>
              Management Insights & Dynamic Product Retargeting Suggestions
            </h4>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: '#cbd5e1', lineHeight: '1.6' }}>
              
              {/* Dynamic suggestion 1: Cart re-engagement */}
              <li style={{ marginBottom: '8px' }}>
                <strong>Abandoned Cart Re-engagement</strong>: There are currently <strong style={{ color: '#f59e0b' }}>{activeAbandonedCarts.length} active abandoned carts</strong> representing a potential <strong style={{ color: '#fbbf24' }}>${potentialAbandonedRevenueUsd}</strong> in recoverable revenue. Since anonymous visitors don't leave a contact number, focus on <strong>on-site recovery tactics</strong>: activate an exit-intent popup offering a small discount (e.g. <em>"Still thinking? Get 5% off today"</em>), add a persistent sticky banner on the catalog, or run Instagram/Facebook retargeting ads at visitors who browsed without buying. For any <strong>named leads</strong> in the Carts tab who voluntarily submitted their info via WhatsApp checkout, those you <em>can</em> follow up with directly.
              </li>
              
              {/* Dynamic suggestion 2: Hot clicked product */}
              {hotPeptides.length > 0 && (
                <li style={{ marginBottom: '8px' }}>
                  <strong>Maximize Hot Product Traffic (🔥 High Clicks)</strong>: Your top performing interest peptide is <strong style={{ color: '#34d399' }}>{hotPeptides[0]?.name}</strong> with <strong style={{ color: '#0ea5e9' }}>{hotPeptides[0]?.views} clicks</strong>! Since this captures major customer attention, we advise offering a prominent volume deal (e.g. <i>"Buy 3 vials, get 1 free"</i>) or securing your official laboratory COA scan link right at the top of its detail description to eliminate shopping friction and push conversion beyond the current <strong style={{ color: '#34d399' }}>{hotPeptides[0]?.conversion.toFixed(0)}%</strong> level.
                </li>
              )}
              
              {/* Dynamic suggestion 3: Cold / Rare clicked product */}
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

              {/* Dynamic suggestion 4: Payment preferences */}
              {Object.keys(paymentBreakdown).length > 0 && (
                <li style={{ marginBottom: '8px' }}>
                  <strong>Optimize Checkout Payment Channels</strong>: {(() => {
                    const topPayment = Object.entries(paymentBreakdown).sort((a,b) => b[1].count - a[1].count)[0];
                    const topMethodName = topPayment[0] === 'sinpe' ? 'SINPE Móvil' : topPayment[0] === 'tilopay' ? 'Credit Card' : topPayment[0].toUpperCase();
                    return (
                      <span>
                        Your customers highly prefer using <strong>{topMethodName}</strong> ({topPayment[1].count} orders). Keep this payment pathway completely friction-free! If manual WhatsApp ordering or SINPE verification load becomes too high, guide customers to use automated credit card processing to secure instant checkout.
                      </span>
                    );
                  })()}
                </li>
              )}

              {/* Dynamic suggestion 5: Geotargeting same day shipping */}
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
    </div>
  );
}
