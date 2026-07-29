'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { confirmDelete } from '@/lib/confirmDelete.mjs';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  Send, User, Users, ChevronLeft, Search, Smile,
  Edit2, Trash2, Check, CheckCheck, X, ShieldAlert,
} from 'lucide-react';

// ─── Emoji Data ────────────────────────────────────────────────────────────────
const EMOJI_GRID = [
  '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎',
  '😍','😘','🥰','😗','😙','😚','🙂','🤗','🤩','🤔','🤨','😐',
  '😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','🥱',
  '😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑',
  '😲','😖','😞','😟','😤','😢','😭','😦','😧','😨','😩','🤯',
  '😬','😰','😱','🥵','🥶','😳','🤪','😵','🥴','😠','😡','🤬',
  '👋','🤚','✋','👌','✌️','🤞','👍','👎','✊','👊','👏','🙌',
  '🙏','💪','❤️','🧡','💛','💚','💙','💜','💔','💕','💞','💓',
  '💗','💖','💘','💝','🎉','🎊','🎈','🎁','🏆','🥇','🎯','🔥',
  '✨','🌟','⭐','💫','💥','🌈','☀️','💡','✅','❌','⚠️','💯',
  '🚀','✈️','🚗','📱','💻','🎵','🎶','🎮','🃏','🎲','💰','💎',
];

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

