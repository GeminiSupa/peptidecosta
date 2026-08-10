"use client";
import { isoToCrWall } from '@/lib/crTime.mjs';

import '@/app/admin.css';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { adminFetch } from '@/lib/adminApi';
import { cleanPhoneNumber } from '@/lib/whatsapp';
import { getWhatsAppMessageSource } from '@/lib/whatsappMessageLog';
import { APPROVED_WHATSAPP_AGENT_TEMPLATES } from '@/lib/whatsappTemplates.mjs';
import {
  getAbandonedCartConversion,
  getLeadConversion as resolveLeadConversion,
  leadIsActiveForPipeline,
} from '@/lib/leadConversion.mjs';
import { markAbandonedCartsConverted } from '@/lib/abandonedCartRecovery.mjs';
import { 
  Lock, LayoutDashboard, ListFilter, Plus, Trash2, Mail, MessageCircle,
  Save, Upload, Download, Share2, Clipboard, LogOut, Check, 
  AlertCircle, ChevronRight, ChevronUp, ChevronDown, MessageSquare, Database,
  Dna, FlaskConical, Syringe, TestTubes, Atom, 
  Brain, Shield, Moon, Flame, Zap, Sparkles, Microscope,
  KeyRound, ShoppingCart, Table, ClipboardList, Link2, Star, FileText, BarChart2, Users, UserPlus, Send, QrCode,
  Bell, X, TrendingUp, Target, Smartphone, Inbox, Search, ChevronLeft, Megaphone,
  PanelLeftClose, PanelLeftOpen, Wallet, MapPinned
} from 'lucide-react';
import AnalyticsDashboard from '@/components/admin/AnalyticsDashboard';
import CustomersCRM from '@/components/admin/CustomersCRM';
import ExportModal from '@/components/admin/ExportModal';
import TeamManagement from '@/components/admin/TeamManagement';
import TeamChat from '@/components/admin/TeamChat';
import AffiliatesManager from '@/components/admin/AffiliatesManager';
import MyReferralQr from '@/components/admin/MyReferralQr';
import MyTeamManager from '@/components/admin/MyTeamManager';
import TeamQrCodes from '@/components/admin/TeamQrCodes';
import InquiriesManager from '@/components/admin/InquiriesManager';
import DashboardHome from '@/components/admin/DashboardHome';
import AgentDashboard from '@/components/admin/AgentDashboard';
import GlobalSearch from '@/components/admin/GlobalSearch';
import NotificationCenter from '@/components/admin/NotificationCenter';
import OrderDetailPanel from '@/components/admin/OrderDetailPanel';
import AbandonedCartEditPanel from '@/components/admin/AbandonedCartEditPanel';
import ManualOrderModal from '@/components/admin/ManualOrderModal';
import BroadcastsPanel from '@/components/admin/BroadcastsPanel';
import DealOfWeekPanel from '@/components/admin/DealOfWeekPanel';
import WhatsAppInbox from '@/components/admin/WhatsAppInbox';
import WhatsAppAnalyticsPanel from '@/components/admin/WhatsAppAnalyticsPanel';
import { DEFAULT_WHATSAPP_AI_PROMPT } from '@/lib/whatsappRecovery';
import { DEFAULT_BUSINESS_LINKS, normalizeBusinessLinks } from '@/lib/businessLinks';
import { confirmDelete, confirmBulkDelete } from '@/lib/confirmDelete.mjs';
import { claimOrderInDb } from '@/lib/claimOrder';
import { filterOrdersVisibleToAgent, orderVisibleToAgent } from '@/lib/agentOrders';
import {
  ADMIN_NAV_GROUPS,
  ADMIN_TAB_IDS,
  ADMIN_TAB_TITLES,
  getDefaultAdminTab,
  resolveAdminTabAccess,
} from '@/lib/adminModules';
import { isSubUser } from '@/lib/subUserTier.mjs';
import {
  DEFAULT_LANDING_PAGE_SETTINGS,
  DEFAULT_PUBLIC_PAGE_SETTINGS,
  PUBLIC_PAGE_SETTING_IDS,
  mergeAllPublicPageSettings,
  mergeLandingPageSettings,
  mergePublicPageSettings,
} from '@/lib/landingContent';
import dynamic from 'next/dynamic';

import ErrorBoundary from '@/components/ErrorBoundary';

function AdminTabLoading({ label = 'Loading tab…' }) {
  return (
    <div className="loader" style={{ padding: '48px 16px' }}>
      <div className="sync-spinner" style={{ marginBottom: '16px' }} />
      <div>{label}</div>
    </div>
  );
}

const dynamicTab = (loader, label) =>
  dynamic(loader, { ssr: false, loading: () => <AdminTabLoading label={label} /> });

const SHARE_PRESETS_KEY = 'peptides_admin_campaign_link_presets_v1';
const DEFAULT_ADMIN_BUSINESS_LINKS = DEFAULT_BUSINESS_LINKS;

const readSharePresets = () => {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(SHARE_PRESETS_KEY) || '[]');
  } catch {
    return [];
  }
};

const isValidOptionalUrl = (value) => {
  if (!String(value || '').trim()) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
};

const OrdersManager = dynamicTab(() => import('@/components/admin/OrdersManager'), 'Loading orders…');
const ProductsManager = dynamicTab(() => import('@/components/admin/ProductsManager'), 'Loading products…');
const EmailMarketingStudio = dynamicTab(() => import('@/components/admin/marketing/EmailMarketingStudio'), 'Loading marketing studio…');
const WhatsAppSession = dynamicTab(() => import('@/components/admin/marketing/WhatsAppSession'), 'Loading WhatsApp session…');
const CartsManager = dynamicTab(() => import('@/components/admin/CartsManager'), 'Loading carts…');
const LeadsManager = dynamicTab(() => import('@/components/admin/LeadsManager'), 'Loading leads…');
const ProspectorManager = dynamicTab(() => import('@/components/admin/ProspectorManager'), 'Loading Prospector…');
const MessengerInbox = dynamicTab(() => import('@/components/admin/MessengerInbox'), 'Loading messenger…');
const MessengerPosts = dynamicTab(() => import('@/components/admin/MessengerPosts'), 'Loading posts…');
const LiveChatInbox = dynamicTab(() => import('@/components/admin/LiveChatInbox'), 'Loading live chat…');

const FacebookIcon = ({ size = 14, style, ...props }) => (
  <svg 
    viewBox="0 0 24 24" 
    width={size} 
    height={size} 
    fill="currentColor" 
    style={style}
    {...props}
  >
    <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c4.56-.93 8-4.96 8-9.75z" />
  </svg>
);

const FALLBACK_EXCHANGE_RATE = 454.48;
// How often an open WhatsApp inbox silently re-fetches conversations.
const WHATSAPP_REFRESH_MS = 30 * 1000;

const cartHasItems = (cartData) => Array.isArray(cartData) && cartData.length > 0;

const getCartRecoveryStatus = (c) => {
  if (c.status === 'recovered' || c.status === 'converted') return 'recovered';
  if (c.recovery_whatsapp_sent) return 'contacted_whatsapp';
  if (c.recovery_email_sent) return 'contacted_email';
  return 'not_contacted';
};

const formatCustomerIdType = (idType) => {
  if (!idType) return '';
  const types = {
    '1': 'Cédula',
    '2': 'Cédula jurídica',
    '5': 'Passport',
    '6': 'DIMEX',
  };
  return types[String(idType)] || idType;
};

function getAdminPageSubtitle(tabId, { orders, abandonedCarts, leads, reviews, isStaffAgent = false }) {
  const pendingOrders = orders.filter((o) => (o.status || 'Pending') === 'Pending').length;
  const pendingReviews = reviews.filter((r) => r.status === 'Pending').length;
  const newLeads = leads.filter((l) => (l.status || 'New') === 'New').length;

  switch (tabId) {
    case 'home':
      return isStaffAgent
        ? 'Your sales, commission, and payout history'
        : 'Store overview · revenue, carts, and alerts';
    case 'orders':
      return isStaffAgent
        ? (pendingOrders
          ? `${pendingOrders} pending · ${orders.length} in shared queue`
          : `${orders.length} order${orders.length !== 1 ? 's' : ''} in shared queue`)
        : (pendingOrders
          ? `${pendingOrders} pending · ${orders.length} total`
          : `${orders.length} order${orders.length !== 1 ? 's' : ''}`);
    case 'carts':
      return abandonedCarts.length
        ? `${abandonedCarts.length} cart${abandonedCarts.length !== 1 ? 's' : ''} to recover`
        : 'No active abandoned carts';
    case 'leads':
      return newLeads
        ? `${newLeads} new lead${newLeads !== 1 ? 's' : ''} · ${leads.length} total`
        : `${leads.length} lead${leads.length !== 1 ? 's' : ''}`;
    case 'prospects':
      return 'Discover and qualify potential Costa Rica business partners';
    case 'live_chat':
      return 'Website chat inbox · reply without WhatsApp';
    case 'reviews':
      return pendingReviews
        ? `${pendingReviews} awaiting approval`
        : `${reviews.length} review${reviews.length !== 1 ? 's' : ''}`;
    case 'whatsapp_ai':
      return 'Reply to customers · AI autopilot available';
    default:
      return '';
  }
}

function resolveTabAccess(tabId, profile) {
  return resolveAdminTabAccess(tabId, profile);
}

function getDefaultTab(profile) {
  return getDefaultAdminTab(profile);
}

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
};

const getReferralLabel = (lead) => {
  const source = lead.utm_source;
  const referrer = lead.referrer;
  
  if (source) {
    let cleanSource = source.toLowerCase();
    if (cleanSource === 'ig' || cleanSource === 'instagram') return 'Instagram Ads';
    if (cleanSource === 'fb' || cleanSource === 'facebook') return 'Facebook Ads';
    if (cleanSource === 'google' || cleanSource === 'gads') return 'Google Ads';
    if (cleanSource === 'live_chat') return 'Live Chat';
    return source.charAt(0).toUpperCase() + source.slice(1);
  }
  
  if (referrer) {
    try {
      const url = new URL(referrer);
      const host = url.hostname.toLowerCase();
      if (host.includes('instagram.com')) return 'Instagram (Org)';
      if (host.includes('facebook.com')) return 'Facebook (Org)';
      if (host.includes('google.com')) return 'Google (Organic)';
      if (host.includes('t.co') || host.includes('twitter.com') || host.includes('x.com')) return 'X / Twitter';
      if (host.includes('l.wl.co') || host.includes('whatsapp')) return 'Whatsapp';
      return url.hostname.replace('www.', '');
    } catch (e) {
      return 'Referral';
    }
  }
  
  return 'Direct';
};

const getReferralBadgeStyles = (label) => {
  if (!label) {
    return {
      background: 'rgba(148, 163, 184, 0.15)',
      color: '#94a3b8'
    };
  }

  const lower = label.toLowerCase();
  
  if (lower.includes('whatsapp')) {
    return {
      background: 'rgba(34, 197, 94, 0.15)',
      color: '#4ade80',
      border: '1px solid rgba(34, 197, 94, 0.3)'
    };
  }

  if (lower.includes('live chat')) {
    return {
      background: 'rgba(14, 165, 233, 0.15)',
      color: '#7dd3fc',
      border: '1px solid rgba(14, 165, 233, 0.3)'
    };
  }
  
  if (lower.includes('instagram') || lower === 'ig') {
    return {
      background: 'rgba(236, 72, 153, 0.15)',
      color: '#f472b6',
      border: '1px solid rgba(236, 72, 153, 0.3)'
    };
  }
  
  if (lower.includes('facebook') || lower === 'fb') {
    return {
      background: 'rgba(59, 130, 246, 0.15)',
      color: '#60a5fa',
      border: '1px solid rgba(59, 130, 246, 0.3)'
    };
  }
  
  if (lower.includes('google') || lower === 'gads') {
    return {
      background: 'rgba(99, 102, 241, 0.15)',
      color: '#818cf8',
      border: '1px solid rgba(99, 102, 241, 0.3)'
    };
  }
  
  if (lower.includes('twitter') || lower === 'x' || lower.includes('x /')) {
    return {
      background: 'rgba(14, 165, 233, 0.15)',
      color: '#38bdf8',
      border: '1px solid rgba(14, 165, 233, 0.3)'
    };
  }
  
  if (lower === 'direct') {
    return {
      background: 'rgba(148, 163, 184, 0.15)',
      color: '#94a3b8',
      border: '1px solid rgba(148, 163, 184, 0.3)'
    };
  }

  return {
    background: 'rgba(168, 85, 247, 0.15)',
    color: '#c084fc',
    border: '1px solid rgba(168, 85, 247, 0.3)'
  };
};

const formatRelativeTime = (dateString) => {
  if (!dateString) return 'Never';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    if (isNaN(diffMs) || diffMs < 0) return 'Just now';
    
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (e) {
    return 'Never';
  }
};

