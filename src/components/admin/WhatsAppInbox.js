'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Check, CheckCheck, ChevronLeft, Clock, MessageCircle, Search, Send, X, Paperclip, Loader2, Settings, Info, MoreHorizontal, Sparkles, MessagesSquare, ShoppingCart, UserRound, PhoneCall, Copy, Plus } from 'lucide-react';

const INITIAL_CHAT_LIMIT = 30;
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const SERVICE_WINDOW_URGENT_MS = 2 * 60 * 60 * 1000;
const WA_OWNER_STORAGE_KEY = 'peptides_wa_conversation_owners_v1';
const WA_UNASSIGNED_OWNER = 'unassigned';
const GENERIC_CONTACT_NAMES = new Set([
  'administrator',
  'ai copilot',
  'catalog lead',
  'customer',
  'peptides costa rica',
  'peptides customer',
]);

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function cleanContactName(value) {
  const name = String(value || '').trim();
  if (!name || ['null', 'undefined', 'n/a', 'unknown'].includes(name.toLowerCase())) return '';
  if (GENERIC_CONTACT_NAMES.has(name.toLowerCase())) return '';
  return name;
}

function addContactName(map, phone, name) {
  const digits = normalizePhone(phone);
  const cleanName = cleanContactName(name);
  if (!digits || !cleanName) return;
  map.set(digits, cleanName);
  if (digits.length >= 8) map.set(digits.slice(-8), cleanName);
}

function getInitials(name) {
  const words = String(name || 'Customer').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase() || 'C';
}

const AVATAR_COLORS = [
  ['#6366f1','#4f46e5'], ['#ec4899','#db2777'], ['#f59e0b','#d97706'],
  ['#10b981','#059669'], ['#3b82f6','#2563eb'], ['#8b5cf6','#7c3aed'],
  ['#14b8a6','#0d9488'], ['#ef4444','#dc2626'], ['#06b6d4','#0891b2'],
  ['#f97316','#ea580c'], ['#84cc16','#65a30d'], ['#e879f9','#c026d3'],
];

function avatarColorFor(name) {
  const str = String(name || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const pair = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  return `linear-gradient(145deg, ${pair[0]}, ${pair[1]})`;
}

function formatConversationTime(value) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatMessageDate(value) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeDuration(ms) {
  const safeMs = Math.max(0, ms || 0);
  const minutes = Math.ceil(safeMs / (60 * 1000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function getReplyWindow(lastInboundAt, now) {
  if (!lastInboundAt) {
    return {
      state: 'closed',
      label: 'Template needed',
      detail: 'No recent customer message. Free-form replies may be rejected.',
    };
  }

  const inboundTime = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(inboundTime)) {
    return {
      state: 'closed',
      label: 'Check window',
      detail: 'Could not verify the WhatsApp reply window.',
    };
  }

  const msLeft = inboundTime + SERVICE_WINDOW_MS - now;
  if (msLeft <= 0) {
    return {
      state: 'closed',
      label: 'Window closed',
      detail: 'Use an approved template before sending a free-form follow-up.',
    };
  }

  const duration = formatRelativeDuration(msLeft);
  if (msLeft <= SERVICE_WINDOW_URGENT_MS) {
    return {
      state: 'urgent',
      label: `${duration} left`,
      detail: 'Reply soon before WhatsApp requires a template.',
    };
  }

  return {
    state: 'open',
    label: `${duration} left`,
    detail: 'Free-form replies are available.',
  };
}

function getCartItems(cartData) {
  if (!cartData) return [];
  let parsed = cartData;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : []);
}

function calculateCartTotal(cartData) {
  if (!cartData) return 0;
  let parsed = cartData;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return 0;
    }
  }

  const items = getCartItems(parsed);
  if (!items.length && typeof parsed?.total !== 'undefined') {
    return parseFloat(String(parsed.total || '0').replace(/[^0-9.]/g, '')) || 0;
  }

  return items.reduce((sum, item) => {
    const price = parseFloat(String(item?.price_usd || item?.priceUsd || item?.price || '0').replace(/[^0-9.]/g, '')) || 0;
    const qty = parseInt(item?.qty || item?.quantity || 1, 10) || 1;
    return sum + (price * qty);
  }, 0);
}

