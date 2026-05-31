"use client";

import React, { useState, useEffect } from 'react';
import { safeLocalStorage as localStorage } from '@/lib/storage';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ArrowLeft, BookOpen, Clock, Calendar } from 'lucide-react';

export default function BlogListPage() {
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState('es');

  useEffect(() => {
    const savedLang = localStorage.getItem('lang') || 'es';
    setLang(savedLang);

    const loadBlogs = async () => {
      if (isSupabaseConfigured && supabase) {
        try {
          const { data, error } = await supabase
            .from('blogs')
            .select('*')
            .eq('published', true)
            .order('created_at', { ascending: false });
          if (!error && data) setBlogs(data);
        } catch (err) {
          console.error("Failed to load blogs:", err);
        }
      }
      setLoading(false);
    };

    loadBlogs();
  }, []);

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
             <Link href="/catalog" className="lp-nav-cta" style={{ background: 'var(--text-primary)', color: 'var(--bg-main)', padding: '6px 16px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold', fontSize: '0.9rem' }}>
               {lang === 'en' ? 'Shop' : 'Comprar'}
             </Link>
          </div>
        </div>
      </header>

      {/* BLOG CONTENT */}
      <main className="container" style={{ padding: '40px 20px', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ marginBottom: '40px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: 'var(--text-main)', marginBottom: '12px' }}>
            <BookOpen size={32} style={{ display: 'inline', color: 'var(--text-primary)', marginRight: '12px', verticalAlign: 'middle' }} />
            {lang === 'en' ? 'Peptide Research Blog' : 'Blog de Investigación de Péptidos'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto' }}>
            {lang === 'en' 
              ? 'Read the latest scientific insights, guides, and updates from Peptides Costa Rica.'
              : 'Lee las últimas noticias científicas, guías y actualizaciones de Peptides Costa Rica.'}
          </p>
        </div>

        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', textDecoration: 'none', marginBottom: '24px', fontWeight: 'bold' }}>
          <ArrowLeft size={16} /> {lang === 'en' ? 'Back to Home' : 'Volver al Inicio'}
        </Link>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
            {lang === 'en' ? 'Loading articles...' : 'Cargando artículos...'}
          </div>
        ) : blogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            {lang === 'en' ? 'No articles published yet.' : 'Aún no hay artículos publicados.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
            {blogs.map(blog => (
              <Link href={`/blog/${blog.slug}`} key={blog.id} style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden', textDecoration: 'none', transition: 'transform 0.2s, box-shadow 0.2s', boxShadow: 'var(--shadow)' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; e.currentTarget.style.borderColor = 'var(--text-primary)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                {blog.image_url ? (
                  <div style={{ width: '100%', height: '180px', backgroundImage: `url(${blog.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center', borderBottom: '1px solid var(--border)' }} />
                ) : (
                  <div style={{ width: '100%', height: '180px', background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border)' }}>
                    <BookOpen size={48} color="var(--text-muted)" style={{ opacity: 0.3 }} />
                  </div>
                )}
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: 'bold' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} /> {new Date(blog.created_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CR')}</span>
                  </div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '12px', lineHeight: '1.4' }}>
                    {lang === 'en' ? blog.title_en : blog.title_es}
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '20px', flex: 1 }}>
                    {lang === 'en' ? blog.excerpt_en : blog.excerpt_es}
                  </p>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {lang === 'en' ? 'Read More' : 'Leer más'} &rarr;
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
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
