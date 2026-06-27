import React, { useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Send, User, Clock, ShieldAlert, Users, MessageCircle, ChevronLeft } from 'lucide-react';

export default function TeamChat({ profile }) {
  const [messages, setMessages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null); // null means "Global Team Chat"
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [mobileShowContacts, setMobileShowContacts] = useState(true); // Control views on mobile
  const messagesEndRef = useRef(null);

  // Fetch contact list
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !profile) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    const fetchContacts = async () => {
      const { data, error } = await supabase.from('admin_profiles').select('*').order('name', { ascending: true });
      if (!error && data) {
        // Exclude current user from the contact list
        setContacts(data.filter(c => c.email !== profile.email));
      }
    };

    fetchContacts();
  }, [profile]);

  // Fetch messages for selected conversation
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !profile) return;
    
    setLoading(true);

    const fetchMessages = async () => {
      let query = supabase
        .from('team_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (selectedContact === null) {
        // Global chat
        query = query.is('recipient_email', null);
      } else {
        // Direct messages between me and them
        const me = profile.email;
        const them = selectedContact.email;
        query = query.or(`and(sender_email.eq.${me},recipient_email.eq.${them}),and(sender_email.eq.${them},recipient_email.eq.${me})`);
      }

      const { data, error } = await query;
      if (!error && data) {
        setMessages(data.reverse());
        
        // Mark unread messages as read
        if (selectedContact !== null) {
          const unreadMsgs = data.filter(m => m.recipient_email === profile.email && !m.is_read);
          if (unreadMsgs.length > 0) {
            await supabase
              .from('team_messages')
              .update({ is_read: true })
              .in('id', unreadMsgs.map(m => m.id));
          }
        }
      } else if (error) {
        console.error('Fetch msgs error:', error);
      }
      setLoading(false);
    };

    fetchMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`chat_${selectedContact ? selectedContact.email : 'global'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages' }, (payload) => {
        const msg = payload.new;
        
        let belongsToCurrentView = false;
        if (selectedContact === null) {
          belongsToCurrentView = msg.recipient_email === null;
        } else {
          const isFromMeToThem = msg.sender_email === profile.email && msg.recipient_email === selectedContact.email;
          const isFromThemToMe = msg.sender_email === selectedContact.email && msg.recipient_email === profile.email;
          belongsToCurrentView = isFromMeToThem || isFromThemToMe;
        }

        if (belongsToCurrentView) {
          setMessages(prev => {
            if (prev.find(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, selectedContact]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !profile) return;

    const textToSend = inputText.trim();
    setInputText('');
    setSending(true);

    const optimisticMsg = {
      id: `temp-${Date.now()}`,
      sender_email: profile.email,
      sender_name: profile.name || profile.email.split('@')[0],
      recipient_email: selectedContact ? selectedContact.email : null,
      message_text: textToSend,
      created_at: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, optimisticMsg]);

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('team_messages')
        .insert({
          sender_email: profile.email,
          sender_name: profile.name || profile.email.split('@')[0],
          recipient_email: selectedContact ? selectedContact.email : null,
          message_text: textToSend
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to send message:', error);
        setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
        setInputText(textToSend); // Restore input
      } else {
        setMessages(prev => prev.map(m => m.id === optimisticMsg.id ? data : m));
      }
    }
    setSending(false);
  };

  const selectContact = (contact) => {
    setSelectedContact(contact);
    setMobileShowContacts(false); // Switch to chat view on mobile
  };

  if (!profile) return null;

  return (
    <div className="team-chat-wrapper">
      <style dangerouslySetInnerHTML={{__html: `
        .team-chat-wrapper {
          display: flex;
          height: calc(100dvh - 200px);
          min-height: 400px;
          background: #0f172a;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          overflow: hidden;
        }
        
        .chat-sidebar {
          width: 280px;
          background: rgba(15, 23, 42, 0.95);
          border-right: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
        }
        
        .chat-sidebar-header {
          padding: 16px;
          font-weight: 700;
          color: #f8fafc;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          font-size: 1.1rem;
        }
        
        .chat-contacts-list {
          flex: 1;
          overflow-y: auto;
        }
        
        .contact-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          min-height: 52px;
          cursor: pointer;
          transition: background 0.2s;
          border-bottom: 1px solid rgba(255,255,255,0.02);
          touch-action: manipulation;
        }
        
        .contact-item:hover {
          background: rgba(255,255,255,0.03);
        }
        
        .contact-item.active {
          background: rgba(14, 165, 233, 0.1);
          border-left: 3px solid #0ea5e9;
        }
        
        .contact-icon {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
        }
        
        .contact-icon.global {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
        }
        
        .contact-icon.user {
          background: linear-gradient(135deg, #0ea5e9, #3b82f6);
        }
        
        .contact-info {
          flex: 1;
          overflow: hidden;
        }
        
        .contact-name {
          color: #f8fafc;
          font-weight: 600;
          font-size: 0.9rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .contact-email {
          color: #64748b;
          font-size: 0.75rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chat-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: #0f172a;
        }

        .chat-header {
          padding: 16px 20px;
          background: rgba(30, 41, 59, 0.5);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .back-btn {
          display: none;
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          min-width: 44px;
          min-height: 44px;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          flex-shrink: 0;
        }
        
        .chat-header-title {
          font-weight: 700;
          color: #f8fafc;
          font-size: 1.1rem;
        }
        
        .chat-header-subtitle {
          font-size: 0.8rem;
          color: #64748b;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMikiLz48L3N2Zz4=');
        }

        .chat-messages::-webkit-scrollbar, .chat-contacts-list::-webkit-scrollbar {
          width: 6px;
        }
        
        .chat-messages::-webkit-scrollbar-thumb, .chat-contacts-list::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }

        .msg-row {
          display: flex;
          flex-direction: column;
          max-width: 85%;
        }
        .msg-row.mine {
          align-self: flex-end;
          align-items: flex-end;
        }
        .msg-row.theirs {
          align-self: flex-start;
          align-items: flex-start;
        }
        .msg-sender {
          font-size: 0.7rem;
          color: #64748b;
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 4px;
          margin-left: 4px;
          margin-right: 4px;
        }
        .msg-bubble {
          padding: 10px 14px;
          border-radius: 16px;
          font-size: 0.95rem;
          line-height: 1.4;
          word-break: break-word;
          position: relative;
        }
        .msg-row.mine .msg-bubble {
          background: #0ea5e9;
          color: white;
          border-bottom-right-radius: 4px;
        }
        .msg-row.theirs .msg-bubble {
          background: #1e293b;
          color: #e2e8f0;
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-bottom-left-radius: 4px;
        }
        .msg-time {
          font-size: 0.65rem;
          color: rgba(255,255,255,0.5);
          display: block;
          text-align: right;
          margin-top: 4px;
        }
        .chat-input-container {
          padding: 12px 16px max(12px, env(safe-area-inset-bottom, 0px));
          background: rgba(15, 23, 42, 0.8);
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          flex-shrink: 0;
        }
        .chat-form {
          display: flex;
          gap: 10px;
          background: #1e293b;
          padding: 6px;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .chat-form:focus-within {
          border-color: #0ea5e9;
        }
        .chat-input {
          flex: 1;
          background: transparent;
          border: none;
          color: white;
          padding: 8px 16px;
          outline: none;
          font-size: 16px;
        }
        .chat-send-btn {
          background: #0ea5e9;
          color: white;
          border: none;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s;
          flex-shrink: 0;
          touch-action: manipulation;
        }
        .chat-send-btn:hover {
          background: #0284c7;
        }
        .chat-send-btn:disabled {
          background: #475569;
          cursor: not-allowed;
        }

        /* Mobile adjustments */
        @media (max-width: 1023px) {
          .team-chat-wrapper {
            height: calc(100dvh - 148px);
            min-height: 320px;
            border-radius: 12px;
          }
          
          .chat-sidebar {
            width: 100%;
            display: ${mobileShowContacts ? 'flex' : 'none'};
          }
          
          .chat-main {
            display: ${mobileShowContacts ? 'none' : 'flex'};
            width: 100%;
            min-height: 0;
          }
          
          .back-btn {
            display: inline-flex;
          }

          .chat-messages {
            padding: 12px;
            -webkit-overflow-scrolling: touch;
          }

          .msg-bubble {
            max-width: 88%;
          }
        }
      `}} />

      {/* SIDEBAR: Contacts & Global */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">Conversations</div>
        <div className="chat-contacts-list">
          <div 
            className={`contact-item ${selectedContact === null ? 'active' : ''}`}
            onClick={() => selectContact(null)}
          >
            <div className="contact-icon global">
              <Users size={18} />
            </div>
            <div className="contact-info">
              <div className="contact-name">General Team Chat</div>
              <div className="contact-email">All admins & agents</div>
            </div>
          </div>
          
          {contacts.map(c => (
            <div 
              key={c.id || c.email}
              className={`contact-item ${selectedContact?.email === c.email ? 'active' : ''}`}
              onClick={() => selectContact(c)}
            >
              <div className="contact-icon user">
                <User size={18} />
              </div>
              <div className="contact-info">
                <div className="contact-name">{c.name || c.email.split('@')[0]}</div>
                <div className="contact-email">{c.email}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN: Chat Area */}
      <div className="chat-main">
        <div className="chat-header">
          <button className="back-btn" onClick={() => setMobileShowContacts(true)}>
            <ChevronLeft size={24} />
          </button>
          <div style={{ background: selectedContact === null ? 'rgba(99, 102, 241, 0.1)' : 'rgba(14, 165, 233, 0.1)', padding: '8px', borderRadius: '8px', color: selectedContact === null ? '#8b5cf6' : '#0ea5e9' }}>
            {selectedContact === null ? <Users size={20} /> : <User size={20} />}
          </div>
          <div>
            <div className="chat-header-title">
              {selectedContact === null ? 'General Team Chat' : (selectedContact.name || selectedContact.email.split('@')[0])}
            </div>
            <div className="chat-header-subtitle">
              {selectedContact === null ? 'Communicate securely with everyone' : selectedContact.email}
            </div>
          </div>
        </div>

        <div className="chat-messages">
          {loading && <div style={{ color: '#64748b', textAlign: 'center', marginTop: '20px' }}>Loading messages...</div>}
          
          {!loading && messages.length === 0 && (
            <div style={{ color: '#64748b', textAlign: 'center', marginTop: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <ShieldAlert size={32} opacity={0.5} />
              <p>No messages yet. Start the conversation!</p>
            </div>
          )}

          {messages.map((msg) => {
            const isMine = msg.sender_email === profile.email;
            const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            return (
              <div key={msg.id} className={`msg-row ${isMine ? 'mine' : 'theirs'}`}>
                {!isMine && (
                  <div className="msg-sender">
                    <User size={10} /> {msg.sender_name}
                  </div>
                )}
                <div className="msg-bubble">
                  {msg.message_text}
                  <span className="msg-time">{time}</span>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-container">
          <form className="chat-form" onSubmit={handleSendMessage}>
            <input
              type="text"
              className="chat-input"
              placeholder={selectedContact === null ? "Type a message to everyone..." : `Message ${selectedContact.name || selectedContact.email.split('@')[0]}...`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={sending}
            />
            <button type="submit" className="chat-send-btn" disabled={!inputText.trim() || sending}>
              <Send size={16} style={{ marginLeft: '2px' }} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