function formatMoney(value) {
  const amount = Number(value || 0);
  if (!amount) return '$0';
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: amount >= 100 ? 0 : 2 })}`;
}

function readStoredConversationOwners() {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WA_OWNER_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getOwnerDisplay(ownerKey, currentAgentKey) {
  if (!ownerKey || ownerKey === WA_UNASSIGNED_OWNER) return 'Unassigned';
  if (ownerKey === currentAgentKey) return 'Mine';
  return ownerKey.includes('@') ? ownerKey.split('@')[0] : ownerKey;
}

function getPriorityScore(chat, isUnread, replyWindow) {
  if (chat.direction === 'inbound' && replyWindow.state === 'urgent') return 0;
  if (chat.direction === 'inbound' && isUnread) return 1;
  if (chat.direction === 'inbound') return 2;
  if (chat.stage === 'Cart') return 3;
  return 4;
}

function useIsMobileWa() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isMobile;
}

const WaChatItem = ({
  chat,
  isActive,
  isUnread,
  onClick,
  onMarkUnread,
  ownerLabel,
  isMine,
  isUnassigned,
  replyWindow,
  onAssignToMe,
}) => {
  const [offset, setOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(null);

  const handleTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
    setIsSwiping(true);
  };

  const handleTouchMove = (e) => {
    if (startX.current === null) return;
    const diff = e.touches[0].clientX - startX.current;
    if (diff < 0) {
      setOffset(Math.max(-80, diff));
    } else {
      setOffset(0);
    }
  };

  const handleTouchEnd = () => {
    if (offset < -40) {
      setOffset(-80);
    } else {
      setOffset(0);
    }
    startX.current = null;
    setIsSwiping(false);
  };

  return (
    <div className={`admin-wa-chat-item-shell${isUnassigned ? ' admin-wa-chat-item-shell--claimable' : ''}`}>
      <div className="admin-wa-chat-swipe-action">
        <button 
          onClick={(e) => { e.stopPropagation(); onMarkUnread(); setOffset(0); }}
          aria-label={`Mark conversation with ${chat.displayName} as unread`}
        >
          Unread
        </button>
      </div>
      
      <button
        type="button"
        className={`admin-wa-chat-item${isActive ? ' active' : ''}${isUnread ? ' admin-wa-chat-item--unread' : ''}`}
        style={{ transform: `translateX(${offset}px)`, transition: isSwiping ? 'none' : 'transform 0.2s', margin: 0, width: '100%' }}
        onClick={() => { if (offset === 0) onClick(); else setOffset(0); }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <span className="admin-wa-chat-avatar" style={{ background: avatarColorFor(chat.displayName) }} aria-hidden>{getInitials(chat.displayName)}</span>
        <div className="admin-wa-chat-item-content">
          <div className="admin-wa-chat-item-top">
            <span className="admin-wa-chat-item-identity">
              <span className="admin-wa-chat-item-name">{chat.displayName}</span>
              <span className={`admin-wa-stage admin-wa-stage--${chat.stage.toLowerCase()}`}>{chat.stage}</span>
            </span>
            <span className="admin-wa-chat-item-time">{formatConversationTime(chat.lastMessageAt)}</span>
          </div>
          <div className="admin-wa-chat-item-bottom">
            <span className="admin-wa-chat-item-preview">{chat.lastMessageText || 'Photo'}</span>
            <span className="admin-wa-chat-flags">
              {chat.direction === 'inbound' && (
                <span className="admin-wa-waiting-chip">Waiting</span>
              )}
              {chat.isAiLast ? (
                <span className="admin-wa-badge admin-wa-badge--ai">AI</span>
              ) : isUnread ? (
                <span className="admin-wa-unread-dot" aria-label="New message" />
              ) : chat.direction === 'outbound' ? (
                <CheckCheck size={14} className="admin-wa-chat-sent-icon" aria-label="Sent" />
              ) : null}
            </span>
          </div>
          <div className="admin-wa-chat-item-workflow">
            <span className={`admin-wa-owner-chip${isMine ? ' admin-wa-owner-chip--mine' : ''}${isUnassigned ? ' admin-wa-owner-chip--unassigned' : ''}`}>
              {ownerLabel}
            </span>
            <span className={`admin-wa-sla-chip admin-wa-sla-chip--${replyWindow.state}`}>
              {replyWindow.label}
            </span>
          </div>
        </div>
      </button>
      {isUnassigned && (
        <button
          type="button"
          className="admin-wa-chat-claim"
          onClick={(event) => {
            event.stopPropagation();
            onAssignToMe();
            setOffset(0);
          }}
          aria-label={`Claim conversation with ${chat.displayName}`}
          title="Claim conversation"
        >
          Claim
        </button>
      )}
      <button
        type="button"
        className="admin-wa-chat-more"
        onClick={(event) => { event.stopPropagation(); onMarkUnread(); setOffset(0); }}
        aria-label={`Mark conversation with ${chat.displayName} as unread`}
        title="Mark unread"
      >
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
};

export default function WhatsAppInbox({
  whatsappMessages,
  orders = [],
  leads = [],
  abandonedCarts = [],
  loadingWhatsappMessages,
  whatsappSettings,
  setWhatsappSettings,
  handleSaveWhatsappSettings,
  savingWaSettings,
  activeChatWaId,
  setActiveChatWaId,
  chatInputText,
  setChatInputText,
  handleSendLiveWhatsappMessage,
  handleDraftAiChatReply,
  draftingAiReply,
  loadAdminData,
  seenMap = {},
  markSeen,
  uploadingWaImage,
  handleWaImageUpload,
  sendingMessage = false,
  sendFeedback,
  onDismissSendFeedback,
  currentUserEmail,
  onOpenCustomerProfile,
}) {
  const isMobile = useIsMobileWa();
  const messagesEndRef = useRef(null);
  const composerRef = useRef(null);
  const currentAgentKey = currentUserEmail || 'me';
  const [chatSearch, setChatSearch] = useState('');
  const [inboxFilter, setInboxFilter] = useState('needs_reply');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [messageSearch, setMessageSearch] = useState('');
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [visibleChatCount, setVisibleChatCount] = useState(INITIAL_CHAT_LIMIT);
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [showCustomerContext, setShowCustomerContext] = useState(false);
  const [showContactActions, setShowContactActions] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showComposerTools, setShowComposerTools] = useState(false);
  const [conversationOwners, setConversationOwners] = useState(() => readStoredConversationOwners());
  const [now, setNow] = useState(() => Date.now());

  // Pull-to-refresh state
  const scrollRef = useRef(null);
  const [pullDist, setPullDist] = useState(0);
  const pullStartY = useRef(null);

  const handleListTouchStart = (e) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) {
      pullStartY.current = e.touches[0].clientY;
    }
  };

  const handleListTouchMove = (e) => {
    if (pullStartY.current !== null) {
      const diff = e.touches[0].clientY - pullStartY.current;
      if (diff > 0) {
        setPullDist(Math.min(diff, 60));
      } else {
        setPullDist(0);
      }
    }
  };

  const handleListTouchEnd = () => {
    if (pullDist >= 50) {
      if (loadAdminData) loadAdminData();
    }
    setPullDist(0);
    pullStartY.current = null;
  };

  const contactNamesByPhone = useMemo(() => {
    const names = new Map();

    [...leads]
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
      .forEach((lead) => addContactName(
        names,
        lead.whatsapp_wa_id || lead.customer_phone || lead.phone || lead.contact_value,
        lead.customer_name || lead.name
      ));
    [...abandonedCarts]
      .sort((a, b) => new Date(a.last_updated || a.created_at || 0) - new Date(b.last_updated || b.created_at || 0))
      .forEach((cart) => addContactName(names, cart.customer_phone, cart.customer_name));
    [...orders]
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
      .forEach((order) => addContactName(
        names,
        order.whatsapp_wa_id || order.customer_phone,
        order.customer_name
      ));

    return names;
  }, [abandonedCarts, leads, orders]);

  const contactStageByPhone = useMemo(() => {
    const stages = new Map();
    const setStage = (phone, stage) => {
      const digits = normalizePhone(phone);
      if (!digits) return;
      stages.set(digits, stage);
      if (digits.length >= 8) stages.set(digits.slice(-8), stage);
    };
    leads.forEach((lead) => setStage(lead.whatsapp_wa_id || lead.customer_phone || lead.phone || lead.contact_value, 'Lead'));
    abandonedCarts.forEach((cart) => setStage(cart.customer_phone, 'Cart'));
    orders.forEach((order) => setStage(order.whatsapp_wa_id || order.customer_phone, 'Customer'));
    return stages;
  }, [abandonedCarts, leads, orders]);

  const chatsList = useMemo(() => {
    const chatsMap = new Map();
    const chronological = [...whatsappMessages].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );

    chronological.forEach((m) => {
      const waId = normalizePhone(m.wa_id);
      if (!waId) return;
      const existing = chatsMap.get(waId);
      const messageName = cleanContactName(m.display_name);
      const inboundName = m.direction === 'inbound' ? messageName : existing?.inboundName;
      const crmName = contactNamesByPhone.get(waId) || contactNamesByPhone.get(waId.slice(-8));
      // Track the most-recent inbound message timestamp per chat
      const lastInboundAt = m.direction === 'inbound'
        ? m.created_at
        : (existing?.lastInboundAt || null);

      chatsMap.set(waId, {
        waId,
        displayName: crmName || inboundName || existing?.displayName || messageName || `Customer ${waId.slice(-4)}`,
        inboundName,
        lastMessageText: m.message_text,
        lastMessageAt: m.created_at,
        lastInboundAt,
        direction: m.direction,
        isAiLast: m.direction === 'outbound' && m.display_name === 'AI Copilot',
        stage: contactStageByPhone.get(waId) || contactStageByPhone.get(waId.slice(-8)) || 'Contact',
      });
    });

    return Array.from(chatsMap.values()).sort(
      (a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
    );
  }, [contactNamesByPhone, contactStageByPhone, whatsappMessages]);

  // A chat has "unseen" inbound messages when lastInboundAt > the timestamp stored in seenMap
  const hasUnread = useCallback((chat) => {
    if (!chat.lastInboundAt) return false;
    const seenAt = seenMap[chat.waId];
    if (!seenAt) return true;
    return new Date(chat.lastInboundAt) > new Date(seenAt);
  }, [seenMap]);

  const unreadCount = useMemo(
    () => chatsList.filter(hasUnread).length,
    [chatsList, hasUnread]
  );
  const waitingCount = useMemo(
    () => chatsList.filter((chat) => chat.direction === 'inbound').length,
    [chatsList]
  );
  const hotCartCount = useMemo(
    () => chatsList.filter((chat) => chat.stage === 'Cart').length,
    [chatsList]
  );
  const urgentCount = useMemo(
    () => chatsList.filter((chat) => chat.direction === 'inbound' && getReplyWindow(chat.lastInboundAt, now).state === 'urgent').length,
    [chatsList, now]
  );

  const getConversationOwner = useCallback((waId) => {
    return conversationOwners[waId] || WA_UNASSIGNED_OWNER;
  }, [conversationOwners]);

  const assignConversationOwner = useCallback((waId, ownerKey = currentAgentKey) => {
    if (!waId) return;
    setConversationOwners((prev) => {
      const next = { ...prev, [waId]: ownerKey };
      try {
        window.localStorage.setItem(WA_OWNER_STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        console.warn('Could not persist WhatsApp conversation owner:', err);
      }
      return next;
    });
  }, [currentAgentKey]);

  const releaseConversationOwner = useCallback((waId) => {
    if (!waId) return;
    setConversationOwners((prev) => {
      const next = { ...prev };
      delete next[waId];
      try {
        window.localStorage.setItem(WA_OWNER_STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        console.warn('Could not persist WhatsApp conversation owner:', err);
      }
      return next;
    });
  }, []);

  const mineCount = useMemo(
    () => chatsList.filter((chat) => getConversationOwner(chat.waId) === currentAgentKey).length,
    [chatsList, currentAgentKey, getConversationOwner]
  );
  const unassignedCount = useMemo(
    () => chatsList.filter((chat) => getConversationOwner(chat.waId) === WA_UNASSIGNED_OWNER).length,
    [chatsList, getConversationOwner]
  );

  const filteredChats = useMemo(() => {
    let result = chatsList;
    if (ownerFilter === 'mine') result = result.filter((chat) => getConversationOwner(chat.waId) === currentAgentKey);
    if (ownerFilter === 'unassigned') result = result.filter((chat) => getConversationOwner(chat.waId) === WA_UNASSIGNED_OWNER);
    if (inboxFilter === 'urgent') result = result.filter((chat) => chat.direction === 'inbound' && getReplyWindow(chat.lastInboundAt, now).state === 'urgent');
    if (inboxFilter === 'unread') result = result.filter(hasUnread);
    if (inboxFilter === 'needs_reply') result = result.filter((chat) => chat.direction === 'inbound');
    if (inboxFilter === 'hot_cart') result = result.filter((chat) => chat.stage === 'Cart');
    const query = chatSearch.trim().toLowerCase();
    if (query) {
      const digits = normalizePhone(query);
      result = result.filter((chat) =>
        chat.displayName.toLowerCase().includes(query) ||
        chat.lastMessageText?.toLowerCase().includes(query) ||
        (digits && chat.waId.includes(digits))
      );
    }
    return [...result].sort((a, b) => {
      const aPriority = getPriorityScore(a, hasUnread(a), getReplyWindow(a.lastInboundAt, now));
      const bPriority = getPriorityScore(b, hasUnread(b), getReplyWindow(b.lastInboundAt, now));
      if (aPriority !== bPriority) return aPriority - bPriority;
      return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
    });
  }, [chatSearch, chatsList, currentAgentKey, getConversationOwner, hasUnread, inboxFilter, now, ownerFilter]);

  const visibleChats = filteredChats.slice(0, visibleChatCount);

  const activeChatMessages = useMemo(
    () =>
      whatsappMessages
        .filter((m) => normalizePhone(m.wa_id) === activeChatWaId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [whatsappMessages, activeChatWaId]
  );

  const displayChatMessages = useMemo(() => {
    const query = messageSearch.trim().toLowerCase();
    if (!query) return activeChatMessages;
    return activeChatMessages.filter(m => 
      m.message_text?.toLowerCase().includes(query) || 
      m.display_name?.toLowerCase().includes(query)
    );
  }, [activeChatMessages, messageSearch]);

  const currentChat = chatsList.find((c) => c.waId === activeChatWaId);
  const activeChatCallHref = activeChatWaId ? `tel:+${activeChatWaId}` : null;
  const activeChatWhatsAppHref = activeChatWaId ? `https://wa.me/${activeChatWaId}` : null;

  const customerContext = useMemo(() => {
    if (!activeChatWaId) return null;
    const matchesPhone = (value) => {
      const digits = normalizePhone(value);
      return digits && (digits === activeChatWaId || digits.slice(-8) === activeChatWaId.slice(-8));
    };
    const customerOrders = orders
      .filter((order) => matchesPhone(order.whatsapp_wa_id || order.customer_phone))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const cart = abandonedCarts.find((item) => matchesPhone(item.customer_phone));
    const lead = leads.find((item) => matchesPhone(item.whatsapp_wa_id || item.customer_phone || item.phone || item.contact_value));
    const lifetimeValue = customerOrders.reduce((sum, order) => sum + Number(order.total_usd || 0), 0);
    return { orders: customerOrders, latestOrder: customerOrders[0] || null, cart, lead, lifetimeValue };
  }, [abandonedCarts, activeChatWaId, leads, orders]);

  const replyWindow = useMemo(
    () => getReplyWindow(currentChat?.lastInboundAt, now),
    [currentChat?.lastInboundAt, now]
  );
  const currentOwnerKey = activeChatWaId ? getConversationOwner(activeChatWaId) : WA_UNASSIGNED_OWNER;
  const currentOwnerLabel = getOwnerDisplay(currentOwnerKey, currentAgentKey);
  const currentChatIsMine = currentOwnerKey === currentAgentKey;
  const currentChatIsUnassigned = currentOwnerKey === WA_UNASSIGNED_OWNER;

  const customerContextSummary = useMemo(() => {
    if (!customerContext) return null;
    const highlights = [];
    const cartItems = getCartItems(customerContext.cart?.cart_data);
    const cartTotal = calculateCartTotal(customerContext.cart?.cart_data);

    if (customerContext.cart) {
      const itemCopy = cartItems.length === 1 ? '1 item' : `${cartItems.length || 'Active'} items`;
      highlights.push(`Cart ${cartTotal ? formatMoney(cartTotal) : 'active'} · ${itemCopy}`);
    }

    if (customerContext.latestOrder) {
      const latestTotal = Number(customerContext.latestOrder.total_usd || 0);
      highlights.push(`Latest ${customerContext.latestOrder.status || 'order'}${latestTotal ? ` · ${formatMoney(latestTotal)}` : ''}`);
    }

    if (customerContext.lead?.utm_source) {
      highlights.push(`Source ${customerContext.lead.utm_source}`);
    }

    if (!highlights.length && customerContext.orders.length) {
      highlights.push(`${customerContext.orders.length} order${customerContext.orders.length !== 1 ? 's' : ''}`);
    }

    if (!highlights.length) highlights.push('WhatsApp contact');

    return {
      tone: customerContext.cart ? 'hot' : customerContext.latestOrder ? 'customer' : customerContext.lead ? 'lead' : 'contact',
      label: customerContext.cart ? 'Hot cart' : customerContext.latestOrder ? 'Customer' : customerContext.lead ? 'Lead' : 'Contact',
      text: highlights.slice(0, 2).join(' · '),
    };
  }, [customerContext]);

  useEffect(() => {
    document.body.classList.add('admin-wa-tab-active');
    return () => document.body.classList.remove('admin-wa-tab-active');
  }, []);

  useEffect(() => {
    const isOpen = Boolean(isMobile && activeChatWaId);
    document.body.classList.toggle('admin-wa-conversation-open', isOpen);
    return () => document.body.classList.remove('admin-wa-conversation-open');
  }, [activeChatWaId, isMobile]);

  useEffect(() => {
    if (!activeChatWaId) return;
    const t = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    return () => cancelAnimationFrame(t);
  }, [activeChatWaId, activeChatMessages.length]);

  useEffect(() => {
    if (!activeChatWaId) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, [activeChatWaId]);

  const sendButtonDisabled = sendingMessage || replyWindow.state === 'closed' || !chatInputText.trim();

  const openActiveCustomerProfile = () => {
    if (!activeChatWaId || !onOpenCustomerProfile) return;
    onOpenCustomerProfile({
      search: activeChatWaId,
      customer_phone: activeChatWaId,
      name: currentChat?.displayName,
    });
    setShowCustomerContext(false);
    setShowContactActions(false);
  };

  const copyActiveChatPhone = async () => {
    if (!activeChatWaId) return;
    try {
      await navigator.clipboard.writeText(`+${activeChatWaId}`);
      setShowContactActions(false);
    } catch (err) {
      console.warn('Failed to copy WhatsApp phone number:', err);
    }
  };

  const handleComposerKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendButtonDisabled) handleSendLiveWhatsappMessage();
    }
  };

  const quickReplyTemplates = [
    { label: 'Greeting', text: 'Hello! How can I help you today?' },
    { label: 'Price list', text: 'Here is our full catalog and price list: https://peptidescostarica.net/' },
    { label: 'Cart help', text: 'I can help finish your order. Do you want delivery or pickup?' },
    { label: 'Payment', text: 'Once payment is complete, send the receipt here and we will process your order.' },
    { label: 'Delivery', text: 'We offer fast local delivery in Costa Rica.' },
  ];

  const appendQuickReply = (text) => {
    setChatInputText(prev => prev + (prev ? ' ' : '') + text);
    setShowQuickReplies(false);
    if (isMobile) setShowComposerTools(false);
  };

  const filterTabs = [
    { id: 'needs_reply', label: 'Waiting', count: waitingCount },
    { id: 'urgent', label: 'Urgent', count: urgentCount },
    { id: 'hot_cart', label: 'Hot carts', count: hotCartCount },
    { id: 'unread', label: 'Unread', count: unreadCount },
    { id: 'all', label: 'All', count: chatsList.length },
  ];
  const ownerTabs = [
    { id: 'all', label: 'All', count: chatsList.length },
    { id: 'mine', label: 'Mine', count: mineCount },
    { id: 'unassigned', label: 'Open', count: unassignedCount },
  ];
  const emptyCopy = chatSearch
    ? 'No conversations match your search.'
    : ownerFilter === 'mine'
      ? 'No conversations are assigned to you yet.'
      : ownerFilter === 'unassigned'
        ? 'No open unassigned conversations right now.'
    : inboxFilter === 'needs_reply'
      ? 'No customers are waiting for a reply.'
      : inboxFilter === 'urgent'
        ? 'No urgent reply windows right now.'
      : inboxFilter === 'hot_cart'
        ? 'No active cart conversations right now.'
        : 'No conversations yet. Incoming messages will appear here.';

  return (
    <div
      className={`admin-split-layout admin-whatsapp-inbox${
        activeChatWaId ? ' admin-wa-chat-open' : ''
      }`}
    >
      <div className="admin-wa-list-pane">
        <div className="admin-wa-conversations-panel">
          <div className="admin-wa-conversations-header">
            <div className="admin-wa-inbox-heading">
              <span>Sales inbox</span>
              <small>Prioritize customers waiting for a reply</small>
            </div>
            <div className="admin-wa-inbox-actions">
              {unreadCount > 0 && (
                <span className="admin-wa-new-count">
                  {unreadCount} new
                </span>
              )}
              <button type="button" className="admin-wa-icon-btn" onClick={() => setShowAiSettings(true)} aria-label="WhatsApp AI settings">
                <Settings size={17} />
              </button>
            </div>
          </div>

          <div className="admin-wa-search-row">
            <label className="admin-wa-search">
              <Search size={16} aria-hidden />
              <input
                type="search"
                value={chatSearch}
                onChange={(event) => {
                  setChatSearch(event.target.value);
                  setVisibleChatCount(INITIAL_CHAT_LIMIT);
                }}
                placeholder="Search name, phone, or message"
                aria-label="Search WhatsApp conversations"
              />
            </label>
          </div>

          <div className="admin-wa-filter-tabs" role="tablist" aria-label="Conversation filters">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={inboxFilter === tab.id}
                className={inboxFilter === tab.id ? 'active' : ''}
                onClick={() => {
                  setInboxFilter(tab.id);
                  setVisibleChatCount(INITIAL_CHAT_LIMIT);
                }}
              >
                {tab.label} <span>{tab.count}</span>
              </button>
            ))}
          </div>

          <div className="admin-wa-owner-filter" role="tablist" aria-label="Conversation ownership filters">
            {ownerTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={ownerFilter === tab.id}
                className={ownerFilter === tab.id ? 'active' : ''}
                onClick={() => {
                  setOwnerFilter(tab.id);
                  setVisibleChatCount(INITIAL_CHAT_LIMIT);
                }}
              >
                {tab.label} <span>{tab.count}</span>
              </button>
            ))}
          </div>

          <div 
            className="admin-wa-conversations-scroll" 
            ref={scrollRef}
            onTouchStart={handleListTouchStart}
            onTouchMove={handleListTouchMove}
            onTouchEnd={handleListTouchEnd}
            style={{ position: 'relative' }}
          >
            {pullDist > 0 && (
              <div style={{ height: `${pullDist}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.75rem', transition: 'height 0s' }}>
                {pullDist >= 50 ? 'Release to refresh' : 'Pull to refresh'}
              </div>
            )}
            
            {loadingWhatsappMessages ? (
              <div className="admin-wa-state-msg">Loading conversations...</div>
            ) : filteredChats.length === 0 ? (
              <div className="admin-wa-state-msg admin-wa-state-msg--empty">
                {emptyCopy}
              </div>
            ) : (
              <>
                {visibleChats.map((chat) => {
                  const isActive = activeChatWaId === chat.waId;
                  const chatIsUnread = hasUnread(chat);
                  const ownerKey = getConversationOwner(chat.waId);
                  const isMine = ownerKey === currentAgentKey;
                  const isUnassigned = ownerKey === WA_UNASSIGNED_OWNER;
                  const chatReplyWindow = getReplyWindow(chat.lastInboundAt, now);

                  return (
                    <WaChatItem
                      key={chat.waId}
                      chat={chat}
                      isActive={isActive}
                      isUnread={chatIsUnread}
                      ownerLabel={getOwnerDisplay(ownerKey, currentAgentKey)}
                      isMine={isMine}
                      isUnassigned={isUnassigned}
                      replyWindow={chatReplyWindow}
                      onClick={() => {
                        setActiveChatWaId(chat.waId);
                        setShowContactActions(false);
                        if (markSeen) markSeen(chat.waId, chat.lastInboundAt);
                      }}
                      onMarkUnread={() => {
                          if (markSeen) markSeen(chat.waId, new Date(0).toISOString()); // Resets seen state
                      }}
                      onAssignToMe={() => assignConversationOwner(chat.waId)}
                    />
                  );
                })}
                {visibleChats.length < filteredChats.length && (
                  <button
                    type="button"
                    className="admin-wa-load-more"
                    onClick={() => setVisibleChatCount((count) => count + INITIAL_CHAT_LIMIT)}
                  >
                    Load more conversations
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="admin-wa-chat-pane">
        {activeChatWaId ? (
          <>
            <div className="admin-wa-chat-header">
              <div className="admin-wa-chat-header-row1">
                <div className="admin-wa-chat-header-meta">
                  <button
                    type="button"
                    className="admin-wa-back-btn"
                    onClick={() => {
                      setShowContactActions(false);
                      setActiveChatWaId(null);
                    }}
                    aria-label="Back to conversations"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="admin-wa-chat-header-text">
                    <span className="admin-wa-chat-title-row">
                      <span className="admin-wa-header-avatar" style={{ background: avatarColorFor(currentChat?.displayName || activeChatWaId) }} aria-hidden>
                        {getInitials(currentChat?.displayName || activeChatWaId)}
                      </span>
                      <span className="admin-wa-chat-title">
                        {currentChat?.displayName || activeChatWaId}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="admin-wa-chat-header-actions">
                  {activeChatCallHref && !isMobile && (
                    <button
                      type="button"
                      className="admin-wa-icon-btn admin-wa-call-btn"
                      onClick={() => setShowContactActions(true)}
                      aria-label={`Contact ${currentChat?.displayName || activeChatWaId}`}
                      title="Contact options"
                    >
                      <PhoneCall size={17} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="admin-wa-icon-btn"
                    onClick={() => {
                      setShowMessageSearch(!showMessageSearch);
                      if (showMessageSearch) setMessageSearch('');
                    }}
                    title="Search in conversation"
                    aria-label="Search in conversation"
                  >
                    <Search size={16} />
                  </button>
                  {!isMobile && (
                  <button type="button" className="admin-wa-icon-btn" onClick={() => setShowCustomerContext(true)} aria-label="View customer details" title="Customer details">
                    <Info size={17} />
                  </button>
                  )}
                  <button type="button" className="admin-wa-icon-btn" onClick={() => setShowContactActions(true)} aria-label="More conversation actions" title="More actions">
                    <MoreHorizontal size={18} />
                  </button>
                </div>
              </div>
              <div className="admin-wa-chat-status-row">
                {whatsappSettings.ai_auto_reply && (
                  <span className="admin-wa-autopilot-badge">
                    <span className="admin-wa-autopilot-dot" aria-hidden />
                    <span>AI On</span>
                  </span>
                )}
                <span className={`admin-wa-window-chip admin-wa-window-chip--${replyWindow.state}`}>
                  <Clock size={13} aria-hidden />
                  <span>{replyWindow.label}</span>
                </span>
                {currentChat && (
                  <span className={`admin-wa-stage admin-wa-stage--${currentChat.stage.toLowerCase()}`}>{currentChat.stage}</span>
                )}
                <span className={`admin-wa-owner-chip${currentChatIsMine ? ' admin-wa-owner-chip--mine' : ''}${currentChatIsUnassigned ? ' admin-wa-owner-chip--unassigned' : ''}`}>
                  {currentOwnerLabel}
                </span>
                {currentChatIsUnassigned ? (
                  <button type="button" className="admin-wa-inline-action" onClick={() => assignConversationOwner(activeChatWaId)}>
                    Claim
                  </button>
                ) : currentChatIsMine ? (
                  <button type="button" className="admin-wa-inline-action admin-wa-inline-action--muted" onClick={() => releaseConversationOwner(activeChatWaId)}>
                    Release
                  </button>
                ) : null}
              </div>
            </div>

            {showMessageSearch && (
              <div style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Search size={14} color="#64748b" />
                <input 
                  type="search"
                  value={messageSearch}
                  onChange={e => setMessageSearch(e.target.value)}
                  placeholder="Search in this conversation..."
                  style={{ flex: 1, background: '#0a1120', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '8px', padding: '8px 12px', fontSize: '0.85rem', outline: 'none' }}
                  autoFocus
                />
                <button
                  type="button" 
                  onClick={() => {
                    setShowMessageSearch(false);
                    setMessageSearch('');
                  }}
                  className="admin-wa-search-close"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {customerContextSummary && (
              <button
                type="button"
                className={`admin-wa-context-strip-sticky admin-wa-context-strip-sticky--${customerContextSummary.tone}`}
                onClick={() => setShowCustomerContext(true)}
                aria-label="Open customer context"
              >
                {customerContextSummary.tone === 'hot' && <ShoppingCart size={15} aria-hidden />}
                <span className="admin-wa-context-strip-label">{customerContextSummary.label}</span>
                <strong>{customerContextSummary.text}</strong>
              </button>
            )}

            <div className="admin-wa-messages">
              {displayChatMessages.map((msg, index) => {
                const isInbound = msg.direction === 'inbound';
                const isAi = msg.display_name === 'AI Copilot';
                const previousMessage = displayChatMessages[index - 1];
                const showDateSeparator = !previousMessage ||
                  new Date(previousMessage.created_at).toDateString() !== new Date(msg.created_at).toDateString();
                const senderName = isInbound
                  ? msg.display_name || currentChat?.displayName || 'Customer'
                  : isAi
                    ? 'AI Copilot'
                    : 'Administrator';

                return (
                  <React.Fragment key={msg.id || index}>
                    {showDateSeparator && (
                      <div className="admin-wa-date-separator">
                        <span>{formatMessageDate(msg.created_at)}</span>
                      </div>
                    )}
                    <div className={`admin-wa-message-row admin-wa-message-row--${isInbound ? 'inbound' : 'outbound'}`}>
                      {isInbound && (
                        <span className="admin-wa-message-avatar" style={{ background: avatarColorFor(senderName) }} aria-hidden>{getInitials(senderName)}</span>
                      )}
                      <div
                        className={`admin-wa-bubble admin-wa-bubble--${
                          isInbound ? 'inbound' : isAi ? 'ai' : 'human'
                        }`}
                      >
                        <span className="admin-wa-bubble-sender">{senderName}</span>
                        <div className="admin-wa-bubble-text">
                          {msg.media_url && (
                            <div className="admin-wa-media">
                              {msg.media_url.endsWith('.pdf') ? (
                                <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="admin-wa-document-link">
                                  View document (PDF)
                                </a>
                              ) : (
                                <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
                                  {/* WhatsApp media hosts are dynamic and cannot be safely allowlisted for next/image. */}
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={msg.media_url}
                                    alt="Attachment"
                                    className="admin-wa-media-image"
                                  />
                                </a>
                              )}
                            </div>
                          )}
                          {msg.message_text}
                        </div>
                        <div className="admin-wa-bubble-footer">
                          <span className="admin-wa-bubble-time">
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {!isInbound && msg.delivery_status && (
                            <span className={`admin-wa-delivery admin-wa-delivery--${msg.delivery_status}`} aria-label={`Message ${msg.delivery_status}`}>
                              {msg.delivery_status === 'read' || msg.delivery_status === 'delivered'
                                ? <CheckCheck size={14} aria-hidden />
                                : <Check size={14} aria-hidden />}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} className="admin-wa-messages-anchor" aria-hidden />
            </div>

            <div className="admin-wa-composer" ref={composerRef}>
              {replyWindow.state === 'closed' && (
                <div className="admin-wa-window-blocked">
                  <div className="admin-wa-window-blocked-icon"><Clock size={20} aria-hidden /></div>
                  <div className="admin-wa-window-blocked-text">
                    <strong>Window closed</strong>
                    <span>Use an approved template before sending a free-form follow-up.</span>
                  </div>
                  <button
                    type="button"
                    className="admin-wa-template-required-btn"
                    onClick={() => {
                      setShowQuickReplies(true);
                      if (isMobile) setShowComposerTools(true);
                    }}
                  >
                    Templates
                  </button>
                </div>
              )}
              {replyWindow.state === 'urgent' && (
                <div className={`admin-wa-window-strip admin-wa-window-strip--urgent`}>
                  <Clock size={15} aria-hidden />
                  <div>
                    <strong>{replyWindow.label}</strong>
                    <span>{replyWindow.detail}</span>
                  </div>
                </div>
              )}

              {sendFeedback?.status === 'error' && (
                <div className="admin-wa-send-feedback admin-wa-send-feedback--error" role="alert">
                  <span>{sendFeedback.message || 'Message failed to send.'}</span>
                  {onDismissSendFeedback && (
                    <button type="button" onClick={onDismissSendFeedback}>Dismiss</button>
                  )}
                </div>
              )}
              {sendFeedback?.status === 'sending' && (
                <div className="admin-wa-send-feedback">
                  <Loader2 size={14} className="spinner" aria-hidden />
                  <span>{sendFeedback.message || 'Sending message...'}</span>
                </div>
              )}

              {showQuickReplies && (
                <div className="admin-wa-quick-replies" aria-label="Quick replies">
                  {quickReplyTemplates.map((template) => (
                    <button type="button" key={template.label} onClick={() => appendQuickReply(template.text)}>
                      {template.label}
                    </button>
                  ))}
                </div>
              )}

              {isMobile && showComposerTools && (
                <div className="admin-wa-mobile-tool-tray" aria-label="Message tools">
                  <label className="admin-wa-tool-tile" title="Attach screenshot or image" aria-label="Attach screenshot or image">
                    {uploadingWaImage ? <Loader2 size={18} className="spinner" /> : <Paperclip size={18} />}
                    <span>Attach</span>
                    <input type="file" accept="image/*,.heic,.heif" style={{ display: 'none' }} onChange={(e) => { if(handleWaImageUpload) handleWaImageUpload(e.target.files[0]); }} disabled={uploadingWaImage} />
                  </label>
                  <button type="button" className={`admin-wa-tool-tile${showQuickReplies ? ' active' : ''}`} onClick={() => setShowQuickReplies(value => !value)} aria-label="Quick reply templates">
                    <MessagesSquare size={18} />
                    <span>Templates</span>
                  </button>
                </div>
              )}

              <div className={`admin-wa-composer-row${isMobile ? ' admin-wa-composer-row--mobile' : ''}`}>
                {isMobile ? (
                  <button
                    type="button"
                    className={`admin-wa-composer-tool admin-wa-composer-menu${showComposerTools ? ' active' : ''}`}
                    onClick={() => setShowComposerTools(value => !value)}
                    aria-label={showComposerTools ? 'Close message tools' : 'Open message tools'}
                    title={showComposerTools ? 'Close tools' : 'Message tools'}
                  >
                    {showComposerTools ? <X size={19} /> : <Plus size={20} />}
                  </button>
                ) : (
                  <>
                    <label className="admin-wa-attach-btn" title="Attach screenshot or image" aria-label="Attach screenshot or image">
                      {uploadingWaImage ? <Loader2 size={20} className="spinner" /> : <Paperclip size={20} />}
                      <input type="file" accept="image/*,.heic,.heif" style={{ display: 'none' }} onChange={(e) => { if(handleWaImageUpload) handleWaImageUpload(e.target.files[0]); }} disabled={uploadingWaImage} />
                    </label>
                    <button type="button" className={`admin-wa-composer-tool${showQuickReplies ? ' active' : ''}`} onClick={() => setShowQuickReplies(value => !value)} aria-label="Quick reply templates" title="Quick replies">
                      <MessagesSquare size={19} />
                    </button>
                  </>
                )}
                <textarea
                  className="admin-wa-composer-input"
                  value={chatInputText}
                  onChange={(e) => setChatInputText(e.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={replyWindow.state === 'closed' ? 'Window closed — send a template first' : 'Message customer…'}
                  rows={1}
                  enterKeyHint="send"
                  disabled={replyWindow.state === 'closed'}
                />
                <button
                  type="button"
                  className="admin-wa-composer-tool admin-wa-composer-ai"
                  onClick={() => handleDraftAiChatReply(activeChatWaId)}
                  disabled={draftingAiReply}
                  aria-label="Draft a reply with AI"
                  title="AI draft"
                >
                  {draftingAiReply ? <Loader2 size={19} className="spinner" /> : <Sparkles size={19} />}
                </button>
                <button
                  type="button"
                  className="admin-wa-send-circle"
                  onClick={() => handleSendLiveWhatsappMessage()}
                  disabled={sendButtonDisabled}
                  aria-label="Send message"
                >
                  {sendingMessage ? <Loader2 size={19} className="spinner" aria-hidden /> : <Send size={19} aria-hidden />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="admin-wa-empty">
            <MessageCircle size={48} aria-hidden />
            <p>Select a conversation to start messaging.</p>
            <small>For new customers, ask them to message us from the website WhatsApp button first. No numeric code is needed.</small>
          </div>
        )}
      </div>

      {showAiSettings && (
        <div className="admin-wa-sheet-backdrop" onClick={() => setShowAiSettings(false)}>
          <section className="admin-wa-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="wa-ai-settings-title">
            <header className="admin-wa-sheet-header">
              <div><Brain size={19} /><span><strong id="wa-ai-settings-title">AI assistant</strong><small>Control automatic replies</small></span></div>
              <button type="button" onClick={() => setShowAiSettings(false)} aria-label="Close AI settings"><X size={19} /></button>
            </header>
            <div className="admin-wa-sheet-body">
              <div className="admin-wa-settings-row">
                <span className="admin-wa-settings-title">Automatic replies</span>
                <label className="admin-wa-toggle">
                  <input
                    type="checkbox"
                    checked={whatsappSettings.ai_auto_reply}
                    onChange={(event) => handleSaveWhatsappSettings({ ...whatsappSettings, ai_auto_reply: event.target.checked })}
                  />
                  <span className="admin-wa-toggle-track" aria-hidden />
                </label>
              </div>
              <p className="admin-wa-settings-desc">When enabled, Gemini replies to new inbound customer messages. AI messages remain visibly labeled in the conversation.</p>
              <label className="admin-wa-settings-field">
                <span>AI instructions</span>
                <textarea
                  className="admin-wa-prompt-input"
                  value={whatsappSettings.ai_system_prompt}
                  onChange={(event) => setWhatsappSettings({ ...whatsappSettings, ai_system_prompt: event.target.value })}
                />
              </label>
              <button type="button" className="admin-wa-save-btn" onClick={() => handleSaveWhatsappSettings(whatsappSettings)} disabled={savingWaSettings}>
                {savingWaSettings ? 'Saving…' : 'Save AI settings'}
              </button>
            </div>
          </section>
        </div>
      )}

      {showCustomerContext && activeChatWaId && (
        <div className="admin-wa-sheet-backdrop" onClick={() => setShowCustomerContext(false)}>
          <aside className="admin-wa-sheet admin-wa-context-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="wa-customer-context-title">
            <header className="admin-wa-sheet-header">
              <div><UserRound size={19} /><span><strong id="wa-customer-context-title">Customer context</strong><small>Sales history and intent</small></span></div>
              <button type="button" onClick={() => setShowCustomerContext(false)} aria-label="Close customer details"><X size={19} /></button>
            </header>
            <div className="admin-wa-sheet-body">
              <div className="admin-wa-context-person">
                <span className="admin-wa-header-avatar" style={{ background: avatarColorFor(currentChat?.displayName || activeChatWaId) }} aria-hidden>{getInitials(currentChat?.displayName || activeChatWaId)}</span>
                <div><strong>{currentChat?.displayName || 'Customer'}</strong><small>+{activeChatWaId}</small></div>
              </div>
              <div className="admin-wa-context-stats">
                <div><span>Lifetime value</span><strong>${customerContext?.lifetimeValue.toLocaleString() || '0'}</strong></div>
                <div><span>Orders</span><strong>{customerContext?.orders.length || 0}</strong></div>
              </div>
              <div className="admin-wa-context-card">
                <ShoppingCart size={17} />
                <div><span>Latest order</span><strong>{customerContext?.latestOrder ? `${customerContext.latestOrder.status || 'Order'} · $${Number(customerContext.latestOrder.total_usd || 0).toLocaleString()}` : 'No orders yet'}</strong></div>
              </div>
              <div className="admin-wa-context-card">
                <MessageCircle size={17} />
                <div><span>Sales signal</span><strong>{customerContext?.cart ? 'Active abandoned cart' : customerContext?.lead ? 'Marketing lead' : 'WhatsApp contact'}</strong></div>
              </div>
              {customerContext?.lead?.utm_source && <p className="admin-wa-context-source">Source: {customerContext.lead.utm_source}</p>}
              {onOpenCustomerProfile && (
                <button type="button" className="admin-wa-profile-shortcut" onClick={openActiveCustomerProfile}>
                  <UserRound size={18} />
                  <span>Open full customer profile</span>
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {showContactActions && activeChatWaId && (
        <div className="admin-wa-sheet-backdrop admin-wa-action-backdrop" onClick={() => setShowContactActions(false)}>
          <aside className="admin-wa-action-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="wa-contact-actions-title">
            <header className="admin-wa-action-header">
              <span className="admin-wa-header-avatar" style={{ background: avatarColorFor(currentChat?.displayName || activeChatWaId) }} aria-hidden>{getInitials(currentChat?.displayName || activeChatWaId)}</span>
              <div>
                <strong id="wa-contact-actions-title">{currentChat?.displayName || 'Customer'}</strong>
                <small>+{activeChatWaId}</small>
              </div>
              <button type="button" onClick={() => setShowContactActions(false)} aria-label="Close contact options">
                <X size={18} />
              </button>
            </header>
            <div className="admin-wa-action-list">
              {currentChatIsUnassigned ? (
                <button type="button" className="admin-wa-action-row" onClick={() => {
                  assignConversationOwner(activeChatWaId);
                  setShowContactActions(false);
                }}>
                  <span><UserRound size={20} /></span>
                  <div><strong>Claim conversation</strong><small>Move this chat into your mobile work queue.</small></div>
                </button>
              ) : currentChatIsMine ? (
                <button type="button" className="admin-wa-action-row" onClick={() => {
                  releaseConversationOwner(activeChatWaId);
                  setShowContactActions(false);
                }}>
                  <span><UserRound size={20} /></span>
                  <div><strong>Release conversation</strong><small>Return it to the open queue for another agent.</small></div>
                </button>
              ) : null}
              <a href={activeChatCallHref} className="admin-wa-action-row admin-wa-action-row--call">
                <span><PhoneCall size={20} /></span>
                <div><strong>Phone call</strong><small>Uses this device dialer. On Apple devices this may open FaceTime.</small></div>
              </a>
              <a href={activeChatWhatsAppHref} target="_blank" rel="noopener noreferrer" className="admin-wa-action-row">
                <span><MessageCircle size={20} /></span>
                <div><strong>Open WhatsApp chat</strong><small>Jump to the customer conversation in WhatsApp.</small></div>
              </a>
              <button
                type="button"
                className="admin-wa-action-row"
                onClick={() => {
                  setShowMessageSearch(true);
                  setShowContactActions(false);
                }}
              >
                <span><Search size={20} /></span>
                <div><strong>Search conversation</strong><small>Find a product, price, or previous promise.</small></div>
              </button>
              <button
                type="button"
                className="admin-wa-action-row"
                onClick={() => {
                  setShowCustomerContext(true);
                  setShowContactActions(false);
                }}
              >
                <span><Info size={20} /></span>
                <div><strong>Customer details</strong><small>Order history, cart signal, and source.</small></div>
              </button>
              {onOpenCustomerProfile && (
                <button type="button" className="admin-wa-action-row" onClick={openActiveCustomerProfile}>
                  <span><UserRound size={20} /></span>
                  <div><strong>Open customer profile</strong><small>Timeline, orders, carts, and lead context.</small></div>
                </button>
              )}
              <button type="button" className="admin-wa-action-row" onClick={copyActiveChatPhone}>
                <span><Copy size={20} /></span>
                <div><strong>Copy number</strong><small>Use it in WhatsApp, phone, or notes.</small></div>
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