// ─── TeamChat Component ────────────────────────────────────────────────────────
export default function TeamChat({ profile }) {
  // Core state
  const [messages, setMessages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [mobileShowContacts, setMobileShowContacts] = useState(true);

  // Feature state
  const [typingUsers, setTypingUsers] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [onlineEmails, setOnlineEmails] = useState(new Set());
  const [unreadCounts, setUnreadCounts] = useState({});
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState(null);

  // Refs
  const messagesEndRef = useRef(null);
  const typingTimeouts = useRef({});
  const typingChannelRef = useRef(null);
  const presenceIntervalRef = useRef(null);
  const inputRef = useRef(null);
  const editInputRef = useRef(null);

  // ─── Push notification permission ───────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ─── Presence heartbeat ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !profile) return;

    const upsertPresence = () =>
      supabase.from('team_presence').upsert(
        { email: profile.email, name: profile.name || profile.email.split('@')[0], last_seen: new Date().toISOString() },
        { onConflict: 'email' }
      );

    const fetchOnline = async () => {
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data } = await supabase.from('team_presence').select('email').gte('last_seen', twoMinAgo);
      if (data) setOnlineEmails(new Set(data.map(r => r.email)));
    };

    upsertPresence();
    fetchOnline();
    presenceIntervalRef.current = setInterval(() => { upsertPresence(); fetchOnline(); }, 30000);
    return () => clearInterval(presenceIntervalRef.current);
  }, [profile]);

  // ─── Fetch contacts ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !profile) {
      setTimeout(() => setLoading(false), 0);
      return;
    }
    supabase
      .from('admin_profiles').select('*').order('name', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setContacts(data.filter(c => c.email !== profile.email));
      });
  }, [profile]);

  // ─── Fetch unread counts per DM contact ─────────────────────────────────────
  const fetchUnreadCounts = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !profile) return;
    const { data } = await supabase
      .from('team_messages')
      .select('sender_email')
      .eq('recipient_email', profile.email)
      .eq('is_read', false);
    if (data) {
      const counts = {};
      data.forEach(m => { counts[m.sender_email] = (counts[m.sender_email] || 0) + 1; });
      setUnreadCounts(counts);
    }
  }, [profile]);

  useEffect(() => { fetchUnreadCounts(); }, [fetchUnreadCounts]);

  // ─── Messages + realtime subscription ───────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !profile) return;
    setLoading(true);
    setSearchQuery('');
    setShowSearch(false);
    setEditingMsgId(null);

    const fetchMessages = async () => {
      let query = supabase
        .from('team_messages').select('*')
        .order('created_at', { ascending: false }).limit(150);

      if (selectedContact === null) {
        query = query.is('recipient_email', null);
      } else {
        const me = profile.email, them = selectedContact.email;
        query = query.or(
          `and(sender_email.eq.${me},recipient_email.eq.${them}),and(sender_email.eq.${them},recipient_email.eq.${me})`
        );
      }

      const { data, error } = await query;
      if (!error && data) {
        const visible = data.filter(m => m.is_deleted !== true).reverse();
        setMessages(visible);

        if (selectedContact !== null) {
          const unread = visible.filter(m => m.recipient_email === profile.email && !m.is_read);
          if (unread.length > 0) {
            await supabase.from('team_messages').update({ is_read: true }).in('id', unread.map(m => m.id));
            fetchUnreadCounts();
          }
        }
      }
      setLoading(false);
    };

    fetchMessages();

    const convKey = selectedContact ? selectedContact.email : 'global';
    const channel = supabase
      .channel(`team_chat_v3_${convKey}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages' }, async (payload) => {
        const msg = payload.new;
        if (msg.is_deleted) return;

        let belongs = false;
        if (selectedContact === null) {
          belongs = msg.recipient_email === null;
        } else {
          belongs =
            (msg.sender_email === profile.email && msg.recipient_email === selectedContact.email) ||
            (msg.sender_email === selectedContact.email && msg.recipient_email === profile.email);
        }

        if (belongs) {
          setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
          if (msg.recipient_email === profile.email) {
            await supabase.from('team_messages').update({ is_read: true }).eq('id', msg.id);
            fetchUnreadCounts();
          }
        } else if (msg.recipient_email === profile.email) {
          fetchUnreadCounts();
        }

        // Browser push notification for background messages
        if (
          typeof document !== 'undefined' && document.hidden &&
          msg.sender_email !== profile.email &&
          typeof window !== 'undefined' && 'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          new Notification(msg.sender_name || msg.sender_email.split('@')[0], {
            body: msg.message_text,
            icon: '/icon.png',
          });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'team_messages' }, (payload) => {
        const upd = payload.new;
        if (upd.is_deleted) {
          setMessages(prev => prev.filter(m => m.id !== upd.id));
        } else {
          setMessages(prev => prev.map(m => m.id === upd.id ? upd : m));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, selectedContact, fetchUnreadCounts]);

  // ─── Typing broadcast channel ────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !profile) return;

    // Symmetric key so both sides share the same channel
    const typingKey = selectedContact
      ? [profile.email, selectedContact.email].sort().join('__')
      : 'global';

    const ch = supabase
      .channel(`typing_${typingKey}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.email === profile.email) return;
        setTypingUsers(prev =>
          prev.find(u => u.email === payload.email)
            ? prev
            : [...prev, { email: payload.email, name: payload.name }]
        );
        clearTimeout(typingTimeouts.current[payload.email]);
        typingTimeouts.current[payload.email] = setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u.email !== payload.email));
        }, 2500);
      })
      .subscribe();

    typingChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); setTypingUsers([]); };
  }, [profile, selectedContact]);

  // ─── Scroll to bottom on new messages ───────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Auto-focus edit input ───────────────────────────────────────────────────
  useEffect(() => {
    if (editingMsgId && editInputRef.current) editInputRef.current.focus();
  }, [editingMsgId]);

  // ─── Close pickers on outside click ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (showEmojiPicker && !e.target.closest('.tc-emoji-picker') && !e.target.closest('.tc-emoji-toggle')) {
        setShowEmojiPicker(false);
      }
      if (reactionPickerMsgId && !e.target.closest('.tc-reaction-picker')) {
        setReactionPickerMsgId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker, reactionPickerMsgId]);

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !profile || sending) return;

    const textToSend = inputText.trim();
    setInputText('');
    setShowEmojiPicker(false);
    setSending(true);

    const optimistic = {
      id: `temp-${Date.now()}`,
      sender_email: profile.email,
      sender_name: profile.name || profile.email.split('@')[0],
      recipient_email: selectedContact ? selectedContact.email : null,
      message_text: textToSend,
      created_at: new Date().toISOString(),
      is_read: false,
      reactions: {},
      is_deleted: false,
    };
    setMessages(prev => [...prev, optimistic]);

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('team_messages')
        .insert({
          sender_email: profile.email,
          sender_name: profile.name || profile.email.split('@')[0],
          recipient_email: selectedContact ? selectedContact.email : null,
          message_text: textToSend,
        })
        .select()
        .single();

      if (error) {
        console.error('Send failed:', error);
        setMessages(prev => prev.filter(m => m.id !== optimistic.id));
        setInputText(textToSend);
      } else {
        setMessages(prev => prev.map(m => m.id === optimistic.id ? data : m));
      }
    }
    setSending(false);
  };

  const handleTyping = () => {
    if (!typingChannelRef.current || !profile) return;
    typingChannelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { email: profile.email, name: profile.name || profile.email.split('@')[0] },
    });
  };

  const handleReaction = async (msgId, emoji) => {
    setReactionPickerMsgId(null);
    if (!isSupabaseConfigured || !supabase) return;
    const msg = messages.find(m => m.id === msgId);
    if (!msg || String(msg.id).startsWith('temp-')) return;

    const current = msg.reactions || {};
    const users = current[emoji] || [];
    const myEmail = profile.email;
    const updated = users.includes(myEmail)
      ? users.filter(e => e !== myEmail)
      : [...users, myEmail];
    const updatedReactions = { ...current };
    if (updated.length === 0) delete updatedReactions[emoji];
    else updatedReactions[emoji] = updated;

    // Optimistic
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: updatedReactions } : m));
    await supabase.from('team_messages').update({ reactions: updatedReactions }).eq('id', msgId);
  };

  const handleStartEdit = (msg) => {
    setEditingMsgId(msg.id);
    setEditingText(msg.message_text);
    setHoveredMsgId(null);
  };

  const handleSaveEdit = async (msgId) => {
    if (!editingText.trim()) return;
    const now = new Date().toISOString();
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, message_text: editingText.trim(), edited_at: now } : m));
    setEditingMsgId(null);
    await supabase.from('team_messages').update({ message_text: editingText.trim(), edited_at: now }).eq('id', msgId);
  };

  const handleDelete = async (msgId) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!confirmDelete('message', [
      msg?.sender_name && `From: ${msg.sender_name}`,
      msg?.message_text && `"${String(msg.message_text).slice(0, 80)}"`,
    ])) return;
    setMessages(prev => prev.filter(m => m.id !== msgId));
    setHoveredMsgId(null);
    await supabase.from('team_messages')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', msgId);
  };

  const handleEmojiSelect = (emoji) => {
    setInputText(prev => prev + emoji);
    inputRef.current?.focus();
  };

  const selectContact = (contact) => {
    setSelectedContact(contact);
    setMobileShowContacts(false);
  };

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const filteredMessages = searchQuery.trim()
    ? messages.filter(m => m.message_text?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  const highlightSearch = (text) => {
    if (!searchQuery.trim() || !text) return text;
    const idx = text.toLowerCase().indexOf(searchQuery.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: '#fbbf24', color: '#0f172a', borderRadius: '2px', padding: '0 1px' }}>
          {text.slice(idx, idx + searchQuery.length)}
        </mark>
        {text.slice(idx + searchQuery.length)}
      </>
    );
  };

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  const renderUserAvatar = (person, iconSize = 17) => (
    <div className="tc-avatar user">
      {person?.avatar_url ? (
        <img src={person.avatar_url} alt="" />
      ) : (
        <User size={iconSize} />
      )}
    </div>
  );

  if (!profile) return null;

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="tc-wrapper">
      <style dangerouslySetInnerHTML={{ __html: `
        /* ── Base ─────────────────────────────────────────────────────────── */
        .tc-wrapper {
          display: flex;
          height: calc(100dvh - 200px);
          min-height: 400px;
          background: #0a0f1e;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.06);
          overflow: hidden;
          font-family: inherit;
        }

        /* ── Sidebar ──────────────────────────────────────────────────────── */
        .tc-sidebar {
          width: 272px;
          flex-shrink: 0;
          background: rgba(10,15,30,0.98);
          border-right: 1px solid rgba(255,255,255,0.05);
          display: flex;
          flex-direction: column;
        }
        .tc-sidebar-header {
          padding: 16px 18px;
          font-weight: 700;
          color: #f1f5f9;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          font-size: 1rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          letter-spacing: -0.01em;
        }
        .tc-contacts { flex: 1; overflow-y: auto; }
        .tc-contacts::-webkit-scrollbar { width: 4px; }
        .tc-contacts::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 4px; }

        .tc-contact {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 13px 16px;
          cursor: pointer;
          transition: background 0.15s;
          border-bottom: 1px solid rgba(255,255,255,0.025);
          position: relative;
          touch-action: manipulation;
        }
        .tc-contact:hover { background: rgba(255,255,255,0.03); }
        .tc-contact.tc-active {
          background: rgba(14,165,233,0.08);
          border-left: 3px solid #0ea5e9;
        }
        .tc-avatar-wrap { position: relative; flex-shrink: 0; }
        .tc-avatar {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 0.85rem;
        }
        .tc-avatar.global { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); }
        .tc-avatar.user  { background: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%); }
        .tc-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .tc-online-dot {
          position: absolute; bottom: 1px; right: 1px;
          width: 10px; height: 10px;
          border-radius: 50%;
          border: 2px solid #0a0f1e;
        }
        .tc-online-dot.online  { background: #22c55e; }
        .tc-online-dot.offline { background: #334155; }
        .tc-contact-info { flex: 1; min-width: 0; }
        .tc-contact-name {
          color: #f1f5f9; font-weight: 600; font-size: 0.875rem;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .tc-contact-sub {
          color: #475569; font-size: 0.72rem;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          margin-top: 1px;
        }
        .tc-badge {
          background: #ef4444; color: #fff;
          font-size: 0.65rem; font-weight: 700;
          min-width: 18px; height: 18px;
          border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          padding: 0 5px; flex-shrink: 0;
          animation: tc-badge-pop 0.3s cubic-bezier(.34,1.56,.64,1);
        }
        @keyframes tc-badge-pop { from { transform: scale(0); } to { transform: scale(1); } }

        /* ── Main area ────────────────────────────────────────────────────── */
        .tc-main { flex: 1; display: flex; flex-direction: column; background: #0a0f1e; min-width: 0; }

        /* ── Header ───────────────────────────────────────────────────────── */
        .tc-header {
          padding: 12px 16px;
          background: rgba(15,23,42,0.8);
          backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(255,255,255,0.05);
          display: flex; align-items: center; gap: 12px;
          flex-shrink: 0;
        }
        .tc-back-btn {
          display: none; background: none; border: none;
          color: #94a3b8; cursor: pointer;
          min-width: 40px; min-height: 40px;
          align-items: center; justify-content: center;
          border-radius: 10px; flex-shrink: 0;
          transition: background 0.15s;
        }
        .tc-back-btn:hover { background: rgba(255,255,255,0.06); }
        .tc-header-icon {
          padding: 8px; border-radius: 10px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .tc-header-title { font-weight: 700; color: #f1f5f9; font-size: 0.95rem; letter-spacing: -0.01em; }
        .tc-header-sub   { font-size: 0.72rem; color: #475569; margin-top: 1px; }
        .tc-header-sub.online-status { color: #22c55e; }
        .tc-header-actions { margin-left: auto; display: flex; gap: 6px; }
        .tc-hdr-btn {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          color: #64748b; cursor: pointer;
          width: 32px; height: 32px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .tc-hdr-btn:hover { background: rgba(255,255,255,0.09); color: #f1f5f9; }
        .tc-hdr-btn.active { background: rgba(14,165,233,0.18); color: #38bdf8; border-color: rgba(14,165,233,0.3); }

        /* ── Search bar ───────────────────────────────────────────────────── */
        .tc-search-bar {
          padding: 8px 16px; flex-shrink: 0;
          background: rgba(10,15,30,0.8);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .tc-search-inner {
          display: flex; align-items: center; gap: 8px;
          background: #1e293b;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 20px; padding: 7px 14px;
          transition: border-color 0.2s;
        }
        .tc-search-inner:focus-within { border-color: #0ea5e9; }
        .tc-search-input {
          flex: 1; background: transparent; border: none;
          color: #f1f5f9; outline: none; font-size: 0.875rem;
        }
        .tc-search-input::placeholder { color: #475569; }
        .tc-search-clear {
          background: none; border: none; color: #475569;
          cursor: pointer; display: flex; align-items: center;
          padding: 0; transition: color 0.15s;
        }
        .tc-search-clear:hover { color: #94a3b8; }

        /* ── Messages ─────────────────────────────────────────────────────── */
        .tc-messages {
          flex: 1; overflow-y: auto;
          padding: 16px 20px;
          display: flex; flex-direction: column; gap: 2px;
          scroll-behavior: smooth;
        }
        .tc-messages::-webkit-scrollbar { width: 4px; }
        .tc-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 4px; }

        .tc-empty {
          color: #475569; text-align: center;
          margin-top: 48px;
          display: flex; flex-direction: column; align-items: center; gap: 10px;
        }
        .tc-empty p { margin: 0; font-size: 0.875rem; }

        /* ── Message row ──────────────────────────────────────────────────── */
        .tc-msg-row {
          display: flex; flex-direction: column;
          max-width: 78%; position: relative;
          margin-bottom: 1px;
        }
        .tc-msg-row.mine   { align-self: flex-end;   align-items: flex-end; }
        .tc-msg-row.theirs { align-self: flex-start; align-items: flex-start; }

        .tc-msg-sender {
          font-size: 0.68rem; color: #475569;
          margin-bottom: 3px;
          display: flex; align-items: center; gap: 4px;
          padding: 0 5px;
        }

        .tc-bubble-wrap {
          display: flex; align-items: flex-end; gap: 5px;
          position: relative;
        }
        .tc-msg-row.mine   .tc-bubble-wrap { flex-direction: row-reverse; }

        /* Action buttons (shown on hover) */
        .tc-actions {
          display: flex; flex-direction: column; gap: 3px;
          opacity: 0; transition: opacity 0.15s;
          flex-shrink: 0;
        }
        .tc-msg-row:hover .tc-actions { opacity: 1; }
        .tc-act-btn {
          background: rgba(20,30,50,0.95);
          border: 1px solid rgba(255,255,255,0.08);
          color: #94a3b8; cursor: pointer;
          width: 26px; height: 26px; border-radius: 7px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s; font-size: 0.8rem;
        }
        .tc-act-btn:hover { background: rgba(255,255,255,0.1); color: #f1f5f9; }
        .tc-act-btn.danger:hover { background: rgba(239,68,68,0.18); color: #f87171; border-color: rgba(239,68,68,0.3); }

        /* Bubble */
        .tc-bubble {
          padding: 10px 14px;
          border-radius: 18px;
          font-size: 0.9rem; line-height: 1.5;
          word-break: break-word;
          max-width: 100%;
        }
        .tc-msg-row.mine   .tc-bubble {
          background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%);
          color: #fff;
          border-bottom-right-radius: 5px;
          box-shadow: 0 2px 12px rgba(14,165,233,0.25);
        }
        .tc-msg-row.theirs .tc-bubble {
          background: #1e293b;
          color: #e2e8f0;
          border: 1px solid rgba(255,255,255,0.06);
          border-bottom-left-radius: 5px;
        }

        /* Footer */
        .tc-msg-footer {
          display: flex; align-items: center; gap: 5px;
          margin-top: 3px; padding: 0 5px;
        }
        .tc-msg-row.mine .tc-msg-footer { justify-content: flex-end; }
        .tc-msg-time    { font-size: 0.62rem; color: #334155; }
        .tc-edited      { font-size: 0.62rem; color: #334155; font-style: italic; }
        .tc-read-receipt { color: #475569; display: flex; align-items: center; }
        .tc-read-receipt.read { color: #38bdf8; }

        /* Reactions row */
        .tc-reactions-row {
          display: flex; flex-wrap: wrap; gap: 4px;
          margin-top: 5px; padding: 0 5px;
        }
        .tc-reaction-chip {
          background: rgba(20,30,50,0.8);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px; padding: 2px 8px;
          font-size: 0.8rem; cursor: pointer;
          transition: all 0.15s;
          display: flex; align-items: center; gap: 3px;
          color: #e2e8f0;
        }
        .tc-reaction-chip:hover { background: rgba(14,165,233,0.12); border-color: rgba(14,165,233,0.35); }
        .tc-reaction-chip.mine  { background: rgba(14,165,233,0.15); border-color: rgba(14,165,233,0.4); }
        .tc-reaction-count { font-size: 0.7rem; color: #94a3b8; }

        /* Reaction picker popup */
        .tc-reaction-picker {
          position: absolute;
          bottom: calc(100% + 8px);
          background: #1e293b;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 14px;
          padding: 8px 10px;
          display: flex; gap: 2px;
          z-index: 100;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        .tc-msg-row.mine   .tc-reaction-picker { right: 0; }
        .tc-msg-row.theirs .tc-reaction-picker { left: 0; }
        .tc-rpick-btn {
          background: none; border: none;
          font-size: 1.4rem; cursor: pointer;
          padding: 4px 5px; border-radius: 8px;
          transition: all 0.15s; line-height: 1;
        }
        .tc-rpick-btn:hover { background: rgba(255,255,255,0.1); transform: scale(1.25); }

        /* Edit form */
        .tc-edit-form {
          display: flex; gap: 6px; align-items: center;
          min-width: 200px; max-width: 460px; width: 100%;
        }
        .tc-edit-input {
          flex: 1; background: #0f172a;
          border: 1px solid #0ea5e9;
          color: #f1f5f9; padding: 8px 12px;
          border-radius: 12px; outline: none;
          font-size: 0.9rem;
        }
        .tc-edit-save, .tc-edit-cancel {
          background: none; border: none; cursor: pointer;
          width: 30px; height: 30px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; transition: background 0.15s;
        }
        .tc-edit-save   { color: #22c55e; } .tc-edit-save:hover   { background: rgba(34,197,94,0.15); }
        .tc-edit-cancel { color: #ef4444; } .tc-edit-cancel:hover { background: rgba(239,68,68,0.15); }

        /* ── Typing indicator ─────────────────────────────────────────────── */
        .tc-typing {
          padding: 6px 20px;
          color: #475569; font-size: 0.78rem;
          display: flex; align-items: center; gap: 8px;
          min-height: 28px; flex-shrink: 0;
        }
        .tc-dots { display: flex; gap: 3px; align-items: center; }
        .tc-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: #64748b;
          animation: tc-bounce 1.2s infinite ease-in-out;
        }
        .tc-dot:nth-child(2) { animation-delay: 0.2s; }
        .tc-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes tc-bounce {
          0%,60%,100% { transform: translateY(0); opacity: 0.4; }
          30%          { transform: translateY(-5px); opacity: 1; }
        }

        /* ── Input area ───────────────────────────────────────────────────── */
        .tc-input-area {
          padding: 10px 14px max(10px, env(safe-area-inset-bottom, 0px));
          background: rgba(10,15,30,0.92);
          border-top: 1px solid rgba(255,255,255,0.05);
          flex-shrink: 0; position: relative;
        }
        .tc-emoji-picker {
          position: absolute; bottom: calc(100% + 4px); left: 14px;
          background: #1e293b;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px; padding: 12px;
          z-index: 200;
          box-shadow: 0 -12px 40px rgba(0,0,0,0.6);
          width: 292px;
        }
        .tc-emoji-grid {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 1px;
          max-height: 180px; overflow-y: auto;
        }
        .tc-emoji-grid::-webkit-scrollbar { width: 4px; }
        .tc-emoji-grid::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .tc-emoji-btn {
          background: none; border: none; cursor: pointer;
          font-size: 1.2rem; padding: 4px; border-radius: 6px;
          transition: background 0.12s; line-height: 1; text-align: center;
        }
        .tc-emoji-btn:hover { background: rgba(255,255,255,0.1); }

        .tc-form {
          display: flex; gap: 8px;
          background: #111827;
          padding: 5px; border-radius: 26px;
          border: 1px solid rgba(255,255,255,0.09);
          align-items: center;
          transition: border-color 0.2s;
        }
        .tc-form:focus-within { border-color: rgba(14,165,233,0.6); }
        .tc-emoji-toggle {
          background: none; border: none; color: #475569; cursor: pointer;
          width: 36px; height: 36px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s; flex-shrink: 0;
        }
        .tc-emoji-toggle:hover { color: #fbbf24; }
        .tc-emoji-toggle.active { color: #fbbf24; }
        .tc-input {
          flex: 1; background: transparent; border: none;
          color: #f1f5f9; padding: 8px 4px;
          outline: none; font-size: 0.95rem;
        }
        .tc-input::placeholder { color: #334155; }
        .tc-send {
          background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%);
          color: #fff; border: none;
          width: 40px; height: 40px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.2s; flex-shrink: 0;
        }
        .tc-send:hover:not(:disabled) { transform: scale(1.07); box-shadow: 0 0 16px rgba(14,165,233,0.45); }
        .tc-send:disabled { background: #1e293b; cursor: not-allowed; }

        /* ── Mobile ───────────────────────────────────────────────────────── */
        @media (max-width: 1023px) {
          .tc-wrapper { height: calc(100dvh - 148px); min-height: 320px; border-radius: 12px; }
          .tc-sidebar { width: 100%; display: ${mobileShowContacts ? 'flex' : 'none'}; }
          .tc-main   { display: ${mobileShowContacts ? 'none' : 'flex'}; width: 100%; min-height: 0; }
          .tc-back-btn { display: inline-flex; }
          .tc-messages { padding: 10px 12px; -webkit-overflow-scrolling: touch; }
          .tc-emoji-picker { width: calc(100vw - 32px); left: 8px; }
        }
      ` }} />

      {/* ─── SIDEBAR ─────────────────────────────────────────────────────────── */}
      <div className="tc-sidebar">
        <div className="tc-sidebar-header">
          <span>Conversations</span>
          {totalUnread > 0 && <span className="tc-badge">{totalUnread}</span>}
        </div>
        <div className="tc-contacts">
          {/* Global */}
          <div
            className={`tc-contact ${selectedContact === null ? 'tc-active' : ''}`}
            onClick={() => selectContact(null)}
          >
            <div className="tc-avatar-wrap">
              <div className="tc-avatar global"><Users size={17} /></div>
            </div>
            <div className="tc-contact-info">
              <div className="tc-contact-name">General Team Chat</div>
              <div className="tc-contact-sub">All admins &amp; agents</div>
            </div>
          </div>

          {/* Individual contacts */}
          {contacts.map(c => {
            const isOnline = onlineEmails.has(c.email);
            const unread = unreadCounts[c.email] || 0;
            return (
              <div
                key={c.id || c.email}
                className={`tc-contact ${selectedContact?.email === c.email ? 'tc-active' : ''}`}
                onClick={() => selectContact(c)}
              >
                <div className="tc-avatar-wrap">
                  {renderUserAvatar(c)}
                  <span className={`tc-online-dot ${isOnline ? 'online' : 'offline'}`} />
                </div>
                <div className="tc-contact-info">
                  <div className="tc-contact-name">{c.name || c.email.split('@')[0]}</div>
                  <div className="tc-contact-sub">{c.email}</div>
                </div>
                {unread > 0 && <span className="tc-badge">{unread}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── MAIN CHAT ───────────────────────────────────────────────────────── */}
      <div className="tc-main">
        {/* Header */}
        <div className="tc-header">
          <button className="tc-back-btn" onClick={() => setMobileShowContacts(true)}>
            <ChevronLeft size={22} />
          </button>

          <div
            className="tc-header-icon"
            style={{
              background: selectedContact === null ? 'rgba(99,102,241,0.12)' : 'rgba(14,165,233,0.12)',
              color: selectedContact === null ? '#a78bfa' : '#38bdf8',
            }}
          >
            {selectedContact === null
              ? <Users size={19} />
              : selectedContact.avatar_url
                ? <img src={selectedContact.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                : <User size={19} />}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tc-header-title">
              {selectedContact === null
                ? 'General Team Chat'
                : (selectedContact.name || selectedContact.email.split('@')[0])}
            </div>
            <div className={`tc-header-sub ${selectedContact && onlineEmails.has(selectedContact.email) ? 'online-status' : ''}`}>
              {selectedContact === null
                ? 'Communicate securely with everyone'
                : onlineEmails.has(selectedContact.email)
                  ? '● Online'
                  : selectedContact.email}
            </div>
          </div>

          <div className="tc-header-actions">
            <button
              className={`tc-hdr-btn ${showSearch ? 'active' : ''}`}
              onClick={() => { setShowSearch(s => !s); setSearchQuery(''); }}
              title="Search messages"
            >
              <Search size={14} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="tc-search-bar">
            <div className="tc-search-inner">
              <Search size={13} color="#475569" />
              <input
                className="tc-search-input"
                placeholder="Search messages…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searchQuery && (
                <button className="tc-search-clear" onClick={() => setSearchQuery('')}>
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <div
          className="tc-messages"
          onClick={() => { setReactionPickerMsgId(null); setShowEmojiPicker(false); }}
        >
          {loading && (
            <div style={{ color: '#475569', textAlign: 'center', marginTop: '24px', fontSize: '0.875rem' }}>
              Loading messages…
            </div>
          )}

          {!loading && filteredMessages.length === 0 && (
            <div className="tc-empty">
              <ShieldAlert size={30} opacity={0.35} />
              <p>
                {searchQuery
                  ? 'No messages match your search.'
                  : 'No messages yet. Start the conversation!'}
              </p>
            </div>
          )}

          {filteredMessages.map((msg, idx) => {
            const isMine       = msg.sender_email === profile.email;
            const time         = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const reactions    = msg.reactions || {};
            const hasReactions = Object.keys(reactions).length > 0;
            const showSender   = !isMine && (idx === 0 || filteredMessages[idx - 1]?.sender_email !== msg.sender_email);
            const isEditing    = editingMsgId === msg.id;
            const showRPicker  = reactionPickerMsgId === msg.id;
            const isTemp       = String(msg.id).startsWith('temp-');

            return (
              <div
                key={msg.id}
                className={`tc-msg-row ${isMine ? 'mine' : 'theirs'}`}
                onMouseEnter={() => setHoveredMsgId(msg.id)}
                onMouseLeave={() => { setHoveredMsgId(null); }}
              >
                {showSender && (
                  <div className="tc-msg-sender">
                    <User size={9} />
                    {msg.sender_name || msg.sender_email?.split('@')[0]}
                  </div>
                )}

                {/* Edit mode */}
                {isEditing ? (
                  <div className="tc-edit-form">
                    <input
                      ref={editInputRef}
                      className="tc-edit-input"
                      value={editingText}
                      onChange={e => setEditingText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveEdit(msg.id);
                        if (e.key === 'Escape') setEditingMsgId(null);
                      }}
                    />
                    <button className="tc-edit-save"   onClick={() => handleSaveEdit(msg.id)} title="Save"><Check size={15} /></button>
                    <button className="tc-edit-cancel" onClick={() => setEditingMsgId(null)} title="Cancel"><X size={15} /></button>
                  </div>
                ) : (
                  <div className="tc-bubble-wrap">
                    {/* Hover action buttons */}
                    <div className="tc-actions">
                      <button
                        className="tc-act-btn"
                        title="React"
                        onClick={e => { e.stopPropagation(); setReactionPickerMsgId(showRPicker ? null : msg.id); }}
                      >
                        😊
                      </button>
                      {isMine && !isTemp && (
                        <>
                          <button className="tc-act-btn"        title="Edit"   onClick={() => handleStartEdit(msg)}><Edit2  size={11} /></button>
                          <button className="tc-act-btn danger" title="Delete" onClick={() => handleDelete(msg.id)}><Trash2 size={11} /></button>
                        </>
                      )}
                    </div>

                    <div className="tc-bubble">
                      {highlightSearch(msg.message_text)}
                    </div>

                    {/* Reaction quick-picker */}
                    {showRPicker && (
                      <div className="tc-reaction-picker" onClick={e => e.stopPropagation()}>
                        {QUICK_REACTIONS.map(emoji => (
                          <button key={emoji} className="tc-rpick-btn" onClick={() => handleReaction(msg.id, emoji)}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Footer */}
                {!isEditing && (
                  <div className="tc-msg-footer">
                    {msg.edited_at && <span className="tc-edited">edited</span>}
                    <span className="tc-msg-time">{time}</span>
                    {isMine && selectedContact !== null && (
                      <span className={`tc-read-receipt ${msg.is_read ? 'read' : ''}`}>
                        {msg.is_read ? <CheckCheck size={12} /> : <Check size={12} />}
                      </span>
                    )}
                  </div>
                )}

                {/* Reactions */}
                {hasReactions && !isEditing && (
                  <div className="tc-reactions-row">
                    {Object.entries(reactions).map(([emoji, users]) => (
                      <button
                        key={emoji}
                        className={`tc-reaction-chip ${users.includes(profile.email) ? 'mine' : ''}`}
                        onClick={() => handleReaction(msg.id, emoji)}
                        title={users.join(', ')}
                      >
                        {emoji}
                        <span className="tc-reaction-count">{users.length}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing indicator */}
        <div className="tc-typing">
          {typingUsers.length > 0 && (
            <>
              <div className="tc-dots">
                <div className="tc-dot" />
                <div className="tc-dot" />
                <div className="tc-dot" />
              </div>
              <span>
                {typingUsers.map(u => u.name || u.email.split('@')[0]).join(', ')}
                {typingUsers.length === 1 ? ' is typing…' : ' are typing…'}
              </span>
            </>
          )}
        </div>

        {/* Input area */}
        <div className="tc-input-area">
          {/* Emoji picker */}
          {showEmojiPicker && (
            <div className="tc-emoji-picker tc-emoji-picker" onClick={e => e.stopPropagation()}>
              <div className="tc-emoji-grid">
                {EMOJI_GRID.map(emoji => (
                  <button key={emoji} className="tc-emoji-btn" onClick={() => handleEmojiSelect(emoji)}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form className="tc-form" onSubmit={handleSendMessage}>
            <button
              type="button"
              className={`tc-emoji-toggle tc-emoji-toggle ${showEmojiPicker ? 'active' : ''}`}
              onClick={() => setShowEmojiPicker(s => !s)}
              title="Emoji picker"
            >
              <Smile size={20} />
            </button>

            <input
              ref={inputRef}
              type="text"
              className="tc-input"
              placeholder={
                selectedContact === null
                  ? 'Message everyone…'
                  : `Message ${selectedContact.name || selectedContact.email.split('@')[0]}…`
              }
              value={inputText}
              onChange={e => { setInputText(e.target.value); handleTyping(); }}
              disabled={sending}
              autoComplete="off"
            />

            <button type="submit" className="tc-send" disabled={!inputText.trim() || sending}>
              <Send size={15} style={{ marginLeft: '1px' }} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
