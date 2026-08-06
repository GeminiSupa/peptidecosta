"use client";

import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Sparkles, Loader2, Minus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: '¡Hola! Soy el asistente virtual de Peptides Costa Rica. ¿En qué puedo ayudarte hoy con tu investigación?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [lang, setLang] = useState('es');
  
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Sync language from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedLang = localStorage.getItem('lang') || 'es';
      setLang(storedLang);

      const interval = setInterval(() => {
        const currentLang = localStorage.getItem('lang') || 'es';
        if (currentLang !== lang) {
          setLang(currentLang);
        }
      }, 500);

      return () => clearInterval(interval);
    }
  }, [lang]);

  // Update greeting when language changes if no user messages exist
  useEffect(() => {
    if (messages.length === 1 && messages[0].role === 'assistant') {
      const greeting = lang === 'en'
        ? 'Hello! I am the Peptides Costa Rica virtual assistant. How can I help you with your research today?'
        : '¡Hola! Soy el asistente virtual de Peptides Costa Rica. ¿En qué puedo ayudarte hoy con tu investigación?';
      setMessages([{ role: 'assistant', text: greeting }]);
    }
  }, [lang]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollToBottom();
    }
  }, [messages, isOpen, isMinimized]);

  // Fetch catalog on mount for context
  useEffect(() => {
    async function fetchCatalog() {
      try {
        const { data } = await supabase
          .from('products')
          .select('product, category, price_usd, price_crc, status')
          .neq('status', 'Coming Soon'); // Only get available or out of stock items
        if (data) {
          setCatalog(data);
        }
      } catch (err) {
        console.error('Failed to load catalog for chat:', err);
      }
    }
    fetchCatalog();
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'customer_chat',
          prompt: userMessage,
          context: {
            products: catalog,
            history: messages.slice(-6) // Send last 6 messages for memory
          }
        })
      });

      const data = await response.json();
      
      if (data.success && data.text) {
        setMessages(prev => [...prev, { role: 'assistant', text: data.text }]);
      } else {
        throw new Error(data.error || 'Failed to get AI response');
      }
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        text: lang === 'en'
          ? 'Sorry, I am having connection issues. Please contact us via WhatsApp at +506 6062 6224.'
          : 'Lo siento, estoy teniendo problemas de conexión. Por favor, contáctanos por WhatsApp al +506 6062 6224.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Determine standard styles based on your site's dark mode theme
  const widgetZIndex = 9999;
  
  if (!isOpen) {
    return (
      <button
        onClick={() => { setIsOpen(true); setIsMinimized(false); }}
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '24px',
          zIndex: widgetZIndex,
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
          border: 'none',
          boxShadow: '0 8px 32px rgba(37, 99, 235, 0.4)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 12px 40px rgba(37, 99, 235, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 8px 32px rgba(37, 99, 235, 0.4)';
        }}
        aria-label={lang === 'en' ? "Open AI Assistant" : "Abrir Asistente de IA"}
      >
        <Sparkles size={28} />
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: isMinimized ? '24px' : '24px',
      left: '24px',
      zIndex: widgetZIndex,
      width: '350px',
      height: isMinimized ? '60px' : '500px',
      maxHeight: 'calc(100vh - 120px)',
      maxWidth: 'calc(100vw - 48px)',
      background: '#0f172a', // Tailwind slate-900
      border: '1px solid rgba(56, 189, 248, 0.2)',
      borderRadius: '20px',
      boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.05) inset',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      fontFamily: 'var(--font-inter), sans-serif',
    }}>
      {/* Header */}
      <div 
        style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.15) 0%, rgba(37, 99, 235, 0.15) 100%)',
          borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer'
        }}
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ 
            background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)', 
            width: '32px', height: '32px', borderRadius: '50%', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white'
          }}>
            <Sparkles size={16} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#f8fafc' }}>Peptides AI</h3>
            <p style={{ margin: 0, fontSize: '0.7rem', color: '#38bdf8', fontWeight: '500' }}>{lang === 'en' ? 'Online' : 'En línea'}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
          >
            {isMinimized ? <MessageCircle size={18} /> : <Minus size={18} />}
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      {!isMinimized && (
        <div style={{
          flex: 1,
          padding: '16px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          background: '#090d16', // Slightly darker than container
        }}>
          {messages.map((msg, idx) => (
            <div key={idx} style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              background: msg.role === 'user' ? 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)' : '#1e293b',
              color: msg.role === 'user' ? '#ffffff' : '#e2e8f0',
              padding: '12px 16px',
              borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              fontSize: '0.85rem',
              lineHeight: '1.5',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              whiteSpace: 'pre-wrap'
            }}>
              {msg.text}
            </div>
          ))}
          {isLoading && (
            <div style={{
              alignSelf: 'flex-start',
              background: '#1e293b',
              color: '#94a3b8',
              padding: '12px 16px',
              borderRadius: '18px 18px 18px 4px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.85rem'
            }}>
              <Loader2 size={16} className="animate-spin" /> {lang === 'en' ? 'Thinking...' : 'Escribiendo...'}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input Area */}
      {!isMinimized && (
        <div style={{
          padding: '12px 16px',
          background: '#0f172a',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-end'
        }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={lang === 'en' ? "Ask about peptides..." : "Pregunta sobre péptidos..."}
            rows={1}
            style={{
              flex: 1,
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '20px',
              padding: '10px 16px',
              color: '#f8fafc',
              fontSize: '0.85rem',
              resize: 'none',
              outline: 'none',
              maxHeight: '100px',
              minHeight: '40px',
              fontFamily: 'inherit'
            }}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            style={{
              background: input.trim() && !isLoading ? '#38bdf8' : '#334155',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
              transition: 'background 0.2s',
              flexShrink: 0
            }}
          >
            <Send size={18} style={{ marginLeft: '2px' }} />
          </button>
        </div>
      )}
    </div>
  );
}
