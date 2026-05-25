"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ArrowLeft, BookOpen, Calendar, Share2, Facebook, Twitter, Link as LinkIcon, ShoppingCart, ArrowRight } from 'lucide-react';

export default function BlogPostPage() {
  const params = useParams();
  const router = useRouter();
  const { slug } = params;
  
  const [blog, setBlog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState('es');
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    const savedLang = localStorage.getItem('lang') || 'es';
    setLang(savedLang);

    const loadBlog = async () => {
      if (isSupabaseConfigured && supabase) {
        try {
          const { data, error } = await supabase
            .from('blogs')
            .select('*')
            .eq('slug', slug)
            .eq('published', true)
            .single();
            
          if (!error && data) {
            setBlog(data);
          } else {
            router.push('/blog');
          }
        } catch (err) {
          console.error("Failed to load blog:", err);
          router.push('/blog');
        }
      }
      setLoading(false);
    };

    if (slug) {
      loadBlog();
    }
  }, [slug, router]);

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="landing-layout min-h-screen" style={{ background: 'var(--bg-main)', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#94a3b8' }}>{lang === 'en' ? 'Loading article...' : 'Cargando artículo...'}</div>
      </div>
    );
  }

  if (!blog) return null;

  const content = lang === 'en' ? blog.content_en : blog.content_es;

  return (
    <div className="landing-layout min-h-screen" style={{ background: 'var(--bg-main)', color: 'var(--text-main)' }}>
      {/* HEADER */}
      <header className="lp-header" style={{ position: 'relative', borderBottom: '1px solid var(--border)' }}>
        <div className="lp-header-inner">
          <Link href="/" className="lp-logo" style={{ textDecoration: 'none' }}>
            <img src="/logo.png" alt="Peptides Costa Rica" style={{ maxHeight: '46px', width: 'auto' }} />
          </Link>
          <div className="lp-header-actions" style={{ display: 'flex', gap: '12px' }}>
             <button onClick={() => { setLang('es'); localStorage.setItem('lang', 'es'); }} className={lang === 'es' ? 'active' : ''} style={{ background: lang === 'es' ? 'var(--text-primary)' : 'transparent', color: lang === 'es' ? 'var(--bg-main)' : 'var(--text-muted)', border: '1px solid ' + (lang === 'es' ? 'var(--text-primary)' : 'var(--border)'), padding: '4px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', transition: 'all 0.2s' }}>ES</button>
             <button onClick={() => { setLang('en'); localStorage.setItem('lang', 'en'); }} className={lang === 'en' ? 'active' : ''} style={{ background: lang === 'en' ? 'var(--text-primary)' : 'transparent', color: lang === 'en' ? 'var(--bg-main)' : 'var(--text-muted)', border: '1px solid ' + (lang === 'en' ? 'var(--text-primary)' : 'var(--border)'), padding: '4px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', transition: 'all 0.2s' }}>EN</button>
          </div>
        </div>
      </header>

      {/* ARTICLE CONTENT */}
      <main className="container" style={{ padding: '40px 20px', maxWidth: '800px', margin: '0 auto' }}>
        <Link href="/blog" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', textDecoration: 'none', marginBottom: '24px', fontWeight: 'bold' }}>
          <ArrowLeft size={16} /> {lang === 'en' ? 'Back to Blog' : 'Volver al Blog'}
        </Link>

        <article>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px', fontWeight: 'bold' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} />
              {new Date(blog.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CR', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>

          <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: 'var(--text-main)', marginBottom: '24px', lineHeight: '1.2' }}>
            {lang === 'en' ? blog.title_en : blog.title_es}
          </h1>

          {blog.image_url && (
            <div style={{ width: '100%', borderRadius: '16px', overflow: 'hidden', marginBottom: '40px', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)' }}>
              <img src={blog.image_url} alt="Cover" style={{ width: '100%', display: 'block' }} />
            </div>
          )}

          {/* Markdown/HTML rendered content */}
          <div 
            className="blog-content" 
            style={{ 
              fontSize: '1.1rem', 
              lineHeight: '1.8', 
              color: 'var(--text-main)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              opacity: 0.9
            }}
            dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br/>') }}
          />
        </article>

        {/* SHARE BAR */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginTop: '60px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{lang === 'en' ? 'Share this article:' : 'Compartir este artículo:'}</span>
            <button onClick={handleCopyLink} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', transition: 'all 0.2s' }}>
              <LinkIcon size={14} /> {shareCopied ? (lang === 'en' ? 'Copied!' : '¡Copiado!') : (lang === 'en' ? 'Copy Link' : 'Copiar enlace')}
            </button>
          </div>
        </div>

        {/* CTA SECTION */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px', padding: '40px', textAlign: 'center', marginTop: '60px' }}>
          <ShoppingCart size={40} style={{ color: 'var(--text-primary)', marginBottom: '16px' }} />
          <h3 style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--text-main)', marginBottom: '12px' }}>
            {lang === 'en' ? 'Ready to accelerate your research?' : '¿Listo para acelerar tu investigación?'}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginBottom: '24px', maxWidth: '400px', margin: '0 auto 24px' }}>
            {lang === 'en' 
              ? 'Browse our catalog of premium, lab-tested peptides available for immediate local delivery in Costa Rica.'
              : 'Explora nuestro catálogo de péptidos premium probados en laboratorio, disponibles para entrega local inmediata en Costa Rica.'}
          </p>
          <Link href={`/catalog?lang=${lang}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--text-primary)', color: 'var(--bg-main)', padding: '12px 24px', borderRadius: '8px', textDecoration: 'none', fontWeight: '900', fontSize: '1rem', boxShadow: 'var(--shadow-lg)' }}>
            {lang === 'en' ? 'Shop the Catalog' : 'Ver el Catálogo'} <ArrowRight size={18} />
          </Link>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="footer" style={{ marginTop: '40px', borderTop: '1px solid var(--border)' }}>
        <div className="container" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <img src="/logo.png" alt="Logo" style={{ height: '32px', marginBottom: '16px', opacity: 0.5, borderRadius: '4px' }} />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} Peptides Costa Rica. {lang === 'en' ? 'All rights reserved.' : 'Todos los derechos reservados.'}
          </div>
        </div>
      </footer>
    </div>
  );
}