export default function AdminPage() {
  const router = useRouter();
  
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const loggedInEmail = React.useRef(''); // persists the email used to sign in
  const loadedProfileUserIdRef = React.useRef(null);
  
  // Mounted state for hydration fix
  const [mounted, setMounted] = useState(false);

  // Dashboard state tabs: 'spreadsheet', 'orders', 'share'
  const [activeTab, setActiveTab] = useState('spreadsheet');

  // Announcement copy handed over from another tab (currently Deal of the Week),
  // for the Announcements panel to pre-fill so the send still happens there.
  const [broadcastDraft, setBroadcastDraft] = useState(null);

  // Spreadsheet product editor states
  const [products, setProducts] = useState([]);
  const [hiddenProductNames, setHiddenProductNames] = useState([]); // names of products hidden from the public catalog (not deleted)
  const [orders, setOrders] = useState([]);
  const [abandonedCarts, setAbandonedCarts] = useState([]);
  const [cartSort, setCartSort] = useState('date_desc');
  const [cartFilterContact, setCartFilterContact] = useState('all');
  const [cartFilterStatus, setCartFilterStatus] = useState('all');
  const [cartFilterValue, setCartFilterValue] = useState('all');
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [orderSearch, setOrderSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [highlightedProductId, setHighlightedProductId] = useState(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState('All');
  const [loadingAbandonedCarts, setLoadingAbandonedCarts] = useState(true);
  const [sendingRecoveryEmail, setSendingRecoveryEmail] = useState({});
  const [sendingRecoveryWhatsApp, setSendingRecoveryWhatsApp] = useState({});
  const [selectedCartIds, setSelectedCartIds] = useState([]);
  const [lastSelectedCartIndex, setLastSelectedCartIndex] = useState(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgressText, setBulkProgressText] = useState('');
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [leads, setLeads] = useState([]);
  const [lastSelectedLeadIndex, setLastSelectedLeadIndex] = useState(null);
  const [expandedLeadViews, setExpandedLeadViews] = useState({});
  const [selectedLeadDetails, setSelectedLeadDetails] = useState(null);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [inquiryCount, setInquiryCount] = useState(0);
  const [unreadTeamMsgCount, setUnreadTeamMsgCount] = useState(0);
  const [liveChatUnreadCount, setLiveChatUnreadCount] = useState(0);
  const [notifRefreshKey, setNotifRefreshKey] = useState(0);
  const [selectedCartDetails, setSelectedCartDetails] = useState(null);
  const [loadingLeads, setLoadingLeads] = useState(true);
  
  // Facebook Notifications States
  const [facebookNotifications, setFacebookNotifications] = useState([]);
  const [loadingFbNotifications, setLoadingFbNotifications] = useState(true);
  const [fbView, setFbView] = useState('inbox'); // 'inbox' | 'posts' | 'alerts' — Facebook tab sub-view
  const [fbFilter, setFbFilter] = useState('All');
  const [toastMessage, setToastMessage] = useState('');
  const [leadsSearch, setLeadsSearch] = useState('');
  const [leadsSourceFilter, setLeadsSourceFilter] = useState('active');
  const [leadsAreaFilter, setLeadsAreaFilter] = useState('All');
  const [fbReplyId, setFbReplyId] = useState(null);
  const [fbReplyText, setFbReplyText] = useState('');
  const [fbReplyLoading, setFbReplyLoading] = useState(false);
  const [focusedFacebookNotificationId, setFocusedFacebookNotificationId] = useState(null);
  
  // Pagination States
  const [leadsCurrentPage, setLeadsCurrentPage] = useState(1);
  const [leadsPerPage, setLeadsPerPage] = useState(25);
  const [ordersCurrentPage, setOrdersCurrentPage] = useState(1);
  const [ordersPerPage, setOrdersPerPage] = useState(25);

  const [productViews, setProductViews] = useState([]);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(FALLBACK_EXCHANGE_RATE);
  const [exchangeRateUpdatedAt, setExchangeRateUpdatedAt] = useState(null);
  
  // Storage Bucket States
  const [bucketImages, setBucketImages] = useState([]);
  const [agents, setAgents] = useState([]);
  // The same rows as `agents`, unflattened. buildAgentNameResolver needs the
  // name AND the email to tell that an order signed "korinneda@icloud.com" is
  // the same person as one signed "Korinne"; `agents` collapses them to one
  // string and loses that link.
  const [agentProfiles, setAgentProfiles] = useState([]);
  const [orderAffiliates, setOrderAffiliates] = useState([]);
  const [loadingBucketImages, setLoadingBucketImages] = useState(false);
  
  // CMS States
  const [blogs, setBlogs] = useState([]);
  const [loadingBlogs, setLoadingBlogs] = useState(true);
  const [siteSettings, setSiteSettings] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [cmsSaveStatus, setCmsSaveStatus] = useState('');
  const [cmsSaveLoading, setCmsSaveLoading] = useState(false);
  const [cmsChangeHistory, setCmsChangeHistory] = useState([]);
  const [editingBlog, setEditingBlog] = useState(null);
  const [businessLinks, setBusinessLinks] = useState(null);  
  const [publicPageSettings, setPublicPageSettings] = useState(() => mergeAllPublicPageSettings());
  // CSV Import States
  const [csvDragActive, setCsvDragActive] = useState(false);
  const [csvStatus, setCsvStatus] = useState('');
  const [csvLoading, setCsvLoading] = useState(false);
  const [isCsvOpen, setIsCsvOpen] = useState(false);

  // Operation statuses
  const [saveStatus, setSaveStatus] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  // Edit Description Modal States
  const [editDescModalOpen, setEditDescModalOpen] = useState(false);
  const [editDescProduct, setEditDescProduct] = useState(null);
  const [editDescEn, setEditDescEn] = useState('');
  const [editDescEs, setEditDescEs] = useState('');
  const [loadingAiDesc, setLoadingAiDesc] = useState(false);
  const [loadingAiTranslate, setLoadingAiTranslate] = useState(false);

  // AI WhatsApp Outbound Composer States
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waRecipient, setWaRecipient] = useState(null); // { name, phone, orderId, cartItems, context }
  const [waMessageText, setWaMessageText] = useState('');
  const [waSending, setWaSending] = useState(false);
  const [waDrafting, setWaDrafting] = useState(false);
  const [waSelectedAgent, setWaSelectedAgent] = useState('');
  const [waSelectedTemplate, setWaSelectedTemplate] = useState('standard');

  // AI Leads Outreach Composer States
  const [leadOutreachModalOpen, setLeadOutreachModalOpen] = useState(false);
  const [leadOutreachActive, setLeadOutreachActive] = useState(null); // the current lead object
  const [leadOutreachMethod, setLeadOutreachMethod] = useState('whatsapp'); // 'whatsapp' or 'email'
  const [leadOutreachMessage, setLeadOutreachMessage] = useState('');
  const [leadOutreachDrafting, setLeadOutreachDrafting] = useState(false);
  const [leadOutreachSending, setLeadOutreachSending] = useState(false);

  // AI Copilot States
  const [aiChatMessages, setAiChatMessages] = useState([
    { role: 'assistant', text: '¡Hola! Soy tu Copiloto de Inteligencia Artificial para Costa Peptides. 🧬 ¿En qué te puedo asistir hoy?\n\nPuedo redactar boletines de marketing, traducir descripciones científicas, formular resúmenes de investigación para tus blogs, o estructurar plantillas de mensajes de WhatsApp altamente personalizadas.' }
  ]);
  const [aiInputText, setAiInputText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // WhatsApp AI Live Inbox States
  const [whatsappMessages, setWhatsappMessages] = useState([]);
  const [whatsappConversations, setWhatsappConversations] = useState([]);
  const [whatsappAgents, setWhatsappAgents] = useState([]);
  const [whatsappConversationRoutingAvailable, setWhatsappConversationRoutingAvailable] = useState(true);
  const [whatsappConversationLoadError, setWhatsappConversationLoadError] = useState('');
  const [loadingWhatsappMessages, setLoadingWhatsappMessages] = useState(true);
  const [activeChatWaId, setActiveChatWaId] = useState(null);
  const [whatsappSettings, setWhatsappSettings] = useState({
    ai_auto_reply: true,
    ai_system_prompt: DEFAULT_WHATSAPP_AI_PROMPT,
  });
  const [savingWaSettings, setSavingWaSettings] = useState(false);
  const [chatInputText, setChatInputText] = useState('');
  const [draftingAiReply, setDraftingAiReply] = useState(false);
  const [liveWaSendFeedback, setLiveWaSendFeedback] = useState({ status: 'idle', message: '' });

  // ── WA unread tracking (localStorage-backed) ──────────────────────────────
  // seenMap: { [waId]: isoTimestamp } — the lastInboundAt we have "seen"
  const [seenMap, setSeenMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wa_seen_map') || '{}'); } catch { return {}; }
  });

  const markSeen = (waId, lastInboundAt) => {
    if (!waId || !lastInboundAt) return;
    setSeenMap(prev => {
      const next = { ...prev, [waId]: lastInboundAt };
      try { localStorage.setItem('wa_seen_map', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const handleWhatsAppConversationAction = async (waId, action, extra = {}) => {
    if (action === 'delete') {
      const res = await adminFetch(`/api/admin/whatsapp-conversations?waId=${waId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete conversation');
      setWhatsappConversations((prev) => prev.filter((item) => item.wa_id !== waId));
      return null;
    }

    const res = await adminFetch('/api/admin/whatsapp-conversations', {
      method: 'PATCH',
      body: JSON.stringify({ waId, action, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not update conversation');
    if (data.conversation) {
      setWhatsappConversations((prev) => {
        const next = prev.filter((item) => item.wa_id !== data.conversation.wa_id);
        return [data.conversation, ...next].sort(
          (a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)
        );
      });
    }
    return data.conversation;
  };

  // Auto-mark current open chat as seen when new messages arrive
  useEffect(() => {
    if (!activeChatWaId || !whatsappMessages.length) return;
    const msgs = whatsappMessages.filter(m => String(m.wa_id).replace(/\D/g, '') === activeChatWaId);
    const lastInbound = msgs.filter(m => m.direction === 'inbound').sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    if (lastInbound) markSeen(activeChatWaId, lastInbound.created_at);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatWaId, whatsappMessages]);

  // Count chats with unseen inbound messages
  const unreadWaCount = useMemo(() => {
    const chatLastInbound = {};
    whatsappMessages.forEach(m => {
      if (m.direction !== 'inbound') return;
      const waId = String(m.wa_id).replace(/\D/g, '');
      if (!waId) return;
      if (!chatLastInbound[waId] || new Date(m.created_at) > new Date(chatLastInbound[waId])) {
        chatLastInbound[waId] = m.created_at;
      }
    });
    return Object.entries(chatLastInbound).filter(([waId, lastAt]) => {
      const seenAt = seenMap[waId];
      return !seenAt || new Date(lastAt) > new Date(seenAt);
    }).length;
  }, [whatsappMessages, seenMap]);

  // Baileys (2nd Device) Inbox States
  const [baileysActiveChatWaId, setBaileysActiveChatWaId] = useState(null);
  const [baileysChatInputText, setBaileysChatInputText] = useState('');
  const [sendingBaileysMsg, setSendingBaileysMsg] = useState(false);
  const [baileysSendFeedback, setBaileysSendFeedback] = useState({ status: 'idle', message: '' });

  // Save WhatsApp settings handler
  const handleSaveWhatsappSettings = async (settings) => {
    setSavingWaSettings(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('site_settings')
          .upsert({ id: 'whatsapp_settings', value: settings });
        if (error) throw error;
        setWhatsappSettings(settings);
        alert('✅ WhatsApp AI autopilot settings saved successfully!');
      } else {
        alert('Supabase is not configured. Saving locally in memory.');
        setWhatsappSettings(settings);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSavingWaSettings(false);
    }
  };

  // Ask Gemini to draft response contextually
  const handleDraftAiChatReply = async (waId) => {
    if (!waId) return;
    setDraftingAiReply(true);
    try {
      const activeThread = whatsappMessages
        .filter(m => m.wa_id === waId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      
      const threadContext = activeThread.map(m => 
        `${m.direction === 'inbound' ? 'Customer' : 'Store Assistant (' + (m.display_name || 'AI') + ')'}: "${m.message_text}"`
      ).join('\n');

      const latestMsg = activeThread[activeThread.length - 1]?.message_text || '';

      const waTail = waId.replace(/\D/g, '').slice(-8);
      const matchedOrders = orders
        .filter((o) => (o.customer_phone || '').replace(/\D/g, '').includes(waTail))
        .slice(0, 2);
      const matchedCarts = abandonedCarts
        .filter((c) => (c.customer_phone || '').replace(/\D/g, '').includes(waTail) && Array.isArray(c.cart_data) && c.cart_data.length > 0)
        .slice(0, 2);

      let crmContext = '';
      if (matchedOrders.length) {
        crmContext += 'Customer orders:\n' + matchedOrders.map((o) =>
          `- #${o.order_number || o.id.slice(0, 8)} (${o.status}): ${(o.items || []).map((i) => `${i.product} x${i.qty}`).join(', ')}`
        ).join('\n') + '\n\n';
      }
      if (matchedCarts.length) {
        crmContext += 'Active abandoned carts:\n' + matchedCarts.map((c) =>
          `- ${c.cart_data.map((i) => `${i.product} x${i.qty}`).join(', ')} | https://catalog.peptidescostarica.net/catalog?recover_session=${c.session_id}`
        ).join('\n');
      }

      const promptText = `
System Instructions:
${whatsappSettings.ai_system_prompt}

Active Products in Catalog:
${products.map(p => `- ${p.product} (Category: ${p.category}, Price: ${p.priceUsd} USD / ${p.priceCrc || 'N/A'} CRC, Status: ${p.status})`).join('\n')}

${crmContext ? `Customer CRM Context:\n${crmContext}\n` : ''}
Recent Conversation Thread:
${threadContext}

Customer's Latest Message:
"${latestMsg}"

Please draft a perfect next response to this customer. Match their language (Spanish or English). Write only the reply body ready to send. Keep it natural, polite, and scientific yet friendly. Return ONLY the reply text, no headers or meta-notes.
`;

      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          prompt: promptText
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setChatInputText(data.text.trim());
      } else {
        alert('Failed to draft AI response: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Error generating draft: ' + err.message);
    } finally {
      setDraftingAiReply(false);
    }
  };

  const handleSendLiveWhatsappTemplate = async (templateId, values = {}) => {
    if (!activeChatWaId || !templateId) return null;

    setLiveWaSendFeedback({
      status: 'sending',
      message: 'Sending approved template...',
    });

    try {
      const res = await adminFetch('/api/admin/whatsapp-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: activeChatWaId,
          templateId,
          values,
          customerName: values.customerName || 'Peptides Customer',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Template delivery failed.');
      }

      setLiveWaSendFeedback({ status: 'idle', message: '' });
      await loadAdminData();
      return data;
    } catch (err) {
      console.error(err);
      setLiveWaSendFeedback({
        status: 'error',
        message: err.message || 'Template delivery failed. Please try another approved template.',
      });
      throw err;
    }
  };

  // Send Manual reply via WhatsApp Cloud API
  const handleSendLiveWhatsappMessage = async (mediaUrl = null) => {
    if (!activeChatWaId || (!chatInputText.trim() && !mediaUrl)) return;
    
    const textToSend = chatInputText.trim();
    if (!mediaUrl) setChatInputText('');
    setLiveWaSendFeedback({
      status: 'sending',
      message: mediaUrl ? 'Sending attachment...' : 'Sending message...',
    });

    // Optimistically insert message into UI state thread
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      wa_id: activeChatWaId,
      display_name: 'Peptides Costa Rica',
      message_text: textToSend,
      media_url: mediaUrl,
      message_type: mediaUrl ? 'image' : 'text',
      direction: 'outbound',
      created_at: new Date().toISOString()
    };
    
    setWhatsappMessages(prev => [optimisticMessage, ...prev]);

    try {
      const res = await adminFetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: activeChatWaId,
          message: textToSend,
          mediaUrl: mediaUrl,
          customerName: 'Peptides Customer'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setLiveWaSendFeedback({ status: 'idle', message: '' });
        loadAdminData();
      } else {
        setLiveWaSendFeedback({
          status: 'error',
          message: data.error || 'WhatsApp delivery failed. Check the reply window or try again.',
        });
        setWhatsappMessages(prev => prev.filter(m => m.id !== tempId));
        setChatInputText(textToSend);
      }
    } catch (err) {
      console.error(err);
      setLiveWaSendFeedback({
        status: 'error',
        message: err.message || 'WhatsApp delivery failed. Please try again.',
      });
      setWhatsappMessages(prev => prev.filter(m => m.id !== tempId));
      if (!mediaUrl) setChatInputText(textToSend);
    }
  };

  const [uploadingWaImage, setUploadingWaImage] = useState(false);

  const handleWaImageUpload = async (file) => {
    if (!file) return;
    setUploadingWaImage(true);
    try {
      if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured');
      
      const fileExt = file.name.split('.').pop();
      const fileName = `wa-attach-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(fileName, file);
        
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('whatsapp-media')
        .getPublicUrl(fileName);
        
      await handleSendLiveWhatsappMessage(publicUrl);
    } catch (err) {
      console.error(err);
      alert('Failed to send image: ' + err.message);
    } finally {
      setUploadingWaImage(false);
    }
  };

  // Send reply via Baileys (2nd Device) session
  const handleSendBaileysMessage = async () => {
    if (!baileysActiveChatWaId || !baileysChatInputText.trim()) return;
    const textToSend = baileysChatInputText.trim();
    setBaileysChatInputText('');
    setSendingBaileysMsg(true);
    setBaileysSendFeedback({ status: 'sending', message: 'Sending from linked device...' });

    const tempId = `temp-baileys-${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      wa_id: baileysActiveChatWaId,
      display_name: 'Peptides Costa Rica',
      message_text: textToSend,
      message_type: 'text',
      direction: 'outbound',
      source: 'baileys_session',
      created_at: new Date().toISOString(),
    };
    setWhatsappMessages(prev => [optimisticMessage, ...prev]);

    try {
      const res = await adminFetch('/api/admin/whatsapp-session/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: baileysActiveChatWaId, message: textToSend }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setBaileysSendFeedback({
          status: 'error',
          message: data.error || 'Linked-device send failed. Please try again.',
        });
        setWhatsappMessages(prev => prev.filter(m => m.id !== tempId));
        setBaileysChatInputText(textToSend);
      } else {
        setBaileysSendFeedback({ status: 'idle', message: '' });
        loadAdminData();
      }
    } catch (err) {
      setBaileysSendFeedback({
        status: 'error',
        message: err.message || 'Linked-device send failed. Please try again.',
      });
      setWhatsappMessages(prev => prev.filter(m => m.id !== tempId));
      setBaileysChatInputText(textToSend);
    } finally {
      setSendingBaileysMsg(false);
    }
  };

  const handleSendFbReply = async (notification) => {
    if (!fbReplyText.trim()) return;
    setFbReplyLoading(true);
    try {
      // Comments get a private reply (DM to the commenter); messages get a normal reply.
      const isComment = notification.type === 'comment';
      const endpoint = isComment ? '/api/facebook/private-reply' : '/api/facebook/reply';
      const body = isComment
        ? { commentId: notification.sender_id, message: fbReplyText.trim() }
        : { recipientId: notification.sender_id, messageText: fbReplyText.trim() };
      const res = await adminFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setToastMessage(isComment ? 'Private DM sent to commenter!' : 'Reply sent successfully!');
        setFbReplyText('');
        setFbReplyId(null);
        handleMarkNotificationRead(notification.id);
      } else {
        alert('Failed to send reply: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Error sending reply: ' + err.message);
    } finally {
      setFbReplyLoading(false);
      setTimeout(() => setToastMessage(''), 3000);
    }
  };

  // Carts AI Audit States
  const [cartsAiText, setCartsAiText] = useState('');
  const [generatingCartsAi, setGeneratingCartsAi] = useState(false);

  const handleGenerateCartsAi = async () => {
    setGeneratingCartsAi(true);
    setCartsAiText('');
    try {
      const activeAbandoned = abandonedCarts.filter(c => c.status === 'active' || !c.status);
      const totalPotentialVal = activeAbandoned.reduce((sum, c) => {
        if (!Array.isArray(c.cart_data)) return sum;
        return sum + c.cart_data.reduce((acc, item) => {
          const price = parseFloat((item.price_usd || item.priceUsd || '0').replace(/[^0-9.]/g, '')) || 0;
          return acc + (price * (item.qty || 1));
        }, 0);
      }, 0);

      const itemsDropped = {};
      activeAbandoned.forEach(c => {
        if (Array.isArray(c.cart_data)) {
          c.cart_data.forEach(item => {
            const pName = item.product || 'Unknown Product';
            itemsDropped[pName] = (itemsDropped[pName] || 0) + (item.qty || 1);
          });
        }
      });

      const prompt = `You are the chief cart recovery optimizer at Peptides Costa Rica.
Analyze the following active abandoned carts statistics:
- Total Active Abandoned Carts: ${activeAbandoned.length}
- Total Potential Recoverable Value: $${totalPotentialVal.toFixed(2)} USD (CRC ${(totalPotentialVal * exchangeRate).toLocaleString()})
- Items Dropped in Carts (Frequency List): ${Object.entries(itemsDropped).map(([name, qty]) => `${name} (x${qty})`).join(', ') || 'No item data available'}

Please provide the recovery analysis in BOTH English and Spanish. 
Format it as two clear, consecutive sections:
"🇬🇧 ENGLISH CARTS RECOVERY STRATEGY"
and
"🇪🇸 ESTRATEGIA DE RECUPERACIÓN EN ESPAÑOL"

For each language section, include:
1. **Auditor Verdict** (1 bold sentence regarding the urgency/magnitude of this recoverable pool).
2. **Frequency Leader analysis** (Explain which peptide is most abandoned and why: e.g. BPC-157 recovery hooks, Semaglutide commitment dropoff).
3. **Drafted High-converting Pitch Templates** (Write 2 custom WhatsApp templates to recover the top items, including an explicit 10% coupon hook or free courier shipping hook).

Keep your tone highly professional, precise, data-driven, and empowering. Format with clean Markdown (bold text, bullet points). Do not write any greetings or preambles, just start directly with the English header.`;

      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          prompt
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setCartsAiText(data.text);
      } else {
        alert('Failed to generate insights: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to generate insights: ' + err.message);
    } finally {
      setGeneratingCartsAi(false);
    }
  };

  // Leads AI Audit States
  const [leadsAiText, setLeadsAiText] = useState('');
  const [generatingLeadsAi, setGeneratingLeadsAi] = useState(false);

  const handleGenerateLeadsAi = async () => {
    setGeneratingLeadsAi(true);
    setLeadsAiText('');
    try {
      const totalLeads = leads.length;
      const referralSources = {};
      const cities = {};

      leads.forEach(l => {
        const source = l.utm_source || l.source || 'Organic/Direct';
        referralSources[source] = (referralSources[source] || 0) + 1;

        const city = l.region || l.city || 'Unknown Region';
        cities[city] = (cities[city] || 0) + 1;
      });

      const prompt = `You are the lead marketing director at Peptides Costa Rica.
Analyze the following catalog access leads pipeline statistics:
- Total Leads Captured: ${totalLeads}
- Traffic Source Breakdown: ${Object.entries(referralSources).map(([source, count]) => `${source} (${count} leads)`).join(', ') || 'No source data'}
- Top Geographic Regions: ${Object.entries(cities).slice(0, 5).map(([city, count]) => `${city} (${count} leads)`).join(', ') || 'No region data'}

Please provide a highly strategic lead acquisition & conversion analysis in BOTH English and Spanish.
Format it as two clear, consecutive sections:
"🇬🇧 ENGLISH LEADS STRATEGY & CAMPAIGNS"
and
"🇪🇸 ESTRATEGIA Y CAMPAÑAS DE PROSPECTOS"

For each language section, include:
1. **Auditor Verdict** (1 bold sentence grading your lead acquisition speed and geographical interest).
2. **Channel Performance analysis** (Identify which acquisition channels are working best and how to optimize them, e.g. paid ads vs instagram influencers).
3. **Outbound Outreach Campaign** (Draft a highly persuasive, hyper-targeted cold outreach email & WhatsApp message in both languages targeting prospects who haven't completed checkout yet, offering an educational catalog review or specific scientific explanation).

Keep your tone highly professional, precise, data-driven, and empowering. Format with clean Markdown (bold text, bullet points). Do not write any greetings or preambles, just start directly with the English header.`;

      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          prompt
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setLeadsAiText(data.text);
      } else {
        alert('Failed to generate insights: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to generate insights: ' + err.message);
    } finally {
      setGeneratingLeadsAi(false);
    }
  };


  // Link share builder states
  const [shareLang, setShareLang] = useState('es');
  const [shareCurrency, setShareCurrency] = useState('CRC');
  const [shareSource, setShareSource] = useState('none');
  const [shareMedium, setShareMedium] = useState('');
  const [shareCampaign, setShareCampaign] = useState('');
  const [shareProduct, setShareProduct] = useState('all');
  const [shareCopied, setShareCopied] = useState(false);
  const [sharePresetName, setSharePresetName] = useState('');
  const [sharePresets, setSharePresets] = useState(() => readSharePresets());
  const [sharePresetSaved, setSharePresetSaved] = useState(false);
  const [reviewStatusFilter, setReviewStatusFilter] = useState('Pending');
  const [reviewProductFilter, setReviewProductFilter] = useState('all');
  const [reviewModerationReasons, setReviewModerationReasons] = useState({});

  // Password change states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Export Modal States
  const [exportModalType, setExportModalType] = useState(null); // 'orders' | 'products' | 'carts'
  const [exportLoading, setExportLoading] = useState(false);

  // Leads Editing States
  const [editingLeadId, setEditingLeadId] = useState(null);
  const [editLeadValue, setEditLeadValue] = useState('');
  const [editLeadMethod, setEditLeadMethod] = useState('');
  const [selectedLeads, setSelectedLeads] = useState([]);

  // Dynamic CRM states
  const [generatingIndividualAi, setGeneratingIndividualAi] = useState(false);
  const [individualAiText, setIndividualAiText] = useState('');
  const [isLocalAiDraft, setIsLocalAiDraft] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  const getLeadConversion = useCallback(
    (lead) => resolveLeadConversion(lead, orders),
    [orders]
  );

  const handleLeadFieldUpdate = async (id, fieldName, value) => {
    // Update local state first
    setLeads(prev => prev.map(l => l.id === id ? { ...l, [fieldName]: value } : l));

    // Save to localStorage in case database schema lacks status/notes columns
    localStorage.setItem(`lead_${fieldName}_${id}`, value);

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('catalog_leads')
          .update({ [fieldName]: value })
          .eq('id', id);

        if (error) {
          console.warn(`Supabase catalog_leads update warning (using local fallback):`, error.message);
        }
      } catch (err) {
        console.warn(`Supabase catalog_leads update error:`, err);
      }
    }
  };

  const logOutreachToNotes = async (lead, outreachType, messageText) => {
    const timestamp = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const logHeader = `[${timestamp}] ${outreachType === 'email' ? '✉️ Custom Email Sent' : '💬 WhatsApp Outreach Sent'}:\n`;
    const separator = '-'.repeat(40) + '\n';
    const logEntry = `${logHeader}${separator}${messageText.trim()}\n${separator}\n`;
    
    // Fetch latest lead notes dynamically
    const latestLead = leads.find(l => l.id === lead.id) || lead;
    const currentNotes = latestLead.notes || '';
    const updatedNotes = currentNotes ? `${logEntry}${currentNotes}` : logEntry.trim();
    
    await handleLeadFieldUpdate(lead.id, 'notes', updatedNotes);
  };

  const handleMarkAsContacted = async (leadId) => {
    const now = new Date().toISOString();
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, last_contacted_at: now } : l));
    setSelectedLeadDetails(prev => prev && prev.id === leadId ? { ...prev, last_contacted_at: now } : prev);

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('catalog_leads')
          .update({ last_contacted_at: now })
          .eq('id', leadId);

        if (error) {
          console.warn(`Supabase catalog_leads last_contacted_at update warning:`, error.message);
        }
      } catch (err) {
        console.warn(`Supabase catalog_leads last_contacted_at update error:`, err);
      }
    }
  };

  const handleSendEmailOutreach = async (lead, message) => {
    if (!lead || !lead.contact_value || !message) return;
    setEmailSending(true);
    try {
      const res = await adminFetch('/api/admin/send-email', {
        method: 'POST',
        body: JSON.stringify({
          to: lead.contact_value,
          subject: lead.language === 'es' ? 'Acceso Exclusivo al Catálogo - Peptides Costa Rica' : 'Exclusive Catalog Access - Peptides Costa Rica',
          message: message
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert('✅ Email outreach sent successfully through your SMTP server!');
        await logOutreachToNotes(lead, 'email', message);
        await handleMarkAsContacted(lead.id);
      } else {
        alert('❌ Failed to send email through server: ' + (data.error || 'Unknown error') + '\n\nOpening your personal email client as fallback instead...');
        const subject = encodeURIComponent(lead.language === 'es' ? 'Información sobre Péptidos de Costa Rica' : 'Peptides Costa Rica Inquiry');
        window.location.href = `mailto:${lead.contact_value}?subject=${subject}&body=${encodeURIComponent(message)}`;
        await logOutreachToNotes(lead, 'email', `(Fallback Client)\nSubject: ${lead.language === 'es' ? 'Información sobre Péptidos de Costa Rica' : 'Peptides Costa Rica Inquiry'}\n\n${message}`);
        await handleMarkAsContacted(lead.id);
      }
    } catch (err) {
      console.error(err);
      alert('❌ Connection failed: ' + err.message + '\n\nOpening your personal email client as fallback instead...');
      const subject = encodeURIComponent(lead.language === 'es' ? 'Información sobre Péptidos de Costa Rica' : 'Peptides Costa Rica Inquiry');
      window.location.href = `mailto:${lead.contact_value}?subject=${subject}&body=${encodeURIComponent(message)}`;
      await logOutreachToNotes(lead, 'email', `(Fallback Client Connection Error)\nSubject: ${lead.language === 'es' ? 'Información sobre Péptidos de Costa Rica' : 'Peptides Costa Rica Inquiry'}\n\n${message}`);
      await handleMarkAsContacted(lead.id);
    } finally {
      setEmailSending(false);
    }
  };

  const openLeadOutreachComposer = (lead, method) => {
    // Dynamically retrieve viewed products for this lead using global productViews state
    const views = productViews.filter(v => v.contact_value === lead.contact_value);
    const uniqueViewedProducts = Array.from(new Set(views.map(v => v.product_name).filter(Boolean)));
    const enrichedLead = { ...lead, browsing_history: uniqueViewedProducts };

    setLeadOutreachActive(enrichedLead);
    setLeadOutreachMethod(method);
    
    // Create a highly-converting, sales-optimized template message
    let defaultMsg = '';
    const productsStr = uniqueViewedProducts.length > 0 
      ? uniqueViewedProducts.join(', ') 
      : '';
      
    if (lead.language === 'es') {
      if (method === 'email') {
        if (productsStr) {
          defaultMsg = `¡Hola! 👋

Vimos que estuviste revisando nuestro catálogo de péptidos y te interesaste en ${productsStr}. 🧪

¿Tienes alguna duda sobre la reconstitución, dosis o envíos express en Costa Rica? 

Puedes volver al catálogo para completar tu orden en https://catalog.peptidescostarica.net/catalog (¡usa el cupón *COSTA10* para un 10% de descuento!). 

Si prefieres coordinar o realizar tus consultas por WhatsApp, puedes escribirnos directamente a nuestros WhatsApp de la compañía +506 8404-6973 haciendo clic en este enlace: https://wa.me/50684046973

¡Pura vida!
Peptides Costa Rica`;
        } else {
          defaultMsg = `¡Hola! 👋

Vimos que estuviste revisando nuestro catálogo de péptidos en https://catalog.peptidescostarica.net/catalog. 🧪

¿Tienes alguna consulta técnica o sobre stock en la que te podamos ayudar hoy?

Puedes volver al catálogo para completar tu orden en https://catalog.peptidescostarica.net/catalog (¡usa el cupón *COSTA10* para un 10% de descuento!).

Si prefieres coordinar o realizar tus consultas por WhatsApp, puedes escribirnos directamente a nuestros WhatsApp de la compañía +506 8404-6973 haciendo clic en este enlace: https://wa.me/50684046973

¡Pura vida!
Peptides Costa Rica`;
        }
      } else {
        // WhatsApp method
        if (productsStr) {
          defaultMsg = `¡Hola! 👋 Vimos que estuviste revisando nuestro catálogo de péptidos y te interesaste en *${productsStr}*. 🧪\n\n¿Tienes alguna duda sobre la reconstitución, dosis o envíos express en Costa Rica? \n\nPuedes volver al catálogo en catalog.peptidescostarica.net/catalog (usa el cupón *COSTA10* para un 10% de descuento) o responder a este WhatsApp de la compañía al +506 8404-6973 para coordinar de inmediato.`;
        } else {
          defaultMsg = `¡Hola! 👋 Vimos que estuviste revisando nuestro catálogo de péptidos en catalog.peptidescostarica.net/catalog. 🧪\n\n¿Tienes alguna consulta técnica o sobre stock en la que te podamos ayudar hoy?\n\nPuedes volver al catálogo para completar tu orden con un 10% de descuento usando el cupón: *COSTA10* o responder directamente a este WhatsApp de la compañía al +506 8404-6973.`;
        }
      }
    } else {
      if (method === 'email') {
        if (productsStr) {
          defaultMsg = `Hi there! 👋

We noticed you were browsing our peptide catalog and were interested in ${productsStr}. 🧪

Do you have any research questions regarding reconstitution, dosages, or express shipping in Costa Rica?

You can return to our catalog to complete your order at https://catalog.peptidescostarica.net/catalog (use coupon *COSTA10* for 10% off!).

If you prefer to coordinate or ask questions via WhatsApp, you can chat with us directly at our company WhatsApp numbers +506 8404-6973 by clicking here: https://wa.me/50684046973

Best regards,
Peptides Costa Rica`;
        } else {
          defaultMsg = `Hi there! 👋

We noticed you were browsing our peptide catalog at https://catalog.peptidescostarica.net/catalog. 🧪

Do you have any research questions or stock inquiries we can help you with today?

You can return to our catalog to complete your purchase at https://catalog.peptidescostarica.net/catalog (use coupon *COSTA10* for 10% off!).

If you prefer to coordinate or ask questions via WhatsApp, you can chat with us directly at our company WhatsApp numbers +506 8404-6973 by clicking here: https://wa.me/50684046973

Best regards,
Peptides Costa Rica`;
        }
      } else {
        // WhatsApp method
        if (productsStr) {
          defaultMsg = `Hi there! 👋 We noticed you were browsing our peptide catalog and were interested in *${productsStr}*. 🧪\n\nDo you have any research questions regarding reconstitution, dosages, or express shipping in Costa Rica?\n\nYou can return to catalog.peptidescostarica.net/catalog (use coupon *COSTA10* for 10% off) or reply directly to this company WhatsApp number (+506 8404-6973) to coordinate.`;
        } else {
          defaultMsg = `Hi there! 👋 We noticed you were browsing our peptide catalog at catalog.peptidescostarica.net/catalog. 🧪\n\nDo you have any research questions or stock inquiries we can help you with today?\n\nYou can return to our catalog to complete your purchase with 10% off using coupon: *COSTA10* or reply directly to this company WhatsApp number (+506 8404-6973).`;
        }
      }
    }
    
    setLeadOutreachMessage(defaultMsg);
    setLeadOutreachModalOpen(true);
  };

  const handleDraftLeadOutreachMessage = async () => {
    if (!leadOutreachActive) return;
    
    setLeadOutreachDrafting(true);
    try {
      const productsStr = leadOutreachActive.browsing_history && leadOutreachActive.browsing_history.length > 0 
        ? leadOutreachActive.browsing_history.join(', ') 
        : '';
      
      const lang = leadOutreachActive.language === 'es' ? 'Spanish' : 'English';
      
      let prompt = `Write an extremely short, simple, warm, and highly converting outbound sales outreach ${leadOutreachMethod === 'email' ? 'email body' : 'WhatsApp message'} in ${lang} for a customer who browsed our site. 

Core Rules:
1. Keep the message extremely short and sweet (MAX 3-4 sentences total).
2. For WhatsApp outreach, include the catalog link (catalog.peptidescostarica.net/catalog) and mention the company WhatsApp numbers +506 8404-6973.
3. For Email outreach, you MUST explicitly include both the catalog link (https://catalog.peptidescostarica.net/catalog) and a clickable direct link to WhatsApp (https://wa.me/50684046973) along with the company WhatsApp numbers (+506 8404-6973).
4. Be professional and friendly. Avoid lengthy chemical explanations or overly dense medical details. Keep it focused on helping them finalize their research compounds.`;
      
      if (productsStr) {
        prompt += `\n- The user was interested in: "${productsStr}". Mention we have certified 99%+ pure stocks ready for rapid shipment via Correos de Costa Rica.`;
      } else {
        prompt += `\n- Invite them to ask about our research-grade catalog of 99%+ lab-tested high-purity peptides, and coordinate safe dispatch in Costa Rica.`;
      }
      
      if (leadOutreachActive.city || leadOutreachActive.country) {
        prompt += `\n- Their location is: ${[leadOutreachActive.city, leadOutreachActive.region, leadOutreachActive.country].filter(Boolean).join(', ')}.`;
      }
      
      prompt += `\n\nDo NOT write placeholder fields, subject lines, greetings placeholders, or quotes. Just output the ready-to-send text body.`;
      
      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      
      const data = await res.json();
      if (res.ok && data.text) {
        setLeadOutreachMessage(data.text.trim());
      } else {
        alert('Generation failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Generation failed: ' + err.message);
    } finally {
      setLeadOutreachDrafting(false);
    }
  };

  const handleSendLeadOutreach = async () => {
    if (!leadOutreachActive || !leadOutreachMessage.trim()) return;
    setLeadOutreachSending(true);
    try {
      if (leadOutreachMethod === 'whatsapp') {
        const formattedPhone = cleanPhoneNumber(leadOutreachActive.contact_value);
        const res = await adminFetch('/api/whatsapp/send', {
          method: 'POST',
          body: JSON.stringify({
            to: formattedPhone,
            message: leadOutreachMessage,
            customerName: leadOutreachActive.name || leadOutreachActive.contact_value || 'Lead',
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'WhatsApp delivery failed');
        }
        
        await logOutreachToNotes(leadOutreachActive, 'whatsapp', leadOutreachMessage);
        await handleMarkAsContacted(leadOutreachActive.id);
        
        alert('✅ WhatsApp outreach sent from the business number and logged in Sales WhatsApp.');
        setLeadOutreachModalOpen(false);
        loadAdminData();
      } else {
        try {
          const res = await adminFetch('/api/admin/send-email', {
            method: 'POST',
            body: JSON.stringify({
              to: leadOutreachActive.contact_value,
              subject: leadOutreachActive.language === 'es' ? 'Acceso Exclusivo al Catálogo - Peptides Costa Rica' : 'Exclusive Catalog Access - Peptides Costa Rica',
              message: leadOutreachMessage
            })
          });
          
          const data = await res.json();
          if (res.ok && data.success) {
            alert('✅ Email outreach sent successfully through your SMTP server!');
            await logOutreachToNotes(leadOutreachActive, 'email', leadOutreachMessage);
            await handleMarkAsContacted(leadOutreachActive.id);
            setLeadOutreachModalOpen(false);
          } else {
            alert('❌ Failed to send email through server: ' + (data.error || 'Unknown error') + '\n\nOpening your personal email client as fallback instead...');
            const subject = encodeURIComponent(leadOutreachActive.language === 'es' ? 'Información sobre Péptidos de Costa Rica' : 'Peptides Costa Rica Inquiry');
            window.location.href = `mailto:${leadOutreachActive.contact_value}?subject=${subject}&body=${encodeURIComponent(leadOutreachMessage)}`;
            await logOutreachToNotes(leadOutreachActive, 'email', `(Fallback Client)\nSubject: ${leadOutreachActive.language === 'es' ? 'Información sobre Péptidos de Costa Rica' : 'Peptides Costa Rica Inquiry'}\n\n${leadOutreachMessage}`);
            await handleMarkAsContacted(leadOutreachActive.id);
            setLeadOutreachModalOpen(false);
          }
        } catch (err) {
          console.error(err);
          alert('❌ Connection failed: ' + err.message + '\n\nOpening your personal email client as fallback instead...');
          const subject = encodeURIComponent(leadOutreachActive.language === 'es' ? 'Información sobre Péptidos de Costa Rica' : 'Peptides Costa Rica Inquiry');
          window.location.href = `mailto:${leadOutreachActive.contact_value}?subject=${subject}&body=${encodeURIComponent(leadOutreachMessage)}`;
          await logOutreachToNotes(leadOutreachActive, 'email', `(Fallback Client Connection Error)\nSubject: ${leadOutreachActive.language === 'es' ? 'Información sobre Péptidos de Costa Rica' : 'Peptides Costa Rica Inquiry'}\n\n${leadOutreachMessage}`);
          await handleMarkAsContacted(leadOutreachActive.id);
          setLeadOutreachModalOpen(false);
        }
      }
    } catch(err) {
      console.error(err);
      alert(`❌ ${leadOutreachMethod === 'whatsapp' ? 'WhatsApp' : 'Lead'} outreach failed: ${err.message}`);
    } finally {
      setLeadOutreachSending(false);
    }
  };

  const generateLocalFallbackDraft = (lead, viewedProducts, location) => {
    const isEs = lead.language === 'es';
    const isWhatsApp = lead.contact_method === 'whatsapp';
    const hasSpecificProducts = viewedProducts && !viewedProducts.includes('our scientific peptide catalog');
    const firstProduct = hasSpecificProducts ? viewedProducts.split(',')[0].trim() : '';

    if (isWhatsApp) {
      if (isEs) {
        return `¡Hola! 👋 Vimos que estuviste revisando nuestro catálogo de péptidos y te interesaste en *${firstProduct || 'nuestros compuestos'}*. 🧪

¿Tienes alguna duda sobre la reconstitución, dosis o envíos express en Costa Rica? 

Puedes volver al catálogo en catalog.peptidescostarica.net/catalog o respondernos directamente aquí para coordinar por WhatsApp. ¡Usa el cupón *COSTA10* para un 10% de descuento!`;
      } else {
        return `Hi there! 👋 We noticed you were browsing our peptide catalog and were interested in *${firstProduct || 'our compounds'}*. 🧪

Do you have any research questions regarding reconstitution, dosages, or express shipping in Costa Rica?

You can return to our catalog at catalog.peptidescostarica.net/catalog or reply directly here to coordinate via WhatsApp. Use coupon *COSTA10* for 10% off!`;
      }
    } else {
      if (isEs) {
        return `¡Hola! 👋

Vimos que estuviste consultando información sobre *${viewedProducts}* en nuestro catálogo catalog.peptidescostarica.net/catalog. 🧪

Queríamos ponernos a tu disposición por si tienes alguna duda técnica o consulta sobre stock. Realizamos envíos rápidos a todo el país vía Correos de Costa Rica.

Puedes completar tu pedido en el catálogo o chatear directamente con nosotros por WhatsApp al +506 8404-6973. ¡Aprovecha un 10% de descuento usando el cupón **COSTA10**!

Quedamos a tu entera disposición,

Soporte - Peptides Costa Rica`;
      } else {
        return `Hi there! 👋

We noticed you were browsing *${viewedProducts}* in our research catalog at catalog.peptidescostarica.net/catalog. 🧪

We wanted to reach out in case you have any technical questions or stock inquiries. We offer certified purity >99% and fast shipping across Costa Rica.

You can complete your purchase directly on our site or chat with us on WhatsApp at +506 8404-6973. Use coupon **COSTA10** for a 10% discount on your order!

Best regards,

Support - Peptides Costa Rica`;
      }
    }
  };

  const handleGenerateIndividualAi = async (lead) => {
    if (!lead || !lead.contact_value) return;
    setGeneratingIndividualAi(true);
    setIndividualAiText('');
    setIsLocalAiDraft(false);

    let cleanPhoneOrEmail = lead.contact_value;
    let location = [lead.city, lead.region, lead.country].filter(Boolean).join(', ') || 'Unknown';
    let langLabel = lead.language === 'es' ? 'Spanish' : 'English';
    let viewedProducts = 'our scientific peptide catalog';

    try {
      const views = productViews.filter(v => v.contact_value === lead.contact_value);
      viewedProducts = views.map(v => v.product_name).join(', ') || 'our scientific peptide catalog';

      const prompt = `You are a professional, warm product specialist advisor at Peptides Costa Rica.
Draft a very short, sweet, and highly converting outbound outreach message to a prospect who browsed our site but hasn't completed checkout yet.

Prospect Details:
- Contact Method: ${lead.contact_method} (${cleanPhoneOrEmail})
- Preferred Language: ${langLabel}
- Catalog Browsing History: Viewed products: [${viewedProducts}]

Core Rules:
1. Keep the message extremely short and simple (MAX 3-4 sentences total). No verbose fluff.
2. Direct them to return to the catalog at catalog.peptidescostarica.net/catalog or chat with us on WhatsApp at +506 8404-6973.
3. Offer a 10% coupon code: COSTA10 to finalize their purchase.
4. Keep the tone warm, consultative, and supportive.
5. Write the response ENTIRELY in ${langLabel}. Do NOT write subject lines, placeholders, or preambles. Just output the final outreach text.`;

      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          prompt
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsLocalAiDraft(false);
        setIndividualAiText(data.text);
      } else {
        console.warn("Gemini API returned error. Triggering local backup engine.");
        setIsLocalAiDraft(true);
        const fallback = generateLocalFallbackDraft(lead, viewedProducts, location);
        setIndividualAiText(fallback);
      }
    } catch (err) {
      console.error("Gemini API call failed, generating local draft:", err);
      setIsLocalAiDraft(true);
      const fallback = generateLocalFallbackDraft(lead, viewedProducts, location);
      setIndividualAiText(fallback);
    } finally {
      setGeneratingIndividualAi(false);
    }
  };

  // RBAC Profile State
  const [adminProfile, setAdminProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const fetchAdminProfile = async (userId, { showLoading = false, force = false } = {}) => {
    if (!isSupabaseConfigured || !supabase) return;
    if (!force && loadedProfileUserIdRef.current === userId) return;

    if (showLoading) setProfileLoading(true);
    try {
      const { data, error } = await supabase.from('admin_profiles').select('*').eq('user_id', userId).single();
      if (!error && data) {
        setAdminProfile(data);
        loadedProfileUserIdRef.current = userId;
      }
    } catch (e) {
      console.error('Failed to load admin profile', e);
    } finally {
      if (showLoading) setProfileLoading(false);
    }
  };

  const hasAccess = (tabId) => {
    if (profileLoading || !adminProfile) return false;
    return resolveTabAccess(tabId, adminProfile);
  };

  const isStaffAgent = adminProfile && !adminProfile.is_superadmin;
  const isSubUserProfile = isSubUser(adminProfile);
  const adminPermissionKey = Array.isArray(adminProfile?.permissions)
    ? adminProfile.permissions.join('|')
    : '';

  const visibleOrders = useMemo(
    () => filterOrdersVisibleToAgent(orders, adminProfile),
    [orders, adminProfile]
  );

  const canNavigateToTab = useCallback((tabId) => {
    if (!ADMIN_TAB_IDS.has(tabId)) return false;
    let targetTab = tabId;
    if (tabId === 'facebook') targetTab = 'messenger';
    if (profileLoading || !adminProfile) return false;
    return resolveTabAccess(targetTab, adminProfile);
  }, [adminProfile, profileLoading]);

  const navigateToTab = useCallback((tabId, linkRef = null, options = {}) => {
    if (!ADMIN_TAB_IDS.has(tabId)) return;
    let targetTab = tabId;
    let nextFbView = options.fbView || null;
    if (tabId === 'facebook') {
      targetTab = 'messenger';
      nextFbView = 'alerts';
    }
    if (!canNavigateToTab(tabId)) return;
    if (tabId === 'whatsapp_ai' && linkRef) {
      const waId = String(linkRef).replace(/\D/g, '');
      if (waId) setActiveChatWaId(waId);
    }
    if (tabId === 'facebook' && linkRef) {
      setFbFilter('All');
      setFocusedFacebookNotificationId(String(linkRef));
    }
    if (targetTab === 'messenger' && nextFbView) setFbView(nextFbView);
    setActiveTab(targetTab);
    setMobileMoreOpen(false);
    const query = new URLSearchParams({ tab: targetTab });
    if (targetTab === 'messenger' && nextFbView) query.set('view', nextFbView);
    if (linkRef) query.set('ref', String(linkRef));
    router.replace(`/admin?${query.toString()}`, { scroll: false });
  }, [canNavigateToTab, router]);

  const pendingOrderCount = visibleOrders.filter((o) => (o.status || 'Pending') === 'Pending').length;
  const pendingReviewCount = reviews.filter((r) => r.status === 'Pending').length;
  const unreadFacebookCount = facebookNotifications.filter((n) => n.status === 'unread').length;
  const makeAdminTabMeta = (iconSize = 14) => ({
    home: {
      label: isStaffAgent ? 'Today' : 'Home',
      icon: <LayoutDashboard size={iconSize} />,
    },
    my_earnings: {
      label: 'Earnings',
      icon: <Wallet size={iconSize} />,
    },
    spreadsheet: {
      label: 'Products',
      icon: <Table size={iconSize} />,
    },
    orders: {
      label: 'Orders',
      icon: <ClipboardList size={iconSize} />,
      badge: pendingOrderCount,
      badgeTone: 'danger',
    },
    customers: {
      label: 'Customers',
      icon: <Users size={iconSize} />,
    },
    inquiries: {
      label: 'Inquiries',
      icon: <Inbox size={iconSize} />,
      badge: inquiryCount,
    },
    live_chat: {
      label: 'Live Chat',
      icon: <MessageCircle size={iconSize} />,
      badge: liveChatUnreadCount,
      badgeTone: 'info',
    },
    leads: {
      label: 'Leads',
      icon: <Target size={iconSize} />,
      badge: leads.length,
      badgeTone: 'success',
    },
    prospects: {
      label: 'Prospector',
      icon: <MapPinned size={iconSize} />,
    },
    carts: {
      label: 'Carts',
      icon: <ShoppingCart size={iconSize} />,
      badge: abandonedCarts.length,
      badgeTone: 'warning',
    },
    share: {
      label: 'Campaign Links',
      icon: <Link2 size={iconSize} />,
    },
    reviews: {
      label: 'Reviews',
      icon: <Star size={iconSize} />,
      badge: pendingReviewCount,
      badgeTone: 'info',
    },
    messenger: {
      label: 'Facebook Inbox',
      icon: <FacebookIcon size={iconSize} style={{ color: activeTab === 'messenger' ? 'inherit' : '#1877f2' }} />,
      badge: unreadFacebookCount,
      badgeTone: 'info',
    },
    marketing: {
      label: 'Marketing Studio',
      icon: <Mail size={iconSize} />,
    },
    affiliates: {
      label: 'Affiliates',
      icon: <UserPlus size={iconSize} />,
    },
    deals: {
      label: 'Deal of the Week',
      icon: <Zap size={iconSize} />,
    },
    my_qr: {
      label: 'My QR & Scans',
      icon: <QrCode size={iconSize} />,
    },
    my_team: {
      label: adminProfile?.is_superadmin ? 'Sub-Users' : 'My Team',
      icon: <Users size={iconSize} />,
    },
    broadcasts: {
      label: 'Announcements',
      icon: <Megaphone size={iconSize} />,
    },
    analytics: {
      label: 'Analytics',
      icon: <BarChart2 size={iconSize} />,
    },
    cms: {
      label: 'CMS',
      icon: <FileText size={iconSize} />,
    },
    whatsapp_ai: {
      label: 'Sales WhatsApp',
      icon: <MessageSquare size={iconSize} style={{ color: activeTab === 'whatsapp_ai' ? 'inherit' : '#10b981' }} />,
      badge: unreadWaCount,
    },
    wa_session: {
      label: 'WhatsApp Device',
      icon: <Smartphone size={iconSize} style={{ color: activeTab === 'wa_session' ? 'inherit' : '#34d399' }} />,
    },
    team: {
      label: 'Team',
      icon: <Shield size={iconSize} />,
    },
    team_chat: {
      label: 'Team Chat',
      icon: <MessageCircle size={iconSize} />,
      badge: unreadTeamMsgCount,
    },
  });

  const desktopTabMeta = makeAdminTabMeta(14);
  const baseMobileTabMeta = makeAdminTabMeta(18);
  const mobileTabMeta = {
    ...baseMobileTabMeta,
    whatsapp_ai: { ...baseMobileTabMeta.whatsapp_ai, label: 'WhatsApp' },
    wa_session: { ...baseMobileTabMeta.wa_session, label: 'Device' },
    my_qr: { ...baseMobileTabMeta.my_qr, label: 'My Link' },
    team_chat: { ...baseMobileTabMeta.team_chat, label: 'Team' },
  };
  const desktopPrimaryTabIds = (
    isSubUserProfile
      ? ['my_earnings', 'my_qr', 'team_chat']
      : ['home', 'orders', 'live_chat', 'leads', 'carts', 'spreadsheet']
  ).filter((tabId) => hasAccess(tabId));
  const desktopSecondaryGroups = [
    { title: 'Customer Work', tabs: ['live_chat', 'inquiries', 'leads', 'prospects', 'messenger'] },
    { title: 'Marketing', tabs: ['share', 'reviews', 'marketing', 'affiliates', 'deals', 'broadcasts', 'my_qr', 'my_team'] },
    { title: 'Admin Tools', tabs: ['analytics', 'cms', 'wa_session', 'team', 'team_chat'] },
  ].map((group) => ({
    ...group,
    tabs: group.tabs.filter((tabId) => hasAccess(tabId) && !desktopPrimaryTabIds.includes(tabId)),
  })).filter((group) => group.tabs.length > 0);
  const mobilePrimaryTabIds = (
    isSubUserProfile
      ? ['my_earnings', 'my_qr', 'team_chat']
      : adminProfile?.is_superadmin
        ? ['home', 'orders', 'whatsapp_ai', 'spreadsheet']
        : ['orders', 'whatsapp_ai', 'carts', 'customers', 'leads', 'team_chat', 'home']
  ).filter((tabId) => hasAccess(tabId)).slice(0, 4);

  const badgeClassForTone = (tone) => {
    if (tone === 'danger') return 'badge-danger';
    if (tone === 'warning') return 'badge-warning';
    if (tone === 'success') return 'badge-success';
    if (tone === 'info') return 'badge-info';
    return '';
  };

  const renderDesktopNavButton = (tabId) => {
    const meta = desktopTabMeta[tabId];
    if (!meta) return null;
    return (
      <button
        key={tabId}
        className={`admin-tab-btn ${activeTab === tabId ? 'active' : ''}`}
        onClick={() => navigateToTab(tabId)}
      >
        {meta.icon}
        <span className="tab-label">{meta.label}</span>
        {meta.badge > 0 && (
          <span className={`tab-count ${badgeClassForTone(meta.badgeTone)}`}>
            {meta.badge}
          </span>
        )}
      </button>
    );
  };

  const renderMobileQuickTab = (tabId) => {
    const meta = mobileTabMeta[tabId];
    if (!meta) return null;
    return (
      <button
        key={tabId}
        type="button"
        className={`admin-quick-nav-btn${activeTab === tabId ? ' active' : ''}`}
        onClick={() => navigateToTab(tabId)}
      >
        <span className="admin-quick-nav-icon">
          {meta.icon}
          {meta.badge > 0 && (
            <span className={`admin-quick-nav-badge${meta.badgeTone ? ` ${meta.badgeTone}` : ''}`}>
              {meta.badge > 99 ? '99+' : meta.badge}
            </span>
          )}
        </span>
        <span className="admin-quick-nav-label">{meta.label}</span>
      </button>
    );
  };

  const openCustomerProfileHandoff = useCallback((contact = {}) => {
    const lookupValue = contact.search || contact.customer_email || contact.user_email || contact.email || contact.customer_phone || contact.user_phone || contact.phone || contact.contact_value || contact.customer_name || contact.name || '';
    if (lookupValue) {
      try {
        localStorage.setItem('admin_customer_search', String(lookupValue).replace(/^\+/, ''));
      } catch (err) {
        console.warn('Could not persist customer handoff search:', err);
      }
    }
    navigateToTab('customers');
  }, [navigateToTab]);

  useEffect(() => {
    if (activeTab !== 'messenger' || fbView !== 'alerts' || !focusedFacebookNotificationId) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(`facebook-notification-${focusedFacebookNotificationId}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, fbView, facebookNotifications, focusedFacebookNotificationId]);

  useEffect(() => {
    if (!mounted) return;
    const frame = requestAnimationFrame(() => {
      try {
        const activeBtn = document.querySelector('.admin-tab-btn.active');
        activeBtn?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
      } catch (err) {
        console.warn('Admin tab scroll skipped:', err);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, mounted]);

  useEffect(() => {
    if (!activeTab) return undefined;
    const cls = `admin-tab-${activeTab}`;
    document.body.classList.add(cls);
    return () => document.body.classList.remove(cls);
  }, [activeTab]);

  // Resolve ?tab= from URL once admin profile is loaded
  useEffect(() => {
    if (!mounted || !adminProfile || profileLoading) return;

    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    const viewParam = params.get('view');
    const linkRef = params.get('ref');
    let targetTab = tabParam && ADMIN_TAB_IDS.has(tabParam) ? tabParam : getDefaultTab(adminProfile);
    let targetFbView = ['inbox', 'posts', 'alerts'].includes(viewParam) ? viewParam : null;

    if (targetTab === 'facebook') {
      targetTab = 'messenger';
      targetFbView = 'alerts';
    }

    if (!resolveTabAccess(targetTab, adminProfile)) {
      targetTab = getDefaultTab(adminProfile);
    }

    setActiveTab(targetTab);
    if (targetTab === 'messenger') setFbView(targetFbView || 'inbox');
    if (targetTab === 'whatsapp_ai' && linkRef) setActiveChatWaId(String(linkRef).replace(/\D/g, ''));
    if (targetTab === 'messenger' && (targetFbView === 'alerts' || tabParam === 'facebook') && linkRef) {
      setFbFilter('All');
      setFocusedFacebookNotificationId(linkRef);
    }

    if (tabParam !== targetTab || (targetTab === 'messenger' && targetFbView && viewParam !== targetFbView)) {
      const query = new URLSearchParams({ tab: targetTab });
      if (targetTab === 'messenger' && targetFbView) query.set('view', targetFbView);
      if (linkRef) query.set('ref', linkRef);
      router.replace(`/admin?${query.toString()}`, { scroll: false });
    }
  }, [mounted, adminProfile, profileLoading, router]);

  // Support browser back/forward for tab changes
  useEffect(() => {
    if (!adminProfile || profileLoading) return;

    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const viewParam = params.get('view');
      if (tabParam && ADMIN_TAB_IDS.has(tabParam)) {
        const targetTab = tabParam === 'facebook' ? 'messenger' : tabParam;
        if (resolveTabAccess(targetTab, adminProfile)) {
          setActiveTab(targetTab);
          if (targetTab === 'messenger') {
            setFbView(tabParam === 'facebook' ? 'alerts' : (['inbox', 'posts', 'alerts'].includes(viewParam) ? viewParam : 'inbox'));
          }
        }
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [adminProfile, profileLoading]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (isSubUserProfile) return;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setGlobalSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAuthenticated, isSubUserProfile]);

  useEffect(() => {
    if (!mounted) return;
    const savedSidebarPreference = localStorage.getItem('admin_sidebar_auto_hide');
    setSidebarCollapsed(savedSidebarPreference === null ? true : savedSidebarPreference === 'true');
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('admin_sidebar_auto_hide', sidebarCollapsed ? 'true' : 'false');
  }, [mounted, sidebarCollapsed]);

  const handleGlobalSearchSelect = (result) => {
    if (result.type === 'order') {
      setSelectedOrderDetails(result.payload);
      navigateToTab('orders');
    } else if (result.type === 'product') {
      setProductSearch(''); // Clear inline search to avoid hiding the highlighted row
      setHighlightedProductId(result.payload.id);
      navigateToTab('spreadsheet');
      setTimeout(() => {
        const el = document.getElementById(`product-row-${result.payload.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    } else if (result.type === 'lead') {
      navigateToTab('leads');
    } else if (result.type === 'customer') {
      navigateToTab('customers');
    } else if (result.type === 'tab' && result.payload?.tab) {
      navigateToTab(result.payload.tab);
    }
  };

  const handleOrderUpdated = (updated) => {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    // Only refresh the open detail panel — don't auto-open it on list status changes
    setSelectedOrderDetails((prev) => (prev?.id === updated.id ? updated : prev));
  };

  const handleManualOrderCreated = (order) => {
    setOrders((prev) => [order, ...prev]);
    setSelectedOrderDetails(order);
    setNotifRefreshKey((k) => k + 1);
    navigateToTab('orders');
  };

  // Auth session — bootstrap once per login, not on every token refresh
  useEffect(() => {
    setMounted(true);
    const savedEmail = localStorage.getItem('admin_email') || 'info@peptidescostarica.net';
    loggedInEmail.current = savedEmail;

    if (!isSupabaseConfigured || !supabase) {
      console.log('Supabase not fully configured. Running in Local Simulation Mode.');
      return;
    }

    const bootstrapAdminSession = (session) => {
      if (!session?.user?.id) return;
      loggedInEmail.current = session.user.email || loggedInEmail.current;
      setIsAuthenticated(true);

      const userId = session.user.id;
      const isFirstLoadForUser = loadedProfileUserIdRef.current !== userId;
      if (isFirstLoadForUser) {
        fetchAdminProfile(userId, { showLoading: true });
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        if (session) setIsAuthenticated(true);
        return;
      }

      if (session) {
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
          bootstrapAdminSession(session);
        }
        return;
      }

      setIsAuthenticated(false);
      setAdminProfile(null);
      loadedProfileUserIdRef.current = null;
      setProfileLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch live exchange rate
  useEffect(() => {
    const fetchRate = async () => {
      try {
        const res = await fetch('/api/exchange-rate');
        const data = await res.json();
        if (data.rate) {
          const rate = data.rate;
          const now = data.updatedAt ? Date.parse(data.updatedAt) : Date.now();
          setExchangeRate(rate);
          setExchangeRateUpdatedAt(now);
          localStorage.setItem('exchangeRate_USDCRC', rate.toString());
          localStorage.setItem('exchangeRate_USDCRC_time', now.toString());
        }
      } catch (err) {
        console.error('Admin: Live exchange rate fetch failed:', err);
        const cached = localStorage.getItem('exchangeRate_USDCRC');
        const cachedTime = localStorage.getItem('exchangeRate_USDCRC_time');
        if (cached && cachedTime) {
          setExchangeRate(parseFloat(cached));
          setExchangeRateUpdatedAt(parseInt(cachedTime, 10));
        } else {
          setExchangeRateUpdatedAt(Date.now());
        }
      }
    };
    fetchRate();
  }, []);

  // Supabase Realtime subscription for live sync across all tables
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !isAuthenticated) return;
    if (isSubUserProfile) return;

    const channel = supabase
      .channel('admin-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'abandoned_carts' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_reviews' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_leads' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'facebook_notifications' }, (payload) => {
        if (!resolveTabAccess('facebook', adminProfile)) {
          loadAdminData();
          return;
        }

        // Trigger live audio alert
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-600.wav');
          audio.volume = 0.5;
          audio.play();
        } catch (audioErr) {
          console.warn('Audio play blocked or failed:', audioErr);
        }
        
        // Show real-time alert toast
        const item = payload.new;
        setToastMessage(`New Facebook ${item.type || 'Alert'} from ${item.sender_name || 'Visitor'}!`);
        setTimeout(() => setToastMessage(''), 6000);
        
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'facebook_notifications' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inquiries' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_messages' }, () => {
        loadAdminData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, adminProfile, isSubUserProfile]);

  useEffect(() => {
    if (!isAuthenticated || profileLoading || !adminProfile) return undefined;
    if (!resolveTabAccess('live_chat', adminProfile)) {
      setLiveChatUnreadCount(0);
      return undefined;
    }

    let cancelled = false;
    let channel = null;

    const refreshLiveChatCount = async () => {
      try {
        const res = await adminFetch('/api/admin/live-chat/unread', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setLiveChatUnreadCount(0);
          return;
        }
        if (!cancelled) setLiveChatUnreadCount(data.unreadCount || 0);
      } catch {
        if (!cancelled) setLiveChatUnreadCount(0);
      }
    };

    refreshLiveChatCount();
    
    if (isSupabaseConfigured && supabase) {
      channel = supabase
        .channel('admin-live-chat-unread')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'live_chat_conversations' }, () => {
          refreshLiveChatCount();
        })
        .subscribe();
    }

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [isAuthenticated, profileLoading, adminProfile, adminPermissionKey]);

  // Fetch list of files/images in the Supabase product-pics storage bucket
  const fetchBucketImages = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    setLoadingBucketImages(true);
    try {
      const { data, error } = await supabase.storage
        .from('product-pics')
        .list('', {
          limit: 100,
          sortBy: { column: 'name', order: 'asc' }
        });
      if (error) throw error;
      if (data) {
        // Map list results to public URLs, filter out placeholder folder entries
        const images = data
          .filter(file => file.name !== '.emptyFolderPlaceholder')
          .map(file => {
            const { data: { publicUrl } } = supabase.storage
              .from('product-pics')
              .getPublicUrl(file.name);
            return {
              name: file.name,
              url: publicUrl
            };
          });
        setBucketImages(images);
      }
    } catch (err) {
      console.error("Failed to list bucket images from Supabase storage:", err);
    } finally {
      setLoadingBucketImages(false);
    }
  };

  // Fetch active sales agents from admin_profiles
  const fetchAgents = async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: agentData, error: agentError } = await supabase
          .from('admin_profiles')
          .select('name, email')
          .order('name', { ascending: true });
        
        if (!agentError && agentData) {
          const loadedAgents = agentData.map(a => a.name || a.email).filter(Boolean);
          setAgents(loadedAgents.length > 0 ? loadedAgents : ['Joe', 'info@peptidescostarica.net']);
          setAgentProfiles(agentData);
        } else {
          setAgents(['Joe', 'info@peptidescostarica.net']);
        }
      } catch (err) {
        console.error("Failed to load agents:", err);
        setAgents(['Joe', 'info@peptidescostarica.net']);
      }
    } else {
      setAgents(['Joe', 'info@peptidescostarica.net']);
    }
  };

  const fetchOrderAffiliates = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setOrderAffiliates([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('affiliates')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setOrderAffiliates(data || []);
    } catch (err) {
      console.error('Failed to load affiliates for order attribution:', err);
      setOrderAffiliates([]);
    }
  };

  // Fetch admin products and orders
  const loadAdminData = async () => {
    if (adminProfile && isSubUser(adminProfile)) {
      setLoadingProducts(false);
      setLoadingOrders(false);
      setLoadingAbandonedCarts(false);
      setLoadingReviews(false);
      setLoadingLeads(false);
      setLoadingBlogs(false);
      setLoadingSettings(false);
      setLoadingFbNotifications(false);
      setLoadingWhatsappMessages(false);
      setProducts([]);
      setOrders([]);
      setAbandonedCarts([]);
      setReviews([]);
      setLeads([]);
      setBlogs([]);
      setProductViews([]);
      setFacebookNotifications([]);
      setWhatsappMessages([]);
      setWhatsappConversations([]);
      setWhatsappAgents([]);
      return;
    }

    // Helper to bypass Supabase 1000 row limit
    const fetchAllRows = async (table, orderCol, ascending = false, matchEq = null) => {
      let allData = [];
      let from = 0;
      const step = 1000;
      while (true) {
        let q = supabase.from(table).select('*').order(orderCol, { ascending }).range(from, from + step - 1);
        if (matchEq) q = q.eq(matchEq.col, matchEq.val);
        const { data, error } = await q;
        if (error) { console.error(`Error fetching ${table}:`, error); break; }
        if (!data || data.length === 0) break;
        allData = [...allData, ...data];
        if (data.length < step) break;
        from += step;
      }
      return allData;
    };

    setLoadingProducts(true);
    setLoadingOrders(true);
    let loadedProducts = [];
    let loadedOrders = [];

    // Fetch bucket images
    fetchBucketImages();

    // Fetch agents
    fetchAgents();
    fetchOrderAffiliates();

    // 1. Fetch Products
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('priority', { ascending: true });

        if (error) {
          console.error("❌ SUPABASE ADMIN PRODUCTS SELECT ERROR:", error);
          setIsDbConnected(false);
        } else {
          console.log("✅ SUPABASE ADMIN PRODUCTS LOADED:", data?.length, "rows");
        }

        if (!error && data) {
          // Load which products are currently hidden from the public catalog
          let hiddenNames = [];
          try {
            const { data: hp } = await supabase.from('site_settings').select('value').eq('id', 'hidden_products').maybeSingle();
            if (Array.isArray(hp?.value?.names)) hiddenNames = hp.value.names;
          } catch (hpErr) {
            console.warn('Could not load hidden products list:', hpErr);
          }
          setHiddenProductNames(hiddenNames);

          loadedProducts = data.map(item => ({
            id: item.id,
            product: item.product || '',
            category: item.category || '',
            priceUsd: item.price_usd || '',
            priceCrc: item.price_crc || '',
            originalPriceUsd: String(item.original_price_usd || '').trim(),
            originalPriceCrc: String(item.original_price_crc || '').trim(),
            discount: item.discount || '',
            saleStartTime: isoToCrWall(item.sale_start_time),
            saleEndTime: isoToCrWall(item.sale_end_time),
            status: item.status || 'In Stock',
            coa: item.coa || '',
            imageUrl: item.image_url || '',
            descriptionEn: item.description_en || '',
            descriptionEs: item.description_es || '',
            inventoryCount: item.inventory_count !== undefined ? item.inventory_count : null,
            lowStockThreshold: item.low_stock_threshold !== undefined ? item.low_stock_threshold : 5,
            priority: item.priority || 0,
            hidden: hiddenNames.includes(item.product)
          }));
          setIsDbConnected(true);
        }
      } catch (err) {
        console.error("Failed to load products from database:", err);
        setIsDbConnected(false);
      }
    }

    // Fallback to local CSV products if database is empty or not configured
    if (loadedProducts.length === 0) {
      try {
        const response = await fetch('/master_sheet.csv');
        const csvText = await response.text();
        
        Papa.parse(csvText, {
          header: false,
          skipEmptyLines: true,
          complete: (results) => {
            const lines = results.data;
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

                  const usdNum = parseFloat((p.priceUsd || '').replace(/[^0-9.]/g, '')) || 0;
                  const calculatedCrc = Math.round(usdNum * exchangeRate);

                  return {
                    id: `local-${idx}`,
                    product: p.product || '',
                    category: p.category || '',
                    priceUsd: p.priceUsd || '',
                    priceCrc: calculatedCrc > 0 ? `₡${calculatedCrc.toLocaleString('en-US')}` : '',
                    originalPriceUsd: '',
                    originalPriceCrc: '',
                    discount: p.bulkDiscountEs || p.bulkDiscountEn || '',
                    status: p.status || 'In Stock',
                    coa: p.coa || '',
                    imageUrl: p.imageUrl || '',
                    descriptionEn: '',
                    descriptionEs: '',
                    priority: idx
                  };
                });

              setProducts(parsed);
            }
          }
        });
      } catch (err) {
        console.error("Local CSV load error:", err);
      }
    } else {
      setProducts(loadedProducts);
    }
    setLoadingProducts(false);

    // 2. Fetch Orders
    if (isSupabaseConfigured && supabase) {
      try {
        const data = await fetchAllRows('orders', 'created_at', false);

        if (data) {
          loadedOrders = data;
          setOrders(data);
        }
      } catch (err) {
        console.error("Failed to load orders from database:", err);
      }
    }
    setLoadingOrders(false);

    // 3. Fetch Abandoned Carts
    setLoadingAbandonedCarts(true);
    if (isSupabaseConfigured && supabase) {
      try {
        const data = await fetchAllRows('abandoned_carts', 'last_updated', false, { col: 'status', val: 'active' });

        if (data) {
          const withItems = data.filter((c) => cartHasItems(c.cart_data));
          const cartsWithPaidOrders = withItems.filter((c) => getAbandonedCartConversion(c, loadedOrders, { ignoreTiming: true }).converted);
          const recoverableCarts = withItems.filter((c) => !getAbandonedCartConversion(c, loadedOrders, { ignoreTiming: true }).converted);
          const emptySessionIds = data
            .filter((c) => !cartHasItems(c.cart_data))
            .map((c) => c.session_id);

          setAbandonedCarts(recoverableCarts);

          if (emptySessionIds.length > 0) {
            supabase
              .from('abandoned_carts')
              .delete()
              .in('session_id', emptySessionIds)
              .then(({ error }) => {
                if (error) console.warn('Empty abandoned cart cleanup failed:', error.message);
              });
          }
          if (cartsWithPaidOrders.length > 0) {
            markAbandonedCartsConverted(supabase, cartsWithPaidOrders.map((c) => c.session_id))
              .then(({ error }) => {
                if (error) console.warn('Paid abandoned cart cleanup failed:', error.message);
              });
          }
        }
      } catch (err) {
        console.error("Failed to load abandoned carts:", err);
      }
    }
    setLoadingAbandonedCarts(false);

    // 4. Fetch Reviews
    setLoadingReviews(true);
    if (isSupabaseConfigured && supabase) {
      try {
        const data = await fetchAllRows('product_reviews', 'created_at', false);

        if (data) {
          setReviews(data);
        }
      } catch (err) {
        console.error("Failed to load reviews:", err);
      }
    }
    setLoadingReviews(false);

    // 5. Fetch Leads
    setLoadingLeads(true);
    if (isSupabaseConfigured && supabase) {
      try {
        const data = await fetchAllRows('catalog_leads', 'created_at', false);

        if (data) {
          // Enrich leads with local storage fallbacks if status/notes are absent or null
          const enriched = data.map(l => ({
            ...l,
            status: l.status !== undefined ? (l.status || 'New') : (localStorage.getItem(`lead_status_${l.id}`) || 'New'),
            notes: l.notes !== undefined ? (l.notes || '') : (localStorage.getItem(`lead_notes_${l.id}`) || '')
          }));
          setLeads(enriched);
        }
      } catch (err) {
        console.error("Failed to load leads:", err);
      }
    }
    setLoadingLeads(false);

    if (isAuthenticated) {
      try {
        const res = await adminFetch('/api/admin/inquiries');
        if (res.ok) {
          const d = await res.json();
          setInquiryCount((d.inquiries || []).filter((i) => (i.status || '').toLowerCase() === 'new').length);
        }
      } catch {
        // inquiries API requires auth
      }
      
      if (isSupabaseConfigured && supabase && adminProfile?.email) {
        try {
          const { data, error } = await supabase
            .from('team_messages')
            .select('id')
            .eq('recipient_email', adminProfile.email)
            .eq('is_read', false);
          
          if (!error && data) {
            setUnreadTeamMsgCount(data.length);
          }
        } catch (err) {
          console.error("Failed to fetch unread team messages:", err);
        }
      }
    }

    // 5. Fetch Blogs
    setLoadingBlogs(true);
    if (isSupabaseConfigured && supabase) {
      try {
        const data = await fetchAllRows('blogs', 'created_at', false);
        if (data) setBlogs(data);
      } catch (err) { console.error("Failed to load blogs:", err); }
    }
    setLoadingBlogs(false);

    // 6. Fetch Site Settings
    setLoadingSettings(true);
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.from('site_settings').select('*').eq('id', 'landing_page').single();
        if (!error && data) {
           setSiteSettings(mergeLandingPageSettings(data.value));
        } else {
           setSiteSettings(DEFAULT_LANDING_PAGE_SETTINGS);
        }
      } catch (err) { console.error("Failed to load settings:", err); }

      // Fetch WhatsApp Settings as well
      try {
        const { data: waData, error: waError } = await supabase.from('site_settings').select('*').eq('id', 'whatsapp_settings').limit(1).maybeSingle();
        if (!waError && waData) {
          setWhatsappSettings(waData.value);
        }
      } catch (err) {
        console.error("Failed to load whatsapp settings:", err);
      }

      // Fetch Business Links Settings
      try {
        const { data: linkData, error: linkError } = await supabase.from('site_settings').select('*').eq('id', 'business_links').limit(1).maybeSingle();
        if (!linkError && linkData) {
          setBusinessLinks(normalizeBusinessLinks(linkData.value));
        } else {
          setBusinessLinks(DEFAULT_ADMIN_BUSINESS_LINKS);
        }
      } catch (err) {
        console.error("Failed to load business links:", err);
      }

      try {
        const { data: pageRows, error: pageError } = await supabase
          .from('site_settings')
          .select('id, value')
          .in('id', PUBLIC_PAGE_SETTING_IDS);
        if (!pageError) {
          const records = Object.fromEntries((pageRows || []).map((row) => [row.id, row.value]));
          setPublicPageSettings(mergeAllPublicPageSettings(records));
        } else {
          setPublicPageSettings(mergeAllPublicPageSettings());
        }
      } catch (err) {
        console.error("Failed to load public page settings:", err);
        setPublicPageSettings(mergeAllPublicPageSettings());
      }
    }
    setLoadingSettings(false);

    // 7. Fetch Product Views
    if (isSupabaseConfigured && supabase) {
      try {
        const data = await fetchAllRows('product_views', 'created_at', false);
        if (data) setProductViews(data);
      } catch (err) { console.error("Failed to load product views:", err); }
    }

    // 8. Fetch Facebook Notifications
    setLoadingFbNotifications(true);
    if (!resolveTabAccess('facebook', adminProfile)) {
      setFacebookNotifications([]);
    } else if (isSupabaseConfigured && supabase) {
      try {
        const data = await fetchAllRows('facebook_notifications', 'created_at', false);
        if (data) {
          setFacebookNotifications(data);
        }
      } catch (err) {
        console.error("Failed to load facebook notifications:", err);
      }
    }
    setLoadingFbNotifications(false);

    // 9. Fetch WhatsApp conversations and visible message log through the
    // admin API so assignment filtering is enforced server-side.
    setLoadingWhatsappMessages(true);
    const canLoadSalesWhatsApp = resolveTabAccess('whatsapp_ai', adminProfile);
    const canLoadWhatsAppDevice = resolveTabAccess('wa_session', adminProfile);
    if (isSupabaseConfigured && (canLoadSalesWhatsApp || canLoadWhatsAppDevice)) {
      try {
        const sourceQuery = !canLoadSalesWhatsApp && canLoadWhatsAppDevice
          ? '?source=baileys_session'
          : '';
        const res = await adminFetch(`/api/admin/whatsapp-conversations${sourceQuery}`);
        const data = await res.json();
        if (!res.ok) {
          const err = new Error(data.error || 'Could not load WhatsApp conversations');
          err.routingAvailable = data.available !== false;
          throw err;
        }
        setWhatsappConversationRoutingAvailable(data.available !== false);
        setWhatsappConversationLoadError(data.available === false
          ? (data.error || 'WhatsApp conversation routing table is not installed yet.')
          : '');
        setWhatsappConversations(data.conversations || []);
        setWhatsappMessages(data.messages || []);
        setWhatsappAgents(data.agents || []);
      } catch (err) {
        console.error("Failed to load WhatsApp conversations:", err);
        setWhatsappConversationRoutingAvailable(err.routingAvailable !== false);
        setWhatsappConversationLoadError(err.message || 'Could not load WhatsApp conversations.');
        setWhatsappConversations([]);
        setWhatsappMessages([]);
        setWhatsappAgents([]);
      }
    } else {
      setWhatsappConversationRoutingAvailable(false);
      setWhatsappConversationLoadError('');
      setWhatsappConversations([]);
      setWhatsappMessages([]);
      setWhatsappAgents([]);
    }
    setLoadingWhatsappMessages(false);
  };

  useEffect(() => {
    if (!isAuthenticated || profileLoading || !adminProfile) return;
    loadAdminData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isAuthenticated,
    profileLoading,
    adminProfile?.user_id,
    adminProfile?.is_superadmin,
    adminPermissionKey,
  ]);

  // Silent background refresh for the WhatsApp inbox only. Nothing else on the
  // dashboard polls, so an inbox left open used to show stale threads until the
  // agent pressed F5 while phone notifications kept arriving. This deliberately
  // does NOT touch loadingWhatsappMessages, so the list never flashes a loader
  // and the open conversation stays put.
  const refreshingWhatsappRef = React.useRef(false);

  const refreshWhatsappInbox = useCallback(async () => {
    if (refreshingWhatsappRef.current) return; // a slow refresh must not stack
    const canLoadSalesWhatsApp = resolveTabAccess('whatsapp_ai', adminProfile);
    const canLoadWhatsAppDevice = resolveTabAccess('wa_session', adminProfile);
    if (!isSupabaseConfigured || (!canLoadSalesWhatsApp && !canLoadWhatsAppDevice)) return;

    refreshingWhatsappRef.current = true;
    try {
      const sourceQuery = !canLoadSalesWhatsApp && canLoadWhatsAppDevice
        ? '?source=baileys_session'
        : '';
      const res = await adminFetch(`/api/admin/whatsapp-conversations${sourceQuery}`);
      const data = await res.json();
      if (!res.ok || data.available === false) return; // keep what is on screen
      setWhatsappConversations(data.conversations || []);
      setWhatsappMessages(data.messages || []);
      setWhatsappAgents(data.agents || []);
    } catch (err) {
      // A failed background poll must stay invisible; the next tick retries.
      console.warn('WhatsApp inbox auto-refresh failed:', err.message);
    } finally {
      refreshingWhatsappRef.current = false;
    }
  }, [adminProfile]);

  useEffect(() => {
    if (!isAuthenticated || profileLoading || !adminProfile) return undefined;
    // Only poll while an inbox is actually on screen. Each refresh is a few MB,
    // so polling from other tabs or a hidden window would be pure waste.
    if (activeTab !== 'whatsapp_ai' && activeTab !== 'wa_session') return undefined;

    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refreshWhatsappInbox();
    };
    const timer = setInterval(tick, WHATSAPP_REFRESH_MS);
    // Catch up immediately when the agent comes back to the window or tab.
    const onVisible = () => { if (!document.hidden) refreshWhatsappInbox(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAuthenticated, profileLoading, adminProfile, activeTab, refreshWhatsappInbox]);

  // Auth Handlers
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    if (isSupabaseConfigured && supabase) {
      // Always try Supabase Auth — this is the single source of truth
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (!error) {
          loggedInEmail.current = email.trim();
          setIsAuthenticated(true);
          setLoginError('');
          setLoginLoading(false);
          return;
        } else {
          // Supabase rejected — don't fall through, treat as real failure
          setLoginError('Invalid email or password.');
          setLoginLoading(false);
          return;
        }
      } catch (err) {
        console.error('Supabase login error:', err);
        setLoginError('Unable to reach authentication server. Please try again.');
        setLoginLoading(false);
        return;
      }
    }

    setLoginError('Authentication is not configured. Contact your administrator.');
    setLoginLoading(false);
  };

  const handleLogout = async () => {
    loadedProfileUserIdRef.current = null;
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    router.push('/');
  };

  // Change password handler
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordStatus('');
    setPasswordLoading(true);

    // Validate new password fields
    if (newPassword.length < 6) {
      setPasswordStatus('error:Password must be at least 6 characters.');
      setPasswordLoading(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus('error:New passwords do not match.');
      setPasswordLoading(false);
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setPasswordStatus('error:Authentication is not configured.');
      setPasswordLoading(false);
      return;
    }

    try {
      // Step 1: Verify current password by signing in using the email that was used to log in
      const adminEmail = loggedInEmail.current || localStorage.getItem('admin_email') || 'info@peptidescostarica.net';
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password: currentPassword
      });

      if (signInError) {
        // Current password is wrong — show the real reason
        setPasswordStatus(`error:Current password is incorrect. (${signInError.message})`);
        setPasswordLoading(false);
        return;
      }

      // Step 2: Actually change the password in Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

      if (updateError) {
        setPasswordStatus(`error:${updateError.message}`);
        setPasswordLoading(false);
        return;
      }

      localStorage.setItem('admin_email', adminEmail);
      setPasswordStatus('success:Password updated! Please log in again with your new password.');
      setPasswordLoading(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // Sign out so user is forced to log in fresh with new password
      setTimeout(async () => {
        setPasswordStatus('');
        setShowPasswordModal(false);
        loadedProfileUserIdRef.current = null;
        await supabase.auth.signOut();
        setIsAuthenticated(false);
      }, 2500);

    } catch (err) {
      console.error('Password change error:', err);
      setPasswordStatus('error:An unexpected error occurred. Please try again.');
      setPasswordLoading(false);
    }
  };

  // Spreadsheet Cell modification helper
  const handleCellChange = (productId, fieldName, val) => {
    setProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, [fieldName]: val } : p
    ));
  };

  // Toggle a product's visibility on the public catalog.
  // Hidden products stay in the database (so they can be restocked / un-hidden later);
  // the list of hidden product names lives in site_settings 'hidden_products'.
  const handleToggleHidden = async (productId) => {
    const target = products.find(p => p.id === productId);
    if (!target) return;
    const nextHidden = !target.hidden;

    // Optimistically update the row
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, hidden: nextHidden } : p));

    // Recompute the full list of hidden product names (keyed by product name, matching how the catalog identifies products)
    const names = Array.from(new Set(
      products
        .map(p => p.id === productId ? { ...p, hidden: nextHidden } : p)
        .filter(p => p.hidden && p.product && p.product.trim())
        .map(p => p.product.trim())
    ));
    setHiddenProductNames(names);

    // Persist immediately so hiding/showing takes effect without needing "Save Changes"
    if (isSupabaseConfigured) {
      try {
        const res = await adminFetch('/api/admin/products', {
          method: 'PATCH',
          body: JSON.stringify({ hiddenNames: names }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Failed to update catalog visibility');
        setSaveStatus(nextHidden ? `Hidden "${target.product}" from catalog` : `"${target.product}" is now visible in catalog`);
      } catch (err) {
        console.error('Failed to update hidden products:', err);
        setSaveStatus('Failed to update catalog visibility. Please try again.');
        // Roll back optimistic update on failure
        setProducts(prev => prev.map(p => p.id === productId ? { ...p, hidden: target.hidden } : p));
      }
    }
  };

  // Add Product row
  const handleAddRow = () => {
    const newPriority = products.length > 0 ? Math.min(...products.map(p => Number(p.priority) || 0)) - 1 : 0;
    const newRow = {
      id: `temp-${Date.now()}`,
      product: 'New Peptide Name',
      category: 'Weight Loss & Metabolism',
      priceUsd: '$100',
      priceCrc: '₡45,448',
      originalPriceUsd: '',
      originalPriceCrc: '',
      discount: 'Buy 5+ vials, get 15% off',
      saleStartTime: '',
      saleEndTime: '',
      status: 'In Stock',
      inventoryCount: null,
      lowStockThreshold: 5,
      coa: '',
      imageUrl: '',
      priority: newPriority
    };
    setProducts([newRow, ...products]);
  };

  // Delete row
  const handleDeleteRow = (productId) => {
    setProducts(products.filter(p => p.id !== productId));
  };

  // Move row up or down
  const handleMoveRow = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= products.length) return;
    const updated = [...products];
    const [moved] = updated.splice(index, 1);
    updated.splice(newIndex, 0, moved);
    // Update priority values so the order persists on save
    const withPriority = updated.map((p, i) => ({ ...p, priority: i }));
    setProducts(withPriority);
  };

  // CSV drag uploader
  const handleCsvDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setCsvDragActive(true);
    } else if (e.type === "dragleave") {
      setCsvDragActive(false);
    }
  };

  const handleCsvDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCsvDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      parseUploadedCsv(e.dataTransfer.files[0]);
    }
  };

  const handleCsvFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      parseUploadedCsv(e.target.files[0]);
    }
  };

  const parseUploadedCsv = (file) => {
    setCsvLoading(true);
    setCsvStatus('');

    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const lines = results.data;
        const headerIndex = lines.findIndex(l => l.some(cell => cell && cell.toLowerCase().includes('product')));

        if (headerIndex === -1) {
          setCsvStatus("Could not find product header row. Please verify CSV columns.");
          setCsvLoading(false);
          return;
        }

        const headers = lines[headerIndex].map(h => h.toLowerCase().trim());
        const dataLines = lines.slice(headerIndex + 1);

        const imported = dataLines
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

            const usdNum = parseFloat((p.priceUsd || '').replace(/[^0-9.]/g, '')) || 0;
            const calculatedCrc = Math.round(usdNum * exchangeRate);

            return {
              id: `imported-${idx}-${Date.now()}`,
              product: p.product || '',
              category: p.category || '',
              priceUsd: p.priceUsd || '',
              priceCrc: p.priceCrc || (calculatedCrc > 0 ? `₡${calculatedCrc.toLocaleString('en-US')}` : ''),
              originalPriceUsd: '',
              originalPriceCrc: '',
              discount: p.bulkDiscountEs || p.bulkDiscountEn || '',
              status: p.status || 'In Stock',
              inventoryCount: null,
              lowStockThreshold: 5,
              coa: p.coa || '',
              imageUrl: p.imageUrl || '',
              priority: idx
            };
          });

        setProducts(imported);
        setCsvStatus(`Successfully loaded ${imported.length} products from CSV into grid. Click "Save Changes" to sync database.`);
        setCsvLoading(false);
      },
      error: (err) => {
        setCsvStatus(`Parsing error: ${err.message}`);
        setCsvLoading(false);
      }
    });
  };

  // Image Upload handler for cell
  const handleImageCellUpload = async (productId, e) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    // Show indicator
    handleCellChange(productId, 'imageUrl', 'Uploading...');

    if (isSupabaseConfigured && supabase) {
      // Uploaded through the server, not straight from the browser: Storage
      // rejects the public anon key with a row-level security error, which is
      // what used to surface as "check that the bucket exists and is public"
      // about a bucket that existed and was public.
      const previousUrl = products.find(p => p.id === productId)?.imageUrl || '';
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('kind', 'product');

        const response = await adminFetch('/api/admin/upload-image', { method: 'POST', body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Upload failed.');

        handleCellChange(productId, 'imageUrl', data.url);
        fetchBucketImages(); // Refresh the list of images in the background

        // Replacing a product's image deliberately leaves the old file in
        // storage. It used to be deleted here, which meant one mis-click was
        // enough to destroy an image permanently, and anything else still
        // pointing at that URL broke with it. Storage is cheap; the photo is
        // not replaceable.
        return data.url;
      } catch (err) {
        console.error("Storage upload error:", err);
        // Put back whatever was there rather than blanking the cell, so a
        // failed upload cannot quietly cost a product the image it already had.
        handleCellChange(productId, 'imageUrl', previousUrl);
        alert(`Image upload failed. ${err.message}`);
        return null;
      }
    } else {
      // Local simulation URL
      const dummyUrl = URL.createObjectURL(file);
      handleCellChange(productId, 'imageUrl', dummyUrl);
      alert("Local Simulation: Image loaded inside browser memory. To upload permanently, connect Supabase!");
      return dummyUrl;
    }
  };

  // Image Upload handler for Blog Cover
  const handleBlogImageUpload = async (e) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    // Show uploading indicator in the field
    setEditingBlog(prev => ({ ...prev, image_url: 'Uploading...' }));

    if (isSupabaseConfigured && supabase) {
      // Same server route as the product images, for the same reason.
      const previousUrl = editingBlog?.image_url || '';
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('kind', 'blog');

        const response = await adminFetch('/api/admin/upload-image', { method: 'POST', body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Upload failed.');

        setEditingBlog(prev => ({ ...prev, image_url: data.url }));
        fetchBucketImages(); // Refresh the list of images so it appears in dropdowns
      } catch (err) {
        console.error("Blog storage upload error:", err);
        setEditingBlog(prev => ({ ...prev, image_url: previousUrl }));
        alert(`Image upload failed. ${err.message}`);
      }
    } else {
      const dummyUrl = URL.createObjectURL(file);
      setEditingBlog(prev => ({ ...prev, image_url: dummyUrl }));
      alert("Local Simulation: Image loaded inside browser memory. To upload permanently, connect Supabase!");
    }
  };

  // Order status update
  const handleOrderStatusUpdate = async (orderId, newStatus) => {
    const prevOrder = orders.find((o) => o.id === orderId);
    setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    if (selectedOrderDetails?.id === orderId) {
      setSelectedOrderDetails({ ...selectedOrderDetails, status: newStatus });
    }

    let savedOrder = null;
    try {
      const res = await adminFetch('/api/admin/orders/update', {
        method: 'PATCH',
        body: JSON.stringify({
          orderId,
          updates: { status: newStatus },
          activity: {
            type: 'status_change',
            message: `Status changed to ${newStatus}`,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.order) {
        savedOrder = data.order;
        handleOrderUpdated(data.order);
      }
    } catch (err) {
      console.error('Order status update error:', err);
    }

    if (newStatus !== 'Completed' && newStatus !== 'Order Complete') return;

    // The row the server just wrote comes first. Reading the copy in browser
    // state was the weak link: a background reload can replace `orders` while
    // the PATCH is in flight, and the lookup then found nothing and dropped the
    // customer's email with no error anywhere.
    const orderForEmail = savedOrder || prevOrder || orders.find((o) => o.id === orderId);

    if (!orderForEmail) {
      alert('Status saved, but the order could not be re-read to email the customer. Reload and use "Resend" on the order.');
      return;
    }
    if (!orderForEmail.customer_email || !String(orderForEmail.customer_email).trim()) {
      // Phone-only order. Nothing to send, and not a fault worth alarming about.
      return;
    }

    // Every failure below used to be swallowed, so "no confirmation popup" and
    // "email never sent" looked identical from the outside. Now they don't.
    try {
      const res = await adminFetch('/api/order-shipped-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...orderForEmail, status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));

      if (data.success) {
        alert(`Order complete email sent to ${orderForEmail.customer_email}`);
        return;
      }
      if (data.skipped) {
        alert(`Customer email NOT sent (${data.reason || 'email sending is not configured on the server'}). The status change was saved.`);
        return;
      }
      alert(`Customer email FAILED for ${orderForEmail.customer_email}.\n\nReason: ${data.details || data.error || `server returned ${res.status}`}\n\nThe status change was saved.`);
    } catch (err) {
      console.error('Order complete email error:', err);
      alert(`Customer email FAILED for ${orderForEmail.customer_email}.\n\nReason: ${err.message}\n\nThe status change was saved.`);
    }
  };

  // Order sales agent update
  //
  // `onlyIfUnassigned` is for the agent-facing "Claim this order" button: the
  // write is conditional on the order still being unclaimed, so two agents
  // racing the same order cannot silently overwrite each other. Without it the
  // update is an unconditional overwrite (admin reassigning via the dropdown).
  // Resolves to { ok, takenBy } so the caller can tell the loser who won.
  const handleOrderSalesAgentUpdate = async (orderId, agentName, { onlyIfUnassigned = false } = {}) => {
    const finalAgentName = String(agentName || '').trim();
    const previousOrder = orders.find((o) => o.id === orderId);

    setOrders((prev) => prev.map(o => o.id === orderId ? { ...o, sales_agent: finalAgentName || null } : o));
    if (selectedOrderDetails?.id === orderId) {
      setSelectedOrderDetails({ ...selectedOrderDetails, sales_agent: finalAgentName || null });
    }

    if (!onlyIfUnassigned) {
      try {
        const response = await adminFetch('/api/admin/orders/update', {
          method: 'PATCH',
          body: JSON.stringify({
            orderId,
            updates: { sales_agent: finalAgentName || null },
            activity: {
              type: 'agent_assignment',
              message: finalAgentName
                ? `Sales agent assigned to ${finalAgentName}`
                : 'Sales agent assignment cleared',
            },
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Could not update order agent');
        }

        if (data.order) {
          if (orderVisibleToAgent(data.order, adminProfile)) {
            handleOrderUpdated(data.order);
          } else {
            setOrders((prev) => prev.filter((o) => o.id !== orderId));
            setSelectedOrderDetails((prev) => (prev?.id === orderId ? null : prev));
            alert(`Order ${data.order.order_number || ''} was moved to ${data.order.sales_agent}. It is no longer in this account's queue.`);
          }
        }
        return { ok: true };
      } catch (err) {
        console.error("Order sales agent update error:", err);
        if (previousOrder) {
          setOrders((prev) => prev.map((o) => (o.id === orderId ? previousOrder : o)));
          setSelectedOrderDetails((prev) => (prev?.id === orderId ? previousOrder : prev));
        }
        alert(err.message || 'Could not update order agent.');
        return { ok: false, error: err.message || 'Could not update order agent', takenBy: previousOrder?.sales_agent || '' };
      }
    }

    if (!isSupabaseConfigured || !supabase) return { ok: true };

    try {
      const result = await claimOrderInDb(supabase, orderId, finalAgentName);
      if (!result.ok) {
        // Put the real owner back on screen instead of our optimistic guess.
        setOrders(prev => prev.map(
          o => o.id === orderId ? { ...o, sales_agent: result.takenBy || null } : o
        ));
      }
      return result;
    } catch (err) {
      console.error("Order claim error:", err);
      setOrders(prev => prev.map(
        o => o.id === orderId ? { ...o, sales_agent: null } : o
      ));
      return { ok: false, takenBy: '' };
    }
  };

  // Order tracking update
  const handleOrderTrackingUpdate = async (orderId, trackingNumber) => {
    setOrders(orders.map(o => o.id === orderId ? { ...o, tracking_number: trackingNumber } : o));

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('orders')
          .update({ tracking_number: trackingNumber })
          .eq('id', orderId);
      } catch(err) {
        console.error("Order tracking update error:", err);
      }
    }
  };

  // Delete a single order
  const handleDeleteOrder = async (orderId) => {
    const order = orders.find((o) => o.id === orderId);
    if (!confirmDelete('order', [
      order?.order_number && `#${order.order_number}`,
      order?.customer_name,
      order?.customer_phone,
      order && (order.currency === 'USD'
        ? `$${Number(order.total_usd || 0).toLocaleString('en-US')}`
        : `₡${Number(order.total_crc || 0).toLocaleString('es-CR')}`),
      order?.status && `Status: ${order.status}`,
      order?.sales_agent && `Agent: ${order.sales_agent}`,
    ])) return;
    setOrders(prev => prev.filter(o => o.id !== orderId));
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('orders').delete().eq('id', orderId);
      } catch(err) {
        console.error('Order delete error:', err);
      }
    }
  };

  // Delete a single abandoned cart entry
  const handleDeleteCart = async (cartKey) => {
    const cart = abandonedCarts.find((c) => (c.session_id || c.id) === cartKey || c.id === cartKey);
    if (!confirmDelete('cart entry', [
      cart?.customer_name,
      cart?.customer_phone || cart?.customer_email,
      cart?.status && `Status: ${cart.status}`,
    ])) return;
    try {
      const matchedCart = abandonedCarts.find((c) => (c.session_id || c.id) === cartKey || c.id === cartKey);
      const res = await adminFetch('/api/admin/abandoned-carts/update', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartKey,
          sessionId: matchedCart?.session_id || null,
          id: matchedCart?.id || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Delete failed with status ${res.status}`);
      }

      setAbandonedCarts(prev => prev.filter(c => (c.session_id || c.id) !== cartKey && c.id !== cartKey));
    } catch(err) {
      console.error('Cart delete error:', err);
      alert(`Failed to delete cart: ${err.message}`);
    }
  };

  // Send recovery email
  const handleSendRecoveryEmail = async (acart) => {
    setSendingRecoveryEmail(prev => ({ ...prev, [acart.session_id]: true }));
    try {
      const response = await fetch('/api/abandoned-cart-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: acart.session_id,
          customer_name: acart.customer_name,
          customer_email: acart.customer_email,
          cart_data: acart.cart_data,
          lang: acart.lang || 'es',
          currency: acart.currency || 'CRC',
        }),
      });

      const result = await response.json();
      if (response.ok && result.success) {
        alert('Recovery email sent successfully!');
        loadAdminData();
      } else {
        alert('Failed to send recovery email: ' + (result.details || result.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to send recovery email: ' + err.message);
    } finally {
      setSendingRecoveryEmail(prev => ({ ...prev, [acart.session_id]: false }));
    }
  };

  // Send recovery WhatsApp message
  const handleSendRecoveryWhatsApp = async (acart) => {
    if (!acart.customer_phone) return;
    
    setSendingRecoveryWhatsApp(prev => ({ ...prev, [acart.session_id]: true }));
    try {
      const response = await adminFetch('/api/abandoned-cart-whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: acart.session_id,
          customer_name: acart.customer_name,
          customer_phone: acart.customer_phone,
          lang: acart.lang || 'es',
        }),
      });

      const result = await response.json();
      if (response.ok && result.success) {
        alert('Recovery WhatsApp message sent successfully!');
        loadAdminData();
      } else {
        alert('Failed to send recovery WhatsApp message: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to send recovery WhatsApp message: ' + err.message);
    } finally {
      setSendingRecoveryWhatsApp(prev => ({ ...prev, [acart.session_id]: false }));
    }
  };

  const getCartValue = (acart) => {
    if (!acart.cart_data) return 0;
    return acart.cart_data.reduce((acc, item) => {
      const rawPrice = item.priceUsd || item.price_usd || item.price || '0';
      const price = typeof rawPrice === 'string' ? parseFloat(rawPrice.replace(/[^0-9.]/g, '')) : Number(rawPrice);
      return acc + ((price || 0) * (item.qty || 0));
    }, 0);
  };

  const handleExportCartsCSV = (filteredCartsToExport) => {
    if (!filteredCartsToExport || filteredCartsToExport.length === 0) {
      alert('No carts to export.');
      return;
    }
    
    const headers = ['email', 'phone', 'first_name', 'last_name', 'value', 'currency', 'status'];
    
    const rows = filteredCartsToExport.map(c => {
      const nameParts = (c.customer_name || '').split(' ');
      const fn = nameParts[0] || '';
      const ln = nameParts.slice(1).join(' ') || '';
      return [
        c.customer_email || '',
        c.customer_phone || '',
        fn,
        ln,
        getCartValue(c).toFixed(2),
        'USD',
        getCartRecoveryStatus(c) || 'not_contacted'
      ].map(v => `"${v}"`).join(',');
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `abandoned_carts_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Bulk Email reminders
  const handleBulkEmail = async () => {
    const cartsToProcess = abandonedCarts.filter(c => selectedCartIds.includes(c.session_id) && c.customer_email);
    if (cartsToProcess.length === 0) {
      alert('None of the selected carts have an email address.');
      return;
    }
    if (!confirm(`Are you sure you want to send recovery emails to ${cartsToProcess.length} customers?`)) return;
    
    setBulkProcessing(true);
    let successCount = 0;
    let failCount = 0;
    let lastError = '';
    for (let i = 0; i < cartsToProcess.length; i++) {
      const acart = cartsToProcess[i];
      setBulkProgressText(`Sending email ${i + 1}/${cartsToProcess.length} to ${acart.customer_name || 'Customer'}...`);
      try {
        const response = await fetch('/api/abandoned-cart-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: acart.session_id,
            customer_name: acart.customer_name,
            customer_email: acart.customer_email,
            cart_data: acart.cart_data,
            lang: acart.lang || 'es',
            currency: acart.currency || 'CRC',
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.success) {
          successCount++;
        } else {
          failCount++;
          lastError = result.details || result.error || `HTTP ${response.status}`;
          console.error('Failed to send recovery email:', lastError);
        }
      } catch (err) {
        failCount++;
        lastError = err.message;
        console.error(err);
      }
      await new Promise(r => setTimeout(r, 400));
    }
    setBulkProcessing(false);
    alert(failCount > 0
      ? `Sent ${successCount} recovery emails. Failed ${failCount}. Last error: ${lastError || 'Unknown error'}`
      : `✅ Sent ${successCount} recovery emails successfully!`);
    setSelectedCartIds([]);
    loadAdminData();
  };

  // Bulk WhatsApp reminders
  const handleBulkWhatsApp = async () => {
    const cartsToProcess = abandonedCarts.filter(c => selectedCartIds.includes(c.session_id) && c.customer_phone);
    if (cartsToProcess.length === 0) {
      alert('None of the selected carts have a WhatsApp phone number.');
      return;
    }
    if (!confirm(`Are you sure you want to send automated WhatsApp reminders to ${cartsToProcess.length} customers?`)) return;

    setBulkProcessing(true);
    let successCount = 0;
    for (let i = 0; i < cartsToProcess.length; i++) {
      const acart = cartsToProcess[i];
      setBulkProgressText(`Sending WhatsApp ${i + 1}/${cartsToProcess.length} to ${acart.customer_name || 'Customer'}...`);
      try {
        const response = await adminFetch('/api/abandoned-cart-whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: acart.session_id,
            customer_name: acart.customer_name,
            customer_phone: acart.customer_phone,
            lang: acart.lang || 'es',
          }),
        });
        if (response.ok) {
          const result = await response.json();
          if (result.success) successCount++;
        }
      } catch (err) {
        console.error(err);
      }
      await new Promise(r => setTimeout(r, 400));
    }
    setBulkProcessing(false);
    alert(`✅ Sent ${successCount} WhatsApp reminders successfully!`);
    setSelectedCartIds([]);
    loadAdminData();
  };

  // Bulk Delete carts
  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedCartIds.length} selected cart entries? This cannot be undone.`)) return;

    setBulkProcessing(true);
    setBulkProgressText(`Deleting ${selectedCartIds.length} carts...`);
    try {
      setAbandonedCarts(prev => prev.filter(c => !selectedCartIds.includes(c.session_id)));
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('abandoned_carts')
          .delete()
          .in('session_id', selectedCartIds);
        if (error) throw error;
      }
      alert(`🗑️ Deleted ${selectedCartIds.length} carts successfully!`);
    } catch (err) {
      console.error('Bulk delete error:', err);
      alert(`Failed to delete carts: ${err.message}`);
    } finally {
      setBulkProcessing(false);
      setSelectedCartIds([]);
      loadAdminData();
    }
  };

  // ─── AI INTEGRATION HANDLERS (GEMINI) ───

  // 1. Translate Product Descriptions with AI
  const handleAiTranslate = async (text, direction) => {
    if (!text || text.trim() === '') {
      alert('Please enter some text to translate.');
      return;
    }
    
    setLoadingAiTranslate(true);
    try {
      const sourceLang = direction === 'en-to-es' ? 'en' : 'es';
      const targetLang = direction === 'en-to-es' ? 'es' : 'en';
      
      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'translate',
          text,
          sourceLang,
          targetLang
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (direction === 'en-to-es') {
          setEditDescEs(data.text);
        } else {
          setEditDescEn(data.text);
        }
      } else {
        alert('Translation failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Translation failed: ' + err.message);
    } finally {
      setLoadingAiTranslate(false);
    }
  };

  // 2. Generate Rich Peptide Details / Info
  const handleAiGenerateDesc = async (peptideName) => {
    if (!peptideName || peptideName.trim() === '') {
      alert('Peptide name is required.');
      return;
    }

    setLoadingAiDesc(true);
    try {
      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'generate_info',
          text: peptideName
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Try parsing the JSON block from response text
        try {
          const cleanText = data.text.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanText);
          if (parsed.en) setEditDescEn(parsed.en);
          if (parsed.es) setEditDescEs(parsed.es);
        } catch (e) {
          // If not strict JSON, just set the raw output as English description
          setEditDescEn(data.text);
          alert('AI response received, but could not parse EN/ES split. Entire output applied to English.');
        }
      } else {
        alert('Generation failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Generation failed: ' + err.message);
    } finally {
      setLoadingAiDesc(false);
    }
  };

  // WhatsApp Template Generator Spanish
  const generateWhatsAppTemplateText = (recipient, templateType, agentName) => {
    if (!recipient) return '';
    if (recipient.prefilledText && typeof recipient.prefilledText === 'string') {
      return recipient.prefilledText.trim();
    }
    
    // Sanitize recipient name
    let cleanName = 'Cliente';
    if (recipient.name && typeof recipient.name === 'string') {
      const trimmed = recipient.name.trim();
      const lower = trimmed.toLowerCase();
      if (trimmed && !['null', 'undefined', 'n/a', 'unknown'].includes(lower)) {
        cleanName = trimmed;
      }
    }

    const agentSig = agentName ? agentName : 'asesor';
    
    // Format cart items
    let itemsStr = 'tus artículos';
    if (recipient.cartItems && recipient.cartItems.length > 0) {
      itemsStr = recipient.cartItems.map(i => `${i.product || i.name || 'Péptido'} (x${i.qty || i.quantity || 1})`).join(', ');
    }

    const recoveryLink = recipient.session_id
      ? `https://catalog.peptidescostarica.net/catalog?recover_session=${encodeURIComponent(recipient.session_id)}${agentName ? `&sales_agent=${encodeURIComponent(agentName)}` : ''}`
      : 'https://catalog.peptidescostarica.net/catalog';

    // 1. Check if recovering abandoned cart
    if (recipient.cartItems) {
      switch (templateType) {
        case 'purity':
          return `¡Hola ${cleanName}! Te saluda ${agentSig} de Peptides Costa Rica. 🇨🇷 

Te contacto porque notamos tu interés en ${itemsStr}. Quería recordarte que todos nuestros péptidos cuentan con pureza certificada de laboratorio ≥98% HPLC para garantizar la máxima seguridad en tu investigación.

Realizamos envíos rápidos a todo el país vía Correos de CR y coordinamos pagos seguros vía SINPE Móvil o tarjeta. ¿Te gustaría que te ayude a coordinar tu envío hoy?`;

        case 'discount':
          return `¡Hola ${cleanName}! Te saluda ${agentSig} de Peptides Costa Rica. 🇨🇷

Queremos apoyarte en tus metas de salud y rendimiento. Por eso, si completas tu orden de ${itemsStr} hoy, puedes aplicar un 10% de descuento adicional utilizando el cupón especial COSTA10.

Puedes recuperar tu carrito y aplicar tu cupón directamente ingresando aquí:
👉 ${recoveryLink}

Avísame si deseas que agilice tu orden directamente por este chat. ¡Quedo a tu total disposición!`;

        case 'dosing':
          return `¡Hola ${cleanName}! Te habla ${agentSig} de Peptides Costa Rica. 🇨🇷

Vimos que estabas consultando por ${itemsStr}. Al adquirir péptidos en polvo, sabemos que la matemática de la reconstitución con agua bacteriostática y la dosificación correcta con jeringas de insulina puede ser confusa.

Te ofrezco asesoría gratuita y directa sobre cómo prepararlos y administrarlos de forma segura. ¿Tienes alguna pregunta o te gustaría que preparemos tu envío hoy?`;

        case 'standard':
        default:
          return `¡Hola ${cleanName}! Te saluda ${agentSig} de Peptides Costa Rica. 🇨🇷

Notamos que dejaste algunos artículos en tu carrito (${itemsStr}). Quería ponerme a tu entera disposición por si tienes alguna consulta sobre la calidad del laboratorio, las formas de pago en Costa Rica, o si gustas que te coordine la entrega vía Correos de CR.

Puedes finalizar tu orden de forma segura en este link:
👉 ${recoveryLink}

¡Quedo atento a tus mensajes!`;
      }
    } 
    // 2. Order follow up
    else if (recipient.orderNumber) {
      switch (templateType) {
        case 'payment':
          return `¡Hola ${cleanName}! Te saluda ${agentSig} de Peptides Costa Rica. 🇨🇷

Recibimos tu orden #${recipient.orderNumber} por ${itemsStr}. Quería verificar si tuviste algún inconveniente al realizar tu pago SINPE Móvil o con Tarjeta.

Quedamos atentos a la confirmación o comprobante de pago por este medio para procesar y despachar tus productos de inmediato. ¡Muchas gracias!`;

        case 'purity':
          return `¡Hola ${cleanName}! Te saluda ${agentSig} de Peptides Costa Rica. 🇨🇷

Muchas gracias por tu compra de ${itemsStr} (Orden #${recipient.orderNumber}). Quería compartirte de forma directa nuestra guía digital de reconstitución, almacenamiento y uso seguro para que comiences tu protocolo de la mejor manera.

¿Hay algo más en lo que te pueda asesorar o apoyar en este momento? ¡Un gusto atenderte!`;

        case 'discount':
          return `¡Hola ${cleanName}! Te saluda ${agentSig} de Peptides Costa Rica. 🇨🇷

Te escribo para confirmarte que estamos preparando tu orden #${recipient.orderNumber} conteniendo ${itemsStr}. En las próximas horas te estaremos compartiendo el número de guía de Correos de Costa Rica para que puedas rastrear tu paquete.

¡Muchas gracias por tu confianza en nosotros para tu investigación!`;

        case 'standard':
        default:
          return `¡Hola ${cleanName}! Te saluda ${agentSig} de Peptides Costa Rica. 🇨🇷

Te contacto respecto a tu orden #${recipient.orderNumber} de ${itemsStr}. Queríamos verificar si todo marcha bien y si tienes alguna duda respecto al envío, las instrucciones de almacenamiento de los viales, o la dosificación.

¡Quedo a tus órdenes para lo que necesites!`;
      }
    }

    return `Hola ${cleanName}, te saluda ${agentSig} de Peptides Costa Rica. ¿Cómo te podemos ayudar hoy?`;
  };

  // 3. Open Custom WhatsApp Composer Modal
  const openWhatsAppComposer = (recipient, defaultTemplate = 'standard') => {
    setWaRecipient(recipient);
    
    // Default Dynamic templates states
    setWaSelectedTemplate(defaultTemplate);
    
    let defaultAgent = '';
    if (agents && agents.length > 0) {
      const firstAgent = agents[0];
      if (firstAgent && !firstAgent.includes('@')) {
        defaultAgent = firstAgent;
      }
    }
    setWaSelectedAgent(defaultAgent);

    // Initial message based on template and default agent signature
    const initialMsg = generateWhatsAppTemplateText(recipient, defaultTemplate, defaultAgent);
    setWaMessageText(initialMsg);
    
    setWaModalOpen(true);
  };

  // 4. Draft Personalized WhatsApp message using AI
  const handleDraftWaMessage = async () => {
    if (!waRecipient) return;
    
    setWaDrafting(true);
    try {
      let prompt = `Write a friendly, professional, highly persuasive e-commerce customer support/sales message for a customer named "${waRecipient.name}" who `;
      if (waRecipient.orderNumber) {
        prompt += `placed an order (Order Ref: ${waRecipient.orderNumber}) containing: ${waRecipient.cartItems ? waRecipient.cartItems.map(i => `${i.product} (x${i.qty})`).join(', ') : 'peptides'}. Write a status check-in, coordinating delivery details in a warm, polite tone.`;
      } else if (waRecipient.cartItems) {
        prompt += `has an active abandoned cart containing: ${waRecipient.cartItems.map(i => `${i.product} (x${i.qty || i.quantity})`).join(', ')}. Politely remind them that we saved their items, offer support, and include a brief call to action.`;
      } else {
        prompt += `is in our CRM database. Highlight our premium lab-tested peptides, fast local shipping in Costa Rica, and invite them to ask any questions.`;
      }
      
      prompt += ` Keep it brief, conversational, and split with natural line breaks. Write the message in Spanish, as that is our primary language. Do not include subject lines, greetings placeholders, or quotes. Just give the exact chat body ready to send.`;

      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          prompt
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setWaMessageText(data.text.trim());
      } else {
        alert('Failed to draft AI message: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to draft AI message: ' + err.message);
    } finally {
      setWaDrafting(false);
    }
  };

  // 5. Send Automated Outbound WhatsApp Message
  const handleSendWaMessage = async () => {
    if (!waRecipient || !waMessageText.trim()) return;

    setWaSending(true);
    try {
      const res = await adminFetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: waRecipient.phone,
          message: waMessageText,
          customerName: waRecipient.name,
          orderId: waRecipient.orderDbId,
          sessionId: waRecipient.session_id
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert('✅ WhatsApp message sent automatically from your business number!');
        setWaModalOpen(false);
        setWaRecipient(null);
        setWaMessageText('');
        loadAdminData(); // Refresh to log into outbound history
      } else {
        alert('❌ Failed to send WhatsApp automatically: ' + (data.error || 'Unknown error') + '\n\nYou can still use the "Open in Personal WhatsApp" fallback link below.');
      }
    } catch (err) {
      console.error(err);
      alert('❌ Failed to send WhatsApp: ' + err.message);
    } finally {
      setWaSending(false);
    }
  };

  // 6. AI Copilot Chat Handler
  const handleSendAiChatMessage = async () => {
    if (!aiInputText.trim()) return;

    const userMessage = { role: 'user', text: aiInputText };
    setAiChatMessages(prev => [...prev, userMessage]);
    const promptToSend = aiInputText;
    setAiInputText('');
    setAiLoading(true);

    try {
      // Generate Lead attribution counts
      const leadAttributions = {};
      leads.forEach(l => {
        const src = l.utm_source || l.source || 'Organic/Direct';
        leadAttributions[src] = (leadAttributions[src] || 0) + 1;
      });

      // Generate Carts item counts & active vs completed
      const cartItemsCount = {};
      const activeCarts = abandonedCarts.filter(c => c.status === 'active' || !c.status);
      activeCarts.forEach(c => {
        if (Array.isArray(c.cart_data)) {
          c.cart_data.forEach(item => {
            const pName = item.product || 'Unknown Product';
            cartItemsCount[pName] = (cartItemsCount[pName] || 0) + (item.qty || 1);
          });
        }
      });

      const context = {
        products: products.map(p => ({
          product: p.product,
          category: p.category,
          priceUsd: p.price_usd || p.priceUsd,
          priceCrc: p.price_crc || p.priceCrc
        })),
        stats: {
          totalOrders: orders.length,
          abandonedCartsCount: abandonedCarts.length,
          activeCartsCount: activeCarts.length,
          leadsCount: leads.length,
          leadAttributions,
          cartItemsCount
        }
      };

      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          prompt: promptToSend,
          context
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAiChatMessages(prev => [...prev, { role: 'assistant', text: data.text }]);
      } else {
        setAiChatMessages(prev => [...prev, { role: 'assistant', text: `⚠️ Error de Copiloto: ${data.error || 'No se pudo obtener respuesta.'}` }]);
      }
    } catch (err) {
      console.error(err);
      setAiChatMessages(prev => [...prev, { role: 'assistant', text: `⚠️ Error de conexión: ${err.message}` }]);
    } finally {
      setAiLoading(false);
    }
  };

  // Clear ALL active abandoned carts
  const handleClearAllCarts = async () => {
    if (!confirm('Clear ALL active cart data? This cannot be undone.')) return;
    setAbandonedCarts([]);
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('abandoned_carts').delete().eq('status', 'active');
      } catch(err) {
        console.error('Clear carts error:', err);
      }
    }
  };

  // Centralized Export Handler
  const handleExport = (format) => {
    setExportLoading(true);
    setTimeout(() => {
      try {
        let headers = [];
        let dataRows = [];
        let filename = `peptidescr-export-${new Date().toISOString().slice(0, 10)}`;
        let title = 'Export';

        if (exportModalType === 'orders') {
          headers = [ 'Order ID', 'Order Number', 'Date', 'Customer Name', 'ID Number', 'ID Type', 'Phone', 'Shipping Address', 'Status', 'Payment Method', 'Items', 'Total (CRC)', 'Total (USD)' ];
          dataRows = orders.map(order => {
             const items = Array.isArray(order.items) ? order.items : [];
             const itemsSummary = items.map(i => `${i.product} x${i.qty}`).join(' | ');
             const orderDate = new Date(order.created_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' });
             return [ order.id, order.order_number || 'N/A', orderDate, order.customer_name || 'N/A', order.customer_id_number || '', formatCustomerIdType(order.customer_id_type) || '', order.customer_phone || '', order.shipping_address || 'N/A', order.status || 'Pending', order.payment_method || 'whatsapp', itemsSummary, order.total_crc || '', order.total_usd || '' ];
          });
          filename = `peptidescr-orders-${new Date().toISOString().slice(0, 10)}`;
          title = 'Costa Rica Peptides - Orders Export';
        } else if (exportModalType === 'products') {
          headers = [ 'Product Name', 'Category', 'Price (USD)', 'Price (CRC)', 'Status', 'Bulk Discount' ];
          dataRows = products.map(p => [ p.product, p.category, p.priceUsd, p.priceCrc, p.status, p.discount ]);
          filename = `peptidescr-products-${new Date().toISOString().slice(0, 10)}`;
          title = 'Costa Rica Peptides - Products Export';
        } else if (exportModalType === 'carts') {
          headers = [ 
            'Session ID', 'Date', 'Customer Name', 'Phone', 'Email', 'Cart Items', 'Status',
            'Recovery Email Sent', 'Recovery Email Sent At', 
            'Recovery WhatsApp Sent', 'Recovery WhatsApp Sent At' 
          ];
          dataRows = abandonedCarts.map(c => {
             const itemsSummary = c.cart_data ? c.cart_data.map(i => `${i.product} x${i.qty}`).join(' | ') : '';
             const date = new Date(c.last_updated).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' });
             const emailSentAt = c.recovery_email_sent_at ? new Date(c.recovery_email_sent_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' }) : '';
             const waSentAt = c.recovery_whatsapp_sent_at ? new Date(c.recovery_whatsapp_sent_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' }) : '';
             return [ 
               c.session_id, date, c.customer_name || '', c.customer_phone || '', c.customer_email || '', itemsSummary, c.status,
               c.recovery_email_sent ? 'Yes' : 'No', emailSentAt,
               c.recovery_whatsapp_sent ? 'Yes' : 'No', waSentAt
             ];
          });
          filename = `peptidescr-carts-${new Date().toISOString().slice(0, 10)}`;
          title = 'Costa Rica Peptides - Abandoned Carts Export';
        } else if (exportModalType === 'leads') {
          headers = [ 'Lead ID', 'Date Captured', 'Method', 'Contact Info', 'IP Address', 'City', 'Region', 'Country', 'Referrer', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Language' ];
          dataRows = leads.map(l => [
            l.id,
            new Date(l.created_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' }),
            l.contact_method,
            l.contact_value,
            l.ip_address || '',
            l.city || '',
            l.region || '',
            l.country || '',
            l.referrer || '',
            l.utm_source || '',
            l.utm_medium || '',
            l.utm_campaign || '',
            l.language
          ]);
          filename = `peptidescr-leads-${new Date().toISOString().slice(0, 10)}`;
          title = 'Costa Rica Peptides - Catalog Leads Export';
        }

        if (format === 'csv') {
          const csvContent = [headers, ...dataRows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
          const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a'); link.href = url; link.download = `${filename}.csv`;
          document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
        } else if (format === 'xlsx') {
          const worksheetData = [headers, ...dataRows];
          const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
          const wscols = headers.map(h => ({ wch: Math.max(15, h.length + 2) }));
          worksheet['!cols'] = wscols;
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
          XLSX.writeFile(workbook, `${filename}.xlsx`);
        } else if (format === 'pdf') {
          const doc = new jsPDF('landscape');
          doc.setFontSize(16);
          doc.text(title, 14, 15);
          doc.setFontSize(10);
          doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);
          doc.autoTable({
            head: [headers],
            body: dataRows,
            startY: 28,
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: [14, 22, 38], textColor: 255 },
            alternateRowStyles: { fillColor: [240, 240, 240] }
          });
          doc.save(`${filename}.pdf`);
        }
      } finally {
        setExportLoading(false);
        setExportModalType(null);
      }
    }, 500);
  };

  // Leads Actions
  const handleLeadUpdate = async (id) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, contact_value: editLeadValue, contact_method: editLeadMethod } : l));
    setEditingLeadId(null);

    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('catalog_leads')
          .update({ contact_value: editLeadValue, contact_method: editLeadMethod })
          .eq('id', id);
      } catch (err) {
        console.error("Failed to update lead:", err);
      }
    }
  };
  
  const handleLeadDelete = async (id) => {
    const lead = leads.find((l) => l.id === id);
    if (!confirmDelete('lead', [
      lead?.name,
      lead?.phone || lead?.email,
      lead?.status && `Status: ${lead.status}`,
    ])) return;
    
    setLeads(prev => prev.filter(l => l.id !== id));
    
    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('catalog_leads')
          .delete()
          .eq('id', id);
      } catch (err) {
        console.error("Failed to delete lead:", err);
      }
    }
  };

  const handleSelectLead = (id, checked, shiftKey, index) => {
    if (shiftKey && lastSelectedLeadIndex !== null) {
      const start = Math.min(lastSelectedLeadIndex, index);
      const end = Math.max(lastSelectedLeadIndex, index);
      const idsInRange = paginatedLeads.slice(start, end + 1).map(l => l.id);
      
      setSelectedLeads(prev => {
        if (checked) {
          const newSelection = new Set([...prev, ...idsInRange]);
          return Array.from(newSelection);
        } else {
          return prev.filter(leadId => !idsInRange.includes(leadId));
        }
      });
    } else {
      setSelectedLeads(prev =>
        checked ? [...prev, id] : prev.filter(leadId => leadId !== id)
      );
    }
    setLastSelectedLeadIndex(index);
  };

  const handleSelectMultipleLeads = (ids, checked) => {
    setSelectedLeads(prev => {
      if (checked) {
        return Array.from(new Set([...prev, ...ids]));
      } else {
        return prev.filter(leadId => !ids.includes(leadId));
      }
    });
  };

  const handleSelectCart = (id, checked, shiftKey, index) => {
    if (shiftKey && lastSelectedCartIndex !== null) {
      const start = Math.min(lastSelectedCartIndex, index);
      const end = Math.max(lastSelectedCartIndex, index);
      const idsInRange = abandonedCarts.slice(start, end + 1).map(c => c.session_id || c.id);
      
      setSelectedCartIds(prev => {
        if (checked) {
          const newSelection = new Set([...prev, ...idsInRange]);
          return Array.from(newSelection);
        } else {
          return prev.filter(cartId => !idsInRange.includes(cartId));
        }
      });
    } else {
      setSelectedCartIds(prev =>
        checked ? [...prev, id] : prev.filter(cartId => cartId !== id)
      );
    }
    setLastSelectedCartIndex(index);
  };

  const handleSelectMultipleCarts = (ids, checked) => {
    setSelectedCartIds(prev => {
      if (checked) {
        return Array.from(new Set([...prev, ...ids]));
      } else {
        return prev.filter(cartId => !ids.includes(cartId));
      }
    });
  };

  useEffect(() => {
    setLastSelectedLeadIndex(null);
  }, [leadsCurrentPage, leadsSearch, leadsSourceFilter, leadsAreaFilter]);

  useEffect(() => {
    setLastSelectedCartIndex(null);
  }, [abandonedCarts]);

  const filteredLeads = leads.filter(lead => {
    // 1. Search Query
    if (leadsSearch.trim() !== '') {
      const q = leadsSearch.toLowerCase();
      const contactVal = (lead.contact_value || '').toLowerCase();
      const cityVal = (lead.city || '').toLowerCase();
      const regionVal = (lead.region || '').toLowerCase();
      const countryVal = (lead.country || '').toLowerCase();
      const campaignVal = (lead.utm_campaign || '').toLowerCase();
      const mediumVal = (lead.utm_medium || '').toLowerCase();
      const sourceVal = (lead.utm_source || '').toLowerCase();
      
      const match = contactVal.includes(q) || 
                    cityVal.includes(q) || 
                    regionVal.includes(q) || 
                    countryVal.includes(q) ||
                    campaignVal.includes(q) ||
                    mediumVal.includes(q) ||
                    sourceVal.includes(q);
      if (!match) return false;
    }

    // 2. Source Filter
    if (leadsSourceFilter !== 'All') {
      if (leadsSourceFilter === 'active') {
        if (!leadIsActiveForPipeline(lead, orders)) return false;
      } else if (leadsSourceFilter === 'converted') {
        if (leadIsActiveForPipeline(lead, orders)) return false;
      } else if (leadsSourceFilter === 'Direct') {
        if (lead.utm_source) return false;
      } else if (leadsSourceFilter === 'Ads') {
        if (!lead.utm_source) return false;
      } else {
        if ((lead.utm_source || '').toLowerCase() !== leadsSourceFilter.toLowerCase()) return false;
      }
    }

    // 3. Area Filter
    if (leadsAreaFilter !== 'All') {
      const leadArea = lead.region || lead.city || 'Unknown';
      if (leadArea !== leadsAreaFilter) return false;
    }

    return true;
  });

  const paginatedLeads = filteredLeads.slice(
    (leadsCurrentPage - 1) * leadsPerPage,
    leadsCurrentPage * leadsPerPage
  );

  const handleSelectAllLeads = (checked) => {
    setSelectedLeads(checked ? paginatedLeads.map(l => l.id) : []);
  };

  const handleBulkLeadsEmail = () => {
    const selected = leads.filter(l => selectedLeads.includes(l.id));
    const emails = selected.map(l => l.email || (l.contact_method === 'email' ? l.contact_value : null)).filter(Boolean);
    if (emails.length === 0) return alert('No selected leads have email addresses.');
    window.location.href = `mailto:?bcc=${emails.join(',')}`;
  };

  const handleBulkLeadsWhatsApp = () => {
    const selected = leads.filter(l => selectedLeads.includes(l.id));
    const phones = selected.map(l => l.phone || (l.contact_method === 'whatsapp' ? l.contact_value : null)).filter(Boolean);
    if (phones.length === 0) return alert('No selected leads have phone numbers.');
    localStorage.setItem('pending_broadcast_contacts', phones.join('\n'));
    localStorage.setItem('pending_broadcast_source', `${phones.length} selected lead${phones.length !== 1 ? 's' : ''}`);
    navigateToTab('broadcasts');
    setToastMessage(`${phones.length} lead${phones.length !== 1 ? 's' : ''} loaded into Broadcasts.`);
  };

  const handleBulkDeleteLeads = async () => {
    if (selectedLeads.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedLeads.length} leads?`)) return;

    setLeads(prev => prev.filter(l => !selectedLeads.includes(l.id)));
    
    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('catalog_leads')
          .delete()
          .in('id', selectedLeads);
      } catch (err) {
        console.error("Failed to bulk delete leads:", err);
      }
    }
    setSelectedLeads([]);
  };

  // Save changes batch
  // The mobile drawer passes an explicit row array; the desktop Save button is
  // wired to onClick and can hand us a click event instead. Only an actual
  // array is a caller-supplied list — anything else means "save the grid".
  const handleSaveChanges = async (productRowsArg) => {
    const productRows = Array.isArray(productRowsArg) ? productRowsArg : products;

    if (!isDbConnected) {
      setSaveStatus("❌ Cannot save: Database is offline or in local fallback mode. Verify database connection before saving.");
      setTimeout(() => setSaveStatus(''), 5000);
      return;
    }

    setSaveLoading(true);
    setSaveStatus('');

    // Everything below runs inside try/finally so the button always comes back
    // out of "Syncing DB..." even if something unexpected throws.
    try {
      // Keep legacy CRC columns synced from USD, while USD remains the source of truth.
      const filled = productRows.map(p => {
        let newP = { ...p };
        if (newP.priceUsd) {
          const usdNum = parseFloat(String(newP.priceUsd).replace(/[^0-9.]/g, '')) || 0;
          if (usdNum > 0) {
            newP.priceCrc = `₡${Math.round(usdNum * exchangeRate).toLocaleString('en-US')}`;
          }
        }
        if (newP.originalPriceUsd) {
          const origUsdNum = parseFloat(String(newP.originalPriceUsd).replace(/[^0-9.]/g, '')) || 0;
          if (origUsdNum > 0) {
            newP.originalPriceCrc = `₡${Math.round(origUsdNum * exchangeRate).toLocaleString('en-US')}`;
          }
        }
        return newP;
      });
      // Update state so the UI reflects the auto-filled values
      setProducts(filled);

      if (isSupabaseConfigured) {
        try {
          const res = await adminFetch('/api/admin/products', {
            method: 'PUT',
            body: JSON.stringify({ products: filled }),
          });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || 'Failed to save products');

          setSaveStatus("Changes successfully saved to database!");
          loadAdminData(); // reload fresh rows
        } catch (err) {
          console.error("Database save changes error:", err);
          setSaveStatus(`Failed to save: ${err.message || 'Row Level Security error'}`);
        }
      } else {
        setSaveStatus("Local Simulation: Saved products data state inside browser memory!");
      }
    } catch (err) {
      console.error("Save changes error:", err);
      setSaveStatus(`Failed to save: ${err.message || 'Unexpected error'}`);
    } finally {
      setSaveLoading(false);
      setTimeout(() => setSaveStatus(''), 4000);
    }
  };

  const handleApproveReview = async (id) => {
    if (!supabase) return;
    const reason = reviewModerationReasons[id]?.trim();
    try {
      const { error } = await supabase.from('product_reviews').update({ status: 'Approved' }).eq('id', id);
      if (!error) {
        setReviews(reviews.map(r => r.id === id ? { ...r, status: 'Approved' } : r));
        if (reason) {
          console.info(`Review ${id} approved. Moderation note: ${reason}`);
        }
      }
    } catch (err) { console.error(err); }
  };

  const handleDeleteReview = async (id) => {
    if (!supabase) return;
    const reason = reviewModerationReasons[id]?.trim();
    const review = reviews.find((r) => r.id === id);
    if (!confirmDelete('review', [
      review?.product,
      review?.author_name || review?.customer_name,
      review?.rating && `Rating: ${review.rating}`,
      review?.comment && `"${String(review.comment).slice(0, 80)}"`,
      reason ? `Reason: ${reason}` : 'No moderation reason entered.',
    ])) return;
    try {
      const { error } = await supabase.from('product_reviews').delete().eq('id', id);
      if (!error) {
        setReviews(reviews.filter(r => r.id !== id));
      }
    } catch (err) { console.error(err); }
  };

  const reviewProducts = useMemo(
    () => Array.from(new Set(reviews.map(r => r.product_name).filter(Boolean))).sort(),
    [reviews]
  );

  const visibleReviews = useMemo(() => {
    return [...reviews]
      .filter(review => reviewStatusFilter === 'All' || review.status === reviewStatusFilter)
      .filter(review => reviewProductFilter === 'all' || review.product_name === reviewProductFilter)
      .sort((a, b) => {
        const pendingDelta = (a.status === 'Pending' ? 0 : 1) - (b.status === 'Pending' ? 0 : 1);
        if (pendingDelta !== 0) return pendingDelta;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [reviews, reviewProductFilter, reviewStatusFilter]);

  const handleMarkNotificationRead = async (id) => {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const { error } = await supabase
        .from('facebook_notifications')
        .update({ status: 'read' })
        .eq('id', id);
      if (error) throw error;
      setFacebookNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'read' } : n));
    } catch (err) {
      console.error("Failed to update notification status:", err);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const { error } = await supabase
        .from('facebook_notifications')
        .update({ status: 'read' })
        .eq('status', 'unread');
      if (error) throw error;
      setFacebookNotifications(prev => prev.map(n => ({ ...n, status: 'read' })));
    } catch (err) {
      console.error("Failed to mark all notifications read:", err);
    }
  };

  const handleDeleteNotification = async (id) => {
    if (!isSupabaseConfigured || !supabase) return;
    const note = facebookNotifications?.find((n) => n.id === id);
    if (!confirmDelete('notification', [
      note?.sender_name,
      note?.type,
      note?.content && `"${String(note.content).slice(0, 80)}"`,
    ])) return;
    try {
      const { error } = await supabase
        .from('facebook_notifications')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setFacebookNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  };

  // Science/peptide themed icon for visual rendering (no pills!)
  const getCategoryIcon = (cat, size = 20) => {
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

  // Copy shareable link
  const getShareUrl = () => {
    const domain = typeof window !== 'undefined' ? window.location.origin : 'https://costapeptides.vercel.app';
    let url = `${domain}/catalog?lang=${shareLang}&currency=${shareCurrency}`;
    if (shareProduct !== 'all') {
      url += `&product=${encodeURIComponent(shareProduct)}`;
    }
    if (shareSource !== 'none') {
      url += `&utm_source=${shareSource}`;
    }
    if (shareMedium.trim() !== '') {
      url += `&utm_medium=${encodeURIComponent(shareMedium.trim())}`;
    }
    if (shareCampaign.trim() !== '') {
      url += `&utm_campaign=${encodeURIComponent(shareCampaign.trim())}`;
    }
    return url;
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getShareUrl());
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const persistSharePresets = (nextPresets) => {
    setSharePresets(nextPresets);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SHARE_PRESETS_KEY, JSON.stringify(nextPresets));
    }
  };

  const handleSaveSharePreset = () => {
    const name = sharePresetName.trim() || shareCampaign.trim() || `${shareSource === 'none' ? 'Catalog' : shareSource} link`;
    const preset = {
      id: `${Date.now()}`,
      name,
      lang: shareLang,
      currency: shareCurrency,
      source: shareSource,
      medium: shareMedium,
      campaign: shareCampaign,
      product: shareProduct,
      url: getShareUrl(),
      savedAt: new Date().toISOString(),
    };
    persistSharePresets([preset, ...sharePresets.filter(item => item.name.toLowerCase() !== name.toLowerCase())].slice(0, 12));
    setSharePresetName('');
    setSharePresetSaved(true);
    setTimeout(() => setSharePresetSaved(false), 2000);
  };

  const handleApplySharePreset = (preset) => {
    setShareLang(preset.lang || 'es');
    setShareCurrency(preset.currency || 'CRC');
    setShareSource(preset.source || 'none');
    setShareMedium(preset.medium || '');
    setShareCampaign(preset.campaign || '');
    setShareProduct(preset.product || 'all');
  };

  const handleDeleteSharePreset = (presetId) => {
    persistSharePresets(sharePresets.filter(preset => preset.id !== presetId));
  };

  // CMS Handlers
  const handleSaveBusinessLinks = async () => {
    const linksToSave = normalizeBusinessLinks(businessLinks);
    const invalidFields = ['googleMapsUrl', 'facebookUrl', 'instagramUrl', 'trustpilotUrl', 'trustpilotUrlEn', 'trustpilotUrlEs', 'googleReviewUrl', 'facebookReviewUrl']
      .filter(key => !isValidOptionalUrl(linksToSave?.[key]));
    if (invalidFields.length > 0) {
      setCmsSaveStatus(`error:Invalid URL in ${invalidFields.join(', ')}. Use full https:// links.`);
      return;
    }
    if (businessLinks?.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessLinks.supportEmail)) {
      setCmsSaveStatus('error:Support email is not valid.');
      return;
    }
    setCmsSaveLoading(true);
    setCmsSaveStatus('');
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('site_settings').upsert({
          id: 'business_links',
          value: linksToSave
        });
        if (!error) {
          setBusinessLinks(linksToSave);
          setCmsSaveStatus('success:Business links saved successfully.');
          setCmsChangeHistory(prev => [{ area: 'Business links', at: new Date().toISOString() }, ...prev].slice(0, 6));
          return;
        }
        throw error;
      }
    } catch (err) {
      console.error("Failed to save business links:", err);
      setCmsSaveStatus(`error:Failed to save business links (${err.message})`);
    } finally {
      setCmsSaveLoading(false);
    }
  };

  const handleSaveSiteSettings = async () => {
    setCmsSaveLoading(true);
    setCmsSaveStatus('');
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('site_settings').upsert({
          id: 'landing_page',
          value: siteSettings
        });
        if (error) throw error;
        setCmsSaveStatus('success:Settings saved successfully.');
        setCmsChangeHistory(prev => [{ area: 'Landing page', at: new Date().toISOString() }, ...prev].slice(0, 6));
      } catch (err) {
        console.error("Failed to save settings:", err);
        setCmsSaveStatus(`error:Failed to save settings (${err.message})`);
      }
    }
    setCmsSaveLoading(false);
    setTimeout(() => setCmsSaveStatus(''), 3000);
  };

  const updateLandingSetting = (key, value) => {
    setSiteSettings((prev) => ({
      ...mergeLandingPageSettings(prev || DEFAULT_LANDING_PAGE_SETTINGS),
      [key]: value,
    }));
  };

  const updateLandingListItem = (listKey, index, key, value) => {
    setSiteSettings((prev) => {
      const current = mergeLandingPageSettings(prev || DEFAULT_LANDING_PAGE_SETTINGS);
      const nextList = [...(current[listKey] || [])];
      nextList[index] = { ...(nextList[index] || {}), [key]: value };
      return { ...current, [listKey]: nextList };
    });
  };

  const updatePublicPageSetting = (pageId, key, value) => {
    setPublicPageSettings((prev) => ({
      ...prev,
      [pageId]: {
        ...mergePublicPageSettings(pageId, prev?.[pageId] || DEFAULT_PUBLIC_PAGE_SETTINGS[pageId]),
        [key]: value,
      },
    }));
  };

  const updatePublicPageListItem = (pageId, listKey, index, key, value) => {
    setPublicPageSettings((prev) => {
      const current = mergePublicPageSettings(pageId, prev?.[pageId] || DEFAULT_PUBLIC_PAGE_SETTINGS[pageId]);
      const nextList = [...(current[listKey] || [])];
      nextList[index] = { ...(nextList[index] || {}), [key]: value };
      return {
        ...prev,
        [pageId]: { ...current, [listKey]: nextList },
      };
    });
  };

  const handleSavePublicPages = async () => {
    setCmsSaveLoading(true);
    setCmsSaveStatus('');
    try {
      if (isSupabaseConfigured && supabase) {
        const rows = PUBLIC_PAGE_SETTING_IDS.map((id) => ({
          id,
          value: mergePublicPageSettings(id, publicPageSettings?.[id]),
        }));
        const { error } = await supabase.from('site_settings').upsert(rows);
        if (error) throw error;
        setCmsSaveStatus('success:Public pages saved successfully.');
        setCmsChangeHistory(prev => [{ area: 'Public pages', at: new Date().toISOString() }, ...prev].slice(0, 6));
      }
    } catch (err) {
      console.error("Failed to save public page settings:", err);
      setCmsSaveStatus(`error:Failed to save public pages (${err.message})`);
    } finally {
      setCmsSaveLoading(false);
      setTimeout(() => setCmsSaveStatus(''), 3000);
    }
  };

  const cmsInputStyle = {
    width: '100%',
    padding: '8px',
    marginBottom: '8px',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: '#0e1626',
    color: '#f8fafc',
    fontSize: '0.85rem',
  };

  const cmsLabelStyle = {
    display: 'block',
    fontSize: '0.75rem',
    color: '#94a3b8',
    marginBottom: '4px',
  };

  const cmsField = (label, key, placeholder = label) => (
    <label style={{ display: 'block' }}>
      <span style={cmsLabelStyle}>{label}</span>
      <input
        type="text"
        placeholder={placeholder}
        value={siteSettings?.[key] || ''}
        onChange={(e) => updateLandingSetting(key, e.target.value)}
        style={cmsInputStyle}
      />
    </label>
  );

  const cmsTextArea = (label, key, placeholder = label, minHeight = 70) => (
    <label style={{ display: 'block' }}>
      <span style={cmsLabelStyle}>{label}</span>
      <textarea
        placeholder={placeholder}
        value={siteSettings?.[key] || ''}
        onChange={(e) => updateLandingSetting(key, e.target.value)}
        style={{ ...cmsInputStyle, minHeight, resize: 'vertical' }}
      />
    </label>
  );

  const cmsCardFields = (listKey, index, labels = { titleEn: 'Title EN', titleEs: 'Title ES', textEn: 'Text EN', textEs: 'Text ES' }) => {
    const item = siteSettings?.[listKey]?.[index] || {};
    return (
      <div key={`${listKey}-${index}`} style={{ borderTop: index === 0 ? 0 : '1px solid rgba(255,255,255,0.08)', paddingTop: index === 0 ? 0 : '12px', marginTop: index === 0 ? 0 : '12px' }}>
        <div style={{ color: '#38bdf8', fontSize: '0.72rem', fontWeight: 900, marginBottom: '8px', textTransform: 'uppercase' }}>Item {index + 1}</div>
        {Object.entries(labels).map(([fieldKey, label]) => (
          <label key={fieldKey} style={{ display: 'block' }}>
            <span style={cmsLabelStyle}>{label}</span>
            {['text', 'a', 'content', 'excerpt'].some((prefix) => fieldKey.toLowerCase().startsWith(prefix)) ? (
              <textarea
                value={item[fieldKey] || ''}
                onChange={(e) => updateLandingListItem(listKey, index, fieldKey, e.target.value)}
                style={{ ...cmsInputStyle, minHeight: 56, resize: 'vertical' }}
              />
            ) : (
              <input
                type="text"
                value={item[fieldKey] || ''}
                onChange={(e) => updateLandingListItem(listKey, index, fieldKey, e.target.value)}
                style={cmsInputStyle}
              />
            )}
          </label>
        ))}
      </div>
    );
  };

  const publicField = (pageId, label, key, placeholder = label) => (
    <label style={{ display: 'block' }}>
      <span style={cmsLabelStyle}>{label}</span>
      <input
        type="text"
        placeholder={placeholder}
        value={publicPageSettings?.[pageId]?.[key] || ''}
        onChange={(e) => updatePublicPageSetting(pageId, key, e.target.value)}
        style={cmsInputStyle}
      />
    </label>
  );

  const publicTextArea = (pageId, label, key, placeholder = label, minHeight = 70) => (
    <label style={{ display: 'block' }}>
      <span style={cmsLabelStyle}>{label}</span>
      <textarea
        placeholder={placeholder}
        value={publicPageSettings?.[pageId]?.[key] || ''}
        onChange={(e) => updatePublicPageSetting(pageId, key, e.target.value)}
        style={{ ...cmsInputStyle, minHeight, resize: 'vertical' }}
      />
    </label>
  );

  const publicCardFields = (pageId, listKey, index, labels = { titleEn: 'Title EN', titleEs: 'Title ES', textEn: 'Text EN', textEs: 'Text ES' }) => {
    const item = publicPageSettings?.[pageId]?.[listKey]?.[index] || {};
    return (
      <div key={`${pageId}-${listKey}-${index}`} style={{ borderTop: index === 0 ? 0 : '1px solid rgba(255,255,255,0.08)', paddingTop: index === 0 ? 0 : '12px', marginTop: index === 0 ? 0 : '12px' }}>
        <div style={{ color: '#38bdf8', fontSize: '0.72rem', fontWeight: 900, marginBottom: '8px', textTransform: 'uppercase' }}>Item {index + 1}</div>
        {Object.entries(labels).map(([fieldKey, label]) => (
          <label key={fieldKey} style={{ display: 'block' }}>
            <span style={cmsLabelStyle}>{label}</span>
            {['text', 'a', 'content', 'excerpt'].some((prefix) => fieldKey.toLowerCase().startsWith(prefix)) ? (
              <textarea
                value={item[fieldKey] || ''}
                onChange={(e) => updatePublicPageListItem(pageId, listKey, index, fieldKey, e.target.value)}
                style={{ ...cmsInputStyle, minHeight: 56, resize: 'vertical' }}
              />
            ) : (
              <input
                type="text"
                value={item[fieldKey] || ''}
                onChange={(e) => updatePublicPageListItem(pageId, listKey, index, fieldKey, e.target.value)}
                style={cmsInputStyle}
              />
            )}
          </label>
        ))}
      </div>
    );
  };

  const handleSaveBlog = async (e) => {
    e.preventDefault();
    setCmsSaveLoading(true);
    setCmsSaveStatus('');
    if (isSupabaseConfigured && supabase) {
      try {
        const isNew = !editingBlog.id;
        const payload = {
          slug: editingBlog.slug,
          title_en: editingBlog.title_en,
          title_es: editingBlog.title_es,
          excerpt_en: editingBlog.excerpt_en,
          excerpt_es: editingBlog.excerpt_es,
          content_en: editingBlog.content_en,
          content_es: editingBlog.content_es,
          image_url: editingBlog.image_url,
          published: editingBlog.published
        };
        
        let error;
        if (isNew) {
          const res = await supabase.from('blogs').insert(payload).select();
          error = res.error;
          if (!error && res.data) setBlogs([res.data[0], ...blogs]);
        } else {
          const res = await supabase.from('blogs').update(payload).eq('id', editingBlog.id).select();
          error = res.error;
          if (!error && res.data) setBlogs(blogs.map(b => b.id === editingBlog.id ? res.data[0] : b));
        }
        
        if (error) throw error;
        setCmsSaveStatus('success:Blog post saved successfully.');
        setEditingBlog(null);
      } catch (err) {
        console.error("Failed to save blog:", err);
        setCmsSaveStatus(`error:Failed to save blog (${err.message})`);
      }
    }
    setCmsSaveLoading(false);
    setTimeout(() => setCmsSaveStatus(''), 3000);
  };

  const handleDeleteBlog = async (id) => {
    const post = blogs.find((b) => b.id === id);
    if (!confirmDelete('blog post', [post?.title, post?.slug && `/${post.slug}`])) return;
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('blogs').delete().eq('id', id);
        setBlogs(blogs.filter(b => b.id !== id));
      } catch (err) {
        console.error("Failed to delete blog:", err);
      }
    }
  };

  // Prevent hydration mismatch by skipping SSR for admin portal entirely
  if (!mounted) return null;

  // Render Login Card if not logged in
  if (!isAuthenticated) {
    return (
      <div className="admin-layout" suppressHydrationWarning>
        <div className="admin-login-container">
          <div className="admin-login-card">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <img src="/logo.png" alt="Peptides Costa Rica Admin" style={{ maxHeight: '60px', width: 'auto', objectFit: 'contain', borderRadius: '12px', boxShadow: '0 2px 16px rgba(0,0,0,0.25)' }} />
            </div>
            <p>Admin Security Dashboard</p>
            
            {loginError && <div className="error-msg">{loginError}</div>}
            
            <form onSubmit={handleLogin}>
              <input 
                type="email" 
                placeholder="Admin Email Address" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input 
                type="password" 
                placeholder="Access Password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="submit" disabled={loginLoading}>
                {loginLoading ? (
                  <div className="sync-spinner" style={{ width: '16px', height: '16px' }}></div>
                ) : (
                  'Authenticate Access'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (profileLoading) {
    return (
      <div className="admin-layout" suppressHydrationWarning>
        <div className="admin-login-container">
          <div className="sync-spinner" style={{ width: '32px', height: '32px', marginBottom: '16px' }}></div>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Loading admin permissions...</p>
        </div>
      </div>
    );
  }

  if (isSupabaseConfigured && !adminProfile) {
    return (
      <div className="admin-layout" suppressHydrationWarning>
        <div className="admin-login-container">
          <div className="admin-login-card">
            <p>Access Denied</p>
            <div className="error-msg">Your account is not authorized for the admin dashboard.</div>
            <button type="button" onClick={handleLogout} style={{ marginTop: '16px' }}>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`admin-layout min-h-screen${sidebarCollapsed ? ' admin-sidebar-collapsed' : ''}`} suppressHydrationWarning>
      {/* Toast Alert Notification */}
      {toastMessage && (
        <div className="admin-toast" role="status" aria-live="polite">
          <Bell className="animate-bounce" size={20} />
          <span>{toastMessage}</span>
          <button type="button" className="admin-toast-close" onClick={() => setToastMessage('')} aria-label="Dismiss notification">
            <X size={18} />
          </button>
        </div>
      )}
      {/* Navbar Header */}
      <nav className="admin-navbar">
        <div className="admin-nav-top-row">
          <div className="admin-nav-logo-container">
            <img src="/logo.png" alt="Peptides Costa Rica Admin Logo" className="admin-logo-img" />
            <div className="db-status-indicator">
              <span className={`status-dot ${isDbConnected ? 'connected' : 'simulation'}`}></span>
              <span className="status-text">{isDbConnected ? 'Live Connection' : 'Simulation Mode'}</span>
            </div>
          </div>
          <div className="admin-nav-tools">
            <button
              type="button"
              className="admin-sidebar-toggle"
              onClick={() => setSidebarCollapsed((value) => !value)}
              aria-label={sidebarCollapsed ? 'Pin sidebar open' : 'Enable auto-hide sidebar'}
              title={sidebarCollapsed ? 'Pin sidebar open' : 'Enable auto-hide sidebar'}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            {!isSubUserProfile && (
              <>
                <button type="button" className="admin-search-trigger" onClick={() => setGlobalSearchOpen(true)}>
                  <Search size={14} />
                  <span className="admin-search-label">Search</span>
                  <kbd>⌘K</kbd>
                </button>
                <NotificationCenter
                  onNavigate={navigateToTab}
                  refreshKey={notifRefreshKey}
                  adminUserId={adminProfile?.user_id}
                />
              </>
            )}
          </div>
        </div>

        <div className="admin-nav-scroll-wrap">
          <div className="admin-nav-sections admin-nav-sections--desktop-focused">
            {desktopPrimaryTabIds.length > 0 && (
              <div className="admin-nav-section admin-nav-section--primary">
                <div className="admin-nav-section-title">Daily Work</div>
                <div className="admin-nav-section-items">
                  {desktopPrimaryTabIds.map(renderDesktopNavButton)}
                </div>
              </div>
            )}

            {desktopSecondaryGroups.length > 0 && (
              <details
                className="admin-nav-more-tools"
                open={desktopSecondaryGroups.some((group) => group.tabs.includes(activeTab)) || undefined}
              >
                <summary>
                  <span>More tools</span>
                  <ChevronDown size={14} />
                </summary>
                <div className="admin-nav-more-groups">
                  {desktopSecondaryGroups.map((group) => (
                    <div key={group.title} className="admin-nav-section admin-nav-section--secondary">
                      <div className="admin-nav-section-title">{group.title}</div>
                      <div className="admin-nav-section-items">
                        {group.tabs.map(renderDesktopNavButton)}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>

        {/* Bottom Pinned Admin Session Card */}
        <div className="admin-sidebar-footer">
          <div className="admin-user-info">
            <div className="admin-user-avatar">
              {adminProfile?.avatar_url ? (
                <img src={adminProfile.avatar_url} alt="" />
              ) : (
                adminProfile?.email?.charAt(0).toUpperCase() || 'A'
              )}
            </div>
            <div className="admin-user-details">
              <span className="admin-user-name" title={adminProfile?.email || 'Administrator'}>
                {adminProfile?.email ? adminProfile.email.split('@')[0] : 'Admin'}
              </span>
              <span className="admin-user-role">
                {adminProfile?.is_superadmin ? 'Super Admin' : 'Staff Agent'}
              </span>
            </div>
          </div>
          <div className="admin-session-actions">
            <button 
              className="admin-footer-btn" 
              onClick={() => setShowPasswordModal(true)} 
              title="Change Password"
            >
              <KeyRound size={14} />
            </button>
            <button 
              className="admin-footer-btn logout" 
              onClick={handleLogout} 
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Admin dashboard container */}
      <div className="admin-container">
        <header className="admin-page-header">
          <h1 className="admin-page-title">{ADMIN_TAB_TITLES[activeTab] || 'Admin'}</h1>
          {(() => {
            const subtitle = getAdminPageSubtitle(activeTab, {
              orders: visibleOrders,
              abandonedCarts,
              leads,
              reviews,
              isStaffAgent,
            });
            return subtitle ? <p className="admin-page-subtitle">{subtitle}</p> : null;
          })()}
        </header>

        {/* TAB 1: SPREADSHEET EDITOR */}
        {activeTab === 'home' && (
          isStaffAgent ? (
            <AgentDashboard
              currentUserProfile={adminProfile}
              currentUserEmail={adminProfile?.email}
              title="My Pay"
              onOpenOrder={setSelectedOrderDetails}
              onNavigate={navigateToTab}
            />
          ) : (
            <DashboardHome
              orders={orders}
              abandonedCarts={abandonedCarts}
              leads={leads}
              products={products}
              inquiryCount={inquiryCount}
              onNavigate={navigateToTab}
              onOpenOrder={setSelectedOrderDetails}
              onCreateOrder={() => setManualOrderOpen(true)}
            />
          )
        )}

        {activeTab === 'spreadsheet' && (
          <ErrorBoundary>
          <ProductsManager 
            products={products}
            productSearch={productSearch} setProductSearch={setProductSearch}
            isCsvOpen={isCsvOpen} setIsCsvOpen={setIsCsvOpen}
            csvDragActive={csvDragActive} handleCsvDrag={handleCsvDrag} 
            handleCsvDrop={handleCsvDrop} handleCsvFileSelect={handleCsvFileSelect}
            handleAddRow={handleAddRow} handleSaveChanges={handleSaveChanges} 
            saveLoading={saveLoading} saveStatus={saveStatus}
            setExportModalType={setExportModalType}
            csvStatus={csvStatus} setCsvStatus={setCsvStatus}
            loadingProducts={loadingProducts}
            highlightedProductId={highlightedProductId}
            handleCellChange={handleCellChange}
            exchangeRate={exchangeRate}
            exchangeRateUpdatedAt={exchangeRateUpdatedAt}
            bucketImages={bucketImages}
            getCategoryIcon={getCategoryIcon}
            handleImageCellUpload={handleImageCellUpload}
            setEditDescProduct={setEditDescProduct} setEditDescEn={setEditDescEn} 
            setEditDescEs={setEditDescEs} setEditDescModalOpen={setEditDescModalOpen}
            handleMoveRow={handleMoveRow} handleDeleteRow={handleDeleteRow}
            handleToggleHidden={handleToggleHidden}
          />
          </ErrorBoundary>
        )}

        {/* TAB 2: ORDERS LEDGER HISTORY */}
        {activeTab === 'orders' && (
          <ErrorBoundary>
          <OrdersManager 
            visibleOrders={visibleOrders}
            orderStatusFilter={orderStatusFilter} setOrderStatusFilter={setOrderStatusFilter}
            orderSearch={orderSearch} setOrderSearch={setOrderSearch}
            ordersPerPage={ordersPerPage} setOrdersPerPage={setOrdersPerPage}
            ordersCurrentPage={ordersCurrentPage} setOrdersCurrentPage={setOrdersCurrentPage}
            isStaffAgent={isStaffAgent}
            setManualOrderOpen={setManualOrderOpen}
            orders={orders}
            setExportModalType={setExportModalType}
            loadingOrders={loadingOrders}
            handleOrderStatusUpdate={handleOrderStatusUpdate}
            handleOrderSalesAgentUpdate={handleOrderSalesAgentUpdate}
            setSelectedOrderDetails={setSelectedOrderDetails}
            openWhatsAppComposer={openWhatsAppComposer}
            handleDeleteOrder={handleDeleteOrder}
            agents={agents}
            formatCustomerIdType={formatCustomerIdType}
            loggedInEmailRef={loggedInEmail}
            currentAgentName={adminProfile?.name || ''}
            currentAgentEmail={adminProfile?.email || ''}
          />
          </ErrorBoundary>
        )}

        {/* TAB 3: SHARE LINKS GENERATOR */}
        {activeTab === 'share' && (
          <div>
            <div className="admin-toolbar">
              <div>
                <h3>Share Links</h3>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
                  Save reusable tracked catalog links for ads, WhatsApp, bio pages, and one-time announcements.
                </p>
              </div>
            </div>

            <div className="order-card campaign-links-card" style={{ maxWidth: '840px', margin: '0 auto' }}>
              <div className="share-link-builder">
                <div className="share-select-row">
                  <div className="filter-group">
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800' }}>Preselected Language</label>
                    <select 
                      className="cell-select" 
                      value={shareLang}
                      onChange={(e) => setShareLang(e.target.value)}
                    >
                      <option value="es">Spanish / Español</option>
                      <option value="en">English / Inglés</option>
                    </select>
                  </div>
                  <div className="filter-group">
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800' }}>Preselected Currency</label>
                    <select 
                      className="cell-select" 
                      value={shareCurrency}
                      onChange={(e) => setShareCurrency(e.target.value)}
                    >
                      <option value="CRC">CRC / Colones Costarricenses</option>
                      <option value="USD">USD / Dólares Estadounidenses</option>
                    </select>
                  </div>
                  <div className="filter-group">
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800' }}>Specific Product</label>
                    <select 
                      className="cell-select" 
                      value={shareProduct}
                      onChange={(e) => setShareProduct(e.target.value)}
                    >
                      <option value="all">Entire Catalog</option>
                      {products.map(p => (
                        <option key={p.id || p.product} value={p.product}>
                          {p.product}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-group">
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800' }}>Tracking Source</label>
                    <select 
                      className="cell-select" 
                      value={shareSource}
                      onChange={(e) => setShareSource(e.target.value)}
                    >
                      <option value="none">None</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="facebook">Facebook</option>
                      <option value="instagram">Instagram</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="reddit">Reddit</option>
                      <option value="pinterest">Pinterest</option>
                    </select>
                  </div>
                  <div className="filter-group">
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800' }}>Tracking Medium</label>
                    <input 
                      type="text"
                      className="cell-select" 
                      style={{ 
                        background: '#172237',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        borderRadius: '4px',
                        padding: '6px 8px',
                        fontSize: '0.75rem',
                        outline: 'none',
                        width: '100%',
                        cursor: 'text'
                      }}
                      placeholder="e.g. cpc, bio, story, banner"
                      value={shareMedium}
                      onChange={(e) => setShareMedium(e.target.value)}
                    />
                  </div>
                  <div className="filter-group">
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800' }}>Tracking Campaign</label>
                    <input 
                      type="text"
                      className="cell-select" 
                      style={{ 
                        background: '#172237',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        borderRadius: '4px',
                        padding: '6px 8px',
                        fontSize: '0.75rem',
                        outline: 'none',
                        width: '100%',
                        cursor: 'text'
                      }}
                      placeholder="e.g. summer_promo"
                      value={shareCampaign}
                      onChange={(e) => setShareCampaign(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800', display: 'block', marginBottom: '8px' }}>Your Customized Share URL</label>
                  <div className="share-copy-wrapper">
                    <div className="share-url-box">{getShareUrl()}</div>
                    <button 
                      className="admin-btn admin-btn-primary" 
                      onClick={handleCopyLink}
                      style={{ padding: '0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      {shareCopied ? <Check size={16} /> : <Share2 size={16} />}
                      {shareCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="campaign-preset-panel">
                  <div className="campaign-preset-save">
                    <input
                      className="admin-input"
                      type="text"
                      placeholder="Preset name, e.g. Instagram July Bio"
                      value={sharePresetName}
                      onChange={(e) => setSharePresetName(e.target.value)}
                    />
                    <button type="button" className="admin-btn admin-btn-primary" onClick={handleSaveSharePreset}>
                      <Save size={15} /> {sharePresetSaved ? 'Saved' : 'Save preset'}
                    </button>
                  </div>
                  {sharePresets.length > 0 && (
                    <div className="campaign-preset-list">
                      {sharePresets.map(preset => (
                        <article key={preset.id} className="campaign-preset-card">
                          <div>
                            <strong>{preset.name}</strong>
                            <span>{[preset.source !== 'none' ? preset.source : 'catalog', preset.medium, preset.campaign].filter(Boolean).join(' / ')}</span>
                          </div>
                          <div className="campaign-preset-actions">
                            <button type="button" className="admin-btn" onClick={() => handleApplySharePreset(preset)}>
                              <Check size={13} /> Apply
                            </button>
                            <button type="button" className="admin-btn" onClick={() => navigator.clipboard.writeText(preset.url)}>
                              <Clipboard size={13} /> Copy
                            </button>
                            <button type="button" className="admin-btn campaign-preset-delete" onClick={() => handleDeleteSharePreset(preset.id)}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ background: 'rgba(0, 212, 255, 0.05)', border: '1px solid rgba(0, 212, 255, 0.1)', padding: '16px', borderRadius: '8px', fontSize: '0.8rem', color: '#cbd5e1', lineHeight: '1.5', marginTop: '16px' }}>
                  💡 **Sharing Pro-Tip:** Placing `lang=en` inside links will automatically translate all category names, buttons, and stock badges to English, and toggle the catalog to prioritize USD pricing immediately for international clients!
                  
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(0, 212, 255, 0.1)' }}>
                    <p style={{ margin: '0 0 8px 0', color: '#38bdf8', fontWeight: 'bold' }}>🧪 Live Testing Links (No analytics logged):</p>
                    <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <li>
                        <a href="https://catalog.peptidescostarica.net/catalog?admin_preview=true" target="_blank" rel="noopener noreferrer" style={{ color: '#34d399', textDecoration: 'none' }}>
                          https://catalog.peptidescostarica.net/catalog?admin_preview=true
                        </a>
                      </li>
                      <li>
                        <a href="https://peptidecosta.vercel.app/catalog?admin_preview=true" target="_blank" rel="noopener noreferrer" style={{ color: '#34d399', textDecoration: 'none' }}>
                          https://peptidecosta.vercel.app/catalog?admin_preview=true
                        </a>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'carts' && (
          
          loadingAbandonedCarts ? (
            <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px', padding: '60px 20px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', marginTop: '20px' }}>
              <div className="sync-spinner" style={{ color: '#38bdf8', marginBottom: '15px' }}><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg></div>
              <h3 style={{ color: '#f8fafc', margin: 0, fontSize: '1.1rem' }}>Loading Carts...</h3>
              <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: '0.85rem' }}>Fetching the latest abandoned carts.</p>
            </div>
          ) : (
            <ErrorBoundary>
            <CartsManager 
            setSelectedCartDetails={setSelectedCartDetails}
            abandonedCarts={abandonedCarts}
            handleClearAllCarts={handleClearAllCarts}
            loadAdminData={loadAdminData}
            setExportModalType={setExportModalType}
            generatingCartsAi={generatingCartsAi}
            cartsAiText={cartsAiText}
            setCartsAiText={setCartsAiText}
            handleGenerateCartsAi={handleGenerateCartsAi}
            bulkProcessing={bulkProcessing}
            handleBulkEmail={handleBulkEmail}
            handleBulkWhatsApp={handleBulkWhatsApp}
            handleBulkDelete={handleBulkDelete}
            handleSelectCart={handleSelectCart}
            handleSelectMultipleCarts={handleSelectMultipleCarts}
            selectedCarts={selectedCartIds}
            handleSendRecoveryEmail={handleSendRecoveryEmail}
            handleDeleteCart={handleDeleteCart}
            onOpenCustomerProfile={openCustomerProfileHandoff}
            onWhatsAppClick={openWhatsAppComposer}
          />
            </ErrorBoundary>
          )
        )}

        
        {activeTab === 'reviews' && (
          loadingReviews ? (
            <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px', padding: '60px 20px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', marginTop: '20px' }}>
              <div className="sync-spinner" style={{ color: '#fbbf24', marginBottom: '15px' }}><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></div>
              <h3 style={{ color: '#f8fafc', margin: 0, fontSize: '1.1rem' }}>Loading Reviews...</h3>
            </div>
          ) : (
            <div className="admin-orders-tab">
          
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#f8fafc', margin: 0 }}>Product Reviews Moderation</h2>
              <button className="admin-btn" onClick={loadAdminData} style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}>
                Refresh
              </button>
            </div>

            <div className="reviews-filter-bar">
              <label>
                <span>Status</span>
                <select value={reviewStatusFilter} onChange={(e) => setReviewStatusFilter(e.target.value)}>
                  <option value="Pending">Pending first</option>
                  <option value="Approved">Approved</option>
                  <option value="All">All reviews</option>
                </select>
              </label>
              <label>
                <span>Product</span>
                <select value={reviewProductFilter} onChange={(e) => setReviewProductFilter(e.target.value)}>
                  <option value="all">All products</option>
                  {reviewProducts.map(productName => (
                    <option key={productName} value={productName}>{productName}</option>
                  ))}
                </select>
              </label>
            </div>
            
            {loadingReviews ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading reviews...</div>
            ) : reviews.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8' }}>
                No reviews found.
              </div>
            ) : visibleReviews.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8' }}>
                No reviews match these filters.
              </div>
            ) : (
              <>
              <div className="review-mobile-list admin-mobile-only">
                {visibleReviews.map(r => (
                  <article key={r.id} className={`review-mobile-card ${r.status === 'Pending' ? 'pending' : 'approved'}`}>
                    <div className="review-mobile-top">
                      <div>
                        <strong>{r.product_name}</strong>
                        <span>{r.customer_name} · {new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                      <span className="review-status-pill">{r.status}</span>
                    </div>
                    <div className="review-public-preview">
                      <div className="review-preview-stars">
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star key={star} size={13} fill={star <= r.rating ? '#fbbf24' : 'transparent'} color="#fbbf24" />
                        ))}
                      </div>
                      <p>{r.comment}</p>
                      <small>Public preview: {r.customer_name || 'Customer'} on {r.product_name}</small>
                    </div>
                    <textarea
                      className="review-moderation-reason"
                      placeholder="Moderation reason or note..."
                      value={reviewModerationReasons[r.id] || ''}
                      onChange={(e) => setReviewModerationReasons(prev => ({ ...prev, [r.id]: e.target.value }))}
                    />
                    <div className="review-mobile-actions">
                      {r.status !== 'Approved' && (
                        <button type="button" className="admin-btn review-approve-btn" onClick={() => handleApproveReview(r.id)}>
                          <Check size={13} /> Approve
                        </button>
                      )}
                      <button type="button" className="admin-btn review-delete-btn" onClick={() => handleDeleteReview(r.id)}>
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="spreadsheet-container admin-desktop-table">
                <table className="spreadsheet-table responsive-table">
                  <thead>
                    <tr>
                      <th style={{ width: '100px' }}>Date</th>
                      <th style={{ width: '180px' }}>Product</th>
                      <th style={{ width: '150px' }}>Author</th>
                      <th style={{ width: '100px', textAlign: 'center' }}>Rating</th>
                      <th style={{ minWidth: '300px' }}>Review Comment</th>
                      <th style={{ minWidth: '220px' }}>Public Preview / Reason</th>
                      <th style={{ width: '90px', textAlign: 'center' }}>Status</th>
                      <th style={{ width: '160px', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleReviews.map(r => (
                      <tr key={r.id} style={{ opacity: r.status === 'Approved' ? 0.75 : 1 }}>
                        <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ fontWeight: 'bold' }}>{r.product_name}</td>
                        <td>{r.customer_name}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star key={star} size={12} fill={star <= r.rating ? '#fbbf24' : 'transparent'} color="#fbbf24" />
                            ))}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                           <div style={{ maxHeight: '60px', overflowY: 'auto', paddingRight: '4px', lineHeight: '1.4' }}>
                             {r.comment}
                           </div>
                        </td>
                        <td>
                          <div className="review-public-preview desktop">
                            <div className="review-preview-stars">
                              {[1, 2, 3, 4, 5].map(star => (
                                <Star key={star} size={11} fill={star <= r.rating ? '#fbbf24' : 'transparent'} color="#fbbf24" />
                              ))}
                            </div>
                            <small>{r.customer_name || 'Customer'} on {r.product_name}</small>
                          </div>
                          <input
                            className="review-moderation-input"
                            placeholder="Moderation reason"
                            value={reviewModerationReasons[r.id] || ''}
                            onChange={(e) => setReviewModerationReasons(prev => ({ ...prev, [r.id]: e.target.value }))}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ 
                            background: r.status === 'Approved' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)', 
                            color: r.status === 'Approved' ? '#4ade80' : '#38bdf8', 
                            padding: '4px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold' 
                          }}>
                            {r.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            {r.status !== 'Approved' && (
                              <button onClick={() => handleApproveReview(r.id)} style={{ padding: '6px 10px', background: 'rgba(22, 163, 74, 0.15)', color: '#4ade80', border: '1px solid rgba(22, 163, 74, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                Approve
                              </button>
                            )}
                            <button onClick={() => handleDeleteReview(r.id)} style={{ padding: '6px 10px', background: 'rgba(220, 38, 38, 0.15)', color: '#f87171', border: '1px solid rgba(220, 38, 38, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
          )
        )}

        {/* TAB: Deal of the Week */}
        {activeTab === 'deals' && (
          <DealOfWeekPanel
            products={products}
            onSendAnnouncement={(draft) => {
              // Launching a deal only drafts the announcement. Handing it to the
              // Announcements panel keeps the actual send behind that screen's
              // audience picker and confirmation, so no single click can mail
              // the whole customer list.
              setBroadcastDraft(draft);
              navigateToTab('broadcasts');
            }}
          />
        )}

        {/* TAB: One-Time Announcements */}
        {activeTab === 'broadcasts' && (
          <BroadcastsPanel
            products={products}
            draft={broadcastDraft}
            onDraftApplied={() => setBroadcastDraft(null)}
          />
        )}

        {activeTab === 'messenger' && (
          <div className="admin-orders-tab">
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              {[
                { id: 'inbox', label: 'Facebook Inbox', count: null, Icon: MessageCircle },
                { id: 'posts', label: 'Facebook Posts', count: null, Icon: Megaphone },
                { id: 'alerts', label: 'Facebook Alerts', count: facebookNotifications.filter(n => n.status === 'unread').length, Icon: Bell },
              ].map((v) => {
                const Icon = v.Icon;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setFbView(v.id);
                      const query = new URLSearchParams({ tab: 'messenger' });
                      if (v.id !== 'inbox') query.set('view', v.id);
                      router.replace(`/admin?${query.toString()}`, { scroll: false });
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '7px',
                      padding: '9px 18px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
                      border: '1px solid ' + (fbView === v.id ? '#1877f2' : 'rgba(255,255,255,0.1)'),
                      background: fbView === v.id ? '#1877f2' : 'transparent',
                      color: fbView === v.id ? '#fff' : '#94a3b8',
                    }}
                  >
                    <Icon size={14} aria-hidden />
                    {v.label}
                    {v.count > 0 && (
                      <span style={{
                        minWidth: 18,
                        padding: '1px 6px',
                        borderRadius: 999,
                        background: fbView === v.id ? 'rgba(255,255,255,0.24)' : 'rgba(14,165,233,0.16)',
                        color: fbView === v.id ? '#fff' : '#38bdf8',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        textAlign: 'center',
                      }}>
                        {v.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {fbView === 'posts' ? <MessengerPosts /> : fbView === 'alerts' ? null : <MessengerInbox />}
          </div>
        )}

        {activeTab === 'messenger' && fbView === 'alerts' && (
          <div className="admin-orders-tab">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MessageCircle size={22} style={{ color: '#0ea5e9' }} /> Facebook Alerts
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
                  Lead ads, comment alerts, and Messenger events that need review.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                {facebookNotifications.some(n => n.status === 'unread') && (
                  <button 
                    className="admin-btn" 
                    onClick={handleMarkAllNotificationsRead} 
                    style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(14, 165, 233, 0.15)', border: '1px solid rgba(14, 165, 233, 0.3)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}
                  >
                    Mark All Read
                  </button>
                )}
                <button 
                  className="admin-btn" 
                  onClick={loadAdminData} 
                  style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}
                >
                  Refresh
                </button>
              </div>
            </div>

            {/* Filter toolbar */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
              {['All', 'unread', 'lead', 'message', 'comment'].map(filterVal => {
                const label = filterVal === 'All' ? 'All Alerts' : filterVal === 'unread' ? 'Unread Only' : filterVal.charAt(0).toUpperCase() + filterVal.slice(1) + 's';
                const isActive = fbFilter === filterVal;
                
                // Count unread for that category
                let count = 0;
                if (filterVal === 'All') count = facebookNotifications.length;
                else if (filterVal === 'unread') count = facebookNotifications.filter(n => n.status === 'unread').length;
                else count = facebookNotifications.filter(n => n.type === filterVal).length;

                return (
                  <button
                    key={filterVal}
                    onClick={() => setFbFilter(filterVal)}
                    style={{
                      background: isActive ? '#0284c7' : '#0f172a',
                      color: isActive ? 'white' : '#94a3b8',
                      border: `1px solid ${isActive ? '#0284c7' : 'rgba(255,255,255,0.08)'}`,
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {label}
                    <span style={{ 
                      fontSize: '0.7rem', 
                      background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(148,163,184,0.1)', 
                      color: isActive ? 'white' : '#64748b', 
                      padding: '2px 6px', 
                      borderRadius: '10px' 
                    }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {loadingFbNotifications ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading alerts...</div>
            ) : facebookNotifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 40px', background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8' }}>
                <Bell size={40} style={{ color: '#475569', marginBottom: '12px' }} />
                <h3 style={{ margin: '0 0 4px 0', color: '#cbd5e1' }}>No Facebook Alerts Found</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>When Facebook Webhook triggers, alerts will instantly appear here.</p>
              </div>
            ) : (() => {
              const filtered = facebookNotifications.filter(n => {
                if (fbFilter === 'All') return true;
                if (fbFilter === 'unread') return n.status === 'unread';
                return n.type === fbFilter;
              });

              if (filtered.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '40px', background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8' }}>
                    No alerts match the selected filter.
                  </div>
                );
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {filtered.map(item => {
                    const isUnread = item.status === 'unread';
                    
                    // Style mapping based on type
                    let typeLabel = 'Alert';
                    let typeColor = '#64748b';
                    let typeBg = 'rgba(100, 116, 139, 0.15)';
                    let IconComponent = Bell;

                    if (item.type === 'lead') {
                      typeLabel = 'Lead Form';
                      typeColor = '#10b981';
                      typeBg = 'rgba(16, 185, 129, 0.15)';
                      IconComponent = Users;
                    } else if (item.type === 'message') {
                      typeLabel = 'Messenger';
                      typeColor = '#0ea5e9';
                      typeBg = 'rgba(14, 165, 233, 0.15)';
                      IconComponent = MessageSquare;
                    } else if (item.type === 'comment') {
                      typeLabel = 'Comment';
                      typeColor = '#ec4899';
                      typeBg = 'rgba(236, 72, 153, 0.15)';
                      IconComponent = MessageCircle;
                    }

                    return (
                      <div
                        key={item.id}
                        id={`facebook-notification-${item.id}`}
                        className={focusedFacebookNotificationId === String(item.id) ? 'facebook-notification-focused' : ''}
                        style={{
                          background: isUnread ? 'rgba(14, 165, 233, 0.05)' : '#0e1626',
                          borderRadius: '12px',
                          border: `1px solid ${isUnread ? 'rgba(14, 165, 233, 0.2)' : 'rgba(255,255,255,0.05)'}`,
                          borderLeft: isUnread ? '4px solid #0ea5e9' : '1px solid rgba(255,255,255,0.05)',
                          padding: '16px 20px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '20px',
                          flexWrap: 'wrap',
                          transition: 'all 0.2s ease',
                          opacity: isUnread ? 1 : 0.8
                        }}
                      >
                        <div style={{ display: 'flex', gap: '16px', flex: '1', minWidth: '280px' }}>
                          <div style={{ 
                            background: typeBg, 
                            color: typeColor, 
                            width: '40px', 
                            height: '40px', 
                            borderRadius: '10px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <IconComponent size={20} />
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '0.95rem' }}>
                                {item.sender_name || 'Facebook Visitor'}
                              </span>
                              <span style={{ 
                                color: typeColor, 
                                background: typeBg, 
                                padding: '2px 8px', 
                                borderRadius: '12px', 
                                fontSize: '0.7rem', 
                                fontWeight: 'bold',
                                textTransform: 'uppercase'
                              }}>
                                {typeLabel}
                              </span>
                              {isUnread && (
                                <span style={{ 
                                  color: '#0284c7', 
                                  background: 'rgba(2, 132, 199, 0.15)', 
                                  padding: '2px 8px', 
                                  borderRadius: '12px', 
                                  fontSize: '0.7rem', 
                                  fontWeight: 'bold' 
                                }}>
                                  New
                                </span>
                              )}
                            </div>

                            <p style={{ color: '#cbd5e1', fontSize: '0.85rem', margin: '8px 0', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                              {item.content}
                            </p>

                            {/* Additional metadata for Lead Ads */}
                            {item.type === 'lead' && (item.email || item.phone) && (
                              <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px', flexWrap: 'wrap' }}>
                                {item.email && (
                                  <span>📧 {item.email}</span>
                                )}
                                {item.phone && (
                                  <span>📞 {item.phone}</span>
                                )}
                              </div>
                            )}

                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              🕒 {new Date(item.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {/* Actions buttons */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {item.external_link && (
                            <a 
                              href={item.external_link} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              style={{ 
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '6px 12px', 
                                background: 'rgba(255,255,255,0.05)', 
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#f8fafc',
                                textDecoration: 'none',
                                borderRadius: '8px', 
                                fontSize: '0.75rem', 
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                              onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            >
                              Open in Meta
                            </a>
                          )}
                          {isUnread && (
                            <button 
                              onClick={() => handleMarkNotificationRead(item.id)} 
                              style={{ padding: '6px 12px', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                            >
                              Mark Read
                            </button>
                          )}
                          {item.type === 'message' && (
                            <button
                              onClick={() => setFbReplyId(fbReplyId === item.id ? null : item.id)}
                              style={{ padding: '6px 12px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                            >
                              {fbReplyId === item.id ? 'Cancel' : 'Reply'}
                            </button>
                          )}
                          {item.type === 'comment' && (
                            <button
                              onClick={() => setFbReplyId(fbReplyId === item.id ? null : item.id)}
                              title="Send a private message to the person who commented"
                              style={{ padding: '6px 12px', background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6', border: '1px solid rgba(236, 72, 153, 0.3)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                            >
                              {fbReplyId === item.id ? 'Cancel' : 'Send DM'}
                            </button>
                          )}
                          <button 
                            onClick={() => handleDeleteNotification(item.id)} 
                            style={{ 
                              padding: '6px 8px', 
                              background: 'rgba(220, 38, 38, 0.15)', 
                              color: '#f87171', 
                              border: '1px solid rgba(220, 38, 38, 0.3)', 
                              borderRadius: '8px', 
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title="Delete Alert"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        
                        {/* Inline Reply Box */}
                        {fbReplyId === item.id && (
                          <div style={{ width: '100%', marginTop: '12px', display: 'flex', gap: '8px' }}>
                            <input
                              type="text"
                              value={fbReplyText}
                              onChange={(e) => setFbReplyText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSendFbReply(item);
                              }}
                              placeholder="Type your reply here..."
                              style={{ 
                                flex: '1', 
                                padding: '10px 14px', 
                                borderRadius: '8px', 
                                border: '1px solid rgba(255,255,255,0.1)', 
                                background: '#1e293b', 
                                color: '#f8fafc',
                                fontSize: '0.9rem'
                              }}
                              autoFocus
                            />
                            <button
                              onClick={() => handleSendFbReply(item)}
                              disabled={fbReplyLoading || !fbReplyText.trim()}
                              style={{
                                padding: '10px 20px',
                                borderRadius: '8px',
                                background: fbReplyLoading || !fbReplyText.trim() ? '#475569' : '#3b82f6',
                                color: '#fff',
                                fontWeight: 'bold',
                                border: 'none',
                                cursor: fbReplyLoading || !fbReplyText.trim() ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}
                            >
                              {fbReplyLoading ? 'Sending...' : (
                                <>
                                  <Send size={16} /> Send
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* TAB: CMS */}
        {activeTab === 'cms' && (
          <div className="admin-orders-tab">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#f8fafc', margin: 0 }}><FileText size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'text-bottom', color: '#38bdf8' }} /> Content Management System</h2>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="admin-btn" onClick={loadAdminData} style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}>
                  Refresh
                </button>
              </div>
            </div>

            {cmsSaveStatus && (
              <div style={{ 
                padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.8rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px',
                background: cmsSaveStatus.startsWith('error') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                border: `1px solid ${cmsSaveStatus.startsWith('error') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`,
                color: cmsSaveStatus.startsWith('error') ? '#f87171' : '#4ade80'
              }}>
                {cmsSaveStatus.startsWith('error') ? <AlertCircle size={16} /> : <Check size={16} />}
                {cmsSaveStatus.replace(/^(error:|success:)/, '')}
              </div>
            )}

            <div className="cms-safety-panel">
              <div className="cms-preview-card">
                <div className="cms-panel-kicker">Draft preview</div>
                <h3>{siteSettings?.heroTitleEn || 'Landing page title'}</h3>
                <p>{siteSettings?.heroSubEn || 'Landing page subtitle preview'}</p>
                <small>{siteSettings?.heroTextEn || 'Hero description will preview here as you edit.'}</small>
              </div>
              <div className="cms-preview-card">
                <div className="cms-panel-kicker">Publish safety</div>
                <ul>
                  <li>Use full https:// links for external URLs; internal links can start with /.</li>
                  <li>Changes stay in draft fields until you press Save.</li>
                  <li>Blog posts still use their own published toggle.</li>
                </ul>
              </div>
              <div className="cms-preview-card">
                <div className="cms-panel-kicker">Recent changes</div>
                {cmsChangeHistory.length === 0 ? (
                  <p>No changes saved in this session.</p>
                ) : cmsChangeHistory.map(entry => (
                  <p key={`${entry.area}-${entry.at}`}><strong>{entry.area}</strong> saved {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
              
              {/* Landing Page Settings */}
              <div style={{ background: '#0e1626', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ fontSize: '1.1rem', color: '#f8fafc', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={18} color="#f59e0b" /> Landing Page Controls
                </h3>
                
                {loadingSettings ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Loading settings...</div>
                ) : siteSettings ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    


                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Running Promo Ticker</h4>
                      <p style={{ margin: '0 0 12px 0', color: '#94a3b8', fontSize: '0.76rem', lineHeight: 1.45 }}>
                        Shows as the moving blue banner on the landing page and catalog. Use plain text or a Markdown link; the storefront cleans it automatically.
                      </p>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#cbd5e1', fontSize: '0.82rem', marginBottom: '12px' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(siteSettings.bannerActive)}
                          onChange={(e) => updateLandingSetting('bannerActive', e.target.checked)}
                        />
                        Show running promo ticker
                      </label>
                      {cmsField('Ticker text EN', 'bannerTextEn')}
                      {cmsField('Ticker text ES', 'bannerTextEs')}
                      {cmsField('Banner link URL', 'catalogBannerUrl', '/catalog')}
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Hero</h4>
                      {cmsField('Hero kicker EN', 'heroKickerEn')}
                      {cmsField('Hero kicker ES', 'heroKickerEs')}
                      {cmsField('Hero title EN', 'heroTitleEn')}
                      {cmsField('Hero title ES', 'heroTitleEs')}
                      {cmsTextArea('Hero subtitle EN', 'heroSubEn')}
                      {cmsTextArea('Hero subtitle ES', 'heroSubEs')}
                      {cmsTextArea('Hero paragraph EN', 'heroTextEn')}
                      {cmsTextArea('Hero paragraph ES', 'heroTextEs')}
                      {cmsField('Hero image URL', 'heroImageUrl', '/catalog-promo-banner.webp')}
                      {cmsField('Hero dropdown label EN', 'heroDropdownLabelEn')}
                      {cmsField('Hero dropdown label ES', 'heroDropdownLabelEs')}
                      {cmsField('Hero dropdown placeholder EN', 'heroDropdownPlaceholderEn')}
                      {cmsField('Hero dropdown placeholder ES', 'heroDropdownPlaceholderEs')}
                      {(siteSettings.heroDropdownOptions || []).slice(0, 4).map((_, index) => cmsCardFields('heroDropdownOptions', index, { labelEn: 'Option label EN', labelEs: 'Option label ES', href: 'Option URL or whatsapp' }))}
                      {cmsField('Primary CTA EN', 'primaryCtaEn')}
                      {cmsField('Primary CTA ES', 'primaryCtaEs')}
                      {cmsField('WhatsApp CTA EN', 'secondaryCtaEn')}
                      {cmsField('WhatsApp CTA ES', 'secondaryCtaEs')}
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Press Band</h4>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#cbd5e1', fontSize: '0.82rem', marginBottom: '12px' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(siteSettings.pressActive)}
                          onChange={(e) => updateLandingSetting('pressActive', e.target.checked)}
                        />
                        Show press strip
                      </label>
                      {cmsField('Press button EN', 'pressCtaEn')}
                      {cmsField('Press button ES', 'pressCtaEs')}
                      <div style={{ color: '#64748b', fontSize: '0.72rem', margin: '12px 0 8px' }}>
                        One block per publication. Leave the logo URL blank to show the outlet name as text instead.
                      </div>
                      {(siteSettings.pressItems || []).slice(0, 4).map((_, index) => cmsCardFields('pressItems', index, {
                        outlet: 'Outlet name',
                        url: 'Article URL',
                        logoUrl: 'Logo URL (optional)',
                        titleEn: 'Headline EN',
                        titleEs: 'Headline ES',
                        quoteEn: 'Short quote EN',
                        quoteEs: 'Short quote ES',
                      }))}
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Difference Section</h4>
                      {cmsField('Section title EN', 'differenceTitleEn')}
                      {cmsField('Section title ES', 'differenceTitleEs')}
                      {cmsTextArea('Section text EN', 'differenceTextEn')}
                      {cmsTextArea('Section text ES', 'differenceTextEs')}
                      {(siteSettings.differenceCards || []).slice(0, 4).map((_, index) => cmsCardFields('differenceCards', index))}
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Offer Cards</h4>
                      {cmsField('Offer title EN', 'offerTitleEn')}
                      {cmsField('Offer title ES', 'offerTitleEs')}
                      {cmsTextArea('Offer text EN', 'offerTextEn')}
                      {cmsTextArea('Offer text ES', 'offerTextEs')}
                      {(siteSettings.offerCards || []).slice(0, 6).map((_, index) => cmsCardFields('offerCards', index))}
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Audience, Proof & Quality</h4>
                      {cmsField('Audience title EN', 'audienceTitleEn')}
                      {cmsField('Audience title ES', 'audienceTitleEs')}
                      {cmsTextArea('Audience text EN', 'audienceTextEn')}
                      {cmsTextArea('Audience text ES', 'audienceTextEs')}
                      {(siteSettings.audienceItems || []).slice(0, 4).map((_, index) => cmsCardFields('audienceItems', index))}
                      {cmsField('Proof title EN', 'proofTitleEn')}
                      {cmsField('Proof title ES', 'proofTitleEs')}
                      {cmsTextArea('Proof text EN', 'proofTextEn')}
                      {cmsTextArea('Proof text ES', 'proofTextEs')}
                      {cmsField('Proof image URL', 'proofImageUrl')}
                      {cmsField('Quality title EN', 'qualityTitleEn')}
                      {cmsField('Quality title ES', 'qualityTitleEs')}
                      {cmsTextArea('Quality text EN', 'qualityTextEn')}
                      {cmsTextArea('Quality text ES', 'qualityTextEs')}
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>FAQ, Bulk CTA & Footer</h4>
                      {cmsField('FAQ title EN', 'faqTitleEn')}
                      {cmsField('FAQ title ES', 'faqTitleEs')}
                      {(siteSettings.faqItems || []).slice(0, 4).map((_, index) => cmsCardFields('faqItems', index, { qEn: 'Question EN', qEs: 'Question ES', aEn: 'Answer EN', aEs: 'Answer ES' }))}
                      {cmsField('Bulk title EN', 'bulkTitleEn')}
                      {cmsField('Bulk title ES', 'bulkTitleEs')}
                      {cmsTextArea('Bulk text EN', 'bulkTextEn')}
                      {cmsTextArea('Bulk text ES', 'bulkTextEs')}
                      {cmsField('Bulk button EN', 'bulkButtonEn')}
                      {cmsField('Bulk button ES', 'bulkButtonEs')}
                      {cmsTextArea('Footer description EN', 'footerDescriptionEn', 'Footer description EN', 90)}
                      {cmsTextArea('Footer description ES', 'footerDescriptionEs', 'Footer description ES', 90)}
                      {cmsTextArea('Legal notice EN', 'legalNoticeEn', 'Legal notice EN', 120)}
                      {cmsTextArea('Legal notice ES', 'legalNoticeEs', 'Legal notice ES', 120)}
                      <h4 style={{ margin: '16px 0 12px 0', color: '#f8fafc', fontSize: '0.9rem' }}>Footer Quick Links</h4>
                      {(siteSettings.footerQuickLinks || []).slice(0, 5).map((_, index) => cmsCardFields('footerQuickLinks', index, { labelEn: 'Label EN', labelEs: 'Label ES', href: 'URL' }))}
                      <h4 style={{ margin: '16px 0 12px 0', color: '#f8fafc', fontSize: '0.9rem' }}>Footer Category Links</h4>
                      {(siteSettings.footerCategoryLinks || []).slice(0, 5).map((_, index) => cmsCardFields('footerCategoryLinks', index, { labelEn: 'Label EN', labelEs: 'Label ES', href: 'URL' }))}
                    </div>

                    <button onClick={handleSaveSiteSettings} disabled={cmsSaveLoading} className="admin-btn admin-btn-primary" style={{ padding: '12px', justifyContent: 'center' }}>
                      {cmsSaveLoading ? 'Publishing...' : <><Save size={16} /> Publish Landing Page</>}
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Public Page Settings */}
              <div style={{ background: '#0e1626', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', gridColumn: '1 / -1' }}>
                <h3 style={{ fontSize: '1.1rem', color: '#f8fafc', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={18} color="#38bdf8" /> Phase 3 Public Pages
                </h3>

                {loadingSettings ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Loading page settings...</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Info Center</h4>
                      {publicField('page_info_center', 'Hero title EN', 'heroTitleEn')}
                      {publicField('page_info_center', 'Hero title ES', 'heroTitleEs')}
                      {publicTextArea('page_info_center', 'Hero text EN', 'heroTextEn')}
                      {publicTextArea('page_info_center', 'Hero text ES', 'heroTextEs')}
                      {publicField('page_info_center', 'Search placeholder EN', 'searchPlaceholderEn')}
                      {publicField('page_info_center', 'Search placeholder ES', 'searchPlaceholderEs')}
                      <h4 style={{ margin: '16px 0 12px 0', color: '#f8fafc', fontSize: '0.9rem' }}>Hero Quick Links</h4>
                      {(publicPageSettings.page_info_center?.quickLinks || []).slice(0, 4).map((_, index) => publicCardFields('page_info_center', 'quickLinks', index, { labelEn: 'Label EN', labelEs: 'Label ES', href: 'URL' }))}
                      {publicField('page_info_center', 'Start title EN', 'startTitleEn')}
                      {publicField('page_info_center', 'Start title ES', 'startTitleEs')}
                      {(publicPageSettings.page_info_center?.steps || []).slice(0, 4).map((_, index) => publicCardFields('page_info_center', 'steps', index))}
                      {(publicPageSettings.page_info_center?.topics || []).slice(0, 6).map((_, index) => publicCardFields('page_info_center', 'topics', index))}
                      {publicField('page_info_center', 'COA title EN', 'coaTitleEn')}
                      {publicField('page_info_center', 'COA title ES', 'coaTitleEs')}
                      {publicTextArea('page_info_center', 'COA text EN', 'coaTextEn')}
                      {publicTextArea('page_info_center', 'COA text ES', 'coaTextEs')}
                      {(publicPageSettings.page_info_center?.coaLinks || []).slice(0, 3).map((_, index) => publicCardFields('page_info_center', 'coaLinks', index, { labelEn: 'Label EN', labelEs: 'Label ES', href: 'COA URL' }))}
                      {publicField('page_info_center', 'CTA title EN', 'ctaTitleEn')}
                      {publicField('page_info_center', 'CTA title ES', 'ctaTitleEs')}
                      {publicTextArea('page_info_center', 'CTA text EN', 'ctaTextEn')}
                      {publicTextArea('page_info_center', 'CTA text ES', 'ctaTextEs')}
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Affiliate Program</h4>
                      {publicField('page_affiliate_program', 'Hero title EN', 'heroTitleEn')}
                      {publicField('page_affiliate_program', 'Hero title ES', 'heroTitleEs')}
                      {publicTextArea('page_affiliate_program', 'Hero text EN', 'heroTextEn')}
                      {publicTextArea('page_affiliate_program', 'Hero text ES', 'heroTextEs')}
                      {publicField('page_affiliate_program', 'Hero image URL', 'heroImageUrl')}
                      {publicField('page_affiliate_program', 'Primary button EN', 'primaryButtonEn')}
                      {publicField('page_affiliate_program', 'Primary button ES', 'primaryButtonEs')}
                      {publicField('page_affiliate_program', 'Secondary button EN', 'secondaryButtonEn')}
                      {publicField('page_affiliate_program', 'Secondary button ES', 'secondaryButtonEs')}
                      {publicField('page_affiliate_program', 'Audience title EN', 'audienceTitleEn')}
                      {publicField('page_affiliate_program', 'Audience title ES', 'audienceTitleEs')}
                      {(publicPageSettings.page_affiliate_program?.audienceCards || []).slice(0, 4).map((_, index) => publicCardFields('page_affiliate_program', 'audienceCards', index))}
                      {publicField('page_affiliate_program', 'Benefits title EN', 'benefitsTitleEn')}
                      {publicField('page_affiliate_program', 'Benefits title ES', 'benefitsTitleEs')}
                      {(publicPageSettings.page_affiliate_program?.benefits || []).slice(0, 4).map((_, index) => publicCardFields('page_affiliate_program', 'benefits', index))}
                      {publicField('page_affiliate_program', 'FAQ title EN', 'faqTitleEn')}
                      {publicField('page_affiliate_program', 'FAQ title ES', 'faqTitleEs')}
                      {(publicPageSettings.page_affiliate_program?.faqItems || []).slice(0, 3).map((_, index) => publicCardFields('page_affiliate_program', 'faqItems', index, { qEn: 'Question EN', qEs: 'Question ES', aEn: 'Answer EN', aEs: 'Answer ES' }))}
                      {publicField('page_affiliate_program', 'Talk title EN', 'talkTitleEn')}
                      {publicField('page_affiliate_program', 'Talk title ES', 'talkTitleEs')}
                      {publicTextArea('page_affiliate_program', 'Talk text EN', 'talkTextEn')}
                      {publicTextArea('page_affiliate_program', 'Talk text ES', 'talkTextEs')}
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Blog Page & Placeholder Posts</h4>
                      {publicField('page_blog', 'Hero kicker EN', 'heroKickerEn')}
                      {publicField('page_blog', 'Hero kicker ES', 'heroKickerEs')}
                      {publicField('page_blog', 'Hero title EN', 'heroTitleEn')}
                      {publicField('page_blog', 'Hero title ES', 'heroTitleEs')}
                      {publicTextArea('page_blog', 'Hero text EN', 'heroTextEn')}
                      {publicTextArea('page_blog', 'Hero text ES', 'heroTextEs')}
                      {publicField('page_blog', 'Article CTA title EN', 'articleCtaTitleEn')}
                      {publicField('page_blog', 'Article CTA title ES', 'articleCtaTitleEs')}
                      {publicTextArea('page_blog', 'Article CTA text EN', 'articleCtaTextEn')}
                      {publicTextArea('page_blog', 'Article CTA text ES', 'articleCtaTextEs')}
                      {publicField('page_blog', 'Article CTA button EN', 'articleCtaButtonEn')}
                      {publicField('page_blog', 'Article CTA button ES', 'articleCtaButtonEs')}
                      {(publicPageSettings.page_blog?.fallbackPosts || []).slice(0, 3).map((_, index) => publicCardFields('page_blog', 'fallbackPosts', index, {
                        slug: 'Slug',
                        title_en: 'Title EN',
                        title_es: 'Title ES',
                        excerpt_en: 'Excerpt EN',
                        excerpt_es: 'Excerpt ES',
                        content_en: 'Content EN',
                        content_es: 'Content ES',
                        image_url: 'Image URL',
                        created_at: 'Date ISO',
                      }))}
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>About Us</h4>
                      {publicField('page_about', 'Hero kicker EN', 'heroKickerEn')}
                      {publicField('page_about', 'Hero kicker ES', 'heroKickerEs')}
                      {publicField('page_about', 'Hero title EN', 'heroTitleEn')}
                      {publicField('page_about', 'Hero title ES', 'heroTitleEs')}
                      {publicTextArea('page_about', 'Hero text EN', 'heroTextEn')}
                      {publicTextArea('page_about', 'Hero text ES', 'heroTextEs')}
                      <h4 style={{ margin: '16px 0 12px 0', color: '#f8fafc', fontSize: '0.9rem' }}>Principles</h4>
                      {(publicPageSettings.page_about?.principles || []).slice(0, 4).map((_, index) => publicCardFields('page_about', 'principles', index, { labelEn: 'Label EN', labelEs: 'Label ES' }))}
                      {publicField('page_about', 'Proof kicker EN', 'proofKickerEn')}
                      {publicField('page_about', 'Proof kicker ES', 'proofKickerEs')}
                      {publicField('page_about', 'Proof title EN', 'proofTitleEn')}
                      {publicField('page_about', 'Proof title ES', 'proofTitleEs')}
                      {publicTextArea('page_about', 'Proof text EN', 'proofTextEn')}
                      {publicTextArea('page_about', 'Proof text ES', 'proofTextEs')}
                      {publicField('page_about', 'Origin title EN', 'originTitleEn')}
                      {publicField('page_about', 'Origin title ES', 'originTitleEs')}
                      {publicTextArea('page_about', 'Origin text EN', 'originTextEn')}
                      {publicTextArea('page_about', 'Origin text ES', 'originTextEs')}
                      <h4 style={{ margin: '16px 0 12px 0', color: '#f8fafc', fontSize: '0.9rem' }}>Founders</h4>
                      {(publicPageSettings.page_about?.founders || []).slice(0, 2).map((_, index) => publicCardFields('page_about', 'founders', index, { name: 'Name', initials: 'Initials', roleEn: 'Role EN', roleEs: 'Role ES' }))}
                      {publicTextArea('page_about', 'Quote EN', 'quoteEn')}
                      {publicTextArea('page_about', 'Quote ES', 'quoteEs')}
                      {publicField('page_about', 'Quote author', 'quoteAuthor')}
                      {publicField('page_about', 'Problem title EN', 'problemTitleEn')}
                      {publicField('page_about', 'Problem title ES', 'problemTitleEs')}
                      {publicTextArea('page_about', 'Problem text EN', 'problemTextEn')}
                      {publicTextArea('page_about', 'Problem text ES', 'problemTextEs')}
                      {publicField('page_about', 'Today title EN', 'todayTitleEn')}
                      {publicField('page_about', 'Today title ES', 'todayTitleEs')}
                      {publicTextArea('page_about', 'Today text EN', 'todayTextEn')}
                      {publicTextArea('page_about', 'Today text ES', 'todayTextEs')}
                      {publicField('page_about', 'Process title EN', 'processTitleEn')}
                      {publicField('page_about', 'Process title ES', 'processTitleEs')}
                      {(publicPageSettings.page_about?.process || []).slice(0, 3).map((_, index) => publicCardFields('page_about', 'process', index))}
                      {publicField('page_about', 'CTA title EN', 'ctaTitleEn')}
                      {publicField('page_about', 'CTA title ES', 'ctaTitleEs')}
                      {publicTextArea('page_about', 'CTA text EN', 'ctaTextEn')}
                      {publicTextArea('page_about', 'CTA text ES', 'ctaTextEs')}
                      {publicField('page_about', 'Catalog button EN', 'ctaButtonEn')}
                      {publicField('page_about', 'Catalog button ES', 'ctaButtonEs')}
                      {publicField('page_about', 'WhatsApp button EN', 'contactButtonEn')}
                      {publicField('page_about', 'WhatsApp button ES', 'contactButtonEs')}
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>FAQ</h4>
                      {publicField('page_faq', 'Hero title EN', 'heroTitleEn')}
                      {publicField('page_faq', 'Hero title ES', 'heroTitleEs')}
                      <div style={{ color: '#64748b', fontSize: '0.72rem', margin: '12px 0 8px' }}>
                        Type {'{{whatsapp}}'} in an answer to insert the WhatsApp number.
                      </div>
                      {(publicPageSettings.page_faq?.faqItems || []).slice(0, 8).map((_, index) => publicCardFields('page_faq', 'faqItems', index, { qEn: 'Question EN', qEs: 'Question ES', aEn: 'Answer EN', aEs: 'Answer ES' }))}
                      {publicField('page_faq', 'CTA title EN', 'ctaTitleEn')}
                      {publicField('page_faq', 'CTA title ES', 'ctaTitleEs')}
                      {publicTextArea('page_faq', 'CTA text EN', 'ctaTextEn')}
                      {publicTextArea('page_faq', 'CTA text ES', 'ctaTextEs')}
                      {publicField('page_faq', 'CTA button EN', 'ctaButtonEn')}
                      {publicField('page_faq', 'CTA button ES', 'ctaButtonEs')}
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Bulk Discounts</h4>
                      {publicField('page_bulk_discounts', 'Hero title EN', 'heroTitleEn')}
                      {publicField('page_bulk_discounts', 'Hero title ES', 'heroTitleEs')}
                      {publicTextArea('page_bulk_discounts', 'Hero text EN', 'heroTextEn')}
                      {publicTextArea('page_bulk_discounts', 'Hero text ES', 'heroTextEs')}
                      <h4 style={{ margin: '16px 0 12px 0', color: '#f8fafc', fontSize: '0.9rem' }}>Discount Tiers</h4>
                      {(publicPageSettings.page_bulk_discounts?.tiers || []).slice(0, 3).map((_, index) => publicCardFields('page_bulk_discounts', 'tiers', index, { labelEn: 'Label EN', labelEs: 'Label ES', valueEn: 'Discount EN', valueEs: 'Discount ES', textEn: 'Text EN', textEs: 'Text ES' }))}
                      {publicField('page_bulk_discounts', 'Highlighted tier (0, 1 or 2)', 'featuredTierIndex')}
                      {publicField('page_bulk_discounts', 'Terms title EN', 'termsTitleEn')}
                      {publicField('page_bulk_discounts', 'Terms title ES', 'termsTitleEs')}
                      {(publicPageSettings.page_bulk_discounts?.terms || []).slice(0, 5).map((_, index) => publicCardFields('page_bulk_discounts', 'terms', index, { labelEn: 'Term EN', labelEs: 'Term ES' }))}
                      {publicField('page_bulk_discounts', 'CTA button EN', 'ctaButtonEn')}
                      {publicField('page_bulk_discounts', 'CTA button ES', 'ctaButtonEs')}
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>COA Database</h4>
                      {publicField('page_coa_database', 'Hero title EN', 'heroTitleEn')}
                      {publicField('page_coa_database', 'Hero title ES', 'heroTitleEs')}
                      {publicTextArea('page_coa_database', 'Hero text EN', 'heroTextEn')}
                      {publicTextArea('page_coa_database', 'Hero text ES', 'heroTextEs')}
                      {publicField('page_coa_database', 'How-to title EN', 'howTitleEn')}
                      {publicField('page_coa_database', 'How-to title ES', 'howTitleEs')}
                      {(publicPageSettings.page_coa_database?.points || []).slice(0, 4).map((_, index) => publicCardFields('page_coa_database', 'points', index))}
                      {publicField('page_coa_database', 'CTA button EN', 'ctaButtonEn')}
                      {publicField('page_coa_database', 'CTA button ES', 'ctaButtonEs')}
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Service Locations</h4>
                      {publicField('page_service_locations', 'Hero title EN', 'heroTitleEn')}
                      {publicField('page_service_locations', 'Hero title ES', 'heroTitleEs')}
                      {publicTextArea('page_service_locations', 'Hero text EN', 'heroTextEn')}
                      {publicTextArea('page_service_locations', 'Hero text ES', 'heroTextEs')}
                      {publicField('page_service_locations', 'Coverage title EN', 'coverageTitleEn')}
                      {publicField('page_service_locations', 'Coverage title ES', 'coverageTitleEs')}
                      <h4 style={{ margin: '16px 0 12px 0', color: '#f8fafc', fontSize: '0.9rem' }}>Provinces</h4>
                      {(publicPageSettings.page_service_locations?.provinces || []).slice(0, 7).map((_, index) => publicCardFields('page_service_locations', 'provinces', index, { labelEn: 'Label EN', labelEs: 'Label ES' }))}
                      {publicTextArea('page_service_locations', 'Courier text EN', 'courierTextEn')}
                      {publicTextArea('page_service_locations', 'Courier text ES', 'courierTextEs')}
                      {publicField('page_service_locations', 'CTA button EN', 'ctaButtonEn')}
                      {publicField('page_service_locations', 'CTA button ES', 'ctaButtonEs')}
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Contact</h4>
                      {publicField('page_contact', 'Hero kicker EN', 'heroKickerEn')}
                      {publicField('page_contact', 'Hero kicker ES', 'heroKickerEs')}
                      {publicField('page_contact', 'Hero title EN', 'heroTitleEn')}
                      {publicField('page_contact', 'Hero title ES', 'heroTitleEs')}
                      {publicTextArea('page_contact', 'Hero text EN', 'heroTextEn')}
                      {publicTextArea('page_contact', 'Hero text ES', 'heroTextEs')}
                      <h4 style={{ margin: '16px 0 12px 0', color: '#f8fafc', fontSize: '0.9rem' }}>Hero Points</h4>
                      {(publicPageSettings.page_contact?.heroPoints || []).slice(0, 3).map((_, index) => publicCardFields('page_contact', 'heroPoints', index, { labelEn: 'Label EN', labelEs: 'Label ES' }))}
                      {publicField('page_contact', 'Success title EN', 'successTitleEn')}
                      {publicField('page_contact', 'Success title ES', 'successTitleEs')}
                      {publicTextArea('page_contact', 'Success text EN', 'successTextEn')}
                      {publicTextArea('page_contact', 'Success text ES', 'successTextEs')}
                      {publicField('page_contact', 'Success button EN', 'successButtonEn')}
                      {publicField('page_contact', 'Success button ES', 'successButtonEs')}
                      {publicField('page_contact', 'Methods kicker EN', 'methodsKickerEn')}
                      {publicField('page_contact', 'Methods kicker ES', 'methodsKickerEs')}
                      {publicField('page_contact', 'Methods title EN', 'methodsTitleEn')}
                      {publicField('page_contact', 'Methods title ES', 'methodsTitleEs')}
                      {publicTextArea('page_contact', 'WhatsApp card text EN', 'whatsappTextEn')}
                      {publicTextArea('page_contact', 'WhatsApp card text ES', 'whatsappTextEs')}
                      {publicField('page_contact', 'WhatsApp button EN', 'whatsappButtonEn')}
                      {publicField('page_contact', 'WhatsApp button ES', 'whatsappButtonEs')}
                      {publicTextArea('page_contact', 'Email card text EN', 'emailTextEn')}
                      {publicTextArea('page_contact', 'Email card text ES', 'emailTextEs')}
                      {publicField('page_contact', 'Email button EN', 'emailButtonEn')}
                      {publicField('page_contact', 'Email button ES', 'emailButtonEs')}
                    </div>

                    <button onClick={handleSavePublicPages} disabled={cmsSaveLoading} className="admin-btn admin-btn-primary" style={{ padding: '12px', justifyContent: 'center', gridColumn: '1 / -1' }}>
                      {cmsSaveLoading ? 'Publishing...' : <><Save size={16} /> Publish Public Pages</>}
                    </button>
                  </div>
                )}
              </div>

              {/* Business Links Settings */}
              <div style={{ background: '#0e1626', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ fontSize: '1.1rem', color: '#f8fafc', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Link2 size={18} color="#3b82f6" /> Global Business Links
                </h3>
                
                {loadingSettings ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Loading settings...</div>
                ) : businessLinks ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Contact Settings</h4>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>WhatsApp Number (Numbers Only e.g. 50684046973)</label>
                        <input type="text" value={businessLinks.whatsappNumber} onChange={e => setBusinessLinks({...businessLinks, whatsappNumber: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>WhatsApp Display Text (e.g. +506 8404-6973)</label>
                        <input type="text" value={businessLinks.whatsappDisplay} onChange={e => setBusinessLinks({...businessLinks, whatsappDisplay: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>US WhatsApp / Phone Number (Numbers Only)</label>
                        <input type="text" value={businessLinks.apiWhatsAppNumber || ''} onChange={e => setBusinessLinks({...businessLinks, apiWhatsAppNumber: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>US Display Text</label>
                        <input type="text" value={businessLinks.apiWhatsAppDisplay || ''} onChange={e => setBusinessLinks({...businessLinks, apiWhatsAppDisplay: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Support Email</label>
                        <input type="text" value={businessLinks.supportEmail} onChange={e => setBusinessLinks({...businessLinks, supportEmail: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Social & Map URLs</h4>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Google Maps URL</label>
                        <input type="text" value={businessLinks.googleMapsUrl} onChange={e => setBusinessLinks({...businessLinks, googleMapsUrl: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Facebook URL (Optional)</label>
                        <input type="text" value={businessLinks.facebookUrl} onChange={e => setBusinessLinks({...businessLinks, facebookUrl: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Instagram URL (Optional)</label>
                        <input type="text" value={businessLinks.instagramUrl} onChange={e => setBusinessLinks({...businessLinks, instagramUrl: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                      <div style={{ marginTop: '8px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Trustpilot Review URL - English</label>
                        <input type="text" value={businessLinks.trustpilotUrlEn || businessLinks.trustpilotUrl || ''} onChange={e => setBusinessLinks({...businessLinks, trustpilotUrl: e.target.value, trustpilotUrlEn: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                      <div style={{ marginTop: '8px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Trustpilot Review URL - Spanish</label>
                        <input type="text" value={businessLinks.trustpilotUrlEs || ''} onChange={e => setBusinessLinks({...businessLinks, trustpilotUrlEs: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                      <div style={{ marginTop: '8px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Google Review URL (Optional)</label>
                        <input type="text" value={businessLinks.googleReviewUrl || ''} onChange={e => setBusinessLinks({...businessLinks, googleReviewUrl: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                      <div style={{ marginTop: '8px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Facebook Review URL (Optional)</label>
                        <input type="text" value={businessLinks.facebookReviewUrl || ''} onChange={e => setBusinessLinks({...businessLinks, facebookReviewUrl: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                    </div>

                    <button onClick={handleSaveBusinessLinks} disabled={cmsSaveLoading} className="admin-btn admin-btn-primary" style={{ padding: '12px', justifyContent: 'center' }}>
                      {cmsSaveLoading ? 'Publishing...' : <><Save size={16} /> Publish Business Links</>}
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Blog Manager */}
              <div style={{ background: '#0e1626', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '1.1rem', color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LayoutDashboard size={18} color="#10b981" /> Blog Post Manager
                  </h3>
                  <button className="admin-btn admin-btn-accent" onClick={() => setEditingBlog({ slug: '', title_en: '', title_es: '', excerpt_en: '', excerpt_es: '', content_en: '', content_es: '', image_url: '', published: false })}>
                    <Plus size={16} /> New Post
                  </button>
                </div>

                {loadingBlogs ? (
                   <div style={{ color: '#94a3b8' }}>Loading blogs...</div>
                ) : blogs.length === 0 ? (
                   <div style={{ color: '#64748b', fontSize: '0.9rem', fontStyle: 'italic' }}>No blog posts found. Create your first post!</div>
                ) : (
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                     {blogs.map(b => (
                       <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#172237', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                         <div>
                           <div style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: '0.95rem' }}>{b.title_en}</div>
                           <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>/{b.slug} &bull; {b.published ? <span style={{ color: '#4ade80' }}>Published</span> : <span style={{ color: '#f59e0b' }}>Draft</span>}</div>
                         </div>
                         <div style={{ display: 'flex', gap: '8px' }}>
                           <button onClick={() => setEditingBlog(b)} className="admin-btn" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>Edit</button>
                           <button onClick={() => handleDeleteBlog(b.id)} className="admin-btn" style={{ padding: '6px 10px', fontSize: '0.8rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}><Trash2 size={14}/></button>
                         </div>
                       </div>
                     ))}
                   </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'team_chat' && (
          <div className="admin-team-chat-shell admin-tab-panel">
            <TeamChat profile={adminProfile} />
          </div>
        )}

        {/* TAB: ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="admin-orders-tab admin-tab-panel">
            
            {(loadingOrders || loadingProducts || loadingAbandonedCarts) ? (
              <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px', padding: '60px 20px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', marginTop: '20px' }}>
                <div className="sync-spinner" style={{ color: '#38bdf8', marginBottom: '15px' }}><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg></div>
                <h3 style={{ color: '#f8fafc', margin: 0, fontSize: '1.1rem' }}>Loading Analytics...</h3>
                <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: '0.85rem' }}>Crunching numbers and fetching the latest data.</p>
              </div>
            ) : (
              <ErrorBoundary>
              <AnalyticsDashboard orders={orders} abandonedCarts={abandonedCarts} products={products} productViews={productViews} onNavigate={navigateToTab} />
              </ErrorBoundary>
            )}

          </div>
        )}

        {/* TAB: CUSTOMERS CRM */}
        {activeTab === 'customers' && (
          <div className="admin-orders-tab admin-tab-panel">
            
            {loadingOrders ? (
              <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px', padding: '60px 20px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', marginTop: '20px' }}>
                <div className="sync-spinner" style={{ color: '#38bdf8', marginBottom: '15px' }}><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></div>
                <h3 style={{ color: '#f8fafc', margin: 0, fontSize: '1.1rem' }}>Loading Customers...</h3>
                <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: '0.85rem' }}>Fetching customer data from orders.</p>
              </div>
            ) : (
              <ErrorBoundary>
              <CustomersCRM 

              orders={orders} 
              abandonedCarts={abandonedCarts} 
              agentProfiles={agentProfiles} 
              onWhatsAppClick={(recipient) => openWhatsAppComposer(recipient)} 
            />
              </ErrorBoundary>
            )}
          </div>
        )}

        {activeTab === 'live_chat' && (
          <div className="admin-orders-tab admin-tab-panel">
            <ErrorBoundary>
              <LiveChatInbox />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 'leads' && (
          <ErrorBoundary><LeadsManager 
            leads={leads}
            orders={orders}
            agentProfiles={agentProfiles}
            agents={agents}
            loadingLeads={loadingLeads}
            loadAdminData={loadAdminData}
            setExportModalType={setExportModalType}
            generatingLeadsAi={generatingLeadsAi}
            leadsAiText={leadsAiText}
            setLeadsAiText={setLeadsAiText}
            handleGenerateLeadsAi={handleGenerateLeadsAi}
            getLeadConversion={getLeadConversion}
            handleSelectLead={handleSelectLead}
            handleSelectMultipleLeads={handleSelectMultipleLeads}
            handleSelectAllLeads={handleSelectAllLeads}
            selectedLeads={selectedLeads}
            handleBulkLeadsEmail={handleBulkLeadsEmail}
            handleBulkLeadsWhatsApp={handleBulkLeadsWhatsApp}
            handleBulkDeleteLeads={handleBulkDeleteLeads}
            handleLeadUpdate={handleLeadUpdate}
            handleLeadDelete={handleLeadDelete}
            handleLeadFieldUpdate={handleLeadFieldUpdate}
            leadsSearch={leadsSearch}
            setLeadsSearch={setLeadsSearch}
            leadsSourceFilter={leadsSourceFilter}
            setLeadsSourceFilter={setLeadsSourceFilter}
            leadsAreaFilter={leadsAreaFilter}
            setLeadsAreaFilter={setLeadsAreaFilter}
            page={leadsCurrentPage}
            setPage={setLeadsCurrentPage}
            leadsPerPage={leadsPerPage}
            productViews={productViews}
            setSelectedLeadDetails={setSelectedLeadDetails}
            openLeadOutreachComposer={openLeadOutreachComposer}
            getReferralLabel={getReferralLabel}
            getReferralBadgeStyles={getReferralBadgeStyles}
            formatRelativeTime={formatRelativeTime}
            setSelectedOrderDetails={setSelectedOrderDetails}
            onOpenCustomerProfile={openCustomerProfileHandoff}
          />
          </ErrorBoundary>
        )}

        {activeTab === 'prospects' && (
          <ErrorBoundary>
            <ProspectorManager currentUserProfile={adminProfile} />
          </ErrorBoundary>
        )}

        {activeTab === 'team' && (
          <div className="admin-orders-tab admin-tab-panel">
            <TeamManagement currentUserProfile={adminProfile} currentUserEmail={loggedInEmail.current} onTeamChanged={fetchAgents} />
          </div>
        )}

        {/* TAB: AFFILIATES */}
        {activeTab === 'marketing' && (
          <div className="admin-orders-tab admin-tab-panel">
            <ErrorBoundary>
            <EmailMarketingStudio />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 'wa_session' && (
          <div className="admin-orders-tab admin-tab-panel" style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '0' }}>
            {/* Session status card */}
            <div style={{ padding: '20px 20px 0' }}>
              <WhatsAppSession />
            </div>
            {/* Full Baileys inbox */}
            <div style={{ flex: 1, minHeight: 0 }}>
              <WhatsAppInbox
                whatsappMessages={whatsappMessages.filter(m => getWhatsAppMessageSource(m) === 'baileys_session')}
                whatsappConversations={whatsappConversations}
                whatsappAgents={whatsappAgents}
                whatsappTemplates={APPROVED_WHATSAPP_AGENT_TEMPLATES}
                conversationRoutingAvailable={whatsappConversationRoutingAvailable}
                conversationRoutingError={whatsappConversationLoadError}
                onConversationAction={handleWhatsAppConversationAction}
                orders={orders}
                leads={leads}
                abandonedCarts={abandonedCarts}
                loadingWhatsappMessages={loadingWhatsappMessages}
                whatsappSettings={whatsappSettings}
                setWhatsappSettings={setWhatsappSettings}
                handleSaveWhatsappSettings={handleSaveWhatsappSettings}
                savingWaSettings={savingWaSettings}
                activeChatWaId={baileysActiveChatWaId}
                setActiveChatWaId={setBaileysActiveChatWaId}
                chatInputText={baileysChatInputText}
                setChatInputText={setBaileysChatInputText}
                handleSendLiveWhatsappMessage={handleSendBaileysMessage}
                handleDraftAiChatReply={handleDraftAiChatReply}
                draftingAiReply={draftingAiReply}
                loadAdminData={loadAdminData}
                seenMap={seenMap}
                markSeen={markSeen}
                // (Baileys might not support image upload through same mechanism easily, but we'll pass it anyway)
                uploadingWaImage={uploadingWaImage}
                handleWaImageUpload={handleWaImageUpload}
                sendingMessage={sendingBaileysMsg}
                sendFeedback={baileysSendFeedback}
                onDismissSendFeedback={() => setBaileysSendFeedback({ status: 'idle', message: '' })}
                currentUserEmail={loggedInEmail.current}
                onOpenCustomerProfile={openCustomerProfileHandoff}
              />
            </div>
          </div>
        )}

        {activeTab === 'affiliates' && (
          <div className="admin-orders-tab" style={{ padding: '20px 0' }}>
            <AffiliatesManager products={products} />
          </div>
        )}

        {activeTab === 'my_qr' && (
          <div className="admin-orders-tab">
            <MyReferralQr />
            {/* Owner-only: every rep's QR in one place, for printing cards.
                Lives under the personal QR so there is a single tab anyone
                goes to for "where is my link". */}
            {adminProfile?.is_superadmin && (
              <ErrorBoundary>
                <TeamQrCodes />
              </ErrorBoundary>
            )}
          </div>
        )}

        {/* TAB: MY EARNINGS — the sub-user tier's own screen. Same analytics as
            staff "My Pay", trimmed of salary and store-wide figures. */}
        {activeTab === 'my_earnings' && (
          <div className="admin-orders-tab admin-tab-panel">
            <ErrorBoundary>
              <AgentDashboard
                variant="sub_user"
                title="My Earnings"
                currentUserProfile={adminProfile}
                currentUserEmail={loggedInEmail.current}
                onNavigate={navigateToTab}
              />
            </ErrorBoundary>
          </div>
        )}

        {/* TAB: MY TEAM — staff recruit and track their sub-users; the owner
            approves them from the same screen. */}
        {activeTab === 'my_team' && (
          <div className="admin-orders-tab admin-tab-panel" style={{ padding: '20px 0' }}>
            <ErrorBoundary>
              <MyTeamManager currentUserProfile={adminProfile} onTeamChanged={fetchAgents} />
            </ErrorBoundary>
          </div>
        )}

        {/* TAB: CUSTOMER INQUIRIES */}
        {activeTab === 'inquiries' && (
          <div className="admin-orders-tab" style={{ padding: '20px 0' }}>
            <InquiriesManager
              adminEmail={loggedInEmail.current}
              products={products}
              onOpenCustomerProfile={openCustomerProfileHandoff}
              onCreateOrderFromInquiry={() => setManualOrderOpen(true)}
              onNavigate={navigateToTab}
              onWhatsAppClick={openWhatsAppComposer}
            />
          </div>
        )}

        {/* TAB: AI COPILOT */}
        {activeTab === 'ai' && (
          <div className="admin-split-layout admin-copilot-layout">
            
            {/* Left Column: Preset Utilities & Quick Actions */}
            <div className="admin-split-sidebar" style={{ background: '#0e1626', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#f8fafc', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🧬 Copilot Presets</h3>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>Click any preset to draft instant marketing or support copy.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h4 style={{ fontSize: '0.75rem', fontWeight: '800', color: '#38bdf8', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '4px' }}>💬 WhatsApp & CRM</h4>
                
                <button 
                  onClick={() => setAiInputText("Draft a polite WhatsApp message to recover an abandoned cart containing BPC-157. Include a friendly 10% discount hook.")}
                  style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px', fontSize: '0.75rem', color: '#cbd5e1', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  🛒 BPC-157 Cart Recovery
                </button>
                
                <button 
                  onClick={() => setAiInputText("Draft a WhatsApp order confirmation message in Spanish, thanking the customer and mentioning their order is being prepared for fast courier shipment.")}
                  style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px', fontSize: '0.75rem', color: '#cbd5e1', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  📦 Order Confirmed (ES)
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h4 style={{ fontSize: '0.75rem', fontWeight: '800', color: '#c084fc', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '4px' }}>✍️ Content Marketing</h4>
                
                <button 
                  onClick={() => setAiInputText("Write an educational newsletter in English explaining the synergistic benefits of combining BPC-157 and TB-500 for connective tissue repair.")}
                  style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px', fontSize: '0.75rem', color: '#cbd5e1', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  📰 BPC & TB Synergies
                </button>

                <button 
                  onClick={() => setAiInputText("Draft a short, engaging scientific Instagram caption in Spanish for Semaglutide, emphasizing metabolic research, safety, and pure laboratory testing.")}
                  style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px', fontSize: '0.75rem', color: '#cbd5e1', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  📸 Semaglutide Promo (ES)
                </button>
              </div>

              <div style={{ marginTop: 'auto', padding: '12px', background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.1)', borderRadius: '10px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#38bdf8', display: 'block', marginBottom: '4px' }}>💡 Dashboard Context:</span>
                <span style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block' }}>Copilot is fed your active products list and orders metrics, enabling it to reference real catalog details in drafts automatically!</span>
              </div>
            </div>

            {/* Right Column: Premium AI Chat Console */}
            <div className="admin-split-main" style={{ background: '#0e1626', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              
              {/* Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} style={{ color: '#38bdf8' }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#f8fafc' }}>Active E-Commerce Copilot Session</span>
                </div>
                <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', fontSize: '0.65rem', padding: '3px 8px', borderRadius: '20px', fontWeight: 'bold', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                  ● Gemini Flash Online
                </span>
              </div>

              {/* Chat Stream */}
              <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '420px', minHeight: '400px' }}>
                {aiChatMessages.map((msg, index) => (
                  <div 
                    key={index}
                    style={{ 
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '80%',
                      background: msg.role === 'user' ? '#1d4ed8' : 'rgba(255,255,255,0.03)',
                      border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.05)',
                      color: '#f8fafc',
                      borderRadius: msg.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                      padding: '12px 16px',
                      fontSize: '0.85rem',
                      lineHeight: '1.5',
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    <div style={{ fontSize: '0.65rem', color: msg.role === 'user' ? '#93c5fd' : '#38bdf8', fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase' }}>
                      {msg.role === 'user' ? 'You (Administrator)' : '🧬 Costa Peptides Copilot'}
                    </div>
                    {msg.text}
                  </div>
                ))}

                {aiLoading && (
                  <div style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px 12px 12px 0', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <div style={{ width: '6px', height: '6px', background: '#38bdf8', borderRadius: '50%' }} />
                      <div style={{ width: '6px', height: '6px', background: '#38bdf8', borderRadius: '50%' }} />
                      <div style={{ width: '6px', height: '6px', background: '#38bdf8', borderRadius: '50%' }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Thinking...</span>
                  </div>
                )}
              </div>

              {/* Chat Input Console */}
              <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <textarea
                  value={aiInputText}
                  onChange={(e) => setAiInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendAiChatMessage();
                    }
                  }}
                  placeholder="Ask Copilot anything..."
                  style={{ flex: 1, height: '44px', background: '#172237', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '8px', padding: '10px 14px', fontSize: '0.85rem', outline: 'none', resize: 'none', fontFamily: 'inherit' }}
                />
                <button
                  className="admin-btn admin-btn-primary"
                  disabled={aiLoading || !aiInputText.trim()}
                  onClick={handleSendAiChatMessage}
                  style={{ height: '44px', padding: '0 20px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px', opacity: (aiLoading || !aiInputText.trim()) ? 0.5 : 1 }}
                >
                  <Send size={14} /> Send
                </button>
              </div>

            </div>
          </div>
        )}

        {/* TAB: WHATSAPP AI INBOX */}
        {activeTab === 'whatsapp_ai' && (
          <div className="admin-whatsapp-workspace">
            <WhatsAppInbox
              whatsappMessages={whatsappMessages}
              whatsappConversations={whatsappConversations}
              whatsappAgents={whatsappAgents}
              whatsappTemplates={APPROVED_WHATSAPP_AGENT_TEMPLATES}
              conversationRoutingAvailable={whatsappConversationRoutingAvailable}
              conversationRoutingError={whatsappConversationLoadError}
              onConversationAction={handleWhatsAppConversationAction}
              orders={orders}
              leads={leads}
              abandonedCarts={abandonedCarts}
              loadingWhatsappMessages={loadingWhatsappMessages}
              whatsappSettings={whatsappSettings}
              setWhatsappSettings={setWhatsappSettings}
              handleSaveWhatsappSettings={handleSaveWhatsappSettings}
              savingWaSettings={savingWaSettings}
              activeChatWaId={activeChatWaId}
              setActiveChatWaId={setActiveChatWaId}
              chatInputText={chatInputText}
              setChatInputText={setChatInputText}
              handleSendLiveWhatsappMessage={handleSendLiveWhatsappMessage}
              handleSendWhatsappTemplate={handleSendLiveWhatsappTemplate}
              handleDraftAiChatReply={handleDraftAiChatReply}
              draftingAiReply={draftingAiReply}
              loadAdminData={loadAdminData}
              seenMap={seenMap}
              markSeen={markSeen}
              uploadingWaImage={uploadingWaImage}
              handleWaImageUpload={handleWaImageUpload}
              sendFeedback={liveWaSendFeedback}
              sendingMessage={liveWaSendFeedback.status === 'sending'}
              onDismissSendFeedback={() => setLiveWaSendFeedback({ status: 'idle', message: '' })}
              currentUserEmail={loggedInEmail.current}
              onOpenCustomerProfile={openCustomerProfileHandoff}
            />
            <div className="admin-whatsapp-analytics-shell">
              <WhatsAppAnalyticsPanel />
            </div>
          </div>
        )}
      </div>

      {/* Lead Details Modal */}
      {selectedLeadDetails && (() => {
        const currentLead = leads.find(l => l.id === selectedLeadDetails.id) || selectedLeadDetails;
        return (
        <div className="modal active" onClick={() => setSelectedLeadDetails(null)} style={{ zIndex: 210 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%', maxHeight: '90vh', overflowY: 'auto', background: '#0e1626', color: '#f8fafc', borderRadius: '16px', padding: '30px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <button className="close-modal" onClick={() => setSelectedLeadDetails(null)} style={{ color: '#94a3b8', fontSize: '1.5rem', top: '20px', right: '20px', background: 'none', border: 'none', cursor: 'pointer' }}>&times;</button>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div style={{ padding: '10px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '12px', color: '#38bdf8', fontSize: '1.5rem' }}>👤</div>
              <div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#f8fafc', margin: 0 }}>Lead Profile</h2>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>ID: {currentLead.id}</span>
              </div>
            </div>

            {/* Profile Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* SECTION: CONTACT & BASICS */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ fontSize: '0.8rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px', marginTop: 0, letterSpacing: '0.05em' }}>Contact Details</h3>
                <div className="admin-form-grid-2">
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Method</label>
                    <span style={{ 
                      background: currentLead.contact_method === 'whatsapp' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)', 
                      color: currentLead.contact_method === 'whatsapp' ? '#4ade80' : '#38bdf8', 
                      padding: '4px 10px', 
                      borderRadius: '20px', 
                      fontSize: '0.75rem', 
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      display: 'inline-block',
                      border: currentLead.contact_method === 'whatsapp' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)'
                    }}>{currentLead.contact_method}</span>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Value</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#f8fafc' }}>{currentLead.contact_value}</span>
                      {currentLead.contact_method === 'whatsapp' ? (
                        <button 
                          onClick={() => openLeadOutreachComposer(currentLead, 'whatsapp')}
                          style={{
                            color: '#4ade80',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(34, 197, 94, 0.1)',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            fontSize: '0.8rem',
                            border: '1px solid rgba(34, 197, 94, 0.2)',
                            cursor: 'pointer'
                          }}
                          title="Open AI WhatsApp Outreach Composer"
                        >
                          💬
                        </button>
                      ) : (
                        <button 
                          onClick={() => openLeadOutreachComposer(currentLead, 'email')}
                          style={{
                            color: '#38bdf8',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(56, 189, 248, 0.1)',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            fontSize: '0.8rem',
                            border: '1px solid rgba(56, 189, 248, 0.2)',
                            cursor: 'pointer'
                          }}
                          title="Open AI Email Outreach Composer"
                        >
                          ✉️
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Captured On</label>
                    <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{new Date(currentLead.created_at).toLocaleString()}</span>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Language</label>
                    <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 'bold' }}>{currentLead.language ? currentLead.language.toUpperCase() : 'EN'}</span>
                  </div>
                </div>
              </div>

              {/* SECTION: GEOGRAPHICAL DETAILS */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ fontSize: '0.8rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px', marginTop: 0, letterSpacing: '0.05em' }}>Geographic Insights</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>IP Address</label>
                    <span style={{ fontSize: '0.85rem', color: '#f8fafc', fontFamily: 'monospace' }}>🌐 {currentLead.ip_address || 'Not captured'}</span>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Location</label>
                    <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: '600' }}>
                      📍 {[currentLead.city, currentLead.region, currentLead.country].filter(Boolean).join(', ') || 'Not captured'}
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION: ATTRIBUTION & CAMPAIGN */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ fontSize: '0.8rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px', marginTop: 0, letterSpacing: '0.05em' }}>Marketing Attribution</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Attribution Source</label>
                      <span style={{ 
                        ...getReferralBadgeStyles(getReferralLabel(currentLead)),
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        display: 'inline-block'
                      }}>{getReferralLabel(currentLead)}</span>
                    </div>
                    {currentLead.utm_campaign && (
                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>UTM Campaign</label>
                        <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 'bold' }}>📢 {currentLead.utm_campaign}</span>
                      </div>
                    )}
                  </div>
                  
                  {currentLead.utm_source && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>UTM Source</label>
                        <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{currentLead.utm_source}</span>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>UTM Medium</label>
                        <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{currentLead.utm_medium || '—'}</span>
                      </div>
                    </div>
                  )}

                  {currentLead.referrer && (
                    <div>
                      <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>HTTP Referrer</label>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', wordBreak: 'break-all', display: 'block', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: '6px' }}>
                        {currentLead.referrer}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION: CRM CONSULTATION NOTES */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ fontSize: '0.8rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', marginTop: 0, letterSpacing: '0.05em' }}>CRM Consultation Notes</h3>
                <textarea
                  value={currentLead.notes || ''}
                  onChange={(e) => handleLeadFieldUpdate(currentLead.id, 'notes', e.target.value)}
                  placeholder="Type manual follow-up consultation notes here... (e.g. wants Semaglutide bulk pricing, call back on Friday)"
                  style={{
                    width: '100%',
                    height: '90px',
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    padding: '10px',
                    fontSize: '0.8rem',
                    color: '#f8fafc',
                    resize: 'vertical',
                    outline: 'none',
                    fontFamily: 'sans-serif'
                  }}
                />
                <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>📝 Notes auto-save to database & local backup as you type.</span>
              </div>

              {/* SECTION: AI OUTREACH ASSISTANT */}
              <div style={{ 
                background: 'linear-gradient(135deg, rgba(14, 26, 51, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)', 
                padding: '20px', 
                borderRadius: '16px', 
                border: '1px solid rgba(56, 189, 248, 0.25)',
                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' }}>
                  <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '6px', borderRadius: '8px', color: '#38bdf8' }}>
                    <Brain size={16} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: '800', color: '#f8fafc', margin: 0 }}>🧬 Personalized AI Outreach Copilot</h3>
                    <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Gemini drafts target-aware pitches using browsing history</span>
                  </div>
                </div>

                {/* Show Last Contacted Status & Anti-Spam warning */}
                <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8' }}>Last contacted:</span>
                  {(() => {
                    if (!currentLead.last_contacted_at) {
                      return <span style={{ color: '#64748b', fontWeight: 'bold' }}>Never</span>;
                    }
                    const contactedDate = new Date(currentLead.last_contacted_at);
                    const diffDays = Math.floor((new Date() - contactedDate) / (1000 * 60 * 60 * 24));
                    const isRecent = diffDays < 3;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                        <span style={{ color: isRecent ? '#fbbf24' : '#4ade80', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {isRecent ? '⚠️ ' : '✅ '}{formatRelativeTime(currentLead.last_contacted_at)}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: '#64748b' }}>({contactedDate.toLocaleDateString()} {contactedDate.toLocaleTimeString(undefined, {hour: '2-digit', minute:'2-digit'})})</span>
                      </div>
                    );
                  })()}
                </div>

                {(() => {
                  if (currentLead.last_contacted_at) {
                    const contactedDate = new Date(currentLead.last_contacted_at);
                    const isRecent = (new Date() - contactedDate) < 259200000; // < 3 days
                    if (isRecent) {
                      return (
                        <div style={{ marginBottom: '16px', padding: '10px 14px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '10px', color: '#fbbf24', fontSize: '0.75rem', lineHeight: '1.4', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <span>⚠️</span>
                          <div>
                            <strong>Spam Prevention Alert:</strong> This lead was contacted recently ({formatRelativeTime(currentLead.last_contacted_at)}). Please verify if another follow-up is necessary to avoid spamming the prospect.
                          </div>
                        </div>
                      );
                    }
                  }
                  return null;
                })()}

                {isLocalAiDraft && individualAiText && (
                  <div style={{ 
                    marginBottom: '12px', 
                    padding: '10px 12px', 
                    background: 'rgba(56, 189, 248, 0.1)', 
                    border: '1px solid rgba(56, 189, 248, 0.25)', 
                    borderRadius: '8px', 
                    color: '#38bdf8', 
                    fontSize: '0.75rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    lineHeight: '1.3'
                  }}>
                    <span>✨</span>
                    <span><strong>Local Failover Engine Active:</strong> Gemini is currently busy. A target-aware, highly-converting research sales copy was generated locally to avoid interrupting your outreach.</span>
                  </div>
                )}

                {individualAiText ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ 
                      background: 'rgba(0,0,0,0.3)', 
                      padding: '12px', 
                      borderRadius: '10px', 
                      border: '1px solid rgba(255,255,255,0.04)',
                      fontSize: '0.8rem',
                      lineHeight: '1.5',
                      color: '#cbd5e1',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '180px',
                      overflowY: 'auto',
                      fontFamily: 'sans-serif'
                    }}>
                      {individualAiText}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(individualAiText);
                          alert('Outreach text copied to clipboard!');
                        }}
                        className="admin-btn admin-btn-secondary"
                      >
                        <Clipboard size={12} /> Copy
                      </button>
                      {currentLead.contact_method === 'whatsapp' ? (
                        <button
                          onClick={async () => {
                            const formattedPhone = cleanPhoneNumber(currentLead.contact_value);
                            try {
                              const res = await adminFetch('/api/whatsapp/send', {
                                method: 'POST',
                                body: JSON.stringify({
                                  to: formattedPhone,
                                  message: individualAiText,
                                  customerName: currentLead.name || currentLead.contact_value || 'Lead',
                                }),
                              });
                              const data = await res.json();
                              if (!res.ok || !data.success) {
                                throw new Error(data.error || 'WhatsApp delivery failed');
                              }
                              await logOutreachToNotes(currentLead, 'whatsapp', individualAiText);
                              await handleMarkAsContacted(currentLead.id);
                              alert('WhatsApp sent from the business number and logged in Sales WhatsApp.');
                              loadAdminData();
                            } catch (err) {
                              console.error(err);
                              alert('Could not send WhatsApp from the business number: ' + err.message);
                            }
                          }}
                          className="admin-btn admin-btn-success"
                        >
                          <Send size={12} /> Send WhatsApp
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSendEmailOutreach(currentLead, individualAiText)}
                          disabled={emailSending}
                          className="admin-btn admin-btn-primary"
                          style={{ opacity: emailSending ? 0.6 : 1 }}
                        >
                          {emailSending ? 'Sending email...' : <><Mail size={12} /> Send Email</>}
                        </button>
                      )}
                      <button
                        onClick={() => setIndividualAiText('')}
                        className="admin-btn admin-btn-secondary"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 12px 0' }}>Generate a hyper-personalized outbound draft matching their peptide interests, language, and geography.</p>
                    <button
                      onClick={() => handleGenerateIndividualAi(currentLead)}
                      disabled={generatingIndividualAi}
                      className="admin-btn admin-btn-primary"
                      style={{ margin: '0 auto' }}
                    >
                      {generatingIndividualAi ? (
                        <>
                          <div className="sync-spinner" style={{ width: '12px', height: '12px', border: '2px solid transparent', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', marginRight: '4px' }}></div>
                          Drafting pitch...
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} /> Generate Custom Outreach
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* SECTION: PRODUCT VIEWS (BEHAVIOR) */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', maxHeight: '300px', overflowY: 'auto' }}>
                <h3 style={{ fontSize: '0.8rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px', marginTop: 0, letterSpacing: '0.05em' }}>Browsing Behavior ({productViews.filter(v => v.contact_value === currentLead.contact_value).length} views)</h3>
                {(() => {
                  const views = productViews.filter(v => v.contact_value === currentLead.contact_value);
                  if (views.length === 0) {
                    return <span style={{ color: '#64748b', fontSize: '0.85rem' }}>No catalog products viewed yet.</span>;
                  }
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {views.map((v, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(56, 189, 248, 0.05)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
                          <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 'bold' }}>{v.product_name}</span>
                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            {v.viewed_at ? new Date(v.viewed_at).toLocaleTimeString() : 'Viewed'}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

            </div>
          </div>
        </div>
      );
      })()}

      {selectedOrderDetails && (
        <OrderDetailPanel
          order={selectedOrderDetails}
          products={products}
          onClose={() => setSelectedOrderDetails(null)}
          onUpdated={handleOrderUpdated}
          onStatusChange={handleOrderStatusUpdate}
          onTrackingChange={handleOrderTrackingUpdate}
          agents={agents}
          affiliates={orderAffiliates}
          isSuperadmin={!!adminProfile?.is_superadmin}
        />
      )}

      {!isSubUserProfile && (
        <GlobalSearch
          open={globalSearchOpen}
          onClose={() => setGlobalSearchOpen(false)}
          orders={visibleOrders}
          products={canNavigateToTab('spreadsheet') ? products : []}
          leads={leads}
          canAccessTab={canNavigateToTab}
          onSelect={handleGlobalSearchSelect}
        />
      )}

      <ManualOrderModal
        open={manualOrderOpen}
        onClose={() => setManualOrderOpen(false)}
        products={products}
        onCreated={handleManualOrderCreated}
      />

      {selectedCartDetails && (
        <AbandonedCartEditPanel
          cart={selectedCartDetails}
          products={products}
          onClose={() => setSelectedCartDetails(null)}
          onSaved={(updated) => {
            setAbandonedCarts((prev) => prev.map((c) => (c.session_id === updated.session_id ? updated : c)));
            setSelectedCartDetails(updated);
          }}
          onDeleted={(sessionId) => {
            setAbandonedCarts((prev) => prev.filter((c) => c.session_id !== sessionId));
            setSelectedCartDetails(null);
          }}
        />
      )}

      {/* Blog Editor Modal */}
      {editingBlog && (
        <div className="modal active" onClick={() => setEditingBlog(null)} style={{ zIndex: 200 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%', maxHeight: '90vh', overflowY: 'auto', background: '#0e1626', color: '#f8fafc' }}>
            <button className="close-modal" onClick={() => setEditingBlog(null)} style={{ color: '#94a3b8' }}>&times;</button>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#f8fafc', marginBottom: '20px' }}>{editingBlog.id ? 'Edit Blog Post' : 'New Blog Post'}</h2>
            
            <form onSubmit={handleSaveBlog} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Slug (URL path)</label>
                  <input required type="text" value={editingBlog.slug} onChange={e => setEditingBlog({...editingBlog, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')})} placeholder="e.g. what-are-peptides" style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Cover Image</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="text" 
                        value={editingBlog.image_url} 
                        onChange={e => setEditingBlog({...editingBlog, image_url: e.target.value})} 
                        placeholder="Image URL (https://...)" 
                        style={{ flexGrow: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }} 
                      />
                      <input 
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        id="blogImageUpload"
                        onChange={handleBlogImageUpload}
                      />
                      <button 
                        type="button"
                        onClick={() => document.getElementById('blogImageUpload').click()}
                        style={{
                          padding: '10px 16px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: '#2563eb',
                          color: '#ffffff',
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <Upload size={14} /> Upload
                      </button>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>Or select from Bucket:</span>
                      <select
                        value={bucketImages.find(img => img.url === editingBlog.image_url)?.url || (editingBlog.image_url ? 'custom' : '')}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') return;
                          setEditingBlog({ ...editingBlog, image_url: val });
                        }}
                        style={{
                          flexGrow: 1,
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: '#172237',
                          color: '#f8fafc',
                          fontSize: '0.8rem',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">-- Select from Supabase Bucket --</option>
                        {editingBlog.image_url && !bucketImages.some(img => img.url === editingBlog.image_url) && (
                          <option value="custom">Custom / Manually Entered URL</option>
                        )}
                        {bucketImages.map((img) => (
                          <option key={img.name} value={img.url}>
                            {img.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Title (EN)</label>
                  <input required type="text" value={editingBlog.title_en} onChange={e => setEditingBlog({...editingBlog, title_en: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Title (ES)</label>
                  <input required type="text" value={editingBlog.title_es} onChange={e => setEditingBlog({...editingBlog, title_es: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Excerpt (EN)</label>
                  <textarea required value={editingBlog.excerpt_en} onChange={e => setEditingBlog({...editingBlog, excerpt_en: e.target.value})} style={{ width: '100%', height: '80px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Excerpt (ES)</label>
                  <textarea required value={editingBlog.excerpt_es} onChange={e => setEditingBlog({...editingBlog, excerpt_es: e.target.value})} style={{ width: '100%', height: '80px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Content (EN) - HTML/Markdown</label>
                <textarea required value={editingBlog.content_en} onChange={e => setEditingBlog({...editingBlog, content_en: e.target.value})} style={{ width: '100%', height: '200px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
              </div>
              
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Content (ES) - HTML/Markdown</label>
                <textarea required value={editingBlog.content_es} onChange={e => setEditingBlog({...editingBlog, content_es: e.target.value})} style={{ width: '100%', height: '200px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '10px 16px', borderRadius: '8px' }}>
                  <input type="checkbox" checked={editingBlog.published} onChange={e => setEditingBlog({...editingBlog, published: e.target.checked})} style={{ transform: 'scale(1.2)' }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: editingBlog.published ? '#4ade80' : '#94a3b8' }}>
                    {editingBlog.published ? 'Published (Live)' : 'Draft (Hidden)'}
                  </span>
                </label>
                
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="admin-btn" onClick={() => setEditingBlog(null)}>Cancel</button>
                  <button type="submit" disabled={cmsSaveLoading} className="admin-btn admin-btn-primary">
                    {cmsSaveLoading ? 'Saving...' : <><Save size={16} /> Save Blog Post</>}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="modal active" onClick={() => setShowPasswordModal(false)} style={{ zIndex: 200 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', background: '#0e1626', color: '#f8fafc' }}>
            <button className="close-modal" onClick={() => setShowPasswordModal(false)} style={{ color: '#94a3b8' }}>&times;</button>
            
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <KeyRound size={36} style={{ color: '#38bdf8', marginBottom: '12px' }} />
              <h2 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#f8fafc' }}>Change Password</h2>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '6px' }}>Update your admin access password</p>
            </div>

            {passwordStatus && (
              <div style={{ 
                padding: '10px 14px', 
                borderRadius: '8px', 
                marginBottom: '16px',
                fontSize: '0.8rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: passwordStatus.startsWith('error') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                border: `1px solid ${passwordStatus.startsWith('error') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`,
                color: passwordStatus.startsWith('error') ? '#f87171' : '#4ade80'
              }}>
                {passwordStatus.startsWith('error') ? <AlertCircle size={16} /> : <Check size={16} />}
                {passwordStatus.replace(/^(error:|success:)/, '')}
              </div>
            )}

            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Current Password</label>
                <input 
                  type="password" 
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>New Password</label>
                <input 
                  type="password" 
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Confirm New Password</label>
                <input 
                  type="password" 
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>
              <button 
                type="submit" 
                disabled={passwordLoading}
                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: '#38bdf8', color: '#050b18', fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {passwordLoading ? (
                  <div className="sync-spinner" style={{ width: '16px', height: '16px' }}></div>
                ) : (
                  <><KeyRound size={16} /> Update Password</>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Description Modal */}
      {editDescModalOpen && editDescProduct && (
        <div className="modal active" onClick={() => setEditDescModalOpen(false)} style={{ zIndex: 200 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', background: '#0e1626', color: '#f8fafc' }}>
            <button className="close-modal" onClick={() => setEditDescModalOpen(false)} style={{ color: '#94a3b8' }}>&times;</button>
            
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <FileText size={36} style={{ color: '#38bdf8', marginBottom: '8px' }} />
              <h2 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#f8fafc' }}>Edit Product Information / Blog</h2>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>{editDescProduct.product}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                  English Description / Information
                </label>
                <textarea
                  value={editDescEn}
                  onChange={(e) => setEditDescEn(e.target.value)}
                  placeholder="Enter detailed scientific info, uses, benefits, and research details in English..."
                  style={{ width: '100%', height: '120px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                  Spanish Description / Información (Español)
                </label>
                <textarea
                  value={editDescEs}
                  onChange={(e) => setEditDescEs(e.target.value)}
                  placeholder="Ingrese información científica detallada, usos, beneficios y detalles de investigación en español..."
                  style={{ width: '100%', height: '120px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              {/* AI Assistant Action Panel */}
              <div style={{ display: 'flex', gap: '8px', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Sparkles size={14} style={{ color: '#38bdf8' }} /> AI Copilot (Gemini)
                </span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    className="admin-btn"
                    disabled={loadingAiDesc || loadingAiTranslate}
                    onClick={() => handleAiGenerateDesc(editDescProduct.product)}
                    style={{ padding: '6px 10px', fontSize: '0.75rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', cursor: 'pointer', borderRadius: '6px', opacity: (loadingAiDesc || loadingAiTranslate) ? 0.5 : 1 }}
                  >
                    {loadingAiDesc ? 'Generating...' : '🧬 Generate scientific details'}
                  </button>
                  <button
                    className="admin-btn"
                    disabled={loadingAiDesc || loadingAiTranslate}
                    onClick={() => handleAiTranslate(editDescEn, 'en-to-es')}
                    style={{ padding: '6px 10px', fontSize: '0.75rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', color: '#4ade80', cursor: 'pointer', borderRadius: '6px', opacity: (loadingAiDesc || loadingAiTranslate) ? 0.5 : 1 }}
                  >
                    {loadingAiTranslate ? 'Translating...' : '🌎 EN ➔ ES'}
                  </button>
                  <button
                    className="admin-btn"
                    disabled={loadingAiDesc || loadingAiTranslate}
                    onClick={() => handleAiTranslate(editDescEs, 'es-to-en')}
                    style={{ padding: '6px 10px', fontSize: '0.75rem', background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.2)', color: '#c084fc', cursor: 'pointer', borderRadius: '6px', opacity: (loadingAiDesc || loadingAiTranslate) ? 0.5 : 1 }}
                  >
                    {loadingAiTranslate ? 'Translating...' : '🌎 ES ➔ EN'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  className="admin-btn"
                  onClick={() => setEditDescModalOpen(false)}
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}
                >
                  Cancel
                </button>
                <button
                  className="admin-btn admin-btn-primary"
                  onClick={() => {
                    handleCellChange(editDescProduct.id, 'descriptionEn', editDescEn);
                    handleCellChange(editDescProduct.id, 'descriptionEs', editDescEs);
                    setEditDescModalOpen(false);
                  }}
                >
                  Apply & Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI WhatsApp Outbound Composer Modal */}
      {waModalOpen && waRecipient && (
        <div className="modal active" onClick={() => setWaModalOpen(false)} style={{ zIndex: 200 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '550px', background: '#0e1626', color: '#f8fafc', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <button className="close-modal" onClick={() => setWaModalOpen(false)} style={{ color: '#94a3b8', fontSize: '1.5rem' }}>&times;</button>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px', marginBottom: '20px' }}>
              <div style={{ background: 'rgba(34, 197, 94, 0.15)', borderRadius: '50%', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageCircle size={24} style={{ color: '#22c55e' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  WhatsApp Outbound Composer
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                  Sending to: <span style={{ color: '#4ade80', fontWeight: 'bold' }}>{waRecipient.name}</span> (+{waRecipient.phone})
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {waRecipient.cartItems && waRecipient.cartItems.length > 0 && (
                <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '0.8rem', color: '#94a3b8' }}>
                  <strong style={{ color: '#fbbf24' }}>🛒 Cart/Order Items:</strong> {waRecipient.cartItems.map(item => `${item.product} (x${item.qty || item.quantity || 1})`).join(', ')}
                </div>
              )}

              {/* Dynamic Agent & Template Selectors */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '12px', borderRadius: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>
                    Asignar Asesor (Firma y Comisión)
                  </label>
                  <select
                    value={waSelectedAgent}
                    onChange={(e) => {
                      const agent = e.target.value;
                      setWaSelectedAgent(agent);
                      setWaMessageText(generateWhatsAppTemplateText(waRecipient, waSelectedTemplate, agent));
                    }}
                    style={{ background: '#172237', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white', borderRadius: '6px', padding: '6px', fontSize: '0.75rem', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="">Ninguno / Firma genérica</option>
                    {agents && agents.map(aName => (
                      <option key={aName} value={aName}>{aName}</option>
                    ))}
                  </select>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>
                    Plantilla de Conversión
                  </label>
                  <select
                    value={waSelectedTemplate}
                    onChange={(e) => {
                      const template = e.target.value;
                      setWaSelectedTemplate(template);
                      setWaMessageText(generateWhatsAppTemplateText(waRecipient, template, waSelectedAgent));
                    }}
                    style={{ background: '#172237', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white', borderRadius: '6px', padding: '6px', fontSize: '0.75rem', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="standard">Standard Pitch (Ayuda y Link)</option>
                    <option value="purity">Purity Guarantee (Calidad ≥98%)</option>
                    <option value="discount">Discount Offer (10% Cupón COSTA10)</option>
                    <option value="dosing">Dosing & Reconstitution Support</option>
                    {waRecipient && waRecipient.orderNumber && (
                      <option value="payment">💰 Payment Reminder (SINPE / Card)</option>
                    )}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Message Content
                </label>
                <button
                  className="admin-btn"
                  disabled={waDrafting || waSending}
                  onClick={handleDraftWaMessage}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.75rem', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)', color: '#c084fc', cursor: 'pointer', borderRadius: '6px', opacity: (waDrafting || waSending) ? 0.5 : 1 }}
                >
                  <Sparkles size={12} style={{ color: '#c084fc' }} /> {waDrafting ? 'Drafting...' : '✨ Let Gemini Draft It'}
                </button>
              </div>

              <textarea
                value={waMessageText}
                onChange={(e) => setWaMessageText(e.target.value)}
                placeholder="Type your WhatsApp message..."
                style={{ width: '100%', height: '140px', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.4' }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                <button
                  className="admin-btn admin-btn-primary"
                  disabled={waSending || waDrafting || !waMessageText.trim()}
                  onClick={handleSendWaMessage}
                  style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)', border: 'none', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(34, 197, 94, 0.2)', opacity: (waSending || waDrafting || !waMessageText.trim()) ? 0.5 : 1 }}
                >
                  <Zap size={16} /> {waSending ? 'Sending automatically...' : '🚀 Send from Business Number'}
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(waMessageText);
                      alert('Message copied.');
                    }}
                    style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.75rem', color: '#38bdf8', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                  >
                    <Clipboard size={12} /> Copy message
                  </button>
                  <button
                    onClick={() => setWaModalOpen(false)}
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Leads Outreach Composer Modal */}
      {leadOutreachModalOpen && leadOutreachActive && (
        <div className="modal active" onClick={() => setLeadOutreachModalOpen(false)} style={{ zIndex: 210 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px', background: '#0e1626', color: '#f8fafc', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <button className="close-modal" onClick={() => setLeadOutreachModalOpen(false)} style={{ color: '#94a3b8', fontSize: '1.5rem' }}>&times;</button>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px', marginBottom: '20px' }}>
              <div style={{ background: leadOutreachMethod === 'whatsapp' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)', borderRadius: '50%', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {leadOutreachMethod === 'whatsapp' ? (
                  <MessageCircle size={24} style={{ color: '#22c55e' }} />
                ) : (
                  <Mail size={24} style={{ color: '#38bdf8' }} />
                )}
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {leadOutreachMethod === 'whatsapp' ? 'AI WhatsApp Outreach' : 'AI Email Outreach'}
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                  Recipient: <span style={{ color: '#cbd5e1', fontWeight: 'bold' }}>{leadOutreachActive.contact_value}</span>
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Context Badges */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 'bold' }}>
                  🌐 Lang: {leadOutreachActive.language ? leadOutreachActive.language.toUpperCase() : 'EN'}
                </span>
                {leadOutreachActive.city && (
                  <span style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 'bold' }}>
                    📍 Location: {leadOutreachActive.city}
                  </span>
                )}
                {leadOutreachActive.browsing_history && leadOutreachActive.browsing_history.length > 0 && (
                  <span style={{ padding: '4px 10px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '20px', fontSize: '0.75rem', color: '#fbbf24', fontWeight: 'bold' }}>
                    🛒 Interested: {leadOutreachActive.browsing_history.join(', ')}
                  </span>
                )}
              </div>

              {/* Show Last Contacted Status & Anti-Spam Warning inside Composer Modal */}
              <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#94a3b8' }}>Last contacted:</span>
                {(() => {
                  if (!leadOutreachActive.last_contacted_at) {
                    return <span style={{ color: '#64748b', fontWeight: 'bold' }}>Never</span>;
                  }
                  const contactedDate = new Date(leadOutreachActive.last_contacted_at);
                  const diffDays = Math.floor((new Date() - contactedDate) / (1000 * 60 * 60 * 24));
                  const isRecent = diffDays < 3;
                  return (
                    <span style={{ color: isRecent ? '#fbbf24' : '#4ade80', fontWeight: 'bold' }}>
                      {isRecent ? '⚠️ ' : '✅ '}{formatRelativeTime(leadOutreachActive.last_contacted_at)}
                    </span>
                  );
                })()}
              </div>

              {(() => {
                if (leadOutreachActive.last_contacted_at) {
                  const contactedDate = new Date(leadOutreachActive.last_contacted_at);
                  const isRecent = (new Date() - contactedDate) < 259200000; // < 3 days
                  if (isRecent) {
                    return (
                      <div style={{ padding: '10px 14px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '10px', color: '#fbbf24', fontSize: '0.75rem', lineHeight: '1.4', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        <span>⚠️</span>
                        <div>
                          <strong>Recent Outreach Warning:</strong> This lead was contacted {formatRelativeTime(leadOutreachActive.last_contacted_at)}. Proceed with caution.
                        </div>
                      </div>
                    );
                  }
                }
                return null;
              })()}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Outreach Message Text
                </label>
                <button
                  className="admin-btn"
                  disabled={leadOutreachDrafting || leadOutreachSending}
                  onClick={handleDraftLeadOutreachMessage}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.75rem', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)', color: '#c084fc', cursor: 'pointer', borderRadius: '6px', opacity: (leadOutreachDrafting || leadOutreachSending) ? 0.5 : 1 }}
                >
                  <Sparkles size={12} style={{ color: '#c084fc' }} /> {leadOutreachDrafting ? 'Drafting...' : '✨ Let Gemini Draft It'}
                </button>
              </div>

              <textarea
                value={leadOutreachMessage}
                onChange={(e) => setLeadOutreachMessage(e.target.value)}
                placeholder="Type your outreach message..."
                style={{ width: '100%', height: '160px', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.4' }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                <button
                  className="admin-btn admin-btn-primary"
                  disabled={leadOutreachSending || leadOutreachDrafting || !leadOutreachMessage.trim()}
                  onClick={handleSendLeadOutreach}
                  style={{ width: '100%', padding: '12px', background: leadOutreachMethod === 'whatsapp' ? 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', border: 'none', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: leadOutreachMethod === 'whatsapp' ? '0 4px 12px rgba(34, 197, 94, 0.2)' : '0 4px 12px rgba(59, 130, 246, 0.2)', opacity: (leadOutreachSending || leadOutreachDrafting || !leadOutreachMessage.trim()) ? 0.5 : 1 }}
                >
                  {leadOutreachSending ? (
                    'Sending...'
                  ) : leadOutreachMethod === 'whatsapp' ? (
                    <><MessageCircle size={14} /> Send WhatsApp & Log Outreach</>
                  ) : (
                    <><Mail size={14} /> Send Email & Log Outreach</>
                  )}
                </button>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4px' }}>
                  <button
                    onClick={() => setLeadOutreachModalOpen(false)}
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom quick navigation */}
      <nav className="admin-mobile-quick-nav" aria-label="Quick navigation">
        {mobilePrimaryTabIds.map(renderMobileQuickTab)}
        <button
          type="button"
          className={`admin-quick-nav-btn${mobileMoreOpen ? ' active' : ''}`}
          onClick={() => setMobileMoreOpen(true)}
          aria-label="More admin sections"
        >
          <span className="admin-quick-nav-icon"><ListFilter size={18} /></span>
          <span className="admin-quick-nav-label">More</span>
        </button>
      </nav>

      {mobileMoreOpen && (
        <div className="admin-more-sheet-overlay" onClick={() => setMobileMoreOpen(false)}>
          <div className="admin-more-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="All admin sections">
            <div className="admin-more-sheet-header">
              <h2>All sections</h2>
              <button type="button" className="admin-more-sheet-close" onClick={() => setMobileMoreOpen(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="admin-more-sheet-body">
              {ADMIN_NAV_GROUPS.map((group) => {
                const visibleTabs = group.tabs.filter((tabId) => hasAccess(tabId));
                if (visibleTabs.length === 0) return null;
                return (
                  <div key={group.title} className="admin-more-group">
                    <div className="admin-more-group-title">{group.title}</div>
                    <div className="admin-more-group-items">
                      {visibleTabs.map((tabId) => (
                        <button
                          key={tabId}
                          type="button"
                          className={`admin-more-tab-btn${activeTab === tabId ? ' active' : ''}`}
                          onClick={() => navigateToTab(tabId)}
                        >
                          {ADMIN_TAB_TITLES[tabId] || tabId}
                          {tabId === 'orders' && visibleOrders.filter((o) => (o.status || 'Pending') === 'Pending').length > 0 && (
                            <span className="admin-more-tab-badge">{visibleOrders.filter((o) => (o.status || 'Pending') === 'Pending').length}</span>
                          )}
                          {tabId === 'carts' && abandonedCarts.length > 0 && (
                            <span className="admin-more-tab-badge warning">{abandonedCarts.length}</span>
                          )}
                          {tabId === 'leads' && leads.length > 0 && (
                            <span className="admin-more-tab-badge success">{leads.length}</span>
                          )}
                          {tabId === 'facebook' && facebookNotifications.filter(n => n.status === 'unread').length > 0 && (
                            <span className="admin-more-tab-badge">{facebookNotifications.filter(n => n.status === 'unread').length}</span>
                          )}
                          {tabId === 'messenger' && facebookNotifications.filter(n => n.status === 'unread').length > 0 && (
                            <span className="admin-more-tab-badge">{facebookNotifications.filter(n => n.status === 'unread').length}</span>
                          )}
                          {tabId === 'inquiries' && inquiryCount > 0 && (
                            <span className="admin-more-tab-badge">{inquiryCount}</span>
                          )}
                          {tabId === 'team_chat' && unreadTeamMsgCount > 0 && (
                            <span className="admin-more-tab-badge">{unreadTeamMsgCount}</span>
                          )}
                          {tabId === 'whatsapp_ai' && unreadWaCount > 0 && (
                            <span className="admin-more-tab-badge">{unreadWaCount}</span>
                          )}
                          {tabId === 'live_chat' && liveChatUnreadCount > 0 && (
                            <span className="admin-more-tab-badge badge-info">{liveChatUnreadCount}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="admin-more-account">
                <div className="admin-more-group-title">Account</div>
                <div className="admin-more-account-card">
                  <div className="admin-more-account-copy">
                    <span>{adminProfile?.name || adminProfile?.email?.split('@')[0] || 'Administrator'}</span>
                    <small>{adminProfile?.is_superadmin ? 'Super Admin' : 'Staff Agent'}</small>
                  </div>
                  <div className="admin-more-account-actions">
                    <button type="button" onClick={() => { setMobileMoreOpen(false); setShowPasswordModal(true); }}>
                      <KeyRound size={16} />
                      Password
                    </button>
                    <button type="button" className="logout" onClick={handleLogout}>
                      <LogOut size={16} />
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Export Modal */}
      <ExportModal 
        isOpen={!!exportModalType}
        onClose={() => setExportModalType(null)}
        title={
          exportModalType === 'orders' ? 'Export Orders' : 
          exportModalType === 'products' ? 'Export Products' : 
          exportModalType === 'carts' ? 'Export Carts' : 
          exportModalType === 'leads' ? 'Export Leads' : 'Export Data'
        }
        description={`Choose a format to download all ${exportModalType || ''} data.`}
        loading={exportLoading}
        onExportCSV={() => handleExport('csv')}
        onExportXLSX={() => handleExport('xlsx')}
        onExportPDF={() => handleExport('pdf')}
      />
    </div>
  );
}
